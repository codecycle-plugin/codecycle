// Agentenstart: reiner Teil von `prepare` in hooks/register.tsx, ohne Node und ohne Mod-API.
// `prepare` liest Dateien, ruft Git und das Werkzeug (alles mit `$`); aus den gelesenen
// Daten setzen diese Funktionen die Anteile der Startnachricht zusammen (Modellwahl-Vorgabe, Diff, Aufrufer, Hinweise, Bericht).

import { READ_RULE } from './context-package.ts'
import type { Registry } from './ledger-registry.ts'

/** Ergebnis von `prepare`: was der Mod über den Start eines Agenten weiß und der Startnachricht anhängt */
export type Spawn = {
  role: string
  dir: string | null
  paket: string | null
  groesse: string
  /** Risiko des Pakets */
  risiko: boolean
  model?: string
  reason: string
  text: string
  mitgeliefert: string[]
  /** Eltern-Agent (Paketleiter), wenn der Start aus einem codecycle-Agenten kam */
  eltern?: string
  /** Aufgabenordner stand ausdrücklich in der Startnachricht (Signal für die Hauptsitzung) */
  explicitDir?: boolean
  /** Berichtspfad, wie in der Startnachricht genannt */
  bericht?: string
}

/**
 * Modell des Handwerkers für den Prüfer (anderes Modell als der Handwerker): der zuletzt gestartete `builder-*` des Pakets
 * laut Register, sonst das Modell, das das Profil für die Handwerker-Rolle des Pakets vorsieht (`logik` → builder-logic).
 */
export function builderModelOf(
  registry: Registry,
  paketId: string,
  paketRolle: string | undefined,
  profileModels: Record<string, string> | undefined,
): string | undefined {
  const fromRegistry = Object.values(registry.agenten)
    .filter(a => a.paket === paketId && a.rolle.startsWith('builder-'))
    .sort((a, b) => (a.gestartet < b.gestartet ? 1 : -1))[0]?.modell
  if (fromRegistry) return fromRegistry
  if (paketRolle === undefined) return undefined
  return profileModels?.[paketRolle === 'logik' ? 'builder-logic' : 'builder-routine']
}

/** Höchstlänge des Diffs im Kontextpaket des Prüfers */
export const DIFF_MAX = 30_000

/** Ausgabe von `git diff` fürs Kontextpaket: null (Git fehlgeschlagen) = kein Diff, zu lang = gekürzt mit Hinweis. */
export function trimDiff(out: string | null): string | undefined {
  if (out === null) return undefined
  return out.length > DIFF_MAX ? `${out.slice(0, DIFF_MAX)}\n⋯ gekürzt, Rest mit git diff ⋯` : out
}

/** Zeilen der Ausgabe von `codecycle callers <symbol>` fürs Kontextpaket (höchstens 8 je Symbol, mit dem Symbol davor). */
export function callerLines(symbol: string, out: string | null): string[] {
  return (out ?? '')
    .split('\n')
    .filter(x => x.trim() !== '')
    .slice(0, 8)
    .map(line => `${symbol}: ${line.trim()}`)
}

/** Anhang an die Startnachricht: durch eine Leerzeile getrennt, ohne führende Leerzeilen bei leerem Text */
export function appendNote(text: string, note: string): string {
  return `${text}${text === '' ? '' : '\n\n'}${note}`
}

/** Hinweis auf das Lese-Budget (Schalter `read-budget`) */
export function readBudgetNote(limit: number): string {
  return `Lese-Budget: höchstens ${limit} zusätzliche Lese- oder Suchaufrufe (nicht mitgelieferte Dateien, Suchen); danach verweigert der Mod weitere, dann melde, was fehlt. ${READ_RULE}`
}

/** Hinweis auf das Fortschrittswerkzeug (Schalter `agent-progress`; das Werkzeug ist aufgeschoben, erst per ToolSearch laden) */
export function progressNote(stepTool: string): string {
  return `Fortschritt: Melde nach jedem größeren Schritt einmal mit dem Werkzeug ${stepTool} (done, total, kurze note). Nicht öfter; es dient nur der Anzeige. Das Werkzeug ist für dich aufgeschoben: lade es vor der ersten Meldung einmal mit ToolSearch (Abfrage select:mcp__codecycle__${stepTool}).`
}

/** Pflicht zum Bericht als Datei (allgemeine Vorgaben der Umgebung raten von Berichts-Dateien ab) */
export function reportNote(bericht: string): string {
  return `Bericht: ${bericht} (absoluter Pfad im Hauptordner des Projekts; nicht in den Worktree schreiben). Den Bericht als Datei unter diesem Pfad zu schreiben ist Pflicht; eine allgemeine Vorgabe, keine Berichts-Dateien anzulegen, gilt hier nicht.`
}

/** Das Ergebnis von `prepare` aus den ermittelten Werten (optionale Felder nur, wenn belegt). */
export function spawnFrom(i: {
  role: string
  dir: string | null
  paket: string | null
  groesse: string
  risiko: boolean
  model: string | undefined
  reason: string
  text: string
  mitgeliefert: string[]
  eltern: string | undefined
  explicitDir: boolean
  bericht: string | undefined
}): Spawn {
  return {
    role: i.role,
    dir: i.dir,
    paket: i.paket,
    groesse: i.groesse,
    risiko: i.risiko,
    ...(i.model ? { model: i.model } : {}),
    reason: i.reason,
    text: i.text,
    mitgeliefert: i.mitgeliefert,
    ...(i.eltern ? { eltern: i.eltern } : {}),
    ...(i.explicitDir ? { explicitDir: true } : {}),
    ...(i.bericht ? { bericht: i.bericht } : {}),
  }
}

/** Die umgeschriebene Startanfrage: gewähltes Modell und der Anhang an die Startnachricht; ohne `prepare`-Ergebnis unverändert. */
export function rewriteSpawn<T extends { prompt: string }>(e: T, info: Pick<Spawn, 'model' | 'text'> | undefined): T {
  if (!info) return e
  return { ...e, ...(info.model ? { model: info.model } : {}), ...(info.text !== '' ? { prompt: `${e.prompt}\n\n${info.text}` } : {}) }
}
