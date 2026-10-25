// Einrichtung der Doku eines Projekts: führt nur die Schritte aus, denen der Nutzer zugestimmt hat. Das Modell fragt,
// dieses Skript schreibt. Aufruf:
//   node einrichten.mjs --root <projekt> --stand                      JSON: eingerichtet, leer, Repo, Changelog, Schritte mit Zustand
//   node einrichten.mjs --root <projekt> --antworten <datei|-> [--dry-run]
//   node einrichten.mjs --root <projekt> --nachtragen <art> [--dry-run]   fehlenden Festhalten-Ort ohne Fragen anlegen (planeNachtrag);
//                                                                         Exit 3 ohne .claude/doku.json, dann nichts geschrieben
// Die Antworten (JSON, `-` liest stdin) beschreibt `plane`. Eine leere Liste `schritte` schreibt nichts, auch nicht
// .claude/doku.json. Eine vorhandene Datei wird nur ersetzt, wenn ihr Schritt `ueberarbeiten:<pfad>` zugestimmt ist; ausgenommen
// sind Dateien des Plugins (Doku-Beschreibung, Karte, Schreibregeln, erzeugte Übersicht). Erst wird alles geplant und geprüft,
// dann geschrieben; ein Fehler im Plan schreibt nichts. Geschrieben wird nie außerhalb des Projekts.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ANLEITUNG, DOKU_JSON, HIER, UEBERSICHT, festhaltenOrte, gitTeil, imGitOrdner, innerhalb, ladeBeschreibung, ladeRegeln, leseEintraege, sichererPfad } from './gemeinsam.mjs'
import { markdownDateien } from './pruefer.mjs'
import { renderUebersicht, schreibeUebersicht } from './uebersicht.mjs'

const VORLAGEN = join(HIER, '..', 'vorlagen')
export const KARTE = '.claude/rules/codecycle-doku.md'
export const SCHREIBREGELN = '.claude/rules/codecycle-doku-schreiben.md'
/** Erkennungszeichen einer erzeugten Übersicht (siehe uebersicht.mjs). */
const ERZEUGT = 'Erzeugt aus den Köpfen der Einträge'

/** Bausteine mit Grundausstattung (grund) und einer Zeile Erklärung; Prüfer und Hook laufen, sobald .claude/doku.json da ist. */
export const BAUSTEINE = {
  readme: { grund: true, erklaerung: 'Einstieg für Menschen: was, Installation, Benutzung.' },
  'claude-md': { grund: true, erklaerung: 'Regeln, die jede Sitzung braucht, mit Verweis auf die Karte der Doku.' },
  changelog: { grund: true, erklaerung: 'Änderungen je Version; ein vorhandenes Schema wird erkannt und beschrieben.' },
  schreibregeln: { grund: true, erklaerung: 'Regeldatei mit Arten und Schreibregeln; lädt nur beim Arbeiten an Markdown.' },
  festhalten: { grund: true, erklaerung: 'Feste Orte für Ideen, Bugs und To-dos mit Gerüst, Feldern und erzeugter Übersicht.' },
  chronik: { grund: true, erklaerung: 'Was geschah: je Eintrag Datum, was, ein Halbsatz Warum, Verweis.' },
  entscheidungen: { grund: true, erklaerung: 'Entscheidungen mit allen Alternativen und der Antwort im Wortlaut.' },
  wegweiser: { grund: false, erklaerung: 'Wegweiser durch die Doku-Dateien; lohnt ab etwa zehn Dateien.' },
  berichte: { grund: false, erklaerung: 'Ordner für einmalige Befunde, nach dem Schreiben eingefroren.' },
  prompts: { grund: false, erklaerung: 'Ordner für Aufträge an Sitzungen oder Agenten, wiederverwendbar.' },
  mermaid: { grund: false, erklaerung: 'Verknüpfte Einträge in der Übersicht zusätzlich als Diagramm.' },
}
export const GRUNDAUSSTATTUNG = Object.keys(BAUSTEINE).filter(b => BAUSTEINE[b].grund)

