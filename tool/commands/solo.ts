// `codecycle solo …`: die harten Haltepunkte einer Aufgabe aus `/codecycle:new` (`weg: solo`).
//   check: Haltepunkt „Eigene Kontrolle“, bei großen Aufgaben erst mit allen Teilen fertig. `codecycle check` grün, alles außerhalb des Aufgabenordners committet,
//          Risikobereiche der geänderten Dateien seit dem Start; schreibt `geprueftAuf: <HEAD>` und `haltepunkt: 3` in STATE.md.
//          Exit 0 grün, 1 rot. Berührte Risikobereiche nennt die Ausgabe als Zeile für den Prüfauftrag; ab zwei schreibt
//          es `zweitpruefung: sicherheit` (zweiter Prüfer Pflicht), sonst `zweitpruefung: nein`.
//   funde: Haltepunkte „Prüfung“ und „Nachbesserung“. Jeder Fund aus reports/pruefung.md (mit `zweitpruefung: sicherheit`
//          auch aus reports/pruefung-sicherheit.md) hat in TASK.md, Abschnitt „Funde“,
//          `behoben`, `verworfen: <Grund>` oder (Nebenfund) `gemerkt: <Ort>`. Exit 0 vollständig, 1 sonst. Mit Bericht
//          mindestens `haltepunkt: 4`; hat jeder Fund einen Status (auch `offen` als Frage zu Wortlaut oder Nebenfund),
//          `haltepunkt: 5`. Nie niedriger als vorher.
//   plan <aufgabenordner> <teil> …: große Aufgabe, Teile des Plans als `teile: { <teil>: offen, … }` in STATE.md (nur bis
//          Haltepunkt 2; Teile in Arbeit und fertige behalten ihren Stand).
//   teil start|fertig <aufgabenordner> <name>: ein Teil nach dem anderen, je auf eigenem Branch `<aufgabe>--<name>` im
//          Hauptordner. Grundsatz: Während eines Teils bewegt sich der Aufgaben-Branch nicht; start und fertig wechseln nur
//          zwischen Branches auf demselben Commit, der Arbeitsbaum ändert sich nie, Buchdateien im Aufgabenordner stören nicht.
//          start: Teil-Branch an der Spitze des Aufgaben-Branchs, Teil `in-arbeit <branch>` in STATE.md, Commit auf dem
//          Teil-Branch, Aufgaben-Branch rückt auf diesen einen Commit nach (andere Geräte sehen so den Teil in Arbeit).
//          fertig: grün und committet, Teil `fertig` (Commit auf dem Teil-Branch), Aufgaben-Branch per Fast-Forward auf den
//          Teil-Branch, Wechsel, Teil-Branch löschen. Abbrüche ohne Änderung, Teil bleibt `in-arbeit`; erneuter Aufruf
//          führt den Rest aus. Mit Schalter `part-review` verlangt fertig für Teile mit Merkmal `· groß` im Plan den Teil-Bericht ohne
//          offenen Fund. Fehlt der Teil-Branch, meldet fertig „anderes Gerät oder von Hand
//          übernommen“; nur mit `--uebernommen` setzt es den Stand bewusst auf `fertig` (ohne Prüfung).
//   pruefung start|ende <aufgabenordner> [--teil <name>]: Wegwerf-Worktree des Schlussprüfers. start legt ihn neben dem
//          Projekt am Commit `geprueftAuf` an (mit `--teil` an der Spitze des Teil-Branchs; losgelöst, Verweis auf
//          node_modules) und nennt Worktree und Commit für die Startnachricht; ende entfernt ihn (erst die Verweise, nie `--force`).
// Start ist der Abzweig vom Hauptbranch (`git merge-base <hauptbranch> HEAD`).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { mainBranch } from '../git-hints.ts'
import { pathsLib, riskPathsLib, soloFindingsLib, stateFile, switchesLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree, tryLoadConfig } from '../project.ts'
import { gitFull, linkNodeModules, removeWorktree } from '../worktree.ts'
import { check } from './check.ts'

const { GIT_QUIET } = pathsLib
const { SECOND_REVIEW, SOLO_SECURITY_REPORT, checkFindings, findingStatuses, openPartFindings, partBuilderReport, partReportPath, requiredReports } = soloFindingsLib

const CODECYCLE_MD = '.claude/codecycle.md'
const USAGE =
  'Aufruf: codecycle solo check <aufgabenordner> | codecycle solo funde <aufgabenordner> | codecycle solo plan <aufgabenordner> <teil> … | codecycle solo teil start|fertig <aufgabenordner> <name> [--uebernommen] | codecycle solo pruefung start|ende <aufgabenordner> [--teil <name>]'
