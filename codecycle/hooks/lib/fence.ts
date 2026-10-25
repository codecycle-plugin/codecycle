// Entscheidungen des Zauns: reine Funktionen, ohne Node und ohne Mod-API.
// Der Handler `on('tool.call')` in hooks/register.tsx holt die Daten (Einstellungen, Pfade) mit `$` und ruft diese
// Funktionen. Sie geben Meldungstexte zurück (null = erlaubt), nie ein Ergebnis der Mod-API.
// Eigene schlichte Typen, kein Import aus 'claude-code' (sonst bricht die Typprüfung für die Tests).

import { readerBashAllowedText, readerBashProblem } from '../../lib/bash-allowlist.ts'
import { bashWriteTargets } from '../../lib/bash-write-targets.ts'
import { isControlFile, type ProtectedConfig } from '../../lib/protected.ts'
import { samePath } from './ledger-registry.ts'

/**
 * Lese-Rollen: Rollen, die nur ihren Bericht schreiben (setup zusätzlich `.claude/codecycle.md`); Bash nur für Suchen,
 * lesendes git und codecycle-Lesebefehle (unter Linux und macOS gibt es kein Grep und Glob).
 */
export const READER_ROLES: ReadonlySet<string> = new Set(['plan-reviewer', 'setup'])
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

/** Schreibziele eines Aufrufs: bei Edit/Write/NotebookEdit die Datei; bei Bash und PowerShell die erkannten Ziele (Heuristik). */
export function writeTargetsOf(call: ToolCall): string[] {
  if (isWriteTool(call.tool) && call.path) return [call.path]
  if (call.tool === 'Bash' && call.command) return bashWriteTargets(call.command)
  if (call.tool === 'PowerShell' && call.command) return bashWriteTargets(call.command, 'powershell')
  return []
}

/**
 * Dateien, ohne die der Pre-Commit-Hook oder `codecycle guard` still nichts prüft: Git-Hooks, Werkzeug-Kopie und
 * -Konfiguration, guard-Grundlage. Geschützt unabhängig vom Schalter `fence` (Pfad relativ zum Projekt).
 */
const HOOK_CRITICAL = /^(\.githooks(\/.*)?|\.codecycle\/tool\.config\.json|\.codecycle\/tool(\/.*)?|\.codecycle\/tmp\/guard-records\.json)$/i

/**
 * Ändert ein Agent eine dieser Dateien? Für alle Agenten außer `toolsmith`, auch ohne codecycle-Rolle (`role` null);
 * die Hauptsitzung prüft der Mod hier nicht (Einrichtung, Update, `serverTemp` nach Antwort des Nutzers).
 */
export function hookCriticalReason(role: string | null, call: ToolCall, rel: (path: string) => string): string | null {
  if (role === 'toolsmith') return null
  for (const t of writeTargetsOf(call)) {
    const r = rel(t).replace(/\\/g, '/').replace(/^\.\//, '')
    if (HOOK_CRITICAL.test(r)) {
      return `codecycle: ${r} steuert die Prüfung (Git-Hooks, Werkzeug, guard-Grundlage); ändern nur über den toolsmith mit Freigabe des Nutzers.${call.tool === 'Bash' || call.tool === 'PowerShell' ? ' (Schreibziel im Befehl)' : ''}`
    }
  }
  return null
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
  const allowed = {
    cli: cliPaths(env),
    launchers: env.plugin ? [`${env.plugin}/bin/codecycle`] : [],
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
    deny: `codecycle-Zaun (Lese-Rolle ${rt.rolle}): ${why}. Erlaubt sind: Lesen mit Read; Suchen mit Grep und Glob, wo vorhanden, sonst über Bash mit grep, rg, find; Write nur auf ${own.join(' und ')}; Bash nur für ${readerBashAllowedText()}. Nicht erlaubt: andere Dateien schreiben, Umleitungen (>), codecycle check/lint/format, Hilfsskripte, PowerShell. Nicht umgehen; was dir fehlt, im Bericht unter „Offene Punkte“ melden.${stop}`,
    verweigert,
  }
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

/** Meldung des Zauns (Schalter `fence`) zu einem Grund */
export function fenceDenyText(reason: string, tool: string): string {
  return `codecycle-Zaun: ${reason}${tool === 'Bash' ? ' (Schreibziel im Bash-Befehl)' : ''}`
}
