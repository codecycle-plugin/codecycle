import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type Aufwand, writeAufwand } from './effort-file.ts'
import { ToolBroken } from './errors.ts'
import { git } from './exec.ts'
import { mainBranch } from './git-hints.ts'
import { pathsLib, stateFile, tokensLib } from './lib-path.ts'
import type { Ctx } from './main.ts'
import { tryLoadConfig } from './project.ts'

const { GIT_QUIET, TASKS_DIR } = pathsLib
const { shortTokens, weightedTokens } = tokensLib

/** `--record`: Läufe und Nachläufe aus STATE.md, Diff-Zeilen ohne `docs/codecycle/`. */
export function recordMeasure(ctx: Ctx, root: string, rel: string, name: string, statePath: string, path: string, data: Aufwand): number {
  const state = stateFile.parseState(readFileSync(statePath, 'utf8'), `${rel}/STATE.md`)
  const base = mainBranch(root, tryLoadConfig(root) ?? undefined)
  const branch = state.branch || 'HEAD'
  const diff = git([...GIT_QUIET, 'diff', '--numstat', `${base}...${branch}`, '--', '.', `:(exclude)${TASKS_DIR}`], root)
  if (!diff.ok) throw new ToolBroken(`git diff ${base}...${branch} fehlgeschlagen`)
  let lines = 0
  for (const row of diff.out.split(/\r?\n/).filter(Boolean)) {
    const [add = '0', del = '0'] = row.split('\t')
    lines += (Number(add) || 0) + (Number(del) || 0)
  }
  const laeufe = state.budget.verbraucht
  const costsPath = join(dirname(path), 'costs.json')
  const shares = costShares(costsPath)
  const sessions = mainSessions(costsPath)
  data.messung = {
    laeufe,
    nachlaeufe: state.budget.nachlauf,
    diffZeilen: lines,
    laeufeJe100Zeilen: lines > 0 ? Math.round((laeufe / lines) * 1000) / 10 : null,
    aufgenommen: new Date().toISOString(),
    ...shares,
    ...(sessions?.starts ? { hauptsitzungen: sessions.starts.length } : {}),
  }
  writeAufwand(path, data)
  const m = data.messung
  const parts = [`${m.laeufe} Läufe (Nachlauf ${m.nachlaeufe})`]
  // Hauptmaß gewichtete Tokens dieser Sitzung (Entscheidung 2a); Prozent des 5h-Fensters danach als Konto-Näherung
  if (m.agentenGewichtet !== undefined) parts.push(`Agenten ${gew(m.agentenGewichtet)}`)
  if (m.bauleiterGewichtet !== undefined) {
    const anteil = m.bauleiterAnteil !== undefined ? ` (Anteil ${percent(m.bauleiterAnteil)})` : ''
    parts.push(`Bauleiter${m.bauleiterModell ? ` (${m.bauleiterModell})` : ''} ${gew(m.bauleiterGewichtet)}${anteil}`)
  }
  if (m.fremdGewichtet !== undefined) parts.push(`fremd ${gew(m.fremdGewichtet)}`)
  const konto = [
    ...(m.agentenProzent !== undefined ? [`Agenten ${percent(m.agentenProzent)}`] : []),
    ...(m.bauleiterProzent !== undefined ? [`Bauleiter ${percent(m.bauleiterProzent)}`] : []),
  ]
  if (konto.length > 0) parts.push(`Konto ≈ ${konto.join(' / ')}`)
  parts.push(`${m.diffZeilen} Zeilen`, `${m.laeufeJe100Zeilen === null ? '–' : String(m.laeufeJe100Zeilen).replace('.', ',')} Läufe je 100 Zeilen`)
  ctx.out(`effort ${name}: ${parts.join(' · ')}`)
  if (sessions) {
    ctx.out(
      sessions.starts
        ? `  Hauptsitzungen erfasst: ${sessions.starts.length}${sessions.starts.length > 0 ? ` (Start ${sessions.starts.map(clockTime).join(', ')})` : ''}`
        : '  Hauptsitzungen erfasst: unbekannt (Buch ohne Startstände)',
    )
    ctx.out(`  nicht erfasst: ${NOT_RECORDED.join(' · ')}`)
    const runs = roleRuns(costsPath)
    ctx.out(`  Rollen laut Token-Buch: ${runs.length > 0 ? runs.map(([rolle, n]) => `${rolle} ${n}`).join(' · ') : 'keine'}`)
  }
  return 0
}

/** Gelaufene Rollen mit Zahl der Läufe aus `costs.json` (`rollen[].laeufe`), nach Name; ohne Lauf oder unlesbar: leer. */
export function roleRuns(file: string): [string, number][] {
  let c: { rollen?: Record<string, { laeufe?: unknown }> }
  try {
    c = JSON.parse(readFileSync(file, 'utf8')) as typeof c
  } catch {
    return []
  }
  const rollen = c && typeof c.rollen === 'object' && c.rollen ? c.rollen : {}
  return Object.entries(rollen)
    .map(([rolle, r]): [string, number] => [rolle, typeof r?.laeufe === 'number' ? r.laeufe : 0])
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
}