/** Name eines Teils: wird Teil des Branch-Namens */
const PART_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/
/** Stand eines Teils, der gerade gebaut wird; dazu steht sein Branch in `teile:` */
const IN_WORK = 'in-arbeit'

type Folder = { work: string; rel: string; abs: string }
type Part = { name: string; status: string; branch?: string | undefined }

/** Aufgabenordner relativ zum Arbeitsordner; muss eine STATE.md mit `weg: solo` haben. */
function soloFolder(folder: string, ctx: Ctx): Folder {
  const work = findWorkTree(ctx.cwd)
  const abs = isAbsolute(folder) ? folder : [resolve(ctx.cwd, folder), resolve(work, folder)].find(p => existsSync(join(p, 'STATE.md'))) ?? resolve(ctx.cwd, folder)
  const rel = relative(work, abs).replace(/\\/g, '/')
  if (rel === '' || rel.startsWith('..')) throw new ToolBroken(`Ordner außerhalb des Projekts: ${folder}`)
  if (!existsSync(join(abs, 'STATE.md'))) throw new ToolBroken(`keine STATE.md in ${rel}`)
  const state = stateFile.parseState(readFileSync(join(abs, 'STATE.md'), 'utf8'), `${rel}/STATE.md`)
  if (state.weg !== 'solo') throw new ToolBroken(`${rel} ist keine Aufgabe aus /codecycle:new (STATE.md ohne „weg: solo“)`)
  return { work, rel, abs }
}

function lines(out: string): string[] {
  return out.split(/\r?\n/).filter(Boolean)
}

function inFolder(f: Folder, p: string): boolean {
  return p === f.rel || p.startsWith(`${f.rel}/`)
}

function readState(f: Folder) {
  return stateFile.parseState(readFileSync(join(f.abs, 'STATE.md'), 'utf8'), `${f.rel}/STATE.md`)
}

function currentBranch(cwd: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).out
}

/** Uncommittetes außerhalb des Aufgabenordners (geändert oder neu, nicht ignoriert); das Token-Buch im Ordner zählt nicht. */
function dirtyOutside(f: Folder): string[] {
  return [
    ...lines(git([...GIT_QUIET, 'diff', '--name-only', '--no-renames', 'HEAD'], f.work).out),
    ...lines(git([...GIT_QUIET, 'ls-files', '--others', '--exclude-standard'], f.work).out),
  ].filter(p => !inFolder(f, p))
}

function dirtyLines(dirty: string[]): string {
  return `${dirty.slice(0, 8).join(', ')}${dirty.length > 8 ? ' …' : ''}`
}

/**
 * Richtiger Branch (Aufgaben-Branch oder der Branch eines Teils in Arbeit, `alsoOk` zusätzlich), `codecycle check` grün,
 * alles außerhalb des Aufgabenordners committet; sonst Exit 1 oder 2.
 */
function greenAndCommitted(f: Folder, ctx: Ctx, why: string, alsoOk?: string): number {
  const state = readState(f)
  const branch = currentBranch(f.work)
  const parts = (state.teile ?? []).filter(p => p.status === IN_WORK && p.branch)
  if (state.branch && branch !== state.branch && branch !== alsoOk && !parts.some(p => p.branch === branch)) {
    const part = parts[0]
    ctx.out(`rot: Branch ${branch}, die Aufgabe gehört zu ${state.branch}${part ? `, Teil ${part.name} zu ${part.branch}` : ''} (git switch ${part?.branch ?? state.branch}); ${why}`)
    return 1
  }

  const code = check([], ctx)
  if (code !== 0) {
    ctx.out(`${code === 2 ? 'Werkzeug kaputt' : 'rot'}: codecycle check nicht grün; ${why}`)
    return code
  }

  // Nach dem Check: Format kann Dateien geändert haben.
  const dirty = dirtyOutside(f)
  if (dirty.length > 0) {
    ctx.out(`rot: nicht committet (${dirty.length}): ${dirtyLines(dirty)}`)
    ctx.out(`  Erst committen; der Prüfer sieht nur Commits. ${why}`)
    return 1
  }
  return 0
}

