// Gewichtete Tokens und Kurzform von Token-Zahlen. Rein, ohne Node und ohne Mod-API:
// Mod (hooks/lib/ledger-costs.ts, Anzeige) und Werkzeug (tool/effort-measure.ts, `effort --record`) nutzen es.
//
// Hauptmaß für den Aufwand je Rolle, Agent, Bauleiter und fremde Agenten: gewichtete
// Tokens dieser Sitzung statt der Differenz des 5-Stunden-Fensters, denn das Fenster gehört dem ganzen Konto und
// andere Sitzungen zählen dort mit. Die gewichtete Summe wird aus den gespeicherten Feldern (Eingabe, Ausgabe,
// Cache-Lesen, Cache-Schreiben) berechnet, nicht gespeichert; alte costs.json bleiben dadurch lesbar.

/**
 * Gewichte je Token-Art. Vorläufig, bis Messungen sie bestätigen: Eingabe 1, Cache schreiben 1,25,
 * Cache lesen 0,1, Ausgabe 5. Bewusst keine Gewichtung je Modell (wie stark Opus, Sonnet und Haiku das Abo-Limit
 * belasten, ist nicht dokumentiert).
 */
export const TOKEN_WEIGHTS = { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 } as const

export type TokenCounts = { input: number; output: number; cacheRead: number; cacheWrite: number }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Gewichtete Tokens, ganzzahlig gerundet; fehlende oder unbrauchbare Felder (alte oder kaputte Bücher) zählen 0. */
export function weightedTokens(u: Partial<Record<keyof TokenCounts, unknown>> | null | undefined): number {
  if (!u) return 0
  const w = TOKEN_WEIGHTS
  return Math.round(num(u.input) * w.input + num(u.cacheWrite) * w.cacheWrite + num(u.cacheRead) * w.cacheRead + num(u.output) * w.output)
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
