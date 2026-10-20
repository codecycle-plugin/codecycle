import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ToolBroken } from './errors.ts'
import { git } from './exec.ts'
import { pathsLib, projectRootLib } from './lib-path.ts'

export const CONFIG_PATH = pathsLib.TOOL_CONFIG
export type GraphProviderName = 'auto' | 'code-review-graph' | 'codegraph' | 'none'
export const GRAPH_PROVIDERS: GraphProviderName[] = ['auto', 'code-review-graph', 'codegraph', 'none']

export const TMP_DIR = '.codecycle/tmp'

/**
 * Werkzeug-Konfiguration des Projekts. Befehl `null` = im Projekt nicht vorhanden;
 * fehlender Eintrag = nicht eingerichtet.
 */
export type ToolConfig = {
  version: string
  mainBranch?: string
  commands: {
    test?: string | null
    /** mit Platzhalter `{filter}`, z. B. `npm test -- --grep {filter}` */
    testFilter?: string | null
    testFull?: string | null
    lint?: string | null
    format?: string | null
    /** Dev-Server, läuft im Hintergrund (Befehl `server`) */
    server?: string | null
    /** Tests zu mehreren Dateien, mit Platzhalter `{files}` (Befehl `test --affected`) */
    testAffected?: string | null
  }
  /** Code-Graph: Anbieter, Standard `auto` (vorhandenen erkennen, sonst Outline) */
  graph?: { provider?: GraphProviderName }
  /** Pfad eines JUnit-XML-Berichts, den der Testbefehl schreibt */
  junit?: string
  /**
   * Wegwerf-Datendatei für den Browser-Prüfer (`server --temp`): `env` = Umgebungsvariable, über die der Server seine
   * Datendatei liest; `file` = Dateiname in der Wegwerf-Ablage (Standard `daten`). `ohneDaten: true` = der Server
   * speichert nichts, `--temp` startet ihn ohne Variable. Nie automatisch erzeugt.
   */
  serverTemp?: { env: string; file?: string } | { ohneDaten: true }
}

/** Gemeinsames Git-Verzeichnis (`--git-common-dir`, absolut; im Worktree das `.git` des Hauptordners). */
export function gitCommonDir(cwd: string): string {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd)
  if (common.missing) throw new ToolBroken('git nicht gefunden (nicht installiert oder nicht auf dem PATH)')
  if (!common.ok || common.out === '') throw new ToolBroken(`kein Git-Repository: ${cwd}`)
  return common.out
}

/**
 * Hauptordner des Projekts, auch aus einem Worktree heraus. Die Regel steht im Kern
 * (`lib/project-root.ts`); der Rückfall gilt für Git-Verzeichnisse, die nicht `.git` heißen.
 */
export function findProjectRoot(cwd: string): string {
  const out = gitCommonDir(cwd)
  return resolve(projectRootLib.mainRootFromCommonDir(out, cwd) ?? dirname(resolve(out)))
}

/** Wurzel des Worktrees, in dem gearbeitet wird (dort laufen Tests). */
export function findWorkTree(cwd: string): string {
  const top = git(['rev-parse', '--show-toplevel'], cwd)
  if (top.missing) throw new ToolBroken('git nicht gefunden (nicht installiert oder nicht auf dem PATH)')
  if (!top.ok || top.out === '') throw new ToolBroken(`kein Git-Repository: ${cwd}`)
  return resolve(top.out)
}

