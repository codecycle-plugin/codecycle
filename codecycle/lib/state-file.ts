// STATE.md lesen. Reiner Code ohne Node und ohne Mod-API:
// geladen vom Mod (hooks/) und vom Projekt-Werkzeug (tool/).
// Bewusst ein kleiner Leser nur für dieses Format, ohne Fremdbibliothek.

import type { TaskState } from '../types'

export const DONE_STATES: readonly string[] = ['fertig', 'verworfen']

type Scalar = string | number | null

function scalar(raw: string): Scalar {
  const t = raw.trim()
  // Anführungszeichen nur als Paar entfernen; ein Wert in Anführungszeichen bleibt Text
  const quoted = t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.at(-1) === t[0]
  if (quoted) return t.slice(1, -1)
  if (t === '' || t === 'null' || t === '~') return null
  // keine führende Null: ein Commit wie `0123abc` oder `0123456` bleibt Text
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(t)) return Number(t)
  return t
}

/** Teilt an Kommas, aber nicht innerhalb von Anführungszeichen. */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = []
  let quote = ''
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      // wie in stripComment: nur am Anfang eines Werts
      const prev = inner.slice(start, i).trimEnd().at(-1)
      if (prev === ':' || prev === undefined) quote = c
    } else if (c === ',') {
      parts.push(inner.slice(start, i))
      start = i + 1
    }
  }
  parts.push(inner.slice(start))
  return parts
}

/** Schneidet einen Kommentar (` #…`) ab, aber nicht innerhalb eines Werts in Anführungszeichen. */
function stripComment(line: string): string {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      // nur am Anfang eines Werts (nach `:`, `,` oder `{`), damit ein Apostroph im Text nicht zählt
      const prev = line.slice(0, i).trimEnd().at(-1)
      if (prev === ':' || prev === ',' || prev === '{') quote = c
    } else if (c === '#' && i > 0 && /\s/.test(line[i - 1]!)) {
      return line.slice(0, i)
    }
  }
  return line
}

function flowMap(raw: string): Record<string, Scalar> {
  const inner = raw.trim().replace(/^\{|\}$/g, '')
  const out: Record<string, Scalar> = {}
  for (const part of splitTopLevel(inner)) {
    const i = part.indexOf(':')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = scalar(part.slice(i + 1))
  }
  return out
}

function str(v: Scalar | undefined, fallback = ''): string {
  return v === null || v === undefined ? fallback : String(v)
}

function num(v: Scalar | undefined): number {
  return typeof v === 'number' ? v : Number(v) || 0
}

function sectionItems(lines: string[]): string[] {
  const kept = lines.map(l => l.trim()).filter(l => l !== '' && !l.startsWith('>'))
  // Hat der Abschnitt Listenpunkte, zählen nur diese: Erklärsätze der Vorlage über „- keine“ sind keine Einträge
  // (Desktop-Aussehen, Live 0.15.3). Ohne Listenpunkte gilt der Freitext (z. B. „Nächster Schritt“).
  const bullets = kept.filter(l => /^[-*]\s+/.test(l))
  return (bullets.length > 0 ? bullets : kept).map(l => l.replace(/^[-*]\s+/, '')).filter(l => !/^(keine|keiner|-|…)$/i.test(l))
}

/** Stand eines Teils aus `teile:`: `offen`, `fertig` oder `in-arbeit <branch>` (der Branch, auf dem der Teil gebaut wird). */
function partOf(name: string, raw: string): { name: string; status: string; branch?: string } {
  const [status = 'offen', ...rest] = raw.trim().split(/\s+/)
  const branch = rest.join(' ')
  return branch ? { name, status, branch } : { name, status }
}

/** Wert für `teile:` im Kopf von STATE.md: `{ a: fertig, b: in-arbeit codecycle/x--b, c: offen }`; der Branch nur bei `in-arbeit`. */
export function partsField(parts: readonly { name: string; status: string; branch?: string | undefined }[]): string {
  return `{ ${parts.map(p => `${p.name}: ${p.status}${p.status === 'in-arbeit' && p.branch ? ` ${p.branch}` : ''}`).join(', ')} }`
}

