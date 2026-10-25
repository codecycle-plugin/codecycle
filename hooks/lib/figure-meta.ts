// Stammdaten der Figuren, die auch der Mod und die Agenten-Ansicht brauchen: Rollen, Modellfamilie und -farbe,
// Zeichen und Namen je Rolle. Die Zeichnung selbst steht in `figures.ts`.
// Reiner Code ohne Node und ohne Mod-API, wie die übrigen Dateien in lib/.

import { ROLE_ALIASES, canonicalRole } from '../../lib/roles.ts'

/** Alte Rollennamen aus Register und Kosten (Quelle: `lib/roles.ts`); sie zeigen Figur und Bezeichnung der heutigen Rolle. */
export const ALIASES = ROLE_ALIASES

/** Die Rollen laut `agents/` plus `other` für fremde Agenten. */
export const FIGURE_ROLES: readonly string[] = [
  'builder',
  'final-reviewer',
  'plan-reviewer',
  'setup',
  'toolsmith',
  'other',
]

export type ModelFamily = 'haiku' | 'sonnet' | 'opus' | 'fable' | 'other'

/** Modell-ID oder Kurzname (`claude-sonnet-5-5`, `opus`, `fable`) auf die Familie abbilden. */
export function modelFamily(model: string): ModelFamily {
  const m = model.toLowerCase()
  for (const f of ['haiku', 'sonnet', 'opus', 'fable'] as const) if (m.includes(f)) return f
  return 'other'
}

// Töne, die auf hellem wie dunklem Grund lesbar sind (mittlere Helligkeit, kräftig gesättigt)
const MODEL_COLORS: Record<ModelFamily, string> = {
  haiku: '#17A398',
  sonnet: '#3A7BD5',
  opus: '#8B5CF6',
  fable: '#E0489E',
  other: '#8E929A',
}

/** Farbe des Modells als Hex-Wert. */
export function modelColor(model: string): string {
  return MODEL_COLORS[modelFamily(model)]
}

const LABELS: Record<string, string> = {
  builder: 'Bauender',
  'final-reviewer': 'Schlussprüfer',
  'plan-reviewer': 'Plan-Prüfer',
  setup: 'Einrichter',
  toolsmith: 'Werkzeugmeister',
  other: 'Fremder Agent',
}

// Einfache Zeichen aus Unicode-Blöcken, die gängige Terminalschriften kennen (keine Emoji)
const GLYPHS: Record<string, string> = {
  builder: '⚙',
  'final-reviewer': '◉',
  'plan-reviewer': '✐',
  setup: '▲',
  toolsmith: '⚒',
  other: '·',
}

/** Rolle mit eigener Figur (alte Namen über `ALIASES`), sonst `other` (fremde Agenten und unbekannte Rollen alter Register-Einträge). */
export const known = (role: string): string => {
  const r = canonicalRole(role)
  return FIGURE_ROLES.includes(r) ? r : 'other'
}

/** Ein Zeichen je Rolle für die Textdarstellung im Terminal. */
export function roleGlyph(role: string): string {
  return GLYPHS[known(role)] ?? '·'
}

/** Kurzer deutscher Name der Rolle; eine Rolle ohne eigene Figur (alter Register-Eintrag) behält ihren Namen. */
export function roleLabel(role: string): string {
  if (known(role) === 'other' && role !== 'other' && /^[a-z][a-z-]*$/.test(role)) return role
  return LABELS[known(role)] ?? 'Fremder Agent'
}