export const STANDARD_ORTE = {
  readme: 'README.md',
  'claude-md': 'CLAUDE.md',
  chronik: 'docs/verlauf.md',
  entscheidungen: 'docs/entscheidungen.md',
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
  const s = ['doku-json', 'karte', 'verweis']
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

/**
 * Doku-Beschreibung (.claude/doku.json) aus Antworten und vorhandener Beschreibung; Antworten gehen vor.
 * Form: bausteine, ablage, orte, zuordnung [{ pfad, art }], festhalten { idee, bug, todo }, changelog { datei, schema,
 * beschreibung }, uebersicht { mermaid }.
 */
export function beschreibungAus(root, antworten, alt, regeln) {
  const bausteine = [...new Set(antworten.bausteine ?? alt?.bausteine ?? GRUNDAUSSTATTUNG)]
  for (const b of bausteine) if (!BAUSTEINE[b]) throw new Error(`Unbekannter Baustein „${b}“ (${Object.keys(BAUSTEINE).join(', ')})`)
  const ablage = antworten.ablage ?? alt?.ablage ?? 'teilen'
  if (!['teilen', 'lokal'].includes(ablage)) throw new Error(`ablage „${ablage}“ ist weder teilen noch lokal`)

  const alleOrte = { ...STANDARD_ORTE, ...alt?.orte, ...antworten.orte }
  const orte = {}
  for (const [name, pfad] of Object.entries(alleOrte)) {
    if (!(name in STANDARD_ORTE)) throw new Error(`Unbekannter Ort „${name}“`)
    if (name === 'readme' || name === 'claude-md' || bausteine.includes(name)) orte[name] = imProjekt(root, pfad, `Ort ${name}`)
  }

  const datei = imProjekt(root, antworten.changelog?.datei ?? alt?.changelog?.datei ?? findeChangelog(root) ?? 'CHANGELOG.md', 'changelog.datei')
  const { vorhanden: _, ...erkannt } = erkenneChangelog(root, datei)
  const changelog = { ...erkannt, ...(alt?.changelog?.datei === datei ? alt.changelog : {}), ...antworten.changelog, datei }
  if (antworten.changelog?.schema && !antworten.changelog.beschreibung && antworten.changelog.schema !== erkannt.schema) changelog.beschreibung = SCHEMA_BESCHREIBUNG[changelog.schema]
  if (!SCHEMATA.includes(changelog.schema)) throw new Error(`changelog.schema „${changelog.schema}“ unbekannt (${SCHEMATA.join(', ')})`)

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
  if (orte.berichte) dazu(`${orte.berichte}/**`, 'bericht')
  if (orte.prompts) dazu(`${orte.prompts}/**`, 'prompt')
  for (const z of [...(alt?.zuordnung ?? []), ...(antworten.zuordnung ?? [])]) dazu(String(z.pfad), String(z.art))

  const beschreibung = { bausteine, ablage, orte, zuordnung }
  if (bausteine.includes('festhalten')) {
    const festhalten = {}
    for (const [art, ordner] of Object.entries({ ...STANDARD_FESTHALTEN, ...alt?.festhalten, ...antworten.festhalten })) {
      if (!regeln.festhalten.arten[art]) throw new Error(`Unbekannte Art zum Festhalten „${art}“`)
      festhalten[art] = imProjekt(root, ordner, `Festhalten-Ort ${art}`)
    }
    beschreibung.festhalten = festhalten
  }
  beschreibung.changelog = changelog
  beschreibung.uebersicht = { mermaid: bausteine.includes('mermaid') }
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
    zeilen.push(`- Festhalten, je Eintrag eine Datei mit Kopf und Gerüst aus der ${code(ANLEITUNG)} des Ordners: ${orteText}.`)
    zeilen.push(`- Vor einem neuen Eintrag die ${code(UEBERSICHT)} des Ordners lesen: erzeugte Übersicht, offen und wichtig zuerst.`)
  }
  zeilen.push(`- Regeln für jede Sitzung: ${code(orte['claude-md'])}${bausteine.includes('schreibregeln') ? `; Arten und Schreibregeln: ${code(SCHREIBREGELN)}` : ''}.`)
  zeilen.push(`- Änderungen je Version: ${code(changelog.datei)}, ${changelog.schema === 'erzeugt' ? 'erzeugt; nicht von Hand ändern' : changelog.beschreibung}.`)
  const verlauf = []
  if (orte.chronik) verlauf.push(`Chronik ${code(orte.chronik)}`)
  if (orte.entscheidungen) verlauf.push(`Entscheidungen mit Alternativen und Wortlaut ${code(orte.entscheidungen)}`)
  if (verlauf.length) zeilen.push(`- ${verlauf.join('; ')}.`)
  const weitere = [`für Menschen ${code(orte.readme)}`]
  if (orte.wegweiser) weitere.push(`Wegweiser ${code(orte.wegweiser)}`)
  if (orte.berichte) weitere.push(`Berichte ${code(`${orte.berichte}/`)}`)
  if (orte.prompts) weitere.push(`Prompts ${code(`${orte.prompts}/`)}`)
  const bekannt = new Set(['**/CLAUDE.md', '.claude/rules/**', ...Object.values(orte), `${orte.berichte}/**`, `${orte.prompts}/**`])
  for (const z of beschreibung.zuordnung) if (!bekannt.has(z.pfad)) weitere.push(`${code(z.pfad)} (${regeln.arten[z.art].titel.split(':')[0]})`)
  zeilen.push(`- Weitere Doku: ${weitere.join(', ')}.`)
  return vorlage('karte', { zeilen: zeilen.join('\n') }, bausteine)
}

