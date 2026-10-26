// Gemeinsame Teile von Prüfer und Übersicht: Regeln, Doku-Beschreibung des Projekts, Kopf eines Eintrags, Festhalten-Orte.
// Nur Module node:*, läuft ab Node 18.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HIER = dirname(fileURLToPath(import.meta.url))
export const REGELN_DATEI = join(HIER, 'regeln.json')
/** Doku-Beschreibung im Projekt, relativ zur Projektwurzel. */
export const DOKU_JSON = '.claude/doku.json'
/** Erzeugte Übersicht und Anleitung in jedem Festhalten-Ordner; beide sind keine Einträge. */
export const UEBERSICHT = 'README.md'
export const ANLEITUNG = 'CLAUDE.md'
/** Karte „was wohin“ und Regeldatei mit Arten und Schreibregeln, beide erzeugt. */
export const KARTE = '.claude/rules/codecycle-doku.md'
export const SCHREIBREGELN = '.claude/rules/codecycle-doku-schreiben.md'

/** Mitgelieferte Grundregeln. */
export function ladeRegeln(datei = REGELN_DATEI) {
  return JSON.parse(readFileSync(datei, 'utf8'))
}

/** Privater Ordner im Projekt: nur Erzeugtes und Vorläufiges, nie committet; nichts Versioniertes verweist darauf. */
export const PRIVAT = '.codecycle-doku'
/** Marke im privaten Ordner: seit dem letzten Bau der Status-Seite wurde Markdown geschrieben (PostToolUse setzt, Stop löscht). */
export const MARKE = '.geaendert'

/** Ordner, die nie Code des Projekts sind: Abhängigkeiten und Build-Ausgaben (dazu alle versteckten Ordner). */
export const KEIN_CODE = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', 'out', 'coverage', '__pycache__'])
/** Manifeste, an denen ein Projekt mit Code erkannt wird. */
const MANIFESTE = ['package.json', 'pyproject.toml', 'setup.py', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'deno.json', 'mix.exs']
/** Endungen von Quelldateien gängiger Sprachen. */
const QUELLEN = /\.(?:[cm]?js|jsx|tsx?|py|go|rs|java|kt|kts|cs|fs|rb|php|c|h|cc|cpp|hpp|swift|scala|ex|exs|dart|lua|clj|vue|svelte)$/i

/** Ordner oberster Ebene, die zum Projekt gehören: ohne versteckte, Abhängigkeiten und Build-Ausgaben. */
export function projektOrdner(root) {
  try {
    return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && !KEIN_CODE.has(e.name)).map(e => e.name).sort()
  } catch {
    return []
  }
}

/** Hat das Projekt Code? Ein Manifest in der Wurzel (auch `*.csproj`, `*.sln`) oder Quelldateien in den obersten zwei Ebenen. */
export function hatCode(root) {
  let namen
  try {
    namen = readdirSync(root, { withFileTypes: true })
  } catch {
    return false
  }
  const datei = e => e.isFile() && (MANIFESTE.includes(e.name) || /\.(?:csproj|sln)$/i.test(e.name) || QUELLEN.test(e.name))
  if (namen.some(datei)) return true
  for (const ordner of projektOrdner(root)) {
    try {
      if (readdirSync(join(root, ordner), { withFileTypes: true }).some(e => e.isFile() && QUELLEN.test(e.name))) return true
    } catch {
      // unlesbar: kein Code
    }
  }
  return false
}

/**
 * Doku-Beschreibung des Projekts oder null, wenn sie fehlt.
 * Felder: zuordnung [{ pfad, art }], festhalten { idee, bug, todo } (Ordner relativ zur Wurzel),
 * changelog { datei, schema, beschreibung }, uebersicht { mermaid }, ablage (teilen | lokal); dazu von der Einrichtung
 * bausteine (gewählte Bausteine) und orte (Pfade je Baustein, etwa chronik), siehe einrichten.mjs :: beschreibungAus.
 * Anpassungen des Projekts, die jede Einrichtung unverändert übernimmt:
 *   version    Version des Plugins, auf deren Stand die erzeugten Plugin-Dateien sind (fehlt: älter als das Plugin)
 *   pruefung   { aus: [Regel], hinweis: [Regel] }: abgeschaltete Regeln melden nichts, abgeschwächte nur als Hinweis;
 *              Regeln wie in regeln.json, dazu links, inhaltsverzeichnis, felder, abschnitte, wegweiser, codemap, art
 *   schemata   { <art>: Schema einer angedockten Sammlung }, siehe schemaVon
 * Eine unlesbare Datei wirft einen Fehler mit dem Grund.
 */
