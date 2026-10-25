import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { ToolBroken } from './errors.ts'
import { git } from './exec.ts'
import { OWN_LAYOUT } from './paths.ts'
import { tryLoadConfig } from './project.ts'

export const HOOK_NAMES = ['post-commit', 'post-merge', 'post-checkout', 'pre-commit'] as const
export const HOOKS_DIR = '.githooks'
export const BLOCK_RE = /^# >>> codecycle[^\n]*\n[\s\S]*?^# <<< codecycle <<<$/m

export const lf = (s: string): string => s.replace(/\r\n/g, '\n')

export function blockOf(text: string): string | null {
  return text.match(BLOCK_RE)?.[0] ?? null
}

function template(name: string): string {
  const path = join(OWN_LAYOUT.githooksDir, name)
  if (!existsSync(path)) throw new ToolBroken(`Hook-Vorlage fehlt: ${path}`)
  return lf(readFileSync(path, 'utf8'))
}

/** Vorlage für den gewählten Graph-Anbieter. */
export function renderHook(name: string, provider: string): string {
  return template(name).replaceAll('@GRAPH_PROVIDER@', provider)
}

export function hooksPathOf(root: string): string {
  return git(['config', '--get', 'core.hooksPath'], root).out.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

/** Ist `core.hooksPath` unser Ordner? Relativ `.githooks` oder absolut auf `<Hauptordner>/.githooks`. */
export function isOwnHooksPath(current: string, root: string): boolean {
  if (current === HOOKS_DIR) return true
  if (current === '' || !isAbsolute(current)) return false
  const norm = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
  return norm(current) === norm(join(root, HOOKS_DIR))
}

/**
 * Gewünschter Wert für `core.hooksPath`: relativ `.githooks`; absolut auf den Hauptordner, wenn `.githooks`
 * nicht versioniert, aber ausgeschlossen ist (`codecycle exclude`): Worktrees bekommen den Ordner
 * dann nicht, relativ liefen dort keine Hooks.
 */
export function desiredHooksPath(root: string): string {
  const tracked = git(['ls-files', '--', HOOKS_DIR], root).out !== ''
  const ignored = git(['check-ignore', '-q', `${HOOKS_DIR}/pre-commit`], root).ok
  return !tracked && ignored ? join(root, HOOKS_DIR).replaceAll('\\', '/') : HOOKS_DIR
}

/**
 * Zeigt ein absoluter `core.hooksPath` auf ein Verzeichnis, das es nicht gibt (z. B. Projekt verschoben)?
 * Git führt dann still keine Hooks aus. Relative Pfade zählen nicht (fehlende Hooks meldet der Zustand).
 */
export function hooksPathMissing(current: string): boolean {
  return current !== '' && isAbsolute(current) && !existsSync(current)
}

/** Meldung für einen fehlenden Hook-Ordner. */
export function missingText(current: string): string {
  return `Verzeichnis fehlt: ${current}, Git führt keine Hooks aus. Wurde das Projekt verschoben? Neu setzen: codecycle hooks install`
}

/** Verwaister eigener Pfad: absolut, fehlt, endet auf `/.githooks` (früherer Hauptordner). */
export function staleOwnPath(current: string): boolean {
  return hooksPathMissing(current) && current.replace(/\\/g, '/').replace(/\/$/, '').endsWith(`/${HOOKS_DIR}`)
}

export type HookState = 'ok' | 'veraltet' | 'ohne Block' | 'fehlt'

/** Zustand der Hooks im Projekt (für `hooks status` und `selftest`). */
export function hooksState(root: string): { hooksPath: string; active: boolean; missingDir: boolean; hooks: Record<string, HookState> } {
  const hooksPath = hooksPathOf(root)
  const provider = tryLoadConfig(root)?.graph?.provider ?? 'auto'
  const hooks: Record<string, HookState> = {}
  for (const name of HOOK_NAMES) {
    const file = join(root, HOOKS_DIR, name)
    if (!existsSync(file)) {
      hooks[name] = 'fehlt'
      continue
    }
    const have = blockOf(lf(readFileSync(file, 'utf8')))
    const want = blockOf(renderHook(name, provider))
    hooks[name] = have === null ? 'ohne Block' : have === want ? 'ok' : 'veraltet'
  }
  return { hooksPath, active: isOwnHooksPath(hooksPath, root), missingDir: hooksPathMissing(hooksPath), hooks }
}
