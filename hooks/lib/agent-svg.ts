// Agenten-Leiste als SVG für die Desktop-App (Design nach Savvy Progress,
// JohnnyVizz/claude-kit, MIT, an codecycle angepasst). Rein, ohne Mod-API: der Mod übergibt
// die Zeilen aus lib/agent-view.ts und setzt das Ergebnis in `<Svg source=…>`.
// Im Terminal zeichnet der Mod dieselben Zeilen als Text (hooks/register.tsx, Seitenleiste).

import { type AgentRow, cacheState, cacheText, crewSummary, modelName, progressLabel, timeText, usageText } from './agent-view.ts'
import { figureDocument, figureSvg } from './figures.ts'
import { modelColor, roleLabel } from './figure-meta.ts'
import { shortTokens } from './ledger-costs.ts'

/**
 * Höhe einer Agentenzeile: drei Textzeilen (Rolle; Modell und Paket; Kennzahlen) und Balken, Schrift so groß
 * wie der Text der App, Luft statt Trennlinie (vorher 48 mit zwei Zeilen)
 */
export const ROW_H = 74
/** Kopf: zwei flache Kennzahlen und eine Zeile mit dem Anteil der Aufgabe (keine Kacheln) */
export const HEAD_H = 54
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

/**
 * Farben für helles und dunkles Design; die Modellfarbe kommt aus figure-meta.ts. Theme-Farben von Claude Code gehen im SVG
 * nicht (es wird als Bild gezeichnet). Balkenspur und Trennlinie sind darum halbdurchsichtiges Grau, passend zu den Flächen
 * der Desktop-App (hooks/desk.tsx :: TRACK).
 */