/** Tabelle der Arten mit den Pfaden dieses Projekts. */
function artenTabelle(beschreibung, regeln) {
  const pfade = new Map()
  const dazu = (art, p) => pfade.set(art, [...(pfade.get(art) ?? []), p])
  for (const z of beschreibung.zuordnung) dazu(z.art, z.pfad)
  const c = beschreibung.changelog
  if (c.schema !== 'erzeugt') dazu(c.schema === 'eigenes' ? 'changelog-eigen' : 'chronik', c.datei)
  for (const o of Object.values(beschreibung.festhalten ?? {})) dazu('eintrag', `${o}/`)
  return Object.entries(regeln.arten)
    .filter(([art]) => pfade.has(art))
    .map(([art, def]) => {
      const [name, ...rest] = def.titel.split(': ')
      return `| ${name} | ${pfade.get(art).map(code).join(', ')} | ${rest.join(': ')} |`
    })
    .join('\n')
}

/** Anleitung eines Festhalten-Ordners; Felder, Werte und Abschnitte aus regeln.json. */
export function anleitung(art, regeln) {
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
    titel: artDef.titel,
    kopf,
    abschnitte,
    status: liste(def.status),
    wichtigkeit: liste(def.wichtigkeit),
    ergebnis,
  }, [])
}

function wegweiserZeilen(beschreibung, regeln) {
  const { orte } = beschreibung
  const z = []
  if (orte.chronik) z.push(`| ${code(orte.chronik)} | Chronik: was geschah | wenn die Geschichte einer Änderung zählt |`)
  if (orte.entscheidungen) z.push(`| ${code(orte.entscheidungen)} | Entscheidungen mit Alternativen und Wortlaut | vor einer Änderung an Entschiedenem |`)
  for (const [art, o] of Object.entries(beschreibung.festhalten ?? {})) z.push(`| ${code(`${o}/`)} | ${regeln.festhalten.arten[art].titel} festhalten | Übersicht ${code(UEBERSICHT)} vor einem neuen Eintrag |`)
  if (orte.berichte) z.push(`| ${code(`${orte.berichte}/`)} | Berichte: einmalige Befunde | wenn ein Befund gebraucht wird |`)
  if (orte.prompts) z.push(`| ${code(`${orte.prompts}/`)} | Prompts: Aufträge für Sitzungen | vor einem gleichen Auftrag |`)
  return z.join('\n')
}

