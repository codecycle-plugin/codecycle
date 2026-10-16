// Abschnitt für das Kontextpaket um eine Fundstelle. Rein: kein Node, keine Mod-API, kein Dateizugriff.

import { CLASS_LIKE, languageOf, outline, splitLines } from './outline.ts'
import type { Lang } from './outline.ts'
import type { Treffer } from './locate.ts'

/** Ab so vielen Zeilen wird nicht mehr die ganze Datei geliefert (Startwert zum Messen). */
export const SMALL_FILE_LINES = 150

// ---------------------------------------------------------------------------
// Kontextpaket

/** Letzte Zeile (1-basiert) des Dateikopfs: Imports, Namespace, Paket (höchstens in den ersten 60 Zeilen). */
function headEnd(lines: string[], lang: Lang | null): number {
  let last = 0
  let inGroup = false
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const l = lines[i]!
    const t = l.trim()
    if (t === '' || /^(\/\/|\/\*|\*|#(?!\[))/.test(t)) {
      continue
    }
    const startsHead = /^(<\?php|#!|namespace\b|use\b|import\b|from\b|package\b|require(_once)?\b|include(_once)?\b|declare\b|['"]use strict['"])/.test(t) ||
      /^(const|let|var)\s+.*=\s*require\(/.test(t)
    if (inGroup) {
      last = i + 1
      if (/[)}]\s*(from\s+.*)?;?\s*$/.test(t) && !/,\s*$/.test(t)) inGroup = false
      continue
    }
    if (!startsHead) break
    last = i + 1
    // mehrzeilige Importe: `import {` / `import (` / `use X\{`
    if (/[{(]\s*$/.test(t) || (lang === 'go' && /\(\s*$/.test(t))) inGroup = true
  }
  return last
}

type Segment = [number, number]

function merge(segments: Segment[]): Segment[] {
  const sorted = segments.filter(s => s[0] <= s[1]).sort((a, b) => a[0] - b[0])
  const out: Segment[] = []
  for (const s of sorted) {
    const prev = out[out.length - 1]
    if (prev && s[0] <= prev[1] + 2) prev[1] = Math.max(prev[1], s[1]) // Lücke bis 2 Zeilen: lieber mitnehmen
    else out.push([s[0], s[1]])
  }
  return out
}

/**
 * Baut den Abschnitt für das Kontextpaket: Kopf der Datei
 * (Imports/Namespace), die Zeile der umschließenden Klasse, das Symbol selbst und
 * `umfeldZeilen` Zeilen davor und danach. Dateien bis SMALL_FILE_LINES Zeilen kommen ganz.
 * Rückgabe: Text mit Kopfzeile `datei:start-ende  signatur` und Codeblock.
 */
export function buildContextSection(inhalt: string, treffer: Treffer, umfeldZeilen: number): string {
  const lines = splitLines(inhalt)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop() // Zeilenumbruch am Dateiende
  const n = lines.length
  const lang = languageOf(treffer.datei)
  const note = treffer.geschaetzt ? ' [Bereich geschätzt]' : ''
  const header = `${treffer.datei}:${treffer.start}-${treffer.ende}  ${treffer.signatur}${note}`
  const fence = '```'
  if (n <= SMALL_FILE_LINES) {
    return `${header}\n(ganze Datei, ${n} Zeilen)\n${fence}\n${lines.join('\n')}\n${fence}`
  }
  const start = Math.min(Math.max(treffer.start, 1), n)
  const ende = Math.min(Math.max(treffer.ende, start), n)
  const segments: Segment[] = [[Math.max(1, start - umfeldZeilen), Math.min(n, ende + umfeldZeilen)]]
  const head = headEnd(lines, lang)
  if (head > 0) segments.push([1, head])
  // umschließende Klasse: ihre Deklarationszeile gibt den Zusammenhang
  const cls = outline(inhalt, treffer.datei)
    .filter(s => CLASS_LIKE.has(s.kind) && s.start < start && s.ende >= ende)
    .sort((a, b) => b.start - a.start)[0]
  if (cls) segments.push([cls.start, cls.start])
  const parts: string[] = []
  let prevEnd = 0
  for (const [a, b] of merge(segments)) {
    if (prevEnd > 0 && a > prevEnd + 1) parts.push(`⋯ Zeilen ${prevEnd + 1}-${a - 1} ausgelassen ⋯`)
    parts.push(lines.slice(a - 1, b).join('\n'))
    prevEnd = b
  }
  if (prevEnd < n) parts.push(`⋯ Zeilen ${prevEnd + 1}-${n} ausgelassen ⋯`)
  return `${header}\n${fence}\n${parts.join('\n')}\n${fence}`
}