/** Was die Messung nie enthält: Grenzen des Token-Buchs (Schreibtakt, fertige Aufgabe, Bindung der Hauptsitzung). */
const NOT_RECORDED = [
  'Rest dieser Sitzung ab der Messung (Buch alle 10 s, ab „fertig“ nicht mehr)',
  'Hauptsitzungen ohne Bindung an die Aufgabe (nicht erkennbar)',
  'Kosten außerhalb von Claude Code',
]

/** Uhrzeit HH:MM in Ortszeit */
function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Hauptsitzungen, die laut `costs.json` an der Aufgabe gearbeitet haben (`hauptsitzung.starts[]`, je Sitzung ein Eintrag,
 * doppelte Kennung `sitzung` zählt einmal), als Startzeiten (ms, aufsteigend; Kennung `sitzung` = Startzeit, sonst
 * Bindungszeit `zeit`). `starts: null` = Buch ohne Startstände; Ergebnis null = Buch fehlt oder unlesbar.
 */
export function mainSessions(file: string): { starts: number[] | null } | null {
  if (!existsSync(file)) return null
  let c: { hauptsitzung?: { starts?: unknown } }
  try {
    c = JSON.parse(readFileSync(file, 'utf8')) as typeof c
  } catch {
    return null
  }
  if (!c || typeof c !== 'object') return null
  const list = c.hauptsitzung && typeof c.hauptsitzung === 'object' ? c.hauptsitzung.starts : undefined
  if (!Array.isArray(list)) return { starts: null }
  const seen = new Map<string, number>()
  for (const s of list as { sitzung?: unknown; zeit?: unknown }[]) {
    if (!s || typeof s !== 'object') continue
    const key = typeof s.sitzung === 'string' ? s.sitzung : String(s.zeit)
    if (seen.has(key)) continue
    const at = [s.sitzung, s.zeit].map(v => (typeof v === 'string' ? Date.parse(v) : Number.NaN)).find(Number.isFinite)
    if (at !== undefined) seen.set(key, at)
  }
  return { starts: [...seen.values()].sort((a, b) => a - b) }
}

function percent(n: number): string {
  return `${String(Math.round(n * 10) / 10).replace('.', ',')} %`
}

const gew = (n: number) => `${shortTokens(n)} gew.`

/** Modell-ID kurz (`claude-sonnet-4-6` → `sonnet`), wie im Panel; Unbekanntes bleibt. */
function shortModel(model: string): string {
  const m = model.toLowerCase()
  return ['haiku', 'sonnet', 'opus', 'fable'].find(f => m.includes(f)) ?? model
}

export type CostShares = {
  agentenGewichtet?: number
  bauleiterGewichtet?: number
  fremdGewichtet?: number
  bauleiterAnteil?: number
  agentenProzent?: number
  bauleiterProzent?: number
  bauleiterModell?: string
}

type Counts = Partial<Record<'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'limitProzent', unknown>>

/**
 * Aufwand aus `costs.json` (Aufbau `hooks/lib/ledger-costs.ts :: Costs`). Hauptmaß: gewichtete Tokens
 * (`lib/tokens.ts :: weightedTokens`, aus den gespeicherten Feldern berechnet): Agenten = Summe der Rollen, Bauleiter =
 * `hauptsitzung` mit Modell und Anteil an allem (Agenten, Bauleiter, fremd) in %, fremd = Agenten ohne codecycle-Rolle.
 * Daneben die Prozentpunkte des 5-Stunden-Fensters als Konto-Näherung: Agenten = Summe `limitProzent` der Rollen,
 * Bauleiter = `hauptsitzung.limitProzent`. Fehlt die Datei oder ein Wert, fehlt das Feld.
 */
export function costShares(file: string): CostShares {
  if (!existsSync(file)) return {}
  let c: { rollen?: unknown; hauptsitzung?: Counts & { modell?: unknown }; fremd?: Counts }
  try {
    c = JSON.parse(readFileSync(file, 'utf8')) as typeof c
  } catch {
    return {}
  }
  if (!c || typeof c !== 'object') return {}
  const out: CostShares = {}
  const roles = c.rollen && typeof c.rollen === 'object' ? Object.values(c.rollen as Record<string, Counts | null>) : null
  if (roles) out.agentenGewichtet = roles.reduce((n, r) => n + weightedTokens(r), 0)
  const h = c.hauptsitzung && typeof c.hauptsitzung === 'object' ? c.hauptsitzung : null
  if (h) {
    out.bauleiterGewichtet = weightedTokens(h)
    if (typeof h.modell === 'string' && h.modell !== '') out.bauleiterModell = shortModel(h.modell)
  }
  if (c.fremd && typeof c.fremd === 'object') out.fremdGewichtet = weightedTokens(c.fremd)
  const all = (out.agentenGewichtet ?? 0) + (out.bauleiterGewichtet ?? 0) + (out.fremdGewichtet ?? 0)
  if (out.bauleiterGewichtet !== undefined && all > 0) out.bauleiterAnteil = Math.round((out.bauleiterGewichtet / all) * 1000) / 10
  const nums = (roles ?? []).map(r => r?.limitProzent).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length > 0) out.agentenProzent = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100
  if (h && typeof h.limitProzent === 'number' && Number.isFinite(h.limitProzent)) out.bauleiterProzent = h.limitProzent
  return out
}
