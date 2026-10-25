// Gewichtete Tokens und Kurzform von Token-Zahlen. Rein, ohne Node und ohne Mod-API:
// Mod (hooks/lib/ledger-costs.ts, Anzeige) und Werkzeug (tool/effort-measure.ts, `effort --record`) nutzen es.
//
// Hauptmaß für den Aufwand je Rolle, Agent, Bauleiter und fremde Agenten: gewichtete
// Tokens dieser Sitzung statt der Differenz des 5-Stunden-Fensters, denn das Fenster gehört dem ganzen Konto und
// andere Sitzungen zählen dort mit. Die gewichtete Summe wird aus den gespeicherten Feldern (Eingabe, Ausgabe,
// Cache-Lesen, Cache-Schreiben) berechnet, nicht gespeichert; alte costs.json bleiben dadurch lesbar.

/**
 * Gewichte je Token-Art, im Verhältnis der API-Preise: Eingabe 1, Cache schreiben 1,25 (5 min) bzw. 2 (1 h),
 * Cache lesen 0,1 (bei Sonnet 5.5 und Opus 5.5: 0,05), Ausgabe 5. Wie stark die Arten das Abo-Limit belasten, ist nicht
 * dokumentiert; die Gewichte dienen dem Vergleich untereinander.
 */
export const TOKEN_WEIGHTS = { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 } as const

/** Cache-Lesen bei Sonnet 5.5 und Opus 5.5 (halber Satz gegenüber `TOKEN_WEIGHTS.cacheRead`). */
export const CACHE_READ_55 = 0.05

/** Cache-Laufzeit der Hauptsitzung, wenn Claude Code keine meldet: im Abo 1 h, Agenten 5 min. */
export const MAIN_CACHE_TTL_DEFAULT = '1h'

export type TokenCounts = { input: number; output: number; cacheRead: number; cacheWrite: number }

/** Felder, aus denen `weightedTokens` rechnet: Zählwerte, dazu Modell, Cache-Laufzeit und (falls bekannt) der 1-h-Teil des Schreibens. */
export type TokenFields = Partial<Record<keyof TokenCounts | 'cacheWrite1h' | 'modell' | 'cacheTtl', unknown>>

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Gewicht für Cache-Lesen je Modell: 0,05 bei Sonnet 5.5 und Opus 5.5, sonst (auch unbekannt) 0,1. */
export function cacheReadWeight(modell: unknown): number {
  return typeof modell === 'string' && /(sonnet|opus)[-_ ]?5[-.]5\b/i.test(modell) ? CACHE_READ_55 : TOKEN_WEIGHTS.cacheRead
}

/** Gewicht für Cache-Schreiben je Laufzeit: 2 bei `1h`, sonst (auch unbekannt) 1,25. */
export function cacheWriteWeight(cacheTtl: unknown): number {
  return cacheTtl === '1h' ? TOKEN_WEIGHTS.cacheWrite1h : TOKEN_WEIGHTS.cacheWrite
}

/**
 * Gewichtete Tokens, ganzzahlig gerundet; fehlende oder unbrauchbare Felder (alte oder kaputte Bücher) zählen 0.
 * Modell und Cache-Laufzeit kommen aus `optionen`, sonst aus den Feldern `modell` und `cacheTtl` des Eintrags.
 * `cacheWrite1h` (Teil von `cacheWrite`, z. B. aus dem Strom von `claude -p`) geht vor die Laufzeit.
 */
export function weightedTokens(u: TokenFields | null | undefined, optionen: { modell?: unknown; cacheTtl?: unknown } = {}): number {
  if (!u) return 0
  const w = TOKEN_WEIGHTS
  const schreiben = num(u.cacheWrite)
  const lang = Math.min(num(u.cacheWrite1h), schreiben)
  const ttl = optionen.cacheTtl ?? u.cacheTtl
  const geschrieben = u.cacheWrite1h !== undefined
    ? (schreiben - lang) * w.cacheWrite + lang * w.cacheWrite1h
    : schreiben * cacheWriteWeight(ttl)
  return Math.round(num(u.input) * w.input + geschrieben + num(u.cacheRead) * cacheReadWeight(optionen.modell ?? u.modell) + num(u.output) * w.output)
}

/** Hauptsitzung: Laufzeit aus dem Buch, ohne Meldung `MAIN_CACHE_TTL_DEFAULT`. */
export function weightedMain(h: TokenFields | null | undefined): number {
  return weightedTokens(h, { cacheTtl: h?.cacheTtl ?? MAIN_CACHE_TTL_DEFAULT })
}

/**
 * Gewichtete Tokens einer Rolle: Summe ihrer Agenten (je mit eigenem Modell und eigener Laufzeit); ohne Agenten im Buch
 * (ältere costs.json) aus der Rollenzeile.
 */
export function weightedRole(rolle: string, zeile: TokenFields | null | undefined, agenten: Record<string, (TokenFields & { rolle?: unknown }) | null> | null | undefined): number {
  const eigene = Object.values(agenten ?? {}).filter(a => a && a.rolle === rolle)
  return eigene.length ? eigene.reduce((n, a) => n + weightedTokens(a), 0) : weightedTokens(zeile)
}

/**
 * Kurzform: „870“, „1,5k“, „34k“, „1,2 Mio“. Unter 10 000 eine Nachkommastelle
 * (ohne „,0“), darüber ganze Tausender; ab 999 500 in Millionen.
 */
export function shortTokens(n: number): string {
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} Mio`
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`
  if (n >= 1_000) return `${(Math.round(n / 100) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '')}k`
  return String(n)
}
