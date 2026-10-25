// codecycle-Mod: Statuszeile (nicht im Terminal), Bautafel über dem
// Eingabefeld, Seitenleiste auf Befehl, Fußzeile rechts im Terminal (Modell, Effort, Limit).
// Die Aufgabe kommt aus docs/codecycle/*/STATE.md; ohne offene Aufgabe eine leere Ansicht mit der zuletzt
// bearbeiteten (Beispieldaten nur mit Schalter demo-data).
// Der Limit-Stand ist echt ($.session.usage, session.measure); Kosten pro Rolle kommen aus
// costs.json (Token-Buch). Dazu die Engine (Abschnitt „Engine“ unten): Modellwahl, Berichtspfad,
// Register, Zaun, --no-verify-Sperre, codecycle_budget. Alles in einer Datei, weil Claude Code
// nur ein Hooks-Modul lädt und das Handle `$` nur an Funktionen derselben Datei weitergegeben werden darf.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, EventName, EventResult, Hook, MatchedHook, Register, SessionMeasureInput, SessionRateLimit } from 'claude-code'

import type { Board, Limits } from '../types'
import { type BandData, type FooterData, renderBand, renderFooter } from './band.tsx'
import { type PanelData, renderPanel } from './panel.tsx'
import { renderFooterDesk } from './desk.tsx'
import { supportsRichText } from './lib/desk-parts.ts'
import { DEFAULT_THRESHOLD, budgetText, checkContextNote, budgetNote, contextAdvice, warnings } from './lib/budget.ts'
import { BROWSER_CLOSE_TOOL, type BrowserUse, browserAfter, browserOpenContext, browserOpenHint, tracksBrowser } from './lib/browser-close.ts'
import { type Hint, type HintKind, effortFromArgs, rankHints, savedChanged, savedEffortOf, savedMark, startEffortOf } from './lib/term-parts.ts'
import { type Spawn, appendNote, parseSpawnPrompt, progressNote, reportNote, reportPath, rewriteSpawn, spawnFrom } from './lib/spawn-message.ts'
import { controlFileReason, fenceDenyText, hookCriticalReason, isReaderRole, readerCheck, writeTargetsOf } from './lib/fence.ts'
import { bashReadTargets } from '../lib/bash-read-targets.ts'
import { bashSearchCount } from '../lib/bash-search.ts'
import { bashWriteTargets } from '../lib/bash-write-targets.ts'
import { hookBypass } from '../lib/guard-bypass.ts'
import { baselineCall, checkCall, partBookkeepingCall, pythonCall, soloCheckCall } from '../lib/guard-calls.ts'
import {
  type Costs,
  type MainEntry,
  addAgentLimit,
  addLimitDelta,
  addMainLimit,
  addMainStep,
  addStep,
  closeRun,
  emptyMain,
  mergeMain,
  noteMainStart,
  openRun,
  rolePercentSum,
  workTimeMs,
  bookSnapshot,
  emptyCosts,
  metricsOf,
  noteRun,
  parseCosts,
  roleCosts,
} from './lib/ledger-costs.ts'
import {
  type Registry,
  setWorkTime,
  mergeChanges,
  parseGitChanges,
  parseReceiptStatus,
  parseRegistry,
  recordTouch,
  registerAgent,
  samePath,
  setVerdict,
  toRepoRelative,
  worktreeOf,
} from './lib/ledger-registry.ts'
import { chooseModel, parseModels, roleOf, type ModelsFile } from './lib/models.ts'
import type { ProtectedConfig } from '../lib/protected.ts'
import { inRoot, mainRootFromCommonDir } from '../lib/project-root.ts'
import {
  type AgentRow,
  type LiveAgent,
  CACHE_TTL_LONG_MS,
  CACHE_TTL_SHORT_MS,
  activityOf,
  agentDetail,
  agentRows,
  cacheState,
  cacheText,
  cacheTtlFromAgentFile,
  finishedSteps,
  parseStep,
  progressOf,
} from './lib/agent-view.ts'
import { TASKS_DIR, TOOL_CONFIG } from '../lib/paths.ts'
import {
  type ClaimSignal,
  type PendingSince,
  NO_CLAIM,
  claimAfter,
  mainTarget,
  promptSkill,
  savedClaimOf,
  skillKind,
  taskDirOfPath,
  taskDirsMentioned,
  withSavedClaim,
  withoutSavedClaim,
} from './lib/main-claim.ts'
import { correctedNote, resolveTaskDir } from './lib/task-dir.ts'
import { SOLO_REVIEWER, mergedBranches, partMergeProblem, partReviewerStartProblem, reviewerStartProblem, soloMergeProblem, soloWriteDeny } from './lib/solo.ts'
import type { CrewHead } from './lib/agent-svg.ts'
import { type NodeState, type SetupState, copyStateFrom, nodeStateFrom, nodeWarning, setupHint, splitUpdateOutput, toolCopyHint } from './lib/setup-check.ts'
import { TOOL_VERSION } from '../tool/version.ts'
import { bookWritable, parseState as parseTaskState } from '../lib/state-file.ts'
import { canonicalRole } from '../lib/roles.ts'
import { isPartReview, partNameOf, requiredReports, soloReportFor } from '../lib/solo-findings.ts'
import {
  type Switches,
  defaultSwitches,
  isOn,
  parseSwitches,
  switchValue,
} from '../lib/switches.ts'
import {
  EMPTY_BOARD,
  NO_LIMITS,
  SAMPLE_BOARD,
  limitsFrom,
  parseState,
  pickActive,
  pickLatest,
  resetText,
  staleLimits,
  type ShownLimits,
} from './state'

const PANE = 'codecycle-panel'
const PANE_TITLE = 'codecycle'
// Die Werte stehen hier und nicht in einer eigenen Datei: Claude Code liest Atome nur aus Konstanten dieser Datei.
const board = atom({ plugin: 'codecycle', key: 'board' } as const, EMPTY_BOARD)
const limits = atom({ plugin: 'codecycle', key: 'limits' } as const, NO_LIMITS)
const collapsed = atom({ plugin: 'codecycle', key: 'collapsed' } as const, false)
const context = atom({ plugin: 'codecycle', key: 'context' } as const, null)
const mainModel = atom({ plugin: 'codecycle', key: 'mainModel' } as const, '')
const crew = atom({ plugin: 'codecycle', key: 'crew' } as const, [])
const crewNow = atom({ plugin: 'codecycle', key: 'crewNow' } as const, 0)
const selectedAgent = atom({ plugin: 'codecycle', key: 'selectedAgent' } as const, null)
const closedSections = atom({ plugin: 'codecycle', key: 'closedSections' } as const, [])
const setupState = atom({ plugin: 'codecycle', key: 'setup' } as const, { projekt: null, node: null, config: true, kopie: null })
/** Effort der Hauptsitzung, gemessen (turn.step ohne agentId, /effort mit Stufe, gespeicherte Änderung im 2-s-Takt); leer = unbekannt */
const mainEffort = atom({ plugin: 'codecycle', key: 'mainEffort' } as const, '')
/** Startwert des Efforts (Umgebung, gespeicherte Stufe, Standard des Modells), gedimmt, bis ein gemessener Wert kommt */
const startEffort = atom({ plugin: 'codecycle', key: 'startEffort' } as const, '')
const STORE_COLLAPSED = 'collapsed'
/** Letzter echter Limit-Stand `{ at, limits }` für neue Sitzungen; `$.store` bleibt zwischen Sitzungen erhalten */
const STORE_LIMITS = 'lastLimits'
/** Zuordnung der Hauptsitzung je Sitzungs-ID über das Prozessende hinaus (hooks/lib/main-claim.ts :: SavedClaim) */
const STORE_CLAIMS = 'mainClaims'
const BASELINE_DENY =
  'codecycle: Grundlage für guard setzt nur der Bauleiter oder codecycle:toolsmith (codecycle guard --record, exclude, install-tool, hooks install). Melde den Bedarf im Bericht unter „Offene Punkte“.'
const PART_DENY =
  'codecycle: codecycle solo teil start|fertig und solo plan (Teil-Branch, STATE.md) ruft nur die Hauptsitzung auf. Prüfen darfst du mit codecycle check.'

/**
 * Eingeklappt? Solange `session.start` den Wert nicht aus `$.store` geladen hat (Atom nie geschrieben, Version 0),
 * liest es selbst aus `$.store`: Die Bautafel zeichnet so richtig, auch wenn der Mod erst nach dem Sitzungsstart
 * zeichnet (Desktop-App). Nur lesen: Beim Zeichnen darf der Mod nicht schreiben.
 */
async function shownCollapsed($: EngineInterface): Promise<boolean> {
  const s = await $.state.get({ plugin: 'codecycle', key: 'collapsed' })
  if (s.version > 0) return s.value === true
  // einmal je Laden des Mods aus $.store, danach aus dem Zwischenspeicher (nicht bei jedem Zeichnen)
  storedCollapsed ??= (await $.store.get(STORE_COLLAPSED).catch(() => undefined)) === true
  return storedCollapsed
}

/** Zwischenspeicher für shownCollapsed, solange das Atom nie geschrieben wurde */
let storedCollapsed: boolean | undefined
/** Zwischenspeicher für shownLimits (einmal aus `$.store` gelesen; setLimits hält ihn nach) */
let storedLimits: unknown
let storedLimitsLoaded = false

/**
 * Limit-Stand für die ANZEIGE (Bautafel, Statuszeile, Seitenleiste): der frische Wert aus dem Atom; solange es noch
 * keinen gibt (neue Sitzung vor der ersten Antwort), der zuletzt gespeicherte Stand mit `alt` (Kennzeichnung „Stand HH:MM“,
 * abgelaufene Fenster „neu seit“). Nur lesen, beim Zeichnen darf der Mod nicht schreiben. Budget-Werkzeug, Limit-Messung
 * pro Rolle und Warnungen ab 80 % lesen weiter nur den frischen Wert.
 */
async function shownLimits($: EngineInterface): Promise<{ lim: Limits; alt?: ShownLimits }> {
  const fresh = await read($, limits)
  if (fresh.fuenfStunden !== null || fresh.woche !== null) return { lim: fresh }
  if (!storedLimitsLoaded) {
    storedLimits = await $.store.get(STORE_LIMITS).catch(() => undefined)
    storedLimitsLoaded = true
  }
  if (!storedLimits) return { lim: fresh }
  const alt = staleLimits(storedLimits, await $.clock.now())
  return alt ? { lim: alt.lim, alt } : { lim: fresh }
}

/**
 * Statuszeile. Sitzungen im Terminal bekommen keine mehr (die
 * Aufgabe steht auf der Bautafel, Limit in der Fußzeile). Die Statuszeile gilt für die ganze Sitzung, nicht je
 * Oberfläche. Auch die Desktop-App bekommt keine mehr, das Limit steht dort ebenfalls in der Fußzeile
 * (`SessionMode`). Gelöscht wird weiter bei jedem Anlass, damit eine Zeile aus einer älteren Version verschwindet.
 */
async function refreshStatus($: EngineInterface) {
  $.ui.status(undefined)
}

/** Zeichnet die Sitzung im Terminal? Nicht lesbar: nein (dann bleibt alles wie bisher) */
async function drawsOnTerminal($: EngineInterface): Promise<boolean> {
  try {
    return (await $.session.surfaces()).includes('terminal')
  } catch {
    return false
  }
}

async function setCollapsed($: EngineInterface, value: boolean) {
  await update($, collapsed, () => value)
  await $.store.set(STORE_COLLAPSED, value)
}

async function setLimits($: EngineInterface, rateLimits: readonly SessionRateLimit[]) {
  // ohne Messwert (vor der ersten Antwort, ohne Abo) den letzten Stand nicht mit „–“ überschreiben
  if (rateLimits.length === 0) return
  const next = limitsFrom(rateLimits)
  if (JSON.stringify(next) !== JSON.stringify(await read($, limits))) {
    await update($, limits, () => next)
    // echte Messung: Stand mit Messzeit für die nächste Sitzung ablegen (nur hier, nie beim Zeichnen)
    const entry = { at: await $.clock.now(), limits: next }
    storedLimits = entry
    storedLimitsLoaded = true
    await $.store.set(STORE_LIMITS, entry).catch(() => undefined)
    await refreshStatus($)
  }
}

/**
 * Sucht die aktive Aufgabe unter docs/codecycle/. Ohne offene Aufgabe: leere Ansicht mit der zuletzt
 * bearbeiteten (`letzte`, ihre Kosten und Kennzahlen); Beispieldaten nur mit Schalter demo-data.
 */
async function loadBoard($: EngineInterface): Promise<Board> {
  await reloadConfig($)
  const fallback = isOn(switches, 'demo-data') ? SAMPLE_BOARD : EMPTY_BOARD
  let entries: Awaited<ReturnType<EngineInterface['fs']['list']>>
  try {
    if (!(await projectExists($, TASKS_DIR))) return fallback
    entries = await $.fs.list(await projectPath($, TASKS_DIR))
  } catch (err) {
    $.ui.log(`codecycle: ${TASKS_DIR} nicht lesbar: ${String(err)}`, { to: 'debug' })
    return fallback
  }
  const boards: Board[] = []
  for (const entry of entries) {
    if (entry.kind !== 'dir') continue
    const path = `${TASKS_DIR}/${entry.name}/STATE.md`
    if (!(await projectExists($, path))) continue
    try {
      let b = parseState(await projectRead($, path), path)
      const costsPath = `${TASKS_DIR}/${entry.name}/costs.json`
      if (await projectExists($, costsPath)) {
        const costs = parseCosts(await projectRead($, costsPath), entry.name)
        b = { ...b, kosten: roleCosts(costs), kennzahlen: metricsOf(costs) }
      }
      boards.push(b)
    } catch (err) {
      $.ui.log(`codecycle: ${path} nicht lesbar: ${String(err)}`, { to: 'debug' })
    }
  }
  const active = pickActive(boards)
  if (active) return active
  if (fallback === SAMPLE_BOARD) return SAMPLE_BOARD
  const last = pickLatest(boards)
  if (!last) return EMPTY_BOARD
  return {
    ...EMPTY_BOARD,
    kosten: last.kosten,
    ...(last.kennzahlen ? { kennzahlen: last.kennzahlen } : {}),
    letzte: { aufgabe: last.aufgabe, zustand: last.zustand, quelle: last.quelle },
  }
}

async function refreshBoard($: EngineInterface) {
  // Hauptordner neu, falls die Sitzung ihn gewechselt hat (/cd, Worktree); ein Shell-cd ändert ihn nicht
  await rootOf($, true)
  const next = await loadBoard($)
  const before = await read($, board)
  if (JSON.stringify(before) !== JSON.stringify(next)) {
    await update($, board, () => next)
  }
  // Ohne offene Aufgabe: Buch der letzten Aufgabe nur lesen, damit die Agenten-Leiste ihre Zahlen behält
  // (es wird nichts hineingebucht: die Hauptsitzung bucht nur in die Aufgabe, an der diese Sitzung arbeitet, siehe claimMain).
  const last = dirOf(next.letzte?.quelle)
  if (last && !books.has(last)) await bookOf($, last).catch(() => undefined)
  await refreshStatus($)
}

function openPanel($: EngineInterface) {
  return $.ui.open({ id: PANE, title: PANE_TITLE })
}

/**
 * Knopf „Details“ als Umschalter: offen und vorn → schließen; sonst öffnen (auch wenn sie offen, aber hinter einer
 * anderen Seitenleiste liegt: dann nach vorn holen). Der Befehl /codecycle-panel bleibt reines Öffnen.
 */
async function togglePanel($: EngineInterface) {
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane?.isShown) {
    await $.ui.close({ id: PANE })
    return
  }
  const opened = await openPanel($)
  if (!opened.isPlaced) $.ui.toast('codecycle: Seitenleiste wartet auf mehr Platz.')
}

// ---------------------------------------------------------------------------
// Engine: Modellwahl, Berichtspfad, Token-Buch, Register, Zaun, Budget

const CODECYCLE_MD = '.claude/codecycle.md'
/** Versionsvermerk der Werkzeug-Kopie (tool/copy.ts, COPY_DIR + COPY_INFO); Vergleich mit TOOL_VERSION des Plugins */
const COPY_INFO = '.codecycle/tool/.copy-info.json'
const STORE_ROLE_AVG = 'roleAvg'
const BUDGET_TOOL = 'codecycle_budget'
const STEP_TOOL = 'codecycle_step'
/** /codecycle:update lädt am Ende das Plugin neu */
const RELOAD_TOOL = 'codecycle_reload'
/** Vorschlag im leeren Eingabefeld (Tab, Enter), solange die Werkzeug-Kopie veraltet ist oder fehlt */
const UPDATE_COMMAND = '/codecycle:update'
const CONTINUE_COMMAND = '/codecycle:continue'
/** ebenso, solange das Projekt nicht eingerichtet ist (dann gibt es keine Bautafel mit dem Hinweis) */
const SETUP_COMMAND = '/codecycle:setup'
/** `codecycle update` lässt über guard die Tests einmal laufen; höchstens zehn Minuten (Grenze von $.process.run) */
const UPDATE_TIMEOUT_MS = 600_000
/**
 * Meldung nach /codecycle:update mit Neuladen. Ehrlich: In der Desktop-App lief /reload-plugins per command.run an, meldete
 * aber selbst „isn't available over a remote connection“; command.run lehnt dann nicht ab, der Rückfall greift nicht.
 */
