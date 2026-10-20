// Browser nach dem Browser-Prüfer schließen (sonst läuft Chrome nach dem Lauf weiter, bis die Sitzung endet).
// Der Browser gehört dem Playwright-Server der Hauptsitzung, nicht dem Agenten; der Mod kann keine MCP-Werkzeuge
// aufrufen. Er merkt sich deshalb je Agent, ob der letzte Browser-Aufruf `browser_close` war, und meldet es sonst
// dem Bauleiter. Rein, ohne Node und ohne Mod-API.

/** Werkzeug, das den Browser des Playwright-Plugins schließt. */
export const BROWSER_CLOSE_TOOL = 'mcp__plugin_playwright_playwright__browser_close'

/** Präfix der Werkzeuge des Playwright-Plugins (`playwright@claude-plugins-official`). */
const PLAYWRIGHT_PREFIX = 'mcp__plugin_playwright_playwright__'

/**
 * Stand des Browsers eines Agenten: nie benutzt, offen (letzter Browser-Aufruf war nicht `browser_close`) oder zu.
 * Nur Playwright: für `mcp__Claude_Browser__*` (Desktop-App) ist kein Schließen-Werkzeug bekannt (unbestätigt).
 */
export type BrowserUse = 'nie' | 'offen' | 'zu'

/** Rollen, deren Browser der Mod verfolgt (alter Name `inspector` gilt gleich). */
export function tracksBrowser(rolle: string): boolean {
  return rolle === 'browser-reviewer' || rolle === 'inspector'
}

/** Stand nach einem erfolgreichen Werkzeugaufruf; andere Werkzeuge ändern nichts. */
export function browserAfter(prev: BrowserUse, tool: string): BrowserUse {
  if (!tool.startsWith(PLAYWRIGHT_PREFIX)) return prev
  return tool === BROWSER_CLOSE_TOOL ? 'zu' : 'offen'
}

/** Zeile für die Bautafel, solange ein Browser offen geblieben ist; null, wenn keiner offen ist. */
export function browserOpenHint(open: number): string | null {
  if (open <= 0) return null
  return `Browser offen nach dem Browser-Prüfer: bitte schließen (${BROWSER_CLOSE_TOOL})`
}

/**
 * Hinweis an den Bauleiter (Kontext beim nächsten Prompt der Hauptsitzung, z. B. der Benachrichtigung über das
 * Agentenende): welche Agenten den Browser offen ließen. null ohne offene Browser.
 */
export function browserOpenContext(agentIds: readonly string[]): string | null {
  if (agentIds.length === 0) return null
  return (
    `codecycle: Browser offen, bitte schließen. Der Browser-Prüfer (Agent ${agentIds.join(', ')}) endete, ohne zuletzt ` +
    `${BROWSER_CLOSE_TOOL} aufzurufen; der Browser gehört dem Playwright-Server dieser Sitzung und läuft sonst weiter. ` +
    `Rufe ${BROWSER_CLOSE_TOOL} selbst auf (Schritt 6, Punkt 2).`
  )
}
