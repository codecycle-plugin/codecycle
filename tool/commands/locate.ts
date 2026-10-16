import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import type { GraphHit, Treffer } from '../../lib/locate.ts'
import { ctagsOutline } from '../ctags.ts'
import { ToolBroken } from '../errors.ts'
import { openGraph } from '../graph-use.ts'
import { locateLib, outlineLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree } from '../project.ts'

/** Pfad relativ zum Worktree, mit `/`; null, wenn er außerhalb liegt. */
export function relativeInside(work: string, file: string): string | null {
  const abs = isAbsolute(file) ? file : resolve(work, file)
  const rel = relative(work, abs).replace(/\\/g, '/')
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : rel
}

export function formatTreffer(t: Treffer): string {
  return `${t.datei}:${t.start}-${t.ende} ${t.signatur}${t.geschaetzt ? ' (Bereich geschätzt)' : ''}`
}

/**
 * `locate "Datei :: Symbol"`: Ausgabe `datei:start-ende signatur`, ein Treffer pro Zeile.
 * Exit 0 = eindeutig gefunden, 1 = mehrdeutig oder nicht gefunden (nie geraten), 2 = Aufruf falsch.
 */
export function locate(args: string[], ctx: Ctx): number {
  const ref = locateLib.parseRef(args.join(' '))
  if (!ref) throw new ToolBroken('Aufruf: codecycle locate "Datei :: Symbol"')
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const datei = relativeInside(work, ref.datei)
  if (datei === null) throw new ToolBroken(`Datei außerhalb des Projekts: ${ref.datei}`)
  const path = [join(work, datei), join(root, datei)].find(p => existsSync(p))
  if (!path) {
    ctx.out(`nicht gefunden: Datei ${datei} fehlt`)
    return 1
  }
  const inhalt = readFileSync(path, 'utf8')

  const og = openGraph(root)
  const q = locateLib.splitSymbol(ref.symbol)
  let graph: GraphHit[] | undefined
  if (og.adapter) {
    const found = og.adapter.find(root, q.name)
    if (found) {
      graph = found
        .filter(s => s.datei === datei && s.start !== undefined)
        .map(s => ({ name: s.name, start: s.start!, ende: s.ende ?? s.start!, ...(s.parent ? { parent: s.parent } : {}) }))
    }
  }
  const outline = outlineLib.languageOf(datei) === null ? ctagsOutline(path, inhalt.split(/\r?\n/)) : undefined
  const result = locateLib.locateSymbol(datei, ref.symbol, inhalt, { ...(graph ? { graph } : {}), ...(outline ? { outline } : {}) })

  const hints: string[] = []
  if (locateLib.isTreffer(result)) {
    ctx.out(formatTreffer(result))
    if (result.quelle === 'suche') hints.push('Hinweis: gefunden über Textsuche, ungenau')
    else if (result.quelle === 'outline' && !graph?.length) hints.push(`Hinweis: ohne Graph (Outline)${og.note ? `: ${og.note}` : ''}`)
    hints.forEach(h => ctx.out(h))
    return 0
  }
  if (result.kandidaten.length === 0) {
    ctx.out(`nicht gefunden: ${ref.symbol} in ${datei}`)
  } else {
    ctx.out(`mehrdeutig, nicht geraten (${result.kandidaten.length} Kandidaten, genauer angeben, z. B. Klasse::Methode):`)
    result.kandidaten.forEach(t => ctx.out(formatTreffer(t)))
  }
  if (!og.adapter && og.note) ctx.out(`Hinweis: ohne Graph: ${og.note}`)
  return 1
}
