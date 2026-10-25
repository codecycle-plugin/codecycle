// Geänderte Dateien und Zeilen des aktuellen Stands (für impact, test --affected, check --affected).

import { git } from './exec.ts'
import { mainBranch } from './git-hints.ts'
import type { ToolConfig } from './project.ts'
import { pathsLib } from './lib-path.ts'

const { GIT_QUIET } = pathsLib

/**
 * Vergleichsstand: auf einem Aufgaben- oder Teil-Branch der Merge-Base mit dem Hauptbranch
 * (alles, was die Aufgabe geändert hat), auf dem Hauptbranch `HEAD` (nur nicht Committetes).
 */
export function diffBase(root: string, work: string, config?: ToolConfig | null): string {
  const main = mainBranch(root, config ?? undefined)
  const current = git(['rev-parse', '--abbrev-ref', 'HEAD'], work).out
  if (current === '' || current === 'HEAD' || current === main) return 'HEAD'
  const mb = git(['merge-base', 'HEAD', main], work)
  return mb.ok && mb.out !== '' ? mb.out : 'HEAD'
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).filter(l => l !== '')
}

/** Geänderte, neue und umbenannte Dateien (gelöschte nicht); `staged`: nur der Index. */
export function changedFiles(work: string, base: string, staged = false): string[] {
  if (staged) return lines(git([...GIT_QUIET, 'diff', '--cached', '--name-only', '--diff-filter=ACMR'], work).out)
  const tracked = lines(git([...GIT_QUIET, 'diff', '--name-only', '--diff-filter=ACMR', base], work).out)
  const untracked = lines(git([...GIT_QUIET, 'ls-files', '--others', '--exclude-standard'], work).out)
  return [...new Set([...tracked, ...untracked])].filter(f => !f.startsWith('.codecycle/'))
}

/** Geänderte Zeilenbereiche (neue Seite, 1-basiert) einer Datei. Neue Dateien: ganze Datei (leere Liste = unbekannt). */
export function changedRanges(work: string, base: string, file: string, staged = false): [number, number][] {
  const args = staged ? ['diff', '--cached', '-U0', '--', file] : ['diff', '-U0', base, '--', file]
  const out = git([...GIT_QUIET, ...args], work).out
  const ranges: [number, number][] = []
  for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1])
    const count = m[2] === undefined ? 1 : Number(m[2])
    ranges.push([start, Math.max(start, start + count - 1)])
  }
  return ranges
}