export function loadConfig(root: string): ToolConfig {
  const path = join(root, CONFIG_PATH)
  if (!existsSync(path)) throw new ToolBroken(`${CONFIG_PATH} fehlt (Einrichtung: /codecycle:setup)`)
  let data: unknown
  try {
    // BOM entfernen: Windows PowerShell 5.1 und manche Editoren schreiben eine
    data = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  } catch (err) {
    throw new ToolBroken(`${CONFIG_PATH} ist kein gültiges JSON: ${(err as Error).message}`)
  }
  const commands = (data as { commands?: unknown } | null)?.commands
  if (typeof commands !== 'object' || commands === null || Array.isArray(commands)) {
    throw new ToolBroken(`${CONFIG_PATH}: Feld "commands" fehlt`)
  }
  for (const [key, value] of Object.entries(commands)) {
    if (value !== null && typeof value !== 'string') {
      throw new ToolBroken(`${CONFIG_PATH}: commands.${key} muss Text oder null sein`)
    }
    // ein leerer Befehl liefe als leere Shell-Zeile und wäre fälschlich „grün“
    if (typeof value === 'string' && value.trim() === '') {
      throw new ToolBroken(`${CONFIG_PATH}: commands.${key} darf nicht leer sein (null = nicht vorhanden)`)
    }
  }
  const { version, mainBranch } = data as { version?: unknown; mainBranch?: unknown }
  if (typeof version !== 'string') throw new ToolBroken(`${CONFIG_PATH}: version muss Text sein`)
  if (mainBranch !== undefined && typeof mainBranch !== 'string') {
    throw new ToolBroken(`${CONFIG_PATH}: mainBranch muss Text sein`)
  }
  const provider = (data as { graph?: { provider?: unknown } }).graph?.provider
  if (provider !== undefined && !GRAPH_PROVIDERS.includes(provider as GraphProviderName)) {
    throw new ToolBroken(`${CONFIG_PATH}: graph.provider muss einer von ${GRAPH_PROVIDERS.join(', ')} sein`)
  }
  // Der JUnit-Bericht wird vor jedem Lauf gelöscht: nur Pfade im Projekt zulassen.
  const junit = (data as { junit?: unknown }).junit
  if (junit !== undefined && !isInsidePath(junit)) {
    throw new ToolBroken(`${CONFIG_PATH}: junit muss ein Pfad im Projekt sein (relativ, ohne ..)`)
  }
  const serverTemp = (data as { serverTemp?: unknown }).serverTemp
  if (serverTemp !== undefined) {
    const st = serverTemp as { env?: unknown; file?: unknown; ohneDaten?: unknown } | null
    if (typeof st !== 'object' || st === null || Array.isArray(st)) {
      throw new ToolBroken(`${CONFIG_PATH}: serverTemp muss ein Objekt { env, file? } oder { ohneDaten: true } sein`)
    }
    if ('ohneDaten' in st) {
      // „speichert nichts“ ist eine bewusste Aussage: nur true, nicht gemischt mit env/file
      if (st.ohneDaten !== true || Object.keys(st).length !== 1) {
        throw new ToolBroken(`${CONFIG_PATH}: serverTemp.ohneDaten muss true sein und allein stehen ({ "ohneDaten": true })`)
      }
    } else if (typeof st.env !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(st.env)) {
      throw new ToolBroken(`${CONFIG_PATH}: serverTemp.env muss der Name einer Umgebungsvariable sein (Text, nicht leer)`)
    }
    if (st.file !== undefined && (typeof st.file !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(st.file))) {
      throw new ToolBroken(`${CONFIG_PATH}: serverTemp.file muss ein Dateiname ohne Pfad sein`)
    }
  }
  return data as ToolConfig
}

function isInsidePath(value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false
  if (/^([a-zA-Z]:|[\\/])/.test(value)) return false
  return !value.split(/[\\/]/).includes('..')
}

/**
 * `.codecycle/tmp/` im angegebenen Ordner, angelegt falls nötig. Verbirgt sich
 * selbst vor Git (nie committet), unabhängig vom Einrichten.
 */
export function tmpDir(dir: string): string {
  const path = join(dir, TMP_DIR)
  mkdirSync(path, { recursive: true })
  const ignore = join(path, '.gitignore')
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
  return path
}

/** Konfiguration oder null, wenn sie fehlt oder fehlerhaft ist (für Befehle, die auch ohne sie arbeiten). */
export function tryLoadConfig(root: string): ToolConfig | null {
  try {
    return loadConfig(root)
  } catch {
    return null
  }
}
