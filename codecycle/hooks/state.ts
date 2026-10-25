// Mod-Hilfen: Limits, Beispieldaten; STATE.md lesen kommt aus lib/.

import type { Board, Limits, RoleCost } from '../types'
import { parseState as parseTaskState, pickActive, pickLatest } from '../lib/state-file.ts'

export { pickActive, pickLatest }

export const NO_LIMITS: Limits = { fuenfStunden: null, woche: null }

/** Übersetzt die Fenster der API (`five_hour`, `seven_day`) in Limits. */
export function limitsFrom(rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): Limits {
  const five = rateLimits.find(r => r.kind === 'five_hour')
  const week = rateLimits.find(r => r.kind === 'seven_day')
  return {
    fuenfStunden: five ? five.percentUsed : null,
    woche: week ? week.percentUsed : null,
    resetFuenf: five?.resetsAt,
    resetWoche: week?.resetsAt,
  }
}

/**
 * Letzter bekannter Limit-Stand für neue Sitzungen: `stand` = Messzeit (Ortszeit),
 * `neuFuenf`/`neuWoche` = Reset-Zeit eines Fensters, das seit der Messung schon zurückgesetzt wurde (dann ohne Zahl).
 */
export interface ShownLimits {
  lim: Limits
  stand: string
  neuFuenf?: string
  neuWoche?: string
}

/** Liest den in `$.store` abgelegten Stand `{ at, limits }`; undefined bei ungültigem oder leerem Eintrag. Reine Funktion. */
export function staleLimits(stored: unknown, now: number): ShownLimits | undefined {
  const s = stored as { at?: unknown; limits?: Record<string, unknown> | null } | null | undefined
  if (!s || typeof s.at !== 'number' || !s.limits || typeof s.limits !== 'object') return undefined
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
  const asOf = new Date(now)
  const fuenf = num(s.limits.fuenfStunden)
  const woche = num(s.limits.woche)
  if (fuenf === null && woche === null) return undefined
  const resetFuenf = str(s.limits.resetFuenf)
  const resetWoche = str(s.limits.resetWoche)
  // Fenster schon zurückgesetzt: die alte Zahl gilt nicht mehr
  const over = (iso: string | undefined) => iso !== undefined && Date.parse(iso) <= now
  const neuFuenf = fuenf !== null && over(resetFuenf) ? resetText(resetFuenf, asOf) : undefined
  const neuWoche = woche !== null && over(resetWoche) ? resetText(resetWoche, asOf) : undefined
  return {
    lim: {
      fuenfStunden: neuFuenf ? null : fuenf,
      woche: neuWoche ? null : woche,
      ...(resetFuenf ? { resetFuenf } : {}),
      ...(resetWoche ? { resetWoche } : {}),
    },
    stand: resetText(new Date(s.at).toISOString(), asOf),
    ...(neuFuenf ? { neuFuenf } : {}),
    ...(neuWoche ? { neuWoche } : {}),
  }
}

export function percent(value: number | null): string {
  return value === null ? '–' : `${Math.round(value)} %`
}

/** „18:40“ für heute, sonst „Mo 18:40“; leer ohne Wert. */
export function resetText(iso: string | undefined, now = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hm
  return `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]} ${hm}`
}

export const SAMPLE_BOARD: Board = {
  quelle: 'beispiel',
  aufgabe: 'einkaufsliste-teilen',
  art: 'feature',
  groesse: 'gross',
  zustand: 'in-arbeit',
  branch: 'codecycle/einkaufsliste-teilen',
  budget: { geplant: 11, verbraucht: 6, nachlauf: 0 },
  zuletzt: '2026-10-07',
  naechsterSchritt: ['Teil Oberfläche bauen.'],
  offeneFragen: ['Sollen geteilte Listen auch offline bearbeitbar sein?'],
  blocker: ['Teil Freigabe wartet auf die Datenbank-Migration.'],
  kosten: sampleCosts(),
}

/**
 * Keine offene Aufgabe (in der Praxis beobachtet): statt Beispieldaten eine leere Ansicht.
 * `loadBoard` ergänzt `letzte` und deren Zahlen, wenn es fertige Aufgaben gibt.
 */
export const EMPTY_BOARD: Board = {
  quelle: 'leer',
  aufgabe: 'keine offene Aufgabe',
  art: '',
  groesse: '',
  zustand: '',
  branch: '',
  budget: { geplant: 0, verbraucht: 0, nachlauf: 0 },
  zuletzt: '',
  naechsterSchritt: [],
  offeneFragen: [],
  blocker: [],
  kosten: [],
}

function sampleCosts(): RoleCost[] {
  return [
    { rolle: 'plan-reviewer', prozent: 1.8 },
    { rolle: 'builder', prozent: 6.5 },
    { rolle: 'final-reviewer', prozent: 3.2 },
  ]
}

/**
 * Statuszeile, kurz: ohne Präfix „codecycle“, den Plugin-Namen zeigt Claude Code
 * schon davor. Ohne offene Aufgabe nur das 5-Stunden-Fenster.
 */
export function statusText(limits: Limits, board: Board, alt?: ShownLimits): string {
  let five = limits.fuenfStunden === null ? '–' : `${Math.round(limits.fuenfStunden)}%`
  // alter Stand (neue Sitzung ohne frischen Wert): gekennzeichnet, nie als frischer Messwert
  if (alt?.neuFuenf) five = `neu seit ${alt.neuFuenf}`
  else if (alt && limits.fuenfStunden !== null) five += ` (Stand ${alt.stand})`
  const head = `5h ${five}`
  if (board.quelle === 'leer') return head
  return `${head} · ${board.aufgabe}`
}

export function bar(value: number | null, width = 10): string {
  if (value === null) return '·'.repeat(width)
  const filled = Math.max(0, Math.min(width, Math.round((value / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** STATE.md lesen; die Kosten kommen aus costs.json (Token-Buch) und werden vom Aufrufer ergänzt. */
export function parseState(text: string, quelle: string): Board {
  return { ...parseTaskState(text, quelle), kosten: [] }
}