const RELOAD_PLANNED = 'Neuladen eingeplant: /reload-plugins läuft gleich. Falls nicht neu geladen wird: /reload-plugins eingeben oder Claude Code neu starten.'
/**
 * Token-Buch für Läufe ohne Aufgabe (Einrichter, Werkzeugmeister). Die Hauptsitzung bucht nur dann
 * hierher, wenn diese Sitzung /codecycle:setup aufrief oder einen codecycle-Agenten ohne Aufgabe startete (claimMain; sonst
 * entstünde in jedem Projekt, in dem das Plugin aktiv ist, ein Ordner .codecycle/).
 */
const SETUP_DIR = '.codecycle/setup'
/** So viele Agenten behält die Agenten-Leiste im Speicher */
const MAX_CREW = 60
const CACHE_MS = 30_000
const FLUSH_MS = 10_000

type Runtime = {
  id: string
  rolle: string
  paket: string | null
  dir: string | null
  /** Ordner des Token-Buchs und Registers: der Aufgabenordner, ohne Aufgabe SETUP_DIR */
  book: string
  groesse: string
  cwd?: string
  /** HEAD des Worktrees beim Start (nur wenn cwd ein anderer Ordner als der Hauptordner ist) */
  startCommit?: string
  /** Worktree-Pfad, für den schon ein Startstand gesucht wurde (aus Werkzeugaufruf oder Startnachricht abgeleitet) */
  wtTried?: string
  /** Stand des 5-Stunden-Fensters beim Beginn des laufenden Zuges */
  baseline?: number | null
  /** Berichtspfad aus der Startnachricht (absolut im Hauptordner); einziges Schreibziel einer Lese-Rolle */
  bericht?: string
  /** Verweigerungen des Lese-Zauns in Folge; ab READER_STOP_AFTER (hooks/lib/fence.ts) kommt der Stopp-Hinweis */
  verweigert?: number
  /** Rolle mit Browser: war der letzte Browser-Aufruf `browser_close`? (hooks/lib/browser-close.ts) */
  browser?: BrowserUse
}

/** saved: Inhalt ohne Zeitstempel, wie zuletzt gelesen oder geschrieben (bookSnapshot) */
type Book = { costs: Costs; registry: Registry; dirty: boolean; saved: string }
type Cached<T> = { at: number; value: T }

const pad = (s: string): string => s.replace(/[\\/]+$/, '')
const join = (a: string, b: string): string => `${pad(a)}/${b}`
const iso = (ms: number): string => new Date(ms).toISOString()

let switches: Switches = defaultSwitches()

let models: ModelsFile | null = null

let protectedConfig: ProtectedConfig | null = null

// Durchschnitt je Rolle in Prozentpunkten des 5h-Fensters für codecycle_budget: Konto-Näherung (andere Sitzungen zählen
// mit); das Budget braucht das Fenster und bleibt deshalb bei Prozent (Entscheidung 2a)
let roleAvg: Record<string, { laeufe: number; prozent: number }> = {}

const agents = new Map<string, Runtime>()

/** Werkzeuge, die beim Sitzungsstart wirklich angemeldet wurden */
const registered = new Set<string>()

/** Schalter, zu denen die Meldung „Neustart nötig“ schon kam (einmal je Sitzung und Laden des Mods) */
const restartWarned = new Set<string>()

/**
 * Hauptordner des Projekts = Git-Hauptordner: Wurzel für alle Projektpfade (Bücher,
 * `.claude/codecycle.md`, `docs/codecycle/`, `.codecycle/`, Berichte) und für Pfade relativ zum Projekt.
 * Vorher galten relative Pfade vom Arbeitsordner der Sitzung aus; stand der nach einem `cd` im Aufgabenordner,
 * entstanden verschachtelte Bücher und die Bautafel fand weder Projekt noch Aufgabe. Bestimmt beim Sitzungsstart,
 * neu bei geändertem `$.session.root()` (`/cd`, Worktree-Wechsel): `$.session.repo()` (bei Worktrees der
 * Hauptordner), sonst `git rev-parse --git-common-dir`, sonst `$.session.root()`.
 */
let projectRoot: string | null = null
/** `$.session.root()`, zu dem `projectRoot` bestimmt wurde; undefined = noch nicht bestimmt */
let projectKey: string | null | undefined

async function rootOf($: EngineInterface, recheck = false): Promise<string | null> {
  if (projectKey !== undefined && !recheck) return projectRoot
  let key: string | null = null
  try {
    key = (await $.session.root()) || null
  } catch {
    key = null
  }
  if (projectKey !== undefined && key === projectKey) return projectRoot
  projectKey = key
  projectRoot = (await gitMainRoot($, key)) ?? key
  return projectRoot
}

/** Git-Hauptordner (auch aus einem Unterordner oder Worktree); null ohne Git. */
async function gitMainRoot($: EngineInterface, base: string | null): Promise<string | null> {
  try {
    const repo = await $.session.repo()
    if (repo?.root) return repo.root
  } catch {
    // nicht verfügbar: über git
  }
  const out = await runIn($, ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], base ?? undefined)
  return out === null ? null : mainRootFromCommonDir(out, base)
}

/** Projektpfad im Hauptordner (absolute Pfade bleiben). */
async function projectPath($: EngineInterface, path: string): Promise<string> {
  return inRoot(await rootOf($), path)
}

// Dateizugriffe mit Projektpfaden: immer im Hauptordner, nie relativ zum Arbeitsordner der Sitzung
async function projectExists($: EngineInterface, path: string): Promise<boolean> {
  return $.fs.exists(await projectPath($, path))
}

async function projectRead($: EngineInterface, path: string): Promise<string> {
  return $.fs.read(await projectPath($, path))
}

async function projectWrite($: EngineInterface, path: string, text: string): Promise<void> {
  await $.fs.write(await projectPath($, path), text)
}

/** Plugin-Ordner und Home des Nutzers (beim Start gemerkt): Pfade dort stehen im Register als `<plugin>/…` und `~/…` */
let pluginDir: string | null = null
let homeDir: string | null = null

async function loadOutside($: EngineInterface): Promise<void> {
  pluginDir = $.plugin.root || null
  homeDir = null
  // $.env.get nimmt nur Namen als Text im Aufruf: zwei getrennte Aufrufe statt einer Schleife
  try {
    const v = await $.env.get('USERPROFILE')
    if (typeof v === 'string' && v !== '') homeDir = v
  } catch {
    // nicht lesbar: toRepoRelative verkürzt Benutzerordner auch am Muster
  }
  if (!homeDir) {
    try {
      const v = await $.env.get('HOME')
      if (typeof v === 'string' && v !== '') homeDir = v
    } catch {
      // wie oben
    }
  }
}

/** Pfad relativ zum Projekt (Hauptordner, Worktree des Agenten), sonst `<plugin>/…` oder `~/…` statt Benutzername. */
const relPath = (p: string, roots: readonly (string | null | undefined)[]): string => toRepoRelative(p, roots, { plugin: pluginDir, home: homeDir })

/**
 * Agenten mit Browser, die ohne `browser_close` endeten (Agent-ID → Hinweis dem Bauleiter schon als Kontext gegeben).
 * Bleibt auf der Bautafel, bis die Hauptsitzung `browser_close` aufruft oder derselbe Agent ihn per Folgenachricht schließt.
 */
const browserOpen = new Map<string, { gemeldet: boolean }>()

const books = new Map<string, Book>()

const states = new Map<string, Cached<ReturnType<typeof parseTaskState> | null>>()

// ---------------------------------------------------------------------------
// Dateien lesen
async function readText($: EngineInterface, path: string): Promise<string | null> {
  try {
    if (!(await projectExists($, path))) return null
    return await projectRead($, path)
  } catch {
    return null
  }
}

/** Hinweis, solange der alte Schalter effort-by-size im Projekt steht (wirkungslos). */
const STALE_EFFORT_HINT = 'Schalter effort-by-size ist wirkungslos (Effort steht je Rolle in der Agenten-Datei); Zeile aus .claude/codecycle.md entfernen.'
let staleEffortSwitch = false

async function reloadConfig($: EngineInterface): Promise<void> {
  switches = parseSwitches(await readText($, CODECYCLE_MD))
  // Kein Standardwert mehr: der Schlüssel steht nur in der Liste, wenn er im Text steht
  staleEffortSwitch = 'effort-by-size' in switches
  const cfg = await readText($, TOOL_CONFIG)
  try {
    protectedConfig = cfg ? (JSON.parse(cfg.replace(/^﻿/, '')) as ProtectedConfig) : null
  } catch {
    protectedConfig = null
  }
  if (!models) {
    const text = await readText($, `${$.plugin.root}/models.json`)
    models = text ? parseModels(text) : null
  }
}

async function fresh<T>(cache: Map<string, Cached<T>>, key: string, now: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  const value = await load()
  cache.set(key, { at: now, value })
  return value
}

async function stateOf($: EngineInterface, dir: string) {
  return fresh(states, dir, await $.clock.now(), async () => {
    const text = await readText($, `${dir}/STATE.md`)
    if (text === null) return null
    try {
      return parseTaskState(text, `${dir}/STATE.md`)
    } catch {
      return null
    }
  })
}

// ---------------------------------------------------------------------------
// Token-Buch und Register (Dateien im Aufgabenordner)
/** Bücher, die gerade geladen werden: gleichzeitige Aufrufer warten auf dasselbe Laden (sonst gingen Buchungen verloren). */
const loadingBooks = new Map<string, Promise<Book>>()

async function bookOf($: EngineInterface, dir: string): Promise<Book> {
  const hit = books.get(dir)
  if (hit) return hit
  const pending = loadingBooks.get(dir)
  if (pending) return pending
  const load = loadBook($, dir)
  loadingBooks.set(dir, load)
  try {
    return await load
  } finally {
    loadingBooks.delete(dir)
  }
}

async function loadBook($: EngineInterface, dir: string): Promise<Book> {
  const name = dir.split('/').filter(Boolean).at(-1) ?? dir
  const costs = parseCosts(await readText($, `${dir}/costs.json`), name)
  const registry = parseRegistry(await readText($, `${dir}/agents.json`), name)
  const book: Book = { costs, registry, dirty: false, saved: bookSnapshot(costs, registry) }
  books.set(dir, book)
  // Agenten nach einem Neuladen des Mods wieder kennen; der Bericht gilt im Hauptordner (wie reportPath)
  const root = await rootOf($)
  for (const a of Object.values(registry.agenten)) {
    if (!agents.has(a.id)) {
      const bericht = a.bericht && root && !/^([\\/]|[A-Za-z]:|~)/.test(a.bericht) ? `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${a.bericht}` : undefined
      agents.set(a.id, { id: a.id, rolle: a.rolle, paket: a.paket, dir: dir === SETUP_DIR ? null : dir, book: dir, groesse: '', baseline: null, ...(bericht ? { bericht } : {}) })
    }
  }
  return book
}

/**
 * Schreibt geänderte Bücher: nur bei echter Änderung (ohne Zeitstempel), und Aufgabenbücher nur,
 * solange die STATE.md der Aufgabe da ist und nicht auf fertig/verworfen steht (frisch gelesen, nicht aus dem
 * Zwischenspeicher). Sonst bleibt das Buch im Speicher und `dirty`: Buchungen in eine fertige Aufgabe landen nie
 * auf der Platte, und nach dem Abschluss-Commit bleibt der Arbeitsbaum sauber.
 */
async function flush($: EngineInterface): Promise<void> {
  for (const [dir, b] of books) {
    if (!b.dirty) continue
    if (dir !== SETUP_DIR && !bookWritable(await readText($, `${dir}/STATE.md`))) continue
    b.dirty = false
    const snapshot = bookSnapshot(b.costs, b.registry)
    if (snapshot === b.saved) continue
    const stamp = iso(await $.clock.now())
    b.costs.aktualisiert = stamp
    try {
      await projectWrite($, `${dir}/costs.json`, `${JSON.stringify(b.costs, null, 2)}\n`)
      await projectWrite($, `${dir}/agents.json`, `${JSON.stringify(b.registry, null, 2)}\n`)
      b.saved = snapshot
    } catch (err) {
      b.dirty = true
      $.ui.log(`codecycle: Token-Buch nicht geschrieben (${dir}): ${String(err)}`, { to: 'debug' })
    }
  }
}

/** Ordner einer STATE.md (`docs/codecycle/x/STATE.md` → `docs/codecycle/x`); null für Beispiel und leer. */
function dirOf(quelle: string | undefined): string | null {
  if (!quelle || quelle === 'beispiel' || quelle === 'leer') return null
  const i = quelle.lastIndexOf('/')
  return i < 0 ? null : quelle.slice(0, i)
}

async function activeDir($: EngineInterface): Promise<string | null> {
  return dirOf((await read($, board)).quelle)
}

async function fiveHour($: EngineInterface): Promise<number | null> {
  const usage = await $.session.usage()
  // Jede Messung zieht auch Statuszeile, Bautafel und Seitenleiste nach (setLimits schreibt nur bei Änderung)
  await setLimits($, usage.rateLimits).catch(() => undefined)
  const five = usage.rateLimits.find(r => r.kind === 'five_hour')
  return five ? five.percentUsed : null
}

/**
 * Mindestabstand zwischen zwei Abfragen des Limit-Stands bei Agentenstart, -ende und im Takt. Die
 * Abfrage `$.session.usage()` ohne `breakdown` ist laut Mod-API kostenlos („The plain call costs nothing“) und liefert den
 * Stand der letzten API-Antwort; die Pause verhindert nur Schübe, wenn mehrere Agenten gleichzeitig starten oder enden.
 */
const LIMIT_PULL_MS = 2_000
let limitsPulledAt = Number.NEGATIVE_INFINITY

/** Limit-Stand neu lesen und Statuszeile, Bautafel und Seitenleiste nachziehen (nicht erst mit session.measure). */
async function pullLimits($: EngineInterface): Promise<void> {
  try {
    const now = await $.clock.now()
    if (now - limitsPulledAt < LIMIT_PULL_MS) return
    limitsPulledAt = now
    await setLimits($, (await $.session.usage()).rateLimits)
  } catch (err) {
    $.ui.log(`codecycle: Limit-Stand nicht gelesen (${String(err)})`, { to: 'debug' })
  }
}

// ---------------------------------------------------------------------------
// Start eines Agenten: Modell, Berichtspfad
// Der reine Teil (Typ Spawn, Textbausteine) steht in hooks/lib/spawn-message.ts.