const THEME = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.k{fill:rgba(128,128,128,.25)}.m{fill:#a9a9a5}.ln{stroke:rgba(128,128,128,.18)}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#6d6d69}}
.live{animation:cc-pulse 1.6s ease-in-out infinite}@keyframes cc-pulse{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

export function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Text grob auf eine Breite kürzen (Durchschnittsbreite 0,56 em je Zeichen). */
export function fit(s: string, size: number, width: number): string {
  const max = Math.max(1, Math.floor(width / (size * 0.56)))
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s
}

const pct = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} %`

/** Kennzahlen einer Zeile als Text (auch für das Terminal): Kontext, Verbrauch, Limit, Arbeitszeit, Cache-Zeit. */
export function statsText(r: AgentRow, now: number): string {
  // Kontextfüllung und Verbrauch als getrennte Angaben
  const parts = [`Kontext ${r.kontextProzent} %`, usageText(r.frisch, r.cache)]
  if (r.limitProzent !== null) parts.push(`Limit ${pct(r.limitProzent)}`)
  parts.push(timeText(r, now))
  const cache = cacheText(cacheState(r, now))
  if (cache) parts.push(cache)
  return parts.join(' · ')
}

/** Details neben dem Status: Modell, Effort, Paket, Runden, Eltern-Agent. */
export function metaText(r: AgentRow): string {
  const parts = [r.effort ? `${modelName(r.modell)} · ${r.effort}` : modelName(r.modell)]
  if (r.paket) parts.push(`Paket ${r.paket}`)
  if (r.runden > 0) parts.push(`${r.runden} Runden`)
  if (r.eltern) parts.push(`über ${r.eltern}`)
  if (r.status === 'abgebrochen') parts.push('abgebrochen')
  return parts.join(' · ')
}

function statusMark(x: number, y: number, r: AgentRow, color: string): string {
  if (r.status === 'laeuft') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (r.status === 'fertig') {
    return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
}

/**
 * Eine Agenten-Zeile (flach): Figur; oben links Rolle (mit Notiz), oben rechts neben dem Status die Details
 * (Modell farbig, Effort, Paket, Runden); darunter Fortschritt („2/5“ oder „geschätzt“), Kennzahlen, Arbeitszeit und
 * Cache-Zeit; Balken, 3 px hoch (gemeldet farbig, geschätzt blasser, sonst Kontext grau). Der Knopf zur Detailansicht steht im Mod
 * rechts neben dem SVG, nicht mehr als eigene Zeile darüber.
 */
export function agentRowSvg(width: number, r: AgentRow, now: number): string {
  const W = Math.max(240, Math.round(width))
  const color = modelColor(r.modell)
  const x0 = 46
  const textW = W - x0 - 22
  const model = modelName(r.modell)
  const metaRest = metaText(r).slice(model.length)
  const rest = fit(metaRest, 12.5, Math.max(12, textW - model.length * 12.5 * 0.56))
  const title = `${roleLabel(r.rolle)}${r.schritte?.note ? ` – ${r.schritte.note}` : ''}`
  const progress = progressLabel(r)
  const fill = r.fortschritt ?? r.kontextProzent / 100
  const bar = Math.round(textW * Math.min(1, Math.max(0, fill)))
  // Maßstab 1,2: Augenabstand 10 Figuren-Pixel = 12 px, ganzzahlig (auch × 1,25/1,5) → beide Augen gleich breit gerundet
  // Rolle 14 px halbfett, darunter Modell farbig mit Paket und Runden, dann Kennzahlen, Balken 2 px; Status rechts oben
  const body = `${figureSvg({ role: r.rolle, model: r.modell, x: 0, y: 8, scale: 1.2, running: r.status === 'laeuft', seed: r.id })}
<text class="t" x="${x0}" y="16" font-family="${FONT}" font-size="14" font-weight="600">${xml(fit(title, 14, textW - 6))}</text>
<text x="${x0}" y="35" font-family="${FONT}" font-size="12.5"><tspan fill="${color}">${xml(model)}</tspan><tspan class="s">${xml(rest)}</tspan></text>
<text class="s" x="${x0}" y="53" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${xml(fit(`${progress ? `${progress} · ` : ''}${statsText(r, now)}`, 12.5, textW))}</text>
<rect class="k" x="${x0}" y="61" width="${textW}" height="2" rx="1"/><rect${r.fortschritt === null ? ' class="m"' : ` fill="${color}"${r.geschaetzt ? ' opacity="0.55"' : ''}`} x="${x0}" y="61" width="${bar}" height="2" rx="1"/>
${statusMark(W - 8, 12, r, color)}`
  return figureDocument(W, ROW_H, `${THEME}${body}`)
}

/** Werte für den Kopf: echtes 5-Stunden-Fenster und der Anteil dieser Aufgabe (Prozentpunkte aus dem Token-Buch). */
export type CrewHead = { fuenf: number | null; agenten: number; bauleiter: number | null }

const oneDecimal = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

/** Zeile unter den Kennzahlen: Anteil der Aufgabe, getrennt nach Agenten und Bauleiter. */
export function shareText(h: CrewHead): string {
  return `Aufgabe: Agenten ${oneDecimal(h.agenten)}${h.bauleiter !== null ? ` · Bauleiter ${oneDecimal(h.bauleiter)}` : ''} (Prozentpunkte, Näherung)`
}

/**
 * Kopf ohne Kachelflächen: zwei flache Kennzahlen „Agenten neu“ und „Agenten Cache“ (neu verarbeitete
 * Tokens, Cache-Lesen), darunter der Anteil dieser Aufgabe, eindeutig beschriftet. „Agenten laufen/fertig“ steht jetzt in der
 * Abschnittszeile der Seitenleiste, die Kennzahl „Limit 5 Std.“ entfällt (das Limit steht in der Fußzeile). `head.fuenf`
 * bleibt im Typ, wird hier nicht mehr gezeigt.
 */
export function crewHeadSvg(width: number, rows: readonly AgentRow[], head: CrewHead): string {
  const W = Math.max(240, Math.round(width))
  const s = crewSummary(rows)
  // Kennzahlen nah nebeneinander statt über die ganze Breite verteilt
  const colW = Math.min((W - 4) / 2, 120)
  const stat = (i: number, k: string, v: string) => {
    const x = 2 + i * colW
    return `<text class="s" x="${x}" y="13" font-family="${FONT}" font-size="12">${xml(fit(k, 12, colW - 8))}</text>
<text class="t" x="${x}" y="31" font-family="${FONT}" font-size="14" font-weight="500" font-variant-numeric="tabular-nums">${xml(v)}</text>`
  }
  const body = `${stat(0, 'Agenten neu', shortTokens(s.frisch))}${stat(1, 'Agenten Cache', shortTokens(s.cache))}
<text class="s" x="2" y="48" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${xml(fit(shareText(head), 12, W - 4))}</text>`
  return figureDocument(W, HEAD_H, `${THEME}${body}`)
}
