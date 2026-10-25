// Agentenstart: reiner Teil von `prepare` in hooks/register.tsx, ohne Node und ohne Mod-API.
// `prepare` liest Dateien (alles mit `$`); aus den gelesenen Daten und der Startnachricht bestimmen diese Funktionen
// Aufgabenordner, Berichtspfad und die Anhänge an die Startnachricht (Fortschritt, Bericht).

/** Ergebnis von `prepare`: was der Mod über den Start eines Agenten weiß und der Startnachricht anhängt */
export type Spawn = {
  role: string
  dir: string | null
  paket: string | null
  groesse: string
  model?: string
  reason: string
  text: string
  /** Aufgabenordner stand ausdrücklich in der Startnachricht (Signal für die Hauptsitzung) */
  explicitDir?: boolean
  /** Berichtspfad, wie in der Startnachricht genannt */
  bericht?: string
}

/**
 * Schreibziel aus der Startnachricht (Name ohne `.md`): ein einziger `reports/*.md` gilt; bei mehreren der Pfad
 * nach „Bericht:“, sonst der Name `<nr>-<rolle>` bzw. `<rolle>`, sonst keiner (Standardpfad aus `reportPath`).
 * Ein Lesehinweis auf einen fremden Bericht verschiebt so das Schreibrecht nicht.
 */
function pickReport(prompt: string, role?: string): string | undefined {
  const names = [...prompt.matchAll(/reports[\\/]([\w.-]+?)\.md/g)].map(m => m[1]!)
  if (new Set(names).size <= 1) return names[0]
  const labelled = prompt.match(/\bBericht(?:spfad)?\s*:\s*[`"']?[^\s`"']*?reports[\\/]([\w.-]+?)\.md/i)
  if (labelled) return labelled[1]
  if (!role) return undefined
  return names.find(n => n === role || new RegExp(`^\\d+-${role}$`, 'i').test(n))
}

/**
 * Aufgabenordner und Berichtspfad aus der Startnachricht des Bauleiters; `role` (ohne Präfix) wählt unter mehreren
 * Berichten. Ein Paket liest der Mod nicht aus dem Text; das Feld `paket` gibt es nur in alten Register-Einträgen.
 */
export function parseSpawnPrompt(prompt: string, role?: string): { aufgabeDir?: string; bericht?: string } {
  const out: { aufgabeDir?: string; bericht?: string } = {}
  const dir = prompt.match(/(?:^|[\s"'`(])((?:[\w./\\:-]*?)docs[\\/]codecycle[\\/][^\s"'`)\\/]+)/)
  if (dir) out.aufgabeDir = dir[1]!.replace(/\\/g, '/').replace(/^.*?(docs\/codecycle\/)/, '$1')
  const report = pickReport(prompt, role)
  if (report) out.bericht = `reports/${report}.md`
  return out
}

/**
 * Absoluter Berichtspfad im Hauptordner: Agenten in einem Worktree sollen ihren Bericht nicht in den Worktree
 * schreiben. Regel wie in den Agenten-Anleitungen: `reports/<rolle>.md` im Aufgabenordner (alter Eintrag mit Paket:
 * `reports/<paket>-<rolle>.md`), ohne Aufgabe `.codecycle/tmp/reports/<rolle>.md`.
 * Nennt der Bauleiter einen Pfad (`bericht` aus `parseSpawnPrompt`), gilt dessen Dateiname.
 */
export function reportPath(o: { root: string; dir: string | null; paket: string | null; rolle: string; bericht?: string }): string {
  const root = o.root.replace(/\\/g, '/').replace(/\/+$/, '')
  const base = o.dir ? `${o.dir.replace(/\/+$/, '')}/reports` : '.codecycle/tmp/reports'
  const name = o.bericht ? o.bericht.replace(/^.*reports\//, '') : `${o.paket ? `${o.paket}-` : ''}${o.rolle}.md`
  return `${root}/${base}/${name}`
}

/** Anhang an die Startnachricht: durch eine Leerzeile getrennt, ohne führende Leerzeilen bei leerem Text */
export function appendNote(text: string, note: string): string {
  return `${text}${text === '' ? '' : '\n\n'}${note}`
}

/** Hinweis auf das Fortschrittswerkzeug (Schalter `agent-progress`; das Werkzeug ist aufgeschoben, erst per ToolSearch laden) */
export function progressNote(stepTool: string): string {
  return `Fortschritt: Melde nach jedem größeren Schritt einmal mit dem Werkzeug ${stepTool} (done, total, kurze note). Nicht öfter; es dient nur der Anzeige. Das Werkzeug ist für dich aufgeschoben: lade es vor der ersten Meldung einmal mit ToolSearch (Abfrage select:mcp__codecycle__${stepTool}).`
}

/** Pflicht zum Bericht als Datei (allgemeine Vorgaben der Umgebung raten von Berichts-Dateien ab) */
export function reportNote(bericht: string): string {
  return `Bericht: ${bericht} (absoluter Pfad im Hauptordner des Projekts; nicht in den Worktree schreiben). Den Bericht als Datei unter diesem Pfad zu schreiben ist Pflicht; eine allgemeine Vorgabe, keine Berichts-Dateien anzulegen, gilt hier nicht.`
}

/** Das Ergebnis von `prepare` aus den ermittelten Werten (optionale Felder nur, wenn belegt). */
export function spawnFrom(i: {
  role: string
  dir: string | null
  paket: string | null
  groesse: string
  model: string | undefined
  reason: string
  text: string
  explicitDir: boolean
  bericht: string | undefined
}): Spawn {
  return {
    role: i.role,
    dir: i.dir,
    paket: i.paket,
    groesse: i.groesse,
    ...(i.model ? { model: i.model } : {}),
    reason: i.reason,
    text: i.text,
    ...(i.explicitDir ? { explicitDir: true } : {}),
    ...(i.bericht ? { bericht: i.bericht } : {}),
  }
}

/** Die umgeschriebene Startanfrage: gewähltes Modell und der Anhang an die Startnachricht; ohne `prepare`-Ergebnis unverändert. */
export function rewriteSpawn<T extends { prompt: string }>(e: T, info: Pick<Spawn, 'model' | 'text'> | undefined): T {
  if (!info) return e
  return { ...e, ...(info.model ? { model: info.model } : {}), ...(info.text !== '' ? { prompt: `${e.prompt}\n\n${info.text}` } : {}) }
}
