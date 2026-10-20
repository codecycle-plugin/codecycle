// Agenten-Leiste mit Figuren.
// Rein, ohne Node und ohne Mod-API. Der Mod hält den Live-Zustand je Agent (Status, Kontext,
// gemeldete Schritte) und legt das Token-Buch daneben; hier entstehen daraus die Zeilen.
// Kosten werden als gewichtete Tokens (Hauptmaß), Tokens, Cache-Trefferquote und Limit-Anteil (Konto-Näherung) gezeigt, nie in Dollar.

import type { AgentStatus, LiveAgent } from '../../types'
import { type Costs, freshTokens, hitRate, shortTokens, totalTokens, weightedTokens } from './ledger-costs.ts'
import type { AgentEntry } from './ledger-registry.ts'
import { roleLabel } from './figure-meta.ts'

// Der Live-Zustand steht im Zustandsvertrag des Mods (types/index.d.ts), weil er dort in sich geschlossen sein muss.
export type { AgentStatus, LiveAgent }

export type AgentRow = LiveAgent & {
  tokens: number
  /** neu verarbeitet (Eingabe, Ausgabe, Cache-Schreiben) und aus dem Cache gelesen */
  frisch: number
  cache: number
  /** gewichtete Tokens (Hauptmaß, `lib/tokens.ts :: weightedTokens`) */
  gewichtet: number
  runden: number
  trefferquote: number | null
  /** Prozentpunkte des 5h-Fensters (Konto-Näherung: andere Sitzungen zählen mit) */
  limitProzent: number | null
  /** Kontextfüllung in Prozent des Fensters */
  kontextProzent: number
  /** Fortschritt 0..1: aus gemeldeten Schritten, sonst aus den Runden geschätzt; null = noch nichts (Anzeige: Kontextfüllung grau) */
  fortschritt: number | null
  /** true: der Fortschritt ist aus den Runden geschätzt, nicht gemeldet */
  geschaetzt: boolean
}

/** Rundenzahl, bei der die Schätzung 63 % erreicht (1 - exp(-runden/K)); vorläufiger Wert, nachzustellen. */
export const ESTIMATE_K = 12
/** Höchstwert der Schätzung: fertig ist ein Agent erst mit dem Ende. */
export const ESTIMATE_MAX = 0.9

/** Geschätzter Fortschritt aus der Zahl der Runden: gesättigt, höchstens ESTIMATE_MAX. */
export function estimateProgress(runden: number): number {
  if (!(runden > 0)) return 0
  return Math.min(ESTIMATE_MAX, 1 - Math.exp(-runden / ESTIMATE_K))
}

/**
 * Fortschritt eines Agenten: fertig = 1; mit gemeldeten Schritten gelten sie, sonst die Schätzung aus den
 * Runden seit Beginn des Abschnitts. Der Wert läuft nie rückwärts gegenüber dem bisher gezeigten (`balken`):
 * kommen Meldungen, die unter der Schätzung liegen, bleibt der Balken stehen, bis sie ihn überholen.
 */
export function progressOf(
  a: Pick<LiveAgent, 'status' | 'schritte' | 'balken' | 'rundenAb'>,
  runden: number,
): { wert: number | null; geschaetzt: boolean } {
  if (a.status === 'fertig') return { wert: 1, geschaetzt: false }
  const shown = a.balken ?? 0
  if (a.schritte && a.schritte.total > 0) {
    const raw = Math.min(1, Math.max(0, a.schritte.done / a.schritte.total))
    return { wert: Math.max(shown, raw), geschaetzt: false }
  }
  const wert = Math.max(shown, estimateProgress(runden - (a.rundenAb ?? 0)))
  return { wert: wert > 0 ? wert : null, geschaetzt: true }
}

/**
 * Schritte eines fertigen Agenten: alle erledigt (`total/total`), die alte Notiz fällt weg.
 * Ohne gemeldete Schritte bleibt es bei undefined (der Balken steht bei fertig ohnehin auf 100 %).
 */
export function finishedSteps(s: LiveAgent['schritte']): LiveAgent['schritte'] {
  return s ? { done: s.total, total: s.total } : undefined
}

/**
 * Kontextfenster je Modell. ANNAHME (nicht nachgeschlagen, wie bei Savvy Progress): Haiku 200 000,
 * sonst 1 000 000 Tokens. Nur für die Prozentanzeige; die Engine liefert das Fenster nur für die Hauptsitzung.
 */
