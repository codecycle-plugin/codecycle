// Übersicht je Festhalten-Ordner: erzeugt dessen README.md aus den Köpfen der Einträge.
// Aufruf in der Projektwurzel:
//   node uebersicht.mjs [--root <ordner>]   schreibt die Übersicht jedes Festhalten-Ordners aus .claude/doku.json
//   --check                                 schreibt nichts; Exit 1, wenn eine Übersicht von den Einträgen abweicht
// Reihenfolge: offen vor erledigt, wichtig vor normal, neueste zuerst; darunter Gruppen verknüpfter Einträge (Feld bezug),
// als Mermaid-Diagramm nur mit `uebersicht.mermaid: true` in .claude/doku.json. Einträge mit fehlerhaftem Kopf erscheinen
// trotzdem (ohne gültigen Status unter „offen“); die Fehler meldet der Prüfer.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { UEBERSICHT, festhaltenOrte, ladeBeschreibung, ladeRegeln, leseEintraege, schemaVon, sichererPfad, statusKlasse } from './gemeinsam.mjs'

/** Erkennungszeichen einer erzeugten Übersicht; eine README.md ohne es ist eine eigene Übersicht und bleibt unberührt. */
export const ERZEUGT = 'Erzeugt aus den Köpfen der Einträge'

const zelle = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const liste = w => (Array.isArray(w) ? w : w ? [w] : [])

/** Link von `vonOrdner` auf einen Eintrag. */
const linkAuf = (vonOrdner, e) => `[${zelle(e.kopf.titel || e.name)}](${posix.relative(vonOrdner, e.datei)})`

/** Gruppen verknüpfter Einträge (bezug in beide Richtungen), nur Gruppen ab zwei Einträgen. */
export function gruppen(eintraege) {
  const nachName = new Map(eintraege.map(e => [e.name, e]))
  const eltern = new Map(eintraege.map(e => [e.name, e.name]))
  const wurzel = n => {
    while (eltern.get(n) !== n) n = eltern.get(n)
    return n
  }
  for (const e of eintraege) {
    for (const b of liste(e.kopf.bezug)) if (nachName.has(b)) eltern.set(wurzel(b), wurzel(e.name))
  }
  const nachWurzel = new Map()
  for (const e of eintraege) {
    const w = wurzel(e.name)
    nachWurzel.set(w, [...(nachWurzel.get(w) ?? []), e])
  }
  return [...nachWurzel.values()].filter(g => g.length > 1)
}

/** Darstellung von erledigt-durch in der Tabelle. */
function durchZelle(ordner, e) {
  const durch = String(e.kopf['erledigt-durch'] ?? '')
  if (durch === '' || durch === 'text') return durch === 'text' ? 'im Eintrag' : ''
  if (/^\[.*\]\(.*\)$/.test(durch)) {
    // Link relativ zum Eintrag; Übersicht und Eintrag liegen im selben Ordner.
    return zelle(durch)
  }
  if (/^[0-9a-f]{7,40}$/i.test(durch)) return `\`${durch.slice(0, 12)}\``
  return `[${zelle(durch)}](${durch})`
}

const neuesteZuerst = (a, b) => String(b.kopf.datum ?? '').localeCompare(String(a.kopf.datum ?? '')) || a.name.localeCompare(b.name)

/**
 * Text der Übersicht für die Art `art`.
 * @param {string} art
 * @param {{ ordner: string }} ort
 * @param {any[]} alle Einträge aller Festhalten-Orte (für Verknüpfungen über Ordner hinweg)
 * @param {any} regeln
 * @param {{ mermaid?: boolean, schema?: any }} [optionen] schema: Schema der Sammlung (Statuswerte über die Abbildung)
 */
