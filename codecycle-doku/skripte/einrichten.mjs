// Einrichtung der Doku eines Projekts: führt nur die Schritte aus, denen der Nutzer zugestimmt hat. Das Modell fragt,
// dieses Skript schreibt. Aufruf:
//   node einrichten.mjs --root <projekt> --stand                      JSON: eingerichtet, leer, Repo, Changelog, Schritte mit Zustand
//   node einrichten.mjs --root <projekt> --antworten <datei|-> [--dry-run]
//   node einrichten.mjs --root <projekt> --nachtragen <art> [--dry-run]   fehlenden Festhalten-Ort ohne Fragen anlegen (planeNachtrag);
//                                                                         Exit 3 ohne .claude/doku.json, dann nichts geschrieben
//   node einrichten.mjs --root <projekt> --probe                     Blöcke des Verfassers (stdin) als Probe nach .codecycle-doku/probe/;
//                                                                         Exit 3 ohne .claude/doku.json, Exit 1 ohne Änderungsliste
//   node einrichten.mjs --root <projekt> --erkundung <datei|->        Bericht des Erkunders nach .codecycle-doku/erkundung.md;
//                                                                         Exit 3 ohne .claude/doku.json, dann nichts geschrieben
// Die Antworten (JSON, `-` liest stdin) beschreibt `plane`. Eine leere Liste `schritte` schreibt nichts, auch nicht
// .claude/doku.json. Eine vorhandene Datei wird nur ersetzt, wenn ihr Schritt `ueberarbeiten:<pfad>` zugestimmt ist; ausgenommen
// sind .claude/doku.json und die erzeugte Übersicht. Veraltete Plugin-Dateien (Karte, Schreibregeln, Anleitungen) kommen als
// Probe nach .codecycle-doku/probe/, übernommen mit `uebernehmen:<pfad>` samt Sicherung, verworfen mit `verwerfen:<pfad>`. Erst wird alles geplant und geprüft,
// dann geschrieben; ein Fehler im Plan schreibt nichts. Geschrieben wird nie außerhalb des Projekts.
import { spawnSync } from 'node:child_process'
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ANLEITUNG, anleitungPfad, DOKU_JSON, HIER, KARTE, PRIVAT, SCHREIBREGELN, UEBERSICHT, festhaltenOrte, gitTeil, imGitOrdner, innerhalb, ladeBeschreibung, ladeRegeln, leseEintraege, hatCode, parseKopf, pluginVersion, privatPfad, schemaVon, schreibePrivat, sichererPfad, statusKlasse } from './gemeinsam.mjs'
import { markdownDateien } from './pruefer.mjs'
import { aenderungenPfad, aenderungenText, leseBloecke, PROBE, sicherungsPfad, zeilenDiff, zusammenAus } from './probe.mjs'
import { baueStatus } from './status.mjs'
import { ERZEUGT, renderUebersicht, schreibeUebersicht } from './uebersicht.mjs'

const VORLAGEN = join(HIER, '..', 'vorlagen')
export { KARTE, SCHREIBREGELN } from './gemeinsam.mjs'
/** Kopfkommentar der erzeugten Plugin-Dateien (Karte, Schreibregeln, Anleitung je Festhalten-Ordner). */
export const KOPF_ERZEUGT = `<!-- Erzeugt aus ${DOKU_JSON}; nicht von Hand ändern, Anpassungen dort. -->`

/** Bausteine mit Grundausstattung (grund) und einer Zeile Erklärung; Prüfer und Hook laufen, sobald .claude/doku.json da ist. */
export const BAUSTEINE = {
  readme: { grund: true, erklaerung: 'Einstieg für Menschen: was, Installation, Benutzung.' },
  'claude-md': { grund: true, erklaerung: 'Regeln, die jede Sitzung braucht, mit Verweis auf die Karte der Doku.' },
  changelog: { grund: true, erklaerung: 'Änderungen je Version; ein vorhandenes Schema wird erkannt und beschrieben.' },
  schreibregeln: { grund: true, erklaerung: 'Regeldatei mit Arten und Schreibregeln; lädt nur beim Arbeiten an Markdown.' },
  festhalten: { grund: true, erklaerung: 'Feste Orte für Ideen, Bugs und To-dos mit Gerüst, Feldern und erzeugter Übersicht.' },
  chronik: { grund: true, erklaerung: 'Was geschah: je Eintrag Datum, was, ein Halbsatz Warum, Verweis.' },
  entscheidungen: { grund: true, erklaerung: 'Entscheidungen mit allen Alternativen und der Antwort im Wortlaut.' },
  architektur: { grund: true, nurMitCode: true, erklaerung: 'Aufbau des Codes in ARCHITECTURE.md: Überblick, Einstiegspunkte, Codemap, Grenzen; nur für Projekte mit Code.' },
  wegweiser: { grund: false, erklaerung: 'Wegweiser durch die Doku-Dateien; lohnt ab etwa zehn Dateien.' },
  berichte: { grund: false, erklaerung: 'Ordner für einmalige Befunde, nach dem Schreiben eingefroren.' },
  prompts: { grund: false, erklaerung: 'Ordner für Aufträge an Sitzungen oder Agenten, wiederverwendbar.' },
  mermaid: { grund: false, erklaerung: 'Verknüpfte Einträge in der Übersicht zusätzlich als Diagramm.' },
}
/** Grundausstattung; Bausteine nur für Code (architektur) gehören nur mit `mitCode` dazu. */
export function grundausstattung(mitCode) {
  return Object.keys(BAUSTEINE).filter(b => BAUSTEINE[b].grund && (mitCode || !BAUSTEINE[b].nurMitCode))
}
/** Grundausstattung eines Projekts ohne Code. */
export const GRUNDAUSSTATTUNG = grundausstattung(false)

export const STANDARD_ORTE = {
  readme: 'README.md',
  'claude-md': 'CLAUDE.md',
  chronik: 'docs/verlauf.md',
  entscheidungen: 'docs/entscheidungen.md',
  architektur: 'ARCHITECTURE.md',
  wegweiser: 'docs/README.md',
  berichte: 'docs/berichte',
  prompts: 'docs/prompts',
}
export const STANDARD_FESTHALTEN = { idee: 'docs/ideen', bug: 'docs/bugs', todo: 'docs/todos' }
const SCHEMATA = ['keep-a-changelog', 'erzeugt', 'eigenes']
const SCHEMA_BESCHREIBUNG = {
  'keep-a-changelog': 'Keep a Changelog: je Version Neu, Geändert, Behoben, Entfernt; oben „Unveröffentlicht“',
  erzeugt: 'aus den Commits erzeugt; nicht von Hand ändern',
  eigenes: 'eigenes Schema; bei der Einrichtung beschreiben',
}
const CHANGELOG_NAMEN = ['changelog.md', 'changes.md', 'history.md', 'news.md']
/** Einträge in .gitignore für persönliche Dateien; bei Ablage „lokal“ kommt die Arbeits-Doku dazu. */
const PERSOENLICH = ['CLAUDE.local.md', '.claude/settings.local.json']

