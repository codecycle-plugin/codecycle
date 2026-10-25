// Token-Buch (costs.json): Verbrauch je Hauptsitzung, Rolle, Agent und Lauf, Kennzahlen, Kurzformen.
// Rein, ohne Node und ohne Mod-API: der Mod hält die Strukturen im Speicher und schreibt sie als JSON.
// Das Agenten-Register (agents.json) steht in `ledger-registry.ts`.
//
// Cache-Schreiben steht als Summe im Buch: Die Typen von `turn.step` (TurnUsage/ModelUsage) liefern nur
// `cache_creation_input_tokens`. Die Laufzeit (5 min / 1 h) steht je Agent (`cacheTtl` aus der Agenten-Datei) und für
// die Hauptsitzung (`hauptsitzung.cacheTtl`, sonst Annahme 1 h) daneben; die Gewichtung richtet sich danach.

import type { Metrics, RoleCost } from '../../types'
import { weightedMain, weightedRole, weightedTokens } from '../../lib/tokens.ts'
import type { Registry } from './ledger-registry.ts'
import { canonicalRole } from '../../lib/roles.ts'

// Gewichtete Tokens (Hauptmaß, Entscheidung 2a) und Kurzform stehen im Kern, weil auch das Werkzeug sie braucht.
export { TOKEN_WEIGHTS, shortTokens, weightedMain, weightedRole, weightedTokens } from '../../lib/tokens.ts'

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type ModelUsageLike = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type CostEntry = Usage & { runden: number }
export type RoleEntry = CostEntry & { laeufe: number; limitProzent: number }

/**
 * Ein Lauf eines Agenten: vom Start bzw. von einer Folgenachricht bis zum Ende
 * (`turn.complete`), mit den Tokens nur dieses Laufs. `pauseMs`: Abstand seit dem Ende des vorigen Laufs (z. B. Bauender:
 * Bau bis Folgenachricht); daran und am Cache-Schreiben des Laufs sieht man, ob der Cache noch warm war.
 */
export type Run = Usage & { start: string; ende?: string; pauseMs?: number; runden: number }

export type AgentCost = CostEntry & {
  rolle: string
  paket: string | null
  modell: string
  /**
   * gemessene Prozentpunkte des 5-Stunden-Fensters über seine Züge. Konto-Näherung: das Fenster gehört dem ganzen
   * Konto, andere Sitzungen zählen mit; bei parallelen Läufen unscharf. Hauptmaß sind die gewichteten Tokens.
   */
  limitProzent?: number
  /** Läufe (Start bzw. Folgenachricht bis Ende) mit eigenen Tokens; fehlt in älteren costs.json */
  laeufe?: Run[]
  /** Cache-Laufzeit des Agenten (aus der Agenten-Datei, Standard der Sub-Agenten 5 min); fehlt in älteren costs.json */
  cacheTtl?: '5m' | '1h'
}

/**
 * Stand der Hauptsitzung, als sie anfing, an dieser Aufgabe zu arbeiten: `vorher` = Runden und Tokens der
 * Hauptsitzung dieser Sitzung bis zum ersten Signal; diese Arbeit steht nicht im Buch. Ein Eintrag je Sitzung.
 */
export type MainStart = { sitzung: string; zeit: string; signal: string; vorher: Usage & { runden: number } }

/** Hauptsitzung = Bauleiter: Name bleibt für alte costs.json; Modell und Limit-Anteil fehlen dort. */
export type MainEntry = CostEntry & {
  /** zuletzt gemeldetes Modell der Hauptsitzung */
  modell?: string
  /** Prozentpunkte des 5-Stunden-Fensters aus Zügen der Hauptsitzung, ohne die Anteile der Agenten (Konto-Näherung) */
  limitProzent?: number
  /** Startstände je Sitzung, die an dieser Aufgabe arbeitete */
  starts?: MainStart[]
  /** Cache-Laufzeit der Hauptsitzung, wenn Claude Code sie gemeldet hat (classic.PostModelSwitch); sonst fehlt das Feld */
  cacheTtl?: '5m' | '1h'
}

export type Costs = {
  version: 1
  aufgabe: string
  aktualisiert: string
  hauptsitzung: MainEntry
  /** Agenten ohne codecycle-Rolle (z. B. ein Hilfsagent der Hauptsitzung): eigene Zeile, nicht in Rollen und nicht beim Bauleiter */
  fremd?: CostEntry & { modell?: string }
  rollen: Record<string, RoleEntry>
  agenten: Record<string, AgentCost>
}