/** Liest eine STATE.md; wirft, wenn der YAML-Kopf fehlt oder `aufgabe` leer ist. */
export function parseState(text: string, quelle: string): TaskState {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') throw new Error('STATE.md ohne YAML-Kopf')
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) throw new Error('STATE.md: YAML-Kopf nicht geschlossen')

  // Nur Schlüssel ohne Einrückung; eingerückte Zeilen (etwa Listen unter `pakete:` in alten STATE.md) bleiben unbeachtet
  const head: Record<string, string> = {}
  for (const rawLine of lines.slice(1, end)) {
    const kv = stripComment(rawLine).match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) head[kv[1]!] = kv[2]!.trim()
  }

  const sections: Record<string, string[]> = {}
  let current = ''
  for (const line of lines.slice(end + 1)) {
    const h = line.match(/^##\s+(.*)$/)
    if (h) {
      current = h[1]!.trim().toLowerCase()
      sections[current] = []
    } else if (current) {
      sections[current]!.push(line)
    }
  }

  const aufgabe = str(scalar(head.aufgabe ?? ''))
  if (aufgabe === '') throw new Error('STATE.md: `aufgabe` fehlt')
  const budget = flowMap(head.budget ?? '{}')

  return {
    quelle,
    aufgabe,
    art: str(scalar(head.art ?? '')),
    groesse: str(scalar(head.groesse ?? '')),
    zustand: str(scalar(head.zustand ?? '')),
    branch: str(scalar(head.branch ?? '')),
    budget: { geplant: num(budget.geplant), verbraucht: num(budget.verbraucht), nachlauf: num(budget.nachlauf) },
    zuletzt: str(scalar(head.zuletzt ?? '')),
    // `weg: solo`; fehlt oder anderer Wert = Aufgabe aus dem alten Ablauf
    weg: str(scalar(head.weg ?? '')) === 'solo' ? 'solo' : 'voll',
    geprueftAuf: str(scalar(head.geprueftAuf ?? '')),
    haltepunkt: num(scalar(head.haltepunkt ?? '0')),
    zweitpruefung: str(scalar(head.zweitpruefung ?? '')),
    teile: Object.entries(flowMap(head.teile ?? '{}')).map(([name, v]) => partOf(name, str(v, 'offen'))),
    naechsterSchritt: sectionItems(sections['nächster schritt'] ?? []),
    offeneFragen: sectionItems(sections['offene fragen'] ?? []),
    blocker: sectionItems(sections['blocker'] ?? []),
  }
}

/**
 * Setzt ein einfaches Feld im YAML-Kopf (`schluessel: wert`): ersetzt die vorhandene Zeile, sonst steht die neue
 * Zeile am Ende des Kopfs. Kommentar und Rest der Datei bleiben unverändert; wirft ohne YAML-Kopf.
 */
export function withHeadField(text: string, key: string, value: string): string {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') throw new Error('STATE.md ohne YAML-Kopf')
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) throw new Error('STATE.md: YAML-Kopf nicht geschlossen')
  const line = `${key}: ${value}`
  const at = lines.findIndex((l, i) => i > 0 && i < end && l.startsWith(`${key}:`))
  if (at >= 0) lines[at] = line
  else lines.splice(end, 0, line)
  return lines.join(nl)
}

/** Wählt die aktive Aufgabe: nicht fertig/verworfen, zuletzt geändert zuerst. */
export function pickActive<T extends TaskState>(states: T[]): T | undefined {
  return states
    .filter(s => !DONE_STATES.includes(s.zustand))
    .sort((a, b) => b.zuletzt.localeCompare(a.zuletzt) || b.quelle.localeCompare(a.quelle))[0]
}

/** Die zuletzt bearbeitete Aufgabe, auch fertige oder verworfene (Anzeige „zuletzt: …“, wenn keine offen ist). */
export function pickLatest<T extends TaskState>(states: T[]): T | undefined {
  return [...states].sort((a, b) => b.zuletzt.localeCompare(a.zuletzt) || b.quelle.localeCompare(a.quelle))[0]
}

/**
 * Darf der Mod Token-Buch und Register dieser Aufgabe schreiben? Nur, solange ihre `STATE.md`
 * da ist und nicht auf `fertig`/`verworfen` steht: Nach dem Abschluss bleiben die Buchdateien unverändert (der
 * Arbeitsbaum wird sauber), Bücher alter Aufgaben werden nie neu geschrieben, und nach dem Wechsel auf einen
 * Branch ohne diesen Aufgabenordner entsteht dort keine neue Datei. Unlesbare `STATE.md`: schreiben (keine
 * Buchung verlieren).
 */
export function bookWritable(stateText: string | null): boolean {
  if (stateText === null) return false
  try {
    return !DONE_STATES.includes(parseState(stateText, 'STATE.md').zustand)
  } catch {
    return true
  }
}
