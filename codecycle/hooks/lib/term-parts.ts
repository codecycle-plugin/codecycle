// Terminal-Aussehen von Bautafel, Seitenleiste und Fußzeile: reine Teile ohne `$` und ohne Elemente, damit sie unter
// node:test prüfbar sind. Die Elemente (Text, Box, Button) bauen hooks/band.tsx und hooks/panel.tsx daraus.
// Nur fürs Terminal; die Desktop-App bleibt unverändert.

import type { AgentStatus } from '../../types'

// ---- Farben und Balken -----------------------------------------------------------------------------------------------

/** Ampelfarbe (Grundfarben): grün, gelb ab 60 %, rot ab 85 % (Schwellen aus dem Muster) */
export function levelColor(pct: number): 'green' | 'yellow' | 'red' {
  return pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green'
}

/**
 * Balken aus ━ (gefüllt, farbig gezeichnet) und ─ (Rest, gedimmt) mit genau `width` Zeichen; ohne Wert alles Rest.
 * Ersetzt im Terminal die Blöcke █░ (hooks/state.ts :: bar, Desktop-Alt-Text und alte Textzeilen).
 */
export function barSegments(pct: number | null, width: number): { filled: string; rest: string } {
  const w = Math.max(0, Math.round(width))
  const n = pct === null || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(w, Math.round((pct / 100) * w)))
  return { filled: '━'.repeat(n), rest: '─'.repeat(w - n) }
}

/** Kostenbalken: Länge im Verhältnis zum größten Wert, mindestens ein Zeichen (Muster: „Kosten pro Rolle“) */
export function costBarLength(prozent: number, max: number, width: number): number {
  if (!(max > 0) || !(prozent > 0)) return 1
  return Math.max(1, Math.min(width, Math.round((prozent / max) * width)))
}

/** Gedimmte Linie unter einer Überschrift, mindestens ein Zeichen */
export function rule(width: number): string {
  return '─'.repeat(Math.max(1, Math.round(width)))
}

