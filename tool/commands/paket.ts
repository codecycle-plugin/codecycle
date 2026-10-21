// `codecycle paket start|pruefen|fertig P<n>`: die Buchhaltung eines Pakets im vollen Ablauf in je einem Aufruf.
//   start:   Branch `<aufgabe>--P<n>` und Worktree neben dem Projekt (vorhandene weiterverwenden, dann Merge des
//            Aufgaben-Branchs), `guard --record` im Worktree, Paketstatus `in-arbeit`, Commit von STATE.md; nennt die
//            Zeilen für die Startnachricht. `--nur-worktree`: nur Branch und Worktree (Test-Autor im Aufgabenmodus).
//   pruefen: `guard --base <Aufgaben-Branch>` im Worktree; die Tests des Test-Autors findet es an der Schlusszeile von
//            `commit-tests` (oder `--test-commit`). Das Ergebnis je Stand merkt es für `fertig`.
//   fertig:  nur nach grünem `pruefen` auf genau diesem Stand: Merge in den Aufgaben-Branch (Hauptordner), Worktree
//            entfernen (nie `--force`), Paketstatus `fertig` mit Commit, Commit von STATE.md.
// Merge-Konflikt: Merge abbrechen, Paket `blockiert`, Exit 1. Exit 0 grün, 1 rot oder blockiert, 2 Aufruf/Werkzeug.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

import type { TaskState } from '../../types'
import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { loadRecords, saveRecords } from '../guard-records.ts'
import { pathsLib, stateFile } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot } from '../project.ts'
import { TESTS_TRAILER } from './commit-tests.ts'
import { guard } from './guard.ts'

const { GIT_QUIET, TASKS_DIR } = pathsLib
const { DONE_STATES, parseState, withHeadField, withHistoryLine, withPackageField, withSectionLine } = stateFile

const USAGE = 'Aufruf: codecycle paket start|pruefen|fertig P<n> [--aufgabe <ordner>] [--nur-worktree] [--test-commit <hash>] [--runden <n>]'

type Options = { sub: string; id: string; aufgabe?: string; nurWorktree: boolean; testCommit?: string; runden?: number }

function parseArgs(args: string[]): Options {
  const pos: string[] = []
  const o: Partial<Options> = { nurWorktree: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    const value = (): string => {
      const v = args[++i]
      if (v === undefined || v.startsWith('--')) throw new ToolBroken(`${a} braucht einen Wert; ${USAGE}`)
      return v
    }
    if (a === '--aufgabe') o.aufgabe = value()
    else if (a === '--nur-worktree') o.nurWorktree = true
    else if (a === '--test-commit') o.testCommit = value()
    else if (a === '--runden') {
      const n = Number(value())
      if (!Number.isInteger(n) || n < 0) throw new ToolBroken(`--runden braucht eine ganze Zahl ab 0; ${USAGE}`)
      o.runden = n
    } else if (a.startsWith('--')) throw new ToolBroken(`unbekannte Option ${a}; ${USAGE}`)
    else pos.push(a)
  }
  const [sub, id] = pos
  if (!sub || !id || pos.length > 2 || !['start', 'pruefen', 'fertig'].includes(sub)) throw new ToolBroken(USAGE)
  if (!/^P\d+$/.test(id)) throw new ToolBroken(`Paket als P<n> angeben (z. B. P1), nicht „${id}“`)
  if (o.nurWorktree && sub !== 'start') throw new ToolBroken(`--nur-worktree gilt nur für paket start; ${USAGE}`)
  if (o.testCommit && sub !== 'pruefen') throw new ToolBroken(`--test-commit gilt nur für paket pruefen; ${USAGE}`)
  if (o.runden !== undefined && sub !== 'fertig') throw new ToolBroken(`--runden gilt nur für paket fertig; ${USAGE}`)
  return { ...o, sub, id } as Options
}

type Task = { root: string; rel: string; statePath: string; state: TaskState }

