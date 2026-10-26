// Was auf den Nutzer wartet, nur mit Dateizugriffen: für den Start-Hook (SessionStart) und den Stop-Hook. Lädt die
// Status-Seite (status.mjs) nur, wenn sie gebaut werden muss. Aufruf (Hooks, Exit immer 0):
//   node wartet.mjs --start   eine Zeile als additionalContext, wenn etwas wartet; sonst keine Ausgabe
//   node wartet.mjs --stop    baut die Status-Seite, wenn seit dem letzten Bau eine Markdown-Datei geschrieben wurde
// Ohne .claude/doku.json still; ist sie unlesbar, sagt der Start-Hook das in einer Zeile. Projekt: CLAUDE_PROJECT_DIR, sonst cwd aus der Hook-Eingabe.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DOKU_JSON, HIER, hatCode, KARTE, ladeBeschreibung, MARKE, PRIVAT, pluginVersion, vergleicheVersion } from './gemeinsam.mjs'

const UEBERFUEHREN = 'UEBERFUEHREN.md'

const da = (root, pfad) => existsSync(join(root, ...pfad.split('/')))
const lies = (root, pfad) => {
  try {
    return readFileSync(join(root, ...pfad.split('/')), 'utf8')
  } catch {
    return null
  }
}

/**
 * Orte aus .claude/doku.json, die es nicht gibt, und ein fehlender Verweis von CLAUDE.md auf die Karte.
 * [{ art: 'verweis', text, pfad }]. Eine fehlende Architektur-Doku im Projekt mit Code wartet auf ihre Erstfassung
 * (art 'erstfassung'); liegt ihre Probe schon bereit, meldet das proben().
 */
export function gebrocheneVerweise(root, b) {
  const aus = []
  const orte = new Map()
  for (const [name, pfad] of Object.entries(b.orte ?? {})) if (typeof pfad === 'string') orte.set(pfad, name)
  for (const [art, ordner] of Object.entries(b.festhalten ?? {})) if (typeof ordner === 'string') orte.set(ordner.replace(/\/$/, ''), `festhalten ${art}`)
  if (typeof b.changelog?.datei === 'string') orte.set(b.changelog.datei, 'changelog')
  for (const [pfad, name] of orte) {
    if (da(root, pfad)) continue
    if (name !== 'architektur' || !hatCode(root)) aus.push({ art: 'verweis', text: `${name}: ${pfad} fehlt`, pfad })
    else if (!da(root, `${PRIVAT}/probe/${pfad}`)) aus.push({ art: 'erstfassung', text: `Erstfassung ${pfad} fehlt: /codecycle-doku:probe architektur`, pfad })
  }
  const claude = typeof b.orte?.['claude-md'] === 'string' ? b.orte['claude-md'] : 'CLAUDE.md'
  if (da(root, KARTE)) {
    const text = lies(root, claude)
    if (text !== null && !text.includes(KARTE)) aus.push({ art: 'verweis', text: `${claude} verweist nicht auf die Karte ${KARTE}`, pfad: claude })
  } else aus.push({ art: 'verweis', text: `Karte ${KARTE} fehlt`, pfad: KARTE })
  return aus
}

/** Probe-Fassungen in .codecycle-doku/probe/: je Datei ihr Pfad im Projekt; ein überführter Ordner als ein Eintrag. */
export function proben(root) {
  const basis = join(root, PRIVAT, 'probe')
  const aus = []
  const gehe = rel => {
    let eintraege
    try {
      eintraege = readdirSync(join(basis, ...rel.split('/').filter(Boolean)), { withFileTypes: true })
    } catch {
      return
    }
    if (eintraege.some(e => e.isFile() && e.name === UEBERFUEHREN)) {
      aus.push({ art: 'probe', text: `Überführung ${rel}/ wartet auf Übernahme`, pfad: rel })
      return
    }
    for (const e of eintraege.sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) gehe(r)
      else if (e.isFile() && !e.name.endsWith('.aenderungen.md')) aus.push({ art: 'probe', text: `Probe ${r} wartet auf Übernahme`, pfad: r })
    }
  }
  gehe('')
  return aus
}

/**
 * Angebotene Version laut lokaler Kopie des Marketplace, ohne Netz; null, wenn das Plugin nicht aus einem Marketplace
 * installiert ist (etwa mit --plugin-dir) oder die Kopie fehlt. Gesucht wird über den eigenen Namen aus plugin.json.
 */