const zero = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

export function emptyCosts(aufgabe: string): Costs {
  return { version: 1, aufgabe, aktualisiert: '', hauptsitzung: { ...zero(), runden: 0 }, rollen: {}, agenten: {} }
}

/** Liest costs.json; bei Unbrauchbarem eine leere Struktur. */
export function parseCosts(text: string | null, aufgabe: string): Costs {
  if (!text) return emptyCosts(aufgabe)
  try {
    const j = JSON.parse(text) as Partial<Costs>
    if (j.version !== 1 || typeof j.rollen !== 'object' || typeof j.agenten !== 'object' || !j.hauptsitzung) return emptyCosts(aufgabe)
    return { ...emptyCosts(aufgabe), ...j, aufgabe } as Costs
  } catch {
    return emptyCosts(aufgabe)
  }
}

function add(e: CostEntry, u: ModelUsageLike | null): void {
  e.runden += 1
  if (!u) return
  e.input += u.input_tokens ?? 0
  e.output += u.output_tokens ?? 0
  e.cacheRead += u.cache_read_input_tokens ?? 0
  e.cacheWrite += u.cache_creation_input_tokens ?? 0
}

export type Who = { agentId?: string; rolle?: string; paket?: string | null; modell?: string; cacheTtl?: '5m' | '1h' }

/** Eine Modell-Anfrage (ein `turn.step`) verbuchen; ohne `agentId` zählt sie zur Hauptsitzung. */
export function addStep(costs: Costs, who: Who, usage: ModelUsageLike | null): void {
  if (who.agentId && !who.rolle) {
    // Agent ohne codecycle-Rolle, eigene Zeile „fremd“
    const fremd = (costs.fremd ??= { ...zero(), runden: 0 })
    if (who.modell) fremd.modell = who.modell
    add(fremd, usage)
    return
  }
  if (!who.agentId || !who.rolle) {
    add(costs.hauptsitzung, usage)
    if (who.modell) costs.hauptsitzung.modell = who.modell
    return
  }
  const agent = agentCost(costs, { ...who, agentId: who.agentId, rolle: who.rolle })
  if (who.modell) agent.modell = who.modell
  if (who.cacheTtl) agent.cacheTtl = who.cacheTtl
  add(agent, usage)
  // offener Lauf: dieselbe Anfrage auch dort
  const run = agent.laeufe?.at(-1)
  if (run && !run.ende) add(run, usage)
  const role = (costs.rollen[who.rolle] ??= { ...zero(), runden: 0, laeufe: 0, limitProzent: 0 })
  add(role, usage)
}

function agentCost(costs: Costs, who: Who & { agentId: string; rolle: string }): AgentCost {
  return (costs.agenten[who.agentId] ??= {
    ...zero(),
    runden: 0,
    rolle: who.rolle,
    paket: who.paket ?? null,
    modell: who.modell ?? '',
  })
}

/** Beginnt einen Lauf (Start oder Folgenachricht); ist schon einer offen, bleibt es bei diesem. */
export function openRun(costs: Costs, who: Who & { agentId: string; rolle: string }, zeit: string): void {
  const a = agentCost(costs, who)
  const runs = (a.laeufe ??= [])
  const last = runs.at(-1)
  if (last && !last.ende) return
  const pause = last?.ende ? Date.parse(zeit) - Date.parse(last.ende) : NaN
  runs.push({ start: zeit, ...(Number.isFinite(pause) && pause >= 0 ? { pauseMs: pause } : {}), runden: 0, ...zero() })
}

/** Schließt den offenen Lauf; Rückgabe: seine Dauer in ms, null ohne offenen Lauf. */
export function closeRun(costs: Costs, agentId: string, zeit: string): number | null {
  const run = costs.agenten[agentId]?.laeufe?.at(-1)
  if (!run || run.ende) return null
  run.ende = zeit
  const ms = Date.parse(zeit) - Date.parse(run.start)
  return Number.isFinite(ms) ? Math.max(0, ms) : 0
}

/** Arbeitszeit eines Agenten: Summe der abgeschlossenen Läufe (ohne Wartezeit zwischen Ende und Folgenachricht). */
export function workTimeMs(a: AgentCost): number {
  let n = 0
  for (const r of a.laeufe ?? []) {
    if (!r.ende) continue
    const ms = Date.parse(r.ende) - Date.parse(r.start)
    if (Number.isFinite(ms) && ms > 0) n += ms
  }
  return n
}

