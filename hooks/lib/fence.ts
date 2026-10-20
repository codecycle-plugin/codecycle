// Entscheidungen des Zauns: reine Funktionen, ohne Node und ohne Mod-API.
// Der Handler `on('tool.call')` in hooks/register.tsx holt die Daten (Plan, Register, STATE.md,
// Einstellungen) mit `$` und ruft diese Funktionen. Sie geben Meldungstexte zurück (null = erlaubt), nie ein Ergebnis der Mod-API.
// Eigene schlichte Typen, kein Import aus 'claude-code' (sonst bricht die Typprüfung für die Tests).

import { docKeeperBashProblem, readerBashAllowedText, readerBashProblem } from '../../lib/bash-allowlist.ts'
import { bashWriteTargets } from '../../lib/bash-write-targets.ts'
import { ALL_PACKAGES, type Plan } from '../../lib/plan-file.ts'
import { isControlFile, isDocPath, type ProtectedConfig } from '../../lib/protected.ts'
import { extraReadCost, extraReadCount, samePath, type AgentEntry, type Registry } from './ledger-registry.ts'

/**
 * Lese-Rollen: Rollen, die nur ihren Bericht schreiben (setup zusätzlich `.claude/codecycle.md`).
 * `inspector` ist der frühere Name des Browser-Prüfers. `package-lead` (Paketleiter) zählt mit: Er startet Agenten und
 * schreibt nur seinen Bericht; Bash nur für Suchen, lesendes git und codecycle-Lesebefehle (unter Linux und macOS gibt
 * es kein Grep und Glob).
 */
export const READER_ROLES: ReadonlySet<string> = new Set([
  'surveyor',
  'reviewer',
  'security-reviewer',
  'plan-reviewer',
  'refuter',
  'acceptance',
  'browser-reviewer',
  'inspector',
  'setup',
  'package-lead',
])
/** Ab so vielen Verweigerungen in Folge hängt der Lese-Zaun den Stopp-Hinweis an */
export const READER_STOP_AFTER = 3

export function isReaderRole(role: string): boolean {
  return READER_ROLES.has(role)
}

/** Aufruf eines Werkzeugs durch einen codecycle-Agenten: `path` = `file_path` bzw. `notebook_path` */
export type ToolCall = { tool: string; command?: string | undefined; path?: string | undefined }

/** Der Agent, soweit der Zaun ihn braucht (der Mod hält mehr) */
export type FenceAgent = {
  rolle: string
  paket: string | null
  dir: string | null
  /** Berichtspfad aus der Startnachricht */
  bericht?: string | undefined
  /** Verweigerungen des Lese-Zauns in Folge */
  verweigert?: number | undefined
}

/** Umgebung des Aufrufs, vom Handler bestimmt */
export type FenceEnv = {
  /** Hauptordner des Projekts */
  root: string | null
  /** Plugin-Ordner (`$.plugin.root`) */
  plugin: string | null
  /** Pfad relativ zum Projekt; relative Pfade gelten vom Arbeitsordner des Agenten aus */
  rel: (path: string) => string
}

/** Schreibt dieses Werkzeug eine Datei, deren Pfad im Aufruf steht? (Edit, Write, NotebookEdit) */
export function isWriteTool(tool: string): boolean {
  return tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit'
}

/** Schreibziele eines Aufrufs: bei Edit/Write/NotebookEdit die Datei; bei Bash die erkannten Ziele (Heuristik). */
export function writeTargetsOf(call: ToolCall): string[] {
  if (isWriteTool(call.tool) && call.path) return [call.path]
  if (call.tool === 'Bash' && call.command) return bashWriteTargets(call.command)
  return []
}

function cliPaths(env: FenceEnv): string[] {
  return [env.root && `${env.root}/.codecycle/tool/cli.ts`, env.plugin && `${env.plugin}/tool/cli.ts`].filter((p): p is string => !!p)
}

// ---------------------------------------------------------------------------
// Lese-Rollen

export type ReaderVerdict = {
  /** vollständige Meldung bei Verweigerung, sonst null */
  deny: string | null
  /** neuer Stand des Zählers „Verweigerungen in Folge“ */
  verweigert: number
}

