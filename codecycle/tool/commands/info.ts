import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { versionOf } from '../exec.ts'
import type { Ctx } from '../main.ts'
import { CONFIG_PATH, findProjectRoot } from '../project.ts'
import { MIN_NODE, TOOL_VERSION } from '../version.ts'

const PROGRAMS = [
  ['Git', 'git'],
  ['uv', 'uv'],
  ['code-review-graph', 'code-review-graph'],
  ['CodeGraph', 'codegraph'],
  ['ctags', 'ctags'],
] as const

export function info(_args: string[], ctx: Ctx): number {
  const node = process.versions.node
  const major = Number(node.split('.')[0])
  ctx.out(`codecycle-Werkzeug ${TOOL_VERSION}`)
  ctx.out(`Node ${node}${major >= MIN_NODE ? '' : ` (zu alt, mindestens ${MIN_NODE})`}`)
  for (const [label, cmd] of PROGRAMS) ctx.out(`${label}: ${versionOf(cmd) ?? 'fehlt'}`)
  let root: string | null = null
  try {
    root = findProjectRoot(ctx.cwd)
  } catch {
    // kein Repository: wird unten gemeldet
  }
  ctx.out(`Projekt: ${root ?? 'kein Git-Repository'}`)
  if (root) ctx.out(`Konfiguration: ${existsSync(join(root, CONFIG_PATH)) ? CONFIG_PATH : 'fehlt'}`)
  return 0
}
