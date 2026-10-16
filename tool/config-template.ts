// Vorlage für `.codecycle/tool.config.json`, abgeleitet aus dem Projekt (`install-tool` legt sie an,
// wenn die Datei fehlt; vorhandene Konfigurationen werden nie überschrieben).
// Der Kern (`deriveConfig`) ist rein: keine Datei- und Git-Zugriffe, damit er sich leicht testen lässt.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { git } from './exec.ts'
import { selectGraph } from './graph/index.ts'
import { CONFIG_PATH, type ToolConfig, loadConfig } from './project.ts'
import { TOOL_VERSION } from './version.ts'

export const JUNIT_PATH = '.codecycle/tmp/junit.xml'
/** Reporter, die die normale Ausgabe behalten und zusätzlich einen JUnit-Bericht schreiben. */
export const JUNIT_REPORTERS = `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=${JUNIT_PATH}`

export type TemplateInput = {
  /** Inhalt der package.json; null, wenn es keine gibt oder sie unlesbar ist */
  packageJson: { scripts?: Record<string, unknown> } | null
  mainBranch: string
  /** ein Graph-Werkzeug mit Index ist vorhanden */
  graphAvailable: boolean
  /** Paketmanager laut Lockdatei, Standard npm */
  manager?: 'npm' | 'pnpm' | 'yarn'
}

function script(pkg: TemplateInput['packageJson'], name: string): string | null {
  const s = pkg?.scripts?.[name]
  if (typeof s !== 'string' || s.trim() === '') return null
  // das Platzhalter-Skript von `npm init` ist kein Testbefehl
  if (name === 'test' && /no test specified/i.test(s)) return null
  return s
}

/** `node --test …` (ohne Verkettung): Reporter direkt hinter `--test` einfügen; sonst null. */
export function withJunitReporters(command: string): string | null {
  if (!/^\s*node\s/.test(command) || /&&|\|\||;|\|/.test(command) || /--test-reporter/.test(command)) return null
  const m = command.match(/(^|\s)--test(?=\s|$)/)
  if (!m || m.index === undefined) return null
  const at = m.index + m[0].length
  return `${command.slice(0, at)} ${JUNIT_REPORTERS}${command.slice(at)}`.trim()
}

export function deriveConfig(input: TemplateInput): ToolConfig {
  const manager = input.manager ?? 'npm'
  const run = (name: string): string => (manager === 'npm' ? (name === 'test' ? 'npm test' : `npm run ${name}`) : `${manager} ${name}`)
  const testScript = script(input.packageJson, 'test')
  const config: ToolConfig = {
    version: TOOL_VERSION,
    mainBranch: input.mainBranch,
    commands: {
      test: testScript === null ? null : run('test'),
      lint: script(input.packageJson, 'lint') === null ? null : run('lint'),
      format: script(input.packageJson, 'format') === null ? null : run('format'),
    },
    graph: { provider: input.graphAvailable ? 'auto' : 'none' },
  }
  // Wirkt nur bei `node --test`; gleichzeitig ist es der einzige Weg zur Testzahl für `guard`.
  const withReporters = testScript === null ? null : withJunitReporters(testScript)
  if (withReporters !== null) {
    config.commands.test = withReporters
    config.junit = JUNIT_PATH
  }
  return config
}

function detectMainBranch(root: string): string {
  const origin = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], root)
  if (origin.ok && origin.out.startsWith('origin/')) return origin.out.slice('origin/'.length)
  for (const b of ['main', 'master']) {
    if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], root).ok) return b
  }
  const current = git(['symbolic-ref', '--short', 'HEAD'], root)
  return current.ok && current.out !== '' ? current.out : 'main'
}

function readPackageJson(root: string): TemplateInput['packageJson'] {
  const path = join(root, 'package.json')
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as unknown
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as TemplateInput['packageJson']) : null
  } catch {
    return null
  }
}

/** Vorlage für das Projekt aus package.json, Git und vorhandenem Graph. */
export function templateFor(root: string): ToolConfig {
  const manager = managerOf(root)
  return deriveConfig({
    packageJson: readPackageJson(root),
    mainBranch: detectMainBranch(root),
    graphAvailable: selectGraph(root, 'auto').adapter !== null,
    manager,
  })
}