function soloCheck(f: Folder, ctx: Ctx): number {
  // große Aufgabe: Eigene Kontrolle erst, wenn alle Teile fertig sind
  const open = (readState(f).teile ?? []).filter(p => p.status !== 'fertig')
  if (open.length > 0) {
    ctx.out(`rot: erst alle Teile fertig (${open.map(p => `${p.name}: ${p.status}`).join(', ')}); Eigene Kontrolle und Prüfung kommen danach`)
    return 1
  }
  const code = greenAndCommitted(f, ctx, 'kein Prüfer, bevor das behoben ist')
  if (code !== 0) return code

  const head = git(['rev-parse', 'HEAD'], f.work).out
  const main = mainBranch(f.work, tryLoadConfig(f.work) ?? undefined)
  const base = git(['merge-base', main, 'HEAD'], f.work)
  if (!base.ok) throw new ToolBroken(`kein gemeinsamer Stand mit ${main}`)
  const changed = lines(git([...GIT_QUIET, 'diff', '--name-only', '--no-renames', `${base.out}..HEAD`], f.work).out).filter(p => !inFolder(f, p))
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
  // ab zwei berührten Risikobereichen prüft ein zweiter Prüfer auf Sicherheit; die Merge-Sperre verlangt dann beide Berichte
  const second = byArea.size >= 2
  const marked = stateFile.withHeadField(stamped, 'zweitpruefung', second ? SECOND_REVIEW : 'nein')
  writeFileSync(statePath, stateFile.withHeadField(marked, 'haltepunkt', '3'))
  ctx.out(`grün: ${changed.length} Dateien seit dem Start, geprueftAuf ${head.slice(0, 7)}, haltepunkt 3`)
  ctx.out(`Diff für den Prüfer: git diff ${base.out.slice(0, 12)} ${head.slice(0, 12)}`)
  // Berührte Risikobereiche prüft der Prüfer zusätzlich auf Sicherheit; die Zeile geht wörtlich in seine Startnachricht.
  if (byArea.size > 0) ctx.out(`Risikobereiche: ${[...byArea].map(([bereich, files]) => `${bereich} (${files.join(', ')})`).join('; ')}`)
  if (second) ctx.out(`Zweiter Prüfer: ja (${byArea.size} Risikobereiche), final-reviewer mit „Auftrag: Sicherheit“, Bericht ${SOLO_SECURITY_REPORT}`)
  return 0
}

function soloFunde(f: Folder, ctx: Ctx): number {
  const reports = requiredReports(readState(f))
  const missing = reports.filter(r => !existsSync(join(f.abs, r)))
  if (missing.length > 0) {
    ctx.out(`rot: ${missing.map(r => `${f.rel}/${r}`).join(', ')} fehlt; erst prüfen lassen (Rolle final-reviewer${missing.includes(SOLO_SECURITY_REPORT) ? ', zweiter Prüfer mit „Auftrag: Sicherheit“' : ''})`)
    return 1
  }
  const taskPath = join(f.abs, 'TASK.md')
  const task = existsSync(taskPath) ? readFileSync(taskPath, 'utf8') : ''
  // Funde beider Berichte zusammen: M1 … aus der Prüfung, Z1 … aus der Sicherheitsprüfung
  const r = checkFindings(reports.map(p => readFileSync(join(f.abs, p), 'utf8')).join('\n'), task)
  // `offen` ist eine Frage an den Nutzer (Wortlaut oder Nebenfund): zählt für die Merge-Sperre als fehlend, die Nachbesserung ist aber durch.
  const last = new Map(findingStatuses(task).map(s => [s.id, s.status]))
  const questions = r.fehlend.filter(id => last.get(id) === 'offen')
  const stop = questions.length === r.fehlend.length ? 5 : 4
  const reached = raiseStop(f, stop)
  if (r.fehlend.length > 0) {
    ctx.out(`rot: ${r.fehlend.length} von ${r.ids.length} Funden ohne gültigen Status in TASK.md, Abschnitt „Funde“: ${r.fehlend.join(', ')}`)
    if (stop === 5) ctx.out(`  offen als Frage an den Nutzer im Abschluss: ${questions.join(', ')} · haltepunkt ${reached}`)
    else ctx.out(`  Je Fund eine Zeile: „- M1: behoben (<commit>)“ oder „- M1: verworfen: <Grund>“ · haltepunkt ${reached}`)
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

/** Teile des Plans festhalten; Teile in Arbeit und fertige behalten ihren Stand. */
function soloPlan(f: Folder, names: string[], ctx: Ctx): number {
  for (const n of names) {
    // reine Zahlen ordnet ein Objekt nach vorn; die Reihenfolge des Plans ginge verloren
    if (!PART_NAME.test(n) || /^\d+$/.test(n)) throw new ToolBroken(`Name „${n}“: Kleinbuchstaben, Ziffern und „-“, nicht nur Ziffern, höchstens 31 Zeichen`)
  }
  if (new Set(names).size !== names.length) throw new ToolBroken('jeder Teil nur einmal')
  const state = readState(f)
  if ((state.haltepunkt ?? 0) > 2) {
    ctx.out(`rot: Haltepunkt ${state.haltepunkt}; Teile gibt es nur bis Haltepunkt 2 (Plan, Bauen)`)
    return 1
  }
  const before = new Map((state.teile ?? []).map(p => [p.name, p]))
  const parts: Part[] = names.map(name => {
    const old = before.get(name)
    return old && (old.status === 'fertig' || old.status === IN_WORK) ? old : { name, status: 'offen' }
  })
  const working = [...before.values()].find(p => p.status === IN_WORK && !names.includes(p.name))
  if (working) {
    ctx.out(`rot: Teil ${working.name} ist in Arbeit (${working.branch ?? 'ohne Branch'}) und fehlt im neuen Plan; erst codecycle solo teil fertig ${f.rel} ${working.name}`)
    return 1
  }
  const statePath = join(f.abs, 'STATE.md')
  writeFileSync(statePath, stateFile.withHeadField(readFileSync(statePath, 'utf8'), 'teile', stateFile.partsField(parts)))
  const dropped = [...before.keys()].filter(n => !names.includes(n))
  ctx.out(`grün: ${parts.length} Teile: ${parts.map(p => `${p.name}${p.status === 'offen' ? '' : ` (${p.status})`}`).join(', ')}`)
  if (dropped.length > 0) ctx.out(`  nicht mehr im Plan: ${dropped.join(', ')}`)
  return 0
}

// --- Teile: ein Teil nach dem anderen, je auf eigenem Branch im Hauptordner ---

function branchExists(root: string, branch: string): boolean {
  return git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root).ok
}

function revOf(root: string, ref: string): string {
  return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], root).out
}

