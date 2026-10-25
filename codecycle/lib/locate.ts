// Auflösung „Datei :: Symbol“ aus dem Dateiinhalt.
// Rein: kein Node, keine Mod-API, kein Dateizugriff. Der Aufrufer (Werkzeug)
// liest die Datei und übergibt den Inhalt, bei Bedarf das Ergebnis des Code-Graphen.
//
// STABILE API (das Werkzeug baut darauf auf):
//   parseRef(text)                         "Datei :: Symbol" → { datei, symbol } | null
//   locateSymbol(datei, symbol, inhalt, opt?) → Treffer | { kandidaten: Treffer[] }
//       Rückfall-Stufen: Graph (opt.graph) → Outline (opt.outline, sonst eigener Scanner) → Suche.
//       Rät nie: mehrere Möglichkeiten → { kandidaten }, nichts gefunden → { kandidaten: [] }.
//   outline(inhalt, datei)                 eigener Symbol-Scanner (PHP, JS/TS, Python, Go), in `outline.ts`
// Zeilennummern sind 1-basiert, `start`/`ende` einschließlich.

import { braceEnd, languageOf, maskCode, outline, pyEnd, sig, splitLines } from './outline.ts'
import type { Lang, OutlineSymbol } from './outline.ts'

/** Ein Graph-Treffer für das gesuchte Symbol in der Datei (Aufrufer filtert nach Datei). */
export type GraphHit = { name: string; start: number; ende: number; parent?: string }

export type Quelle = 'graph' | 'outline' | 'suche'

export type Treffer = {
  datei: string
  start: number
  ende: number
  signatur: string
  /** true: das Ende wurde geschätzt („Bereich geschätzt“) */
  geschaetzt: boolean
  quelle: Quelle
  name: string
}

export type Mehrdeutig = { kandidaten: Treffer[] }
export type LocateResult = Treffer | Mehrdeutig

export type LocateOptions = {
  /** Ergebnis des Code-Graphen zu diesem Symbol in dieser Datei, falls vorhanden */
  graph?: GraphHit[]
  /** externe Outline (z. B. ctags), wird für nicht unterstützte Sprachen und als Zweitquelle genutzt */
  outline?: OutlineSymbol[]
}

export function isTreffer(r: LocateResult): r is Treffer {
  return 'start' in r
}

// ---------------------------------------------------------------------------
// Referenz und Symbolname

/** `src/a.php :: Foo::bar` → { datei, symbol }. Null, wenn das Trennzeichen ` :: ` fehlt. */
export function parseRef(text: string): { datei: string; symbol: string } | null {
  const i = text.indexOf(' :: ')
  if (i < 0) return null
  const datei = text.slice(0, i).trim()
  const symbol = text.slice(i + 4).trim()
  if (datei === '' || symbol === '') return null
  return { datei, symbol }
}