const pfadForm = p => posix.normalize(String(p).replace(/\\/g, '/')).replace(/^\.\//, '').replace(/\/$/, '')

/** Schritte, die zu den Bausteinen gehören (in Ausführungsreihenfolge). */
export function schritteFuer(bausteine, { ablage = 'teilen', leer = false, regeln = ladeRegeln() } = {}) {
  const s = ['doku-json', 'privat', 'karte', 'verweis']
  for (const b of Object.keys(BAUSTEINE)) {
    if (!bausteine.includes(b) || b === 'mermaid') continue
    if (b === 'festhalten') s.push(...Object.keys(regeln.festhalten.arten).map(a => `festhalten:${a}`))
    else s.push(b)
  }
  if (ablage === 'lokal' || leer) s.push('gitignore')
  return s
}

/** Changelog-Datei im Projektwurzel-Ordner (ohne Rücksicht auf Groß- und Kleinschreibung) oder null. */
export function findeChangelog(root) {
  let namen = []
  try {
    namen = readdirSync(root).sort()
  } catch {
    return null
  }
  for (const name of CHANGELOG_NAMEN) {
    const treffer = namen.find(n => n.toLowerCase() === name)
    if (treffer && statSync(join(root, treffer)).isFile()) return treffer
  }
  return null
}

/** Schema eines Changelogs: `erzeugt` (Werkzeug aus Commits), `keep-a-changelog` oder `eigenes`. */
export function erkenneSchema(text) {
  const kopf = text.split(/\r?\n/).slice(0, 15).join('\n')
  if (/auto-?generated|automatically generated|generated by|do not edit|nicht von hand|automatisch erzeugt/i.test(kopf)) return 'erzeugt'
  if (/^#{2,3} (?:Features|Bug Fixes)\b/m.test(text) && /\/commit\/[0-9a-f]{7,40}\b/i.test(text)) return 'erzeugt'
  if (/keep ?a ?changelog|keepachangelog\.com/i.test(text)) return 'keep-a-changelog'
  if (/^## \[[^\]]+\]/m.test(text) && /^### (?:Added|Changed|Deprecated|Removed|Fixed|Security|Neu|Geändert|Behoben|Entfernt)\b/m.test(text)) return 'keep-a-changelog'
  return 'eigenes'
}

/** Changelog des Projekts: { datei, schema, beschreibung, vorhanden }; ohne Datei der Vorschlag für eine neue. */
export function erkenneChangelog(root, datei = findeChangelog(root) ?? 'CHANGELOG.md') {
  const text = leseDatei(root, datei)
  const schema = text === null ? 'keep-a-changelog' : erkenneSchema(text)
  return { datei, schema, beschreibung: SCHEMA_BESCHREIBUNG[schema], vorhanden: text !== null }
}

function leseDatei(root, pfad) {
  const voll = join(root, ...pfad.split('/'))
  try {
    if (!statSync(voll).isFile()) return null
    return readFileSync(voll, 'utf8')
  } catch {
    return null
  }
}

/**
 * Pfad in Normalform, nur im Projekt und nie im Git-Ordner; sonst Fehler. Abgelehnt werden auch Pfadteile mit `:`
 * (unter Windows alternative Datenströme) und Pfadteile mit Punkt oder Leerzeichen am Ende (unter Windows Doppelnamen).
 */
function imProjekt(root, pfad, wozu) {
  const p = pfadForm(pfad)
  const teile = p.split('/')
  const unsicher = teile.some(t => gitTeil(t) || t.includes(':') || /[. ]$/.test(t))
  if (!innerhalb(p) || unsicher || sichererPfad(root, p) === null || imGitOrdner(root, p)) throw new Error(`${wozu}: „${pfad}“ liegt nicht im Projekt`)
  return p
}

/** Schlüssel, die die Einrichtung selbst bildet; alle anderen der vorhandenen Beschreibung bleiben unverändert. */
const GEBILDET = new Set(['bausteine', 'ablage', 'orte', 'zuordnung', 'festhalten', 'changelog', 'uebersicht', 'version'])
/** Anpassungen, die auch aus den Antworten kommen dürfen. */
const ANPASSUNGEN = ['pruefung', 'schemata']

/**
 * Doku-Beschreibung (.claude/doku.json) aus Antworten und vorhandener Beschreibung; Antworten gehen vor.
 * Form: version, bausteine, ablage, orte, zuordnung [{ pfad, art }], festhalten { idee, bug, todo }, changelog { datei,
 * schema, beschreibung }, uebersicht { mermaid }; dazu Anpassungen (pruefung, schemata, unbekannte Schlüssel) unverändert
 * aus der vorhandenen Beschreibung, pruefung und schemata auch aus den Antworten. `version` bleibt, wie sie war; setzen
 * tut sie `plane`.
 * Orte (außer readme und claude-md), Festhalten-Orte und der Changelog kommen nur hinein, wenn sie in den Antworten oder
 * der vorhandenen Beschreibung stehen, es sie gibt oder ihr Schritt in `zugestimmt` steht. Ohne `zugestimmt` (null) nur
 * aus Antworten und vorhandener Beschreibung: das, was das Plugin aus einer vorhandenen Beschreibung erzeugt hätte.
 */
export function beschreibungAus(root, antworten, alt, regeln, zugestimmt = null) {
  const bausteine = [...new Set(antworten.bausteine ?? alt?.bausteine ?? grundausstattung(hatCode(root)))]
  for (const b of bausteine) if (!BAUSTEINE[b]) throw new Error(`Unbekannter Baustein „${b}“ (${Object.keys(BAUSTEINE).join(', ')})`)
  const ablage = antworten.ablage ?? alt?.ablage ?? 'teilen'
  if (!['teilen', 'lokal'].includes(ablage)) throw new Error(`ablage „${ablage}“ ist weder teilen noch lokal`)
  // Ort gehört hinein: ausdrücklich genannt, vorhanden oder sein Schritt zugestimmt
  const gilt = (genannt, pfad, ...schritte) => genannt || (zugestimmt !== null && (schritte.some(s => zugestimmt.has(s)) || existsSync(join(root, ...pfad.split('/')))))

  const alleOrte = { ...STANDARD_ORTE, ...alt?.orte, ...antworten.orte }
  const orte = {}
  for (const [name, pfad] of Object.entries(alleOrte)) {
    if (!(name in STANDARD_ORTE)) throw new Error(`Unbekannter Ort „${name}“`)
    if (name !== 'readme' && name !== 'claude-md' && !bausteine.includes(name)) continue
    const p = imProjekt(root, pfad, `Ort ${name}`)
    const fest = name === 'readme' || name === 'claude-md' || alt?.orte?.[name] !== undefined || antworten.orte?.[name] !== undefined
    if (gilt(fest, p, name)) orte[name] = p
  }

  const datei = imProjekt(root, antworten.changelog?.datei ?? alt?.changelog?.datei ?? findeChangelog(root) ?? 'CHANGELOG.md', 'changelog.datei')
  const { vorhanden: _, ...erkannt } = erkenneChangelog(root, datei)
  const changelog = { ...erkannt, ...(alt?.changelog?.datei === datei ? alt.changelog : {}), ...antworten.changelog, datei }
  if (antworten.changelog?.schema && !antworten.changelog.beschreibung && antworten.changelog.schema !== erkannt.schema) changelog.beschreibung = SCHEMA_BESCHREIBUNG[changelog.schema]
  if (!SCHEMATA.includes(changelog.schema)) throw new Error(`changelog.schema „${changelog.schema}“ unbekannt (${SCHEMATA.join(', ')})`)
  const mitChangelog = gilt(Boolean(alt?.changelog || antworten.changelog), datei, 'changelog')

  const zuordnung = []
  const dazu = (pfad, art) => {
    if (!regeln.arten[art]) throw new Error(`Unbekannte Art „${art}“ für ${pfad}`)
    if (!zuordnung.some(z => z.pfad === pfad && z.art === art)) zuordnung.push({ pfad, art })
  }
  dazu(orte['claude-md'], 'anweisung')
  dazu('**/CLAUDE.md', 'anweisung')
  dazu('.claude/rules/**', 'anweisung')
  dazu(orte.readme, 'nachschlagen')
  if (orte.wegweiser) dazu(orte.wegweiser, 'nachschlagen')
  if (orte.chronik) dazu(orte.chronik, 'chronik')
  if (orte.entscheidungen) dazu(orte.entscheidungen, 'entscheidung')
  if (orte.architektur) dazu(orte.architektur, 'nachschlagen')
  if (orte.berichte) dazu(`${orte.berichte}/**`, 'bericht')
  if (orte.prompts) dazu(`${orte.prompts}/**`, 'prompt')
  for (const z of [...(alt?.zuordnung ?? []), ...(antworten.zuordnung ?? [])]) dazu(String(z.pfad), String(z.art))

  const beschreibung = alt?.version ? { version: alt.version, bausteine, ablage, orte, zuordnung } : { bausteine, ablage, orte, zuordnung }
  if (bausteine.includes('festhalten')) {
    const festhalten = {}
    for (const [art, ordner] of Object.entries({ ...STANDARD_FESTHALTEN, ...alt?.festhalten, ...antworten.festhalten })) {
      if (!regeln.festhalten.arten[art]) throw new Error(`Unbekannte Art zum Festhalten „${art}“`)
      const p = imProjekt(root, ordner, `Festhalten-Ort ${art}`)
      const fest = alt?.festhalten?.[art] !== undefined || antworten.festhalten?.[art] !== undefined
      if (gilt(fest, p, `festhalten:${art}`)) festhalten[art] = p
    }
    if (Object.keys(festhalten).length) beschreibung.festhalten = festhalten
  }
  if (mitChangelog) beschreibung.changelog = changelog
  beschreibung.uebersicht = { mermaid: bausteine.includes('mermaid') }
  for (const [k, w] of Object.entries(alt ?? {})) if (!GEBILDET.has(k)) beschreibung[k] = w
  for (const k of ANPASSUNGEN) if (antworten[k] !== undefined) beschreibung[k] = antworten[k]
  return beschreibung
}

/** Füllt eine Vorlage: Zeilen `{{?baustein}}…` nur mit diesem Baustein, `{{name}}` aus `werte`. */
export function vorlage(name, werte, bausteine) {
  const roh = readFileSync(join(VORLAGEN, `${name}.md`), 'utf8').replace(/\r\n/g, '\n')
  const zeilen = []
  for (const zeile of roh.split('\n')) {
    const m = /^\{\{\?([\w-]+)\}\}(.*)$/.exec(zeile)
    if (!m) zeilen.push(zeile)
    else if (bausteine.includes(m[1])) zeilen.push(m[2])
  }
  const text = zeilen.join('\n').replace(/\{\{([\w-]+)\}\}/g, (_, k) => {
    if (!(k in werte)) throw new Error(`Vorlage ${name}: Wert „${k}“ fehlt`)
    return werte[k]
  })
  return text.replace(/\n{3,}/g, '\n\n')
}

const code = p => `\`${p}\``

/** Verweiszeile für die Wurzel-CLAUDE.md. */
export function verweisZeile(beschreibung) {
  const regeln = beschreibung.bausteine.includes('schreibregeln') ? `, Arten und Schreibregeln in ${code(SCHREIBREGELN)}` : ''
  return `- Doku: was wohin steht in ${code(KARTE)}${regeln}.`
}

function changelogSatz(c) {
  return c.schema === 'erzeugt' ? `${code(c.datei)} ist erzeugt; nicht von Hand ändern.` : `Änderungen für Leser in ${code(c.datei)} eintragen (${c.beschreibung}).`
}

/** Karte „was wohin“: höchstens fünf Zeilen, dazu die Zeile zur Übersicht vor einem neuen Eintrag. */
export function karte(beschreibung, regeln) {
  const { bausteine, orte, changelog } = beschreibung
  const zeilen = []
  if (beschreibung.festhalten) {
    const orteText = Object.entries(beschreibung.festhalten).map(([art, o]) => `${regeln.festhalten.arten[art].titel} ${code(`${o}/`)}`).join(', ')
    // Angedockte Sammlung: Anleitung als Regeldatei; dann je Ort ihr Pfad
    const regeldatei = Object.keys(beschreibung.festhalten).some(art => schemaVon(beschreibung, art))
    if (!regeldatei) zeilen.push(`- Festhalten, je Eintrag eine Datei mit Kopf und Gerüst aus der ${code(ANLEITUNG)} des Ordners: ${orteText}.`)
    else zeilen.push(`- Festhalten, je Eintrag eine Datei mit Kopf und Gerüst nach der Anleitung: ${Object.entries(beschreibung.festhalten).map(([art, o]) => `${regeln.festhalten.arten[art].titel} ${code(`${o}/`)} (Anleitung ${code(anleitungPfad(beschreibung, art, o))})`).join(', ')}.`)
    // Angedockte Sammlung mit eigener Übersicht: die Übersicht ist die des Projekts, nicht erzeugt
    const arten = Object.keys(beschreibung.festhalten)
    const erzeugt = arten.filter(art => schemaVon(beschreibung, art)?.uebersicht !== 'eigen')
    if (erzeugt.length === arten.length) zeilen.push(`- Vor einem neuen Eintrag die ${code(UEBERSICHT)} des Ordners lesen: erzeugte Übersicht, offen und wichtig zuerst.`)
    else if (erzeugt.length === 0) zeilen.push(`- Vor einem neuen Eintrag die Übersicht ${code(UEBERSICHT)} des Ordners lesen.`)
    else zeilen.push(`- Vor einem neuen Eintrag die Übersicht ${code(UEBERSICHT)} des Ordners lesen; erzeugt, offen und wichtig zuerst, in ${erzeugt.map(art => code(`${beschreibung.festhalten[art]}/`)).join(', ')}.`)
  }
  zeilen.push(`- Regeln für jede Sitzung: ${code(orte['claude-md'])}${bausteine.includes('schreibregeln') ? `; Arten und Schreibregeln: ${code(SCHREIBREGELN)}` : ''}.`)
  if (changelog) zeilen.push(`- Änderungen je Version: ${code(changelog.datei)}, ${changelog.schema === 'erzeugt' ? 'erzeugt; nicht von Hand ändern' : changelog.beschreibung}.`)
  const verlauf = []
  if (orte.chronik) verlauf.push(`Chronik ${code(orte.chronik)}`)
  if (orte.entscheidungen) verlauf.push(`Entscheidungen mit Alternativen und Wortlaut ${code(orte.entscheidungen)}`)
  if (verlauf.length) zeilen.push(`- ${verlauf.join('; ')}.`)
  if (orte.architektur) zeilen.push(`- Aufbau des Codes: ${code(orte.architektur)}. Ändert sich der Aufbau, ${code(orte.architektur)} nachziehen.`)
  const weitere = [`für Menschen ${code(orte.readme)}`]
  if (orte.wegweiser) weitere.push(`Wegweiser ${code(orte.wegweiser)}`)
  if (orte.berichte) weitere.push(`Berichte ${code(`${orte.berichte}/`)}`)
  if (orte.prompts) weitere.push(`Prompts ${code(`${orte.prompts}/`)}`)
  const bekannt = new Set(['**/CLAUDE.md', '.claude/rules/**', ...Object.values(orte), `${orte.berichte}/**`, `${orte.prompts}/**`])
  for (const z of beschreibung.zuordnung) if (!bekannt.has(z.pfad)) weitere.push(`${code(z.pfad)} (${regeln.arten[z.art].titel.split(':')[0]})`)
  zeilen.push(`- Weitere Doku: ${weitere.join(', ')}.`)
  return vorlage('karte', { erzeugt: KOPF_ERZEUGT, zeilen: zeilen.join('\n') }, bausteine)
}

/** Tabelle der Arten mit den Pfaden dieses Projekts. */
function artenTabelle(beschreibung, regeln) {
  const pfade = new Map()
  const dazu = (art, p) => pfade.set(art, [...(pfade.get(art) ?? []), p])
  for (const z of beschreibung.zuordnung) dazu(z.art, z.pfad)
  const c = beschreibung.changelog
  if (c && c.schema !== 'erzeugt') dazu(c.schema === 'eigenes' ? 'changelog-eigen' : 'chronik', c.datei)
  for (const o of Object.values(beschreibung.festhalten ?? {})) dazu('eintrag', `${o}/`)
  return Object.entries(regeln.arten)
    .filter(([art]) => pfade.has(art))
    .map(([art, def]) => {
      const [name, ...rest] = def.titel.split(': ')
      return `| ${name} | ${pfade.get(art).map(code).join(', ')} | ${rest.join(': ')} |`
    })
    .join('\n')
}

/**
 * Anleitung eines Festhalten-Ordners. Felder, Werte und Abschnitte aus regeln.json; bei einer angedockten Sammlung
 * (`schemata.<art>` in der Beschreibung) die des Projekts, als Regeldatei mit `paths` auf den Ordner (anleitungPfad).
 */
export function anleitung(art, regeln, beschreibung) {
  const schema = schemaVon(beschreibung, art)
  if (schema) return anleitungEigen(art, regeln, schema, festhaltenOrte(beschreibung, regeln).find(o => o.art === art)?.ordner ?? beschreibung.festhalten?.[art])
  const def = regeln.festhalten
  const artDef = def.arten[art]
  const mitErgebnis = artDef.ergebnis !== null
  const felder = [...def.felder, ...(mitErgebnis ? ['ergebnis', 'erledigt-durch'] : [])]
  const beispiel = { titel: '<Titel>', datum: 'JJJJ-MM-TT', bezug: '[]', status: def.status[0], wichtigkeit: def.wichtigkeit.at(-1) }
  const kopf = felder.map(f => `${f}: ${beispiel[f] ?? ''}`.trimEnd()).join('\n')
  const abschnitte = artDef.abschnitte.map(a => `## ${a}\n\n<…>`).join('\n\n')
  const liste = werte => werte.map(code).join(' oder ')
  const ergebnis = mitErgebnis
    ? [
        `- \`ergebnis\`: leer, solange \`status: ${def.status[0]}\`; bei \`${def.status.at(-1)}\` Pflicht: ${liste(artDef.ergebnis)}.`,
        '- `erledigt-durch`: Pflicht, sobald `ergebnis` gefüllt ist: relativer Link auf eine Datei im Projekt, ein Commit-Hash oder `text` (dann ein Abschnitt `## Ergebnis` im Eintrag).',
        ...(artDef.ergebnis.includes('ersetzt') ? ['- Bei `ersetzt` zeigt `erledigt-durch` als Link auf den ersetzenden Eintrag derselben Art.'] : []),
      ].join('\n')
    : `- Kein \`ergebnis\` und kein \`erledigt-durch\`; fertig heißt \`status: ${def.status.at(-1)}\`.`
  return vorlage('festhalten', {
    erzeugt: KOPF_ERZEUGT,
    titel: artDef.titel,
    kopf,
    abschnitte,
    status: liste(def.status),
    wichtigkeit: liste(def.wichtigkeit),
    ergebnis,
  }, [])
}

/** Anleitung einer angedockten Sammlung: Pflichtfelder, Statuswerte und Abschluss-Werte des Projekts. */
function anleitungEigen(art, regeln, schema, ordner) {
  const pflicht = Array.isArray(schema.pflicht) ? schema.pflicht.map(String) : []
  const status = schema.status && typeof schema.status === 'object' ? Object.entries(schema.status) : regeln.festhalten.status.map(s => [s, s])
  const offen = status.find(([, k]) => k === 'offen')?.[0] ?? ''
  const beispiel = { titel: '<Titel>', datum: 'JJJJ-MM-TT', bezug: '[]', status: offen, wichtigkeit: 'normal' }
  const kopf = pflicht.map(f => `${f}: ${beispiel[f] ?? '<…>'}`.trimEnd()).join('\n')
  const abschnitte = Array.isArray(schema.abschnitte) && schema.abschnitte.length ? `\n${schema.abschnitte.map(a => `## ${a}\n\n<…>`).join('\n\n')}` : ''
  const nachKlasse = k => status.filter(([, x]) => x === k).map(([w]) => code(w)).join(', ')
  const felder = [
    `- Pflicht: ${pflicht.length ? pflicht.map(code).join(', ') : 'keine'}; weitere Felder sind erlaubt.`,
    `- \`status\`: offen ${nachKlasse('offen') || '–'}; erledigt ${nachKlasse('erledigt') || '–'}.`,
    ...(pflicht.includes('datum') ? ['- `datum`: Tag des Eintrags, JJJJ-MM-TT.'] : []),
    ...(pflicht.includes('bezug') ? ['- `bezug`: Liste verknüpfter Einträge als Dateinamen ohne `.md`, ohne Bezug `[]`.'] : []),
  ].join('\n')
  const abschluss = schema.abschluss && typeof schema.abschluss === 'object' && Object.keys(schema.abschluss).length
    ? Object.entries(schema.abschluss).map(([ergebnis, felder]) => `- Ergebnis ${code(ergebnis)}: im Kopf ${Object.entries(felder ?? {}).map(([f, w]) => code(`${f}: ${w}`)).join(', ')} setzen.`).join('\n')
    : '- Keine Abschluss-Werte festgelegt; einen Eintrag schließt der Nutzer von Hand ab.'
  const uebersicht = schema.uebersicht === 'eigen'
    ? `Die \`${ordner}/${UEBERSICHT}\` ist die eigene Übersicht des Projekts; sie wird nicht erzeugt.`
    : `Die \`${ordner}/${UEBERSICHT}\` ist die erzeugte Übersicht: vor einem neuen Eintrag lesen, nie von Hand ändern.`
  return vorlage('festhalten-eigen', { ordner, erzeugt: KOPF_ERZEUGT, titel: regeln.festhalten.arten[art].titel, uebersicht, kopf, abschnitte, felder, abschluss }, [])
}

/** Regeldatei mit Arten und Schreibregeln. */
export function schreibregelnText(beschreibung, regeln) {
  return vorlage('schreibregeln', { erzeugt: KOPF_ERZEUGT, arten: artenTabelle(beschreibung, regeln) }, beschreibung.bausteine)
}

/**
 * Erzeugte Plugin-Dateien der Beschreibung: [{ schritt, pfad, inhalt }]. Sie entstehen nur aus .claude/doku.json und den
 * Regeln; Anpassungen gehören in .claude/doku.json.
 */
export function pluginDateien(beschreibung, regeln) {
  const aus = [{ schritt: 'karte', pfad: KARTE, inhalt: karte(beschreibung, regeln) }]
  if (beschreibung.bausteine.includes('schreibregeln')) aus.push({ schritt: 'schreibregeln', pfad: SCHREIBREGELN, inhalt: schreibregelnText(beschreibung, regeln) })
  for (const { art, ordner } of festhaltenOrte(beschreibung, regeln)) aus.push({ schritt: `festhalten:${art}`, pfad: anleitungPfad(beschreibung, art, ordner), inhalt: anleitung(art, regeln, beschreibung) })
  return aus
}

/**
 * Inhalt je Plugin-Datei, wie dieses Plugin sie aus der vorhandenen .claude/doku.json erzeugt; leer ohne sie. Eine Datei
 * mit genau diesem Inhalt ist weder von Hand geändert noch von einem älteren Plugin; sie folgt einer neuen Beschreibung direkt.
 */
function erzeugtAusAlt(root, alt, regeln) {
  if (!alt) return new Map()
  try {
    return new Map(pluginDateien(beschreibungAus(root, {}, alt, regeln), regeln).map(d => [d.pfad, d.inhalt]))
  } catch {
    return new Map()
  }
}

/**
 * Veraltete Plugin-Dateien: es gibt sie, ihr Inhalt weicht vom erzeugten ab und auch von dem, was das Plugin aus der
 * vorhandenen .claude/doku.json erzeugen würde (also von Hand geändert oder von einem älteren Plugin). Sie kommen als Probe.
 */
export function veraltetePluginDateien(root, beschreibung, regeln, alt = ladeBeschreibung(root)) {
  const vorher = erzeugtAusAlt(root, alt, regeln)
  return pluginDateien(beschreibung, regeln).filter(d => {
    const text = leseDatei(root, d.pfad)
    return text !== null && text !== d.inhalt && text !== vorher.get(d.pfad)
  })
}

/**
 * Zeilen des Wegweisers, je Ort ein Link relativ zum Wegweiser, damit seine Vollständigkeit prüfbar ist. Ein Ort, den es
 * nach dem Lauf nicht gibt (`kommt` sagt nein), steht als Code, damit kein toter Link entsteht.
 */
function wegweiserZeilen(beschreibung, regeln, kommt = () => true) {
  const { orte } = beschreibung
  const basis = posix.dirname(orte.wegweiser ?? 'README.md')
  const ziel = (pfad, schritt, ordner = false) => {
    const anzeige = ordner ? `${pfad}/` : pfad
    if (!kommt(pfad, schritt)) return code(anzeige)
    const rel = posix.relative(basis, pfad) || pfad
    return `[${anzeige}](${rel}${ordner ? '/' : ''})`
  }
  const z = []
  if (orte.chronik) z.push(`| ${ziel(orte.chronik, 'chronik')} | Chronik: was geschah | wenn die Geschichte einer Änderung zählt |`)
  if (orte.entscheidungen) z.push(`| ${ziel(orte.entscheidungen, 'entscheidungen')} | Entscheidungen mit Alternativen und Wortlaut | vor einer Änderung an Entschiedenem |`)
  for (const [art, o] of Object.entries(beschreibung.festhalten ?? {})) z.push(`| ${ziel(o, `festhalten:${art}`, true)} | ${regeln.festhalten.arten[art].titel} festhalten | Übersicht ${code(UEBERSICHT)} vor einem neuen Eintrag |`)
  if (orte.berichte) z.push(`| ${ziel(orte.berichte, 'berichte', true)} | Berichte: einmalige Befunde | wenn ein Befund gebraucht wird |`)
  if (orte.prompts) z.push(`| ${ziel(orte.prompts, 'prompts', true)} | Prompts: Aufträge für Sitzungen | vor einem gleichen Auftrag |`)
  return z.join('\n')
}

/** Text je Gerüst-Schritt. */
function geruest(schritt, beschreibung, regeln, root, kommt) {
  // Gerüste nennen die Orte der gewählten Bausteine; steht einer (noch) nicht in der Beschreibung, sein Standard-Ort
  const b = beschreibung.bausteine
  const orte = { ...STANDARD_ORTE, ...beschreibung.orte }
  const changelog = beschreibung.changelog ?? erkenneChangelog(root)
  const werte = {
    projekt: basename(resolve(root)),
    changelog: changelog.datei,
    changelogRegel: changelogSatz(changelog),
    wegweiser: orte.wegweiser,
    chronik: orte.chronik,
    entscheidungen: orte.entscheidungen,
    verweis: verweisZeile(beschreibung),
  }
  switch (schritt) {
    case 'readme': return vorlage('readme', werte, b)
    case 'claude-md': return vorlage('claude-md', werte, b)
    case 'changelog': return vorlage('changelog', werte, b)
    case 'chronik': return vorlage('verlauf', werte, b)
    case 'entscheidungen': return vorlage('entscheidungen', werte, b)
    case 'architektur': return vorlage('architektur', werte, b)
    case 'wegweiser': return vorlage('wegweiser', { zeilen: wegweiserZeilen(beschreibung, regeln, kommt) }, b)
    case 'berichte': return vorlage('berichte', werte, b)
    case 'prompts': return vorlage('prompts', werte, b)
    default: throw new Error(`kein Gerüst für ${schritt}`)
  }
}

/** Ziel eines Gerüst-Schritts. */
function geruestZiel(schritt, beschreibung) {
  const { orte, changelog } = beschreibung
  if (schritt === 'changelog') return changelog.datei
  if (schritt === 'berichte' || schritt === 'prompts') return `${orte[schritt]}/${UEBERSICHT}`
  return orte[schritt]
}

const LINK = /(\]\(\s*<?)([^)\s>]+)(>?(?:\s+"[^"]*")?\s*\))/g

/** Schreibt relative Links einer Datei um, die von `datei` nach `neuerOrt` zieht; `ziehen` bildet alte auf neue Pfade ab. */
export function linksUmschreiben(text, datei, neuerOrt, ziehen) {
  let imCode = false
  return text.split('\n').map(zeile => {
    if (/^\s*(```|~~~)/.test(zeile)) {
      imCode = !imCode
      return zeile
    }
    if (imCode) return zeile
    return zeile.replace(LINK, (ganz, vor, ziel, nach) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(ziel) || ziel.startsWith('#')) return ganz
      const [pfadTeil = '', ...rest] = ziel.split('#')
      let roh = pfadTeil
      try {
        roh = decodeURIComponent(pfadTeil)
      } catch {
        // wie geschrieben
      }
      const alt = posix.normalize(posix.join(posix.dirname(datei), roh)).replace(/\/$/, '')
      if (alt === '..' || alt.startsWith('../')) return ganz
      const neu = ziehen.get(alt) ?? alt
      if (neu === alt && neuerOrt === datei) return ganz
      let rel = posix.relative(posix.dirname(neuerOrt), neu) || posix.basename(neu)
      if (pfadTeil.endsWith('/')) rel += '/'
      if (roh !== pfadTeil) rel = encodeURI(rel)
      return `${vor}${rel}${rest.length ? `#${rest.join('#')}` : ''}${nach}`
    })
  }).join('\n')
}

/**
 * Plant die Einrichtung, ohne zu schreiben. Antworten:
 *   schritte      Pflicht: zugestimmte Schritte (siehe `schritteFuer`, dazu `git-init`, `verschieben:<von>`, `ueberarbeiten:<pfad>`,
 *                 `ueberfuehren:<art>`, `uebernehmen:<pfad>`, `verwerfen:<pfad>`)
 *   bausteine     gewählte Bausteine (Standard: Grundausstattung oder die aus .claude/doku.json)
 *   ablage        teilen | lokal
 *   orte, festhalten, zuordnung [{ pfad, art }], changelog { datei, schema, beschreibung }   abweichend vom Standard
 *   verschieben   [{ von, nach }]
 *   inhalte       { pfad: Text }: überarbeiteter Inhalt einer vorhandenen Datei, nur mit `ueberarbeiten:<pfad>`
 *   pruefung, schemata   Anpassungen für .claude/doku.json (siehe gemeinsam.mjs :: ladeBeschreibung)
 * Optionen: version `behalten` lässt `version` in .claude/doku.json unverändert (Nachtragen).
 * Ergebnis: { beschreibung, aktionen: [{ schritt, art, pfad, inhalt?, nach?, zusatz?, grund?, uebersicht? }] }
 */
export function plane(root, antworten, regeln = ladeRegeln(), optionen = {}) {
  if (!antworten || !Array.isArray(antworten.schritte)) throw new Error('Antworten ohne Liste „schritte“')
  const alt = ladeBeschreibung(root)
  const zugestimmt = new Set(antworten.schritte.map(String))
  let beschreibung = beschreibungAus(root, antworten, alt, regeln, zugestimmt)
  // version: der Stand der erzeugten Plugin-Dateien; neu gesetzt nur, wenn keine davon veraltet ist
  if (zugestimmt.has('doku-json') && optionen.version !== 'behalten' && veraltetePluginDateien(root, beschreibung, regeln).length === 0) {
    const { version: _, ...rest } = beschreibung
    beschreibung = { version: pluginVersion(), ...rest }
  }
  const inhalte = new Map(Object.entries(antworten.inhalte ?? {}).map(([p, t]) => [pfadForm(p), String(t)]))
  const ueberarbeiten = new Set([...zugestimmt].filter(s => s.startsWith('ueberarbeiten:')).map(s => imProjekt(root, s.slice('ueberarbeiten:'.length), 'ueberarbeiten')))
  const ziehen = new Map()
  for (const v of antworten.verschieben ?? []) {
    const von = imProjekt(root, v.von, 'verschieben')
    if (zugestimmt.has(`verschieben:${von}`) || zugestimmt.has(`verschieben:${v.von}`)) ziehen.set(von, imProjekt(root, v.nach, 'verschieben nach'))
  }
  const festhaltenArten = Object.keys(regeln.festhalten.arten)
  const bekannt = new Set([...schritteFuer(Object.keys(BAUSTEINE), { ablage: 'lokal', regeln }), 'git-init'])
  for (const s of zugestimmt) {
    if (bekannt.has(s) || ['ueberarbeiten:', 'ueberfuehren:', 'uebernehmen:', 'verwerfen:'].some(v => s.startsWith(v))) continue
    if (s.startsWith('verschieben:') && [...ziehen.keys()].some(v => s === `verschieben:${v}`)) continue
    if (s.startsWith('verschieben:')) throw new Error(`Schritt „${s}“ ohne passenden Eintrag in „verschieben“`)
    throw new Error(`Unbekannter Schritt „${s}“`)
  }

  const virt = new Map()
  const lies = p => (virt.has(p) ? virt.get(p) : leseDatei(root, p))
  const aktionen = []
  const erledigt = new Set()

  /** Datei schreiben; vorhanden nur ersetzen, wenn sie dem Plugin gehört (`eigen`) oder ihr Überarbeiten zugestimmt ist. */
  const privatGeht = alt !== null || zugestimmt.has('doku-json')
  const altErzeugt = erzeugtAusAlt(root, alt, regeln)
  /**
   * Datei schreiben; vorhanden nur ersetzen, wenn sie dem Plugin gehört (`eigen`) oder ihr Überarbeiten zugestimmt ist.
   * Erzeugte Plugin-Dateien (`probe`) folgen einer geänderten Beschreibung direkt; sind sie veraltet (siehe
   * veraltetePluginDateien), kommen sie als Probe mit Änderungsliste.
   */
  const datei = (schritt, pfad, inhalt, { eigen = () => false, uebersicht, probe = false } = {}) => {
    const p = imProjekt(root, pfad, schritt)
    const ueber = ueberarbeiten.has(p)
    if (ueber) erledigt.add(p)
    if (ueber && inhalte.has(p)) inhalt = inhalte.get(p)
    const vorher = lies(p)
    let art = 'anlegen'
    let grund
    if (vorher !== null && vorher === inhalt) art = 'unveraendert'
    else if (vorher !== null && probe && !ueber && vorher === altErzeugt.get(p)) art = 'ersetzen'
    else if (vorher !== null && probe && !ueber) {
      if (!privatGeht) return aktionen.push({ schritt, art: 'uebersprungen', pfad: p, grund: `vorhanden; ohne ${DOKU_JSON} keine Probe` })
      aktionen.push({ schritt, art: 'probe', pfad: `${PROBE}/${p}`, inhalt, veraltet: p })
      return aktionen.push({ schritt, art: 'probe', pfad: aenderungenPfad(p), inhalt: aenderungenText([p], zeilenDiff(vorher, inhalt)), liste: true })
    }
    else if (vorher !== null && !(ueber || eigen(vorher))) {
      art = 'uebersprungen'
      grund = 'vorhanden; Überarbeiten nicht zugestimmt'
    } else if (vorher !== null) art = 'ersetzen'
    if (art === 'anlegen' || art === 'ersetzen') virt.set(p, inhalt)
    aktionen.push({ schritt, art, pfad: p, inhalt, grund, uebersicht: art === 'unveraendert' || art === 'uebersprungen' ? undefined : uebersicht })
  }
  const anhaengen = (schritt, pfad, zusatz) => {
    const p = imProjekt(root, pfad, schritt)
    const vorher = lies(p)
    if (zusatz.length === 0) return aktionen.push({ schritt, art: 'unveraendert', pfad: p })
    if (vorher === null) {
      const inhalt = `${zusatz.join('\n')}\n`
      virt.set(p, inhalt)
      return aktionen.push({ schritt, art: 'anlegen', pfad: p, inhalt })
    }
    const eol = vorher.includes('\r\n') ? '\r\n' : '\n'
    const inhalt = vorher + (vorher === '' || vorher.endsWith('\n') ? '' : eol) + zusatz.map(z => z + eol).join('')
    virt.set(p, inhalt)
    aktionen.push({ schritt, art: 'anhaengen', pfad: p, inhalt, zusatz })
  }

  if (zugestimmt.has('git-init')) {
    const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).status === 0
    aktionen.push(repo ? { schritt: 'git-init', art: 'unveraendert', pfad: '.git', grund: 'schon ein Git-Repo' } : { schritt: 'git-init', art: 'git-init', pfad: '.git' })
  }

  if (ziehen.size > 0) {
    for (const [von, nach] of ziehen) {
      if (leseDatei(root, von) === null && !existsSync(join(root, von))) throw new Error(`verschieben: „${von}“ fehlt`)
      // Nur einzelne Dateien: Links auf Dateien unter einem verschobenen Ordner würden sonst brechen
      if (statSync(join(root, von)).isDirectory()) throw new Error(`verschieben: „${von}“ ist ein Ordner; verschoben werden nur einzelne Dateien`)
      if (existsSync(join(root, nach))) throw new Error(`verschieben: „${nach}“ gibt es schon`)
    }
    const md = new Set(markdownDateien(root))
    for (const [von, nach] of ziehen) {
      const text = von.endsWith('.md') ? lies(von) : null
      const inhalt = text === null ? null : linksUmschreiben(text, von, nach, ziehen)
      virt.set(von, null)
      if (inhalt !== null) virt.set(nach, inhalt)
      aktionen.push({ schritt: `verschieben:${von}`, art: 'verschieben', pfad: von, nach, inhalt })
    }
    for (const f of md) {
      if (ziehen.has(f)) continue
      const text = lies(f)
      if (text === null) continue
      const neu = linksUmschreiben(text, f, f, ziehen)
      if (neu === text) continue
      virt.set(f, neu)
      aktionen.push({ schritt: 'verschieben', art: 'links', pfad: f, inhalt: neu })
    }
  }

  if (zugestimmt.has('doku-json')) datei('doku-json', DOKU_JSON, `${JSON.stringify(beschreibung, null, 2)}\n`, { eigen: () => true })
  for (const s of ['claude-md', 'readme', 'changelog', 'chronik', 'entscheidungen', 'architektur', 'wegweiser', 'berichte', 'prompts']) {
    if (!zugestimmt.has(s)) continue
    if (s !== 'claude-md' && s !== 'readme' && s !== 'changelog' && !beschreibung.bausteine.includes(s)) throw new Error(`Schritt „${s}“: Baustein ${s} ist nicht gewählt`)
    const ziel = geruestZiel(s, beschreibung)
    if (s === 'changelog' && beschreibung.changelog.schema === 'erzeugt') {
      if (ueberarbeiten.has(ziel)) throw new Error(`${ziel} ist erzeugt und wird nicht überarbeitet`)
      aktionen.push({ schritt: s, art: 'uebersprungen', pfad: ziel, grund: 'erzeugt; wird nicht angelegt oder geändert' })
      continue
    }
    // Projekt mit Code: die Erstfassung schreibt der Verfasser als Probe, kein leeres Gerüst neben fertigem Code
    if (s === 'architektur' && lies(ziel) === null && hatCode(root)) {
      aktionen.push({ schritt: s, art: 'verfasser', pfad: ziel, grund: 'Projekt mit Code: Erstfassung als Probe über den Verfasser' })
      continue
    }
    datei(s, ziel, geruest(s, beschreibung, regeln, root, (pfad, schritt) => existsSync(join(root, pfad)) || zugestimmt.has(schritt)))
  }
  if (zugestimmt.has('verweis')) {
    const ziel = beschreibung.orte['claude-md']
    const vorher = lies(ziel)
    if (vorher === null) datei('verweis', ziel, `# CLAUDE.md\n\n${verweisZeile(beschreibung)}\n`)
    else anhaengen('verweis', ziel, vorher.includes(KARTE) ? [] : [verweisZeile(beschreibung)])
  }
  if (zugestimmt.has('karte')) datei('karte', KARTE, karte(beschreibung, regeln), { probe: true })
  if (zugestimmt.has('schreibregeln')) datei('schreibregeln', SCHREIBREGELN, schreibregelnText(beschreibung, regeln), { probe: true })

  const orte = festhaltenOrte(beschreibung, regeln)
  for (const art of festhaltenArten) {
    const s = `festhalten:${art}`
    if (!zugestimmt.has(s)) continue
    const ort = orte.find(o => o.art === art)
    if (!ort) throw new Error(`Schritt „${s}“: Baustein festhalten ist nicht gewählt`)
    datei(s, anleitungPfad(beschreibung, art, ort.ordner), anleitung(art, regeln, beschreibung), { probe: true })
    const schema = schemaVon(beschreibung, art)
    if (schema?.uebersicht === 'eigen') continue
    const text = renderUebersicht(art, ort, leseEintraege(root, orte), regeln, { mermaid: beschreibung.uebersicht.mermaid, schema })
    datei(s, `${ort.ordner}/${UEBERSICHT}`, text, { eigen: vorher => vorher.includes(ERZEUGT), uebersicht: art })
  }

  if (zugestimmt.has('gitignore')) {
    // Alle Orte der gewählten Bausteine, auch die später angelegten: lokale Arbeits-Doku kommt nie ins Repo
    const voll = beschreibungAus(root, antworten, alt, regeln, new Set(schritteFuer(beschreibung.bausteine, { regeln })))
    const { orte: o } = voll
    const arbeit = beschreibung.ablage === 'lokal'
      ? [...Object.values(voll.festhalten ?? {}).map(f => `/${f}/`), ...[o.chronik, o.entscheidungen].filter(Boolean).map(f => `/${f}`), ...[o.berichte, o.prompts].filter(Boolean).map(f => `/${f}/`)]
      : []
    const vorhanden = new Set((lies('.gitignore') ?? '').split(/\r?\n/).map(z => z.trim()))
    anhaengen('gitignore', '.gitignore', [...PERSOENLICH, ...arbeit].filter(e => !vorhanden.has(e) && !vorhanden.has(e.replace(/^\//, ''))))
  }
  if (zugestimmt.has('privat')) {
    const vorhanden = new Set((lies('.gitignore') ?? '').split(/\r?\n/).map(z => z.trim().replace(/^\//, '').replace(/\/$/, '')))
    anhaengen('privat', '.gitignore', vorhanden.has(PRIVAT) ? [] : [`/${PRIVAT}/`])
  }

  for (const s of [...zugestimmt].filter(x => x.startsWith('ueberfuehren:'))) {
    if (!alt && !zugestimmt.has('doku-json')) throw new Error(`Schritt „${s}“: ${DOKU_JSON} fehlt; erst einrichten`)
    aktionen.push(...planeUeberfuehren(root, s.slice('ueberfuehren:'.length), beschreibung, regeln))
  }

  for (const p of ueberarbeiten) {
    if (erledigt.has(p)) continue
    if (!inhalte.has(p)) throw new Error(`ueberarbeiten:${p} ohne Text in „inhalte“`)
    if (p === beschreibung.changelog?.datei && beschreibung.changelog.schema === 'erzeugt') throw new Error(`${p} ist erzeugt und wird nicht überarbeitet`)
    if (lies(p) === null) throw new Error(`ueberarbeiten:${p}: Datei fehlt`)
    datei(`ueberarbeiten:${p}`, p, inhalte.get(p))
  }
  const uebernehmen = [...zugestimmt].filter(x => x.startsWith('uebernehmen:')).map(x => imProjekt(root, x.slice('uebernehmen:'.length), 'uebernehmen'))
  for (const p of uebernehmen) if (istDokuJson(p)) throw new Error(`uebernehmen:${p}: ${DOKU_JSON} kommt nie als Probe`)
  const verwerfen = [...zugestimmt].filter(x => x.startsWith('verwerfen:')).map(x => imProjekt(root, x.slice('verwerfen:'.length), 'verwerfen'))
  for (const p of verwerfen) {
    if (uebernehmen.includes(p)) throw new Error(`verwerfen:${p}: im selben Lauf auch übernommen`)
    if (!alt) throw new Error(`verwerfen: ${DOKU_JSON} fehlt; erst einrichten`)
    aktionen.push(...planeVerwerfen(root, p, new Set(verwerfen)))
  }
  if (uebernehmen.length > 0) {
    if (!alt) throw new Error(`uebernehmen: ${DOKU_JSON} fehlt; erst einrichten`)
    const u = planeUebernehmen(root, uebernehmen, beschreibung, regeln)
    aktionen.push(...u.aktionen)
    beschreibung = u.beschreibung
  }
  return { beschreibung, aktionen }
}

/** Ist der Pfad die Beschreibung .claude/doku.json (ohne Rücksicht auf Groß- und Kleinschreibung)? Sie kommt nie als Probe. */
const istDokuJson = p => pfadForm(p).toLowerCase() === DOKU_JSON.toLowerCase()

/** Überführte Einträge im Probe-Ordner einer Sammlung: ohne Zusammenfassung, Anleitung, Übersicht und Änderungslisten. */
function ueberfuehrteEintraege(probeVoll) {
  return readdirSync(probeVoll, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md') && ![UEBERFUEHREN, ANLEITUNG, UEBERSICHT].includes(e.name) && !e.name.endsWith('.aenderungen.md'))
    .map(e => e.name)
    .sort()
}

/** Entfernt `namen` aus einem Probe-Ordner; bleibt darin sonst nichts, den ganzen Ordner. */
function entfernenAus(schritt, probe, probeVoll, namen) {
  if (readdirSync(probeVoll).every(n => namen.includes(n))) return [{ schritt, art: 'entfernen', pfad: probe }]
  return namen.filter(n => existsSync(join(probeVoll, n))).map(n => ({ schritt, art: 'entfernen', pfad: `${probe}/${n}` }))
}

/**
 * Aktionen für `verwerfen:<pfad>`: Probe und Änderungsliste weg, die echte Datei bleibt. Bei einem überführten Ordner nur
 * die überführten Einträge und UEBERFUEHREN.md; eine wartende Probe der Anleitung im selben Ordner bleibt. Ohne Probe ein
 * Fehler. Gehören Dateien laut Änderungsliste zusammen, müssen alle im selben Lauf verworfen werden.
 */
function planeVerwerfen(root, p, menge) {
  const schritt = `verwerfen:${p}`
  const probe = `${PROBE}/${p}`
  if (!existsSync(join(root, ...probe.split('/')))) throw new Error(`${schritt}: keine Probe in ${probe}`)
  const probeVoll = privatPfad(root, probe.slice(PRIVAT.length + 1))
  if (probeVoll === null) throw new Error(`${schritt}: ${DOKU_JSON} fehlt`)
  if (lstatSync(probeVoll).isDirectory()) {
    if (!existsSync(join(probeVoll, UEBERFUEHREN))) throw new Error(`${schritt}: kein überführter Festhalten-Ordner`)
    return entfernenAus(schritt, probe, probeVoll, [...ueberfuehrteEintraege(probeVoll), UEBERFUEHREN])
  }
  const liste = leseDatei(root, aenderungenPfad(p))
  for (const z of zusammenAus(liste ?? '')) if (!menge.has(z)) throw new Error(`${schritt}: gehört mit ${z} zusammen; beide im selben Lauf verwerfen`)
  const aktionen = [{ schritt, art: 'entfernen', pfad: probe }]
  if (liste !== null) aktionen.push({ schritt, art: 'entfernen', pfad: aenderungenPfad(p) })
  return aktionen
}

/**
 * Aktionen für `uebernehmen:<pfad>`: je Datei die alte Fassung nach sicherung/ (mit Zeitstempel, wenn es dort schon eine
 * gibt), dann die Probe an ihren Ort, dann Probe und Änderungsliste weg. Ein überführter Ordner wird ganz gesichert und
 * ersetzt; danach entfällt `schemata.<art>`, Übersicht und Anleitung werden erzeugt. Gehören Dateien laut Änderungsliste
 * zusammen, müssen alle im selben Lauf übernommen werden. `version` folgt, wenn danach keine Plugin-Datei mehr veraltet ist.
 */
function planeUebernehmen(root, pfade, beschreibung, regeln) {
  const aktionen = []
  let neu = beschreibung
  const menge = new Set(pfade)
  const ersetzt = new Set()
  const pluginPfade = new Set(pluginDateien(beschreibung, regeln).map(d => d.pfad))
  let pluginDabei = false
  const schreiben = (schritt, pfad, inhalt) => {
    aktionen.push({ schritt, art: leseDatei(root, pfad) === null ? 'anlegen' : 'ersetzen', pfad, inhalt })
    ersetzt.add(pfad)
  }
  for (const p of pfade) {
    const schritt = `uebernehmen:${p}`
    const probe = `${PROBE}/${p}`
    // Nur echte Dateien im privaten Ordner: ein Symlink dort würde fremde Dateien ins Projekt bringen
    const probeVoll = privatPfad(root, probe.slice(PRIVAT.length + 1))
    if (probeVoll === null || !existsSync(probeVoll)) throw new Error(`${schritt}: keine Probe in ${probe}`)
    const echteDatei = v => lstatSync(v).isFile()
    if (lstatSync(probeVoll).isDirectory()) {
      const ort = festhaltenOrte(neu, regeln).find(o => o.ordner === p)
      if (!ort || !existsSync(join(probeVoll, UEBERFUEHREN))) throw new Error(`${schritt}: kein überführter Festhalten-Ordner`)
      for (const name of readdirSync(join(root, p)).sort()) {
        if (echteDatei(join(root, p, name))) aktionen.push({ schritt, art: 'sichern', pfad: `${p}/${name}`, nach: sicherungsPfad(root, `${p}/${name}`) })
      }
      // Nur überführte Einträge; eine Probe der Anleitung im selben Ordner ist mit der neuen Anleitung hinfällig
      const eintraege = ueberfuehrteEintraege(probeVoll)
      for (const name of eintraege) schreiben(schritt, `${p}/${name}`, readFileSync(join(probeVoll, name), 'utf8'))
      // Ohne Schema gehört die Anleitung wieder in den Ordner; die Regeldatei der angedockten Sammlung kommt weg (gesichert)
      const regel = anleitungPfad(neu, ort.art, p)
      const { [ort.art]: _, ...rest } = neu.schemata ?? {}
      neu = { ...neu }
      if (Object.keys(rest).length) neu.schemata = rest
      else delete neu.schemata
      schreiben(schritt, `${p}/${ANLEITUNG}`, anleitung(ort.art, regeln, neu))
      if (regel !== `${p}/${ANLEITUNG}`) {
        if (leseDatei(root, regel) !== null) aktionen.push({ schritt, art: 'sichern', pfad: regel, nach: sicherungsPfad(root, regel) }, { schritt, art: 'loeschen', pfad: regel })
        for (const alt of [`${PROBE}/${regel}`, aenderungenPfad(regel)]) if (existsSync(join(root, ...alt.split('/')))) aktionen.push({ schritt, art: 'entfernen', pfad: alt })
      }
      const readme = `${p}/${UEBERSICHT}`
      const alteUebersicht = leseDatei(root, readme)
      if (alteUebersicht !== null && !alteUebersicht.includes(ERZEUGT)) aktionen.push({ schritt, art: 'loeschen', pfad: readme })
      const probeOrt = { art: ort.art, ordner: probe }
      const text = renderUebersicht(ort.art, probeOrt, leseEintraege(root, [probeOrt]).filter(e => eintraege.includes(`${e.name}.md`)), regeln, { mermaid: Boolean(neu.uebersicht?.mermaid) })
      aktionen.push({ schritt, art: alteUebersicht === null ? 'anlegen' : 'ersetzen', pfad: readme, inhalt: text, uebersicht: ort.art })
      const anleitungListe = posix.basename(aenderungenPfad(ANLEITUNG))
      aktionen.push(...entfernenAus(schritt, probe, probeVoll, [...eintraege, UEBERFUEHREN, ANLEITUNG, anleitungListe]))
      continue
    }
    const liste = leseDatei(root, aenderungenPfad(p))
    for (const z of zusammenAus(liste ?? '')) {
      if (!menge.has(z)) throw new Error(`${schritt}: gehört mit ${z} zusammen; beide im selben Lauf übernehmen`)
    }
    if (!echteDatei(probeVoll)) throw new Error(`${schritt}: ${probe} ist keine Datei`)
    if (leseDatei(root, p) !== null) aktionen.push({ schritt, art: 'sichern', pfad: p, nach: sicherungsPfad(root, p) })
    schreiben(schritt, p, readFileSync(probeVoll, 'utf8'))
    aktionen.push({ schritt, art: 'entfernen', pfad: probe })
    if (liste !== null) aktionen.push({ schritt, art: 'entfernen', pfad: aenderungenPfad(p) })
    if (pluginPfade.has(p)) pluginDabei = true
  }
  if (pluginDabei && veraltetePluginDateien(root, neu, regeln).every(d => ersetzt.has(d.pfad))) {
    const { version: _, ...rest } = neu
    neu = { version: pluginVersion(), ...rest }
  }
  if (neu !== beschreibung) aktionen.push({ schritt: 'uebernehmen', art: 'ersetzen', pfad: DOKU_JSON, inhalt: `${JSON.stringify(neu, null, 2)}\n` })
  return { beschreibung: neu, aktionen }
}

/** Name der Zusammenfassung in der Probe einer überführten Sammlung; sie wird nicht übernommen. */
export const UEBERFUEHREN = 'UEBERFUEHREN.md'

/**
 * Kopf eines Eintrags im Schema des Plugins: eigene Zeilen bleiben, `status` wird über die Abbildung umgesetzt, fehlende
 * Felder des Plugins kommen ans Ende des Kopfs. Der Text ab dem Kopf bleibt byte-gleich. Ergebnis: { text, notiz } oder
 * null ohne Kopf.
 */
export function kopfUeberfuehren(text, art, schema, regeln) {
  const gelesen = parseKopf(text)
  if (!gelesen) return null
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const zeilen = text.split(eol)
  const kopfZeilen = zeilen.slice(1, gelesen.ende - 1)
  const k = gelesen.kopf
  const def = regeln.festhalten
  const klasse = statusKlasse(k.status, schema, regeln)
  const notiz = []
  if (klasse === null) notiz.push(`status ${k.status ?? '(fehlt)'} ohne Abbildung, gesetzt: offen`)
  const neu = kopfZeilen.map(z => (/^status:/.test(z) ? `status: ${klasse ?? 'offen'}` : z))
  const dazu = {}
  if (!('status' in k)) dazu.status = 'offen'
  // Ergebnis eines erledigten Eintrags über die Abschluss-Werte rückwärts
  let ergebnis = ''
  if (klasse === 'erledigt') {
    ergebnis = Object.entries(schema.abschluss ?? {}).find(([, felder]) => felder && felder.status === k.status)?.[0] ?? ''
    if (!ergebnis) notiz.push(`erledigt ohne Ergebnis (kein Abschluss-Wert für ${k.status})`)
  }
  const mitErgebnis = def.arten[art].ergebnis !== null
  const standard = { titel: '', datum: '', bezug: '[]', wichtigkeit: 'normal', ergebnis, 'erledigt-durch': ergebnis && /^##\s+Ergebnis\s*$/m.test(text) ? 'text' : '' }
  for (const f of [...def.felder, ...(mitErgebnis ? ['ergebnis', 'erledigt-durch'] : [])]) if (!(f in k) && !(f in dazu)) dazu[f] = standard[f] ?? ''
  if (ergebnis && !standard['erledigt-durch'] && !('erledigt-durch' in k)) notiz.push('erledigt-durch leer')
  for (const f of ['titel', 'datum']) if (!(f in k)) notiz.push(`${f} fehlt`)
  const kopf = [...neu, ...Object.entries(dazu).map(([f, w]) => `${f}: ${w}`.trimEnd())]
  return { text: ['---', ...kopf, ...zeilen.slice(gelesen.ende - 1)].join(eol), notiz }
}

/** Aktionen für `ueberfuehren:<art>`: alle Einträge im Schema des Plugins als Probe, dazu UEBERFUEHREN.md. */
function planeUeberfuehren(root, art, beschreibung, regeln) {
  const schema = schemaVon(beschreibung, art)
  if (!regeln.festhalten.arten[art]) throw new Error(`ueberfuehren: unbekannte Art „${art}“`)
  if (!schema) throw new Error(`ueberfuehren:${art}: keine angedockte Sammlung (schemata.${art} fehlt)`)
  const ort = festhaltenOrte(beschreibung, regeln).find(o => o.art === art)
  if (!ort) throw new Error(`ueberfuehren:${art}: kein Festhalten-Ort`)
  const ziel = `${PRIVAT}/probe/${ort.ordner}`
  // Frühere Überführung weg (auch Einträge, die es im Ordner nicht mehr gibt); eine wartende Probe der Anleitung bleibt
  const aktionen = []
  const zielVoll = join(root, ...ziel.split('/'))
  if (existsSync(join(zielVoll, UEBERFUEHREN))) {
    for (const name of [...ueberfuehrteEintraege(zielVoll), UEBERFUEHREN]) aktionen.push({ schritt: `ueberfuehren:${art}`, art: 'entfernen', pfad: `${ziel}/${name}` })
  }
  const vorab = aktionen.length
  const zaehlung = new Map()
  const beispiele = []
  const offenGeblieben = []
  const ohneKopf = []
  for (const e of leseEintraege(root, [ort])) {
    const u = kopfUeberfuehren(e.text, art, schema, regeln)
    if (u === null) {
      ohneKopf.push(e.name)
      continue
    }
    const von = String(e.kopf.status ?? '(fehlt)')
    zaehlung.set(von, (zaehlung.get(von) ?? 0) + 1)
    if (u.notiz.length) offenGeblieben.push(`${e.name}: ${u.notiz.join('; ')}`)
    if (beispiele.length < 5) beispiele.push({ name: e.name, vorher: e.text.split(/\r?\n/).slice(0, (parseKopf(e.text)?.ende ?? 1)), nachher: u.text.split(/\r?\n/).slice(0, (parseKopf(u.text)?.ende ?? 1)) })
    aktionen.push({ schritt: `ueberfuehren:${art}`, art: 'probe', pfad: `${ziel}/${e.name}.md`, inhalt: u.text })
  }
  const anzahl = aktionen.length - vorab
  const block = z => ['```yaml', ...z, '```'].join('\n')
  const text = [
    `# Überführen: ${ort.ordner}`,
    '',
    `Probe: ${anzahl} Einträge mit Kopf im Schema des Plugins. Nur der Kopf ändert sich, der Text bleibt. Übernehmen mit dem Schritt \`uebernehmen:${ort.ordner}\`: die Originale kommen nach \`${PRIVAT}/sicherung/${ort.ordner}/\`, \`schemata.${art}\` entfällt, die Übersicht wird erzeugt.`,
    '',
    '## Zählung',
    '',
    `- Überführt: ${anzahl}; ohne Kopf, nicht überführt: ${ohneKopf.length ? ohneKopf.join(', ') : 'keine'}.`,
    ...[...zaehlung].map(([von, n]) => `- \`status: ${von}\` → \`${statusKlasse(von, schema, regeln) ?? 'offen'}\`: ${n}`),
    `- Danach noch zu ergänzen:${offenGeblieben.length ? '' : ' nichts'}`,
    ...offenGeblieben.map(z => `  - ${z}`),
    '',
    '## Beispiele',
    ...beispiele.flatMap(b => ['', `### ${b.name}`, '', 'Vorher:', '', block(b.vorher), '', 'Nachher:', '', block(b.nachher)]),
    '',
  ].join('\n')
  aktionen.push({ schritt: `ueberfuehren:${art}`, art: 'probe', pfad: `${ziel}/${UEBERFUEHREN}`, inhalt: text })
  return aktionen
}

function schreibeDatei(root, pfad, inhalt) {
  const ziel = sichererPfad(root, pfad)
  if (ziel === null) throw new Error(`${pfad} liegt außerhalb des Projekts oder ist ein Symlink; nicht geschrieben`)
  mkdirSync(dirname(ziel), { recursive: true })
  writeFileSync(ziel, inhalt)
}

/** Führt einen Plan aus. */
export function fuehreAus(root, plan, regeln = ladeRegeln()) {
  for (const a of plan.aktionen) {
    if (a.art === 'git-init') {
      const r = spawnSync('git', ['init', '-b', 'main'], { cwd: root, encoding: 'utf8' })
      if (r.status !== 0) throw new Error(`git init: ${r.stderr.trim()}`)
    } else if (a.art === 'verschieben') {
      const von = sichererPfad(root, a.pfad)
      const nach = sichererPfad(root, a.nach)
      if (von === null || nach === null) throw new Error(`verschieben ${a.pfad}: außerhalb des Projekts`)
      mkdirSync(dirname(nach), { recursive: true })
      renameSync(von, nach)
      if (a.inhalt !== null) writeFileSync(nach, a.inhalt)
    } else if (a.art === 'leeren' || a.art === 'entfernen') {
      if (!a.pfad.startsWith(`${PRIVAT}/`)) throw new Error(`${a.pfad}: nicht im privaten Ordner`)
      const ziel = privatPfad(root, a.pfad.slice(PRIVAT.length + 1))
      if (ziel === null) throw new Error(`${DOKU_JSON} fehlt; ${a.pfad} nicht entfernt`)
      rmSync(ziel, { recursive: true, force: true })
    } else if (a.art === 'sichern') {
      const von = sichererPfad(root, a.pfad)
      if (von === null) throw new Error(`${a.pfad} liegt außerhalb des Projekts oder ist ein Symlink; nicht gesichert`)
      const nach = privatPfad(root, a.nach.slice(PRIVAT.length + 1))
      if (nach === null) throw new Error(`${DOKU_JSON} fehlt; ${a.pfad} nicht gesichert`)
      mkdirSync(dirname(nach), { recursive: true })
      copyFileSync(von, nach, constants.COPYFILE_EXCL)
    } else if (a.art === 'loeschen') {
      const ziel = sichererPfad(root, a.pfad)
      if (ziel === null) throw new Error(`${a.pfad} liegt außerhalb des Projekts oder ist ein Symlink; nicht gelöscht`)
      rmSync(ziel, { force: true })
    } else if (a.art === 'probe') {
      if (schreibePrivat(root, a.pfad.slice(PRIVAT.length + 1), a.inhalt) === null) throw new Error(`${DOKU_JSON} fehlt; ${a.pfad} nicht geschrieben`)
    } else if (a.uebersicht) {
      schreibeUebersicht(root, a.uebersicht, { regeln, beschreibung: plan.beschreibung })
    } else if (a.art === 'anlegen' || a.art === 'ersetzen' || a.art === 'anhaengen' || a.art === 'links') {
      schreibeDatei(root, a.pfad, a.inhalt)
    }
  }
}

const WORT = { anlegen: 'anlegen', ersetzen: 'ersetzen', anhaengen: 'anhängen', unveraendert: 'unverändert', uebersprungen: 'übersprungen', verschieben: 'verschieben', links: 'Links', 'git-init': 'git init', probe: 'Probe', verfasser: 'Verfasser', leeren: 'leeren', entfernen: 'entfernen', sichern: 'sichern', loeschen: 'löschen' }

/** Bericht über einen Plan; im Probelauf mit den Inhalten. */
export function berichtText(aktionen, probelauf) {
  const zeilen = []
  for (const a of aktionen) {
    let z = `${WORT[a.art].padEnd(12)} ${a.pfad}`
    if (a.art === 'verschieben' || a.art === 'sichern') z += ` → ${a.nach}`
    if (a.art === 'git-init') z = `${WORT[a.art].padEnd(12)} -b main`
    if (a.art === 'links') z += ' (Links auf verschobene Dateien angepasst)'
    if (a.grund) z += ` (${a.grund})`
    zeilen.push(z)
    if (!probelauf) continue
    if (a.art === 'anhaengen') zeilen.push(...a.zusatz.map(x => `  + ${x}`))
    else if ((a.art === 'anlegen' || a.art === 'ersetzen') && a.inhalt) zeilen.push(...a.inhalt.replace(/\n$/, '').split('\n').map(x => `  │ ${x}`))
  }
  const geschrieben = aktionen.filter(a => !['unveraendert', 'uebersprungen'].includes(a.art)).length
  if (aktionen.length === 0) zeilen.push('Keine Schritte zugestimmt; nichts geschrieben.')
  else zeilen.push('', probelauf ? `Probelauf: ${geschrieben} Änderungen geplant, nichts geschrieben.` : `${geschrieben} Änderungen geschrieben.`)
  return zeilen.join('\n')
}

const ZUSTAND = { verfasser: 'fehlt', anlegen: 'fehlt', anhaengen: 'fehlt', 'git-init': 'fehlt', unveraendert: 'vorhanden', ersetzen: 'veraltet', probe: 'veraltet', uebersprungen: 'eigener Inhalt' }

/** Steuerdateien, die ein Projekt nicht „nicht leer“ machen. */
const STEUERDATEIEN = new Set(['.git', '.gitignore', '.gitattributes'])
/** Im Ordner .claude erlaubt: was Claude Code selbst anlegt. */
const CLAUDE_EIGENE = new Set(['settings.local.json'])

/**
 * Leer heißt: außer Steuerdateien von Git (`.git`, `.gitignore`, `.gitattributes`) und `.claude/settings.local.json`
 * gibt es keine Datei und keinen Ordner. Jede andere Datei (auch `README.rst`, Code) macht das Projekt „mit Doku“,
 * damit erst erkundet wird.
 */
export function istLeer(root) {
  let namen
  try {
    namen = readdirSync(root)
  } catch {
    return true
  }
  for (const name of namen) {
    if (STEUERDATEIEN.has(name)) continue
    if (name === '.claude') {
      let innen
      try {
        innen = readdirSync(join(root, name))
      } catch {
        return false
      }
      if (innen.every(n => CLAUDE_EIGENE.has(n))) continue
    }
    return false
  }
  return true
}

/** Stand der Einrichtung: was es gibt und was fehlt, je Schritt mit Baustein. */
export function stand(root, regeln = ladeRegeln()) {
  const alt = ladeBeschreibung(root)
  const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).status === 0
  const leer = istLeer(root)
  const code = hatCode(root)
  const aktuelle = alt?.bausteine ?? grundausstattung(code)
  const ablage = alt?.ablage ?? 'teilen'
  const eintraege = []
  const sammeln = (bausteine, nurNeu) => {
    const schritte = schritteFuer(bausteine, { ablage, regeln })
    const { aktionen } = plane(root, { bausteine, schritte }, regeln)
    for (const a of aktionen) {
      if (a.liste) continue
      const baustein = a.schritt.startsWith('festhalten:') ? 'festhalten' : BAUSTEINE[a.schritt] ? a.schritt : null
      if (nurNeu && !(baustein && !aktuelle.includes(baustein))) continue
      eintraege.push({ schritt: a.schritt, baustein, gewaehlt: baustein === null || aktuelle.includes(baustein), pfad: a.pfad, zustand: ZUSTAND[a.art] ?? a.art })
    }
  }
  sammeln(aktuelle, false)
  sammeln(Object.keys(BAUSTEINE), true)
  return {
    eingerichtet: alt !== null,
    leer,
    code,
    repo,
    ablage,
    bausteine: aktuelle,
    changelog: { ...erkenneChangelog(root, alt?.changelog?.datei ?? findeChangelog(root) ?? 'CHANGELOG.md'), ...(alt?.changelog ? { schema: alt.changelog.schema, beschreibung: alt.changelog.beschreibung } : {}) },
    schritte: eintraege,
  }
}

/** Exit-Code von `--nachtragen`, wenn das Projekt nicht eingerichtet ist (keine .claude/doku.json): nichts geschrieben. */
export const NICHT_EINGERICHTET = 3

/**
 * Plan, der einen fehlenden Festhalten-Ort ohne Fragen nachträgt, mit der vorhandenen .claude/doku.json als Ausgangswert:
 * Steht der Ort schon in `festhalten`, nur der Schritt `festhalten:<art>` (Anleitung und Übersicht des Ordners); sonst
 * dazu `doku-json` sowie `karte` und `schreibregeln`, soweit es sie gibt, damit sie den Ort nennen (fehlt der Baustein
 * festhalten, kommt er dazu, mit `karte`). Andere Dateien bleiben unberührt. null, wenn .claude/doku.json fehlt.
 */
export function planeNachtrag(root, art, regeln = ladeRegeln()) {
  if (!regeln.festhalten.arten[art]) throw new Error(`Unbekannte Art zum Festhalten „${art}“ (${Object.keys(regeln.festhalten.arten).join(', ')})`)
  const alt = ladeBeschreibung(root)
  if (alt === null) return null
  const vorher = alt.bausteine ?? GRUNDAUSSTATTUNG
  const mit = vorher.includes('festhalten')
  const bausteine = mit ? vorher : [...vorher, 'festhalten']
  // Steht der Ort schon in der Beschreibung, nur der Ordner; sonst kommt er in die Beschreibung und in vorhandene Karte
  // und Schreibregeln (ohne den Baustein festhalten die Karte immer)
  const da = p => existsSync(join(root, ...p.split('/')))
  const schritte = mit && alt.festhalten?.[art] !== undefined
    ? [`festhalten:${art}`]
    : ['doku-json', ...(!mit || da(KARTE) ? ['karte'] : []), ...(bausteine.includes('schreibregeln') && da(SCHREIBREGELN) ? ['schreibregeln'] : []), `festhalten:${art}`]
  return plane(root, { bausteine, schritte }, regeln, { version: 'behalten' })
}

/** Nach einem schreibenden Lauf: Status-Seite neu, mit .claude/doku.json; ein Fehler dabei ändert das Ergebnis nicht. */
function nachSchreiben(root, regeln) {
  try {
    baueStatus(root, regeln)
  } catch (e) {
    console.error(`einrichten: Status-Seite nicht erneuert: ${e instanceof Error ? e.message : e}`)
  }
}

function main(argv) {
  const wert = name => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const root = resolve(wert('--root') ?? process.cwd())
  try {
    const regeln = ladeRegeln()
    if (argv.includes('--stand')) {
      console.log(JSON.stringify(stand(root, regeln), null, 2))
      return 0
    }
    if (argv.includes('--probe')) {
      const { dateien, aenderungen } = leseBloecke(readFileSync(0, 'utf8'))
      const pfade = dateien.map(d => imProjekt(root, d.pfad, 'probe'))
      for (const p of pfade) if (p === PRIVAT || p.startsWith(`${PRIVAT}/`)) throw new Error(`probe: „${p}“ liegt im privaten Ordner`)
      for (const p of pfade) if (istDokuJson(p)) throw new Error(`probe: ${DOKU_JSON} kommt nie als Probe`)
      if (ladeBeschreibung(root) === null) {
        console.error(`einrichten: ${DOKU_JSON} fehlt, das Projekt ist nicht eingerichtet; nichts geschrieben`)
        return NICHT_EINGERICHTET
      }
      const aktionen = dateien.map((d, i) => ({ schritt: 'probe', art: 'probe', pfad: `${PROBE}/${pfade[i]}`, inhalt: d.inhalt }))
      aktionen.push({ schritt: 'probe', art: 'probe', pfad: aenderungenPfad(pfade[0]), inhalt: aenderungenText(pfade, aenderungen) })
      fuehreAus(root, { beschreibung: ladeBeschreibung(root), aktionen }, regeln)
      nachSchreiben(root, regeln)
      console.log(berichtText(aktionen, false))
      return 0
    }
    if (argv.includes('--erkundung')) {
      const quelle = wert('--erkundung') ?? '-'
      const text = readFileSync(quelle === '-' ? 0 : quelle, 'utf8')
      const tag = new Date().toISOString().slice(0, 10)
      if (schreibePrivat(root, 'erkundung.md', `# Erkundung der Doku (${tag})\n\n${text.replace(/\s+$/, '')}\n`) === null) {
        console.error(`einrichten: ${DOKU_JSON} fehlt, das Projekt ist nicht eingerichtet; Erkundung nicht geschrieben`)
        return NICHT_EINGERICHTET
      }
      console.log(`${PRIVAT}/erkundung.md geschrieben`)
      return 0
    }
    const art = wert('--nachtragen')
    if (argv.includes('--nachtragen')) {
      if (!art) throw new Error('--nachtragen braucht eine Art (idee, bug, todo)')
      const plan = planeNachtrag(root, art, regeln)
      if (plan === null) {
        console.error(`einrichten: ${DOKU_JSON} fehlt, das Projekt ist nicht eingerichtet; nichts geschrieben`)
        return NICHT_EINGERICHTET
      }
      const probelauf = argv.includes('--dry-run')
      if (!probelauf) {
        fuehreAus(root, plan, regeln)
        nachSchreiben(root, regeln)
      }
      console.log(berichtText(plan.aktionen, probelauf))
      return 0
    }
    const quelle = wert('--antworten')
    if (!quelle) {
      console.error('einrichten: --antworten <datei|-> oder --stand angeben')
      return 1
    }
    const antworten = JSON.parse(readFileSync(quelle === '-' ? 0 : quelle, 'utf8'))
    const plan = plane(root, antworten, regeln)
    const probelauf = argv.includes('--dry-run')
    if (!probelauf) {
      fuehreAus(root, plan, regeln)
      nachSchreiben(root, regeln)
    }
    console.log(berichtText(plan.aktionen, probelauf))
    return 0
  } catch (e) {
    console.error(`einrichten: ${e instanceof Error ? e.message : e}`)
    return 1
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