/**
 * Lese-Rollen-Zaun: PowerShell ganz, Bash nur nach Erlaubtliste, Write/Edit/NotebookEdit nur auf den eigenen Bericht
 * (setup zusätzlich `.claude/codecycle.md`). Gilt unabhängig vom Schalter `fence`.
 */
export function readerCheck(rt: FenceAgent, call: ToolCall, env: FenceEnv): ReaderVerdict {
  const server = rt.rolle === 'browser-reviewer' || rt.rolle === 'inspector'
  const allowed = {
    cli: cliPaths(env),
    launchers: env.plugin ? [`${env.plugin}/bin/codecycle`] : [],
    server,
  }
  const fallback = rt.dir ? `${rt.dir}/reports/${rt.paket ? `${rt.paket}-` : ''}${rt.rolle}.md` : `.codecycle/tmp/reports/${rt.rolle}.md`
  const own = [rt.bericht ?? fallback, ...(rt.rolle === 'setup' ? ['.claude/codecycle.md'] : [])]
  let why: string | null = null
  if (call.tool === 'PowerShell') why = 'PowerShell ist nicht freigegeben, nur Bash'
  else if (call.tool === 'Bash' && call.command) why = readerBashProblem(call.command, allowed)
  else if (isWriteTool(call.tool) && call.path) {
    const rel = env.rel(call.path)
    // genau gleich (samePath in beide Richtungen), nicht nur gleiche Endung
    const mine = (o: string): boolean => {
      const r = env.rel(o)
      return samePath(rel, r) && samePath(r, rel)
    }
    if (!own.some(mine)) why = `${rel} ist nicht dein Bericht`
  }
  if (!why) return { deny: null, verweigert: 0 }
  const verweigert = (rt.verweigert ?? 0) + 1
  const stop =
    verweigert >= READER_STOP_AFTER
      ? ` Stopp: ${verweigert} Verweigerungen in Folge. Versuche keine weiteren Wege; schreibe jetzt deinen Bericht mit dem, was du hast (Fehlendes unter „Offene Punkte“), und quittiere.`
      : ''
  return {
    deny: `codecycle-Zaun (Lese-Rolle ${rt.rolle}): ${why}. Erlaubt sind: Lesen mit Read; Suchen mit Grep und Glob, wo vorhanden, sonst über Bash mit grep, rg, find; Write nur auf ${own.join(' und ')}; Bash nur für ${readerBashAllowedText(server)}. Nicht erlaubt: andere Dateien schreiben, Umleitungen (>), codecycle check/lint/format, Hilfsskripte, PowerShell. Nicht umgehen; was dir fehlt, im Bericht unter „Offene Punkte“ melden.${stop}`,
    verweigert,
  }
}

// ---------------------------------------------------------------------------
// Doku-Pfleger

/**
 * Doku-Pfleger-Zaun: Bash nur für git, codecycle und Lesen, Schreiben nur auf Doku-Pfade; PowerShell nicht.
 * Rückgabe: die vollständige Meldung bei Verweigerung, sonst null. Gilt unabhängig vom Schalter `fence`.
 */
