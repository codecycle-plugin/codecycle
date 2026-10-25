// Doku-Prüfer: prüft Markdown-Dateien eines Projekts nach ihrer Art und die Felder der Einträge zum Festhalten.
// Aufruf in der Projektwurzel:
//   node pruefer.mjs [Datei …]   ohne Dateien: alle Markdown-Dateien des Projekts; Ausgabe Datei:Zeile: [Art] Regel «Treffer»
//   --root <ordner>   Projektwurzel (Standard: aktueller Ordner)
//   --hook            für den Hook PostToolUse (Write|Edit): liest die Hook-Eingabe von stdin, prüft nur die geschriebene
//                     Datei, erneuert bei einem Eintrag die Übersicht des Ordners und gibt Treffer als additionalContext;
//                     ohne .claude/doku.json keine Ausgabe; Exit immer 0
// Zuordnung, Festhalten-Orte und Changelog aus .claude/doku.json; fehlt sie, gilt die Standard-Zuordnung aus regeln.json.
// Treffer der Textregeln sind Hinweise (`doku-ok` in der Zeile nimmt sie aus); Felder, tote Links und Lücken im
// Inhaltsverzeichnis sind scharf (Exit 1).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { festhaltenOrt, festhaltenOrte, ladeBeschreibung, ladeRegeln, leseEintraege, parseKopf, passt } from './gemeinsam.mjs'
import { schreibeUebersicht } from './uebersicht.mjs'

const AUSNAHME = 'doku-ok'
const KOMMENTAR_ZEILEN = 5
const SCHREIBREGELN = '.claude/rules/codecycle-doku-schreiben.md'

/**
 * Prüfkontext eines Projekts.
 * @param {string} root Projektwurzel
 * @param {{ regeln?: any, beschreibung?: any }} [optionen] zum Testen vorgeben
 */
export function kontext(root, optionen = {}) {
  const regeln = optionen.regeln ?? ladeRegeln()
  const beschreibung = 'beschreibung' in optionen ? optionen.beschreibung : ladeBeschreibung(root)
  const orte = festhaltenOrte(beschreibung, regeln)
  let eintraege
  return {
    root,
    regeln,
    beschreibung,
    orte,
    /** Einträge aller Festhalten-Orte, einmal gelesen. */
    eintraege: () => (eintraege ??= leseEintraege(root, orte)),
    gibt: pfad => existsSync(join(root, pfad)),
    lesen: pfad => lies(root, pfad),
    commit: commitPruefer(root),
  }
}

/** Prüft Commit-Hashes mit Git; ohne Git oder Repo ist jedes Format-gültige Hash bekannt (null). */
function commitPruefer(root) {
  let repo
  return hash => {
    repo ??= spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' }).status === 0
    if (!repo) return null
    return spawnSync('git', ['cat-file', '-e', `${hash}^{commit}`], { cwd: root }).status === 0
  }
}

function lies(root, datei) {
  try {
    const buf = readFileSync(join(root, datei))
    return buf.includes(0) ? null : buf.toString('utf8')
  } catch {
    return null
  }
}

/** Arten einer Datei (Pfad relativ zur Wurzel, mit `/`). */
export function artenVon(datei, text, ctx) {
  const ort = festhaltenOrt(datei, ctx.orte)
  if (ort?.rolle === 'eintrag') return ['eintrag']
  if (ort?.rolle === 'uebersicht') return []
  const changelog = ctx.beschreibung?.changelog
  if (changelog && changelog.datei === datei) {
    if (changelog.schema === 'erzeugt') return []
    if (changelog.schema === 'eigenes') return ['changelog-eigen']
    return ['chronik']
  }
  const zuordnung = ctx.beschreibung?.zuordnung ?? ctx.regeln.standardZuordnung
  const ausPfad = [...new Set(zuordnung.filter(z => passt(z.pfad, datei)).map(z => z.art))]
  const kopf = text.split(/\r?\n/, KOMMENTAR_ZEILEN).join('\n')
  const m = /<!--\s*doku:\s*([\w-]+)\s*-->/.exec(kopf)
  return m ? [m[1]] : ausPfad
}

function woerterRegex(woerter) {
  const alt = [...woerter].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
  return new RegExp(`(?<![\\p{L}\\d])(?:${alt.join('|')})(?![\\p{L}\\d])`, 'iu')
}