async function runIn($: EngineInterface, argv: string[], cwd?: string): Promise<string | null> {
  try {
    const r = await $.process.run(argv, { ...(cwd ? { cwd } : {}), timeoutMs: 20_000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

/** Eintrag in models.json für den Schlussprüfer mit `Auftrag: Teil` (Prüfer je Teil, ohne eigene Agentendatei) */
const PART_REVIEWER = 'part-reviewer'

/** Modell für den Agentenstart nach Rolle (Schlussprüfer mit `Auftrag: Teil`: `part-reviewer`); ohne lesbare models.json keines */
function spawnModel(role: string, prompt = ''): { model: string | undefined; reason: string } {
  if (!models) return { model: undefined, reason: 'models.json nicht lesbar' }
  return chooseModel({ role: role === SOLO_REVIEWER && isPartReview(prompt) ? PART_REVIEWER : role, models })
}

async function prepare($: EngineInterface, e: { prompt: string }, role: string): Promise<Spawn | { deny: string }> {
  await reloadConfig($)
  const parsed = parseSpawnPrompt(e.prompt, role)
  // Aufgabenordner aus der aktiven Aufgabe, nicht aus dem Text (spawnTaskDir); falscher Ordner → kein Start
  const taskDir = await spawnTaskDir($, parsed.aufgabeDir)
  if (taskDir.kind === 'deny') return { deny: taskDir.text }
  const dir = taskDir.kind === 'ok' ? taskDir.dir : await activeDir($)
  // Pakete gibt es nur in alten Register-Einträgen; neue Agenten haben keins
  const paketId = null
  const state = dir ? await stateOf($, dir) : null

  // Modell
  const { model, reason } = spawnModel(role, e.prompt)

  let text = ''
  // Hinweis nur, wenn das Werkzeug beim Sitzungsstart wirklich angemeldet wurde; Werkzeuge meldet der Mod
  // nur in session.start an, ein später gesetzter Schalter wirkt erst nach einem Neustart der Sitzung.
  if (isOn(switches, 'agent-progress') && registered.has(STEP_TOOL)) {
    text = appendNote(text, progressNote(STEP_TOOL))
  }
  warnRestart($, 'agent-progress', STEP_TOOL)
  if (taskDir.kind === 'ok' && taskDir.corrected && dir) text = appendNote(text, correctedNote(dir, taskDir.corrected))
  // Bericht in den Hauptordner, nicht in einen Worktree
  const root = await rootOf($)
  let bericht: string | undefined
  if (root) {
    // Schlussprüfer: fester Name, den Merge-Sperre und `codecycle solo funde` lesen (`Auftrag: Sicherheit`: zweiter Bericht)
    const named = role === SOLO_REVIEWER ? soloReportFor(e.prompt) : parsed.bericht
    bericht = reportPath({ root, dir, paket: paketId, rolle: role, ...(named ? { bericht: named } : {}) })
    // Pflicht ausdrücklich, weil allgemeine Vorgaben der Umgebung von Berichts-Dateien abraten
    text = appendNote(text, reportNote(bericht))
  }
  return spawnFrom({
    role,
    dir,
    paket: paketId,
    groesse: state?.groesse ?? '',
    model,
    reason,
    text,
    explicitDir: !!parsed.aufgabeDir,
    bericht,
  })
}

/**
 * Offene Aufgabenordner (`docs/codecycle/x` mit STATE.md, nicht fertig/verworfen; unlesbare STATE.md zählt als offen
 * wie bei bookWritable). null, wenn docs/codecycle/ nicht lesbar ist: dann prüft spawnTaskDir nichts.
 */
async function openTaskDirs($: EngineInterface): Promise<string[] | null> {
  try {
    if (!(await projectExists($, TASKS_DIR))) return []
    const out: string[] = []
    for (const entry of await $.fs.list(await projectPath($, TASKS_DIR))) {
      if (entry.kind !== 'dir') continue
      const dir = `${TASKS_DIR}/${entry.name}`
      if (bookWritable(await readText($, `${dir}/STATE.md`))) out.push(dir)
    }
    return out
  } catch (err) {
    $.ui.log(`codecycle: ${TASKS_DIR} nicht lesbar (${String(err)})`, { to: 'debug' })
    return null
  }
}

/**
 * Aufgabenordner eines neuen Agenten aus der aktiven Aufgabe statt aus dem Text der Startnachricht (Regel in
 * hooks/lib/task-dir.ts): die Aufgabe dieser Sitzung (claimMain), sonst die einzige offene.
 * Davon leiten sich Bericht, Quittung und der Lese-Rollen-Zaun (Runtime.bericht) ab.
 * Ein Netz gegen Versehen (vertippter Ordner, Satzpunkt), keine Sicherheitsgrenze.
 */
async function spawnTaskDir($: EngineInterface, named: string | undefined) {
  const target = mainTarget(claim)
  const claimed = target.kind === 'dir' && target.dir.startsWith(`${TASKS_DIR}/`) ? target.dir : null
  return resolveTaskDir({ named, open: await openTaskDirs($), expected: claimed })
}

/** Schalter an, Werkzeug aber nicht angemeldet: einmal melden, dass ein Neustart der Sitzung nötig ist. */
function warnRestart($: EngineInterface, name: string, tool: string): void {
  if (!isOn(switches, name) || registered.has(tool) || restartWarned.has(name)) return
  restartWarned.add(name)
  const text = `codecycle: Schalter ${name} ist an, das Werkzeug ${tool} wird aber nur beim Sitzungsstart angemeldet. Neustart der Sitzung nötig.`
  void Promise.resolve($.ui.toast(text)).catch(() => undefined)
  void Promise.resolve($.ui.log(text, { to: 'debug' })).catch(() => undefined)
}

async function onSpawned($: EngineInterface, cwd: string | undefined, s: Spawn, agentId: string, model: string, prompt = ''): Promise<void> {
  const rt: Runtime = {
    id: agentId,
    rolle: s.role,
    paket: s.paket,
    dir: s.dir,
    book: s.dir ?? SETUP_DIR,
    groesse: s.groesse,
    ...(cwd ? { cwd } : {}),
    ...(s.bericht ? { bericht: s.bericht } : {}),
    baseline: null,
  }
  agents.set(agentId, rt)
  // Startstand des Worktrees, damit beim Ende Git zeigt, was der Agent geändert hat (auch per Bash oder Skript).
  // Meldet agent.spawn keinen Arbeitsordner, aus der Startnachricht (Pfad mit --wt-) ableiten; sonst beim ersten
  // Werkzeugaufruf im Worktree (adoptWorktree).
  await adoptWorktree($, rt, cwd ?? worktreeOf(prompt) ?? undefined)
  const at = await $.clock.now()
  const entry: LiveAgent = {
    id: agentId,
    rolle: s.role,
    paket: s.paket,
    modell: model || s.model || '',
    status: 'laeuft',
    start: at,
    kontext: 0,
    laufStart: at,
    arbeitMs: 0,
    cacheTtlMs: await cacheTtlOf($, s.role),
  }
  await update($, crew, list => [...list.filter(a => a.id !== agentId), entry].slice(-MAX_CREW))
  await update($, crewNow, () => at)
  await syncRunTick($)
  // Ohne Aufgabe ins Rückfall-Buch SETUP_DIR
  const b = await bookOf($, rt.book)
  const now = iso(await $.clock.now())
  const bericht = s.bericht ? relPath(s.bericht, [await rootOf($)]) : undefined
  registerAgent(
    b.registry,
    {
      id: agentId,
      rolle: s.role,
      paket: s.paket,
      modell: model || s.model || '',
      gestartet: now,
      ...(bericht ? { bericht } : {}),
    },
    now,
  )
  noteRun(b.costs, s.role)
  // erster Lauf: Start bis Ende, mit eigenen Tokens
  openRun(b.costs, { agentId, rolle: s.role, paket: s.paket, modell: model || s.model || '' }, now)
  b.dirty = true
  // Limit-Stand bei jedem Agentenstart neu lesen, nicht erst mit der nächsten Messung der Hauptsitzung
  await pullLimits($)
}

/** Cache-Laufzeit je Rolle aus der Plugin-Agenten-Datei (nur Lesen, einmal je Laden des Mods). */
const cacheTtls = new Map<string, number>()

async function cacheTtlOf($: EngineInterface, role: string): Promise<number> {
  const hit = cacheTtls.get(role)
  if (hit !== undefined) return hit
  let ttl = CACHE_TTL_SHORT_MS
  try {
    ttl = cacheTtlFromAgentFile(await readText($, `${$.plugin.root}/agents/${role}.md`))
  } catch {
    // nicht lesbar: 5 min (Standard der Sub-Agenten)
  }
  cacheTtls.set(role, ttl)
  return ttl
}

/**
 * Hält den Startstand (HEAD) im Arbeitsordner des Agenten fest, wenn der ein anderer Ordner als der Hauptordner ist
 * (Worktree). Schlägt `git rev-parse` fehl (Pfad aus Text abgeleitet, existiert nicht), bleibt alles wie vorher.
 */
async function adoptWorktree($: EngineInterface, rt: Runtime, dir: string | undefined): Promise<void> {
  if (!dir || rt.startCommit || rt.wtTried === dir) return
  rt.wtTried = dir
  if (sameDir(dir, await rootOf($))) {
    rt.cwd ??= dir
    return
  }
  const head = await runIn($, ['git', 'rev-parse', 'HEAD'], dir)
  if (head && head.trim() !== '') {
    rt.startCommit = head.trim()
    if (!rt.cwd || sameDir(rt.cwd, await rootOf($))) rt.cwd = dir
  }
}

/** Gleicher Ordner? (Schrägstriche, Laufwerk und Groß-/Kleinschreibung egal) */
function sameDir(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return toRepoRelative(a, [b]) === '.'
}

/**
 * Beim Ende eines Agenten in einem eigenen Worktree die Änderungen aus Git ins Register übernehmen
 * (`git diff --name-status <Startcommit>` für Committetes und Geändertes, `git status --porcelain` für Neues).
 * Ergänzt nur, was die Werkzeugaufrufe nicht schon zeigten; schreibt erst mit dem nächsten flush.
 */
async function gitChanges($: EngineInterface, rt: Runtime): Promise<void> {
  if (!rt.cwd || !rt.startCommit) return
  try {
    const diff = await runIn($, ['git', 'diff', '--name-status', rt.startCommit], rt.cwd)
    const status = await runIn($, ['git', 'status', '--porcelain', '--untracked-files=all'], rt.cwd)
    if (diff === null && status === null) return
    const b = await bookOf($, rt.book)
    if (mergeChanges(b.registry, rt.id, parseGitChanges(diff ?? '', status ?? ''), iso(await $.clock.now())) > 0) b.dirty = true
  } catch (err) {
    $.ui.log(`codecycle: Git-Änderungen nicht gelesen (${String(err)})`, { to: 'debug' })
  }
}

/** Laufender Zug der Hauptsitzung (Bauleiter): Limit-Stand beim ersten Schritt, Summe der Agenten-Anteile seitdem. */
let mainTurn: { baseline: number | null; agenten: number } | null = null

// ---------------------------------------------------------------------------
// Hauptsitzung je Aufgabe. Regel und Begründung: hooks/lib/main-claim.ts. Kurz: Die Hauptsitzung bucht
// nur in eine Aufgabe, wenn sie in dieser Sitzung ein Signal gab, daran zu arbeiten (/codecycle:new|continue, Agent mit
// Aufgabenordner, Schreiben in docs/codecycle/X/); vorher in einen Vorlauf-Topf (nach /codecycle:new) oder nirgends hin.
// Früher: jede Anfrage in die gerade offene Aufgabe, auch Vorarbeit, Tester-Arbeit und Entwicklungssitzungen.

/** Woran arbeitet die Hauptsitzung dieser Sitzung? */
let claim = NO_CLAIM
/** Alle Anfragen der Hauptsitzung dieser Sitzung (nur Speicher): daraus der Startstand beim ersten Signal */
let sessionMain: MainEntry = emptyMain()
/** Vorlauf nach /codecycle:new|continue, bis feststeht, welche Aufgabe; geht dann ganz in diese Aufgabe */
let pendingMain: MainEntry = emptyMain()
/** Startstand beim Beginn des Vorlaufs (Stand von sessionMain vor dem Befehl) */
let pendingSince: PendingSince | null = null
/** Kennung der Sitzung (Zeit des ersten session.start dieser Sitzungs-ID), damit Startstände je Sitzung einmal eingetragen werden */
let sessionKey = ''
/** Sitzungs-ID, zu der claim, Töpfe und sessionKey gehören (Wechsel ohne session.start: /clear, /resume) */
let claimSession: string | null = null
/** Letzte Anfrage der Hauptsitzung (ms) und ob sie gerade arbeitet: Cache-Zeit des Bauleiters */
let mainLastStep: number | null = null
let mainBusy = false
/** Cache-Laufzeit der Hauptsitzung, wenn Claude Code sie meldet (classic.Pre/PostModelSwitch); sonst Annahme 1 h (Abo) */
let mainCacheTtl: '5m' | '1h' | null = null

const usageOf = (m: MainEntry) => ({ runden: m.runden, input: m.input, output: m.output, cacheRead: m.cacheRead, cacheWrite: m.cacheWrite })

function resetClaim(at: number): void {
  claim = NO_CLAIM
  sessionMain = emptyMain()
  pendingMain = emptyMain()
  pendingSince = null
  sessionKey = iso(at)
  claimSession = null
  mainLastStep = null
  mainBusy = false
}

/**
 * Zuordnung der Sitzung `id` aus dem Store zurückholen (Fortsetzen mit --resume in einem neuen Prozess, /resume); ohne
 * Eintrag frisch. Bindet sie an eine Aufgabe, gehen die Buchungen dort weiter; im Vorlauf bleiben Topf und Startstand.
 */
async function restoreClaim($: EngineInterface, id: string): Promise<void> {
  resetClaim(await $.clock.now())
  claimSession = id
  try {
    const saved = savedClaimOf(await $.store.get(STORE_CLAIMS), id)
    if (!saved) return
    claim = saved.claim
    sessionKey = saved.sessionKey
    pendingMain = saved.pending
    pendingSince = saved.since
    sessionMain = saved.session
  } catch (err) {
    $.ui.log(`codecycle: Zuordnung der Hauptsitzung nicht gelesen (${String(err)})`, { to: 'debug' })
  }
}

/** Zuordnung der Sitzung `id` ablegen (Sitzungsende), nach /clear löschen. */
async function saveClaim($: EngineInterface, id: string, clear: boolean): Promise<void> {
  try {
    const raw = await $.store.get(STORE_CLAIMS)
    if (clear) {
      if (savedClaimOf(raw, id)) await $.store.set(STORE_CLAIMS, withoutSavedClaim(raw, id))
      return
    }
    if (mainTarget(claim).kind === 'none' && sessionMain.runden === 0 && !savedClaimOf(raw, id)) return
    const saved = { claim, sessionKey, pending: pendingMain, since: pendingSince, session: sessionMain, at: await $.clock.now() }
    await $.store.set(STORE_CLAIMS, withSavedClaim(raw, id, saved))
  } catch (err) {
    $.ui.log(`codecycle: Zuordnung der Hauptsitzung nicht abgelegt (${String(err)})`, { to: 'debug' })
  }
}

/** Gehört der Zustand zu einer anderen Sitzungs-ID (Wechsel ohne session.start), die richtige zurückholen. */
async function syncClaimSession($: EngineInterface): Promise<void> {
  try {
    const id = await $.session.id()
    if (!id || id === claimSession) return
    // noch keiner Sitzung zugeordnet und schon Signale gesehen: übernehmen statt verwerfen
    if (claimSession === null && (mainTarget(claim).kind !== 'none' || sessionMain.runden > 0)) claimSession = id
    else await restoreClaim($, id)
  } catch (err) {
    $.ui.log(`codecycle: Sitzungs-ID nicht gelesen (${String(err)})`, { to: 'debug' })
  }
}

/** Signal „diese Sitzung arbeitet an …“ verarbeiten: Ziel setzen, beim Binden Vorlauf und Startstand ins Buch. */
async function claimMain($: EngineInterface, signal: ClaimSignal, label: string): Promise<void> {
  try {
    const before = mainTarget(claim)
    const zeit = iso(await $.clock.now())
    claim = claimAfter(claim, signal)
    const after = mainTarget(claim)
    if (after.kind === 'pending') {
      pendingSince ??= { zeit, signal: label, vorher: usageOf(sessionMain) }
      return
    }
    if (after.kind !== 'dir' || (before.kind === 'dir' && before.dir === after.dir)) return
    const b = await bookOf($, after.dir)
    if (pendingMain.runden > 0 || pendingMain.limitProzent) mergeMain(b.costs.hauptsitzung, pendingMain)
    pendingMain = emptyMain()
    // nicht „start“ nennen: der Mod-Lader verlangt eindeutige Namen für Funktionen, die $ bekommen
    const begin = pendingSince ?? { zeit, signal: label, vorher: usageOf(sessionMain) }
    pendingSince = null
    noteMainStart(b.costs, { sitzung: sessionKey, ...begin })
    if (mainCacheTtl) b.costs.hauptsitzung.cacheTtl = mainCacheTtl
    b.dirty = true
  } catch (err) {
    $.ui.log(`codecycle: Hauptsitzung nicht zugeordnet (${String(err)})`, { to: 'debug' })
  }
}

/** Schreibziele der Hauptsitzung: liegt eines in docs/codecycle/X/, arbeitet diese Sitzung an X. */
async function mainWriteSignal($: EngineInterface, input: { tool: string; file_path?: string; notebook_path?: string; command?: string }): Promise<void> {
  const targets = writeTargetsOf({ tool: input.tool, command: input.command, path: input.file_path ?? input.notebook_path })
  if (targets.length === 0) return
  const root = await rootOf($)
  for (const t of targets) {
    const dir = taskDirOfPath(relPath(t, [root]))
    if (dir) return claimMain($, { kind: 'dir', dir }, 'schreiben')
  }
}

/** Im Vorlauf: Aufgabenordner, die ein Aufruf der Hauptsitzung nennt (Pfad, Muster, Befehl); sonst keine. */
function mentionedDirs(input: { file_path?: unknown; notebook_path?: unknown; path?: unknown; command?: unknown }): string[] {
  if (mainTarget(claim).kind !== 'pending') return []
  const texts = [input.file_path, input.notebook_path, input.path, input.command].filter((t): t is string => typeof t === 'string')
  return [...new Set(texts.flatMap(taskDirsMentioned))]
}

/** Nach dem Aufruf: der erste genannte Aufgabenordner mit offener STATE.md bindet (Rückfall für Bash mit Variablen). */
async function mentionSignal($: EngineInterface, dirs: string[], tool: string): Promise<void> {
  for (const dir of dirs) {
    if (mainTarget(claim).kind !== 'pending') return
    if (bookWritable(await readText($, `${dir}/STATE.md`))) return claimMain($, { kind: 'dir', dir }, `genannt ${tool}`)
  }
}

/** Gemeldete Cache-Laufzeit der Hauptsitzung merken und ins Buch der Aufgabe dieser Sitzung schreiben. */
async function noteMainCacheTtl($: EngineInterface, ttl: unknown): Promise<void> {
  if (ttl !== '5m' && ttl !== '1h') return
  mainCacheTtl = ttl
  try {
    const target = mainTarget(claim)
    if (target.kind !== 'dir') return
    const b = await bookOf($, target.dir)
    if (b.costs.hauptsitzung.cacheTtl !== ttl) {
      b.costs.hauptsitzung.cacheTtl = ttl
      b.dirty = true
    }
  } catch (err) {
    $.ui.log(`codecycle: Cache-Laufzeit nicht gebucht (${String(err)})`, { to: 'debug' })
  }
}

/** Ende eines Bauleiter-Zuges: Anstieg des 5-Stunden-Fensters minus Agenten-Anteile in diesem Zug, ins Buch der Aufgabe dieser Sitzung. */
async function completeMain($: EngineInterface): Promise<void> {
  const turn = mainTurn
  mainTurn = null
  mainBusy = false
  if (!turn || turn.baseline === null) return
  try {
    const now = await fiveHour($)
    if (now === null) return
    // dieselbe Wahl wie in turn.step: nur in die Aufgabe, an der diese Sitzung arbeitet
    const target = mainTarget(claim)
    if (target.kind === 'pending') addMainLimit({ hauptsitzung: pendingMain } as Parameters<typeof addMainLimit>[0], now - turn.baseline - turn.agenten)
    if (target.kind !== 'dir') return
    const b = await bookOf($, target.dir)
    addMainLimit(b.costs, now - turn.baseline - turn.agenten)
    b.dirty = true
    await flush($)
  } catch (err) {
    $.ui.log(`codecycle: Limit-Messung Bauleiter: ${String(err)}`, { to: 'debug' })
  }
}

// Limit-Veränderung pro Agentenlauf (Durchschnitt pro Rolle): Näherung, bei parallelen Läufen unscharf
async function complete($: EngineInterface, e: { agentId?: string; reason: string }, text?: string): Promise<void> {
  const rt = e.agentId ? agents.get(e.agentId) : undefined
  if (!e.agentId) {
    await completeMain($)
    await pullLimits($)
    return
  }
  if (rt) {
    // Agent mit Browser ohne browser_close am Ende: dem Bauleiter melden (Bautafel, Kontext beim nächsten Prompt)
    if (tracksBrowser(rt.rolle)) {
      if (rt.browser === 'offen') browserOpen.set(rt.id, { gemeldet: false })
      else browserOpen.delete(rt.id)
    }
    // Urteil aus der Quittung; ohne Quittung bleibt das Feld leer. Live unbestätigt, ob text bei Sub-Agenten die Quittung ist.
    try {
      const v = parseReceiptStatus(text)
      if (v) {
        const b = await bookOf($, rt.book)
        setVerdict(b.registry, rt.id, v)
        b.dirty = true
      }
    } catch (err) {
      $.ui.log(`codecycle: Urteil nicht gelesen (${String(err)})`, { to: 'debug' })
    }
    // Agenten-Leiste: Lauf beendet (eine Folgenachricht an denselben Agenten setzt ihn in turn.step wieder auf „läuft“)
    const at = await $.clock.now()
    const status = e.reason === 'answer' ? 'fertig' : 'abgebrochen'
    // Lauf beenden und Arbeitszeit = Summe der Läufe in Register und Leiste
    let arbeitMs: number | undefined
    try {
      const b = await bookOf($, rt.book)
      if (closeRun(b.costs, rt.id, iso(at)) !== null) {
        const cost = b.costs.agenten[rt.id]
        arbeitMs = cost ? workTimeMs(cost) : undefined
        if (arbeitMs !== undefined) setWorkTime(b.registry, rt.id, arbeitMs)
        b.dirty = true
      }
    } catch (err) {
      $.ui.log(`codecycle: Lauf nicht abgeschlossen (${String(err)})`, { to: 'debug' })
    }
    // Fertig = Schritte total/total ohne alte Notiz, Balken 100 %; die Folgenachricht (turn.step) beginnt neu
    await update($, crew, list =>
      list.map(a =>
        a.id === rt.id
          ? {
              ...a,
              status,
              ende: at,
              ...(arbeitMs !== undefined ? { arbeitMs } : {}),
              ...(status === 'fertig' ? { schritte: finishedSteps(a.schritte), balken: 1 } : {}),
            }
          : a,
      ),
    )
    await update($, crewNow, () => at)
    await syncRunTick($)
    await gitChanges($, rt)
  }
  if (rt && e.reason === 'answer') {
    try {
      const now = await fiveHour($)
      if (now !== null && rt.baseline !== null && rt.baseline !== undefined) {
        const delta = Math.max(0, now - rt.baseline)
        const avg = (roleAvg[rt.rolle] ??= { laeufe: 0, prozent: 0 })
        avg.laeufe += 1
        avg.prozent = Math.round((avg.prozent + delta) * 100) / 100
        await $.store.set(STORE_ROLE_AVG, roleAvg)
        const b = await bookOf($, rt.book)
        addLimitDelta(b.costs, rt.rolle, delta)
        addAgentLimit(b.costs, rt.id, delta)
        b.dirty = true
        if (mainTurn) mainTurn.agenten += delta
      }
      rt.baseline = null
      await flush($)
    } catch (err) {
      $.ui.log(`codecycle: Limit-Messung: ${String(err)}`, { to: 'debug' })
    }
  }
  if (rt) {
    // Stand bei jedem Agentenende neu lesen; die Leiste erst nach der Limit-Buchung neu zeichnen (vorher zeigte der
    // Neuzeichen-Anlass oben noch den alten Anteil)
    await pullLimits($)
    const t = await $.clock.now()
    // mindestens +1 ms, damit sich der Wert sicher ändert und die Seitenleiste neu zeichnet
    await update($, crewNow, prev => Math.max(t, prev + 1))
  }
}

// ---------------------------------------------------------------------------
// Werkzeuge für Hauptsitzung und Agenten
/**
 * Antwort eines Mod-Werkzeugs: Claude Code verlangt als `result` einen String,
 * ein Array oder undefined; `{ content: [...] }` wurde abgelehnt („expected string, array or undefined“).
 */
function toolText(text: string): { result: string } {
  return { result: text }
}

function limitsOf(usage: { rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[] }) {
  const five = usage.rateLimits.find(r => r.kind === 'five_hour')
  const week = usage.rateLimits.find(r => r.kind === 'seven_day')
  return {
    fuenf: five ? five.percentUsed : null,
    woche: week ? week.percentUsed : null,
    resetFuenf: five?.resetsAt,
    resetWoche: week?.resetsAt,
  }
}

async function start($: EngineInterface): Promise<void> {
  try {
    await reloadConfig($)
    roleAvg = ((await $.store.get(STORE_ROLE_AVG)) as typeof roleAvg | undefined) ?? {}
    await rootOf($, true)
    await loadOutside($)
    registered.clear()
    await $.tool.register({
      name: BUDGET_TOOL,
      description:
        'codecycle: Limit-Stand (5-Stunden- und Wochenfenster), Reset-Zeit, Durchschnittskosten pro Rolle und Empfehlung (starten / nur klein / anhalten). Vor jedem neuen Agentenlauf fragen.',
      inputSchema: {
        type: 'object',
        properties: { role: { type: 'string', description: 'Rolle des geplanten Laufs, z. B. builder' } },
      },
    })
    registered.add(BUDGET_TOOL)
    await $.tool.register({
      name: RELOAD_TOOL,
      description:
        'codecycle: Lädt die Plugins neu (/reload-plugins), sobald die Antwort fertig ist. Nur am Ende von /codecycle:update aufrufen, wenn das Plugin aktualisiert wurde.',
      inputSchema: { type: 'object', properties: {} },
    })
    registered.add(RELOAD_TOOL)
    if (isOn(switches, 'agent-progress')) {
      await $.tool.register({
        name: STEP_TOOL,
        description:
          'codecycle: Eigenen Fortschritt an die Agenten-Leiste melden: erledigte und geplante Schritte, kurze Notiz. Nach jedem größeren Schritt einmal aufrufen, nicht öfter.',
        inputSchema: {
          type: 'object',
          properties: {
            done: { type: 'number', description: 'erledigte Schritte' },
            total: { type: 'number', description: 'Schritte insgesamt (Schätzung, darf sich ändern)' },
            note: { type: 'string', description: 'woran du gerade bist, wenige Wörter' },
          },
          required: ['done', 'total'],
        },
      })
      registered.add(STEP_TOOL)
    }
    const dir = await activeDir($)
    if (dir) await bookOf($, dir)
    await update($, mainModel, () => '')
    const model = await $.session.model()
    await update($, mainModel, () => model)
    $.clock.every(FLUSH_MS, () => void flush($))
  } catch (err) {
    $.ui.log(`codecycle: Start der Engine teilweise fehlgeschlagen: ${String(err)}`, { to: 'debug' })
  }
}

// ---------------------------------------------------------------------------
// Hauptsitzung: Füllstand und Modell (Warnung „Hauptsitzung groß“, Hinweis Sonnet)
async function measure($: EngineInterface, e: Pick<SessionMeasureInput, 'changed' | 'context'>): Promise<void> {
  if (e.changed.includes('context')) {
    const t = e.context.tokens
    await update($, context, () => (t === undefined ? null : t))
  }
}

async function turnStart($: EngineInterface): Promise<void> {
  try {
    const model = await $.session.model()
    if (model !== (await read($, mainModel))) await changeMainModel($, model)
  } catch {
    // Modell unbekannt: kein Hinweis
  }
}

// ---------------------------------------------------------------------------
// Effort und Modell der Hauptsitzung für die Fußzeile (Terminal). Ein Mod hat
// kein Feld mit dem Effort: maßgeblich ist turn.step der Hauptsitzung (erst mit der nächsten Anfrage); bis dahin der
// Startwert gedimmt; das eingebaute /effort und /model meldet Claude Code dem Mod im Terminal offenbar nicht, darum der
// 2-s-Takt auf die gespeicherte Stufe (nur lokal, kein Modellaufruf).

/** Zuletzt gesehener Stand der gespeicherten Stufe „<Modell>:<Stufe>“ (Vergleich im 2-s-Takt) */
let lastSavedEffort: string | undefined
/** Der 2-s-Takt; endet beim Neuladen des Moduls, session.start startet ihn neu */
let effortTimer: ReturnType<EngineInterface['clock']['every']> | null = null

/** Neues Modell der Hauptsitzung: Startwert neu bestimmen, gemessenen Effort verwerfen (galt dem alten Modell) */
async function changeMainModel($: EngineInterface, model: string): Promise<void> {
  await update($, mainModel, () => model)
  await update($, mainEffort, () => '')
  await refreshStartEffort($)
}

/**
 * Startwert des Efforts (gedimmt): CLAUDE_CODE_EFFORT_LEVEL, gespeicherte Stufe des Modells, effortLevel (nicht für 5.5),
 * Standard des Modells (`hooks/lib/term-parts.ts :: startEffortOf`). Legt auch den Ausgangsstand für den 2-s-Takt fest.
 */
async function refreshStartEffort($: EngineInterface): Promise<void> {
  const model = await read($, mainModel)
  if (!model) return
  let settings: Readonly<Record<string, unknown>> = {}
  try {
    settings = await $.settings.read()
  } catch {
    // Einstellungen nicht lesbar: Standard des Modells
  }
  let env: string | undefined
  try {
    env = await $.env.get('CLAUDE_CODE_EFFORT_LEVEL')
  } catch {
    env = undefined
  }
  const saved = savedEffortOf(settings, model)
  lastSavedEffort = savedMark(model, saved)
  const value = startEffortOf({ env, saved, effortLevel: settings.effortLevel, model })
  if (value !== (await read($, startEffort))) await update($, startEffort, () => value)
}

/** Gemessener Effort der Hauptsitzung; zeichnet nur bei Änderung neu */
async function setMainEffort($: EngineInterface, value: string | number): Promise<void> {
  const v = String(value)
  if (v !== (await read($, mainEffort))) await update($, mainEffort, () => v)
}

/**
 * Ein Schlag des 2-s-Takts (immer, auch ohne Aufgabe): zuerst das Modell neu lesen (Modellwechsel wird nicht
 * gemeldet), dann die gespeicherte Stufe dieses Modells vergleichen und eine Änderung als gemessen übernehmen.
 */
async function effortTick($: EngineInterface): Promise<void> {
  try {
    const m = await $.session.model()
    if (m && m !== (await read($, mainModel))) {
      await changeMainModel($, m)
      return
    }
    const model = await read($, mainModel)
    if (!model) return
    const saved = savedEffortOf(await $.settings.read(), model)
    if (savedChanged(lastSavedEffort, model, saved)) await setMainEffort($, saved!)
    lastSavedEffort = savedMark(model, saved)
  } catch {
    // nicht lesbar: nächster Schlag
  }
}

async function startEffortTick($: EngineInterface): Promise<void> {
  effortTimer?.cancel()
  effortTimer = null
  // nur fürs Terminal (Fußzeile), die Desktop-App bleibt unverändert
  if (!(await drawsOnTerminal($))) return
  effortTimer = $.clock.every(2_000, () => void effortTick($))
  $.ui.log('codecycle: Abfrage der gespeicherten Effort-Stufe alle 2 s gestartet', { to: 'debug' })
}

/**
 * Klick auf Modell oder Effort in der Fußzeile: den eingebauten Befehl in einem eigenen Uhr-Durchlauf starten und
 * nicht abwarten (`$.command.run` kehrt erst nach dem Schließen des Reglers zurück, das 10-s-Budget des Klicks wäre
 * überschritten); scheitert er, kommt „/<befehl> “ ins Eingabefeld (Rückfall).
 */
function runBuiltin($: EngineInterface, command: 'effort' | 'model'): void {
  $.clock.after(1, () => {
    $.command.run({ command }).catch(err => {
      $.ui.log(`codecycle: /${command} per command.run: ${String(err)}`, { to: 'debug' })
      void fillCommand($, command)
    })
  })
}

/**
 * /reload-plugins in die Warteschlange, nicht abgewartet: command.run lehnt in einem Hook ab, auf den der Zug wartet
 * (der Werkzeugaufruf ist so einer). Läuft, sobald die Sitzung frei ist; nie --force (Cache-Warnung entscheidet der Nutzer).
 * Rückfall: Befehl ins Eingabefeld, wie beim Klick auf Modell oder Effort.
 */
function runReload($: EngineInterface): void {
  $.clock.after(1, () => {
    $.command.run({ command: 'reload-plugins' }).catch(err => {
      $.ui.log(`codecycle: /reload-plugins per command.run: ${String(err)}`, { to: 'debug' })
      void fillCommand($, 'reload-plugins')
    })
  })
}

/**
 * Knopf „Neue Sitzung“: /clear, danach /codecycle:continue. `session.start` feuert bei /clear nicht, der Mod bleibt
 * geladen. Lehnt die Engine einen der Befehle ab, steht `/codecycle:continue` im Eingabefeld (Enter genügt).
 */
function newSession($: EngineInterface): void {
  $.clock.after(1, () => {
    $.command
      .run({ command: 'clear' })
      .then(() => $.command.run({ command: CONTINUE_COMMAND.slice(1) }))
      .catch(err => {
        $.ui.log(`codecycle: Neue Sitzung per command.run: ${String(err)}`, { to: 'debug' })
        void fillCommand($, CONTINUE_COMMAND.slice(1))
      })
  })
}

async function fillCommand($: EngineInterface, command: string): Promise<void> {
  // Mit Leerzeichen dahinter: ein Enter führt den Befehl ohne Argument aus (Vorschlagsliste gehört der Engine)
  await $.prompt.fill({ text: `/${command} ` })
}

async function end($: EngineInterface): Promise<void> {
  await flush($)
}

// ---------------------------------------------------------------------------
// Bautafel und Seitenleiste

// ---------------------------------------------------------------------------
// Einrichtung: Hinweis auf /codecycle:setup und auf fehlendes oder altes Node

/**
 * Projekt eingerichtet (`.claude/codecycle.md`), Konfiguration da, Stand der Werkzeug-Kopie. Fehlt nur `.codecycle/`
 * (frisch geklont), führt der Hinweis zu /codecycle:update statt zur Einrichtung. Nicht prüfbar: keine Hinweise.
 */
async function projectReady($: EngineInterface): Promise<Pick<SetupState, 'projekt' | 'config' | 'kopie'>> {
  try {
    const projekt = await projectExists($, CODECYCLE_MD)
    const config = await projectExists($, TOOL_CONFIG)
    const kopie = copyStateFrom((await projectExists($, COPY_INFO)) ? await projectRead($, COPY_INFO) : null)
    return { projekt, config, kopie }
  } catch {
    return { projekt: true, config: true, kopie: null } // nicht prüfbar: lieber keinen falschen Hinweis
  }
}

/** Beim Sitzungsstart: Projekt eingerichtet? Node da und neu genug? (`$.process.run`, in der Desktop-App unbestätigt) */
async function checkSetup($: EngineInterface): Promise<void> {
  let node: NodeState = null
  try {
    const r = await $.process.run(['node', '-p', 'process.versions.node'], { timeoutMs: 5_000 })
    node = nodeStateFrom({ exitCode: r.exitCode, stdout: r.stdout })
  } catch (err) {
    // Gegenprobe: startet git (ohnehin Voraussetzung), fehlt wirklich Node
    const otherCommandRuns = await $.process
      .run(['git', '--version'], { timeoutMs: 5_000 })
      .then(() => true)
      .catch(() => false)
    node = nodeStateFrom({ error: String(err), otherCommandRuns })
  }
  const files = await projectReady($)
  await update($, setupState, () => ({ ...files, node }))
  await suggestUpdate($)
}

/** Steht ein Hinweis zur Werkzeug-Kopie an, ist /codecycle:update der nächste Schritt (ohne Netz, nur lokal bekannt). */
async function updatePending($: EngineInterface): Promise<boolean> {
  return toolCopyHint(await read($, setupState), TOOL_VERSION) !== null
}

/**
 * /codecycle:update (im nicht eingerichteten Projekt /codecycle:setup) als grauer Vorschlag ins leere Eingabefeld legen, nur beim Sitzungsstart und wenn der Hinweis neu
 * auftaucht; erscheint nicht, solange dort Text steht oder ein Zug läuft. Claudes eigener Vorschlag nach einem Zug hat
 * Vorrang (Nutzer): kein `prompt.suggest`-Hook, der ihn ersetzt.
 */
async function suggestUpdate($: EngineInterface): Promise<void> {
  // Nicht eingerichtet: /codecycle:setup vorschlagen (ohne Bautafel der einzige Hinweis außerhalb der Seitenleiste)
  const text = (await read($, setupState)).projekt === false ? SETUP_COMMAND : (await updatePending($)) ? UPDATE_COMMAND : null
  if (!text) return
  await $.prompt.suggest({ text }).catch(err => $.ui.log(`codecycle: Vorschlag ${text}: ${String(err)}`, { to: 'debug' }))
}

// ---------------------------------------------------------------------------
// Python-Sperre: Unter Windows ist `python`/`python3` oft nur der Platzhalter aus dem
// Microsoft Store und hängt; nacktes `python` wartet überall auf Eingabe. Erkennung über `where`, nie python selbst.

const PYTHON_REPL =
  'codecycle: Python würde auf Eingabe warten und hängen (nackt, -i, `python -` ohne Pipe oder Datei, Heredoc unter Windows). Skript in eine Datei unter .codecycle/tmp schreiben und `python datei.py` aufrufen, `-c` nutzen, oder node.'
const PYTHON_STUB =
  'codecycle: python ist hier nur der Microsoft-Store-Platzhalter (hängt). Nutze node (node -e / Skript in .codecycle/tmp).'

/** Windows? Aus der Umgebungsvariable OS (`Windows_NT`), einmal gelesen; scheitert das, aus dem Laufwerk des Hauptordners. */
let windows: boolean | null = null

/** Echtes Python gefunden (Ergebnis von checkPython); bis dahin: nein. */
let realPython = false

async function onWindows($: EngineInterface): Promise<boolean> {
  if (windows !== null) return windows
  try {
    windows = (await $.env.get('OS')) === 'Windows_NT'
  } catch {
    windows = /^[A-Za-z]:/.test((await rootOf($)) ?? '')
  }
  return windows
}

/** Ausgabe von `where python python3 py`: mindestens ein Treffer außerhalb von \Microsoft\WindowsApps\? */
function hasRealPython(whereOut: string): boolean {
  return whereOut
    .split(/\r?\n/)
    .map(l => l.trim().replace(/\//g, '\\'))
    .filter(l => /^[A-Za-z]:\\/.test(l))
    .some(l => !/\\Microsoft\\WindowsApps\\/i.test(l))
}

/** Beim Sitzungsstart: nur unter Windows `where` mit 3 s Zeitlimit; Fehler oder Hängen gelten als „kein echtes Python“. */
async function checkPython($: EngineInterface): Promise<void> {
  realPython = false
  windows = null
  if (!(await onWindows($))) return
  try {
    const r = await $.process.run(['where', 'python', 'python3', 'py'], { timeoutMs: 3_000 })
    realPython = hasRealPython(r.stdout)
  } catch {
    realPython = false
  }
}

/** Im 10-Sekunden-Takt nur den Projektteil nachziehen (nach /codecycle:setup bzw. /codecycle:update verschwindet der Hinweis von selbst). */
async function refreshSetup($: EngineInterface): Promise<void> {
  const files = await projectReady($)
  const s = await read($, setupState)
  if (s.projekt !== files.projekt || s.config !== files.config || s.kopie !== files.kopie) {
    await update($, setupState, old => ({ ...old, ...files }))
    await suggestUpdate($) // nur beim Wechsel, nicht alle 10 s
  }
}

/** Cache-Laufzeit der Hauptsitzung in ms und ob sie nur angenommen ist (Abo im Planumfang: 1 h laut Doku prompt-caching). */
function mainTtl(): { ms: number; annahme: boolean } {
  if (mainCacheTtl === '5m') return { ms: CACHE_TTL_SHORT_MS, annahme: false }
  return { ms: CACHE_TTL_LONG_MS, annahme: mainCacheTtl === null }
}

/** Cache-Zeit des Bauleiters als Text („Cache warm 52:10 (Annahme 1 h)“), leer ohne Anfrage. */
function mainCacheText(now: number): string {
  const ttl = mainTtl()
  const text = cacheText(cacheState({ status: mainBusy ? 'laeuft' : 'fertig', ...(mainLastStep !== null ? { letzteAnfrage: mainLastStep } : {}), cacheTtlMs: ttl.ms }, now))
  if (!text || text === 'läuft') return text
  return ttl.annahme ? `${text} (Annahme 1 h)` : text
}

/**
 * Takt (10 s) für die Cache-Zeiten: `crewNow` nur weiterstellen, wenn eine Restzeit sichtbar läuft (ein ruhender Agent
 * oder der Bauleiter mit warmem Cache); sonst kein Neuzeichnen. 10 s Auflösung genügt (Anzeige m:ss springt in 10-s-Schritten).
 */
async function tickCountdown($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const live = await read($, crew)
  const agentWarm = live.some(a => a.status !== 'laeuft' && a.letzteAnfrage !== undefined && now - a.letzteAnfrage < (a.cacheTtlMs ?? CACHE_TTL_SHORT_MS) + FLUSH_MS)
  const mainWarm = mainLastStep !== null && now - mainLastStep < mainTtl().ms + FLUSH_MS
  if (agentWarm || mainWarm) await update($, crewNow, prev => Math.max(now, prev + 1))
}

/**
 * Laufzeit live: 1-s-Takt, der `crewNow` weiterstellt, damit die Arbeitszeit eines laufenden Agenten in der
 * Seitenleiste sichtbar mitzählt (die API liefert keine Zwischenstände). Er läuft NUR, solange mindestens ein codecycle-Agent
 * `laeuft`; `syncRunTick` startet ihn beim ersten laufenden Agenten (kein Doppelstart) und beendet ihn, wenn keiner mehr läuft.
 * Kein Modellaufruf, kein Schreiben von Büchern im Takt.
 */
let runTimer: ReturnType<EngineInterface['clock']['every']> | null = null

async function syncRunTick($: EngineInterface): Promise<void> {
  const running = (await read($, crew)).some(a => a.status === 'laeuft')
  if (running && !runTimer) {
    runTimer = $.clock.every(1_000, () => void runTick($).catch(() => undefined))
  } else if (!running && runTimer) {
    runTimer.cancel()
    runTimer = null
  }
}

/** Ein Schlag des Takts: nur bei offener und sichtbarer Seitenleiste `crewNow` weiterstellen (zeichnet sie neu). */
async function runTick($: EngineInterface): Promise<void> {
  await syncRunTick($)
  if (!runTimer) return
  const pane = (await $.ui.panes().catch(() => [])).find(p => p.id === PANE)
  if (!pane?.isShown) return
  const now = await $.clock.now()
  await update($, crewNow, prev => Math.max(now, prev + 1))
}

/** Zeilen der Agenten-Leiste: Live-Zustand plus Token-Buch der aktiven Aufgabe (im Speicher, nicht von der Platte). */
async function crewRows($: EngineInterface): Promise<AgentRow[]> {
  const live = await read($, crew)
  if (live.length === 0) return []
  // Kosten je Agent aus dem Buch, in das er bucht (aktive Aufgabe, letzte Aufgabe, SETUP_DIR): nach dem Abschluss
  // einer Aufgabe behalten die Agenten so ihre Zahlen. Nur lesen.
  const b = await read($, board)
  const dirs = new Set<string>()
  for (const d of [dirOf(b.quelle), dirOf(b.letzte?.quelle)]) if (d) dirs.add(d)
  for (const a of live) {
    const rt = agents.get(a.id)
    if (rt) dirs.add(rt.book)
  }
  const costs = emptyCosts('')
  for (const d of dirs) Object.assign(costs.agenten, books.get(d)?.costs.agenten ?? {})
  return agentRows(live, costs)
}

/**
 * Kosten pro Rolle und Kennzahlen für die Anzeige: aus dem Buch im Speicher (laufend, wie die Agentenzeilen),
 * sonst aus dem Stand der costs.json, den loadBoard gelesen hat.
 */
function liveCosts(b: Board): { kosten: Board['kosten']; kennzahlen: Board['kennzahlen'] } {
  const dir = dirOf(b.quelle) ?? dirOf(b.letzte?.quelle)
  const book = dir ? books.get(dir) : undefined
  if (!book) return { kosten: b.kosten, kennzahlen: b.kennzahlen }
  return { kosten: roleCosts(book.costs), kennzahlen: metricsOf(book.costs) }
}

/**
 * Hinweise für Bautafel und Seitenleiste, mit Art (`hooks/lib/term-parts.ts :: Hint`): Node und Einrichtung = setup,
 * Werkzeug-Kopie = update, alles andere sonstig. Beide: mit Einrichtungshinweis (sichtbar nur in der Seitenleiste, die
 * Bautafel fehlt dann). Terminal: ohne Limit-Hinweise (das Limit steht in der Fußzeile), in fester Rangfolge Setup vor
 * Update vor allem anderen. Desktop-App: Reihenfolge der Liste (Limit ab 80 %, große Hauptsitzung).
 */
async function currentWarnings($: EngineInterface, surface: string): Promise<Hint[]> {
  const terminal = surface === 'terminal'
  const hint = (art: HintKind, text: string): Hint => ({ art, text })
  const lim = await read($, limits)
  const setup = await read($, setupState)
  // Einrichtungshinweis in beiden Oberflächen in der Liste: die Bautafel fehlt im nicht eingerichteten Projekt, er steht nur in der Seitenleiste
  const setupText = setupHint(setup)
  const node = nodeWarning(setup.node)
  const copy = toolCopyHint(setup, TOOL_VERSION)
  const list = [
    ...(setupText ? [hint('setup', setupText)] : []),
    ...(node ? [hint('setup', node)] : []),
    ...(copy ? [hint('update', copy)] : []),
    ...(staleEffortSwitch ? [hint('sonstig', STALE_EFFORT_HINT)] : []),
    ...(browserOpen.size > 0 ? [hint('sonstig', browserOpenHint(browserOpen.size)!)] : []),
    ...warnings({
      fuenf: terminal ? null : lim.fuenfStunden,
      woche: terminal ? null : lim.woche,
      contextTokens: await read($, context),
    }).map(t => hint('sonstig', t)),
  ]
  return terminal ? rankHints(list) : list
}

// ---------------------------------------------------------------------------
// Ereignis-Handler. Jeder ist eine Funktion auf oberster Ebene dieser Datei (Mod-Doku: das Handle `$` darf nur an solche
// Funktionen weitergegeben werden, nicht an importierte, innere oder in Variablen gelegte); `register` unten ist nur die
// Liste der `on(...)`-Aufrufe, ihre Reihenfolge ist Verhalten (bei `tool.call` die der Sperren).

/** Ereignis `e` und Fortsetzung `next` eines Handlers ohne Filter, aus dem Typ der Mod-Schnittstelle */
type Evt<N extends EventName> = Parameters<Hook<N>>[1]
type Nxt<N extends EventName> = Parameters<Hook<N>>[2]
/** dasselbe für einen Handler mit Filterobjekt `M` im `on()`-Aufruf (der Filter engt `e` ein) */
type HookParams<H> = H extends (...args: infer P) => unknown ? P : never
type MEvt<H> = HookParams<H>[1]
type MNxt<H> = HookParams<H>[2]

/** Filter der `tool.call`-Handler: eine Werkzeug-Auswahl per regulärem Ausdruck (im `on()`-Aufruf als Literal) */
type ToolMatcher = { readonly tool: RegExp }
type ToolEvt = MEvt<MatchedHook<'tool.call', ToolMatcher>>
type ToolNxt = MNxt<MatchedHook<'tool.call', ToolMatcher>>
/** Filter der Zeichen-Handler (Bautafel, Seitenleiste) und der Befehle; im `on()`-Aufruf als Literal */
type BandMatcher = { readonly component: 'AbovePrompt' }
type PaneMatcher = { readonly component: 'Pane'; readonly requestId: typeof PANE }
type ModeMatcher = { readonly component: 'SessionMode' }
type EffortMatcher = { readonly command: 'effort' }
type UpdateMatcher = { readonly command: 'codecycle:update' }

/** Eingabe eines Werkzeugaufrufs, soweit der Mod sie liest (Dateipfade, Bereich, Befehl) */
type ToolInput = { tool: string; file_path?: string; notebook_path?: string; offset?: number; limit?: number; command?: string }

// --- session.start ---------------------------------------------------------

/** Ein Schritt des Sitzungsstarts, einzeln abgesichert: scheitert einer, laufen die übrigen (Werkzeuge, Flush, Python-Prüfung) trotzdem */
async function safeStep($: EngineInterface, what: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (err) {
    $.ui.log(`codecycle: Sitzungsstart, ${what} fehlgeschlagen: ${String(err)}`, { to: 'debug' })
  }
}

/** Neue Sitzung arbeitet an keiner Aufgabe, bis ein Signal kommt; eine fortgesetzte (--resume) behält ihre Zuordnung */
async function resetSessionClaim($: EngineInterface): Promise<void> {
  resetClaim(await $.clock.now())
  await restoreClaim($, await $.session.id())
}

async function loadStoredCollapsed($: EngineInterface): Promise<void> {
  // immer setzen: danach liest die Anzeige das Atom, nicht mehr $.store
  await update($, collapsed, () => false)
  if ((await $.store.get(STORE_COLLAPSED)) === true) await update($, collapsed, () => true)
}

async function registerCommands($: EngineInterface): Promise<void> {
  await $.command.register({
    name: 'codecycle-panel',
    description: 'codecycle: Seitenleiste öffnen (einfacher: Knopf „Details“ auf der Bautafel, ohne Eintrag im Verlauf)',
  })
}

async function readSessionLimits($: EngineInterface): Promise<void> {
  await setLimits($, (await $.session.usage()).rateLimits)
}

/** STATE.md kann sich auch außerhalb eines Zuges ändern (Editor, git pull), die Einrichtung durch /codecycle:setup. */
async function startRefreshTick($: EngineInterface): Promise<void> {
  $.clock.every(10_000, () =>
    void refreshBoard($)
      .then(() => refreshSetup($))
      // Limit-Stand auch im Takt (kostenlos); Cache-Zeiten zählen sichtbar herunter
      .then(() => pullLimits($))
      .then(() => tickCountdown($))
      .catch(err => $.ui.log(`codecycle: Neuladen fehlgeschlagen: ${String(err)}`, { to: 'debug' })),
  )
}

async function onSessionStart($: EngineInterface, e: Evt<'session.start'>, next: Nxt<'session.start'>) {
  await safeStep($, 'Hauptsitzung zurücksetzen', () => resetSessionClaim($))
  await safeStep($, 'Einklappen laden', () => loadStoredCollapsed($))
  await safeStep($, 'Befehle anmelden', () => registerCommands($))
  // Zuerst den Hauptordner bestimmen, alle Projektpfade hängen daran
  await safeStep($, 'Hauptordner bestimmen', () => rootOf($, true))
  await safeStep($, 'Bautafel laden', () => refreshBoard($))
  await safeStep($, 'Einrichtung prüfen', () => checkSetup($))
  await safeStep($, 'Python prüfen', () => checkPython($))
  await safeStep($, 'Limit-Stand lesen', () => readSessionLimits($))
  await safeStep($, 'Takt', () => startRefreshTick($))
  await start($)
  // Fußzeile: Startwert des Efforts und 2-s-Takt, immer, auch ohne offene Aufgabe
  await safeStep($, 'Effort-Startwert', () => refreshStartEffort($))
  await safeStep($, 'Effort-Takt', () => startEffortTick($))

  return next(e)
}

async function onTurnStart($: EngineInterface, e: Evt<'turn.start'>, next: Nxt<'turn.start'>) {
  await turnStart($)
  return next(e)
}

async function onSessionEnd($: EngineInterface, e: Evt<'session.end'>, next: Nxt<'session.end'>) {
  effortTimer?.cancel()
  effortTimer = null
  await end($)
  // Zuordnung der Hauptsitzung gilt bis /clear, auch für das Fortsetzen derselben Sitzung in einem neuen Prozess
  await saveClaim($, e.sessionId || claimSession || '', e.reason === 'clear')
  resetClaim(await $.clock.now())
  return next(e)
}

async function onSessionMeasure($: EngineInterface, e: Evt<'session.measure'>, next: Nxt<'session.measure'>) {
  if (e.changed.includes('rateLimits')) await setLimits($, e.rateLimits)
  await measure($, e)
  return next(e)
}

// --- Hauptsitzung beobachten (Skill, Prompt, Modellwechsel) ------------------

// Aufruf eines codecycle-Skills (new, continue: Vorlauf; setup: Einrichtungsbuch). Nur beobachten.
// ANNAHME (live unbestätigt): Claude Code meldet Plugin-Skills als `codecycle:<name>`.
async function onSkillPrompt($: EngineInterface, e: Evt<'skill.prompt'>, next: Nxt<'skill.prompt'>) {
  const kind = skillKind(e.skill)
  if (kind === 'task') await claimMain($, { kind: 'skill', which: 'task' }, `skill ${e.skill}`)
  if (kind === 'setup') await claimMain($, { kind: 'skill', which: 'setup', setupDir: SETUP_DIR }, `skill ${e.skill}`)
  return next(e)
}

// Rückfall zu skill.prompt: der getippte Befehl am Anfang des Prompts (falls der Text dort noch unverändert steht)
async function onPromptSubmit($: EngineInterface, e: Evt<'prompt.submit'>, next: Nxt<'prompt.submit'>) {
  await syncClaimSession($)
  // Slash-Befehl laut Engine (`command`, im Kopfmodus -p belegt), sonst der Anfang des Textes
  const named = typeof e.command?.name === 'string' ? e.command.name.toLowerCase() : null
  const skill = (named && skillKind(named) ? named : null) ?? promptSkill(e.text)
  const kind = skill ? skillKind(skill) : null
  if (kind === 'task') await claimMain($, { kind: 'skill', which: 'task' }, `befehl /${skill}`)
  if (kind === 'setup') await claimMain($, { kind: 'skill', which: 'setup', setupDir: SETUP_DIR }, `befehl /${skill}`)
  // Browser offen nach einem Agenten: einmal als Kontext, den nur das Modell liest (auch an der Benachrichtigung
  // über das Agentenende, Herkunft task-notification); bei einem Slash-Befehl nicht, dort gilt nur der Befehl
  const offen = [...browserOpen].filter(([, v]) => !v.gemeldet).map(([id]) => id)
  const note = e.command ? null : browserOpenContext(offen)
  if (note === null) return next(e)
  for (const id of offen) browserOpen.set(id, { gemeldet: true })
  return next({ ...e, context: [...(e.context ?? []), note] })
}

// Cache-Laufzeit der Hauptsitzung, wenn Claude Code sie meldet (nur beim Modellwechsel); nur beobachten
async function onPostModelSwitch($: EngineInterface, e: Evt<'classic.PostModelSwitch'>, next: Nxt<'classic.PostModelSwitch'>) {
  await noteMainCacheTtl($, e.cache_ttl)
  return next(e)
}

async function onPreModelSwitch($: EngineInterface, e: Evt<'classic.PreModelSwitch'>, next: Nxt<'classic.PreModelSwitch'>) {
  await noteMainCacheTtl($, e.cache_ttl)
  return next(e)
}

async function onTurnComplete($: EngineInterface, e: Evt<'turn.complete'>, next: Nxt<'turn.complete'>) {
  const result = await next(e)
  await complete($, e, result.text)
  await refreshBoard($)
  return result
}

// --- Befehle ------------------------------------------------------------------


// Rückfall zum Knopf „Details“ der Bautafel. Ohne `text` schreibt der Befehl keine Ausgabezeile in den
// Verlauf (CommandRunResult.text: „undefined when the command showed nothing as text (a panel …)“). Dass der getippte
// Befehl selbst als Eingabe erscheint und einen laufenden Zug unterbrechen kann, regelt Claude Code, nicht der Mod.
async function onPanelCommand($: EngineInterface) {
  const opened = await openPanel($)
  if (!opened.isPlaced) $.ui.toast('codecycle: Seitenleiste wartet auf mehr Platz.')
  return {}
}

// --- Oberfläche: Beobachter und Zeichnen ------------------------------------

// Beobachter für die Diagnose der Seitenleiste (Schließen, Fokus): reichen immer unverändert weiter
async function onUiClose($: EngineInterface, e: Evt<'ui.close'>, next: Nxt<'ui.close'>) {
  if (e.id === PANE) $.ui.log(`codecycle: Seitenleiste geschlossen (${e.origin.kind})`, { to: 'debug' })
  return next(e)
}

async function onUiFocus($: EngineInterface, e: Evt<'ui.focus'>, next: Nxt<'ui.focus'>) {
  if (e.requestId === PANE) {
    $.ui.log(`codecycle: Seitenleiste Fokus auf ${e.element ?? 'Engine-Element'} (${e.origin.kind})`, { to: 'debug' })
  }
  return next(e)
}

/** Daten der Bautafel über dem Eingabefeld (Darstellung: hooks/band.tsx) */
/**
 * `weight`, `size`, `tabular` und Abstandsstufen nur, wenn die Engine sie kennt (ab 2.1.299). Die Desktop-App bringt
 * eine eigene Kopie von Claude Code mit, die älter sein kann; dann wiese sie das ganze Zeichnen ab (bei 2.1.295 fehlte die
 * Bautafel). Bei jedem Zeichnen gefragt (eine Abfrage der Engine, kein Modellaufruf); nicht lesbar: nein.
 */
async function richText($: EngineInterface): Promise<boolean> {
  try {
    const v = await $.session.version()
    return supportsRichText(v.base ?? v.version)
  } catch {
    return false
  }
}

async function bandData($: EngineInterface, surface: string, bodyColumns: number, maxRows: BandData['maxRows']): Promise<BandData> {
  const { lim, alt } = await shownLimits($)
  return {
    surface,
    bodyColumns,
    mainModel: await read($, mainModel),
    rich: await richText($),
    lim,
    ...(alt ? { alt } : {}),
    board: await read($, board),
    isCollapsed: await shownCollapsed($),
    notes: await currentWarnings($, surface),
    running: (await read($, crew)).filter(a => a.status === 'laeuft').length,
    maxRows,
    newSession: contextAdvice(await read($, context)) !== 'keine',
  }
}

/**
 * Projekt eingerichtet, für die Bautafel. Vor der ersten Prüfung (checkSetup beim Sitzungsstart, oder Mod neu geladen
 * ohne session.start) nur die Datei nachsehen, ohne beim Zeichnen den Zustand zu schreiben; nicht prüfbar = eingerichtet.
 */
async function projectShown($: EngineInterface): Promise<boolean> {
  const projekt = (await read($, setupState)).projekt
  if (projekt !== null) return projekt
  return projectExists($, CODECYCLE_MD).catch(() => true)
}

// Bautafel über dem Eingabefeld (Darstellung: hooks/band.tsx; hier nur Daten sammeln und Rückrufe mit `$` bereitstellen).
// Nur im eingerichteten Projekt (`.claude/codecycle.md`; nicht prüfbar zählt als eingerichtet, vor der ersten Prüfung beim Sitzungsstart keine
// Tafel, sonst blitzt sie in fremden Projekten kurz auf): in fremden Projekten keine Tafel; dort führen der Vorschlag /codecycle:setup im Eingabefeld (suggestUpdate) und die Seitenleiste zur Einrichtung.
async function onRenderBand($: EngineInterface, e: MEvt<MatchedHook<'ui.render', BandMatcher>>, next: MNxt<MatchedHook<'ui.render', BandMatcher>>) {
  if (e.props.hasSurvey || !(await projectShown($))) return next(e)
  return renderBand($.ui.resolve(e), await bandData($, e.surface, e.props.bodyColumns, e.props.maxRows), {
    onTogglePanel: () => void togglePanel($),
    onSetCollapsed: value => void setCollapsed($, value),
    onNewSession: () => newSession($),
  })
}

/** Daten der Fußzeile rechts (Darstellung: hooks/band.tsx :: renderFooter) */
async function footerData($: EngineInterface): Promise<FooterData> {
  const { lim, alt } = await shownLimits($)
  const measured = await read($, mainEffort)
  return {
    model: await read($, mainModel),
    effort: measured || (await read($, startEffort)),
    effortMeasured: measured !== '',
    lim,
    ...(alt ? { alt } : {}),
  }
}

// Fußzeile rechts (Render-Platz SessionMode, „the dim mode labels at the right of the prompt footer“), nur im Terminal
// mit Modell, Effort und Limit; die Angaben der Engine (z. B. „auto mode“) bleiben und stehen rechts daneben
async function onRenderSessionMode($: EngineInterface, e: MEvt<MatchedHook<'ui.render', ModeMatcher>>, next: MNxt<MatchedHook<'ui.render', ModeMatcher>>) {
  if (e.surface !== 'terminal') {
    // Nur das Limit (Etiketten mit Balken und Reset); die Desktop-App hat ihre eigene Modellauswahl und
    // kürzt diesen Platz
    const theirs = await next(e)
    const d = await footerData($)
    return renderFooterDesk($.ui.resolve(e), d.lim, d.alt, theirs)
  }
  const theirs = await next(e)
  return renderFooter($.ui.resolve(e), await footerData($), { onModel: () => runBuiltin($, 'model'), onEffort: () => runBuiltin($, 'effort') }, theirs)
}

// /effort mit Stufe („/effort high“): sofort als gemessen übernehmen; ohne Stufe (Regler) holt der 2-s-Takt die Wahl
async function onEffortCommand($: EngineInterface, e: MEvt<MatchedHook<'command.run', EffortMatcher>>, next: MNxt<MatchedHook<'command.run', EffortMatcher>>) {
  const result = await next(e)
  const word = effortFromArgs(e.args)
  if (word) await setMainEffort($, word)
  return result
}

/**
 * /codecycle:update ohne KI. Das Werkzeug (`codecycle update` aus dem laufenden Plugin) holt das Plugin, erneuert
 * Kopie, Hooks und guard-Grundlage; der Mod zeigt die Zusammenfassung und lädt bei neuer Version neu. Bei Exit 3
 * (Entscheidung nötig), Exit 2 oder wenn der Prozess nicht startet, läuft der Skill mit der KI, die Meldung als Argument.
 */
async function onUpdateCommand($: EngineInterface, e: MEvt<MatchedHook<'command.run', UpdateMatcher>>, next: MNxt<MatchedHook<'command.run', UpdateMatcher>>) {
  $.ui.toast('codecycle: Update läuft (guard lässt die Tests einmal laufen) …')
  let run: { exitCode: number; stdout: string }
  try {
    run = await $.process.run(['node', `${$.plugin.root}/tool/cli.ts`, 'update'], { cwd: (await rootOf($)) ?? undefined, timeoutMs: UPDATE_TIMEOUT_MS })
  } catch (err) {
    $.ui.log(`codecycle: codecycle update nicht gestartet: ${String(err)}`, { to: 'debug' })
    return next(e)
  }
  const { text, result } = splitUpdateOutput(run.stdout)
  if (run.exitCode !== 0 || result === null) return next({ ...e, args: `Das Werkzeug meldete (Exit ${run.exitCode}):\n${text}` })
  await refreshSetup($)
  if (result.neuLaden) runReload($)
  return { text: result.neuLaden ? `${text}\n${RELOAD_PLANNED}` : text }
}

/** Detailansicht eines Agenten (Klick auf „Details“ in seiner Zeile); live über crew und crewNow */
async function panelDetail($: EngineInterface, rows: AgentRow[], now: number): Promise<PanelData['detail']> {
  const selected = await read($, selectedAgent)
  const chosen = selected ? rows.find(r => r.id === selected) : undefined
  if (!chosen) return null
  const rt = agents.get(chosen.id)
  const entry = rt ? books.get(rt.book)?.registry.agenten[chosen.id] : undefined
  return { row: chosen, info: agentDetail(chosen, entry, now) }
}

/** Daten der Seitenleiste: Details zur aktiven Aufgabe (Darstellung: hooks/panel.tsx) */
async function panelData($: EngineInterface, surface: string, bodyColumns: number): Promise<PanelData> {
  const b = await read($, board)
  const rows = await crewRows($)
  const now = await read($, crewNow)
  const detail = await panelDetail($, rows, now)
  // Kopf der Leiste: echtes Fenster (wie Statuszeile/Bautafel) und Anteil der Aufgabe getrennt
  const lim = await read($, limits)
  // Anzeige des Limit-Blocks unten: bei neuer Sitzung ohne Messwert der alte Stand, gekennzeichnet (Kopf und Budget bleiben frisch)
  const { lim: shown, alt } = await shownLimits($)
  const { kosten, kennzahlen } = liveCosts(b)
  const agentenProzent = rolePercentSum(kosten)
  const head: CrewHead = {
    fuenf: lim.fuenfStunden,
    agenten: agentenProzent,
    bauleiter: kennzahlen?.bauleiterProzent ?? null,
    // Hauptmaß: gewichtete Tokens (Agenten = Summe der Rollen, wie bei den Prozentwerten)
    agentenGew: kosten.reduce((n, k) => n + (k.gewichtet ?? 0), 0),
    bauleiterGew: kennzahlen?.bauleiterGewichtet ?? null,
  }
  return {
    surface,
    bodyColumns,
    board: b,
    rows,
    now,
    detail,
    head,
    shown,
    ...(alt ? { alt } : {}),
    kosten,
    kennzahlen,
    agentenProzent,
    notes: await currentWarnings($, surface),
    mainCache: mainCacheText(now),
    closed: await read($, closedSections),
    rich: await richText($),
  }
}

// Seitenleiste: Details zur aktiven Aufgabe (Darstellung: hooks/panel.tsx; hier nur Daten sammeln und Rückrufe mit `$` bereitstellen)
async function onRenderPane($: EngineInterface, e: MEvt<MatchedHook<'ui.render', PaneMatcher>>) {
  const data = await panelData($, e.surface, e.props.bodyColumns)
  return renderPanel($.ui.resolve(e), data, {
    onSelectAgent: id => void update($, selectedAgent, () => id),
    onBack: () => void update($, selectedAgent, () => null),
    onToggleSection: id => void update($, closedSections, list => (list.includes(id) ? list.filter(s => s !== id) : [...list, id])),
  })
}

// --- agent.spawn --------------------------------------------------------------

/**
 * Folgenachricht an einen fertigen Agenten: Claude Code meldet sie als agent.spawn mit `resume` und verwirft jede
 * Änderung am Inhalt. Kein neuer Start: Startnachricht unverändert, Registereintrag und
 * Läufe laufen weiter (den neuen Lauf öffnet turn.step). Nach einem Neuladen des Mods den Agenten aus dem Register
 * wieder kennen (loadBook), sonst buchte er als fremder Agent.
 */
async function resumeAgent($: EngineInterface, id: string): Promise<void> {
  try {
    if (agents.has(id)) return
    for (const dir of [await activeDir($), SETUP_DIR]) {
      if (dir) await bookOf($, dir)
      if (agents.has(id)) return
    }
    for (const dir of (await openTaskDirs($)) ?? []) {
      await bookOf($, dir)
      if (agents.has(id)) return
    }
  } catch (err) {
    $.ui.log(`codecycle: fortgesetzter Agent ${id} nicht im Register (${String(err)})`, { to: 'debug' })
  }
}

/**
 * Startsperre des Schlussprüfers: STATE.md frisch gelesen (der Cache wüsste vom eben geschriebenen geprueftAuf nichts),
 * geänderte Dateien zwischen geprueftAuf und dem Aufgaben-Branch ohne den Aufgabenordner. Regel: hooks/lib/solo.ts.
 */
async function soloReviewerLock($: EngineInterface, dir: string | null): Promise<string | null> {
  const text = dir ? await readText($, `${dir}/STATE.md`) : null
  let state: ReturnType<typeof parseTaskState> | null = null
  try {
    state = text === null ? null : parseTaskState(text, `${dir}/STATE.md`)
  } catch {
    state = null
  }
  let changed: string[] | null = null
  if (state?.weg === 'solo' && state.geprueftAuf && dir) {
    const root = (await rootOf($)) ?? undefined
    const tip = state.branch || 'HEAD'
    const out = await runIn($, ['git', '-c', 'core.quotepath=false', 'diff', '--name-only', '--no-renames', state.geprueftAuf, tip], root)
    changed = out === null ? null : out.split(/\r?\n/).filter(p => p !== '' && p !== dir && !p.startsWith(`${dir}/`))
  }
  return reviewerStartProblem(state, dir, changed)
}

/**
 * Startsperre des Prüfers je Teil (`Auftrag: Teil`): STATE.md frisch gelesen, Branch und Uncommittetes des Hauptordners
 * ohne den Aufgabenordner. Regel: hooks/lib/solo.ts :: partReviewerStartProblem.
 */
async function partReviewerLock($: EngineInterface, dir: string | null, name: string | null): Promise<string | null> {
  const text = dir ? await readText($, `${dir}/STATE.md`) : null
  let state: ReturnType<typeof parseTaskState> | null = null
  try {
    state = text === null ? null : parseTaskState(text, `${dir}/STATE.md`)
  } catch {
    state = null
  }
  let head: string | null = null
  let dirty: string[] | null = null
  if (state?.weg === 'solo' && dir) {
    const root = (await rootOf($)) ?? undefined
    head = (await runIn($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], root))?.trim() ?? null
    const out = await runIn($, ['git', '-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all'], root)
    dirty =
      out === null
        ? null
        : out
            .split(/\r?\n/)
            .filter(l => l.length > 3)
            .map(l => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''))
            .filter(p => p !== dir && !p.startsWith(`${dir}/`))
  }
  return partReviewerStartProblem(state, dir, name, head, dirty)
}

async function onAgentSpawn($: EngineInterface, e: Evt<'agent.spawn'>, next: Nxt<'agent.spawn'>) {
  const role = roleOf(e.subagentType)
  if (!role) return next(e)
  if (e.resume) {
    await resumeAgent($, e.resume.agentId)
    return next(e)
  }
  let info: Spawn | undefined
  try {
    const prepared = await prepare($, e, role)
    // Aufgabenordner falsch oder nicht vorhanden: kein Start, die Meldung nennt dem Bauleiter den richtigen Pfad
    if ('deny' in prepared) return { deny: prepared.deny }
    info = prepared
  } catch (err) {
    $.ui.log(`codecycle: agent.spawn ohne Änderung (${String(err)})`, { to: 'debug' })
  }
  // Schlussprüfer erst nach grünem codecycle solo check auf dem Stand des Aufgaben-Branchs, Prüfer je Teil nur auf einem
  // sauberen Teil in Arbeit (fail-closed)
  if (role === SOLO_REVIEWER) {
    const dir = info?.dir ?? (await activeDir($))
    const locked = isPartReview(e.prompt) ? await partReviewerLock($, dir, partNameOf(e.prompt)) : await soloReviewerLock($, dir)
    if (locked) return { deny: locked }
  }
  const result = await next(rewriteSpawn(e, info))
  if (info && result.deny === undefined) {
    try {
      const agentId = result.agentId
      if (agentId) await onSpawned($, e.cwd, info, agentId, result.model, e.prompt)
    } catch (err) {
      $.ui.log(`codecycle: Register nicht geschrieben (${String(err)})`, { to: 'debug' })
    }
    // Start aus der Hauptsitzung mit ausdrücklichem Aufgabenordner = diese Sitzung arbeitet an der Aufgabe;
    // ein Agent ohne Aufgabe (Einrichter, Werkzeugmeister) bindet an das Einrichtungsbuch (wie bisher)
    if (!e.parentAgentId) {
      if (info.explicitDir && info.dir) await claimMain($, { kind: 'dir', dir: info.dir }, `agent ${info.role}`)
      else if (info.dir === null) await claimMain($, { kind: 'dir', dir: SETUP_DIR }, `agent ${info.role}`)
    }
  }
  return result
}

// --- turn.step: Token-Buch, Effort -------------------------------------------

type StepEvt = Evt<'turn.step'>
type StepResult = EventResult<'turn.step'>

/** Limit-Stand getrennt vom Effort: scheitert die Abfrage, bleibt der Effort des Schritts erhalten */
async function noteStepBaseline($: EngineInterface, rt: Runtime | undefined, e: StepEvt): Promise<void> {
  try {
    if (rt && e.index === 0) rt.baseline = await fiveHour($)
    // Bauleiter-Zug: Stand beim ersten Schritt der Hauptsitzung; Agenten-Anteile werden beim Ende abgezogen
    if (!rt && !e.agentId && e.index === 0) mainTurn = { baseline: await fiveHour($), agenten: 0 }
  } catch {
    // Limit nicht lesbar: dieser Zug ohne Messung
    if (!rt && !e.agentId && e.index === 0) mainTurn = null
  }
}

/** Zeit der Anfrage: Grundlage der Cache-Restzeit und Beginn eines Laufs nach einer Folgenachricht */
async function noteStepTime($: EngineInterface, e: StepEvt): Promise<number> {
  let stepAt = 0
  try {
    stepAt = await $.clock.now()
    // nur die Hauptsitzung selbst (fremde Sub-Agenten ohne codecycle-Rolle buchen zwar wie bisher bei ihr, haben aber eigenen Cache)
    if (!e.agentId) {
      mainBusy = true
      mainLastStep = stepAt
    }
  } catch {
    // Uhr nicht lesbar: ohne Zeitangaben
  }
  return stepAt
}

/** Bucht den Schritt (Agent: sein Buch; Hauptsitzung: Aufgabe der Sitzung); liefert die Rundenzahl des Agenten, sonst 0 */
async function bookStep($: EngineInterface, rt: Runtime | undefined, result: StepResult, stepAt: number, foreignId?: string): Promise<number> {
  const model = result.usage?.model ?? ''
  if (rt) {
    // Agenten ohne Aufgabe buchen in SETUP_DIR
    const b = await bookOf($, rt.book)
    const who = { agentId: rt.id, rolle: rt.rolle, paket: rt.paket, modell: model, cacheTtl: (await cacheTtlOf($, rt.rolle)) === CACHE_TTL_LONG_MS ? '1h' as const : '5m' as const }
    // Folgenachricht an einen fertigen Agenten: neuer Lauf ab dieser Anfrage (beim ersten Lauf schon offen seit dem Start)
    openRun(b.costs, who, iso(stepAt))
    addStep(b.costs, who, result.usage ?? null)
    b.dirty = true
    return b.costs.agenten[rt.id]?.runden ?? 0
  }
  // Agent ohne codecycle-Rolle (agentId, aber nicht im Register): eigene Zeile „fremd“ im Buch der Aufgabe, der
  // Hauptsitzung. Weder Bauleiter-Summe noch Vorlauf-Topf, sonst stünden seine Tokens beim Bauleiter.
  if (foreignId) {
    const target = mainTarget(claim)
    if (target.kind === 'dir') {
      const b = await bookOf($, target.dir)
      addStep(b.costs, { agentId: foreignId, modell: model }, result.usage ?? null)
      b.dirty = true
    }
    return 0
  }
  // Hauptsitzung: nur in die Aufgabe, an der diese Sitzung arbeitet (hooks/lib/main-claim.ts); im Vorlauf nach
  // /codecycle:new|continue in einen Topf, der beim Binden in die Aufgabe geht; ohne Signal nirgends hin.
  // Nie in eine fertige Aufgabe auf die Platte (flush prüft STATE.md).
  addMainStep(sessionMain, result.usage ?? null, model)
  const target = mainTarget(claim)
  if (target.kind === 'pending') addMainStep(pendingMain, result.usage ?? null, model)
  if (target.kind === 'dir') {
    const b = await bookOf($, target.dir)
    addStep(b.costs, { modell: model }, result.usage ?? null)
    b.dirty = true
  }
  return 0
}

/** Agenten-Leiste nach einem Schritt: Kontextfüllung = was die letzte Anfrage gesendet und erzeugt hat */
async function crewAfterStep($: EngineInterface, rt: Runtime, ev: StepEvt, result: StepResult, stepAt: number, rundenNow: number): Promise<void> {
  const u = result.usage
  const at = await $.clock.now()
  await update($, crew, list =>
    list.map(a => {
      if (a.id !== rt.id) return a
      // Folgenachricht an einen fertigen Agenten: Fortschritt beginnt neu; sonst nur fortschreiben
      const restarted = a.status !== 'laeuft'
      const moved: LiveAgent = {
        ...(restarted ? { ...a, schritte: undefined, balken: undefined, rundenAb: Math.max(0, rundenNow - 1), laufStart: stepAt } : a),
        status: 'laeuft' as const,
        ende: undefined,
        letzteAnfrage: stepAt,
        ...(u?.model ? { modell: u.model } : {}),
        ...(typeof ev.effort === 'string' ? { effort: ev.effort } : {}),
        ...(u
          ? { kontext: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0) }
          : {}),
      }
      // Balken aus Meldungen, sonst aus den Runden geschätzt; läuft nie rückwärts
      return { ...moved, balken: progressOf(moved, rundenNow).wert ?? 0 }
    }),
  )
  await update($, crewNow, () => at)
  await syncRunTick($)
}

// ---------------------------------------------------------------------------
// Token-Buch: jede Modell-Anfrage; Effort steht in der Agenten-Datei
async function* onTurnStep($: EngineInterface, e: Evt<'turn.step'>, next: Nxt<'turn.step'>) {
  const rt = e.agentId ? agents.get(e.agentId) : undefined
  // Fußzeile: Effort der Hauptsitzung steht in jeder ihrer Anfragen (ohne agentId), maßgeblich
  if (!e.agentId && e.effort !== undefined) await setMainEffort($, e.effort).catch(() => undefined)
  const ev = e
  await noteStepBaseline($, rt, e)
  const stepAt = await noteStepTime($, e)
  const result = yield* next(ev)
  // Erste Anfrage eines Agenten: sie kann vor seinem Eintrag im Register (agent.spawn → onSpawned) beginnen;
  // deshalb nach der Anfrage noch einmal nachschlagen, sonst stünde sie als „fremd“ im Buch
  const booked = rt ?? (e.agentId ? agents.get(e.agentId) : undefined)
  try {
    const rundenNow = await bookStep($, booked, result, stepAt, booked ? undefined : e.agentId)
    if (booked) await crewAfterStep($, booked, ev, result, stepAt, rundenNow)
  } catch (err) {
    $.ui.log(`codecycle: Token-Buch: ${String(err)}`, { to: 'debug' })
  }
  return result
}

// ---------------------------------------------------------------------------
// tool.call: Sperren für Bash/PowerShell (Python, roter Test-Commit, Grundlage, Git-Hooks), dann Zaun (Schalter fence)
// und Register, danach die drei codecycle-Werkzeuge. Die Reihenfolge der Registrierung in `register` gilt.

// Python-Sperre: Hauptsitzung und alle Agenten, unabhängig von Schaltern
async function denyPython($: EngineInterface, e: ToolEvt, next: ToolNxt) {
  const command = (e as unknown as { command?: unknown }).command
  // als string vergleichen: die Werkzeugtypen entstehen je Rechner, unter Linux und macOS fehlt PowerShell darin
  const kind = typeof command === 'string' ? pythonCall(command, (e.tool as string) === 'PowerShell' ? 'powershell' : 'bash') : null
  if (kind === 'repl') return { deny: PYTHON_REPL }
  if (kind === 'heredoc' && (await onWindows($))) return { deny: PYTHON_REPL }
  if (kind === 'call' && (await onWindows($)) && !realPython) return { deny: PYTHON_STUB }
  return next(e)
}

// Befehle, die die Grundlage von codecycle guard neu setzen (guard --record, exclude,
// install-tool, hooks install), nur für die Hauptsitzung (Bauleiter) und den toolsmith; unbekannte Agenten verweigert
function denyBaseline(_$: EngineInterface, e: ToolEvt, next: ToolNxt) {
  const command = (e as unknown as { command?: unknown }).command
  if (e.agentId && typeof command === 'string' && baselineCall(command) && agents.get(e.agentId)?.rolle !== 'toolsmith') {
    return { deny: BASELINE_DENY }
  }
  return next(e)
}

// solo teil start|fertig und solo plan nur für die Hauptsitzung, auch nicht für toolsmith oder unbekannte Agenten
// Bauleiter: an das Ergebnis die Antwort von codecycle_budget als Kontext, damit jede Pause den Füllstand zeigt
async function denyPartBookkeeping($: EngineInterface, e: ToolEvt, next: ToolNxt) {
  const command = (e as unknown as { command?: unknown }).command
  if (typeof command !== 'string' || !partBookkeepingCall(command)) return next(e)
  if (e.agentId) return { deny: PART_DENY }
  const result = await next(e)
  if (result.deny !== undefined) return result
  let budget: string
  try {
    budget = await budgetNow($)
  } catch {
    return result
  }
  return { ...result, context: [...(result.context ?? []), budgetNote(budget, 'codecycle solo teil start/fertig')] }
}

// Füllstand ohne eigene Abfrage: nach `codecycle solo check` der Hauptsitzung die ganze Antwort von codecycle_budget,
// nach `codecycle check` nur die Zeile „Hauptsitzung“ und nur, wenn die Sitzung an eine Aufgabe gebunden ist
async function budgetAfterCheck($: EngineInterface, e: ToolEvt, next: ToolNxt) {
  const command = (e as unknown as { command?: unknown }).command
  if (e.agentId || typeof command !== 'string') return next(e)
  const solo = soloCheckCall(command)
  if (!solo && !checkCall(command)) return next(e)
  const result = await next(e)
  if (result.deny !== undefined) return result
  let note: string
  try {
    if (solo) note = budgetNote(await budgetNow($), 'codecycle solo check')
    else if (mainTarget(claim).kind === 'dir') note = checkContextNote(await read($, context))
    else return result
  } catch {
    return result
  }
  return { ...result, context: [...(result.context ?? []), note] }
}

// Hook-Sperre auch für PowerShell
function denyHookBypass(_$: EngineInterface, e: ToolEvt, next: ToolNxt) {
  const command = (e as unknown as { command?: unknown }).command
  // Agenten zusätzlich ohne `commit-tree`/`update-ref`; die Hauptsitzung darf sie (Notfall)
  const hit = typeof command === 'string' ? hookBypass(command, (e.tool as string) === 'PowerShell' ? 'powershell' : 'bash', !!e.agentId) : null
  return hit ? { deny: `codecycle: ${hit} ist verboten (Git-Hooks sind die Prüfung, nicht umgehen). Fehler beheben statt überspringen.` } : next(e)
}

// Merge eines Solo-Aufgaben-Branchs (`git merge codecycle/<thema>`) nur mit Prüfbericht und vollständigen Funden, für alle; Teil-Branches (`codecycle/<thema>--<teil>`) nie.
// Gelesen wird der committete Stand des Branchs (der Aufgabenordner liegt nur dort); Regel: hooks/lib/solo.ts soloMergeProblem.
async function denySoloMerge($: EngineInterface, e: ToolEvt, next: ToolNxt) {
  const command = (e as unknown as { command?: unknown }).command
  const branches = typeof command === 'string' ? mergedBranches(command) : []
  if (branches.length === 0) return next(e)
  try {
    const root = (await rootOf($)) ?? undefined
    const show = (ref: string) => runIn($, ['git', '-c', 'core.quotepath=false', 'show', ref], root)
    for (const branch of branches) {
      const list = await runIn($, ['git', '-c', 'core.quotepath=false', 'ls-tree', '-d', '--name-only', `${branch}:${TASKS_DIR}`], root)
      for (const name of (list ?? '').split(/\r?\n/).filter(Boolean)) {
        const dir = `${TASKS_DIR}/${name}`
        const text = await show(`${branch}:${dir}/STATE.md`)
        if (text === null) continue
        let state: ReturnType<typeof parseTaskState>
        try {
          state = parseTaskState(text, `${dir}/STATE.md`)
        } catch {
          continue
        }
        if (state.weg !== 'solo' || !state.branch) continue
        const part = partMergeProblem(state.branch, branch)
        if (part) return { deny: part }
        if (state.branch !== branch) continue
        const reports = await Promise.all(requiredReports(state).map(async path => ({ path, text: await show(`${branch}:${dir}/${path}`) })))
        const problem = soloMergeProblem(dir, reports, await show(`${branch}:${dir}/TASK.md`))
        if (problem) return { deny: problem }
      }
    }
  } catch (err) {
    $.ui.log(`codecycle: Merge-Sperre nicht geprüft (${String(err)})`, { to: 'debug' })
  }
  return next(e)
}

/** Ein Werkzeugaufruf eines codecycle-Agenten: seine Laufzeit, der Hauptordner, die Eingabe und der Dateipfad */
type ToolCtx = { rt: Runtime; rootNow: string | null; input: ToolInput; path: string | undefined }

/** Relative Pfade gelten vom Arbeitsordner des Agenten aus (sein Worktree), sonst vom Hauptordner */
function diskPath(c: ToolCtx, p: string): string {
  const base = c.rt.cwd ?? c.rootNow
  return base && !/^([\\/]|[A-Za-z]:)/.test(p) ? join(base, p.replace(/^\.[\\/]/, '')) : p
}

/** Pfad für Anzeige, Register und Token-Buch: relativ zum Projekt (Hauptordner oder Worktree des Agenten) */
function repoPath(c: ToolCtx, p: string, roots: readonly (string | null | undefined)[] = [c.rootNow, c.rt.cwd]): string {
  return relPath(diskPath(c, p), roots)
}

/**
 * Verweigerungsgrund vor dem Aufruf, null = erlaubt: Solo-Aufgabe, Lese-Rollen, Prüfungsdateien, Zaun (Schalter fence),
 * in dieser Reihenfolge.
 */
async function toolGate($: EngineInterface, c: ToolCtx): Promise<string | null> {
  const { rt, input, path } = c
  // Entscheidungen des Zauns: reine Funktionen in hooks/lib/fence.ts; hier nur Daten holen und Meldungen weitergeben
  const call = { tool: input.tool, command: input.command, path }
  const fenceEnv = { root: c.rootNow, plugin: $.plugin.root || null, rel: (p: string): string => repoPath(c, p) }

  // Solo-Aufgabe: schreiben dürfen nur die Sitzung, SOLO_WRITERS und jede Rolle ihren Bericht; der Schlussprüfer mit Write
  // und Edit nur seinen Bericht (Regel: hooks/lib/solo.ts). Lese-Rollen hält ihr eigener Zaun darunter.
  if (!isReaderRole(rt.rolle) && (canonicalRole(rt.rolle) === SOLO_REVIEWER || (rt.dir && (await stateOf($, rt.dir))?.weg === 'solo'))) {
    const denied = soloWriteDeny(rt.rolle, call, { rel: fenceEnv.rel, bericht: rt.bericht })
    if (denied) return denied
  }

  // Lese-Rollen: Write nur auf den eigenen Bericht (setup zusätzlich .claude/codecycle.md), Bash nur
  // nach Erlaubtliste, kein PowerShell. Gilt unabhängig vom Schalter fence.
  if (isReaderRole(rt.rolle)) {
    const verdict = readerCheck(rt, call, fenceEnv)
    rt.verweigert = verdict.verweigert
    if (verdict.deny) return verdict.deny
  }

  // Git-Hooks, Werkzeug und guard-Grundlage: nur der toolsmith, unabhängig vom Schalter fence
  const critical = hookCriticalReason(rt.rolle, call, fenceEnv.rel)
  if (critical) return critical

  if (isOn(switches, 'fence')) {
    // Edit/Write/NotebookEdit: die Datei; Bash: erkannte Schreibziele (Heuristik, lib/bash-write-targets.ts bashWriteTargets)
    for (const target of writeTargetsOf(call)) {
      const reason = controlFileReason(rt.rolle, target, protectedConfig)
      if (reason) return fenceDenyText(reason, input.tool)
    }
  }
  return null
}

/**
 * Meldete agent.spawn keinen Arbeitsordner, den Worktree aus dem ersten Pfad oder Befehl mit `--wt-` ableiten
 * und den Startstand dort festhalten (vor dem Aufruf, solange der Agent noch nichts committet hat)
 */
async function adoptWorktreeOfCall($: EngineInterface, c: ToolCtx): Promise<void> {
  const { rt, input, path } = c
  if (!rt.startCommit && (!rt.cwd || sameDir(rt.cwd, await rootOf($)))) {
    try {
      await adoptWorktree($, rt, (path ? worktreeOf(path, true) : worktreeOf(input.command ?? '')) ?? undefined)
    } catch (err) {
      $.ui.log(`codecycle: Worktree nicht erkannt (${String(err)})`, { to: 'debug' })
    }
  }
}

/** Stand vor dem Aufruf, aus dem das Register nach dem Aufruf die Berührungen ableitet */
type Touches = {
  /** Schreibziele eines Bash-Befehls (Heuristik, lib/bash-write-targets.ts bashWriteTargets) auch ohne Zaun ins Register */
  bashTargets: string[]
  /** Lesen per Bash/PowerShell ins Register (gelesen) */
  bashReads: string[]
  /** Suchstufen eines Bash-Befehls (grep/rg/find …, lib/bash-search.ts bashSearchCount): zählen wie Grep/Glob als `suche` */
  bashSearches: number
  /** Schreibziele und ob sie vorher existierten */
  before: Map<string, boolean>
  /** Write auf eine schon vorhandene Datei = geändert, sonst erstellt */
  existed: boolean
}

async function touchesBefore($: EngineInterface, c: ToolCtx): Promise<Touches> {
  const { input, path } = c
  const exists = (p: string): Promise<boolean> => $.fs.exists(diskPath(c, p)).catch(() => true)
  const bashTargets = input.tool === 'Bash' && input.command ? bashWriteTargets(input.command) : []
  const shellTool = input.tool === 'Bash' || input.tool === 'PowerShell'
  const bashReads = shellTool && input.command ? bashReadTargets(input.command, input.tool === 'PowerShell' ? 'powershell' : 'bash') : []
  const bashSearches = input.tool === 'Bash' && input.command ? bashSearchCount(input.command) : 0
  const before = new Map<string, boolean>()
  for (const t of bashTargets) before.set(t, await exists(t))
  const existed = input.tool === 'Write' && path ? await exists(path) : true
  return { bashTargets, bashReads, bashSearches, before, existed }
}

/** Aktuelle Tätigkeit für die Detailansicht (Werkzeug und Ziel, Pfad relativ zum Projekt, Befehl gekürzt) */
async function noteActivity($: EngineInterface, c: ToolCtx, e: ToolEvt): Promise<void> {
  try {
    const act = activityOf(c.input.tool.split('__').at(-1) ?? c.input.tool, e as never, p => repoPath(c, p))
    const at = await $.clock.now()
    await update($, crew, list => list.map(a => (a.id === c.rt.id ? { ...a, taetigkeit: { ...act, zeit: at } } : a)))
  } catch (err) {
    $.ui.log(`codecycle: Tätigkeit nicht gesetzt (${String(err)})`, { to: 'debug' })
  }
}

/** Bash-Berührungen ins Register: Suchen, gelesene Dateien (je Datei einmal) und geänderte/erstellte Ziele; liefert die Anzahl der Einträge */
async function recordBashTouches(
  $: EngineInterface,
  c: ToolCtx,
  b: Book,
  touches: Touches,
  now: string,
  rel: (p: string) => string,
): Promise<number> {
  const rt = c.rt
  let n = 0
  const entry = b.registry.agenten[rt.id]
  // Suchen über Bash zählen wie Grep/Glob (Linux/macOS haben diese Werkzeuge nicht; beide Wege immer)
  for (let k = 0; k < touches.bashSearches; k++) recordTouch(b.registry, rt.id, 'suche', '', now)
  n += touches.bashSearches
  for (const r of touches.bashReads) {
    const p = rel(r)
    // nur Vorhandenes, und jede Datei einmal (kein Aufblähen durch wiederholtes `cat`)
    if (entry?.gelesen.some(g => g.bash && samePath(g.pfad, p))) continue
    if (!(await $.fs.exists(diskPath(c, r)).catch(() => false))) continue
    recordTouch(b.registry, rt.id, 'gelesen', p, now, undefined, true)
    n += 1
  }
  for (const t of touches.bashTargets) {
    // vorher da: geändert (auch gelöscht); vorher nicht, jetzt da: erstellt; sonst nichts (z. B. rm auf Fehlendes)
    if (touches.before.get(t)) recordTouch(b.registry, rt.id, 'geaendert', rel(t), now)
    else if (await $.fs.exists(diskPath(c, t)).catch(() => false)) recordTouch(b.registry, rt.id, 'erstellt', rel(t), now)
    else continue
    n += 1
  }
  return n
}

/** Register und Token-Buch nach einem erfolgreichen Aufruf (nur Pfade relativ zum Projekt); Fehler werden nur protokolliert */
async function recordToolCall($: EngineInterface, c: ToolCtx, touches: Touches): Promise<void> {
  const { rt, input, path } = c
  try {
    const b = await bookOf($, rt.book)
    const now = iso(await $.clock.now())
    // Im Register und im Token-Buch nur Pfade relativ zum Projekt (Hauptordner oder Worktree des Agenten)
    const roots = [await rootOf($), rt.cwd]
    const rel = (p: string): string => repoPath(c, p, roots)
    if (input.tool === 'Read' && path) {
      const range = input.limit !== undefined ? `${input.offset ?? 1}-${(input.offset ?? 1) + input.limit - 1}` : undefined
      recordTouch(b.registry, rt.id, 'gelesen', rel(path), now, range)
    } else if (input.tool === 'Edit' && path) recordTouch(b.registry, rt.id, 'geaendert', rel(path), now)
    else if (input.tool === 'NotebookEdit' && path) recordTouch(b.registry, rt.id, 'geaendert', rel(path), now)
    else if (input.tool === 'Write' && path) recordTouch(b.registry, rt.id, touches.existed ? 'geaendert' : 'erstellt', rel(path), now)
    else if (input.tool === 'Glob' || input.tool === 'Grep') recordTouch(b.registry, rt.id, 'suche', '', now)
    else if (touches.bashTargets.length > 0 || touches.bashReads.length > 0 || touches.bashSearches > 0) {
      if ((await recordBashTouches($, c, b, touches, now, rel)) === 0) return
    } else return
    b.dirty = true
    // Detailansicht neu zeichnen (die Listen kommen aus dem Register, das kein Zustandswert ist)
    await update($, crewNow, () => Date.parse(now))
  } catch (err) {
    $.ui.log(`codecycle: Register: ${String(err)}`, { to: 'debug' })
  }
}

/** Schreibversuch eines fremden Agenten in einer Solo-Aufgabe dieser Sitzung (mainTarget); Regel: hooks/lib/solo.ts */
async function foreignSoloDeny($: EngineInterface, input: ToolInput): Promise<string | null> {
  const target = mainTarget(claim)
  if (target.kind !== 'dir' || !target.dir.startsWith(`${TASKS_DIR}/`)) return null
  const call = { tool: input.tool, command: input.command, path: input.file_path ?? input.notebook_path }
  if (writeTargetsOf(call).length === 0) return null
  if ((await stateOf($, target.dir))?.weg !== 'solo') return null
  const root = await rootOf($)
  return soloWriteDeny(null, call, { rel: p => relPath(p, [root]) })
}

async function onToolCall($: EngineInterface, e: Evt<'tool.call'>, next: Nxt<'tool.call'>) {
  const rt = e.agentId ? agents.get(e.agentId) : undefined
  // Agent ohne codecycle-Rolle, während die Sitzung an einer Solo-Aufgabe arbeitet: nur lesen
  if (!rt && e.agentId) {
    const fi = e as unknown as ToolInput
    const root = await rootOf($)
    const rel = (p: string): string => relPath(root && !/^([\\/]|[A-Za-z]:)/.test(p) ? join(root, p) : p, [root])
    const critical = hookCriticalReason(null, { tool: fi.tool, command: fi.command, path: fi.file_path ?? fi.notebook_path }, rel)
    if (critical) return { deny: critical }
    const denied = await foreignSoloDeny($, fi)
    if (denied) return { deny: denied }
  }
  if (!rt) {
    // Schreiben der Hauptsitzung in docs/codecycle/X/ = diese Sitzung arbeitet an X (nur Signal, ändert den Aufruf nicht)
    if (!e.agentId) await mainWriteSignal($, e as unknown as ToolInput)
    // im Vorlauf: genannter Aufgabenordner bindet, wenn seine STATE.md nach dem Aufruf offen ist (bei new erst danach da)
    const named = e.agentId ? [] : mentionedDirs(e as unknown as Record<string, unknown>)
    if (named.length > 0 && e.tool !== BROWSER_CLOSE_TOOL) {
      const result = await next(e)
      await mentionSignal($, named, e.tool)
      return result
    }
    if (e.agentId || e.tool !== BROWSER_CLOSE_TOOL) return next(e)
    // Bauleiter schließt den Browser: Hinweis „Browser offen“ erledigt
    const closed = await next(e)
    if (closed.deny === undefined && closed.isError !== true) browserOpen.clear()
    return closed
  }
  const input = e as unknown as ToolInput
  const c: ToolCtx = { rt, rootNow: await rootOf($), input, path: input.file_path ?? input.notebook_path }
  const denied = await toolGate($, c)
  if (denied) return { deny: denied }
  await adoptWorktreeOfCall($, c)
  const touches = await touchesBefore($, c)
  await noteActivity($, c, e)
  const result = await next(e)
  if (result.deny !== undefined || result.isError === true) return result
  if (tracksBrowser(rt.rolle)) {
    rt.browser = browserAfter(rt.browser ?? 'nie', e.tool)
    if (rt.browser === 'zu') browserOpen.delete(rt.id)
  }
  await recordToolCall($, c, touches)
  return result
}

async function toolBudget($: EngineInterface, e: ToolEvt) {
  const input = e as unknown as { role?: unknown }
  const role = typeof input.role === 'string' && input.role !== '' ? input.role : undefined
  return toolText(await budgetNow($, role))
}

/** Antworttext von `codecycle_budget` (Limit-Empfehlung, Zeile „Hauptsitzung“). */
async function budgetNow($: EngineInterface, role?: string): Promise<string> {
  await reloadConfig($)
  const usage = await $.session.usage()
  const lim = limitsOf(usage)
  return budgetText(
    {
      ...lim,
      ...(role ? { role } : {}),
      avg: roleAvg,
      threshold: DEFAULT_THRESHOLD,
      contextTokens: await read($, context),
      autoResume: isOn(switches, 'auto-resume'),
    },
    iso => resetText(iso),
  )
}

// Fortschritt je Agent (Schalter agent-progress): nur Anzeige, ändert nichts am Ablauf
async function toolStep($: EngineInterface, e: ToolEvt) {
  const input = e as unknown as { done?: unknown; total?: unknown; note?: unknown; agentId?: string }
  const step = parseStep(input)
  const id = input.agentId
  if (!step) return toolText('Ungültig: done und total als Zahlen, total > 0.')
  if (!id || !agents.has(id)) return toolText('Nur für codecycle-Agenten; nichts eingetragen.')
  const runden = books.get(agents.get(id)!.book)?.costs.agenten[id]?.runden ?? 0
  await update($, crew, list =>
    list.map(a => {
      if (a.id !== id) return a
      const reported = { ...a, schritte: step }
      return { ...reported, balken: progressOf(reported, runden).wert ?? 0 }
    }),
  )
  return toolText(`eingetragen: ${step.done}/${step.total}`)
}

async function toolReload($: EngineInterface, e: ToolEvt) {
  if ((e as unknown as { agentId?: string }).agentId) return toolText('Nur für die Hauptsitzung (/codecycle:update); nichts neu geladen.')
  runReload($)
  return toolText('Neuladen eingeplant: /reload-plugins läuft, sobald diese Antwort fertig ist. Klappt das nicht, steht der Befehl im Eingabefeld.')
}

// ---------------------------------------------------------------------------
// Registrierung: nur die Liste der Handler. Reihenfolge = Verhalten (die `tool.call`-Sperren stehen vor dem Zaun).
export const register: Register = on => {
  on('session.start', onSessionStart)
  on('turn.start', onTurnStart)
  on('session.end', onSessionEnd)
  on('session.measure', onSessionMeasure)
  on('skill.prompt', onSkillPrompt)
  on('prompt.submit', onPromptSubmit)
  on('classic.PostModelSwitch', onPostModelSwitch)
  on('classic.PreModelSwitch', onPreModelSwitch)
  on('turn.complete', onTurnComplete)
  on('command.run', { command: 'codecycle-panel' }, onPanelCommand)
  on('command.run', { command: 'effort' }, onEffortCommand)
  on('command.run', { command: 'codecycle:update' }, onUpdateCommand)
  on('ui.close', onUiClose)
  on('ui.focus', onUiFocus)
  on('ui.render', { component: 'AbovePrompt' }, onRenderBand)
  on('ui.render', { component: 'Pane', requestId: PANE }, onRenderPane)
  on('ui.render', { component: 'SessionMode' }, onRenderSessionMode)
  on('agent.spawn', onAgentSpawn)
  on('turn.step', onTurnStep)
  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, denyPython)
  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, denyBaseline)
  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, denyPartBookkeeping)
  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, budgetAfterCheck)
  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, denyHookBypass)
  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, denySoloMerge)
  on('tool.call', onToolCall)
  on('tool.call', { tool: /^mcp__codecycle__codecycle_budget$/ }, toolBudget)
  on('tool.call', { tool: /^mcp__codecycle__codecycle_step$/ }, toolStep)
  on('tool.call', { tool: /^mcp__codecycle__codecycle_reload$/ }, toolReload)
}