/** `App\Foo::bar()`, `Foo.bar`, `Foo#bar`, `Foo->bar` → { parents: ['Foo'], name: 'bar' } */
export function splitSymbol(symbol: string): { parents: string[]; name: string } {
  const parts = symbol
    .trim()
    .replace(/\(.*$/s, '')
    .split(/::|->|#|\./)
    .map(p => p.slice(p.lastIndexOf('\\') + 1).trim())
    .filter(p => p !== '')
  const name = parts.pop() ?? ''
  return { parents: parts, name }
}

// ---------------------------------------------------------------------------
// Auflösung

function matches(s: { name: string; parent?: string | undefined }, q: { parents: string[]; name: string }): boolean {
  if (s.name !== q.name) return false
  const parent = q.parents[q.parents.length - 1]
  return parent === undefined || s.parent === parent
}

function toTreffer(datei: string, s: OutlineSymbol, quelle: Quelle, geschaetzt: boolean): Treffer {
  return { datei, start: s.start, ende: s.ende, signatur: s.signatur, geschaetzt, quelle, name: s.name }
}

/** Ein Bereich „Start = Ende“ mit offener Klammer bzw. offenem Doppelpunkt ist verdächtig (Graph-Unsauberkeit). */
function looksSingleLine(line: string): boolean {
  const open = (line.match(/[{(\[]/g) ?? []).length
  const close = (line.match(/[})\]]/g) ?? []).length
  if (open !== close) return false
  return !/[:{]\s*$/.test(line.trimEnd()) || /\}\s*$/.test(line)
}

/**
 * Schätzt das Ende: Zeile vor dem nächsten Symbol (gleiche oder höhere Ebene),
 * sonst Klammer-/Einrückungszählung, sonst Dateiende. Leerzeilen am Ende werden abgeschnitten.
 */
function estimateEnd(lines: string[], start: number, syms: OutlineSymbol[], lang: Lang | null): number {
  const self = syms.find(s => s.start === start)
  const level = (s: OutlineSymbol | undefined) => (s?.parent ? 1 : 0)
  const next = syms.filter(s => s.start > start && level(s) <= level(self)).sort((a, b) => a.start - b.start)[0]
  let ende: number
  if (next) ende = next.start - 1
  else if (lang && lang !== 'py') ende = braceEnd(maskCode(lines, lang), start - 1)
  else if (lang === 'py') ende = pyEnd(lines, maskCode(lines, lang), start - 1)
  else ende = lines.length
  while (ende > start && lines[ende - 1]!.trim() === '') ende--
  return Math.max(ende, start)
}

const DECL_WORDS = /\b(function|def|class|func|fn|interface|trait|enum|struct|type|const|let|var|sub|public|private|protected|static|async|abstract)\b|=>/

/**
 * Löst `symbol` in der Datei auf. Reihenfolge: Graph → Outline → Suche. Rät nie:
 * Mehrdeutiges kommt als `{ kandidaten }`, Nichtgefundenes als `{ kandidaten: [] }`.
 */
export function locateSymbol(datei: string, symbol: string, inhalt: string, opt: LocateOptions = {}): LocateResult {
  const q = splitSymbol(symbol)
  if (q.name === '') return { kandidaten: [] }
  const lines = splitLines(inhalt)
  const lang = languageOf(datei)
  const own = outline(inhalt, datei)
  const wordRe = new RegExp(`(?<![\\w$])${q.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`)

  // Stufe 1: Graph. Veraltete Treffer (Zeile enthält den Namen nicht mehr) werden verworfen.
  const hits = (opt.graph ?? []).filter(
    h =>
      matches(h, q) &&
      Number.isInteger(h.start) &&
      h.start >= 1 &&
      h.start <= lines.length &&
      h.ende >= h.start &&
      h.ende <= lines.length &&
      wordRe.test(lines[h.start - 1]!),
  )
  if (hits.length > 0) {
    const all = [...new Map(hits.map(h => [h.start, h])).values()].map(h => {
      const suspicious = h.start === h.ende && !looksSingleLine(lines[h.start - 1]!)
      const ende = suspicious ? estimateEnd(lines, h.start, own, lang) : h.ende
      return { datei, start: h.start, ende, signatur: sig(lines[h.start - 1]!), geschaetzt: suspicious, quelle: 'graph' as const, name: q.name }
    })
    return all.length === 1 ? all[0]! : { kandidaten: all }
  }

  // Stufe 2: Outline (eigener Scanner, dann externe, z. B. ctags)
  for (const source of [own, opt.outline ?? []]) {
    const found = source.filter(s => matches(s, q) && s.start >= 1 && s.start <= lines.length)
    if (found.length === 0) continue
    const all = found.map(s => toTreffer(datei, s, 'outline', false))
    return all.length === 1 ? all[0]! : { kandidaten: all }
  }

  // Stufe 3: Suche nach dem Namen. Nur Zeilen, die wie eine Deklaration aussehen, zählen als Treffer.
  const syms = [...own, ...(opt.outline ?? [])]
  const masked = lang ? maskCode(lines, lang) : lines
  const occurrences: number[] = []
  for (let i = 0; i < masked.length; i++) {
    const l = masked[i]!
    const idx = l.search(wordRe)
    if (idx < 0) continue
    const before = l.slice(0, idx)
    if (/(\.|->|::)\s*$/.test(before)) continue // Aufruf an einem Objekt: keine Deklaration
    occurrences.push(i)
  }
  const decls = occurrences.filter(i => DECL_WORDS.test(masked[i]!) && !/\bnew\s+\w*$/.test(masked[i]!))
  const make = (i: number): Treffer => ({
    datei,
    start: i + 1,
    ende: estimateEnd(lines, i + 1, syms, lang),
    signatur: sig(lines[i]!),
    geschaetzt: true,
    quelle: 'suche',
    name: q.name,
  })
  if (decls.length === 1) return make(decls[0]!)
  const pool = decls.length > 1 ? decls : occurrences
  return { kandidaten: pool.slice(0, 10).map(make) }
}