function isAncestor(root: string, a: string, b: string): boolean {
  return git(['merge-base', '--is-ancestor', a, b], root).ok
}

/** Setzt die Teile in STATE.md und committet nur STATE.md (andere Änderungen, auch Buchdateien, bleiben, wie sie sind). */
function commitParts(f: Folder, parts: Part[], message: string): { ok: boolean; text: string } {
  const statePath = join(f.abs, 'STATE.md')
  writeFileSync(statePath, stateFile.withHeadField(readFileSync(statePath, 'utf8'), 'teile', stateFile.partsField(parts)))
  const path = `${f.rel}/STATE.md`
  if (git(['diff', '--quiet', 'HEAD', '--', path], f.work).ok) return { ok: true, text: '' }
  return gitFull(['commit', '-q', '-m', message, '--', path], f.work)
}

/**
 * Meldung, wenn ein Teil in Arbeit ist, sein Branch hier aber fehlt: auf einem anderen Gerät gebaut, oder von Hand
 * übernommen bzw. gelöscht (dann setzt `--uebernommen` den Stand bewusst). Nie still `fertig`.
 */
function otherDevice(f: Folder, name: string, branch: string, ctx: Ctx): number {
  ctx.out(`rot: Teil ${name} wird auf einem anderen Gerät gebaut; dort weitermachen oder den Branch dort pushen (${branch} fehlt hier)`)
  ctx.out(`  Von Hand übernommen oder Branch gelöscht: Stand bewusst setzen mit codecycle solo teil fertig ${f.rel} ${name} --uebernommen`)
  const remote = `refs/remotes/origin/${branch}`
  if (git(['rev-parse', '--verify', '--quiet', remote], f.work).ok && !git(['merge-base', '--is-ancestor', remote, 'HEAD'], f.work).ok) {
    ctx.out(`  ${branch} liegt auf origin: git switch ${branch}, dann codecycle solo teil start ${f.rel} ${name}`)
  }
  return 1
}

/** Zeile zum Fortschritt nach einem fertigen Teil */
function progress(parts: Part[], name: string): string {
  const done = parts.filter(p => p.status === 'fertig').length
  const open = parts.find(p => p.status !== 'fertig')
  return `Teil ${name} fertig (${done}/${parts.length}); ${open ? `nächster Teil: ${open.name}` : 'alle Teile fertig: weiter mit Eigene Kontrolle'}`
}

function partOf(f: Folder, name: string, ctx: Ctx) {
  if (!PART_NAME.test(name)) throw new ToolBroken(`Name „${name}“: nur Kleinbuchstaben, Ziffern und „-“, höchstens 31 Zeichen`)
  const root = findProjectRoot(ctx.cwd)
  if (resolve(f.work) !== resolve(root)) throw new ToolBroken(`im Hauptordner ${root} aufrufen, nicht im Worktree`)
  const state = readState(f)
  if (!state.branch) throw new ToolBroken(`${f.rel}/STATE.md ohne branch`)
  const parts: Part[] = state.teile ?? []
  return { root, task: state.branch, part: `${state.branch}--${name}`, parts, me: parts.find(p => p.name === name) }
}