/** Text je Gerüst-Schritt. */
function geruest(schritt, beschreibung, regeln, root) {
  const b = beschreibung.bausteine
  const werte = {
    projekt: basename(resolve(root)),
    changelog: beschreibung.changelog.datei,
    changelogRegel: changelogSatz(beschreibung.changelog),
    wegweiser: beschreibung.orte.wegweiser ?? '',
    chronik: beschreibung.orte.chronik ?? '',
    entscheidungen: beschreibung.orte.entscheidungen ?? '',
    verweis: verweisZeile(beschreibung),
  }
  switch (schritt) {
    case 'readme': return vorlage('readme', werte, b)
    case 'claude-md': return vorlage('claude-md', werte, b)
    case 'changelog': return vorlage('changelog', werte, b)
    case 'chronik': return vorlage('verlauf', werte, b)
    case 'entscheidungen': return vorlage('entscheidungen', werte, b)
    case 'wegweiser': return vorlage('wegweiser', { zeilen: wegweiserZeilen(beschreibung, regeln) }, b)
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
 *   schritte      Pflicht: zugestimmte Schritte (siehe `schritteFuer`, dazu `git-init`, `verschieben:<von>`, `ueberarbeiten:<pfad>`)
 *   bausteine     gewählte Bausteine (Standard: Grundausstattung oder die aus .claude/doku.json)
 *   ablage        teilen | lokal
 *   orte, festhalten, zuordnung [{ pfad, art }], changelog { datei, schema, beschreibung }   abweichend vom Standard
 *   verschieben   [{ von, nach }]
 *   inhalte       { pfad: Text }: überarbeiteter Inhalt einer vorhandenen Datei, nur mit `ueberarbeiten:<pfad>`
 * Ergebnis: { beschreibung, aktionen: [{ schritt, art, pfad, inhalt?, nach?, zusatz?, grund?, uebersicht? }] }
 */
export function plane(root, antworten, regeln = ladeRegeln()) {
  if (!antworten || !Array.isArray(antworten.schritte)) throw new Error('Antworten ohne Liste „schritte“')
  const alt = ladeBeschreibung(root)
  const beschreibung = beschreibungAus(root, antworten, alt, regeln)
  const zugestimmt = new Set(antworten.schritte.map(String))
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
    if (bekannt.has(s) || s.startsWith('ueberarbeiten:')) continue
    if (s.startsWith('verschieben:') && [...ziehen.keys()].some(v => s === `verschieben:${v}`)) continue
    if (s.startsWith('verschieben:')) throw new Error(`Schritt „${s}“ ohne passenden Eintrag in „verschieben“`)
    throw new Error(`Unbekannter Schritt „${s}“`)
  }

  const virt = new Map()
  const lies = p => (virt.has(p) ? virt.get(p) : leseDatei(root, p))
  const aktionen = []
  const erledigt = new Set()

  /** Datei schreiben; vorhanden nur ersetzen, wenn sie dem Plugin gehört (`eigen`) oder ihr Überarbeiten zugestimmt ist. */
  const datei = (schritt, pfad, inhalt, { eigen = () => false, uebersicht } = {}) => {
    const p = imProjekt(root, pfad, schritt)
    const ueber = ueberarbeiten.has(p)
    if (ueber) erledigt.add(p)
    if (ueber && inhalte.has(p)) inhalt = inhalte.get(p)
    const vorher = lies(p)
    let art = 'anlegen'
    let grund
    if (vorher !== null && vorher === inhalt) art = 'unveraendert'
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
  for (const s of ['claude-md', 'readme', 'changelog', 'chronik', 'entscheidungen', 'wegweiser', 'berichte', 'prompts']) {
    if (!zugestimmt.has(s)) continue
    if (s !== 'claude-md' && s !== 'readme' && s !== 'changelog' && !beschreibung.bausteine.includes(s)) throw new Error(`Schritt „${s}“: Baustein ${s} ist nicht gewählt`)
    const ziel = geruestZiel(s, beschreibung)
    if (s === 'changelog' && beschreibung.changelog.schema === 'erzeugt') {
      if (ueberarbeiten.has(ziel)) throw new Error(`${ziel} ist erzeugt und wird nicht überarbeitet`)
      aktionen.push({ schritt: s, art: 'uebersprungen', pfad: ziel, grund: 'erzeugt; wird nicht angelegt oder geändert' })
      continue
    }
    datei(s, ziel, geruest(s, beschreibung, regeln, root))
  }
  if (zugestimmt.has('verweis')) {
    const ziel = beschreibung.orte['claude-md']
    const vorher = lies(ziel)
    if (vorher === null) datei('verweis', ziel, `# CLAUDE.md\n\n${verweisZeile(beschreibung)}\n`)
    else anhaengen('verweis', ziel, vorher.includes(KARTE) ? [] : [verweisZeile(beschreibung)])
  }
  if (zugestimmt.has('karte')) datei('karte', KARTE, karte(beschreibung, regeln), { eigen: () => true })
  if (zugestimmt.has('schreibregeln')) datei('schreibregeln', SCHREIBREGELN, vorlage('schreibregeln', { arten: artenTabelle(beschreibung, regeln) }, beschreibung.bausteine), { eigen: () => true })

  const orte = festhaltenOrte(beschreibung, regeln)
  for (const art of festhaltenArten) {
    const s = `festhalten:${art}`
    if (!zugestimmt.has(s)) continue
    const ort = orte.find(o => o.art === art)
    if (!ort) throw new Error(`Schritt „${s}“: Baustein festhalten ist nicht gewählt`)
    datei(s, `${ort.ordner}/${ANLEITUNG}`, anleitung(art, regeln))
    const text = renderUebersicht(art, ort, leseEintraege(root, orte), regeln, { mermaid: beschreibung.uebersicht.mermaid })
    datei(s, `${ort.ordner}/${UEBERSICHT}`, text, { eigen: vorher => vorher.includes(ERZEUGT), uebersicht: art })
  }

  if (zugestimmt.has('gitignore')) {
    const { orte: o } = beschreibung
    const arbeit = beschreibung.ablage === 'lokal'
      ? [...Object.values(beschreibung.festhalten ?? {}).map(f => `/${f}/`), ...[o.chronik, o.entscheidungen].filter(Boolean).map(f => `/${f}`), ...[o.berichte, o.prompts].filter(Boolean).map(f => `/${f}/`)]
      : []
    const vorhanden = new Set((lies('.gitignore') ?? '').split(/\r?\n/).map(z => z.trim()))
    anhaengen('gitignore', '.gitignore', [...PERSOENLICH, ...arbeit].filter(e => !vorhanden.has(e) && !vorhanden.has(e.replace(/^\//, ''))))
  }

  for (const p of ueberarbeiten) {
    if (erledigt.has(p)) continue
    if (!inhalte.has(p)) throw new Error(`ueberarbeiten:${p} ohne Text in „inhalte“`)
    if (p === beschreibung.changelog.datei && beschreibung.changelog.schema === 'erzeugt') throw new Error(`${p} ist erzeugt und wird nicht überarbeitet`)
    if (lies(p) === null) throw new Error(`ueberarbeiten:${p}: Datei fehlt`)
    datei(`ueberarbeiten:${p}`, p, inhalte.get(p))
  }
  return { beschreibung, aktionen }
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
    } else if (a.uebersicht) {
      schreibeUebersicht(root, a.uebersicht, { regeln, beschreibung: plan.beschreibung })
    } else if (a.art === 'anlegen' || a.art === 'ersetzen' || a.art === 'anhaengen' || a.art === 'links') {
      schreibeDatei(root, a.pfad, a.inhalt)
    }
  }
}

const WORT = { anlegen: 'anlegen', ersetzen: 'ersetzen', anhaengen: 'anhängen', unveraendert: 'unverändert', uebersprungen: 'übersprungen', verschieben: 'verschieben', links: 'Links', 'git-init': 'git init' }

/** Bericht über einen Plan; im Probelauf mit den Inhalten. */
export function berichtText(aktionen, probelauf) {
  const zeilen = []
  for (const a of aktionen) {
    let z = `${WORT[a.art].padEnd(12)} ${a.pfad}`
    if (a.art === 'verschieben') z += ` → ${a.nach}`
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

const ZUSTAND = { anlegen: 'fehlt', anhaengen: 'fehlt', 'git-init': 'fehlt', unveraendert: 'vorhanden', ersetzen: 'veraltet', uebersprungen: 'eigener Inhalt' }

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
  const aktuelle = alt?.bausteine ?? GRUNDAUSSTATTUNG
  const ablage = alt?.ablage ?? 'teilen'
  const eintraege = []
  const sammeln = (bausteine, nurNeu) => {
    const schritte = schritteFuer(bausteine, { ablage, regeln })
    const { aktionen } = plane(root, { bausteine, schritte }, regeln)
    for (const a of aktionen) {
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
 * Ist der Baustein festhalten gewählt, nur der Schritt `festhalten:<art>` (Anleitung und Übersicht des Ordners); sonst
 * kommt der Baustein dazu, mit `doku-json` und `karte`, damit Beschreibung und Karte den Ort nennen. Andere Dateien bleiben
 * unberührt. null, wenn .claude/doku.json fehlt.
 */
export function planeNachtrag(root, art, regeln = ladeRegeln()) {
  if (!regeln.festhalten.arten[art]) throw new Error(`Unbekannte Art zum Festhalten „${art}“ (${Object.keys(regeln.festhalten.arten).join(', ')})`)
  const alt = ladeBeschreibung(root)
  if (alt === null) return null
  const vorher = alt.bausteine ?? GRUNDAUSSTATTUNG
  const mit = vorher.includes('festhalten')
  const bausteine = mit ? vorher : [...vorher, 'festhalten']
  const schritte = mit ? [`festhalten:${art}`] : ['doku-json', 'karte', `festhalten:${art}`]
  return plane(root, { bausteine, schritte }, regeln)
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
    const art = wert('--nachtragen')
    if (argv.includes('--nachtragen')) {
      if (!art) throw new Error('--nachtragen braucht eine Art (idee, bug, todo)')
      const plan = planeNachtrag(root, art, regeln)
      if (plan === null) {
        console.error(`einrichten: ${DOKU_JSON} fehlt, das Projekt ist nicht eingerichtet; nichts geschrieben`)
        return NICHT_EINGERICHTET
      }
      const probelauf = argv.includes('--dry-run')
      if (!probelauf) fuehreAus(root, plan, regeln)
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
    if (!probelauf) fuehreAus(root, plan, regeln)
    console.log(berichtText(plan.aktionen, probelauf))
    return 0
  } catch (e) {
    console.error(`einrichten: ${e instanceof Error ? e.message : e}`)
    return 1
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
