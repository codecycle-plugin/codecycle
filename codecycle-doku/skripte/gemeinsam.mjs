// Gemeinsame Teile von Prüfer und Übersicht: Regeln, Doku-Beschreibung des Projekts, Kopf eines Eintrags, Festhalten-Orte.
// Nur Module node:*, läuft ab Node 18.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HIER = dirname(fileURLToPath(import.meta.url))
export const REGELN_DATEI = join(HIER, 'regeln.json')
/** Doku-Beschreibung im Projekt, relativ zur Projektwurzel. */
export const DOKU_JSON = '.claude/doku.json'
/** Erzeugte Übersicht und Anleitung in jedem Festhalten-Ordner; beide sind keine Einträge. */
export const UEBERSICHT = 'README.md'
export const ANLEITUNG = 'CLAUDE.md'

/** Mitgelieferte Grundregeln. */
export function ladeRegeln(datei = REGELN_DATEI) {
  return JSON.parse(readFileSync(datei, 'utf8'))
}

/**
 * Doku-Beschreibung des Projekts oder null, wenn sie fehlt.
 * Felder: zuordnung [{ pfad, art }], festhalten { idee, bug, todo } (Ordner relativ zur Wurzel),
 * changelog { datei, schema, beschreibung }, uebersicht { mermaid }, ablage (teilen | lokal); dazu von der Einrichtung
 * bausteine (gewählte Bausteine) und orte (Pfade je Baustein, etwa chronik), siehe einrichten.mjs :: beschreibungAus.
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
 */
export function festhaltenOrt(datei, orte) {
  for (const { art, ordner } of orte) {
    if (posix.dirname(datei) !== ordner) continue
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
