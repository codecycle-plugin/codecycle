// Wo liegen Werkzeug, Kern und Hook-Vorlagen? Zwei Anordnungen (siehe lib-path.ts):
//   Plugin:  <plugin>/tool/…   <plugin>/lib/…   <plugin>/githooks/…
//   Kopie:   <projekt>/.codecycle/tool/…   …/tool/lib/…   …/tool/githooks/…

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Layout = { toolDir: string; libDir: string; githooksDir: string; isCopy: boolean }

export function layoutOf(toolDir: string): Layout {
  const isCopy = existsSync(join(toolDir, 'lib'))
  return isCopy
    ? { toolDir, libDir: join(toolDir, 'lib'), githooksDir: join(toolDir, 'githooks'), isCopy }
    : { toolDir, libDir: join(toolDir, '..', 'lib'), githooksDir: join(toolDir, '..', 'githooks'), isCopy }
}

/** Ordner dieser Dateien. */
export const OWN_TOOL_DIR = dirname(fileURLToPath(import.meta.url))
export const OWN_LAYOUT = layoutOf(OWN_TOOL_DIR)

/**
 * Werkzeug-Ordner des Plugins, soweit bekannt: der eigene, wenn wir im Plugin laufen,
 * sonst über `CLAUDE_PLUGIN_ROOT` (unbestätigt, ob Claude Code die Variable für Bash setzt).
 */
export function pluginToolDir(): string | null {
  if (!OWN_LAYOUT.isCopy) return OWN_TOOL_DIR
  const root = process.env.CLAUDE_PLUGIN_ROOT
  if (root && existsSync(join(root, 'tool', 'cli.ts'))) return join(root, 'tool')
  return null
}
