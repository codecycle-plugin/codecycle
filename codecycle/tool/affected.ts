// Tests zu geänderten Dateien: über den Graphen, sonst über die Namenskonvention.

import { basename } from 'node:path'

import { git } from './exec.ts'
import type { GraphAdapter } from './graph/index.ts'
import { isTestPath } from './graph/util.ts'
import { pathsLib } from './lib-path.ts'

const { GIT_QUIET } = pathsLib

/** Namensstamm einer Datei ohne Test-Zusätze: `FooTest.php`, `foo.spec.ts`, `test_foo.py`, `foo_test.go` → `foo` */
export function stemOf(file: string): string {
  return basename(file)
    .replace(/\.[^.]+$/, '')
    .replace(/\.(test|spec)$/i, '')
    .replace(/^test_/i, '')
    .replace(/(_test|Test|Tests)$/, '')
    .toLowerCase()
}

/** Testdateien des Projekts, deren Name zur Quelldatei passt (nur versionierte Dateien). */
export function testsByName(work: string, sources: string[]): string[] {
  if (sources.length === 0) return []
  const all = git([...GIT_QUIET, 'ls-files'], work)
    .out.split(/\r?\n/)
    .filter(f => f !== '' && isTestPath(f))
  const stems = new Set(sources.map(stemOf))
  return all.filter(f => stems.has(stemOf(f)))
}

export type Affected = { tests: string[]; viaGraph: boolean; note: string | null }

/**
 * Testdateien zum Diff: geänderte Testdateien selbst, Graph-Treffer (falls ein Graph da ist)
 * und Treffer über den Namen. Unsicher bleibt: ohne Graph findet nur die Namenskonvention.
 */
export function affectedTests(
  root: string,
  work: string,
  changed: string[],
  adapter: GraphAdapter | null,
  noGraphNote: string | null,
): Affected {
  const own = changed.filter(isTestPath)
  const sources = changed.filter(f => !isTestPath(f))
  const found = new Set<string>(own)
  let viaGraph = false
  let note: string | null = null
  if (adapter && sources.length > 0) {
    const g = adapter.affectedTests(root, sources)
    if (g) {
      viaGraph = true
      for (const t of g) found.add(t)
    } else note = `${adapter.label} antwortet nicht, Namenskonvention`
  } else if (!adapter) note = `${noGraphNote ?? 'kein Graph'}: nur Namenskonvention`
  for (const t of testsByName(work, sources)) found.add(t)
  return { tests: [...found].sort(), viaGraph, note }
}
