import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { refreshControl } from '../guard-records.ts'
import {
  BLOCK_RE,
  HOOKS_DIR,
  HOOK_NAMES,
  blockOf,
  desiredHooksPath,
  hooksPathMissing,
  hooksPathOf,
  hooksState,
  isOwnHooksPath,
  lf,
  missingText,
  renderHook,
  staleOwnPath,
} from '../hooks-state.ts'
import type { Ctx } from '../main.ts'
import { OWN_LAYOUT } from '../paths.ts'
import { findProjectRoot, tryLoadConfig } from '../project.ts'

const VERSION_RE = /hooks-version (\d+)/

function merge(existing: string | null, name: string, provider: string): { content: string; action: string } {
  const fresh = renderHook(name, provider)
  const block = blockOf(fresh)!
  if (existing === null) return { content: fresh, action: 'angelegt' }
  const text = lf(existing)
  const have = blockOf(text)
  if (have === null) return { content: `${text.replace(/\n*$/, '\n')}\n${block}\n`, action: 'ergänzt' }
  if (have === block) return { content: text, action: 'unverändert' }
  return { content: text.replace(BLOCK_RE, () => block), action: `aktualisiert (Version ${have.match(VERSION_RE)?.[1] ?? '?'} → ${block.match(VERSION_RE)?.[1] ?? '?'})` }
}

/**
 * `hooks install [--dry-run]`: legt die Hooks im Projekt unter `.githooks/` an und setzt
 * `core.hooksPath`. Vorhandene Hooks bleiben erhalten: der Block wird angehängt (zwischen Markierungen),
 * ein Hook aus `.git/hooks/` wird übernommen, damit er weiter läuft. Idempotent.
 * `hooks status`: Zustand ansehen.
 */
export function hooks(args: string[], ctx: Ctx): number {
  const [sub, ...rest] = args
  const root = findProjectRoot(ctx.cwd)
  if (sub === 'status') {
    if (rest.length > 0) throw new ToolBroken(`unbekannte Option ${rest[0]}`)
    const s = hooksState(root)
    ctx.out(`core.hooksPath: ${s.hooksPath === '' ? 'nicht gesetzt' : s.hooksPath}${s.active ? '' : s.hooksPath === '' ? ' (Hooks nicht aktiv)' : ' (nicht .githooks)'}`)
    if (s.missingDir) ctx.out(`Fehler: ${missingText(s.hooksPath)}`)
    for (const [name, state] of Object.entries(s.hooks)) ctx.out(`${name}: ${state}`)
    return s.missingDir ? 1 : 0
  }
  if (sub !== 'install') throw new ToolBroken('Aufruf: codecycle hooks install [--dry-run] | codecycle hooks status')
  const unknown = rest.find(a => a !== '--dry-run')
  if (unknown) throw new ToolBroken(`unbekannte Option ${unknown}`)
  const dry = rest.includes('--dry-run')
  const prefix = dry ? 'würde: ' : ''

  const config = tryLoadConfig(root)
  if (config === null) {
    throw new ToolBroken(
      'keine gültige .codecycle/tool.config.json: erst die Konfiguration anlegen (z. B. `codecycle install-tool`, dann prüfen), dann `hooks install`. Der Graph-Anbieter der Hooks kommt aus der Konfiguration.',
    )
  }
  const found = hooksPathOf(root)
  // verwaister eigener Pfad (Projekt verschoben): wie nicht gesetzt behandeln, unten neu setzen
  const stale = staleOwnPath(found)
  if (stale) ctx.out(`core.hooksPath zeigt auf „${found}“, das Verzeichnis fehlt (Projekt verschoben?): wird neu gesetzt.`)
  const current = stale ? '' : found
  if (current !== '' && !isOwnHooksPath(current, root)) {
    if (hooksPathMissing(current)) ctx.out(`Fehler: ${missingText(current)}`)
    ctx.out(`core.hooksPath zeigt auf „${current}“, nicht auf ${HOOKS_DIR}: nichts geändert.`)
    ctx.out(`Entweder die Hooks dort von Hand ergänzen (Vorlagen: ${OWN_LAYOUT.githooksDir}) oder core.hooksPath bewusst umstellen, dann erneut aufrufen.`)
    return 1
  }
  const provider = config.graph?.provider ?? 'auto'
  const dir = join(root, HOOKS_DIR)
  const legacyDir = git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks'], root).out
  ctx.out(`${prefix}Hooks in ${HOOKS_DIR}/ (Graph-Anbieter: ${provider})`)
  let changed = false
  for (const name of HOOK_NAMES) {
    const target = join(dir, name)
    let existing = existsSync(target) ? readFileSync(target, 'utf8') : null
    let adopted = false
    // Ein Hook aus .git/hooks/ gälte nach dem Umstellen nicht mehr: übernehmen
    if (existing === null && current === '' && legacyDir !== '') {
      const legacy = join(legacyDir, name)
      if (existsSync(legacy)) {
        existing = readFileSync(legacy, 'utf8')
        adopted = true
      }
    }
    const { content, action } = merge(existing, name, provider)
    const label = adopted ? `${action} (bestehender Hook aus .git/hooks übernommen)` : action
    ctx.out(`  ${prefix}${name}: ${label}`)
    if (dry || (existing !== null && !adopted && action === 'unverändert')) continue
    mkdirSync(dir, { recursive: true })
    writeFileSync(target, content)
    changed = true
    try {
      chmodSync(target, 0o755)
    } catch {
      // Windows: Git führt Hooks ohne Ausführungsrecht aus
    }
  }
  const want = desiredHooksPath(root)
  if (current === '' || current !== want) {
    ctx.out(`  ${prefix}core.hooksPath: ${want} ${current === '' ? 'setzen' : `umstellen (war ${current})`}`)
    if (!dry && !git(['config', 'core.hooksPath', want], root).ok) throw new ToolBroken('core.hooksPath ließ sich nicht setzen')
    changed = true
  } else ctx.out(`  core.hooksPath: ${want} (schon gesetzt)`)
  // rechtmäßig geänderte Kontrolldateien: neue Grundlage für guard; nur nach echter Änderung
  if (!dry && changed) refreshControl(root, [root])
  ctx.out('Hinweis: Auf Linux/macOS müssen die Hook-Dateien ausführbar im Repository stehen (git update-index --chmod=+x).')
  return 0
}