export function contextWindow(model: string): number {
  return /haiku/i.test(model) ? 200_000 : 1_000_000
}

/** Höchstens so viele fertige Agenten zeigt die Leiste (die neuesten). */
export const MAX_FINISHED = 30

/** Zeilen: laufende zuerst (neueste oben), dann fertige und abgebrochene (neueste oben, gekürzt). */
export function agentRows(live: readonly LiveAgent[], costs: Costs | null): AgentRow[] {
  const rows = live.map((a): AgentRow => {
    const c = costs?.agenten[a.id]
    const kontextProzent = Math.min(100, Math.round((a.kontext / contextWindow(a.modell)) * 100))
    const progress = progressOf(a, c?.runden ?? 0)
    return {
      ...a,
      tokens: c ? totalTokens(c) : 0,
      frisch: c ? freshTokens(c) : 0,
      cache: c?.cacheRead ?? 0,
      gewichtet: weightedTokens(c),
      runden: c?.runden ?? 0,
      trefferquote: c ? hitRate(c) : null,
      limitProzent: c?.limitProzent ?? null,
      kontextProzent,
      fortschritt: progress.wert,
      geschaetzt: progress.wert !== null && progress.geschaetzt,
    }
  })
  const running = rows.filter(r => r.status === 'laeuft').sort((a, b) => b.start - a.start)
  const done = rows
    .filter(r => r.status !== 'laeuft')
    .sort((a, b) => (b.ende ?? b.start) - (a.ende ?? a.start))
    .slice(0, MAX_FINISHED)
  return [...running, ...done]
}

/** Dauer kurz: „42 s“, „3 min“, „1 h 05“. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

/** Uhrzeit-Form für kurze Spannen: „2:46“, „0:05“, ab einer Stunde „1:02:05“. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Arbeitszeit: Summe der abgeschlossenen Läufe plus der laufende Abschnitt. Die Wandzeit
 * (Start bis Ende bzw. jetzt) enthält auch das Warten zwischen Ende und Folgenachricht.
 */
export function workMs(a: Pick<LiveAgent, 'status' | 'start' | 'arbeitMs' | 'laufStart'>, now: number): number {
  const done = a.arbeitMs ?? 0
  if (a.status !== 'laeuft') return done
  return done + Math.max(0, now - (a.laufStart ?? a.start))
}

/** „Arbeit 2:46 von 9 min“: Arbeitszeit und Wandzeit seit dem Start. */
export function timeText(a: Pick<LiveAgent, 'status' | 'start' | 'ende' | 'arbeitMs' | 'laufStart'>, now: number): string {
  return `Arbeit ${clockText(workMs(a, now))} von ${duration((a.ende ?? Math.max(now, a.start)) - a.start)}`
}

/** Cache-Laufzeit der Sub-Agenten ohne Angabe in der Agenten-Datei (Doku prompt-caching: 5 min). */
export const CACHE_TTL_SHORT_MS = 5 * 60_000
/** Cache-Laufzeit mit `experimental: { cacheTtl: 1h }` in der Agenten-Datei; auch Annahme für die Hauptsitzung im Abo. */
export const CACHE_TTL_LONG_MS = 60 * 60_000