/** Legt `.codecycle/tool.config.json` an, wenn sie fehlt. Gibt die Vorlage zurück, sonst null (nie überschreiben). */
export function writeConfigIfMissing(root: string, dryRun: boolean): ToolConfig | null {
  const path = join(root, CONFIG_PATH)
  if (existsSync(path)) return null
  const config = templateFor(root)
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
  }
  return config
}

function managerOf(root: string): 'npm' | 'pnpm' | 'yarn' {
  return existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, 'yarn.lock')) ? 'yarn' : 'npm'
}

/**
 * Lässt sich in einer bestehenden Konfiguration `junit` samt Reporter ergänzen? Nur wenn der Testbefehl
 * ein reines `node --test …` ohne Reporter ist, oder genau der Aufruf des Paketmanagers (`npm test`), dessen
 * Skript in der `package.json` ein reines `node --test …` ist. Sonst null: dann nur melden, nichts ändern.
 */
export function junitFix(root: string, config: ToolConfig): { test: string } | null {
  if (config.junit) return null
  const test = config.commands.test
  if (!test) return null
  const direct = withJunitReporters(test)
  if (direct !== null) return { test: direct }
  // Reporter schon am Befehl, nur der Pfad fehlt in der Konfiguration
  if (test.includes(`--test-reporter-destination=${JUNIT_PATH}`)) return { test }
  const manager = managerOf(root)
  const plain = manager === 'npm' ? 'npm test' : `${manager} test`
  if (test.trim() !== plain) return null
  const derived = deriveConfig({ packageJson: readPackageJson(root), mainBranch: 'main', graphAvailable: false, manager })
  return derived.junit && derived.commands.test ? { test: derived.commands.test } : null
}

/**
 * `install-tool --update-config`: ergänzt fehlende Felder einer bestehenden Konfiguration aus der Vorlage
 * (`mainBranch`, `graph`, `junit` samt Reporter am Testbefehl). Überschreibt nichts Vorhandenes; eine ältere `version` wird auf `TOOL_VERSION` gehoben.
 * `added`: was ergänzt wurde, `notes`: was nur gemeldet wird.
 */
export function updateConfig(root: string, dryRun: boolean): { added: string[]; notes: string[] } {
  const path = join(root, CONFIG_PATH)
  const config = loadConfig(root) // wirft bei fehlender oder ungültiger Datei
  const data = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as Record<string, unknown> & { commands: Record<string, unknown> }
  const template = templateFor(root)
  const added: string[] = []
  const notes: string[] = []
  if (config.mainBranch === undefined && template.mainBranch) {
    data.mainBranch = template.mainBranch
    added.push(`mainBranch: ${template.mainBranch}`)
  }
  if (config.graph === undefined && template.graph) {
    data.graph = template.graph
    added.push(`graph.provider: ${template.graph.provider}`)
  }
  if (config.junit === undefined) {
    const fix = junitFix(root, config)
    if (fix) {
      if (fix.test !== config.commands.test) {
        data.commands.test = fix.test
        added.push('commands.test: JUnit-Reporter ergänzt')
      }
      data.junit = JUNIT_PATH
      added.push(`junit: ${JUNIT_PATH}`)
    } else if (config.commands.test) {
      notes.push(`junit nicht ergänzt: Testbefehl „${config.commands.test}“ ist kein reines node --test; Reporter von Hand eintragen, wenn die Testzahl erfasst werden soll`)
    }
  }
  // Stand der Konfiguration auf den Werkzeugstand heben, auch wenn sonst nichts fehlte; nie senken
  if (olderVersion(config.version, TOOL_VERSION)) {
    data.version = TOOL_VERSION
    added.push(`version: ${config.version} → ${TOOL_VERSION}`)
  }
  if (added.length > 0 && !dryRun) writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
  return { added, notes }
}

/** `a` ist älter als `b` (Zahlenteile wie 0.1.0; Unlesbares gilt als älter). */
export function olderVersion(a: string, b: string): boolean {
  const parse = (v: string): number[] | null => (/^\d+(\.\d+)*$/.test(v.trim()) ? v.trim().split('.').map(Number) : null)
  const x = parse(a)
  const y = parse(b)
  if (y === null) return false
  if (x === null) return true
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0
  }
  return false
}
