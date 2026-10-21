// STATE.md lesen. Reiner Code ohne Node und ohne Mod-API:
// geladen vom Mod (hooks/) und vom Projekt-Werkzeug (tool/).
// Bewusst ein kleiner Leser nur für dieses Format, ohne Fremdbibliothek.

import type { Package, PackageStatus, TaskState } from '../types'

export const DONE_STATES: readonly string[] = ['fertig', 'verworfen']

const STATUSES: PackageStatus[] = ['offen', 'in-arbeit', 'fertig', 'blockiert']

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

/** Liest eine STATE.md; wirft, wenn der YAML-Kopf fehlt oder `aufgabe` leer ist. */
export function parseState(text: string, quelle: string): TaskState {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') throw new Error('STATE.md ohne YAML-Kopf')
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) throw new Error('STATE.md: YAML-Kopf nicht geschlossen')

  const head: Record<string, string> = {}
  // Pakete im Format der Vorlage (`- { id: P1, … }`) oder im Blockstil
  // (`- id: P1` und darunter eingerückt `rolle: …`), falls ein Agent so schreibt
  const items: Record<string, Scalar>[] = []
  let inList = ''
  for (const rawLine of lines.slice(1, end)) {
    const line = stripComment(rawLine)
    if (line.trim() === '') continue
    if (inList === 'pakete' && /^\s/.test(line)) {
      const flow = line.match(/^\s+-\s+(\{.*\})\s*$/)
      const blockStart = line.match(/^\s+-\s+([A-Za-z_][\w-]*):\s*(.*)$/)
      const blockMore = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.*)$/)
      if (flow) items.push(flowMap(flow[1]!))
      else if (blockStart) items.push({ [blockStart[1]!]: scalar(blockStart[2]!) })
      else if (blockMore && items.length > 0) items.at(-1)![blockMore[1]!] = scalar(blockMore[2]!)
      continue
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) {
      inList = kv[2]!.trim() === '' ? kv[1]! : ''
      head[kv[1]!] = kv[2]!.trim()
    }
  }
  const pakete: Package[] = items.map((m, i) => {
    const status = str(m.status, 'offen') as PackageStatus
    return {
      id: str(m.id, `P${i + 1}`),
      rolle: str(m.rolle, '?'),
      status: STATUSES.includes(status) ? status : 'offen',
      agent: m.agent === null || m.agent === undefined ? null : String(m.agent),
      commit: m.commit === null || m.commit === undefined ? null : String(m.commit),
      runden: num(m.runden),
    }
  })

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
    planrunden: num(scalar(head.planrunden ?? '0')),
    zuletzt: str(scalar(head.zuletzt ?? '')),
    // Solo-Weg: `weg: solo`; fehlt oder anderer Wert = voller Ablauf
    weg: str(scalar(head.weg ?? '')) === 'solo' ? 'solo' : 'voll',
    geprueftAuf: str(scalar(head.geprueftAuf ?? '')),
    haltepunkt: num(scalar(head.haltepunkt ?? '0')),
    pakete,
    naechsterSchritt: sectionItems(sections['nächster schritt'] ?? []),
    offeneFragen: sectionItems(sections['offene fragen'] ?? []),
    blocker: sectionItems(sections['blocker'] ?? []),
  }
}

/**
 * Setzt ein einfaches Feld im YAML-Kopf (`schluessel: wert`): ersetzt die vorhandene Zeile, sonst steht die neue
 * Zeile vor `pakete:` bzw. am Ende des Kopfs. Kommentar und Rest der Datei bleiben unverändert; wirft ohne YAML-Kopf.
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
  else {
    const pakete = lines.findIndex((l, i) => i > 0 && i < end && /^pakete:/.test(l))
    lines.splice(pakete >= 0 ? pakete : end, 0, line)
  }
  return lines.join(nl)
}

/**
 * Setzt ein Feld eines Pakets in der Liste `pakete:` (Blockstil der Vorlage oder `- { id: P1, … }`): ersetzt den Wert
 * und behält einen Kommentar dahinter, sonst kommt das Feld als letzte Zeile des Pakets dazu. Wirft, wenn das Paket fehlt.
 */
