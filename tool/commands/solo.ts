// `codecycle solo check|funde <aufgabenordner>`: die harten Haltepunkte des Solo-Wegs.
//   check: Haltepunkt „Eigene Kontrolle“. `codecycle check` grün, alles außerhalb des Aufgabenordners committet,
//          Risikobereiche der geänderten Dateien seit dem Start; schreibt `geprueftAuf: <HEAD>` und `haltepunkt: 3` in STATE.md.
//          Exit 0 grün, 1 rot. Berührte Risikobereiche nennt die Ausgabe als Zeile für den Prüfauftrag.
//   funde: Haltepunkt „Nachbesserung“. Jeder Fund aus reports/pruefung.md hat in TASK.md, Abschnitt „Funde“,
//          `behoben` oder `verworfen: <Grund>`. Exit 0 vollständig, 1 sonst.
// Start ist der Abzweig vom Hauptbranch (`git merge-base <hauptbranch> HEAD`).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { mainBranch } from '../git-hints.ts'
import { pathsLib, riskPathsLib, soloFindingsLib, stateFile } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findWorkTree, tryLoadConfig } from '../project.ts'
import { check } from './check.ts'

const { GIT_QUIET } = pathsLib
const { SOLO_REPORT, checkFindings } = soloFindingsLib

const CODECYCLE_MD = '.claude/codecycle.md'
const USAGE = 'Aufruf: codecycle solo check <aufgabenordner> | codecycle solo funde <aufgabenordner>'

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
  if (r.fehlend.length > 0) {
    ctx.out(`rot: ${r.fehlend.length} von ${r.ids.length} Funden ohne Status in TASK.md, Abschnitt „Funde“: ${r.fehlend.join(', ')}`)
    ctx.out('  Je Fund eine Zeile: „- M1: behoben (…)“ oder „- M1: verworfen: <Grund>“')
    return 1
  }
  ctx.out(r.ids.length === 0 ? 'grün: Bericht ohne Funde' : `grün: alle ${r.ids.length} Funde mit Status`)
  return 0
}

export function solo(args: string[], ctx: Ctx): number {
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
