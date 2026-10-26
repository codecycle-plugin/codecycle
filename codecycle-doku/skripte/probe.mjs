// Probe-Fassungen im privaten Ordner: Blöcke des Verfassers lesen, Pfade in probe/ und sicherung/, Änderungsliste.
// Nur Module node:*, läuft ab Node 18.
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import { PRIVAT } from './gemeinsam.mjs'

export const PROBE = `${PRIVAT}/probe`
export const SICHERUNG = `${PRIVAT}/sicherung`

/**
 * Liest die Ausgabe des Verfassers: je Datei ein Block `<<<DATEI pfad>>>` … `<<<ENDE>>>`, genau eine Änderungsliste
 * `<<<AENDERUNGEN>>>` … `<<<ENDE>>>`. Die erste Datei ist die Hauptdatei. Text außerhalb der Blöcke zählt nicht.
 * Ergebnis: { dateien: [{ pfad, inhalt }], aenderungen }; ein Fehler, wenn keine Datei oder nicht genau eine Liste da ist,
 * wenn eine Zeile außerhalb der Blöcke mit `<<<` beginnt und kein gültiger Kopf ist oder ein `<<<ENDE>>>` keinen Block schließt.
 */
export function leseBloecke(text) {
  const zeilen = text.replace(/\r\n/g, '\n').split('\n')
  const dateien = []
  const listen = []
  let offen = null
  for (const zeile of zeilen) {
    if (offen === null) {
      const d = /^<<<DATEI\s+(.+?)>>>\s*$/.exec(zeile)
      if (d) offen = { art: 'datei', pfad: d[1].trim(), zeilen: [] }
      else if (/^<<<AENDERUNGEN>>>\s*$/.test(zeile)) offen = { art: 'liste', zeilen: [] }
      // Ein verschriebener Kopf ginge sonst mit seinem Block still verloren
      else if (/^<<<ENDE>>>\s*$/.test(zeile)) throw new Error('<<<ENDE>>> ohne offenen Block')
      else if (zeile.startsWith('<<<')) throw new Error(`ungültiger Blockkopf „${zeile.trim()}“ (erwartet <<<DATEI pfad>>> oder <<<AENDERUNGEN>>>)`)
      continue
    }
    if (/^<<<ENDE>>>\s*$/.test(zeile)) {
      const inhalt = `${offen.zeilen.join('\n').replace(/\n+$/, '')}\n`
      if (offen.art === 'datei') dateien.push({ pfad: offen.pfad, inhalt })
      else listen.push(inhalt)
      offen = null
      continue
    }
    offen.zeilen.push(zeile)
  }
  if (offen !== null) throw new Error('Block ohne <<<ENDE>>>')
  if (dateien.length === 0) throw new Error('kein Block <<<DATEI pfad>>>')
  if (listen.length !== 1) throw new Error(`genau eine Änderungsliste <<<AENDERUNGEN>>> erwartet, gefunden: ${listen.length}`)
  const doppelt = dateien.find((d, i) => dateien.findIndex(x => x.pfad === d.pfad) !== i)
  if (doppelt) throw new Error(`Datei ${doppelt.pfad} doppelt`)
  return { dateien, aenderungen: listen[0] }
}

/** Pfad der Änderungsliste zu einer Probe: `<pfad ohne .md>.aenderungen.md` unter probe/. */
export const aenderungenPfad = pfad => `${PROBE}/${pfad.replace(/\.md$/i, '')}.aenderungen.md`

/** Text der Änderungsliste; mehrere Dateien stehen in einer Kopfzeile `zusammen:`. */
export function aenderungenText(pfade, liste) {
  const kopf = pfade.length > 1 ? `zusammen: ${pfade.join(', ')}\n\n` : ''
  return `${kopf}# Änderungen: ${pfade[0]}\n\n${liste}`
}

/** Dateien, die laut Änderungsliste zusammen übernommen werden müssen (leer, wenn es keine Kopfzeile gibt). */
export function zusammenAus(text) {
  const m = /^zusammen:\s*(.+)$/m.exec(text.split('\n', 1)[0] ?? '')
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : []
}

/** Änderungsliste aus zwei Fassungen, vom Skript erzeugt: Zeilen weg und hinzu. */
export function zeilenDiff(alt, neu) {
  const a = alt.replace(/\r\n/g, '\n').split('\n')
  const b = neu.replace(/\r\n/g, '\n').split('\n')
  const inA = new Set(a)
  const inB = new Set(b)
  const weg = a.filter(z => z.trim() !== '' && !inB.has(z))
  const hinzu = b.filter(z => z.trim() !== '' && !inA.has(z))
  const block = (z, zeichen) => z.map(x => `${zeichen} ${x}`)
  return ['Erzeugt aus `.claude/doku.json` und den Regeln des Plugins; die echte Datei weicht davon ab.', '', '```diff', ...block(weg, '-'), ...block(hinzu, '+'), '```', ''].join('\n')
}

/**
 * Ziel der Sicherung für `pfad`: `sicherung/<pfad>`; gibt es dort schon eine, mit Zeitstempel vor der Endung, damit die
 * erste nie überschrieben wird.
 */
export function sicherungsPfad(root, pfad, jetzt = new Date()) {
  const ziel = `${SICHERUNG}/${pfad}`
  if (!existsSync(join(root, ziel))) return ziel
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const ext = posix.extname(pfad)
  const basis = ext ? pfad.slice(0, -ext.length) : pfad
  let n = 0
  let kandidat = `${SICHERUNG}/${basis}.${stempel}${ext}`
  while (existsSync(join(root, kandidat))) kandidat = `${SICHERUNG}/${basis}.${stempel}-${++n}${ext}`
  return kandidat
}

/** Inhalt einer Datei im Projekt oder null. */
export function lesen(root, pfad) {
  try {
    return readFileSync(join(root, ...pfad.split('/')), 'utf8')
  } catch {
    return null
  }
}
