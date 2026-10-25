import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runShell } from './exec.ts'
import { type JunitSummary, parseJunit } from './junit.ts'
import { TMP_DIR, type ToolConfig, tmpDir } from './project.ts'
import { summarize } from './report.ts'

/** Führt einen Prüfschritt im Worktree aus, schreibt das volle Log und fasst zusammen. */
export function runStep(
  workTree: string,
  config: ToolConfig,
  label: string,
  command: string,
  env?: Record<string, string>,
): { code: 0 | 1 | 2; lines: string[] } {
  tmpDir(workTree)
  const logPath = `${TMP_DIR}/last-${label}.log`
  const junitPath = label === 'test' && config.junit ? join(workTree, config.junit) : null
  if (junitPath && existsSync(junitPath)) rmSync(junitPath) // alten Bericht nicht mitlesen
  const r = runShell(command, workTree, env)
  writeFileSync(join(workTree, logPath), r.output)
  const junit = junitPath && existsSync(junitPath) ? readJunit(junitPath) : null
  const code = r.broken ? 2 : r.code === 0 ? 0 : 1
  return { code, lines: summarize(label, r, junit, logPath) }
}

/** Ein leerer oder unlesbarer Bericht zählt als keiner (sonst „rot (0 fehlgeschlagen …)“). */
function readJunit(path: string): JunitSummary | null {
  let s: JunitSummary
  try {
    s = parseJunit(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  return s.passed + s.failed + s.skipped === 0 ? null : s
}