/** Aufgabe: `--aufgabe`, sonst die eine offene Aufgabe des Branchs, auf dem der Hauptordner steht. */
function findTask(root: string, aufgabe: string | undefined): Task {
  const load = (rel: string): Task => {
    const statePath = join(root, rel, 'STATE.md')
    if (!existsSync(statePath)) throw new ToolBroken(`keine STATE.md in ${rel}`)
    return { root, rel, statePath, state: parseState(readFileSync(statePath, 'utf8'), `${rel}/STATE.md`) }
  }
  let task: Task
  if (aufgabe) {
    const abs = resolve(root, aufgabe)
    task = load(relative(root, abs).replace(/\\/g, '/'))
  } else {
    const dir = join(root, TASKS_DIR)
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], root).out
    const found = (existsSync(dir) ? readdirSync(dir) : [])
      .filter(d => existsSync(join(dir, d, 'STATE.md')))
      .map(d => {
        try {
          return load(`${TASKS_DIR}/${d}`)
        } catch {
          return null
        }
      })
      .filter((t): t is Task => t !== null && t.state.branch === branch && !DONE_STATES.includes(t.state.zustand))
    if (found.length !== 1) {
      throw new ToolBroken(
        found.length === 0
          ? `keine offene Aufgabe auf Branch ${branch} (im Hauptordner auf den Aufgaben-Branch wechseln oder --aufgabe <ordner>)`
          : `mehrere offene Aufgaben auf Branch ${branch}: ${found.map(t => t.rel).join(', ')} (--aufgabe <ordner>)`,
      )
    }
    task = found[0]!
  }
  if (task.state.weg === 'solo') throw new ToolBroken(`${task.rel} ist eine Solo-Aufgabe (ohne Pakete; codecycle solo …)`)
  if (!task.state.branch) throw new ToolBroken(`${task.rel}/STATE.md ohne branch`)
  return task
}

/** Worktree, in dem `branch` ausgecheckt ist, oder null. */
function worktreeOf(root: string, branch: string): string | null {
  let path: string | null = null
  for (const line of git(['worktree', 'list', '--porcelain'], root).out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
    else if (line === `branch refs/heads/${branch}` && path) return resolve(path)
  }
  return null
}

