// Limit-Budget (Verhalten bei knappem Limit): Empfehlung für den Bauleiter
// und Warnungen für die Bautafel. Rein, ohne Node und ohne Mod-API.
// Die Schwellen für „nur klein“ und ohne Durchschnitt sind ANNAHMEN dieser Umsetzung (Platzhalter,
// in der Praxis zu messen); die Schwelle 92 % ist der Standardwert.

export const DEFAULT_THRESHOLD = 92
export const WARN_PERCENT = 80
/** Kontext der Hauptsitzung in Tokens: ab hier neue Sitzung an der nächsten natürlichen Pause (vorläufig bis Messung) */
export const CONTEXT_PAUSE = 400_000
/** ab hier an der nächsten möglichen Stelle anhalten, auch nach einem einzelnen Teil (vorläufig bis Messung) */
export const CONTEXT_STOP = 600_000

export type ContextAdvice = 'keine' | 'pause' | 'jetzt'

/** Wann eine neue Sitzung dran ist, nach dem Kontext der Hauptsitzung in Tokens. */
export function contextAdvice(tokens: number | null | undefined): ContextAdvice {
  if (tokens === null || tokens === undefined) return 'keine'
  return tokens >= CONTEXT_STOP ? 'jetzt' : tokens >= CONTEXT_PAUSE ? 'pause' : 'keine'
}

const tokensText = (n: number): string => `${Math.round(n / 1000)}k Tokens`

export type RoleAverage = { laeufe: number; prozent: number }
export type Recommendation = 'starten' | 'nur klein' | 'anhalten'

export type BudgetInput = {
  fuenf: number | null
  woche: number | null
  resetFuenf?: string
  resetWoche?: string
  /** angefragte Rolle */
  role?: string
  /**
   * Durchschnitt der Prozentpunkte des 5h-Fensters pro Lauf je Rolle. Konto-Näherung: das Fenster gehört dem ganzen
   * Konto, andere Sitzungen zählen mit. Bleibt trotzdem in Prozent, weil die Empfehlung mit dem Fenster rechnet (Entscheidung 2a).
   */
  avg: Record<string, RoleAverage>
  threshold?: number
  /** Kontext der Hauptsitzung in Tokens, falls bekannt */
  contextTokens?: number | null
}

export type BudgetAdvice = { empfehlung: Recommendation; grund: string; durchschnitt?: number; frei: number | null }

export function averageOf(entry: RoleAverage | undefined): number | undefined {
  return entry && entry.laeufe > 0 ? entry.prozent / entry.laeufe : undefined
}

export function recommend(i: BudgetInput): BudgetAdvice {
  const threshold = i.threshold ?? DEFAULT_THRESHOLD
  const used = [i.fuenf, i.woche].filter((v): v is number => v !== null)
  if (used.length === 0) {
    return { empfehlung: 'starten', grund: 'kein Messwert (Schwelle kann nicht angewendet werden)', frei: null }
  }
  const worst = Math.max(...used)
  const frei = Math.round((threshold - worst) * 10) / 10
  if (worst >= threshold) {
    return { empfehlung: 'anhalten', grund: `Limit bei ${Math.round(worst)} % (Schwelle ${threshold} %)`, frei }
  }
  const avg = i.role ? averageOf(i.avg[i.role]) : undefined
  if (avg !== undefined) {
    if (avg <= frei) return { empfehlung: 'starten', grund: `Durchschnitt ${avg.toFixed(1)} % passt in ${frei} % Restplatz`, durchschnitt: avg, frei }
    if (avg * 0.5 <= frei) return { empfehlung: 'nur klein', grund: `Durchschnitt ${avg.toFixed(1)} % knapp über Restplatz ${frei} %`, durchschnitt: avg, frei }
    return { empfehlung: 'anhalten', grund: `Durchschnitt ${avg.toFixed(1)} % passt nicht in ${frei} % Restplatz`, durchschnitt: avg, frei }
  }
  // ohne Durchschnitt: Annahme, grobe Staffelung nach Restplatz
  if (frei >= 10) return { empfehlung: 'starten', grund: `${frei} % Restplatz, kein Durchschnitt für die Rolle`, frei }
  if (frei >= 3) return { empfehlung: 'nur klein', grund: `nur ${frei} % Restplatz, kein Durchschnitt für die Rolle`, frei }
  return { empfehlung: 'anhalten', grund: `nur ${frei} % Restplatz`, frei }
}

export type WarningInput = {
  fuenf: number | null
  woche: number | null
  profile: string
  /** Modell der Hauptsitzung (Text von `$.session.model()`) */
  mainModel?: string
  /** Kontext der Hauptsitzung in Tokens, falls bekannt */
  contextTokens?: number | null
}

