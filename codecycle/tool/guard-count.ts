import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ToolBroken } from './errors.ts'
import { git } from './exec.ts'
import type { Records } from './guard-records.ts'
import { parseJunit } from './junit.ts'
import type { ToolConfig } from './project.ts'
import { runStep } from './step.ts'

/**
 * Festgehaltene Testzahl für den aktuellen Stand: der Eintrag, dessen Commit der nächstgelegene Vorfahr von HEAD ist
 * (kleinste Zahl `git rev-list --count <commit>..HEAD`; bei Gleichstand der jüngere), auch aus einem inzwischen
 * entfernten Worktree. Nicht der jüngste Zeitstempel: ein späteres `--record` auf einem älteren Stand
 * darf die Zahl des späteren Stands nicht ersetzen. Die alte Ablage `.codecycle/tmp/test-counts.json` je Arbeitsordner
 * wird nicht mehr gelesen: Sie ist nicht geschützt, ein Agent könnte dort niedrige Zahlen ablegen.
 */
export function storedCounts(work: string, records: Records): { total: number; skipped: number } | null {
  let best: { c: Records['counts'][number]; distance: number } | null = null
  for (const c of records.counts) {
    if (!git(['merge-base', '--is-ancestor', c.head, 'HEAD'], work).ok) continue
    const n = git(['rev-list', '--count', `${c.head}..HEAD`], work)
    const distance = n.ok ? Number(n.out) : Number.NaN
    if (!Number.isFinite(distance)) continue
    if (!best || distance < best.distance || (distance === best.distance && c.recordedAt > best.c.recordedAt)) best = { c, distance }
  }
  return best ? { total: best.c.total, skipped: best.c.skipped } : null
}

/** Zahl der Tests und übersprungenen über den JUnit-Bericht; null, wenn nicht erfassbar. */
export function countTests(work: string, config: ToolConfig): { code: number; counts: { total: number; skipped: number } | null; note?: string; lines: string[] } {
  const command = config.commands.testFull ?? config.commands.test
  if (command === undefined) throw new ToolBroken('kein Testbefehl in .codecycle/tool.config.json eingetragen')
  if (command === null) return { code: 0, counts: null, note: 'kein Testbefehl vorhanden', lines: [] }
  const step = runStep(work, config, 'test', command)
  if (!config.junit) {
    return { code: step.code, counts: null, note: 'Testzahl nicht erfassbar: "junit" fehlt in .codecycle/tool.config.json', lines: step.lines }
  }
  const path = join(work, config.junit)
  if (!existsSync(path)) {
    return { code: step.code, counts: null, note: `Testzahl nicht erfassbar: JUnit-Bericht ${config.junit} wurde nicht geschrieben`, lines: step.lines }
  }
  const s = parseJunit(readFileSync(path, 'utf8'))
  const total = s.passed + s.failed + s.skipped
  if (total === 0) return { code: step.code, counts: null, note: 'Testzahl nicht erfassbar: JUnit-Bericht ohne Tests', lines: step.lines }
  return { code: step.code, counts: { total, skipped: s.skipped }, lines: step.lines }
}