export function emptyMain(): MainEntry {
  return { ...zero(), runden: 0 }
}

/** Eine Anfrage der Hauptsitzung in einen eigenen Topf (Vorlauf vor dem Wissen, welche Aufgabe; Summe der Sitzung). */
export function addMainStep(entry: MainEntry, usage: ModelUsageLike | null, modell: string): void {
  add(entry, usage)
  if (modell) entry.modell = modell
}

/** Vorlauf-Topf in die Hauptsitzung einer Aufgabe übernehmen: Tokens, Runden, Limit-Anteil, Modell. */
export function mergeMain(target: MainEntry, extra: MainEntry): void {
  target.runden += extra.runden
  target.input += extra.input
  target.output += extra.output
  target.cacheRead += extra.cacheRead
  target.cacheWrite += extra.cacheWrite
  if (extra.modell) target.modell = extra.modell
  if (extra.limitProzent) addMainLimit({ hauptsitzung: target } as Costs, extra.limitProzent)
}

/** Startstand der Hauptsitzung einmal je Sitzung festhalten; true, wenn neu eingetragen. */
export function noteMainStart(costs: Costs, start: MainStart): boolean {
  const list = (costs.hauptsitzung.starts ??= [])
  if (list.some(s => s.sitzung === start.sitzung)) return false
  list.push(start)
  return true
}

/** Summe gezeigter Prozentwerte (Agenten = Summe der Rollen), auf eine Nachkommastelle. */
export function rolePercentSum(items: readonly { prozent: number }[]): number {
  return Math.round(items.reduce((n, r) => n + (Number.isFinite(r.prozent) ? r.prozent : 0), 0) * 10) / 10
}

export function noteRun(costs: Costs, rolle: string): void {
  const role = (costs.rollen[rolle] ??= { ...zero(), runden: 0, laeufe: 0, limitProzent: 0 })
  role.laeufe += 1
}

/** Gemessene Veränderung des 5-Stunden-Fensters (Prozentpunkte) einem Lauf der Rolle zurechnen. */
export function addLimitDelta(costs: Costs, rolle: string, prozentpunkte: number): void {
  if (!(prozentpunkte > 0)) return
  const role = (costs.rollen[rolle] ??= { ...zero(), runden: 0, laeufe: 0, limitProzent: 0 })
  role.limitProzent = Math.round((role.limitProzent + prozentpunkte) * 100) / 100
}

/** Dieselbe Messung einem einzelnen Agenten zurechnen (Agenten-Leiste). */
export function addAgentLimit(costs: Costs, agentId: string, prozentpunkte: number): void {
  const a = costs.agenten[agentId]
  if (!a || !(prozentpunkte > 0)) return
  a.limitProzent = Math.round(((a.limitProzent ?? 0) + prozentpunkte) * 100) / 100
}

/** Prozentpunkte eines Bauleiter-Zuges (Anstieg minus Agenten-Anteile in diesem Zug, nie negativ). */
export function addMainLimit(costs: Costs, prozentpunkte: number): void {
  if (!(prozentpunkte > 0)) return
  costs.hauptsitzung.limitProzent = Math.round(((costs.hauptsitzung.limitProzent ?? 0) + prozentpunkte) * 100) / 100
}

/** Cache-Trefferquote: Cache-Lesen ÷ gesamte Eingabe (unzwischengespeichert + Lesen + Schreiben); null ohne Eingabe. */
export function hitRate(u: Usage): number | null {
  const total = u.input + u.cacheRead + u.cacheWrite
  return total === 0 ? null : u.cacheRead / total
}

export function sumUsage(costs: Costs): Usage & { runden: number } {
  const s = { ...zero(), runden: costs.hauptsitzung.runden }
  for (const x of [costs.hauptsitzung, ...(costs.fremd ? [costs.fremd] : []), ...Object.values(costs.agenten)]) {
    s.input += x.input
    s.output += x.output
    s.cacheRead += x.cacheRead
    s.cacheWrite += x.cacheWrite
  }
  s.runden += (costs.fremd?.runden ?? 0) + Object.values(costs.agenten).reduce((n, a) => n + a.runden, 0)
  return s
}

export function totalTokens(u: Usage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite
}

/** Neu verarbeitete Tokens: Eingabe, Ausgabe und Cache-Schreiben; das Cache-Lesen zählt getrennt. */
export function freshTokens(u: Usage): number {
  return u.input + u.output + u.cacheWrite
}