/** Hinweise für die Bautafel, kürzester zuerst. */
export function warnings(i: WarningInput): string[] {
  const out: string[] = []
  const hot = [
    ['5 Std.', i.fuenf],
    ['Woche', i.woche],
  ] as const
  for (const [label, v] of hot) {
    if (v !== null && v >= WARN_PERCENT) {
      out.push(`Limit ${label} bei ${Math.round(v)} %: nur kleine Läufe starten.`)
    }
  }
  if (i.profile === 'sparsam' && i.mainModel && /opus/i.test(i.mainModel)) {
    out.push('Profil sparsam, aber die Hauptsitzung läuft auf Opus: Sonnet reicht dafür (/model sonnet).')
  }
  const c = contextAdvice(i.contextTokens)
  if (c === 'jetzt') out.push(`Hauptsitzung sehr groß (${tokensText(i.contextTokens!)}): an der nächsten möglichen Stelle neue Sitzung (/clear, dann /codecycle:continue).`)
  else if (c === 'pause') out.push(`Hauptsitzung groß (${tokensText(i.contextTokens!)}): an der nächsten natürlichen Pause neue Sitzung (/clear, dann /codecycle:continue).`)
  return out
}

/** Zeile „Hauptsitzung“ für `codecycle_budget`: Kontext und ob eine neue Sitzung dran ist. */
function contextLine(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return 'Hauptsitzung: Kontext ohne Messwert; neue Sitzung: keine'
  const c = contextAdvice(tokens)
  const what =
    c === 'jetzt'
      ? `jetzt (ab ${tokensText(CONTEXT_STOP)}): an der nächsten möglichen Stelle anhalten, auch nach einem einzelnen Teil`
      : c === 'pause'
        ? `an der nächsten natürlichen Pause (ab ${tokensText(CONTEXT_PAUSE)}: nach einer Freigabe, einem fertigen Teil oder dem Merge)`
        : `keine (unter ${tokensText(CONTEXT_PAUSE)})`
  return `Hauptsitzung: ${tokensText(tokens)} Kontext; neue Sitzung: ${what}`
}

/**
 * Kontext für die Hauptsitzung nach `codecycle solo teil start|fertig`, `solo plan` und `solo check`: die Antwort
 * von `codecycle_budget`, ohne eigene Abfrage. `after` nennt den Befehl.
 */
export function budgetNote(budget: string, after: string): string {
  return `codecycle_budget (vom Mod nach ${after} angehängt):\n${budget}`
}

/** Kontext nach `codecycle check` der an eine Aufgabe gebundenen Hauptsitzung: nur die Zeile „Hauptsitzung“ (kurz, `check` läuft oft). */
export function checkContextNote(tokens: number | null | undefined): string {
  return `codecycle_budget (vom Mod nach codecycle check angehängt): ${contextLine(tokens)}`
}

/** Text für das Werkzeug `codecycle_budget`. */
export function budgetText(
  i: BudgetInput & { autoResume: boolean; profile: string },
  fmt: (iso: string | undefined) => string,
): string {
  const a = recommend(i)
  const pct = (v: number | null) => (v === null ? 'kein Messwert' : `${Math.round(v)} %`)
  const lines = [
    `Empfehlung: ${a.empfehlung}${i.role ? ` (Rolle ${i.role})` : ''}`,
    `Grund: ${a.grund}`,
    `5-Stunden-Fenster: ${pct(i.fuenf)}${i.resetFuenf ? `, Reset ${fmt(i.resetFuenf)}` : ''}`,
    `Wochenfenster: ${pct(i.woche)}${i.resetWoche ? `, Reset ${fmt(i.resetWoche)}` : ''}`,
    `Schwelle: ${i.threshold ?? DEFAULT_THRESHOLD} %`,
    `Profil: ${i.profile}`,
    contextLine(i.contextTokens),
  ]
  const roles = Object.entries(i.avg)
    .map(([r, e]) => [r, averageOf(e)] as const)
    .filter((x): x is readonly [string, number] => x[1] !== undefined)
  lines.push(
    roles.length === 0
      ? 'Durchschnittskosten pro Rolle: noch keine Läufe gemessen'
      : `Durchschnittskosten pro Rolle (Prozentpunkte des 5h-Fensters je Lauf, Konto-Näherung: andere Sitzungen zählen mit):${roles.map(([r, v]) => `${r} ${v.toFixed(1)}`).join(', ')}`,
  )
  lines.push(
    i.autoResume
      ? 'auto-resume: an (nur Konfiguration, die Fortsetzung nach Reset läuft nicht automatisch; Reset-Zeit nennen)'
      : 'auto-resume: aus',
  )
  return lines.join('\n')
}

/** Budget als Läufe für Bautafel und Panel: „3/5 Läufe“, mit Nachlauf „· Nachlauf 1“. */
export function runsText(b: { geplant: number; verbraucht: number; nachlauf?: number }): string {
  return `${b.verbraucht}/${b.geplant} Läufe${(b.nachlauf ?? 0) > 0 ? ` · Nachlauf ${b.nachlauf}` : ''}`
}
