// Tests zum aktuellen Diff ausführen (`test --affected`, `check --affected`).

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { affectedTests } from './affected.ts'
import { changedFiles, diffBase } from './changes.ts'
import { ToolBroken } from './errors.ts'
import { openGraph } from './graph-use.ts'
import type { ToolConfig } from './project.ts'
import { runStep } from './step.ts'

/** Dateiliste als Argumente in Anführungszeichen; Sonderzeichen in Namen werden abgelehnt statt falsch gequotet. */
export function quoteFiles(files: string[]): string {
  for (const f of files) {
    if (/["%$`!&|<>^;\r\n]/.test(f)) throw new ToolBroken(`Dateiname mit Sonderzeichen, nicht ausführbar: ${f}`)
  }
  return files.map(f => `"${f}"`).join(' ')
}

/**
 * Befehl für mehrere Testdateien: `commands.testAffected` mit `{files}`, sonst `commands.testFilter`
 * mit `{filter}` (alle Dateien als eine Liste), sonst `<test> <dateien>`.
 * Annahme: der Testläufer nimmt Dateipfade als Argumente (Jest, Vitest, pytest, PHPUnit, `node --test`).
 */
export function affectedCommand(config: ToolConfig, files: string[]): string {
  const list = quoteFiles(files)
  const { test, testFilter, testAffected } = config.commands
  if (testAffected) return testAffected.replaceAll('{files}', () => list)
  if (testFilter) return testFilter.replaceAll('{filter}', () => list)
  if (!test) throw new ToolBroken('kein Testbefehl in .codecycle/tool.config.json eingetragen')
  return `${test} ${list}`
}

export function runAffected(
  root: string,
  work: string,
  config: ToolConfig,
  staged: boolean,
): { code: 0 | 1 | 2; lines: string[] } {
  const base = diffBase(root, work, config)
  const changed = changedFiles(work, base, staged)
  if (changed.length === 0) return { code: 0, lines: ['test: keine Änderungen, keine betroffenen Tests'] }
  const og = openGraph(root)
  const aff = affectedTests(root, work, changed, og.adapter, og.note)
  const tests = aff.tests.filter(t => existsSync(join(work, t)))
  const head = [] as string[]
  if (aff.note) head.push(`Hinweis: ${aff.note}`)
  if (tests.length === 0) {
    return {
      code: 0,
      lines: [`test: keine Tests zum Diff gefunden (${changed.length} geänderte Dateien), nichts ausgeführt`, ...head],
    }
  }
  const shown = tests.length > 5 ? `${tests.slice(0, 5).join(', ')} … (${tests.length})` : tests.join(', ')
  const step = runStep(work, config, 'test', affectedCommand(config, tests))
  return { code: step.code, lines: [`betroffene Tests: ${shown}`, ...head, ...step.lines] }
}