/** Ein Treffer der Zeile oder null. */
function trifft(regel, zeile, regeln) {
  if (regel.maxZeichen !== undefined) {
    // Gezählt wird, was man liest: Linkziele `](…)` zählen nicht mit.
    const laenge = zeile.replace(/\]\([^)]*\)/g, ']').length
    return laenge > regel.maxZeichen ? `${laenge} Zeichen` : null
  }
  const re = regel.woerter ? woerterRegex(regeln.woerter[regeln.sprache] ?? []) : new RegExp(regel.muster, regel.flags ?? '')
  return re.exec(zeile)?.[0] ?? null
}

/**
 * Prüft einen Dateiinhalt gegen die Textregeln der Arten. Treffer: { datei, zeile, art, regel, titel, treffer, scharf }.
 * `zeile` 0 steht für die ganze Datei.
 */
export function pruefeText(datei, text, arten, regeln) {
  const treffer = []
  const zeilen = text.split(/\r?\n/)
  if (zeilen[zeilen.length - 1] === '') zeilen.pop()
  for (const art of arten) {
    const def = regeln.arten[art]
    if (!def) {
      treffer.push({ datei, zeile: 0, art, regel: 'art', titel: 'Unbekannte Art', treffer: art, scharf: true })
      continue
    }
    if (def.maxZeilen !== undefined && zeilen.length > def.maxZeilen)
      treffer.push({ datei, zeile: 0, art, regel: 'max-zeilen', titel: `über ${def.maxZeilen} Zeilen`, treffer: `${zeilen.length} Zeilen`, scharf: false })
    zeilen.forEach((zeile, i) => {
      if (zeile.includes(AUSNAHME)) return
      for (const name of def.regeln) {
        const regel = regeln.regeln[name]
        if (!regel) throw new Error(`Unbekannte Regel „${name}“ in Art „${art}“`)
        const t = trifft(regel, zeile, regeln)
        if (t !== null) treffer.push({ datei, zeile: i + 1, art, regel: name, titel: regel.titel, treffer: t, scharf: false })
      }
    })
  }
  return treffer
}

/** Eine Zeile je Treffer: `Datei:Zeile: [Art] Titel «Treffer»`. */
export function formatiere(t) {
  return `${t.datei}${t.zeile ? `:${t.zeile}` : ''}: [${t.art}] ${t.titel} «${t.treffer}»`
}

