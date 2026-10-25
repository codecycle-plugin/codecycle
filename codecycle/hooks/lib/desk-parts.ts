// Desktop-Aussehen: reine Teile ohne `$` und ohne Elemente, damit sie unter node:test prüfbar sind.
// Die Elemente (Box, Text, Button) baut hooks/desk.tsx.

import type { Limits } from '../../types'
import { resetText } from '../state.ts'

/** Ab hier zeichnet die Fußzeile ein Limit orange, ab `LIMIT_ALARM` rot (wie die App selbst, beobachtet) */
export const LIMIT_WARN = 75
export const LIMIT_ALARM = 90

/** Farbe eines Limits als Theme-Schlüssel: blau wie der Kontext-Kreis der App, orange wie der Kreis rechts in der Fußzeile ab 75 %, rot ab 90 % */
export function deskLimitColor(pct: number): 'suggestion' | 'claude' | 'error' {
  return pct >= LIMIT_ALARM ? 'error' : pct >= LIMIT_WARN ? 'claude' : 'suggestion'
}

/** Ein Limit der Fußzeile: Wert (null bei „neu seit“), Prozent und Reset als Text; die Fußzeile setzt den Reset in Klammern */
export type FooterPart = {
  key: 'fuenf' | 'woche'
  label: '5h' | 'W'
  value: number | null
  /** gerundet mit Einheit („42 %“); leer bei „neu seit“ */
  percent: string
  /** „neu seit HH:MM“, wenn das Fenster seit der Messung zurückgesetzt wurde */
  neu: string
  /** Reset „18:40“ oder „Mo 09:00“, nur beim 5-Stunden-Fenster; leer ohne Zeit und bei „neu seit“ */
  reset: string
}

/**
 * Stücke der Fußzeile in der Desktop-App, knapp für einen Platz von rund 25 Zeichen: „5h 42 % (↻18:40) │ W 84 %“.
 * Die Woche steht als „W“ und ohne Reset. Ein Fenster, das seit der letzten Messung schon zurückgesetzt wurde, steht als
 * „neu seit HH:MM“ ohne Zahl; ohne Wert entfällt das Stück.
 */
export function deskFooterParts(lim: Limits, alt?: { neuFuenf?: string; neuWoche?: string }, now = new Date()): FooterPart[] {
  const part = (key: FooterPart['key'], label: FooterPart['label'], value: number | null, iso: string | undefined, neu: string | undefined): FooterPart | null => {
    if (neu) return { key, label, value: null, percent: '', neu: `neu seit ${neu}`, reset: '' }
    if (value === null) return null
    return { key, label, value, percent: `${Math.round(value)} %`, neu: '', reset: resetText(iso, now) }
  }
  return [part('fuenf', '5h', lim.fuenfStunden, lim.resetFuenf, alt?.neuFuenf), part('woche', 'W', lim.woche, undefined, alt?.neuWoche)].filter(
    (p): p is FooterPart => p !== null,
  )
}

/** Erste Version von Claude Code, deren Mod-Elemente `Text.weight`, `size`, `tabular` und Abstandsstufen kennen */
export const RICH_TEXT_FROM = [2, 1, 299] as const

/**
 * Kennt die Engine `weight`, `size`, `tabular` und Abstandsstufen? Ältere Versionen weisen das ganze Zeichnen ab
 * (die Desktop-App brachte 2.1.295 mit, die Bautafel fehlte). Nicht lesbar: nein.
 */
export function supportsRichText(version: string | undefined): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  if (!m) return false
  const v = [Number(m[1]), Number(m[2]), Number(m[3])]
  for (let i = 0; i < 3; i++) {
    if (v[i]! !== RICH_TEXT_FROM[i]) return v[i]! > RICH_TEXT_FROM[i]!
  }
  return true
}

/** Lesbare Werte der STATE.md für die Kopfzeile der Seitenleiste; Unbekanntes bleibt wie es ist */
const TASK_WORDS: Record<string, string> = {
  feature: 'Feature',
  bugfix: 'Bugfix',
  refactoring: 'Refactoring',
  routine: 'Routine',
  review: 'Review',
  klein: 'klein',
  mittel: 'mittel',
  gross: 'groß',
  erfasst: 'erfasst',
  geklaert: 'geklärt',
  geplant: 'geplant',
  'in-arbeit': 'in Arbeit',
  geprueft: 'geprüft',
  fertig: 'fertig',
  verworfen: 'verworfen',
  blockiert: 'blockiert',
}

/** „feature · gross · in-arbeit“ → „Feature · groß · in Arbeit“; leere Werte entfallen */
export function taskMetaText(art: string, groesse: string, zustand: string): string {
  return [art, groesse, zustand]
    .filter(Boolean)
    .map(w => TASK_WORDS[w] ?? w)
    .join(' · ')
}