export function docKeeperCheck(call: ToolCall, env: FenceEnv): string | null {
  const deny = (why: string) =>
    `codecycle-Zaun (Doku-Pfleger): ${why}. Erlaubt sind Doku-Dateien (*.md, Ordner docs, README, CHANGELOG, CLAUDE.md), git status/diff/log/show, git add und commit auf Doku-Dateien, codecycle-Befehle und Lesebefehle.`
  if (call.tool === 'PowerShell') return deny('PowerShell ist nicht freigegeben, nur Bash')
  // node nur mit genau diesen cli.ts-Pfaden, codecycle mit Pfad nur als Starter des Plugins
  const allowed = { cli: cliPaths(env), launchers: env.plugin ? [`${env.plugin}/bin/codecycle`] : [] }
  const why = call.tool === 'Bash' && call.command ? docKeeperBashProblem(call.command, allowed) : null
  if (why) return deny(why)
  for (const t of writeTargetsOf(call)) {
    const rel = env.rel(t)
    if (!isDocPath(rel)) return deny(`${rel} ist keine Doku-Datei${call.tool === 'Bash' ? ' (Schreibziel im Bash-Befehl)' : ''}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// Zaun (Schalter `fence`)

/** Kontrolldatei (Werkzeug-Konfiguration, Hooks, CI, Test-/Lint-Konfiguration)? Nur der toolsmith darf sie ändern. */
export function controlFileReason(role: string, path: string, config: ProtectedConfig | null): string | null {
  if (role !== 'toolsmith' && isControlFile(path, config)) {
    return `${path} ist eine Kontrolldatei (Werkzeug-Konfiguration, Hooks, CI, Test- oder Lint-Konfiguration); Änderungen nur über den toolsmith mit Freigabe des Nutzers.`
  }
  return null
}

/** Tests des Test-Autors (laut Plan und alles, was er anlegte oder änderte) bleiben für alle außer ihm unverändert. */
export function testAuthorReason(role: string, path: string, plan: Plan, registry: Registry): string | null {
  if (role === 'test-author') return null
  const authors = Object.values(registry.agenten).filter(a => a.rolle === 'test-author')
  const protectedTests = new Set<string>()
  for (const a of authors) {
    // Test-Autor im Aufgabenmodus (Paket alle): die Tests aller Pakete sind seine
    for (const p of plan.pakete) if (a.paket === ALL_PACKAGES || p.id === a.paket) p.tests.forEach(t => protectedTests.add(t))
    for (const t of [...a.erstellt, ...a.geaendert]) protectedTests.add(t.pfad)
  }
  for (const t of protectedTests) {
    if (samePath(path, t) || samePath(t, path)) return `${path} gehört zu den Tests des Test-Autors und bleibt unverändert; Probleme unter „Offene Punkte“ melden.`
  }
  return null
}

/** Der Teil der STATE.md, den der Zaun braucht */
export type FenceState = { pakete: readonly { id: string; status: string }[] }

/** Datei eines anderen offenen Pakets (Neu/Ändern/Tests im Plan; fertige Pakete zählen nicht)? Paket „alle“ umfasst jedes. */
export function otherPackageReason(paket: string | null, path: string, plan: Plan, state: FenceState | null): string | null {
  if (!paket || paket === ALL_PACKAGES) return null
  const own = plan.pakete.find(p => p.id === paket)
  const ownFiles = own ? [...own.neu, ...own.aendern, ...own.tests] : []
  if (ownFiles.some(f => samePath(path, f))) return null
  for (const other of plan.pakete) {
    if (other.id === paket) continue
    const status = state?.pakete.find(p => p.id === other.id)?.status ?? 'offen'
    if (status === 'fertig') continue
    if ([...other.neu, ...other.aendern, ...other.tests].some(f => samePath(path, f))) {
      return `${path} gehört zum offenen Paket ${other.id}; vorschlagen unter „Offene Punkte“, nicht selbst ändern.`
    }
  }
  return null
}

/** Meldung des Zauns (Schalter `fence`) zu einem Grund */
export function fenceDenyText(reason: string, tool: string): string {
  return `codecycle-Zaun: ${reason}${tool === 'Bash' ? ' (Schreibziel im Bash-Befehl)' : ''}`
}

// ---------------------------------------------------------------------------
// Lese-Budget (Schalter `read-budget`)

/** Meldung, wenn dieser Aufruf das Lese-Budget überschreitet; sonst null. */
export function readBudgetDeny(entry: AgentEntry | undefined, limit: number, tool: string, path: string | undefined, command?: string): string | null {
  // ein Bash-Befehl mit mehreren Suchstufen kostet so viele Aufrufe wie Stufen; er muss ganz ins Budget passen
  const cost = entry ? extraReadCost(entry, tool, path, command) : 0
  if (entry && cost > 0 && extraReadCount(entry) + cost > limit) {
    return `codecycle-Lese-Budget erschöpft (${limit} zusätzliche Lese- oder Suchaufrufe). Arbeite mit dem, was du hast, und nenne im Bericht unter „Offene Punkte“, welche Dateien oder Symbole dir gefehlt haben.`
  }
  return null
}
