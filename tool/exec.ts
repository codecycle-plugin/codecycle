import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/** `broken`: Grund, wenn der Befehl gar nicht lief (→ Exit 2), sonst null. */
export type ShellResult = { code: number; output: string; broken: string | null }

// Rückfall, wenn erst ein späterer Befehl einer Kette fehlt (`a && b`): cmd.exe meldet
// das mit Exit 1 und Text in der Systemsprache; geprüft wird nur die letzte Zeile von stderr.
const NOT_FOUND =
  /is not recognized as an internal or external command|ist entweder falsch geschrieben oder\s+konnte nicht gefunden werden/i

// in cmd.exe eingebaut, nicht als Datei zu finden
const CMD_BUILTINS = new Set(
  'assoc call cd chdir cls color copy date del dir echo endlocal erase exit for ftype goto if md mkdir mklink move path pause popd prompt pushd rd ren rename rmdir set setlocal shift start time title type ver verify vol'.split(
    ' ',
  ),
)

/** Gibt es das erste Programm eines cmd.exe-Befehls? Sprachunabhängig, über `where` bzw. die Datei. */
function windowsProgramExists(command: string, cwd: string): boolean {
  const first = command.trim().match(/^"([^"]+)"|^[^\s&|<>()]+/)
  const token = first?.[1] ?? first?.[0] ?? ''
  if (token === '' || CMD_BUILTINS.has(token.toLowerCase())) return true
  if (/[\\/]/.test(token)) {
    const path = isAbsolute(token) ? token : join(cwd, token)
    const exts = ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')]
    return exts.some(ext => existsSync(path + ext))
  }
  return spawnSync('where', [token], { cwd, stdio: 'ignore' }).status === 0
}

/** Führt einen Befehl über die Shell aus (cmd.exe unter Windows, sh sonst). */
export function runShell(command: string, cwd: string, env?: Record<string, string>): ShellResult {
  const r = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
  })
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code
    const reason = code === 'ENOBUFS' ? 'Ausgabe größer als 256 MB' : String(r.error)
    return { code: 2, output: `${output}\n${reason}`, broken: reason }
  }
  // durch ein Signal beendet (z. B. abgebrochen oder Speicher voll): der Lauf ist rot
  if (r.status === null) {
    return { code: 1, output: `${output}\nabgebrochen durch Signal ${r.signal ?? '?'}`, broken: null }
  }
  const code = r.status
  if (code === 0) return { code, output, broken: null }
  // sh: Exit 127 heißt „command not found“
  if (process.platform !== 'win32') return { code, output, broken: code === 127 ? 'Befehl nicht gefunden' : null }
  const lastErr = (r.stderr ?? '').trim().split(/\r?\n/).at(-1) ?? ''
  const notFound = !windowsProgramExists(command, cwd) || NOT_FOUND.test(lastErr)
  return { code, output, broken: notFound ? 'Befehl nicht gefunden' : null }
}

/**
 * Ein Wert als ein einziges Shell-Argument, über eine Umgebungsvariable: so wertet
 * die Shell nichts im Wert aus (`$…` in sh, `%…%` in cmd.exe). Liefert den Text für
 * die Befehlszeile und die Variable für `runShell`.
 */
export function shellArg(name: string, value: string): { ref: string; env: Record<string, string> } {
  if (process.platform !== 'win32') return { ref: `"$${name}"`, env: { [name]: value } }
  // cmd.exe setzt den Wert vor dem Zerlegen ein: `"` verdoppeln, damit die Anführungszeichen
  // für cmd.exe paarig bleiben; Backslashes vor `"` und am Ende verdoppeln (Windows-Argumentregeln)
  const escaped = value.replace(/(\\*)"/g, '$1$1""').replace(/(\\+)$/, '$1$1')
  return { ref: `"%${name}%"`, env: { [name]: escaped } }
}

export function git(args: string[], cwd: string): { ok: boolean; out: string; missing: boolean } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), missing }
}

/**
 * Erste Zeile von `<cmd> --version`, oder null, wenn es das Programm nicht gibt.
 * Läuft im Temp-Ordner: cmd.exe sucht Programme sonst zuerst im aktuellen Ordner,
 * und eine `uv.cmd` im Projekt würde schon bei `codecycle info` ausgeführt.
 */
export function versionOf(cmd: string): string | null {
  const options = { encoding: 'utf8', cwd: tmpdir() } as const
  // Windows: über die Shell, damit .cmd-Starter (npm, uv) gefunden werden
  const r =
    process.platform === 'win32'
      ? spawnSync(`${cmd} --version`, { ...options, shell: true })
      : spawnSync(cmd, ['--version'], options)
  if (r.status !== 0) return null
  return (r.stdout ?? '').trim().split(/\r?\n/)[0] ?? null
}