/** Prozentwert mit einer Nachkommastelle und Komma („6,4“) */
export function comma(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

// ---- Breiten ---------------------------------------------------------------------------------------------------------

/** Spalten, ab denen die Seitenleiste breit ist und Tokens zeigt (Breite − 3 ≥ 56, also ab 59 Spalten) */
export const WIDE_COLUMNS = 59

/** Nutzbare Breite der Seitenleiste: rechts zwei Spalten Abstand (paddingRight) und eine Reserve, mindestens 30 */
export function paneWidth(bodyColumns: number): number {
  return Math.max(30, (bodyColumns || 46) - 3)
}

/** Breite Seitenleiste? (Tokens bei Agenten und Kosten) */
export function isWide(bodyColumns: number): boolean {
  return paneWidth(bodyColumns) >= WIDE_COLUMNS - 3
}

/** Breite der Bautafel im Rahmen (die Engine zieht ihre fünf Spalten für das [-] schon ab), mindestens 40 */
export function bandWidth(bodyColumns: number): number {
  return Math.max(40, bodyColumns || 100)
}

/**
 * Teile einer Zeile mit „ · “ verbinden, so dass sie in `width` Zeichen passen: statt am Ende abzuschneiden fällt
 * zuerst der Teil mit der höchsten `prio`-Zahl weg (bei Gleichstand der hintere), die Reihenfolge bleibt. Leere
 * Teile zählen nicht. Passt auch der wichtigste Teil allein nicht, bleibt er stehen (abschneiden macht der Text).
 * Anlass: In der schmalen Leiste wurden „Konto ≈ 0,…“ und sogar „gew.“ abgeschnitten.
 */
export function fitParts(parts: readonly { text: string; prio: number }[], width: number): string {
  const keep = parts.filter(p => p.text !== '')
  const len = (list: readonly { text: string }[]) => [...list.map(p => p.text).join(' · ')].length
  while (keep.length > 1 && len(keep) > width) {
    let drop = 0
    keep.forEach((p, i) => {
      if (p.prio >= keep[drop]!.prio) drop = i
    })
    keep.splice(drop, 1)
  }
  return keep.map(p => p.text).join(' · ')
}

/** „1 Lauf“, „2 Läufe“ */
export function runsCount(n: number): string {
  return `${n} ${n === 1 ? 'Lauf' : 'Läufe'}`
}

// ---- Rahmen der Bautafel ---------------------------------------------------------------------------------------

/** Titel im oberen Rand der Bautafel */
export const FRAME_TITLE = 'codecycle'

/**
 * Oberer Rand „╭─ codecycle ─────╮“ in drei Teilen (links, Titel, rechts), zusammen genau `width` Zeichen: Eine gekürzte
 * Zeile bekäme sonst ein „…“ ans Ende (Muster, Live-Befund). Der Titel wird in der Farbe des Modells gezeichnet.
 */
export function frameTop(width: number, title = FRAME_TITLE): { left: string; title: string; right: string } {
  const left = '╭─ '
  const right = ` ${'─'.repeat(Math.max(1, width - left.length - title.length - 2))}╮`
  return { left, title, right }
}

/** Unterer Rand „╰────╯“ mit genau `width` Zeichen */
export function frameBottom(width: number): string {
  return `╰${'─'.repeat(Math.max(0, width - 2))}╯`
}

/** Seitenstriche einer Zeile im Rahmen (links mit, rechts vor dem Strich ein Leerzeichen) */
export const FRAME_LEFT = '│ '
export const FRAME_RIGHT = ' │'

/**
 * Zeilen im Rahmen der vollen Bautafel: mit Leerzeile zwischen den Zeilen und Leerzeile über dem Rahmen,
 * soweit `maxRows` (Zeilen, die die Engine der Bautafel gibt) reicht; zuerst fällt die Leerzeile oben weg, reicht das
 * nicht, die Zwischenzeilen (die Leerzeile oben kommt dann zurück, wenn sie passt). Rückfall für kleine Fenster, kein eigener Entscheid: sonst schnitte die Engine den unteren Rand ab.
 */
export function bandSpacing(contentRows: number, maxRows: number): { gaps: boolean; marginTop: boolean } {
  const frame = 2
  const gaps = Math.max(0, contentRows - 1)
  if (frame + contentRows + gaps + 1 <= maxRows) return { gaps: true, marginTop: true }
  if (frame + contentRows + gaps <= maxRows) return { gaps: true, marginTop: false }
  return { gaps: false, marginTop: frame + contentRows + 1 <= maxRows }
}

/** Zuklapp- und Aufklapp-Knopf der Bautafel („[×]“ als schlichter Knopf mit Klammern im Text) */
export const COLLAPSE_LABEL = '[×]'
export const EXPAND_LABEL = '[▴]'

// ---- Zeichen (Schritt 6: nur einfach breite Zeichen, Windows Terminal zeichnet ⚠ ✖ ✕ doppelt breit) --------------

/** Zeichen vor einem Hinweis (statt ⚠) */
export const HINT_GLYPH = '▲'

/** Statuszeichen eines Agenten im Terminal (Statusspalte der Seitenleiste; Farbe auch für seinen Balken) */
export const TERM_STATUS: Record<AgentStatus, { glyph: string; color: 'yellow' | 'green' | 'red' }> = {
  laeuft: { glyph: '●', color: 'yellow' },
  fertig: { glyph: '✓', color: 'green' },
  abgebrochen: { glyph: '✗', color: 'red' },
}

/** ▎-Balken links für Hinweise und Blocker, als Zeichen je Zeile (borderStyle `quote` zeichnete oben und unten eine Randzeile) */
export function quoteLines(lines: readonly string[]): string[] {
  return lines.map(l => `▎ ${l}`)
}

// ---- Hinweise mit Art und Rangfolge -------------------------------------------------------------------------

/** Art eines Hinweises: Einrichtung (Setup, Node), Plugin- oder Werkzeug-Update, alles andere */
export type HintKind = 'setup' | 'update' | 'sonstig'
export type Hint = { art: HintKind; text: string }

/**
 * Feste Rangfolge (Hinweise zu Setup und Updates haben immer Vorrang): 1. Setup, 2. Update, 3. alles andere; stabil
 * innerhalb eines Rangs.
 */
export const HINT_RANK: Record<HintKind, number> = { setup: 1, update: 2, sonstig: 3 }

export function rankHints(list: readonly Hint[]): Hint[] {
  return list
    .map((h, i) => ({ h, i }))
    .sort((a, b) => HINT_RANK[a.h.art] - HINT_RANK[b.h.art] || a.i - b.i)
    .map(x => x.h)
}

/** Zusatz hinter dem ersten Hinweis der Bautafel */
export function moreHintsText(n: number): string {
  return n > 0 ? `+${n} weitere unter Details` : ''
}

/** Anzahl der Hinweise in der eingeklappten Bautafel */
export function hintCountText(n: number): string {
  return `${HINT_GLYPH} ${n} ${n === 1 ? 'Hinweis' : 'Hinweise'}`
}

// ---- Modell und Effort der Hauptsitzung (Fußzeile) ----------------------------------------------------

/** „claude-opus-5-5[1m]“ → „Opus 5.5“, „opus“ → „Opus“; Unbekanntes bleibt, wie es kommt */
export function modelLabel(raw: string): string {
  // höchstens zweistellige Versionsteile: ein Datumssuffix („-20250514“) ist keine Nachkommastelle
  const m = raw.toLowerCase().match(/(haiku|sonnet|opus|fable)(?:[-\s]?(\d{1,2})(?!\d)(?:[-.](\d{1,2})(?!\d))?)?/)
  if (!m) return raw
  const name = m[1]![0]!.toUpperCase() + m[1]!.slice(1)
  return m[2] ? `${name} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : name
}

/** Schlüssel des Modells in `modelSettings` der Einstellungen: volle ID ohne Zusatz in Klammern („[1m]“) */
export function modelKey(raw: string): string {
  return raw.replace(/\[.*\]$/, '')
}

/**
 * Standard-Effort des Modells laut Doku (model-config, „Adjust effort level“): `medium` für Opus/Sonnet/Haiku 5.5,
 * `xhigh` für Opus 4.7, sonst `high`. Eine Vorgabe der Organisation ist nicht berücksichtigt (wie im Muster).
 */
export function modelDefaultEffort(raw: string): string {
  const m = raw.toLowerCase()
  if (/(opus|sonnet|haiku)[-\s]?5[-.]5/.test(m)) return 'medium'
  if (/opus[-\s]?4[-.]7/.test(m)) return 'xhigh'
  return 'high'
}

/** Gilt `effortLevel` aus den Einstellungen für dieses Modell? Laut Doku nicht für Opus 5.5 und neuere (vereinfacht: 5.5) */
export function usesEffortLevel(raw: string): boolean {
  return !/5[-.]5/.test(raw)
}

export const EFFORT_LABEL: Record<string, string> = { low: 'niedrig', medium: 'mittel', high: 'hoch', xhigh: 'sehr hoch', max: 'max' }

/** Deutsche Beschriftung einer Stufe; eine Zahl (Budget) bleibt Zahl, Unbekanntes bleibt, wie es kommt */
export function effortLabel(v: string | number): string {
  return typeof v === 'number' ? String(v) : (EFFORT_LABEL[v] ?? String(v))
}

/** Stufe aus den Argumenten von `/effort` („/effort high“), sonst undefined (Regler ohne Stufe) */
export function effortFromArgs(args: string): string | undefined {
  return args.match(/\b(low|medium|high|xhigh|max)\b/i)?.[1]?.toLowerCase()
}

/** Gespeicherte Stufe des Modells: `modelSettings[<ID ohne [1m]>].effortLevel`, sonst unter der vollen ID */
export function savedEffortOf(settings: Readonly<Record<string, unknown>>, raw: string): string | undefined {
  const ms = settings.modelSettings
  if (!ms || typeof ms !== 'object') return undefined
  const table = ms as Record<string, { effortLevel?: unknown } | undefined>
  const pick = (k: string) => {
    const v = table[k]?.effortLevel
    return typeof v === 'string' && v !== '' ? v : undefined
  }
  return pick(modelKey(raw)) ?? pick(raw)
}

/**
 * Startwert des Efforts, solange keine Anfrage ihn gemessen hat (gedimmt gezeigt), in der Reihenfolge der Doku:
 * `CLAUDE_CODE_EFFORT_LEVEL` (außer `auto`), gespeicherte Stufe des Modells, `effortLevel` (nicht für 5.5), Standard des
 * Modells. Liefert die rohe Stufe (low … max).
 */
export function startEffortOf(i: { env?: string | undefined; saved?: string | undefined; effortLevel?: unknown; model: string }): string {
  if (i.env && i.env !== 'auto') return i.env
  if (i.saved) return i.saved
  if (usesEffortLevel(i.model) && typeof i.effortLevel === 'string' && i.effortLevel !== '') return i.effortLevel
  return modelDefaultEffort(i.model)
}

/** Stand der gespeicherten Stufe für den Vergleich im 2-s-Takt: „<Modell ohne [1m]>:<Stufe>“ */
export function savedMark(raw: string, saved: string | undefined): string {
  return `${modelKey(raw)}:${saved ?? ''}`
}

/**
 * Hat sich die gespeicherte Stufe desselben Modells geändert? (2-s-Takt) Nur ein Wechsel zählt, nicht der erste
 * Stand und nicht ein Modellwechsel; eine gelöschte Stufe übernimmt der Takt nicht.
 */
export function savedChanged(before: string | undefined, raw: string, saved: string | undefined): boolean {
  if (before === undefined || !saved) return false
  return before.startsWith(`${modelKey(raw)}:`) && before !== savedMark(raw, saved)
}