export function ladeBeschreibung(root) {
  const pfad = join(root, DOKU_JSON)
  if (!existsSync(pfad)) return null
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'))
  } catch (e) {
    throw new Error(`${DOKU_JSON} ist kein gültiges JSON: ${e instanceof Error ? e.message : e}`)
  }
}

/** Version dieses Plugins aus seiner plugin.json. */
export function pluginVersion() {
  return JSON.parse(readFileSync(join(HIER, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version
}

/** Vergleicht zwei Versionen `a.b.c`: negativ, wenn a älter ist. */
export function vergleicheVersion(a, b) {
  const teile = v => String(v).split(/[.-]/).slice(0, 3).map(t => Number.parseInt(t, 10) || 0)
  const [x, y] = [teile(a), teile(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/**
 * Privater Ordner zum Schreiben: nur mit .claude/doku.json, sonst null (dann wird nichts angelegt). Legt im Ordner zuerst
 * eine eigene .gitignore mit `*` an, damit er auch ohne Eintrag in der Wurzel-.gitignore nicht versioniert wird.
 */
export function privatOrdner(root) {
  if (!existsSync(join(root, DOKU_JSON))) return null
  const ordner = sichererPfad(root, PRIVAT)
  if (ordner === null) throw new Error(`${PRIVAT} liegt außerhalb des Projekts oder ist ein Symlink; nicht geschrieben`)
  mkdirSync(ordner, { recursive: true })
  const ignore = join(ordner, '.gitignore')
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
  return ordner
}

/**
 * Ziel `rel` im privaten Ordner, nur wenn es nach Auflösen aller Symlinks darin bleibt und kein Symlink ist; sonst ein
 * Fehler. So schreibt oder löscht das Plugin über einen Link im privaten Ordner nie Dateien des Projekts.
 */
export function privatPfad(root, rel) {
  const ordner = privatOrdner(root)
  if (ordner === null) return null
  const basis = realpathSync(ordner)
  const ziel = resolve(basis, rel)
  const fehler = new Error(`${PRIVAT}/${rel} liegt nicht im privaten Ordner oder ist ein Symlink; nichts geschrieben`)
  const r0 = relative(basis, ziel)
  if (r0 === '' || r0.startsWith('..') || isAbsolute(r0)) throw fehler
  let vorhanden = ziel
  for (;;) {
    let st = null
    try {
      st = lstatSync(vorhanden)
    } catch {
      // fehlt: weiter nach oben
    }
    if (st?.isSymbolicLink()) throw fehler
    if (st) break
    vorhanden = dirname(vorhanden)
  }
  const r = relative(basis, realpathSync(vorhanden))
  if (r.startsWith('..') || isAbsolute(r)) throw fehler
  return ziel
}

/** Schreibt eine Datei im privaten Ordner (Pfad relativ zu ihm); null ohne .claude/doku.json. */
export function schreibePrivat(root, rel, inhalt) {
  const ziel = privatPfad(root, rel)
  if (ziel === null) return null
  mkdirSync(dirname(ziel), { recursive: true })
  writeFileSync(ziel, inhalt)
  return ziel
}

/**
 * Schema einer angedockten Sammlung aus `schemata.<art>` oder null (dann gilt das Plugin-Schema). Form:
 *   pflicht     Felder, die da sein müssen; ersetzt die Pflichtfelder des Plugins ganz
 *   status      { <eigener Wert>: 'offen' | 'erledigt' }
 *   abschluss   { <Ergebnis des Plugins>: { <Feld>: <Wert> } }: was ein Abschluss in den Kopf schreibt
 *   abschnitte  Abschnitte eines Eintrags, leer erlaubt
 *   uebersicht  'plugin' (erzeugte Übersicht) oder 'eigen' (die Übersicht des Projekts bleibt unberührt)
 */
export function schemaVon(beschreibung, art) {
  const s = beschreibung?.schemata?.[art]
  return s && typeof s === 'object' && !Array.isArray(s) ? s : null
}

/**
 * Pfad der Anleitung eines Festhalten-Orts: bei einer angedockten Sammlung (`schemata.<art>`) die Regeldatei
 * `.claude/rules/codecycle-doku-<art>.md`, damit der fremde Ordner unberührt bleibt; sonst `<ordner>/CLAUDE.md`.
 */
export function anleitungPfad(beschreibung, art, ordner) {
  return schemaVon(beschreibung, art) ? `.claude/rules/codecycle-doku-${art}.md` : `${ordner}/${ANLEITUNG}`
}

/** Klasse eines Statuswerts (`offen` oder `erledigt`) nach dem Schema der Sammlung; null, wenn der Wert unbekannt ist. */
export function statusKlasse(status, schema, regeln) {
  if (schema?.status && typeof schema.status === 'object') return Object.hasOwn(schema.status, status) ? schema.status[status] : null
  return regeln.festhalten.status.includes(status) ? status : null
}

/** Glob nach RegExp: `**` beliebig tief, `*` und `?` ohne `/`. */
export function globZuRegex(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export const passt = (glob, datei) => globZuRegex(glob).test(datei)

/** Ordner ohne `./` und ohne Schrägstrich am Ende. */
const ordnerName = o => posix.normalize(String(o).replace(/\\/g, '/')).replace(/^\.\//, '').replace(/\/$/, '')

/** Ordner liegt innerhalb der Wurzel: relativ, ohne `..` nach dem Normalisieren. */
export const innerhalb = ordner => ordner !== '' && ordner !== '.' && !posix.isAbsolute(ordner) && !/^[a-z]:/i.test(ordner) && ordner !== '..' && !ordner.startsWith('../')

/**
 * Pfadteil, den das Dateisystem als `.git` liest: ohne Rücksicht auf Groß- und Kleinschreibung und ohne Punkte und
 * Leerzeichen am Ende (Windows entfernt sie).
 */
export const gitTeil = teil => teil.replace(/[. ]+$/, '').toLowerCase() === '.git'

/**
 * Festhalten-Orte aus der Beschreibung: [{ art, ordner }], nur Arten, die die Regeln kennen, und nur Ordner im Projekt,
 * nie im Git-Ordner (dort schreiben weder Hook noch Übersicht).
 */
export function festhaltenOrte(beschreibung, regeln) {
  const orte = []
  for (const [art, ordner] of Object.entries(beschreibung?.festhalten ?? {})) {
    if (!regeln.festhalten.arten[art] || typeof ordner !== 'string') continue
    const name = ordnerName(ordner)
    if (innerhalb(name) && !name.split('/').some(gitTeil)) orte.push({ art, ordner: name })
  }
  return orte
}

/**
 * Pfad `rel` unter `root`, nur wenn er nach Auflösen aller Symlinks in der Wurzel bleibt und kein Symlink ist; sonst null.
 * Der Pfad muss nicht existieren; geprüft wird der nächste vorhandene Ordner darüber.
 */
export function sichererPfad(root, rel) {
  const wurzel = realpathSync(root)
  const ziel = resolve(wurzel, rel)
  // lstat folgt Symlinks nicht: auch ein Symlink ins Leere zählt als vorhanden und wird abgelehnt.
  const eintrag = p => {
    try {
      return lstatSync(p)
    } catch {
      return null
    }
  }
  if (eintrag(ziel)?.isSymbolicLink()) return null
  let vorhanden = ziel
  while (eintrag(vorhanden) === null) vorhanden = dirname(vorhanden)
  let echt
  try {
    echt = realpathSync(vorhanden)
  } catch {
    return null // Symlink ins Leere auf dem Weg
  }
  const r = relative(wurzel, echt)
  if (!(r === '' || (!r.startsWith('..') && !isAbsolute(r)))) return null
  return imGitOrdner(root, rel) ? null : ziel
}

/** Liegt das echte Ziel (nächster vorhandener Ordner, alle Links und Kurznamen aufgelöst) im echten Git-Ordner? */
export function imGitOrdner(root, p) {
  const git = join(root, '.git')
  if (!existsSync(git)) return false
  const gitEcht = realpathSync.native(git)
  let vorhanden = resolve(root, p)
  while (!existsSync(vorhanden)) vorhanden = dirname(vorhanden)
  const r = relative(gitEcht, realpathSync.native(vorhanden))
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/**
 * Ort einer Datei unter den Festhalten-Orten: { art, ordner, name, rolle } oder null.
 * rolle: 'eintrag' (Markdown direkt im Ordner), 'uebersicht' (README.md), 'anleitung' (CLAUDE.md).
 * Unter Windows (`plattform` win32) zählt der Ordner ohne Rücksicht auf Groß- und Kleinschreibung, wie das Dateisystem
 * dort; sonst nur exakt. `ordner` im Ergebnis steht in der Schreibweise der Beschreibung.
 * @param {string} datei
 * @param {{ art: string, ordner: string }[]} orte
 * @param {string} [plattform] Standard: process.platform
 */
export function festhaltenOrt(datei, orte, plattform = process.platform) {
  /** @type {(a: string, b: string) => boolean} */
  const gleich = plattform === 'win32' ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b
  for (const { art, ordner } of orte) {
    if (!gleich(posix.dirname(datei), ordner)) continue
    const name = posix.basename(datei)
    if (!name.endsWith('.md')) return null
    const rolle = name === UEBERSICHT ? 'uebersicht' : name === ANLEITUNG ? 'anleitung' : 'eintrag'
    return { art, ordner, name: name.slice(0, -3), rolle }
  }
  return null
}

/**
 * Kopf eines Eintrags (YAML-Frontmatter zwischen zwei Zeilen `---`) oder null.
 * Werte: Text (auch in Anführungszeichen), leer, Liste in eckigen Klammern oder Blockliste (eingerückte Zeilen `- x`). `ende` ist die Zeile des schließenden `---`.
 * @returns {{ kopf: Record<string, any>, ende: number } | null}
 */
export function parseKopf(text) {
  const zeilen = text.replace(/\r\n/g, '\n').split('\n')
  if (zeilen[0] !== '---') return null
  const ende = zeilen.indexOf('---', 1)
  if (ende < 0) return null
  const kopf = {}
  const kopfZeilen = zeilen.slice(1, ende)
  for (const [i, zeile] of kopfZeilen.entries()) {
    const m = /^([a-z][a-z-]*):\s*(.*)$/.exec(zeile)
    if (!m) continue
    const wert = m[2].trim()
    // Blockliste: leerer Wert, darunter eingerückte Zeilen `- x`
    const block = []
    if (wert === '') {
      for (const folge of kopfZeilen.slice(i + 1)) {
        const b = /^\s+-\s*(.*)$/.exec(folge)
        if (!b) break
        const w = b[1].trim().replace(/^["']|["']$/g, '')
        if (w) block.push(w)
      }
    }
    if (block.length) {
      kopf[m[1]] = block
    } else if (wert.startsWith('[') && wert.endsWith(']')) {
      kopf[m[1]] = wert.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    } else if (wert.length >= 2 && /^".*"$|^'.*'$/.test(wert)) {
      kopf[m[1]] = wert.slice(1, -1)
    } else {
      kopf[m[1]] = wert
    }
  }
  return { kopf, ende: ende + 1 }
}

/** Alle Einträge der Festhalten-Orte: [{ art, ordner, name, datei, kopf, text }]; Dateien ohne Kopf mit kopf = {}. */
export function leseEintraege(root, orte) {
  const aus = []
  for (const { art, ordner } of orte) {
    const voll = join(root, ordner)
    if (!existsSync(voll) || !statSync(voll).isDirectory()) continue
    for (const name of readdirSync(voll).sort()) {
      if (!name.endsWith('.md') || name === UEBERSICHT || name === ANLEITUNG) continue
      const text = readFileSync(join(voll, name), 'utf8')
      aus.push({ art, ordner, name: name.slice(0, -3), datei: `${ordner}/${name}`, kopf: parseKopf(text)?.kopf ?? {}, text })
    }
  }
  return aus
}
