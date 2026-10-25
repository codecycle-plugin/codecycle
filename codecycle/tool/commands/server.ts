import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ToolBroken } from '../errors.ts'
import type { Ctx } from '../main.ts'
import { TMP_DIR, findProjectRoot, findWorkTree, loadConfig, tmpDir } from '../project.ts'

const LOG = `${TMP_DIR}/server.log`
const PID = `${TMP_DIR}/server.pid`
/** Merker neben der PID-Datei: läuft der Server mit Wegwerf-Datei, steht hier deren relativer Pfad (ohne Daten: NO_DATA_MARK) */
const TEMP_MARK = `${TMP_DIR}/server.temp`
const NO_DATA_MARK = 'ohne Daten'
const TEMP_DIR = `${TMP_DIR}/server-temp`
const TEMP_FILE_DEFAULT = 'daten'
const WAIT_MS = 1500
const WIN_RELAY =
  "const c=require('node:child_process').spawn(process.argv[1],{shell:true,stdio:'inherit',windowsHide:true});c.on('exit',k=>process.exit(k??1))"

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readPid(file: string): number | null {
  try {
    const n = Number(readFileSync(file, 'utf8').trim())
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function kill(pid: number): void {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else {
    try {
      process.kill(-pid)
    } catch {
      process.kill(pid)
    }
  }
}

/**
 * `server [--stop | --temp [--same]]`: Dev-Server aus `commands.server` im Hintergrund starten (im Worktree), Ausgabe in
 * `.codecycle/tmp/server.log`. Läuft er schon, wird er nicht doppelt gestartet. Exit 0 = läuft,
 * 1 = brach beim Start ab (Ende des Logs wird gezeigt), 2 = kein Serverbefehl.
 * `--temp`: legt `.codecycle/tmp/server-temp/` frisch an und setzt `serverTemp.env` auf den absoluten Pfad der
 * Wegwerf-Datei, nur für den Server-Prozess; `--same` behält die Ablage (Server aus und wieder an, dieselben Daten). Mit
 * `serverTemp.ohneDaten` (Server speichert nichts) startet `--temp` ohne Variable und nimmt einen laufenden Server an. Ohne
 * `serverTemp` in der Konfiguration: Exit 1, nie ungefragt gegen echte Daten starten.
 */
export async function server(args: string[], ctx: Ctx): Promise<number> {
  const unknown = args.find(a => !['--stop', '--temp', '--same'].includes(a))
  if (unknown) throw new ToolBroken(`unbekannte Option ${unknown}`)
  const temp = args.includes('--temp')
  const same = args.includes('--same')
  if (same && !temp) throw new ToolBroken('unbekannte Option --same (nur zusammen mit --temp)')
  if (temp && args.includes('--stop')) throw new ToolBroken('--temp und --stop passen nicht zusammen')
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const config = loadConfig(root)
  const pidFile = join(work, PID)
  const markFile = join(work, TEMP_MARK)
  const old = readPid(pidFile)
  if (args.includes('--stop')) {
    if (old !== null && alive(old)) {
      kill(old)
      ctx.out(`server: gestoppt (PID ${old})`)
    } else ctx.out('server: läuft nicht')
    rmSync(pidFile, { force: true })
    rmSync(markFile, { force: true })
    return 0
  }
  const command = config.commands.server
  if (command === undefined) throw new ToolBroken('kein Serverbefehl in .codecycle/tool.config.json (commands.server)')
  if (command === null) {
    ctx.out('server: nicht vorhanden')
    return 0
  }
  const st = config.serverTemp
  if (temp && st === undefined) {
    ctx.out('server: --temp nicht eingerichtet (serverTemp fehlt in .codecycle/tool.config.json: { "env": "<Variable>" } oder { "ohneDaten": true })')
    return 1
  }
  const noData = st !== undefined && 'ohneDaten' in st
  if (old !== null && alive(old)) {
    let mark: string | null = null
    try {
      mark = readFileSync(markFile, 'utf8').trim() || null
    } catch {}
    if (temp && mark === null && !noData) {
      ctx.out(`server: läuft schon (PID ${old}), aber ohne Wegwerf-Datei; erst codecycle server --stop, dann codecycle server --temp`)
      return 1
    }
    const shown = mark === null ? '' : mark === NO_DATA_MARK ? ', ohne Daten' : `, mit Wegwerf-Datei ${mark}`
    ctx.out(`server: läuft schon (PID ${old}${shown}) · Log: ${LOG}`)
    return 0
  }
  tmpDir(work)
  let env: NodeJS.ProcessEnv | undefined
  let tempRel: string | null = null
  if (temp && noData) tempRel = NO_DATA_MARK
  else if (temp && st !== undefined && 'env' in st) {
    const dir = join(work, TEMP_DIR)
    if (!same) rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const file = join(dir, st.file ?? TEMP_FILE_DEFAULT)
    tempRel = `${TEMP_DIR}/${st.file ?? TEMP_FILE_DEFAULT}`
    env = { ...process.env, [st.env]: file }
  }
  const logPath = join(work, LOG)
  const fd = openSync(logPath, 'w')
  let child
  try {
    // Unter Windows bekäme ein losgelöstes cmd.exe keine Konsole, und jeder Konsolen-Prozess darin öffnete eine
    // sichtbare neue (Windows Terminal, langsam, teils Fehlerfenster). Daher startet losgelöst ein Node-Zwischenprozess
    // (braucht keine Konsole), der den Befehl mit unsichtbarer Konsole startet und dessen Exit-Code weitergibt.
    child =
      process.platform === 'win32'
        ? spawn(process.execPath, ['-e', WIN_RELAY, command], { cwd: work, env, detached: true, stdio: ['ignore', fd, fd], windowsHide: true })
        : spawn(command, { cwd: work, env, shell: true, detached: true, stdio: ['ignore', fd, fd] })
  } finally {
    closeSync(fd)
  }
  child.unref()
  if (child.pid === undefined) throw new ToolBroken('Server ließ sich nicht starten')
  writeFileSync(pidFile, String(child.pid))
  if (tempRel === null) rmSync(markFile, { force: true })
  else writeFileSync(markFile, tempRel)
  await new Promise(r => setTimeout(r, WAIT_MS))
  if (!alive(child.pid)) {
    rmSync(pidFile, { force: true })
    rmSync(markFile, { force: true })
    ctx.out(`server: beendet sich gleich nach dem Start (Exit) · Log: ${LOG}`)
    if (existsSync(logPath)) {
      readFileSync(logPath, 'utf8').trimEnd().split(/\r?\n/).slice(-15).forEach(l => ctx.out(`  ${l}`))
    }
    return 1
  }
  ctx.out(`server: gestartet (PID ${child.pid}) · Log: ${LOG} · beenden: codecycle server --stop`)
  if (tempRel === NO_DATA_MARK) ctx.out('· ohne Daten (serverTemp.ohneDaten)')
  else if (tempRel !== null) ctx.out(`· Wegwerf-Datei: ${tempRel}`)
  return 0
}
