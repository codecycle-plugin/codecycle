import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { pathsLib, planFile, stateFile } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot } from '../project.ts'
import { findFertigCommit, parseReworkLog, summarizeRework } from '../rework.ts'

const { GIT_QUIET } = pathsLib

const MAX_FILES = 8

/**
 * `rework <aufgabenordner>`: Nacharbeit aus Git. Zählt die Commits nach dem
 * Commit, der STATE.md auf `zustand: fertig` setzt, auf denselben Dateien der Aufgabe (Neu, Ändern,
 * Tests aus PLAN.md). Ausgabe knapp. Exit 0 (auch bei „nicht fertig“), 2 bei Aufruf- oder Git-Fehler.
 */
export function rework(args: string[], ctx: Ctx): number {
  const folder = args.find(a => !a.startsWith('--'))
  if (!folder || args.some(a => a.startsWith('--'))) throw new ToolBroken('Aufruf: codecycle rework <aufgabenordner>')
  const root = findProjectRoot(ctx.cwd)
  const abs = isAbsolute(folder) ? folder : [resolve(ctx.cwd, folder), resolve(root, folder)].find(p => existsSync(join(p, 'STATE.md'))) ?? resolve(ctx.cwd, folder)
  const rel = relative(root, abs).replace(/\\/g, '/')
  if (rel === '' || rel.startsWith('..')) throw new ToolBroken(`Ordner außerhalb des Projekts: ${folder}`)
  const statePath = `${rel}/STATE.md`
  const name = rel.split('/').at(-1)!

  // Verlauf von STATE.md, alt → neu: Zustand in jedem Commit
  const log = git([...GIT_QUIET, 'log', '--reverse', '--format=%H%x09%cs', '--', statePath], root)
  if (!log.ok) throw new ToolBroken('git log fehlgeschlagen')
  const history: { commit: string; zeit: string; zustand: string }[] = []
  for (const row of log.out.split(/\r?\n/).filter(Boolean)) {
    const [commit = '', zeit = ''] = row.split('\t')
    const shown = git([...GIT_QUIET, 'show', `${commit}:${statePath}`], root)
    if (!shown.ok) continue
    try {
      history.push({ commit, zeit, zustand: stateFile.parseState(shown.out, statePath).zustand })
    } catch {
      // unlesbarer Stand: überspringen
    }
  }
  const fertig = findFertigCommit(history)
  if (!fertig) {
    const last = history.at(-1)?.zustand
    ctx.out(`rework ${name}: kein Commit mit zustand: fertig${last ? ` (zuletzt: ${last})` : ' (STATE.md nicht in Git)'}`)
    return 0
  }

  // Dateien der Aufgabe aus PLAN.md (Stand beim Abschluss, sonst Arbeitsbaum)
  const planPath = `${rel}/PLAN.md`
  const planText = git([...GIT_QUIET, 'show', `${fertig.commit}:${planPath}`], root)
  const text = planText.ok ? planText.out : existsSync(join(root, planPath)) ? readFileSync(join(root, planPath), 'utf8') : null
  if (text === null) {
    ctx.out(`rework ${name}: PLAN.md nicht gefunden, Dateiliste fehlt`)
    return 0
  }
  const files = planFile.planFiles(planFile.parsePlan(text, planPath))
  const short = fertig.commit.slice(0, 7)
  if (files.length === 0) {
    ctx.out(`rework ${name}: PLAN.md nennt keine Dateien`)
    return 0
  }

  const after = git([...GIT_QUIET, 'log', '--name-only', '--no-renames', '--format=@%h%x09%cs%x09%s', `${fertig.commit}..HEAD`, '--', ...files], root)
  if (!after.ok) throw new ToolBroken('git log fehlgeschlagen')
  const summary = summarizeRework(parseReworkLog(after.out), files)
  if (summary.commits === 0) {
    ctx.out(`rework ${name}: 0 Commits nach fertig (${short}, ${fertig.zeit}) auf den ${files.length} Dateien der Aufgabe`)
    return 0
  }
  ctx.out(`rework ${name}: ${summary.commits} Commits nach fertig (${short}, ${fertig.zeit}) auf ${summary.dateien.length} von ${summary.gesamtDateien} Dateien`)
  for (const f of summary.dateien.slice(0, MAX_FILES)) ctx.out(`  ${f.datei}  ${f.commits}`)
  if (summary.dateien.length > MAX_FILES) ctx.out(`  … und ${summary.dateien.length - MAX_FILES} weitere`)
  return 0
}
