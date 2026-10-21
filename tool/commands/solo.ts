// `codecycle solo check|funde <aufgabenordner>`: die harten Haltepunkte des Solo-Wegs.
//   check: Haltepunkt „Eigene Kontrolle“. `codecycle check` grün, alles außerhalb des Aufgabenordners committet,
//          Risikobereiche der geänderten Dateien seit dem Start; schreibt `geprueftAuf: <HEAD>` und `haltepunkt: 3` in STATE.md.
//          Exit 0 grün, 1 rot. Berührte Risikobereiche nennt die Ausgabe als Zeile für den Prüfauftrag.
//   funde: Haltepunkte „Prüfung“ und „Nachbesserung“. Jeder Fund aus reports/pruefung.md hat in TASK.md, Abschnitt „Funde“,
//          `behoben` oder `verworfen: <Grund>`. Exit 0 vollständig, 1 sonst. Mit Bericht mindestens `haltepunkt: 4`;
//          hat jeder Fund einen Status (auch `offen` als Wortlaut-Frage), `haltepunkt: 5`. Nie niedriger als vorher.
//   teil start|fertig <aufgabenordner> <name>: gleichzeitige Abgabe an einen Handwerker. start legt Branch `<aufgabe>--<name>`
//          und Worktree neben dem Projekt an (Verweis auf node_modules) und nennt die Zeilen für die Startnachricht; fertig
//          merged ihn in den Aufgaben-Branch (Konflikt, Uncommittetes im Hauptordner in berührten Dateien, Worktree-Ordner
//          verschoben: abbrechen, Exit 1) und entfernt Worktree (nie `--force`) und Branch.
// Start ist der Abzweig vom Hauptbranch (`git merge-base <hauptbranch> HEAD`).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { mainBranch } from '../git-hints.ts'
import { pathsLib, riskPathsLib, soloFindingsLib, stateFile } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree, tryLoadConfig } from '../project.ts'
import { dirtyForMerge, gitFull, linkNodeModules, merge, removeWorktree, worktreeMissing, worktreeOf, worktreeProblem } from '../worktree.ts'
import { check } from './check.ts'

const { GIT_QUIET } = pathsLib
const { SOLO_REPORT, checkFindings, findingStatuses } = soloFindingsLib

const CODECYCLE_MD = '.claude/codecycle.md'
const USAGE = 'Aufruf: codecycle solo check <aufgabenordner> | codecycle solo funde <aufgabenordner> | codecycle solo teil start|fertig <aufgabenordner> <name>'
/** Name eines Teils: wird Teil von Branch und Ordner */
const PART_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/

type Folder = { work: string; rel: string; abs: string }

/** Aufgabenordner relativ zum Arbeitsordner; muss eine STATE.md mit `weg: solo` haben. */
function soloFolder(folder: string, ctx: Ctx): Folder {
  const work = findWorkTree(ctx.cwd)
  const abs = isAbsolute(folder) ? folder : [resolve(ctx.cwd, folder), resolve(work, folder)].find(p => existsSync(join(p, 'STATE.md'))) ?? resolve(ctx.cwd, folder)
  const rel = relative(work, abs).replace(/\\/g, '/')
  if (rel === '' || rel.startsWith('..')) throw new ToolBroken(`Ordner außerhalb des Projekts: ${folder}`)
  if (!existsSync(join(abs, 'STATE.md'))) throw new ToolBroken(`keine STATE.md in ${rel}`)
  const state = stateFile.parseState(readFileSync(join(abs, 'STATE.md'), 'utf8'), `${rel}/STATE.md`)
  if (state.weg !== 'solo') throw new ToolBroken(`${rel} ist keine Solo-Aufgabe (STATE.md ohne „weg: solo“)`)
  return { work, rel, abs }
}

function lines(out: string): string[] {
  return out.split(/\r?\n/).filter(Boolean)
}