export function renderUebersicht(art, ort, alle, regeln, optionen = {}) {
  const titel = regeln.festhalten.arten[art].titel
  const eigene = alle.filter(e => e.ordner === ort.ordner)
  const istErledigt = e => statusKlasse(e.kopf.status, optionen.schema ?? null, regeln) === 'erledigt'
  const erledigt = eigene.filter(istErledigt).sort(neuesteZuerst)
  const offen = eigene
    .filter(e => !istErledigt(e))
    .sort((a, b) => Number(b.kopf.wichtigkeit === 'wichtig') - Number(a.kopf.wichtigkeit === 'wichtig') || neuesteZuerst(a, b))
  const verknuepft = gruppen(alle).filter(g => g.some(e => e.ordner === ort.ordner))

  const abschnitte = []
  if (offen.length) {
    abschnitte.push(['Offen', ['| Wichtigkeit | Datum | Titel | Bezug |', '|---|---|---|---|',
      ...offen.map(e => `| ${zelle(e.kopf.wichtigkeit === 'wichtig' ? '**wichtig**' : e.kopf.wichtigkeit)} | ${zelle(e.kopf.datum)} | ${linkAuf(ort.ordner, e)} | ${bezugZelle(ort.ordner, e, alle)} |`)]])
  }
  if (erledigt.length) {
    abschnitte.push(['Erledigt', ['| Datum | Titel | Ergebnis | Erledigt durch |', '|---|---|---|---|',
      ...erledigt.map(e => `| ${zelle(e.kopf.datum)} | ${linkAuf(ort.ordner, e)} | ${zelle(e.kopf.ergebnis)} | ${durchZelle(ort.ordner, e)} |`)]])
  }
  if (verknuepft.length) {
    const zeilen = verknuepft.map(g => `- ${g.map(e => linkAuf(ort.ordner, e)).join(' · ')}`)
    if (optionen.mermaid) zeilen.push('', ...mermaid(verknuepft))
    abschnitte.push(['Verknüpft', zeilen])
  }

  const teile = [
    `# ${titel}`,
    '',
    `${ERZEUGT}, nicht von Hand ändern.`,
    `Vor einem neuen Eintrag diese Datei lesen. Gerüst und Felder: [CLAUDE.md](CLAUDE.md).`,
  ]
  if (abschnitte.length === 0) teile.push('', 'Keine Einträge.')
  else teile.push('', `**Inhalt:** ${abschnitte.map(([h]) => `[${h}](#${h.toLowerCase()})`).join(' · ')}`)
  for (const [h, zeilen] of abschnitte) teile.push('', `## ${h}`, '', ...zeilen)
  return teile.join('\n') + '\n'
}

function bezugZelle(ordner, e, alle) {
  const nachName = new Map(alle.map(x => [x.name, x]))
  return liste(e.kopf.bezug).map(b => (nachName.has(b) ? linkAuf(ordner, nachName.get(b)) : zelle(b))).join(', ')
}

/** Mermaid-Diagramm der verknüpften Gruppen. */
function mermaid(verknuepft) {
  const id = n => `n_${n.replace(/[^\w]/g, '_')}`
  const zeilen = ['```mermaid', 'graph LR']
  const kanten = new Set()
  for (const g of verknuepft) {
    const namen = new Set(g.map(e => e.name))
    for (const e of g) {
      zeilen.push(`  ${id(e.name)}["${String(e.kopf.titel || e.name).replace(/"/g, "'")}"]`)
      for (const b of liste(e.kopf.bezug)) if (namen.has(b)) kanten.add(`  ${id(e.name)} --- ${id(b)}`)
    }
  }
  return [...zeilen, ...kanten, '```']
}

/** Liegt im Ordner eine eigene Übersicht (README.md ohne Erkennungszeichen)? */
export function eigeneUebersicht(root, ordner) {
  try {
    return !readFileSync(join(root, ordner, UEBERSICHT), 'utf8').includes(ERZEUGT)
  } catch {
    return false
  }
}

/**
 * Schreibt die Übersicht der Art `art` und gibt ihren Pfad (relativ zur Wurzel) zurück, oder null ohne Festhalten-Ort
 * oder mit `schemata.<art>.uebersicht: eigen`.
 * Geschrieben wird nur, wenn die Datei fehlt oder das Erkennungszeichen trägt; eine eigene Übersicht bleibt byte-gleich.
 * Liegt das Ziel über einen Symlink außerhalb des Projekts oder ist es selbst ein Symlink, wird nichts geschrieben (Fehler).
 * @param {{ regeln: any, beschreibung: any, orte?: any[] }} ctx
 */
export function schreibeUebersicht(root, art, ctx) {
  const orte = ctx.orte ?? festhaltenOrte(ctx.beschreibung, ctx.regeln)
  const ort = orte.find(o => o.art === art)
  if (!ort) return null
  if (schemaVon(ctx.beschreibung, art)?.uebersicht === 'eigen') return null
  const text = renderUebersicht(art, ort, leseEintraege(root, orte), ctx.regeln, { mermaid: Boolean(ctx.beschreibung?.uebersicht?.mermaid), schema: schemaVon(ctx.beschreibung, art) })
  const ziel = sichererPfad(root, `${ort.ordner}/${UEBERSICHT}`)
  if (ziel === null) throw new Error(`${ort.ordner}/${UEBERSICHT} liegt außerhalb des Projekts oder ist ein Symlink; nicht geschrieben`)
  mkdirSync(dirname(ziel), { recursive: true })
  let alt = null
  try {
    alt = readFileSync(ziel, 'utf8')
  } catch {
    // fehlt
  }
  if (alt !== null && !alt.includes(ERZEUGT)) return `${ort.ordner}/${UEBERSICHT}`
  if (alt !== text) writeFileSync(ziel, text)
  return `${ort.ordner}/${UEBERSICHT}`
}

function main(argv) {
  const rootIdx = argv.indexOf('--root')
  const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd())
  const regeln = ladeRegeln()
  const beschreibung = ladeBeschreibung(root)
  if (beschreibung === null) {
    console.error('uebersicht: .claude/doku.json fehlt; erst einrichten')
    return 1
  }
  const orte = festhaltenOrte(beschreibung, regeln)
  const alle = leseEintraege(root, orte)
  let abweichend = 0
  for (const ort of orte) {
    if (schemaVon(beschreibung, ort.art)?.uebersicht === 'eigen') {
      console.log(`${ort.ordner}/${UEBERSICHT}: eigene Übersicht laut .claude/doku.json, übersprungen`)
      continue
    }
    const text = renderUebersicht(ort.art, ort, alle, regeln, { mermaid: Boolean(beschreibung.uebersicht?.mermaid), schema: schemaVon(beschreibung, ort.art) })
    const ziel = join(root, ort.ordner, UEBERSICHT)
    const alt = existsSync(ziel) ? readFileSync(ziel, 'utf8') : null
    if (alt !== null && !alt.includes(ERZEUGT)) {
      console.log(`${ort.ordner}/${UEBERSICHT}: eigene Übersicht, übersprungen`)
      continue
    }
    if (argv.includes('--check')) {
      if (alt !== text) {
        console.error(`${ort.ordner}/${UEBERSICHT}: weicht von den Einträgen ab; erneuern mit node uebersicht.mjs`)
        abweichend++
      }
    } else {
      schreibeUebersicht(root, ort.art, { regeln, beschreibung, orte })
      console.log(`${ort.ordner}/${UEBERSICHT} geschrieben (${alle.filter(e => e.ordner === ort.ordner).length} Einträge)`)
    }
  }
  return abweichend > 0 ? 1 : 0
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