/**
 * Teil beginnen: Teil-Branch an der Spitze des Aufgaben-Branchs, Teil `in-arbeit` mit Branch committet, Aufgaben-Branch
 * auf diesen Commit. Erneut aufgerufen (Abbruch, neuer Bauender): führt den Rest aus und nennt die Zeilen für die Startnachricht.
 */
function partStart(f: Folder, name: string, ctx: Ctx): number {
  const { root, task, part, parts, me } = partOf(f, name, ctx)
  if (!me) {
    ctx.out(`rot: Teil ${name} steht nicht in teile (${parts.map(p => p.name).join(', ') || 'keine'}); erst codecycle solo plan`)
    return 1
  }
  if (me.status === 'fertig') {
    ctx.out(`rot: Teil ${name} ist schon fertig`)
    return 1
  }
  const busy = parts.find(p => p.status === IN_WORK && p.name !== name)
  if (busy) {
    ctx.out(`rot: Teil ${busy.name} ist in Arbeit (${busy.branch ?? 'ohne Branch'}); Teile nacheinander, erst codecycle solo teil fertig ${f.rel} ${busy.name}`)
    return 1
  }
  const cur = currentBranch(root)
  if (cur !== task && cur !== part) {
    ctx.out(`rot: Branch ${cur}; ein Teil beginnt auf dem Aufgaben-Branch ${task}; nichts gestartet`)
    return 1
  }
  if (cur === task) {
    const dirty = dirtyOutside(f)
    if (dirty.length > 0) {
      ctx.out(`rot: nicht committet (${dirty.length}): ${dirtyLines(dirty)}; erst committen, nichts gestartet`)
      return 1
    }
    if (branchExists(root, part)) {
      // Abbruch zwischen Anlegen und Wechseln: gleicher Commit, wechseln ohne Änderung am Arbeitsbaum
      if (revOf(root, part) !== revOf(root, 'HEAD')) {
        ctx.out(`rot: Branch ${part} gibt es schon mit eigenem Stand; dort weiterbauen: git switch ${part}, dann erneut codecycle solo teil start ${f.rel} ${name}`)
        return 1
      }
    } else {
      if (me.status === IN_WORK) return otherDevice(f, name, me.branch ?? part, ctx)
      const b = gitFull(['branch', part], root)
      if (!b.ok) throw new ToolBroken(`git branch ${part} fehlgeschlagen: ${b.text}`)
    }
    const s = gitFull(['switch', '-q', part], root)
    if (!s.ok) throw new ToolBroken(`git switch ${part} fehlgeschlagen: ${s.text}`)
  }

  // auf dem Teil-Branch: Stand in STATE.md (erneut aufgerufen: schon da)
  if (me.status !== IN_WORK || me.branch !== part) {
    const c = commitParts(f, parts.map(p => (p.name === name ? { name, status: IN_WORK, branch: part } : p)), `Teil ${name}: in Arbeit`)
    if (!c.ok) {
      ctx.out(`rot: Commit von ${f.rel}/STATE.md gescheitert; Teil-Branch ${part} bleibt, erneut aufrufen. Git:`)
      lines(c.text).slice(-6).forEach(l => ctx.out(`  ${l}`))
      return 1
    }
  }
  // Aufgaben-Branch rückt auf den Commit „in Arbeit“ nach, solange er der einzige im Teil ist
  const head = revOf(root, 'HEAD')
  const taskHead = revOf(root, task)
  if (taskHead !== head && revOf(root, 'HEAD^') === taskHead && lines(git([...GIT_QUIET, 'diff', '--name-only', taskHead, head], root).out).every(p => p === `${f.rel}/STATE.md`)) {
    const u = gitFull(['update-ref', `refs/heads/${task}`, head, taskHead], root)
    if (!u.ok) throw new ToolBroken(`git update-ref ${task} fehlgeschlagen: ${u.text}`)
  }

  const since = Number(git(['rev-list', '--count', `${task}..HEAD`], root).out) || 0
  const dirty = dirtyOutside(f).length
  ctx.out(`grün: Teil ${name} in Arbeit auf Branch ${part}`)
  ctx.out('Für die Startnachricht:')
  ctx.out(`  Aufgabenordner: ${join(root, f.rel)}`)
  ctx.out(`  Branch: ${part} (Hauptordner, kein Worktree)`)
  ctx.out(`  Teil: ${name}`)
  ctx.out(`  Bericht: ${join(root, f.rel, partBuilderReport(name))}`)
  ctx.out(since === 0 && dirty === 0 ? '  Stand: neu' : `  Stand: vorhanden (${since} Commit${since === 1 ? '' : 's'}${dirty > 0 ? `, ${dirty} uncommittete Dateien` : ''}); zuerst codecycle check, der Stand gilt als ungeprüft`)
  return 0
}