function soloCheck(f: Folder, ctx: Ctx): number {
  const state = stateFile.parseState(readFileSync(join(f.abs, 'STATE.md'), 'utf8'), `${f.rel}/STATE.md`)
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], f.work).out
  if (state.branch && branch !== state.branch) {
    ctx.out(`rot: Branch ${branch}, die Aufgabe gehört zu ${state.branch} (git switch ${state.branch})`)
    return 1
  }

  const code = check([], ctx)
  if (code !== 0) {
    ctx.out(`${code === 2 ? 'Werkzeug kaputt' : 'rot'}: codecycle check nicht grün; kein Prüfer, bevor das behoben ist`)
    return code
  }

  // Nach dem Check: Format kann Dateien geändert haben. Der Aufgabenordner zählt nicht (das Token-Buch schreibt laufend).
  const inFolder = (p: string): boolean => p === f.rel || p.startsWith(`${f.rel}/`)
  const dirty = [
    ...lines(git([...GIT_QUIET, 'diff', '--name-only', '--no-renames', 'HEAD'], f.work).out),
    ...lines(git([...GIT_QUIET, 'ls-files', '--others', '--exclude-standard'], f.work).out),
  ].filter(p => !inFolder(p))
  if (dirty.length > 0) {
    ctx.out(`rot: nicht committet (${dirty.length}): ${dirty.slice(0, 8).join(', ')}${dirty.length > 8 ? ' …' : ''}`)
    ctx.out('  Erst committen; der Prüfer sieht nur Commits.')
    return 1
  }

  const head = git(['rev-parse', 'HEAD'], f.work).out
  const main = mainBranch(f.work, tryLoadConfig(f.work) ?? undefined)
  const base = git(['merge-base', main, 'HEAD'], f.work)
  if (!base.ok) throw new ToolBroken(`kein gemeinsamer Stand mit ${main}`)
  const changed = lines(git([...GIT_QUIET, 'diff', '--name-only', '--no-renames', `${base.out}..HEAD`], f.work).out).filter(p => !inFolder(p))
  if (changed.length === 0) {
    ctx.out(`rot: keine Änderungen seit dem Start (${main}); nichts zu prüfen`)
    return 1
  }

  const mdPath = join(f.work, CODECYCLE_MD)
  const areas = existsSync(mdPath) ? riskPathsLib.parseRiskAreas(readFileSync(mdPath, 'utf8')) : []
  const hits = riskPathsLib.matchRiskAreas(areas, changed)
  const unpatterned = areas.filter(a => a.pfade.length === 0).map(a => a.name)
  if (unpatterned.length > 0) ctx.out(`Hinweis: Risikobereiche ohne Pfadmuster, selbst beurteilen: ${unpatterned.join(', ')}`)
  const byArea = new Map<string, string[]>()
  for (const h of hits) byArea.set(h.bereich, [...(byArea.get(h.bereich) ?? []), h.datei])

  const statePath = join(f.abs, 'STATE.md')
  const stamped = stateFile.withHeadField(readFileSync(statePath, 'utf8'), 'geprueftAuf', head)
  writeFileSync(statePath, stateFile.withHeadField(stamped, 'haltepunkt', '3'))
  ctx.out(`grün: ${changed.length} Dateien seit dem Start, geprueftAuf ${head.slice(0, 7)}, haltepunkt 3`)
  ctx.out(`Diff für den Prüfer: git diff ${base.out.slice(0, 12)} ${head.slice(0, 12)}`)
  // Berührte Risikobereiche prüft der Prüfer zusätzlich auf Sicherheit; die Zeile geht wörtlich in seine Startnachricht.
  if (byArea.size > 0) ctx.out(`Risikobereiche: ${[...byArea].map(([bereich, files]) => `${bereich} (${files.join(', ')})`).join('; ')}`)
  return 0
}