export function withPackageField(text: string, id: string, key: string, value: string): string {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') throw new Error('STATE.md ohne YAML-Kopf')
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) throw new Error('STATE.md: YAML-Kopf nicht geschlossen')
  const list = lines.findIndex((l, i) => i > 0 && i < end && /^pakete:\s*$/.test(stripComment(l)))
  if (list < 0) throw new Error('STATE.md: keine Liste `pakete:`')
  const idOf = (l: string): string | null => {
    const flow = stripComment(l).match(/^\s+-\s+\{(.*)\}\s*$/)
    if (flow) return str(flowMap(`{${flow[1]}}`).id) || null
    const block = stripComment(l).match(/^\s+-\s+id:\s*(.*)$/)
    return block ? str(scalar(block[1]!)) : null
  }
  let i = list + 1
  for (; i < end; i++) {
    if (!/^\s/.test(lines[i]!) && lines[i]!.trim() !== '') break
    if (idOf(lines[i]!) === id) break
  }
  if (i >= end || idOf(lines[i]!) !== id) throw new Error(`STATE.md: Paket ${id} fehlt`)
  const flow = lines[i]!.match(/^(\s+-\s+)\{(.*)\}(\s*(?:#.*)?)$/)
  if (flow) {
    const parts = splitTopLevel(flow[2]!).map(x => x.trim()).filter(Boolean)
    const at = parts.findIndex(x => x.slice(0, x.indexOf(':')).trim() === key)
    if (at >= 0) parts[at] = `${key}: ${value}`
    else parts.push(`${key}: ${value}`)
    lines[i] = `${flow[1]}{ ${parts.join(', ')} }${flow[3]}`
    return lines.join(nl)
  }
  // Blockstil: Felder bis zum nächsten Listenpunkt bzw. bis zum Ende der Liste
  let last = i
  let indent = ''
  for (let j = i + 1; j < end; j++) {
    const l = lines[j]!
    if (l.trim() === '') continue
    if (!/^\s/.test(l) || /^\s+-\s/.test(l)) break
    last = j
    indent = l.match(/^(\s+)/)![1]!
    const m = l.match(/^(\s+)([A-Za-z_][\w-]*):(\s*)(.*)$/)
    if (m && m[2] === key) {
      const comment = stripComment(m[4]!).length < m[4]!.length ? m[4]!.slice(stripComment(m[4]!).trimEnd().length) : ''
      lines[j] = `${m[1]}${key}: ${value}${comment}`
      return lines.join(nl)
    }
  }
  if (indent === '') indent = `${lines[i]!.match(/^(\s+)-/)![1]}  `
  lines.splice(last + 1, 0, `${indent}${key}: ${value}`)
  return lines.join(nl)
}

/**
 * Hängt eine Zeile an einen Abschnitt `## <name>` an (legt ihn am Ende an, wenn er fehlt); ein Platzhalter
 * `- keine` im Abschnitt fällt dabei weg.
 */
export function withSectionLine(text: string, name: string, line: string): string {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const h = lines.findIndex(l => l.match(/^##\s+(.*?)\s*$/)?.[1] === name)
  if (h < 0) {
    while (lines.length > 0 && lines.at(-1)!.trim() === '') lines.pop()
    lines.push('', `## ${name}`, line, '')
    return lines.join(nl)
  }
  let next = lines.findIndex((l, i) => i > h && /^##\s/.test(l))
  if (next < 0) next = lines.length
  const empty = lines.findIndex((l, i) => i > h && i < next && /^[-*]\s+(keine|keiner)\s*$/i.test(l.trim()))
  if (empty >= 0) {
    lines.splice(empty, 1)
    next--
  }
  let at = next
  while (at > h + 1 && lines[at - 1]!.trim() === '') at--
  lines.splice(at, 0, line)
  return lines.join(nl)
}

/** Hängt eine Zeile an den Abschnitt „Verlauf“ an. */
export function withHistoryLine(text: string, line: string): string {
  return withSectionLine(text, 'Verlauf', line)
}

/** Wählt die aktive Aufgabe: nicht fertig/verworfen, zuletzt geändert zuerst. */
export function pickActive<T extends TaskState>(states: T[]): T | undefined {
  return states
    .filter(s => !DONE_STATES.includes(s.zustand))
    .sort((a, b) => b.zuletzt.localeCompare(a.zuletzt) || b.quelle.localeCompare(a.quelle))[0]
}

/** Das Paket, an dem gerade gearbeitet wird (für „P2/5“). */
export function currentPackage(state: TaskState): Package | undefined {
  return (
    state.pakete.find(p => p.status === 'in-arbeit') ??
    state.pakete.find(p => p.status === 'offen') ??
    state.pakete.at(-1)
  )
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
