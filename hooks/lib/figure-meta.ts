// Stammdaten der Figuren, die auch der Mod und die Agenten-Ansicht brauchen: Rollen, Modellfamilie und -farbe,
// Zeichen und Namen je Rolle. Die Zeichnung selbst steht in `figures.ts`.
// Reiner Code ohne Node und ohne Mod-API, wie die übrigen Dateien in lib/.

/** Die 18 Rollen laut `agents/` plus `other` für fremde Agenten. */
export const FIGURE_ROLES: readonly string[] = [
  'acceptance',
  'architect',
  'area-architect',
  'browser-reviewer',
  'builder-logic',
  'builder-routine',
  'debugger',
  'doc-keeper',
  'package-lead',
  'plan-reviewer',
  'refuter',
  'reviewer',
  'security-reviewer',
  'setup',
  'solo-reviewer',
  'surveyor',
  'test-author',
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
  acceptance: 'Abnahme',
  architect: 'Architekt',
  'area-architect': 'Bereichs-Architekt',
  'builder-logic': 'Logik-Handwerker',
  'builder-routine': 'Routine-Handwerker',
  debugger: 'Fehlersucher',
  'doc-keeper': 'Doku-Pfleger',
  'browser-reviewer': 'Browser-Prüfer',
  'package-lead': 'Paketleiter',
  'plan-reviewer': 'Plan-Prüfer',
  refuter: 'Widerleger',
  reviewer: 'Prüfer',
  'security-reviewer': 'Sicherheitsprüfer',
  setup: 'Einrichter',
  'solo-reviewer': 'Solo-Prüfer',
  surveyor: 'Gutachter',
  'test-author': 'Test-Autor',
  toolsmith: 'Werkzeugmeister',
  other: 'Fremder Agent',
}

// Einfache Zeichen aus Unicode-Blöcken, die gängige Terminalschriften kennen (keine Emoji)
const GLYPHS: Record<string, string> = {
  acceptance: '✓',
  architect: '☰',
  'area-architect': '▤',
  'builder-logic': '⚙',
  'builder-routine': '»',
  debugger: '✱',
  'doc-keeper': '✎',
  'browser-reviewer': '☼',
  'package-lead': '▣',
  'plan-reviewer': '✐',
  refuter: '⚖',
  reviewer: '◎',
  'security-reviewer': '◈',
  setup: '▲',
  'solo-reviewer': '◉',
  surveyor: '△',
  'test-author': '◆',
  toolsmith: '⚒',
  other: '·',
}

/** Alte Rollennamen aus früheren agents.json (inspector → browser-reviewer). */
const ALIASES: Readonly<Record<string, string>> = { inspector: 'browser-reviewer' }
export const known = (role: string): string => {
  const r = ALIASES[role] ?? role
  return FIGURE_ROLES.includes(r) ? r : 'other'
}

/** Ein Zeichen je Rolle für die Textdarstellung im Terminal. */
export function roleGlyph(role: string): string {
  return GLYPHS[known(role)] ?? '·'
}

/** Kurzer deutscher Name der Rolle. */
export function roleLabel(role: string): string {
  return LABELS[known(role)] ?? 'Fremder Agent'
}