function soloFunde(f: Folder, ctx: Ctx): number {
  const report = join(f.abs, SOLO_REPORT)
  if (!existsSync(report)) {
    ctx.out(`rot: ${f.rel}/${SOLO_REPORT} fehlt; erst prüfen lassen (Rolle solo-reviewer)`)
    return 1
  }
  const taskPath = join(f.abs, 'TASK.md')
  const task = existsSync(taskPath) ? readFileSync(taskPath, 'utf8') : ''
  const r = checkFindings(readFileSync(report, 'utf8'), task)
  // `offen` ist eine Wortlaut-Frage an den Nutzer: zählt für die Merge-Sperre als fehlend, die Nachbesserung ist aber durch.
  const last = new Map(findingStatuses(task).map(s => [s.id, s.status]))
  const questions = r.fehlend.filter(id => last.get(id) === 'offen')
  const stop = questions.length === r.fehlend.length ? 5 : 4
  const reached = raiseStop(f, stop)
  if (r.fehlend.length > 0) {
    ctx.out(`rot: ${r.fehlend.length} von ${r.ids.length} Funden ohne Status in TASK.md, Abschnitt „Funde“: ${r.fehlend.join(', ')}`)
    if (stop === 5) ctx.out(`  offen als Frage an den Nutzer im Abschluss: ${questions.join(', ')} · haltepunkt ${reached}`)
    else ctx.out(`  Je Fund eine Zeile: „- M1: behoben (…)“ oder „- M1: verworfen: <Grund>“ · haltepunkt ${reached}`)
    return 1
  }
  ctx.out(`${r.ids.length === 0 ? 'grün: Bericht ohne Funde' : `grün: alle ${r.ids.length} Funde mit Status`}, haltepunkt ${reached}`)
  return 0
}

/** Setzt `haltepunkt` in STATE.md auf `stop`, wenn er niedriger steht; liefert den Stand danach. */
function raiseStop(f: Folder, stop: number): number {
  const statePath = join(f.abs, 'STATE.md')
  const text = readFileSync(statePath, 'utf8')
  const now = stateFile.parseState(text, `${f.rel}/STATE.md`).haltepunkt ?? 0
  if (now >= stop) return now
  writeFileSync(statePath, stateFile.withHeadField(text, 'haltepunkt', String(stop)))
  return stop
}

/** Teil-Worktree anlegen (oder vorhandenen nennen) und die Zeilen für die Startnachricht ausgeben. */
function partStart(f: Folder, name: string, ctx: Ctx): number {
  const { root, state, branch } = partOf(f, name, ctx)
  let wt = worktreeOf(root, branch)
  const missing = wt ? worktreeMissing(root, wt, branch, 'nichts gestartet') : []
  if (missing.length > 0) {
    missing.forEach(l => ctx.out(l))
    return 1
  }
  if (wt) ctx.out(`grün: Teil ${name} hat schon den Worktree ${wt}`)
  else {
    wt = join(dirname(root), `${basename(root)}--wt-${state.aufgabe}-${name}`)
    if (existsSync(wt)) throw new ToolBroken(`Ordner ${wt} gibt es schon, aber ohne Worktree von ${branch} (nachsehen, nicht löschen)`)
    const exists = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root).ok
    const r = gitFull(exists ? ['worktree', 'add', wt, branch] : ['worktree', 'add', '-b', branch, wt, state.branch], root)
    if (!r.ok) throw new ToolBroken(`git worktree add fehlgeschlagen: ${r.text}`)
    ctx.out(`grün: Teil ${name}, Worktree ${wt} (Branch ${branch} ab ${state.branch})`)
  }
  const linked = linkNodeModules(root, wt)
  if (linked) ctx.out(linked)
  ctx.out('Für die Startnachricht:')
  ctx.out(`  Aufgabenordner: ${join(root, f.rel)}`)
  ctx.out('  Solo: ja')
  ctx.out(`  Worktree: ${wt}`)
  ctx.out(`  Branch: ${branch}`)
  return 0
}

