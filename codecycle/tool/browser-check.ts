// Voraussetzungen des Browser-Prüfers: Playwright-Plugin, Google Chrome,
// kein zweiter Playwright-Server, Serverbefehl. Geprüft von `codecycle selftest`, nur wenn `.claude/codecycle.md`
// eine Oberfläche nennt. Die Prüfungen sind rein (Inhalte und Pfade als Parameter); Datei- und Prozesszugriffe
// macht `browserInputs`.

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const PLAYWRIGHT_PLUGIN = 'playwright@claude-plugins-official'
export const PLAYWRIGHT_INSTALL = `claude plugin install ${PLAYWRIGHT_PLUGIN}`
export const CHROME_INSTALL = 'npx playwright install chrome'

export type BrowserCheck = { name: string; mark: '✔' | '!'; detail: string }

/** Abschnitt `## <titel>` einer Markdown-Datei bis zur nächsten Überschrift gleicher oder höherer Ebene; null ohne ihn. */
function section(md: string, title: string): string | null {
  const lines = md.split(/\r?\n/)
  const start = lines.findIndex(l => new RegExp(`^##\\s+${title}\\s*$`, 'i').test(l.trim()))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n')
}

/** Nennt `.claude/codecycle.md` eine Oberfläche? Zeile „Gibt es eine: ja“ im Abschnitt „Oberfläche“ (Vorlage `project.md`). */
export function hasUi(md: string): boolean {
  const s = section(md, 'Oberfläche')
  return s !== null && /^\s*[-*]\s*Gibt es eine\s*:\s*\**\s*ja\b/im.test(s)
}

/**
 * Serverbefehl aus `.claude/codecycle.md` (Abschnitt „Befehle“, Zeile `- server: …`): der Befehl (Backticks am Anfang
 * des Werts, sonst der Text bis zu einer Klammer), null bei „nicht vorhanden“, undefined ohne Zeile oder mit
 * Platzhalter `<…>`. Backticks zählen nur am Anfang: eine Erklärung in Klammern dahinter kann selbst Befehle in
 * Backticks nennen („nicht vorhanden (`codecycle install-tool` …)“ ist kein Serverbefehl).
 */
export function serverCommandFromMd(md: string): string | null | undefined {
  const s = section(md, 'Befehle')
  if (s === null) return undefined
  const m = s.match(/^\s*[-*]\s*server\s*:\s*(.+)$/im)
  if (!m) return undefined
  const value = m[1]!.trim()
  const ticked = value.match(/^`([^`]+)`/)
  if (ticked) return ticked[1]!.trim() || undefined
  if (/^nicht vorhanden\b|^keine?\b|^–$|^-$/i.test(value)) return null
  if (value.startsWith('<')) return undefined
  const plain = value.replace(/\s*\(.*$/, '').trim()
  return plain === '' || plain.includes('<') || plain.includes('`') ? undefined : plain
}

/** Stand des Playwright-Plugins aus `claude plugin list --json` (Liste oder `{ installed }`): aktiv, aus, fehlt; null = nicht lesbar. */
export function playwrightPluginState(listJson: unknown): 'aktiv' | 'aus' | 'fehlt' | null {
  const list = Array.isArray(listJson) ? listJson : (listJson as { installed?: unknown } | null)?.installed
  if (!Array.isArray(list)) return null
  const entry = (list as { id?: unknown; enabled?: unknown }[]).find(p => p?.id === PLAYWRIGHT_PLUGIN)
  if (!entry) return 'fehlt'
  return entry.enabled === false ? 'aus' : 'aktiv'
}