/** Git mit Ausgabe auf stdout und stderr (für Merge und Commit, deren Meldungen gebraucht werden). */
function gitFull(args: string[], cwd: string): { ok: boolean; text: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  if (r.error) throw new ToolBroken(`git nicht ausführbar: ${String(r.error)}`)
  return { ok: r.status === 0, text: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

/** Merge mit `--no-edit`; bei einem Konflikt abbrechen und die Dateien nennen. */
function merge(cwd: string, from: string): { ok: true } | { ok: false; files: string[]; text: string } {
  const r = gitFull(['merge', '--no-edit', from], cwd)
  if (r.ok) return { ok: true }
  const files = git([...GIT_QUIET, 'diff', '--name-only', '--diff-filter=U'], cwd).out.split(/\r?\n/).filter(Boolean)
  gitFull(['merge', '--abort'], cwd)
  return { ok: false, files, text: r.text }
}

/** Tagesdatum in Ortszeit (`JJJJ-MM-TT`), wie `zuletzt` und die Verlaufszeilen des Bauleiters. */
export function localDay(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`
}

function today(): string {
  return localDay(new Date())
}

/** STATE.md ändern, schreiben und nur diese Datei committen (Pre-Commit-Hook läuft, nie `--no-verify`). */
function writeState(task: Task, change: (text: string) => string, message: string, ctx: Ctx): boolean {
  const text = change(withHeadField(readFileSync(task.statePath, 'utf8'), 'zuletzt', today()))
  writeFileSync(task.statePath, text)
  const rel = `${task.rel}/STATE.md`
  gitFull(['add', '--', rel], task.root)
  const r = gitFull(['commit', '-m', message, '--', rel], task.root)
  if (!r.ok) {
    ctx.out(`Hinweis: STATE.md geschrieben, Commit fehlgeschlagen (von Hand committen): ${r.text.split(/\r?\n/).at(-1) ?? ''}`)
    return false
  }
  return true
}

function blockedByMerge(task: Task, id: string, where: string, files: string[], ctx: Ctx): number {
  const list = files.length > 0 ? files.join(', ') : 'Dateien unbekannt'
  writeState(
    task,
    t =>
      withHistoryLine(
        withSectionLine(withPackageField(t, id, 'status', 'blockiert'), 'Blocker', `- ${id}: Merge-Konflikt ${where} (${list})`),
        `- ${today()} ${id} blockiert: Merge-Konflikt ${where} (${list}), Merge abgebrochen`,
      ),
    `${task.state.aufgabe}: ${id} blockiert (Merge-Konflikt)`,
    ctx,
  )
  ctx.out(`rot: Merge-Konflikt ${where}, abgebrochen; ${id} steht auf blockiert`)
  files.forEach(f => ctx.out(`  - ${f}`))
  ctx.out('  Unabhängige Pakete weiterführen; den Nutzer beim Wiedereinstieg fragen.')
  return 1
}

function start(task: Task, o: Options, ctx: Ctx): number {
  const { root, state } = task
  const pkg = state.pakete.find(p => p.id === o.id)
  if (!pkg) throw new ToolBroken(`${o.id} steht nicht in ${task.rel}/STATE.md`)
  if (pkg.status === 'fertig') {
    ctx.out(`rot: ${o.id} ist schon fertig`)
    return 1
  }
  const branch = `${state.branch}--${o.id}`
  let wt = worktreeOf(root, branch)
  const fresh = wt === null
  if (!wt) {
    wt = join(dirname(root), `${basename(root)}--wt-${state.aufgabe}-${o.id}`)
    if (existsSync(wt)) throw new ToolBroken(`Ordner ${wt} gibt es schon, aber ohne Worktree von ${branch} (nachsehen, nicht löschen)`)
    const exists = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root).ok
    const r = gitFull(exists ? ['worktree', 'add', wt, branch] : ['worktree', 'add', '-b', branch, wt, state.branch], root)
    if (!r.ok) throw new ToolBroken(`git worktree add fehlgeschlagen: ${r.text}`)
  }
  if (o.nurWorktree) {
    ctx.out(`grün: Worktree ${wt} (Branch ${branch}); Paketstatus unverändert`)
    return 0
  }
  // Vorhandener Worktree (Aufgabenmodus, Wiederaufnahme): Stand des Aufgaben-Branchs mit den gemergten Paketen holen
  if (!fresh) {
    const m = merge(wt, state.branch)
    if (!m.ok) return blockedByMerge(task, o.id, `beim Holen von ${state.branch} in den Worktree`, m.files, ctx)
  }
  const rec = guard(['--record'], { cwd: wt, out: ctx.out })
  if (rec === 2) {
    ctx.out(`Werkzeug kaputt: guard --record im Worktree ${wt}; ${o.id} bleibt ${pkg.status}`)
    return 2
  }
  writeState(
    task,
    t => withHistoryLine(withPackageField(t, o.id, 'status', 'in-arbeit'), `- ${today()} ${o.id} gestartet (Worktree ${wt}, guard --record)`),
    `${state.aufgabe}: ${o.id} gestartet`,
    ctx,
  )
  const builder = pkg.rolle === 'routine' ? 'builder-routine' : pkg.rolle === 'test' ? 'test-author' : 'builder-logic'
  ctx.out(`grün: ${o.id} in-arbeit, Worktree ${wt}`)
  ctx.out('Für die Startnachricht:')
  ctx.out(`  Aufgabenordner: ${join(root, task.rel)}`)
  ctx.out(`  Paket: ${o.id}`)
  ctx.out(`  Worktree: ${wt}`)
  ctx.out(`  Bericht: ${join(root, task.rel, 'reports', `${o.id}-${builder}.md`)}`)
  return 0
}

/** Commits mit der Schlusszeile von `commit-tests` seit dem Abzweig vom Aufgaben-Branch, neuester zuerst. */
function testCommits(wt: string, taskBranch: string): string[] {
  const out = git(['log', '--format=%H', '--fixed-strings', `--grep=${TESTS_TRAILER}`, `${taskBranch}..HEAD`], wt).out
  return out.split(/\r?\n/).filter(Boolean)
}

function pruefen(task: Task, o: Options, ctx: Ctx): number {
  const { root, state } = task
  const branch = `${state.branch}--${o.id}`
  const wt = worktreeOf(root, branch)
  if (!wt) throw new ToolBroken(`kein Worktree für ${branch} (erst codecycle paket start ${o.id})`)
  const args = ['--base', state.branch]
  if (o.testCommit) args.push('--test-commit', o.testCommit)
  else {
    const commits = testCommits(wt, state.branch)
    if (commits.length > 0) {
      const files = new Set<string>()
      for (const c of commits) {
        git([...GIT_QUIET, 'diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', c], wt)
          .out.split(/\r?\n/)
          .filter(Boolean)
          .forEach(f => files.add(f))
      }
      args.push('--test-commit', commits[0]!, '--test-files', [...files].join(','))
      ctx.out(`Tests des Test-Autors: ${commits.map(c => c.slice(0, 7)).join(', ')} (${files.size} Dateien)`)
    } else ctx.out('Tests des Test-Autors: keine (kein Commit von commit-tests im Paket)')
  }
  const code = guard(args, { cwd: wt, out: ctx.out })
  if (code !== 2) {
    const records = loadRecords(root)
    records.pruefungen = { ...records.pruefungen, [branch]: { head: git(['rev-parse', 'HEAD'], wt).out, ok: code === 0, at: new Date().toISOString() } }
    saveRecords(root, records)
  }
  return code
}

function fertig(task: Task, o: Options, ctx: Ctx): number {
  const { root, state } = task
  const pkg = state.pakete.find(p => p.id === o.id)
  if (!pkg) throw new ToolBroken(`${o.id} steht nicht in ${task.rel}/STATE.md`)
  const branch = `${state.branch}--${o.id}`
  const wt = worktreeOf(root, branch)
  const head = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root)
  if (!head.ok) throw new ToolBroken(`Branch ${branch} fehlt`)
  const last = loadRecords(root).pruefungen?.[branch]
  if (!last || !last.ok || last.head !== head.out) {
    ctx.out(
      !last
        ? `rot: ${o.id} nie geprüft (erst codecycle paket pruefen ${o.id})`
        : !last.ok
          ? `rot: letzte Prüfung von ${o.id} war rot (codecycle paket pruefen ${o.id})`
          : `rot: ${o.id} hat seit der letzten Prüfung neue Commits (codecycle paket pruefen ${o.id})`,
    )
    return 1
  }
  if (wt) {
    const dirty = git([...GIT_QUIET, 'status', '--porcelain'], wt).out
    if (dirty !== '') {
      ctx.out(`rot: Worktree ${wt} hat Uncommittetes; erst ansehen, nichts verwerfen`)
      dirty.split(/\r?\n/).slice(0, 8).forEach(l => ctx.out(`  ${l}`))
      return 1
    }
  }
  const current = git(['rev-parse', '--abbrev-ref', 'HEAD'], root).out
  if (current !== state.branch) throw new ToolBroken(`Hauptordner steht auf ${current}, gemergt wird in ${state.branch} (git switch ${state.branch})`)
  const m = merge(root, branch)
  if (!m.ok) return blockedByMerge(task, o.id, `beim Merge in ${state.branch}`, m.files, ctx)

  // Worktree entfernen: nie --force; bleibt ein leerer Ordner, steht er im Verlauf
  let leftover = ''
  if (wt) {
    const r = gitFull(['worktree', 'remove', wt], root)
    if (!r.ok) {
      gitFull(['worktree', 'prune'], root)
      leftover = existsSync(wt)
        ? readdirSync(wt).length === 0
          ? `; leerer Ordner ${wt} bleibt, später löschen`
          : `; Worktree ${wt} nicht entfernt (${r.text.split(/\r?\n/).at(-1) ?? ''}), Inhalt ansehen`
        : ''
    }
  }
  const commit = head.out.slice(0, 7)
  writeState(
    task,
    t => {
      let s = withPackageField(withPackageField(t, o.id, 'status', 'fertig'), o.id, 'commit', commit)
      if (o.runden !== undefined) s = withPackageField(s, o.id, 'runden', String(o.runden))
      return withHistoryLine(s, `- ${today()} ${o.id} fertig (${commit}), in ${state.branch} gemergt${leftover}`)
    },
    `${state.aufgabe}: ${o.id} fertig`,
    ctx,
  )
  ctx.out(`grün: ${o.id} fertig (${commit}), in ${state.branch} gemergt${leftover}`)
  const open = parseState(readFileSync(task.statePath, 'utf8'), task.rel).pakete.filter(p => p.status !== 'fertig')
  ctx.out(open.length === 0 ? 'Alle Pakete fertig: weiter mit der Abnahme.' : `Offen: ${open.map(p => `${p.id} (${p.status})`).join(', ')}`)
  return 0
}

export function paket(args: string[], ctx: Ctx): number {
  const o = parseArgs(args)
  const task = findTask(findProjectRoot(ctx.cwd), o.aufgabe)
  if (o.sub === 'start') return start(task, o, ctx)
  if (o.sub === 'pruefen') return pruefen(task, o, ctx)
  return fertig(task, o, ctx)
}