/** Gewichtete Tokens aller Rollen, je Rolle aus ihren Agenten (`lib/tokens.ts :: weightedRole`). */
function agentsWeighted(costs: Costs): number {
  return Object.entries(costs.rollen).reduce((n, [rolle, r]) => n + weightedRole(rolle, r, costs.agenten), 0)
}

/** Kennzahlen einer Aufgabe aus ihrem Token-Buch (Bautafel, Seitenleiste). */
export function metricsOf(costs: Costs): Metrics {
  const sum = sumUsage(costs)
  return {
    tokens: totalTokens(sum),
    frisch: freshTokens(sum),
    cache: sum.cacheRead,
    // Hauptmaß (Entscheidung 2a): gewichtete Tokens je Teil (Modell und Cache-Laufzeit je Agent bzw. Hauptsitzung);
    // Agenten = Summe der Rollen wie bei den Prozentwerten
    gewichtet: agentsWeighted(costs) + weightedMain(costs.hauptsitzung) + weightedTokens(costs.fremd),
    agentenGewichtet: agentsWeighted(costs),
    bauleiterGewichtet: weightedMain(costs.hauptsitzung),
    ...(costs.fremd
      ? { fremd: { gewichtet: weightedTokens(costs.fremd), frisch: freshTokens(costs.fremd), cache: costs.fremd.cacheRead } }
      : {}),
    runden: sum.runden,
    trefferquote: hitRate(sum),
    hauptsitzung: totalTokens(costs.hauptsitzung),
    ...(costs.hauptsitzung.modell ? { bauleiterModell: costs.hauptsitzung.modell } : {}),
    bauleiterFrisch: freshTokens(costs.hauptsitzung),
    bauleiterCache: costs.hauptsitzung.cacheRead,
    bauleiterProzent: costs.hauptsitzung.limitProzent ?? 0,
    // dieselbe Summe wie die gezeigten Rollenwerte, eine Nachkommastelle
    agentenProzent: rolePercentSum(Object.values(costs.rollen).map(r => ({ prozent: r.limitProzent ?? 0 }))),
  }
}

/**
 * Kosten pro Rolle für die Anzeige: gewichtete Tokens (Hauptmaß, Sortierung), daneben die gemessenen Prozentpunkte
 * des 5h-Fensters (Konto-Näherung) und der Anteil an den Tokens. Alte Rollennamen (`lib/roles.ts :: ROLE_ALIASES`)
 * zählen zur heutigen Rolle: eine Zeile je Rolle.
 */
export function roleCosts(costs: Costs): RoleCost[] {
  const roles = Object.entries(costs.rollen)
  const grand = roles.reduce((n, [, r]) => n + totalTokens(r), 0)
  type Row = Required<Pick<RoleCost, 'rolle' | 'prozent' | 'gewichtet' | 'tokens' | 'laeufe' | 'frisch' | 'cache' | 'anteil'>>
  const rows = new Map<string, Row>()
  for (const [name, r] of roles) {
    const rolle = canonicalRole(name)
    const row: Row = {
      rolle,
      prozent: r.limitProzent ?? 0,
      gewichtet: weightedRole(name, r, costs.agenten),
      tokens: totalTokens(r),
      laeufe: r.laeufe,
      frisch: freshTokens(r),
      cache: r.cacheRead,
      anteil: grand > 0 ? (totalTokens(r) / grand) * 100 : 0,
    }
    const prev = rows.get(rolle)
    rows.set(rolle, !prev ? row : {
      rolle,
      prozent: prev.prozent + row.prozent,
      gewichtet: prev.gewichtet + row.gewichtet,
      tokens: prev.tokens + row.tokens,
      laeufe: prev.laeufe + row.laeufe,
      frisch: prev.frisch + row.frisch,
      cache: prev.cache + row.cache,
      anteil: prev.anteil + row.anteil,
    })
  }
  return [...rows.values()]
    .sort((a, b) => b.gewichtet - a.gewichtet || b.tokens - a.tokens)
}

/**
 * Inhalt von Token-Buch und Register ohne den Zeitstempel `aktualisiert`: Der Mod schreibt die
 * Dateien nur, wenn sich dieser Text gegenüber dem zuletzt gelesenen oder geschriebenen Stand geändert hat.
 */
export function bookSnapshot(costs: Costs, registry: Registry): string {
  return JSON.stringify([{ ...costs, aktualisiert: '' }, registry])
}
