// Symbol über den Graphen finden (für callers und tests-for). Rät nie.

import type { GSymbol } from './graph/index.ts'
import type { OpenGraph } from './graph-use.ts'
import { locateLib } from './lib-path.ts'

export type Lookup =
  | { kind: 'one'; symbol: GSymbol }
  | { kind: 'many'; symbols: GSymbol[] }
  | { kind: 'none' }
  /** kein (antwortender) Graph: der Aufrufer weicht auf Textsuche aus */
  | { kind: 'nograph'; name: string; datei?: string }

export function lookupSymbol(root: string, arg: string, og: OpenGraph): Lookup {
  const ref = locateLib.parseRef(arg)
  const q = locateLib.splitSymbol(ref ? ref.symbol : arg)
  const datei = ref?.datei.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!og.adapter) return { kind: 'nograph', name: q.name, ...(datei ? { datei } : {}) }
  const found = og.adapter.find(root, q.name)
  if (found === null) return { kind: 'nograph', name: q.name, ...(datei ? { datei } : {}) }
  const parent = q.parents[q.parents.length - 1]
  const matching = found.filter(s => (datei === undefined || s.datei === datei) && (parent === undefined || s.parent === parent))
  const unique = [...new Map(matching.map(s => [`${s.datei}:${s.ref}`, s])).values()]
  if (unique.length === 0) return { kind: 'none' }
  return unique.length === 1 ? { kind: 'one', symbol: unique[0]! } : { kind: 'many', symbols: unique }
}

export function describe(s: GSymbol): string {
  const range = s.start === undefined ? '' : `:${s.start}${s.ende !== undefined ? `-${s.ende}` : ''}`
  return `${s.datei}${range} ${s.parent ? `${s.parent}::` : ''}${s.name}`
}