export function marketplaceVersion(pluginRoot = resolve(HIER, '..')) {
  try {
    const name = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).name
    const teile = resolve(pluginRoot).split(sep)
    // <plugins>/cache/<marketplace>/<plugin>/<version>
    const i = teile.length - 4
    if (i < 1 || teile[i] !== 'cache' || teile[i + 2] !== name) return null
    const plugins = teile.slice(0, i).join(sep)
    const ordner = join(plugins, 'marketplaces', teile[i + 1] ?? '')
    const markt = JSON.parse(readFileSync(join(ordner, '.claude-plugin', 'marketplace.json'), 'utf8'))
    const eintrag = (markt.plugins ?? []).find(p => p?.name === name)
    if (!eintrag) return null
    if (typeof eintrag.version === 'string') return eintrag.version
    if (typeof eintrag.source !== 'string') return null
    return JSON.parse(readFileSync(join(ordner, eintrag.source, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null
  } catch {
    return null
  }
}

/** Versionen: aktiv (laufendes Plugin), eingerichtet (.claude/doku.json), marketplace (lokale Kopie oder null). */
export function versionen(b) {
  return { aktiv: pluginVersion(), eingerichtet: typeof b.version === 'string' ? b.version : null, marketplace: marketplaceVersion() }
}

/** Punkte zur Version: Einrichtung älter als das Plugin, Marketplace bietet eine neuere an. */
export function versionsPunkte(v) {
  const aus = []
  if (v.eingerichtet === null || vergleicheVersion(v.aktiv, v.eingerichtet) > 0)
    aus.push({ art: 'update', text: `Einrichtung auf Stand ${v.eingerichtet ?? 'unbekannt'}, Plugin ${v.aktiv}: /codecycle-doku:einrichten zeigt die neuen Plugin-Dateien als Probe` })
  if (v.marketplace !== null && vergleicheVersion(v.marketplace, v.aktiv) > 0)
    aus.push({ art: 'update', text: `Marketplace bietet ${v.marketplace} an (laut lokaler Kopie), aktiv ist ${v.aktiv}` })
  return aus
}

/**
 * Alles, was ohne Bau der Seite feststellbar ist, dazu die übrigen Punkte aus status.json, falls vorhanden. null ohne
 * .claude/doku.json; ist sie kein JSON-Objekt, ein Fehler mit dem Grund.
 */
export function wartendePunkte(root) {
  const b = ladeBeschreibung(root)
  if (b === null && !da(root, DOKU_JSON)) return null
  if (b === null || typeof b !== 'object' || Array.isArray(b)) throw new Error(`${DOKU_JSON} ist kein JSON-Objekt`)
  const punkte = [...gebrocheneVerweise(root, b), ...proben(root), ...versionsPunkte(versionen(b))]
  const status = lies(root, `${PRIVAT}/status.json`)
  if (status !== null) {
    try {
      for (const p of JSON.parse(status).d ?? []) if (['tot', 'codemap', 'wegweiser'].includes(p.art)) punkte.push(p)
    } catch {
      // kaputte status.json: nur die eigenen Prüfungen
    }
  }
  return punkte
}

const KURZ = { verweis: 'gebrochener Verweis', erstfassung: 'Erstfassung', probe: 'Probe', update: 'Update', tot: 'toter Link', codemap: 'Codemap', wegweiser: 'Wegweiser' }

/** Die eine Zeile des Start-Hooks oder null, wenn nichts wartet; eine unlesbare .claude/doku.json ist auch eine Zeile. */
export function startZeile(root) {
  let punkte
  try {
    punkte = wartendePunkte(root)
  } catch (e) {
    const grund = String(e instanceof Error ? e.message : e).replace(/\s+/g, ' ').trim()
    return `codecycle-doku: ${grund}; Prüfer, Hook und Status-Seite brauchen eine gültige ${DOKU_JSON}.`
  }
  if (punkte === null || punkte.length === 0) return null
  const arten = [...new Set(punkte.map(p => KURZ[p.art] ?? p.art))]
  return `codecycle-doku: ${punkte.length} ${punkte.length === 1 ? 'Punkt wartet' : 'Punkte warten'} (${arten.join(', ')}); Details in ${PRIVAT}/status.html (neu erzeugen: codecycle-doku-pruefer --status).`
}

function projekt() {
  let eingabe = {}
  try {
    eingabe = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    // ohne Eingabe: Arbeitsordner
  }
  return process.env.CLAUDE_PROJECT_DIR || eingabe?.cwd || process.cwd()
}

async function main(argv) {
  try {
    const root = projekt()
    if (argv.includes('--start')) {
      const zeile = startZeile(root)
      if (zeile) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: zeile } }))
    } else if (argv.includes('--stop')) {
      const marke = join(root, PRIVAT, MARKE)
      if (!existsSync(marke) || ladeBeschreibung(root) === null) return 0
      rmSync(marke, { force: true })
      const { baueStatus } = await import('./status.mjs')
      baueStatus(root)
    }
  } catch {
    // Hooks blockieren nie und reden nur, wenn etwas wartet
  }
  return 0
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main(process.argv.slice(2)).then(code => { process.exitCode = code })
