// Lädt den gemeinsamen Kern (`lib/`) so, dass das Werkzeug an zwei Orten läuft:
//   Plugin:  plugin/tool/*.ts  mit  plugin/lib/      → Kern liegt bei `../lib/`
//   Kopie:   .codecycle/tool/*.ts  mit  .codecycle/tool/lib/   → Kern liegt bei `./lib/`
// `install-tool` (commands/install-tool.ts) legt die Kopie an. Keine Symlinks, kein
// Build-Schritt, keine doppelte Pflege: `lib/` existiert nur einmal im Quelltext.
// Statische Importe wären an einen der beiden Orte gebunden, daher dynamisch.
// Nur Werte werden hier geladen; `import type` aus `../lib` bleibt erlaubt (wird gelöscht).
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = new URL('./', import.meta.url)
/** true: Kopie im Projekt (lib liegt neben diesen Dateien) */
export const IS_COPY = existsSync(fileURLToPath(new URL('./lib/', here)))
const base = IS_COPY ? './lib/' : '../lib/'

function load(name: string): Promise<unknown> {
  return import(new URL(`${base}${name}.ts`, here).href)
}

export const stateFile = (await load('state-file')) as typeof import('../lib/state-file.ts')
export const planFile = (await load('plan-file')) as typeof import('../lib/plan-file.ts')
export const outlineLib = (await load('outline')) as typeof import('../lib/outline.ts')
export const locateLib = (await load('locate')) as typeof import('../lib/locate.ts')
export const protectedLib = (await load('protected')) as typeof import('../lib/protected.ts')
export const guardRules = (await load('guard-rules')) as typeof import('../lib/guard-rules.ts')
export const signaturesLib = (await load('signatures')) as typeof import('../lib/signatures.ts')
export const taskFile = (await load('task-file')) as typeof import('../lib/task-file.ts')
export const effortLib = (await load('effort-plan')) as typeof import('../lib/effort-plan.ts')
export const switchesLib = (await load('switches')) as typeof import('../lib/switches.ts')
export const projectRootLib = (await load('project-root')) as typeof import('../lib/project-root.ts')
export const pathsLib = (await load('paths')) as typeof import('../lib/paths.ts')
export const versionsLib = (await load('versions')) as typeof import('../lib/versions.ts')
