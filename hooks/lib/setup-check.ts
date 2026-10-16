// Einrichtungs-Hinweise für Bautafel und Seitenleiste (nach der Installation
// soll man beim ersten Start in die Einrichtung geführt werden, inklusive Node).
// Rein, ohne Node und ohne Mod-API. Der Mod ermittelt beim Sitzungsstart, ob `.claude/codecycle.md`
// und `.codecycle/tool.config.json` da sind und welche Node-Version `node` meldet.

import { compareVersions } from '../../lib/versions.ts'

/** Mindestversion von Node für das Projekt-Werkzeug (wie bin/codecycle und package.json). */
export const NODE_MIN = 24

/** Node-Stand: Versionstext, 'fehlt' (Befehl nicht gefunden) oder null (nicht prüfbar, z. B. ohne Prozess-Zugriff). */
export type NodeState = string | 'fehlt' | null

/**
 * Versionsvermerk der Werkzeug-Kopie (`.codecycle/tool/.copy-info.json`, Feld `version`): Version, 'fehlt',
 * 'unlesbar' (Datei da, aber kein Vermerk) oder null (nicht prüfbar).
 */
export type CopyState = string | 'fehlt' | 'unlesbar' | null

/**
 * `projekt`: `.claude/codecycle.md` vorhanden. `config`: `.codecycle/tool.config.json` vorhanden.
 * `kopie`: Stand der Werkzeug-Kopie. Fehlende Felder gelten als „nicht geprüft“.
 */
export type SetupState = { projekt: boolean; node: NodeState; config?: boolean; kopie?: CopyState }

/** Hauptversion aus „24.15.0“ oder „v24.15.0“; null bei Unlesbarem. */
export function nodeMajor(version: string): number | null {
  const m = version.trim().match(/^v?(\d+)\./)
  return m ? Number(m[1]) : null
}

/** Warnung zu Node oder null, wenn alles passt oder es sich nicht prüfen ließ. */
export function nodeWarning(node: NodeState): string | null {
  if (node === null) return null
  const fix = '/codecycle:setup zeigt den Befehl zum Installieren (danach Claude Code neu starten).'
  if (node === 'fehlt') return `Node fehlt: Das Projekt-Werkzeug läuft nicht, gebaut wird nichts. ${fix}`
  const major = nodeMajor(node)
  if (major !== null && major < NODE_MIN) return `Node ${node.trim()} ist zu alt (mindestens ${NODE_MIN}). ${fix}`
  return null
}

/** Kurzer Hinweis, solange das Projekt nicht eingerichtet ist (keine `.claude/codecycle.md`); null sonst. */
export function setupHint(s: SetupState): string | null {
  return s.projekt ? null : 'Projekt noch nicht eingerichtet: /codecycle:setup'
}

/**
 * Ergebnis von `node -p process.versions.node` bzw. einem Fehler beim Start in einen NodeState übersetzen.
 * Beim Fehler entscheidet die Gegenprobe: Startet ein anderer Befehl (`git --version`), fehlt wirklich Node;
 * sonst ist das Starten von Befehlen hier nicht möglich (laut Typen „CLI only“) und der Stand bleibt unbekannt.
 */
export function nodeStateFrom(r: { exitCode: number; stdout: string } | { error: string; otherCommandRuns: boolean }): NodeState {
  if ('error' in r) return r.otherCommandRuns ? 'fehlt' : null
  if (r.exitCode !== 0) return 'fehlt'
  const v = r.stdout.trim().split(/\r?\n/).at(-1) ?? ''
  return nodeMajor(v) === null ? null : v
}

/** Inhalt von `.copy-info.json` (null = Datei fehlt) in einen CopyState übersetzen. */
export function copyStateFrom(text: string | null): CopyState {
  if (text === null) return 'fehlt'
  try {
    const v = (JSON.parse(text) as { version?: unknown }).version
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : 'unlesbar'
  } catch {
    return 'unlesbar'
  }
}

/** Versionen je Stelle numerisch vergleichen; gemeinsamer Kern mit dem Werkzeug (`codecycle update`). */
export { compareVersions }

/**
 * Hinweis zur Werkzeug-Kopie: nur im eingerichteten Projekt (sonst zeigt setupHint die Einrichtung).
 * Veraltet, fehlend oder ohne Vermerk → /codecycle:update; neuer als das Plugin → ebenfalls /codecycle:update, das zuerst
 * das Plugin aktualisiert und nie zurückstuft. Kein stilles Erneuern: der Aufruf ist die Freigabe.
 */
export function toolCopyHint(s: SetupState, pluginVersion: string): string | null {
  const cmd = '/codecycle:update'
  if (!s.projekt || s.kopie === undefined || s.kopie === null) return null
  if (s.kopie === 'fehlt') return `Werkzeug-Kopie fehlt (Plugin hat ${pluginVersion}): ${cmd}`
  if (s.kopie === 'unlesbar') return `Werkzeug-Kopie ohne lesbaren Versionsvermerk (Plugin hat ${pluginVersion}): ${cmd}`
  const c = compareVersions(s.kopie, pluginVersion)
  if (c === 1) return `Werkzeug-Kopie ${s.kopie} ist neuer als das Plugin (${pluginVersion}): ${cmd} holt das neue Plugin`
  if (c !== 0) return `Werkzeug-Kopie ${s.kopie}, Plugin hat ${pluginVersion}: ${cmd}`
  if (s.config === false) return `Werkzeug-Konfiguration fehlt: ${cmd}`
  return null
}

/** Ergebnis von `codecycle update` (Feldnamen wie `tool/commands/update.ts :: UpdateResult`). */
export type UpdateSummary = { status: string; neuLaden: boolean }

/** Ausgabe von `codecycle update` in Text für die Anzeige und das Ergebnis der Zeile `UPDATE_RESULT {json}` zerlegen. */
export function splitUpdateOutput(stdout: string): { text: string; result: UpdateSummary | null } {
  const lines = stdout.replace(/\r\n/g, '\n').trimEnd().split('\n')
  let result: UpdateSummary | null = null
  const text = lines.filter(line => {
    if (!line.startsWith('UPDATE_RESULT ')) return true
    try {
      const j = JSON.parse(line.slice('UPDATE_RESULT '.length)) as { status?: unknown; neuLaden?: unknown }
      if (typeof j.status === 'string') result = { status: j.status, neuLaden: j.neuLaden === true }
    } catch {
      // kaputte Zeile: kein Ergebnis, der Skill übernimmt
    }
    return false
  })
  return { text: text.join('\n').trim(), result }
}
