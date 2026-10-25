// Zusatzquelle für die Outline: Universal Ctags, falls installiert (Werkzeug-Ebene, nicht in lib/).
// Wird nur für Sprachen gefragt, die der eigene Scanner in lib/outline.ts nicht kennt.
// UNBESTÄTIGT (hier nicht installiert, nicht ausprobiert): Aufruf `ctags --output-format=json
// --fields=+neKS -f - <datei>` und die Feldnamen `name`, `line`, `end`, `kind`, `scope` laut Dokumentation
// von Universal Ctags; Auswertung tolerant, was fehlt, ergibt eine leere Outline.

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

import type { OutlineSymbol, SymbolKind } from '../lib/outline.ts'

let available: boolean | undefined

export function ctagsAvailable(): boolean {
  if (available === undefined) {
    const r = spawnSync('ctags', ['--version'], { encoding: 'utf8', cwd: tmpdir(), windowsHide: true })
    available = r.status === 0 && /Universal Ctags/i.test(r.stdout ?? '')
  }
  return available
}

const KINDS: Record<string, SymbolKind> = {
  class: 'class',
  interface: 'interface',
  trait: 'trait',
  enum: 'enum',
  struct: 'class',
  function: 'function',
  method: 'method',
  member: 'method',
  module: 'class',
  type: 'type',
  typedef: 'type',
}

/** JSON-Zeilen von ctags → Outline. `lines` = Zeilen der Datei, für die Signatur. */
export function parseCtags(output: string, lines: string[]): OutlineSymbol[] {
  const out: OutlineSymbol[] = []
  for (const raw of output.split(/\r?\n/)) {
    if (!raw.startsWith('{')) continue
    let t: Record<string, unknown>
    try {
      t = JSON.parse(raw) as Record<string, unknown>
    } catch {
      continue
    }
    const kind = typeof t.kind === 'string' ? KINDS[t.kind] : undefined
    if (t._type !== 'tag' || !kind || typeof t.name !== 'string' || typeof t.line !== 'number') continue
    const end = typeof t.end === 'number' && t.end >= t.line ? t.end : t.line
    const scope = typeof t.scope === 'string' ? t.scope.split(/::|\./).pop() : undefined
    out.push({
      name: t.name,
      kind,
      start: t.line,
      ende: end,
      signatur: (lines[t.line - 1] ?? t.name).trim().replace(/\s*\{$/, '').slice(0, 200),
      ...(scope ? { parent: scope } : {}),
    })
  }
  return out
}

export function ctagsOutline(absFile: string, lines: string[]): OutlineSymbol[] {
  if (!ctagsAvailable()) return []
  const r = spawnSync('ctags', ['--output-format=json', '--fields=+neKS', '-f', '-', absFile], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  return r.status === 0 ? parseCtags(r.stdout ?? '', lines) : []
}