/** Teil übernehmen: sauberer Worktree, Merge in den Aufgaben-Branch (Hauptordner), dann Worktree und Branch weg. */
function partDone(f: Folder, name: string, ctx: Ctx): number {
  const { root, state, branch } = partOf(f, name, ctx)
  if (!git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root).ok) throw new ToolBroken(`Branch ${branch} fehlt (erst codecycle solo teil start)`)
  const wt = worktreeOf(root, branch)
  const problem = wt ? worktreeProblem(root, wt, branch) : []
  if (problem.length > 0) {
    problem.forEach(l => ctx.out(l))
    return 1
  }
  const current = git(['rev-parse', '--abbrev-ref', 'HEAD'], root).out
  if (current !== state.branch) throw new ToolBroken(`Hauptordner steht auf ${current}, übernommen wird in ${state.branch} (git switch ${state.branch})`)
  const blocking = dirtyForMerge(root, branch)
  if (blocking.length > 0) {
    ctx.out(`rot: Hauptordner hat Uncommittetes in Dateien, die das Übernehmen von ${name} ändert; nichts übernommen`)
    blocking.slice(0, 8).forEach(file => ctx.out(`  - ${file}`))
    ctx.out('  Erst committen oder ansehen, nichts verwerfen; dann erneut fertig.')
    return 1
  }
  const commits = Number(git(['rev-list', '--count', `${state.branch}..${branch}`], root).out) || 0
  const m = merge(root, branch)
  if (!m.ok && m.files.length === 0) {
    ctx.out(`rot: Merge beim Übernehmen von ${name} gescheitert (kein Konflikt), abgebrochen; Teil und Worktree bleiben. Git:`)
    lines(m.text).slice(-6).forEach(l => ctx.out(`  ${l}`))
    return 1
  }
  if (!m.ok) {
    ctx.out(`rot: Merge-Konflikt beim Übernehmen von ${name}, abgebrochen; Teil und Worktree bleiben`)
    m.files.forEach(file => ctx.out(`  - ${file}`))
    ctx.out('  Konflikt selbst lösen oder den Handwerker per Nachricht auf den neuen Stand bringen lassen, dann erneut fertig.')
    return 1
  }
  const leftover = wt ? removeWorktree(root, wt) : ''
  const del = gitFull(['branch', '-d', branch], root)
  ctx.out(`grün: Teil ${name} übernommen (${commits} Commit${commits === 1 ? '' : 's'}) in ${state.branch}${leftover}${del.ok ? '' : `; Branch ${branch} bleibt (${del.text.split(/\r?\n/).at(-1) ?? ''})`}`)
  return 0
}

function partOf(f: Folder, name: string, ctx: Ctx) {
  if (!PART_NAME.test(name)) throw new ToolBroken(`Name „${name}“: nur Kleinbuchstaben, Ziffern und „-“, höchstens 31 Zeichen`)
  const root = findProjectRoot(ctx.cwd)
  if (resolve(f.work) !== resolve(root)) throw new ToolBroken(`im Hauptordner ${root} aufrufen, nicht im Worktree`)
  const state = stateFile.parseState(readFileSync(join(f.abs, 'STATE.md'), 'utf8'), `${f.rel}/STATE.md`)
  if (!state.branch) throw new ToolBroken(`${f.rel}/STATE.md ohne branch`)
  return { root, state, branch: `${state.branch}--${name}` }
}

export function solo(args: string[], ctx: Ctx): number {
  if (args[0] === 'teil') {
    const [, action, folder, name, ...extra] = args
    if (!folder || !name || extra.length > 0 || (action !== 'start' && action !== 'fertig')) throw new ToolBroken(USAGE)
    const f = soloFolder(folder, ctx)
    return action === 'start' ? partStart(f, name, ctx) : partDone(f, name, ctx)
  }
  const [sub, ...rest] = args
  const folder = rest.find(a => !a.startsWith('--'))
  const options = rest.filter(a => a.startsWith('--'))
  if (!folder || rest.filter(a => !a.startsWith('--')).length > 1) throw new ToolBroken(USAGE)
  if (sub === 'check') {
    if (options.length > 0) throw new ToolBroken(`unbekannte Option ${options[0]}; ${USAGE}`)
    return soloCheck(soloFolder(folder, ctx), ctx)
  }
  if (sub === 'funde') {
    if (options.length > 0) throw new ToolBroken(`unbekannte Option ${options[0]}; ${USAGE}`)
    return soloFunde(soloFolder(folder, ctx), ctx)
  }
  throw new ToolBroken(USAGE)
}