/** Cache-Laufzeit aus dem Frontmatter einer Agenten-Datei: 1 h bei `cacheTtl: 1h` (unter `experimental`), sonst 5 min. */
export function cacheTtlFromAgentFile(text: string | null): number {
  const fm = text?.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
  if (!fm) return CACHE_TTL_SHORT_MS
  return /^[ \t]*(?:experimental:\s*\{[^}\n]*)?cacheTtl:\s*["']?1h\b/m.test(fm) ? CACHE_TTL_LONG_MS : CACHE_TTL_SHORT_MS
}

/**
 * Cache eines Agenten: läuft (der Agent arbeitet gerade), warm mit Restzeit = TTL − (jetzt − letzte Anfrage), kalt,
 * oder unbekannt (noch keine Anfrage). Jede Anfrage mit Cache-Treffer setzt die Laufzeit neu; gerechnet wird ab der letzten.
 */
export function cacheState(
  a: Pick<LiveAgent, 'status' | 'letzteAnfrage' | 'cacheTtlMs'>,
  now: number,
): { zustand: 'laeuft' | 'warm' | 'kalt' | 'unbekannt'; restMs: number } {
  if (a.status === 'laeuft') return { zustand: 'laeuft', restMs: 0 }
  if (a.letzteAnfrage === undefined) return { zustand: 'unbekannt', restMs: 0 }
  const rest = (a.cacheTtlMs ?? CACHE_TTL_SHORT_MS) - (now - a.letzteAnfrage)
  return rest > 0 ? { zustand: 'warm', restMs: rest } : { zustand: 'kalt', restMs: 0 }
}

export function cacheText(s: { zustand: 'laeuft' | 'warm' | 'kalt' | 'unbekannt'; restMs: number }): string {
  if (s.zustand === 'laeuft') return 'läuft'
  if (s.zustand === 'warm') return `Cache warm ${clockText(s.restMs)}`
  if (s.zustand === 'kalt') return 'Cache kalt'
  return ''
}

/** Fortschritt als Text: gemeldete Schritte „2/5“, ohne Meldungen „geschätzt“ (aus den Runden), fertig ohne Meldungen leer. */
export function progressLabel(r: Pick<AgentRow, 'schritte' | 'geschaetzt' | 'status'>): string {
  if (r.schritte) return `${r.schritte.done}/${r.schritte.total}`
  return r.status === 'laeuft' && r.geschaetzt ? 'geschätzt' : ''
}

/** Kurzname des Modells für die Anzeige: „Sonnet“, „Opus“, sonst die ID. */
export function modelName(model: string): string {
  const m = model.toLowerCase().match(/haiku|sonnet|opus|fable/)?.[0]
  return m ? m[0]!.toUpperCase() + m.slice(1) : model || '–'
}

/** Kopfzahlen der Leiste. */
export function crewSummary(rows: readonly AgentRow[]): {
  laufend: number
  fertig: number
  abgebrochen: number
  tokens: number
  frisch: number
  cache: number
  gewichtet: number
  limitProzent: number
} {
  return {
    laufend: rows.filter(r => r.status === 'laeuft').length,
    fertig: rows.filter(r => r.status === 'fertig').length,
    abgebrochen: rows.filter(r => r.status === 'abgebrochen').length,
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
    frisch: rows.reduce((n, r) => n + r.frisch, 0),
    cache: rows.reduce((n, r) => n + r.cache, 0),
    gewichtet: rows.reduce((n, r) => n + r.gewichtet, 0),
    limitProzent: Math.round(rows.reduce((n, r) => n + (r.limitProzent ?? 0), 0) * 10) / 10,
  }
}

/** Schritt-Meldung prüfen (Werkzeug codecycle_step); null bei Unbrauchbarem. */
export function parseStep(input: { done?: unknown; total?: unknown; note?: unknown }): { done: number; total: number; note?: string } | null {
  const done = Number(input.done)
  const total = Number(input.total)
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done < 0) return null
  const note = typeof input.note === 'string' && input.note.trim() !== '' ? input.note.trim().slice(0, 80) : undefined
  return { done: Math.min(Math.round(done), Math.round(total)), total: Math.round(total), ...(note ? { note } : {}) }
}

/** Verbrauch kurz: „neu 54k · Cache 120k“; getrennt von der Kontextfüllung. */
export function usageText(frisch: number, cache: number): string {
  return `neu ${shortTokens(frisch)} · Cache ${shortTokens(cache)}`
}

/** Gewichtete Tokens kurz: „1,7 Mio gew.“ (Hauptmaß, Entscheidung 2a). */
export function weightedText(n: number): string {
  return `${shortTokens(n)} gew.`
}

/** Prozentpunkte des 5h-Fensters, als Konto-Näherung gekennzeichnet: „Konto ≈ 2,3 %“ (nachrangig, andere Sitzungen zählen mit). */
export function kontoText(prozent: number): string {
  return `Konto ≈ ${prozent.toFixed(1).replace('.', ',')} %`
}

const ZIEL_MAX = 60

function shorten(s: string, max = ZIEL_MAX): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

/**
 * Aktuelle Tätigkeit aus einem Werkzeugaufruf: Werkzeug und Ziel. Pfade über `rel` relativ zum Projekt,
 * Befehle und Suchmuster auf eine Zeile von höchstens 60 Zeichen gekürzt.
 */
