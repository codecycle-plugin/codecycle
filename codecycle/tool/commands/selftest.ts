import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { browserChecks, browserInputs, hasUi } from '../browser-check.ts'

import { COPY_DIR, copyFiles, readCopyInfo, treeHash } from '../copy.ts'
import { junitFix } from '../config-template.ts'
import { openGraph } from '../graph-use.ts'
import { HOOK_NAMES, hooksState, missingText } from '../hooks-state.ts'
import type { Ctx } from '../main.ts'
import { OWN_LAYOUT, layoutOf, pluginToolDir } from '../paths.ts'
import { CONFIG_PATH, findProjectRoot, loadConfig } from '../project.ts'
import { MIN_NODE, TOOL_VERSION } from '../version.ts'
import { type Runner, defaultRunner, lastJson } from './update.ts'

type Check = { name: string; mark: '✔' | '✘' | '!'; detail: string }

/**
 * Funktioniert das Werkzeug in diesem Projekt? Ein `✘` heißt Exit 2 (Werkzeug kaputt); `!` ist ein
 * Hinweis (Graph, Hooks, Kopie veraltet, Voraussetzungen des Browser-Prüfers; ein Hook-Ordner, der fehlt, ist aber ein `✘`),
 * der den Ablauf nicht stoppt (Rückfall ohne Graph). `run` startet `claude plugin list --json` (im Test ersetzbar).
 */
export function selftest(_args: string[], ctx: Ctx, run: Runner = defaultRunner): number {
  const checks: Check[] = []
  const major = Number(process.versions.node.split('.')[0])
  checks.push({
    name: 'Node',
    mark: major >= MIN_NODE ? '✔' : '✘',
    detail: `${process.versions.node}${major >= MIN_NODE ? '' : ` (mindestens ${MIN_NODE})`}`,
  })
  let root: string | null = null
  try {
    root = findProjectRoot(ctx.cwd)
    checks.push({ name: 'Git-Repository', mark: '✔', detail: root })
  } catch (err) {
    checks.push({ name: 'Git-Repository', mark: '✘', detail: (err as Error).message })
  }
  if (root) {
    let serverCommand: string | null | undefined
    try {
      const config = loadConfig(root)
      serverCommand = config.commands.server
      checks.push({ name: 'Konfiguration', mark: '✔', detail: CONFIG_PATH })
      const t = config.commands.test
      checks.push({
        name: 'Testbefehl',
        mark: t === undefined ? '✘' : '✔',
        detail: t === null ? 'nicht vorhanden' : (t ?? 'nicht eingetragen'),
      })
      if (config.version !== TOOL_VERSION) {
        checks.push({
          name: 'Werkzeug-Version',
          mark: '!',
          detail: `Konfiguration ${config.version}, Werkzeug ${TOOL_VERSION}`,
        })
      }
      if (!config.junit && junitFix(root, config)) {
        checks.push({
          name: 'junit',
          mark: '!',
          detail: 'fehlt in der Konfiguration, die Testzahl (Regel von guard) ist nicht erfassbar; Abhilfe: codecycle install-tool --update-config',
        })
      }
    } catch (err) {
      checks.push({ name: 'Konfiguration', mark: '✘', detail: (err as Error).message })
    }
    checks.push(copyCheck(root))
    checks.push(graphCheck(root))
    checks.push(hooksCheck(root))
    checks.push(...uiChecks(root, serverCommand, run))
  }
  for (const c of checks) ctx.out(`${c.mark} ${c.name}: ${c.detail}`)
  return checks.some(c => c.mark === '✘') ? 2 : 0
}

/** Werkzeug-Kopie gegen die Version des Plugins („Check am Anfang“). */
function copyCheck(root: string): Check {
  const name = 'Werkzeug-Kopie'
  const info = readCopyInfo(root)
  const pluginDir = pluginToolDir()
  const plugin = pluginDir ? { version: TOOL_VERSION, hash: treeHash(copyFiles(layoutOf(pluginDir))) } : null
  if (!info) {
    return { name, mark: '!', detail: `fehlt (Anlegen: /codecycle:update in Claude, im Terminal codecycle install-tool${OWN_LAYOUT.isCopy ? ' --from <plugin-ordner>' : ''})` }
  }
  // die Kopie selbst gegen den Vermerk: von Hand geänderte oder beschädigte Dateien
  const actual = treeHash(copyFiles(layoutOf(join(root, COPY_DIR))))
  if (actual !== info.hash) {
    return { name, mark: '!', detail: `veraltet oder verändert (Dateien weichen vom Vermerk ${info.hash} ab: ${actual}); Update: /codecycle:update (in Claude), im Terminal codecycle install-tool` }
  }
  if (!plugin) return { name, mark: '✔', detail: `Version ${info.version} (Plugin-Stand unbekannt: nicht aus dem Plugin gestartet)` }
  if (info.hash === plugin.hash) return { name, mark: '✔', detail: `Version ${info.version}, entspricht dem Plugin` }
  return {
    name,
    mark: '!',
    detail: `veraltet (Kopie ${info.version}/${info.hash}, Plugin ${plugin.version}/${plugin.hash}); Update: /codecycle:update (in Claude), im Terminal codecycle install-tool`,
  }
}

/** Zeitlimit für `claude plugin list --json`: hängt `claude`, soll der Selbsttest nicht mithängen. */
export const PLUGIN_LIST_TIMEOUT_MS = 15_000

/** Nur bei einer Oberfläche laut `.claude/codecycle.md`: Voraussetzungen des Browser-Prüfers (tool/browser-check.ts). */
function uiChecks(root: string, serverCommand: string | null | undefined, run: Runner): Check[] {
  const md = join(root, '.claude', 'codecycle.md')
  if (!existsSync(md) || !hasUi(readFileSync(md, 'utf8'))) return []
  const list = run(['claude', 'plugin', 'list', '--json'], root, { timeoutMs: PLUGIN_LIST_TIMEOUT_MS })
  const pluginList = list.code === 0 ? lastJson(list.stdout) : null
  return browserChecks(browserInputs(root, pluginList, serverCommand))
}

function graphCheck(root: string): Check {
  const name = 'Graph'
  const og = openGraph(root)
  if (!og.adapter) return { name, mark: '!', detail: `${og.note ?? 'nicht verfügbar'}; Rückfall: Outline und Textsuche` }
  const status = og.adapter.status(root)
  const detail = `${og.adapter.label}${status ? `, ${status.detail}` : ''}`
  return { name, mark: og.note ? '!' : '✔', detail }
}

function hooksCheck(root: string): Check {
  const name = 'Hooks'
  const s = hooksState(root)
  const ok = Object.values(s.hooks).filter(v => v === 'ok').length
  // Hooks liefen still nicht: Fehler, kein Hinweis (die Hook-Sperre wäre wirkungslos)
  if (s.missingDir) return { name, mark: '✘', detail: missingText(s.hooksPath) }
  if (!s.active) return { name, mark: '!', detail: 'nicht aktiv (codecycle hooks install)' }
  if (ok === HOOK_NAMES.length) return { name, mark: '✔', detail: `${s.hooksPath} (${ok} von ${HOOK_NAMES.length})` }
  const bad = Object.entries(s.hooks).filter(([, v]) => v !== 'ok').map(([k, v]) => `${k}: ${v}`)
  return { name, mark: '!', detail: `${bad.join(', ')} (codecycle hooks install)` }
}