/**
 * Merkmal großer Teile: Die Zeile des Teils im Plan (`TASK.md`, `- Teil <name>: …`) endet mit `· groß`. Ohne `TASK.md`
 * oder ohne die Zeile: nicht groß.
 */
function markedLarge(f: Folder, name: string): boolean {
  const path = join(f.abs, 'TASK.md')
  if (!existsSync(path)) return false
  const line = new RegExp(`^\\s*[-*]\\s+(?:\\*\\*|__)?Teil\\s+\`?${name}\`?(?:\\*\\*|__)?\\s*:`)
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .some(l => line.test(l) && /·\s*(?:\*\*|__)?groß(?:\*\*|__)?\s*$/.test(l))
}

/** Teil-Bericht (Schalter `part-review`, nur Teile mit Merkmal ` · groß` im Plan): da und ohne offenen Fund? Rückgabe: Zeilen der roten Meldung, leer = in Ordnung. */
function partReviewProblem(f: Folder, name: string): string[] {
  const md = join(f.work, CODECYCLE_MD)
  const switches = switchesLib.parseSwitches(existsSync(md) ? readFileSync(md, 'utf8') : null)
  if (!switchesLib.isOn(switches, 'part-review') || !markedLarge(f, name)) return []
  const rel = partReportPath(name)
  const path = join(f.abs, rel)
  if (!existsSync(path)) return [`rot: Schalter part-review an, ${f.rel}/${rel} fehlt; erst den Teil prüfen lassen (final-reviewer mit „Auftrag: Teil“)`]
  const open = openPartFindings(readFileSync(path, 'utf8'))
  if (open.length === 0) return []
  return [`rot: ${f.rel}/${rel} hat offene Funde: ${open.join(', ')}; erst nachbessern und nachprüfen lassen (je Fund „behoben“)`]
}

/**
 * Teil abschließen: grün und committet auf dem Teil-Branch, Teil `fertig` (Commit), Aufgaben-Branch per Fast-Forward auf den
 * Teil-Branch, Wechsel (gleicher Commit), Teil-Branch löschen. Erneut aufgerufen führt es den Rest aus.
 */