export function activityOf(
  tool: string,
  input: { file_path?: unknown; notebook_path?: unknown; command?: unknown; pattern?: unknown; url?: unknown; description?: unknown },
  rel: (p: string) => string,
): { werkzeug: string; ziel: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const path = text(input.file_path) || text(input.notebook_path)
  const ziel = path ? shorten(rel(path)) : shorten(text(input.command) || text(input.pattern) || text(input.url) || text(input.description))
  return { werkzeug: tool, ziel }
}

const STATUS_TEXT: Record<AgentStatus, string> = { laeuft: 'läuft', fertig: 'fertig', abgebrochen: 'abgebrochen' }

/** Höchstens so viele Einträge je Liste zeigt die Detailansicht (die neuesten). */
export const DETAIL_ITEMS = 10

/** Detailansicht eines Agenten: Kopfzeilen und die Listen gelesen/geändert/erstellt aus dem Register. */
export function agentDetail(r: AgentRow, entry: AgentEntry | undefined, now: number): { kopf: string[]; listen: { titel: string; items: string[] }[] } {
  const kopf = [
    `${roleLabel(r.rolle)}${r.paket ? ` · Paket ${r.paket}` : ''} · ${modelName(r.modell)}${r.effort ? ` ${r.effort}` : ''} · ${STATUS_TEXT[r.status]} · ${timeText(r, now)}${cacheText(cacheState(r, now)) && r.status !== 'laeuft' ? ` · ${cacheText(cacheState(r, now))}` : ''}`,
  ]
  if (r.schritte) kopf.push(`Schritte ${r.schritte.done}/${r.schritte.total}${r.schritte.note ? `: ${r.schritte.note}` : ''}`)
  if (r.taetigkeit) kopf.push(`${r.status === 'laeuft' ? 'Jetzt' : 'Zuletzt'}: ${r.taetigkeit.werkzeug}${r.taetigkeit.ziel ? ` ${r.taetigkeit.ziel}` : ''}`)
  if (entry) kopf.push(`Letzte Aktivität ${entry.letzteAktivitaet.replace('T', ' ').replace(/\.\d+Z$|Z$/, '')}${entry.suchen > 0 ? ` · ${entry.suchen} Suchen` : ''}`)
  kopf.push(
    `Kontext ${r.kontextProzent} % · ${weightedText(r.gewichtet)} · ${usageText(r.frisch, r.cache)}${r.runden > 0 ? ` · ${r.runden} Runden` : ''}${r.limitProzent !== null ? ` · ${kontoText(r.limitProzent)}` : ''}`,
  )
  const list = (titel: string, touches: readonly { pfad: string; abschnitt?: string }[]) => ({
    titel: touches.length > DETAIL_ITEMS ? `${titel} (${touches.length}, die letzten ${DETAIL_ITEMS})` : `${titel} (${touches.length})`,
    items: touches
      .slice(-DETAIL_ITEMS)
      .reverse()
      .map(t => (t.abschnitt ? `${t.pfad}:${t.abschnitt}` : t.pfad)),
  })
  return {
    kopf,
    listen: [list('Gelesen', entry?.gelesen ?? []), list('Geändert', entry?.geaendert ?? []), list('Erstellt', entry?.erstellt ?? [])],
  }
}

/**
 * Problem beim Kontextpaket als Satz für die Bautafel oder null: Paket nicht in PLAN.md gefunden,
 * sonst die nicht aufgelösten Fundstellen (`offen` aus buildPackage; „Datei fehlt“ = neu anzulegen zählt nicht).
 */
export function packageProblem(paket: string, missing: boolean, offen: readonly string[]): string | null {
  if (missing) return `Kontextpaket ${paket}: Paket nicht in PLAN.md gefunden`
  const lost = offen.filter(o => /: (nicht gefunden|mehrdeutig)/.test(o)).map(o => o.replace(/: (nicht gefunden|mehrdeutig).*$/, ''))
  if (lost.length === 0) return null
  const shown = lost.slice(0, 3).join('; ')
  return `Kontextpaket ${paket}: ${lost.length} ${lost.length === 1 ? 'Fundstelle' : 'Fundstellen'} nicht gefunden (${shown}${lost.length > 3 ? '; …' : ''})`
}
