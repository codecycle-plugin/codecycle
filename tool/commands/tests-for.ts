import { testsByName } from '../affected.ts'
import { ToolBroken } from '../errors.ts'
import { openGraph } from '../graph-use.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree } from '../project.ts'
import { describe, lookupSymbol } from '../symbol-lookup.ts'
import { textSearch } from './callers.ts'

/**
 * `tests-for "Symbol"`: Tests zum Symbol, eine Zeile `datei[:zeile] name`; die Dateipfade
 * lassen sich direkt an `codecycle test <datei>` geben.
 */
export function testsFor(args: string[], ctx: Ctx): number {
  const arg = args.join(' ').trim()
  if (arg === '') throw new ToolBroken('Aufruf: codecycle tests-for "Symbol" (oder "Datei :: Symbol")')
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const og = openGraph(root)
  const look = lookupSymbol(root, arg, og)
  if (look.kind === 'many') {
    ctx.out(`mehrdeutig, nicht geraten (${look.symbols.length} Kandidaten, mit „Datei :: Symbol“ genauer angeben):`)
    look.symbols.forEach(s => ctx.out(describe(s)))
    return 1
  }
  if (look.kind === 'none') {
    ctx.out(`nicht gefunden: ${arg}`)
    return 1
  }
  if (look.kind === 'one' && og.adapter) {
    const found = og.adapter.testsFor(root, look.symbol)
    if (found) {
      const lines = [...new Set(found.map(t => `${t.datei}${t.start !== undefined ? `:${t.start}` : ''} ${t.name}`.trim()))].sort()
      if (lines.length === 0) ctx.out(`keine Tests gefunden: ${describe(look.symbol)}`)
      lines.forEach(l => ctx.out(l))
      if (og.adapter.id === 'codegraph') ctx.out('Hinweis: CodeGraph liefert Testdateien zur Datei des Symbols, nicht zum Symbol')
      if (og.note) ctx.out(`Hinweis: ${og.note}`)
      return 0
    }
  }
  // Rückfall: Testdateien, die den Namen erwähnen, und Namenskonvention zur Datei
  const name = look.kind === 'nograph' ? look.name : look.kind === 'one' ? look.symbol.name : arg
  const datei = look.kind === 'nograph' ? look.datei : look.kind === 'one' ? look.symbol.datei : undefined
  const mentioning = textSearch(work, name, true).map(l => l.split(':')[0]!)
  const byName = datei ? testsByName(work, [datei]) : []
  const files = [...new Set([...byName, ...mentioning])].sort()
  files.forEach(f => ctx.out(f))
  if (files.length === 0) ctx.out(`keine Tests gefunden für ${name}`)
  ctx.out(`Hinweis: ungenau, kein Graph${og.note ? ` (${og.note})` : ''}: Testdateien, die den Namen erwähnen, und Namenskonvention`)
  return 0
}