function partDone(f: Folder, name: string, ctx: Ctx, taken = false): number {
  const { root, task, part, parts, me } = partOf(f, name, ctx)
  const keep = `Teil ${name} bleibt ${me?.status === 'in-arbeit' ? 'in Arbeit' : (me?.status ?? 'unverändert')}, nichts verschoben`
  if (!me) {
    ctx.out(`rot: Teil ${name} steht nicht in teile (${parts.map(p => p.name).join(', ') || 'keine'}); erst codecycle solo plan`)
    return 1
  }
  const cur = currentBranch(root)
  if (cur !== task && cur !== part) {
    ctx.out(`rot: Branch ${cur}; Teil ${name} wird auf ${part} gebaut (Aufgabe ${task}); ${keep}`)
    return 1
  }

  if (!branchExists(root, part)) {
    if (me.status === 'fertig') {
      ctx.out(`grün: Teil ${name} ist schon fertig`)
      return 0
    }
    if (me.status !== IN_WORK) {
      ctx.out(`rot: Teil ${name} ist nicht in Arbeit; erst codecycle solo teil start ${f.rel} ${name}`)
      return 1
    }
    // Teil-Branch fehlt: nie still fertig; den Stand setzt nur die ausdrückliche Option
    if (!taken) return otherDevice(f, name, me.branch ?? part, ctx)
    if (cur !== task) {
      ctx.out(`rot: Branch ${cur}; den Stand setzt --uebernommen nur auf dem Aufgaben-Branch ${task}`)
      return 1
    }
    const next = parts.map(p => (p.name === name ? { name, status: 'fertig' } : p))
    const c = commitParts(f, next, `Teil ${name}: fertig (übernommen)`)
    if (!c.ok) {
      ctx.out(`rot: Commit von ${f.rel}/STATE.md gescheitert. Git:`)
      lines(c.text).slice(-6).forEach(l => ctx.out(`  ${l}`))
      return 1
    }
    ctx.out(`grün: Teil ${name} als übernommen auf fertig gesetzt (nur der Stand; Code und Tests nicht geprüft)`)
    ctx.out(`  ${progress(next, name)}`)
    return 0
  }
  if (taken) {
    ctx.out(`rot: Branch ${part} gibt es; --uebernommen nur, wenn er fehlt (sonst ohne Option abschließen)`)
    return 1
  }

  const taskHead = revOf(root, task)
  if (!isAncestor(root, taskHead, revOf(root, part))) {
    ctx.out(`rot: Aufgaben-Branch ${task} hat sich während des Teils ${name} bewegt (nicht in ${part} enthalten); ${keep}`)
    ctx.out(`  Ansehen, was auf ${task} dazukam; nichts verwerfen.`)
    return 1
  }
  if (cur === task) {
    // Abbruch nach dem Wechsel: nur noch den Teil-Branch löschen
    if (taskHead === revOf(root, part) && me.status === 'fertig') return deletePart(root, part, name, parts, ctx)
    ctx.out(`rot: Branch ${task}; Teil ${name} wird auf ${part} gebaut (git switch ${part}); ${keep}`)
    return 1
  }

  // auf dem Teil-Branch
  const code = greenAndCommitted(f, ctx, keep, part)
  if (code !== 0) return code
  const review = partReviewProblem(f, name)
  if (review.length > 0) {
    review.forEach(l => ctx.out(l))
    return 1
  }
  const next = parts.map(p => (p.name === name ? { name, status: 'fertig' } : p))
  if (me.status !== 'fertig') {
    const c = commitParts(f, next, `Teil ${name}: fertig`)
    if (!c.ok) {
      ctx.out(`rot: Commit von ${f.rel}/STATE.md gescheitert; ${keep}. Git:`)
      lines(c.text).slice(-6).forEach(l => ctx.out(`  ${l}`))
      return 1
    }
  }
  const head = revOf(root, 'HEAD')
  const commits = Number(git(['rev-list', '--count', `${taskHead}..${head}`], root).out) || 0
  if (taskHead !== head) {
    const u = gitFull(['update-ref', `refs/heads/${task}`, head, taskHead], root)
    if (!u.ok) {
      ctx.out(`rot: ${task} nicht nachgezogen (${lines(u.text).at(-1) ?? ''}); erneut aufrufen`)
      return 1
    }
  }
  // gleicher Commit: der Arbeitsbaum bleibt, wie er ist
  const s = gitFull(['switch', '-q', task], root)
  if (!s.ok) throw new ToolBroken(`git switch ${task} fehlgeschlagen: ${s.text}`)
  ctx.out(`grün: Teil ${name} übernommen (${commits} Commit${commits === 1 ? '' : 's'}), ${task} auf ${head.slice(0, 7)}`)
  return deletePart(root, part, name, next, ctx)
}

function deletePart(root: string, part: string, name: string, parts: Part[], ctx: Ctx): number {
  const del = gitFull(['branch', '-d', part], root)
  if (!del.ok) {
    ctx.out(`rot: Branch ${part} nicht gelöscht (${lines(del.text).at(-1) ?? ''}); erneut aufrufen`)
    return 1
  }
  ctx.out(`  Branch ${part} gelöscht; ${progress(parts, name)}`)
  return 0
}

/** Ordner des Prüf-Worktrees neben dem Projekt */
const reviewDir = (root: string): string => join(dirname(root), `${basename(root)}--wt-solo-pruefung`)

/** Commit, auf dem ein Worktree an `path` losgelöst steht, oder null (kein Worktree dort). */
function detachedAt(root: string, path: string): string | null {
  let current: string | null = null
  let head = ''
  for (const line of git(['worktree', 'list', '--porcelain'], root).out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) current = resolve(line.slice('worktree '.length))
    else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
    else if (line === 'detached' && current === resolve(path)) return head
  }
  return null
}

/** Stand für den Prüfer: `geprueftAuf`, mit Teil die Spitze seines Branchs (Teil in Arbeit, ohne Aufgabenordner alles committet). */
function reviewCommit(f: Folder, root: string, name: string | null, ctx: Ctx): string | null {
  const state = readState(f)
  if (name === null) {
    if (!state.geprueftAuf) ctx.out(`rot: ${f.rel}/STATE.md ohne geprueftAuf; erst codecycle solo check ${f.rel}`)
    return state.geprueftAuf || null
  }
  const me = (state.teile ?? []).find(p => p.name === name)
  if (!me || me.status !== IN_WORK || !me.branch || !branchExists(root, me.branch)) {
    ctx.out(`rot: Teil ${name} ist hier nicht in Arbeit; erst codecycle solo teil start ${f.rel} ${name}`)
    return null
  }
  const dirty = currentBranch(root) === me.branch ? dirtyOutside(f) : []
  if (dirty.length > 0) {
    ctx.out(`rot: nicht committet (${dirty.length}): ${dirtyLines(dirty)}; erst committen, der Prüfer sieht nur Commits`)
    return null
  }
  return revOf(root, me.branch)
}