/** Sprungmarke einer Überschrift wie bei GitHub: klein, ohne Satzzeichen, Leerzeichen → `-`. */
export function slug(ueberschrift) {
  const text = ueberschrift.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

/** Zeilen außerhalb von Code-Blöcken, mit Nummer; in `zeile` ist Inline-Code geleert, `roh` ist unverändert. */
function textZeilen(text) {
  const aus = []
  let imCode = false
  text.split(/\r?\n/).forEach((zeile, i) => {
    if (/^\s*(```|~~~)/.test(zeile)) {
      imCode = !imCode
      return
    }
    if (!imCode) aus.push({ nr: i + 1, roh: zeile, zeile: zeile.replace(/`[^`]*`/g, m => ' '.repeat(m.length)) })
  })
  return aus
}

/** Sprungmarken einer Markdown-Datei (Überschriften, Wiederholungen mit -1, -2 …; dazu `id`/`name` in HTML). */
export function anker(text) {
  const gesehen = new Map()
  const alle = new Set()
  for (const { zeile, roh } of textZeilen(text)) {
    const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(roh)
    if (h) {
      const s = slug(h[1] ?? '')
      const n = gesehen.get(s) ?? 0
      gesehen.set(s, n + 1)
      alle.add(n === 0 ? s : `${s}-${n}`)
    }
    for (const m of zeile.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) alle.add(m[1] ?? '')
  }
  return alle
}

const LINK = /\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g

/** Löst ein relatives Ziel auf: { pfad, marke } oder null bei externen Zielen. */
function zielAufloesen(datei, ziel) {
  if (ziel === '' || /^[a-z][a-z0-9+.-]*:/i.test(ziel)) return null
  const [pfadRoh = '', marke] = ziel.split('#')
  let roh = pfadRoh
  try {
    roh = decodeURIComponent(pfadRoh)
  } catch {
    // ungültige Kodierung: Pfad wie geschrieben prüfen
  }
  const pfad = roh === '' ? datei : posix.normalize(posix.join(posix.dirname(datei), roh)).replace(/\/$/, '')
  return { pfad, marke }
}

/** Grund, warum ein relatives Ziel nicht auflöst, oder null. */
function zielFehler(datei, text, ziel, ctx) {
  const z = zielAufloesen(datei, ziel)
  if (z === null) return null
  if (!ctx.gibt(z.pfad)) return 'Ziel fehlt'
  if (z.marke && z.pfad.endsWith('.md')) {
    const inhalt = z.pfad === datei ? text : ctx.lesen(z.pfad)
    let marke = z.marke
    try {
      marke = decodeURIComponent(z.marke)
    } catch {
      // wie geschrieben
    }
    if (inhalt !== null && !anker(inhalt).has(marke.toLowerCase())) return 'Sprungmarke fehlt'
  }
  return null
}

/** Tote relative Links einer Markdown-Datei: [{ nr, ziel, grund }]. Externe Ziele werden nicht geprüft. */
export function toteLinks(datei, text, ctx) {
  const tot = []
  for (const { nr, zeile } of textZeilen(text)) {
    for (const m of zeile.matchAll(LINK)) {
      const ziel = m[1] ?? ''
      const grund = zielFehler(datei, text, ziel, ctx)
      if (grund) tot.push({ nr, ziel, grund })
    }
  }
  return tot
}

/** Überschriften `##`, auf die kein Link `#…` in der Datei zeigt (Lücken im Inhaltsverzeichnis). */
export function inhaltsLuecken(text) {
  const zeilen = textZeilen(text)
  // Ungültige Kodierung (etwa `#100%`): die Marke wie geschrieben nehmen, nicht abbrechen
  const marke = m => {
    try {
      return decodeURIComponent(m)
    } catch {
      return m
    }
  }
  const verlinkt = new Set(zeilen.flatMap(({ zeile }) => [...zeile.matchAll(/\]\(#([^)\s]+)\)/g)].map(m => marke(m[1] ?? '').toLowerCase())))
  const fehlt = []
  for (const { nr, roh } of zeilen) {
    const h = /^##\s+(.*?)\s*#*\s*$/.exec(roh)
    if (h && !verlinkt.has(slug(h[1] ?? ''))) fehlt.push({ nr, ueberschrift: h[1] ?? '' })
  }
  return fehlt
}

const leer = w => w === undefined || w === '' || (Array.isArray(w) && w.length === 0)

/**
 * Prüft Kopf und Abschnitte eines Eintrags zum Festhalten. Fehlende oder widersprüchliche Felder sind scharf,
 * fehlende Abschnitte Hinweise.
 * @param {{ art: string, ordner: string, name: string }} ort
 */
export function pruefeEintrag(datei, text, ort, ctx) {
  const treffer = []
  const fund = (titel, wert, scharf = true, zeile = 0) => treffer.push({ datei, zeile, art: 'eintrag', regel: 'felder', titel, treffer: wert, scharf })
  const def = ctx.regeln.festhalten
  const artDef = def.arten[ort.art]
  const gelesen = parseKopf(text)
  if (!gelesen) {
    fund('Kopf fehlt (Felder zwischen zwei Zeilen „---“ am Anfang)', ort.name)
    return treffer
  }
  const k = gelesen.kopf
  for (const feld of def.felder) if (!(feld in k)) fund('Feld fehlt', feld)
  if ('titel' in k && leer(k.titel)) fund('Feld leer', 'titel')
  if ('datum' in k && !/^\d{4}-\d{2}-\d{2}$/.test(String(k.datum))) fund('datum nicht JJJJ-MM-TT', String(k.datum))
  if ('status' in k && !def.status.includes(k.status)) fund(`status ungültig (${def.status.join(', ')})`, String(k.status))
  if ('wichtigkeit' in k && !def.wichtigkeit.includes(k.wichtigkeit)) fund(`wichtigkeit ungültig (${def.wichtigkeit.join(', ')})`, String(k.wichtigkeit))
  if ('bezug' in k) {
    const bezug = Array.isArray(k.bezug) ? k.bezug : leer(k.bezug) ? [] : null
    if (bezug === null) fund('bezug ist keine Liste [name, …]', String(k.bezug))
    else {
      const namen = new Set(ctx.eintraege().map(e => e.name))
      for (const b of bezug) if (!namen.has(b)) fund('bezug zeigt auf keinen Eintrag', b)
    }
  }

  if (artDef.ergebnis === null) {
    if (!leer(k.ergebnis)) fund(`${ort.art} hat kein Feld ergebnis`, String(k.ergebnis))
    if (!leer(k['erledigt-durch'])) fund(`${ort.art} hat kein Feld erledigt-durch`, String(k['erledigt-durch']))
  } else {
    for (const feld of ['ergebnis', 'erledigt-durch']) if (!(feld in k)) fund('Feld fehlt (leer lassen, solange offen)', feld)
    const ergebnis = leer(k.ergebnis) ? '' : String(k.ergebnis)
    const durch = leer(k['erledigt-durch']) ? '' : String(k['erledigt-durch'])
    if (k.status === 'offen' && ergebnis !== '') fund('status offen, aber ergebnis gefüllt', ergebnis)
    if (k.status === 'erledigt' && ergebnis === '') fund('status erledigt, aber ergebnis leer', 'ergebnis')
    if (ergebnis !== '' && !artDef.ergebnis.includes(ergebnis)) fund(`ergebnis ungültig (${artDef.ergebnis.join(', ')})`, ergebnis)
    if (ergebnis !== '' && durch === '') fund('ergebnis gefüllt, aber erledigt-durch leer', 'erledigt-durch')
    if (ergebnis === '' && durch !== '') fund('erledigt-durch gefüllt, aber ergebnis leer', durch)
    if (durch !== '') for (const f of pruefeErledigtDurch(datei, text, durch, ergebnis, ort, ctx)) fund(f, durch)
  }

  const ueberschriften = new Set(textZeilen(text).map(z => /^##\s+(.*?)\s*$/.exec(z.roh)?.[1]).filter(Boolean).map(h => h.replace(/\s*…$/, '')))
  for (const a of artDef.abschnitte) if (!ueberschriften.has(a)) fund('Abschnitt fehlt', `## ${a}`, false)
  return treffer
}

/** Fehler im Feld erledigt-durch: Link auf vorhandene Datei, Commit-Hash oder `text` mit Abschnitt „Ergebnis“. */
function pruefeErledigtDurch(datei, text, durch, ergebnis, ort, ctx) {
  if (durch === 'text') {
    if (ergebnis === 'ersetzt') return ['ersetzt braucht einen Link auf den ersetzenden Eintrag']
    return /^##\s+Ergebnis\s*$/m.test(text) ? [] : ['erledigt-durch: text, aber Abschnitt „## Ergebnis“ fehlt']
  }
  if (/^[0-9a-f]{7,40}$/i.test(durch)) {
    if (ergebnis === 'ersetzt') return ['ersetzt braucht einen Link auf den ersetzenden Eintrag']
    return ctx.commit(durch) === false ? ['Commit unbekannt'] : []
  }
  const link = /^\[[^\]]*\]\(\s*<?([^)\s>]+)>?\s*\)$/.exec(durch)?.[1] ?? (/\s/.test(durch) ? null : durch)
  if (link === null) return ['erledigt-durch ist kein Link, kein Commit-Hash und nicht „text“']
  const grund = zielFehler(datei, text, link, ctx)
  if (grund) return [`erledigt-durch: ${grund}`]
  if (ergebnis === 'ersetzt') {
    const ziel = zielAufloesen(datei, link)
    const zielOrt = ziel ? festhaltenOrt(ziel.pfad, ctx.orte) : null
    if (!zielOrt || zielOrt.rolle !== 'eintrag' || zielOrt.art !== ort.art) return [`ersetzt: Link zeigt auf keinen Eintrag der Art ${ort.art}`]
    if (ziel?.pfad === datei) return ['ersetzt: Link zeigt auf den Eintrag selbst']
  }
  return []
}

/** Prüfungen je Datei unabhängig von der Art: tote Links, Inhaltsverzeichnis; beide scharf. */
function dateiPruefungen(datei, text, ctx) {
  const treffer = []
  const r = ctx.regeln
  if (r.links?.dateien.some(g => passt(g, datei))) {
    for (const t of toteLinks(datei, text, ctx))
      treffer.push({ datei, zeile: t.nr, art: 'links', regel: 'links', titel: `Toter Link (${t.grund})`, treffer: t.ziel, scharf: true })
  }
  const inh = r.inhaltsverzeichnis
  if (inh?.dateien.some(g => passt(g, datei)) && text.split(/\r?\n/).length > inh.abZeilen) {
    for (const t of inhaltsLuecken(text))
      treffer.push({ datei, zeile: t.nr, art: 'inhalt', regel: 'inhaltsverzeichnis', titel: 'Fehlt im Inhaltsverzeichnis', treffer: t.ueberschrift, scharf: true })
  }
  return treffer
}

/** Prüft mehrere Dateien (Pfade relativ zur Wurzel); Dateien ohne Art werden nur auf Links geprüft, erzeugte gar nicht. */
export function pruefeDateien(dateien, ctx) {
  const treffer = []
  for (const datei of dateien) {
    const text = ctx.lesen(datei)
    if (text === null) continue
    const arten = artenVon(datei, text, ctx)
    const ort = festhaltenOrt(datei, ctx.orte)
    if (ort?.rolle === 'uebersicht') continue
    const changelog = ctx.beschreibung?.changelog
    if (changelog?.datei === datei && changelog.schema === 'erzeugt') continue
    treffer.push(...pruefeText(datei, text, arten.filter(a => a !== 'eintrag'), ctx.regeln))
    if (ort?.rolle === 'eintrag') treffer.push(...pruefeEintrag(datei, text, ort, ctx))
    treffer.push(...dateiPruefungen(datei, text, ctx))
  }
  return treffer
}

/** Alle Markdown-Dateien des Projekts (ohne `.git`, `node_modules`), Pfade relativ mit `/`. */
export function markdownDateien(root) {
  const aus = []
  const gehe = rel => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      if (name === '.git' || name === 'node_modules') continue
      const r = rel ? `${rel}/${name}` : name
      if (statSync(join(root, r)).isDirectory()) gehe(r)
      else if (name.endsWith('.md')) aus.push(r)
    }
  }
  gehe('')
  return aus
}

/**
 * Hook-Ausgabe für PostToolUse oder null, wenn nichts zu melden ist. Erneuert die Übersicht, wenn ein Eintrag geschrieben wurde.
 * @param {any} eingabe Hook-Eingabe (tool_input.file_path, cwd)
 * @param {string} root Projektwurzel
 */
export function hookAusgabe(eingabe, root) {
  const pfad = eingabe?.tool_input?.file_path
  if (typeof pfad !== 'string' || !pfad.endsWith('.md')) return null
  const ctx = kontext(root)
  if (ctx.beschreibung === null) return null
  const datei = relative(root, isAbsolute(pfad) ? pfad : join(root, pfad)).split(sep).join('/')
  if (datei.startsWith('..')) return null
  const ort = festhaltenOrt(datei, ctx.orte)
  if (ort && ort.rolle !== 'anleitung') schreibeUebersicht(root, ort.art, ctx)
  const treffer = pruefeDateien([datei], ctx)
  if (treffer.length === 0) return null
  const hoechstens = ctx.regeln.hookHoechstens
  const zeilen = treffer.slice(0, hoechstens).map(formatiere)
  if (treffer.length > hoechstens) zeilen.push(`+${treffer.length - hoechstens} weitere`)
  const hilfe = ort?.rolle === 'eintrag' ? `Gerüst und Felder: ${ort.ordner}/CLAUDE.md` : `Regeln: ${SCHREIBREGELN}`
  const kopf = `Doku-Prüfer: ${treffer.length} Treffer in ${datei}. ${hilfe}; Fehlalarm bei Hinweisen: \`${AUSNAHME}\` in die Zeile.`
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: [kopf, ...zeilen].join('\n') } }
}

function hook() {
  let eingabe
  try {
    eingabe = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return 0
  }
  const root = process.env.CLAUDE_PROJECT_DIR || eingabe?.cwd || process.cwd()
  try {
    const aus = hookAusgabe(eingabe, root)
    if (aus) process.stdout.write(JSON.stringify(aus))
  } catch (e) {
    // Der Hook blockiert nie; ein Fehler wird als Hinweis gemeldet.
    const text = `Doku-Prüfer: Fehler, Prüfung übersprungen: ${e instanceof Error ? e.message : e}`
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }))
  }
  return 0
}

function main(argv) {
  if (argv.includes('--hook')) return hook()
  const rootIdx = argv.indexOf('--root')
  const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd())
  const angegeben = argv.filter((a, i) => !a.startsWith('--') && !(rootIdx >= 0 && i === rootIdx + 1))
  const ctx = kontext(root)
  const dateien = angegeben.length > 0 ? angegeben.map(d => relative(root, resolve(d)).split(sep).join('/')) : markdownDateien(root)
  const treffer = pruefeDateien(dateien, ctx)
  for (const t of treffer) console.log(formatiere(t))
  const scharf = treffer.filter(t => t.scharf).length
  console.log(`\n${dateien.length} Dateien, ${treffer.length} Treffer (${scharf} scharf, ${treffer.length - scharf} Hinweise)${ctx.beschreibung ? '' : '; ohne .claude/doku.json, Standard-Zuordnung'}`)
  return scharf > 0 ? 1 : 0
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
