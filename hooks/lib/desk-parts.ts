// Desktop-Aussehen: reine Teile ohne `$` und ohne Elemente, damit sie unter node:test prüfbar sind.
// Die Elemente (Box, Text, Button) baut hooks/desk.tsx.

import type { Limits } from '../../types'

const pct = (v: number) => `${Math.round(v)} %`

/**
 * Text der Fußzeile in der Desktop-App: „5h 26 % · Woche 4 %“, ohne Balken und Reset. Ein Fenster, das seit der
 * letzten Messung schon zurückgesetzt wurde, steht als „5h neu seit HH:MM“ ohne Zahl; ohne Wert entfällt das Stück,
 * ohne beide Werte ist der Text leer.
 */
export function deskFooterText(lim: Limits, alt?: { neuFuenf?: string; neuWoche?: string }): string {
  const five = alt?.neuFuenf ? `5h neu seit ${alt.neuFuenf}` : lim.fuenfStunden === null ? '' : `5h ${pct(lim.fuenfStunden)}`
  const week = alt?.neuWoche ? `Woche neu seit ${alt.neuWoche}` : lim.woche === null ? '' : `Woche ${pct(lim.woche)}`
  return [five, week].filter(Boolean).join(' · ')
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