/** Prüf-Worktree am geprüften Commit (mit Teil: an der Spitze des Teil-Branchs) anlegen oder vorhandenen nennen, mit Verweis auf node_modules. */
function reviewStart(f: Folder, name: string | null, ctx: Ctx): number {
  const root = findProjectRoot(ctx.cwd)
  if (resolve(f.work) !== resolve(root)) throw new ToolBroken(`im Hauptordner ${root} aufrufen, nicht im Worktree`)
  const commit = reviewCommit(f, root, name, ctx)
  if (!commit) return 1
  const wt = reviewDir(root)
  const at = detachedAt(root, wt)
  if (at !== null && at !== commit) {
    ctx.out(`rot: Prüf-Worktree ${wt} steht auf ${at.slice(0, 7)}, geprüft wird ${commit.slice(0, 7)}; erst codecycle solo pruefung ende ${f.rel}`)
    return 1
  }
  if (at === null) {
    if (existsSync(wt)) throw new ToolBroken(`Ordner ${wt} gibt es schon, aber ohne Prüf-Worktree (nachsehen, nicht löschen)`)
    const r = gitFull(['worktree', 'add', '--detach', wt, commit], root)
    if (!r.ok) throw new ToolBroken(`git worktree add fehlgeschlagen: ${r.text}`)
    ctx.out(`grün: Prüf-Worktree ${wt} am Commit ${commit.slice(0, 7)}`)
  } else ctx.out(`grün: Prüf-Worktree ${wt} steht schon am Commit ${commit.slice(0, 7)}`)
  const linked = linkNodeModules(root, wt)
  if (linked) ctx.out(linked)
  ctx.out('Für die Startnachricht:')
  ctx.out(`  Worktree: ${wt}`)
  ctx.out(`  Commit: ${commit}`)
  return 0
}

/** Prüf-Worktree entfernen: erst die Verweise, dann `git worktree remove` ohne `--force`. */
function reviewEnd(f: Folder, ctx: Ctx): number {
  const root = findProjectRoot(ctx.cwd)
  if (resolve(f.work) !== resolve(root)) throw new ToolBroken(`im Hauptordner ${root} aufrufen, nicht im Worktree`)
  const wt = reviewDir(root)
  if (detachedAt(root, wt) === null) {
    ctx.out(existsSync(wt) ? `rot: Ordner ${wt} ist kein Prüf-Worktree (nachsehen, nicht löschen)` : 'grün: kein Prüf-Worktree da')
    return existsSync(wt) ? 1 : 0
  }
  const leftover = removeWorktree(root, wt)
  ctx.out(leftover ? `rot: Prüf-Worktree nicht entfernt${leftover}` : `grün: Prüf-Worktree ${wt} entfernt`)
  return leftover ? 1 : 0
}

export function solo(args: string[], ctx: Ctx): number {
  if (args[0] === 'teil') {
    const [, action, folder, name, ...extra] = args
    const taken = action === 'fertig' && extra.length === 1 && extra[0] === '--uebernommen'
    if (!folder || !name || (extra.length > 0 && !taken) || (action !== 'start' && action !== 'fertig')) throw new ToolBroken(USAGE)
    const f = soloFolder(folder, ctx)
    return action === 'start' ? partStart(f, name, ctx) : partDone(f, name, ctx, taken)
  }
  if (args[0] === 'pruefung') {
    const [, action, folder, ...extra] = args
    const teil = extra[0] === '--teil' && extra.length === 2 ? extra[1]! : null
    if (!folder || (extra.length > 0 && teil === null) || (action !== 'start' && action !== 'ende')) throw new ToolBroken(USAGE)
    if (teil !== null && !PART_NAME.test(teil)) throw new ToolBroken(`Name „${teil}“: nur Kleinbuchstaben, Ziffern und „-“, höchstens 31 Zeichen`)
    const f = soloFolder(folder, ctx)
    return action === 'start' ? reviewStart(f, teil, ctx) : reviewEnd(f, ctx)
  }
  const [sub, ...rest] = args
  if (sub === 'plan') {
    const [folder, ...names] = rest
    if (!folder || names.length === 0 || names.some(n => n.startsWith('-'))) throw new ToolBroken(USAGE)
    return soloPlan(soloFolder(folder, ctx), names, ctx)
  }
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