/** Übliche Orte von Google Chrome (Kanal `chrome` von Playwright) je System. */
export function chromePaths(platform: string, env: Record<string, string | undefined>, home: string): string[] {
  if (platform === 'linux') return ['/opt/google/chrome/chrome']
  if (platform === 'darwin') {
    const app = 'Google Chrome.app/Contents/MacOS/Google Chrome'
    return [`/Applications/${app}`, join(home, 'Applications', app)]
  }
  if (platform === 'win32') {
    const exe = ['Google', 'Chrome', 'Application', 'chrome.exe']
    const roots = [env.ProgramFiles ?? 'C:\\Program Files', env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')]
    return roots.map(r => [r, ...exe].join('\\'))
  }
  return []
}

const normKey = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * Eigene MCP-Einträge namens `playwright` neben dem Plugin: in `~/.claude.json` global (`mcpServers`) und im
 * Eintrag des Projekts (`projects[<ordner>].mcpServers`) sowie in `.mcp.json` des Projekts. Gibt die Fundorte zurück.
 */
export function ownPlaywrightServers(claudeJson: unknown, projectRoot: string, mcpJson: unknown): string[] {
  const has = (o: unknown): boolean => typeof o === 'object' && o !== null && Object.prototype.hasOwnProperty.call(o, 'playwright')
  const found: string[] = []
  const cj = claudeJson as { mcpServers?: unknown; projects?: Record<string, { mcpServers?: unknown }> } | null
  if (has(cj?.mcpServers)) found.push('~/.claude.json (global)')
  const projects = cj?.projects
  if (projects && typeof projects === 'object') {
    for (const [key, value] of Object.entries(projects)) {
      if (normKey(key) === normKey(projectRoot) && has(value?.mcpServers)) found.push('~/.claude.json (Projekt)')
    }
  }
  if (has((mcpJson as { mcpServers?: unknown } | null)?.mcpServers)) found.push('.mcp.json')
  return found
}

export type BrowserInputs = {
  /** Ausgabe von `claude plugin list --json` als JSON; null = `claude` nicht aufrufbar oder Ausgabe unlesbar */
  pluginList: unknown
  /** gefundener Chrome-Pfad oder null; `chromeSearched` = durchsuchte Orte */
  chrome: string | null
  chromeSearched: string[]
  /** Fundorte eines eigenen MCP-Eintrags `playwright` */
  ownServers: string[]
  /** `commands.server` der Werkzeug-Konfiguration (undefined = nicht eingetragen) */
  serverCommand: string | null | undefined
}

/**
 * Prüfungen für den Browser-Prüfer und die Zeile „Browser-Prüfung“ (bereit oder was fehlt) in der Ausgabe des
 * Selbsttests; der Bauleiter liest sie vor jedem Browser-Prüfer. Nur Hinweise (`!`): der Selbsttest scheitert daran nicht.
 */
export function browserChecks(i: BrowserInputs): BrowserCheck[] {
  const checks: BrowserCheck[] = []
  const missing: string[] = []
  const restart = 'danach Claude Code neu starten'
  const plugin = playwrightPluginState(i.pluginList)
  if (plugin === 'aktiv') checks.push({ name: 'Playwright-Plugin', mark: '✔', detail: PLAYWRIGHT_PLUGIN })
  else {
    missing.push('Playwright-Plugin')
    const detail =
      plugin === 'aus'
        ? `installiert, aber abgeschaltet; Abhilfe: claude plugin enable ${PLAYWRIGHT_PLUGIN}, ${restart}`
        : plugin === 'fehlt'
          ? `fehlt; Abhilfe: ${PLAYWRIGHT_INSTALL}, ${restart}`
          : `nicht prüfbar (claude plugin list --json lief nicht oder brauchte zu lange); prüfen mit /plugin, sonst ${PLAYWRIGHT_INSTALL}, ${restart}`
    checks.push({ name: 'Playwright-Plugin', mark: '!', detail })
  }
  if (i.chrome) checks.push({ name: 'Google Chrome', mark: '✔', detail: i.chrome })
  else {
    missing.push('Google Chrome')
    const where = i.chromeSearched.length > 0 ? ` (gesucht: ${i.chromeSearched.join(', ')})` : ''
    checks.push({
      name: 'Google Chrome',
      mark: '!',
      detail: `fehlt${where}; das Playwright-Plugin braucht Google Chrome, Chromium reicht nicht. Abhilfe im eigenen Terminal: ${CHROME_INSTALL} (braucht Administratorrechte; nicht über ! in Claude Code, sudo fragt dort nicht nach dem Passwort)`,
    })
  }
  if (i.ownServers.length > 0) {
    checks.push({
      name: 'Playwright-Server',
      mark: '!',
      detail: `eigener MCP-Eintrag playwright neben dem Plugin (${i.ownServers.join(', ')}): zwei Server, zwei Browser; Abhilfe: claude mcp remove playwright (bei .mcp.json den Eintrag dort entfernen)`,
    })
  }
  if (i.serverCommand === undefined) {
    checks.push({
      name: 'Serverbefehl',
      mark: '!',
      detail: 'commands.server fehlt in .codecycle/tool.config.json (codecycle server startet sonst nichts); Abhilfe: Zeile „server:“ unter „Befehle“ in .claude/codecycle.md, dann codecycle install-tool --update-config',
    })
  }
  checks.push(
    missing.length === 0
      ? { name: 'Browser-Prüfung', mark: '✔', detail: 'bereit' }
      : { name: 'Browser-Prüfung', mark: '!', detail: `fehlt: ${missing.join(', ')}` },
  )
  return checks
}

function readJson(path: string): unknown {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as unknown) : null
  } catch {
    return null
  }
}

/**
 * Sammelt die Eingaben aus dem System. `pluginList` liefert der Aufrufer (Prozess `claude plugin list --json`).
 * Ort von `.claude.json`: `$CLAUDE_CONFIG_DIR/.claude.json`, sonst `~/.claude.json` (Annahme, live unbestätigt).
 */
export function browserInputs(root: string, pluginList: unknown, serverCommand: string | null | undefined): BrowserInputs {
  const home = homedir()
  const searched = chromePaths(process.platform, process.env, home)
  const configDir = process.env.CLAUDE_CONFIG_DIR
  const claudeJson = readJson(configDir ? join(configDir, '.claude.json') : join(home, '.claude.json'))
  return {
    pluginList,
    chrome: searched.find(p => existsSync(p)) ?? null,
    chromeSearched: searched,
    ownServers: ownPlaywrightServers(claudeJson, root, readJson(join(root, '.mcp.json'))),
    serverCommand,
  }
}
