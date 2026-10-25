import { git } from '../exec.ts'
import { openGraph } from '../graph-use.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree } from '../project.ts'
import { describe, lookupSymbol } from '../symbol-lookup.ts'
import { ToolBroken } from '../errors.ts'
import { pathsLib } from '../lib-path.ts'

const { GIT_QUIET } = pathsLib

const MAX_TEXT_HITS = 40

/** Textsuche als Rückfall: `datei:zeile text`, ungenau (auch Definition und Kommentare). */
export function textSearch(work: string, name: string, onlyTests: boolean): string[] {
  const r = git([...GIT_QUIET, 'grep', '-n', '-w', '-F', '-I', '-e', name, '--', '.'], work)
  const lines = r.out.split(/\r?\n/).filter(l => l !== '')
  const keep = onlyTests ? lines.filter(l => /^[^:]*(tests?|spec|__tests__)[\\/]|[._]test\.|[._]spec\.|Test\.php:/i.test(l)) : lines
  return keep.slice(0, MAX_TEXT_HITS).map(l => (l.length > 160 ? `${l.slice(0, 157)}...` : l))
}

/** `callers "Symbol"` oder `callers "Datei :: Symbol"`: eine Zeile pro Aufrufer `datei :: symbol`. */
export function callers(args: string[], ctx: Ctx): number {
  const arg = args.join(' ').trim()
  if (arg === '') throw new ToolBroken('Aufruf: codecycle callers "Symbol" (oder "Datei :: Symbol")')
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
    const found = og.adapter.callers(root, look.symbol)
    if (found) {
      const lines = [...new Set(found.filter(s => !s.isTest).map(s => `${s.datei} :: ${s.parent ? `${s.parent}::` : ''}${s.name}`))].sort()
      if (lines.length === 0) ctx.out(`keine Aufrufer gefunden: ${describe(look.symbol)}`)
      lines.forEach(l => ctx.out(l))
      if (og.note) ctx.out(`Hinweis: ${og.note}`)
      return 0
    }
  }
  // Rückfall: Textsuche
  const name = look.kind === 'nograph' ? look.name : look.kind === 'one' ? look.symbol.name : arg
  const hits = textSearch(work, name, false)
  hits.forEach(l => ctx.out(l))
  if (hits.length === 0) ctx.out(`keine Treffer für ${name}`)
  ctx.out(`Hinweis: ungenau, kein Graph${og.note ? ` (${og.note})` : ''}: Textsuche nach dem Namen, auch Definition und Kommentare`)
  return 0
}
