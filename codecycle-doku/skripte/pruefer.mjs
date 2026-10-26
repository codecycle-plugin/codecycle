// Doku-Prüfer: prüft Markdown-Dateien eines Projekts nach ihrer Art und die Felder der Einträge zum Festhalten.
// Aufruf in der Projektwurzel:
//   node pruefer.mjs [Datei …]   ohne Dateien: alle Markdown-Dateien des Projekts; Ausgabe Datei:Zeile: [Art] Regel «Treffer»
//   --root <ordner>   Projektwurzel (Standard: aktueller Ordner)
//   --hook            für den Hook PostToolUse (Write|Edit): liest die Hook-Eingabe von stdin, prüft nur die geschriebene
//                     Datei, erneuert bei einem Eintrag die Übersicht des Ordners und gibt Treffer als additionalContext;
//                     setzt die Marke für den Stop-Hook; ohne .claude/doku.json keine Ausgabe; Exit immer 0
//   --status          baut die Status-Seite .codecycle-doku/status.html; Exit 3 ohne .claude/doku.json
// Der volle Lauf ohne Dateien schreibt mit .claude/doku.json .codecycle-doku/pruefung.json und baut die Status-Seite.
// Zuordnung, Festhalten-Orte und Changelog aus .claude/doku.json; fehlt sie, gilt die Standard-Zuordnung aus regeln.json.
// Scharf (Exit 1) sind nur tote Links und Sprungmarken, Links nach .codecycle-doku/ und Fehler im Kopf von Einträgen, die
// neu oder geändert sind; alles andere ist Hinweis. `doku-ok` in der Zeile nimmt Textregeln, tote Links und fehlende
// Sprungmarken aus, nie Links nach .codecycle-doku/ und nie das Feld erledigt-durch. Neu oder geändert:
// im Hook die geschriebene Datei, bei genannten Dateien jede davon, im vollen Lauf was `git status` als geändert oder neu
// nennt (ohne Git keine). `pruefung` in .claude/doku.json schaltet Regeln ab oder schwächt sie zum Hinweis.
// Eine unlesbare .claude/doku.json meldet der Prüfer als eine Zeile mit Exit 1, der Hook als Hinweis.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { anleitungPfad, festhaltenOrt, festhaltenOrte, ladeBeschreibung, ladeRegeln, leseEintraege, parseKopf, MARKE, passt, PRIVAT, projektOrdner, SCHREIBREGELN, schreibePrivat, schemaVon, statusKlasse } from './gemeinsam.mjs'
import { eigeneUebersicht, schreibeUebersicht } from './uebersicht.mjs'


const AUSNAHME = 'doku-ok'
const KOMMENTAR_ZEILEN = 5

/**
 * Prüfkontext eines Projekts.
 * @param {string} root Projektwurzel
 * @param {{ regeln?: any, beschreibung?: any, neu?: Iterable<string> }} [optionen] zum Testen vorgeben; `neu`: Dateien,
 *   die als neu oder geändert gelten (Standard: alle geprüften Dateien, siehe pruefeDateien)
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
    neu: optionen.neu === undefined ? null : new Set(optionen.neu),
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
      treffer.push({ datei, zeile: 0, art, regel: 'art', titel: 'Unbekannte Art', treffer: art, scharf: false })
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

/** Liegt der Pfad (relativ, mit `/`) in einem privaten Ordner, in jeder Tiefe? */
const imPrivat = pfad => pfad.split('/').includes(PRIVAT)

/** Grund, warum ein relatives Ziel nicht auflöst oder nicht verlinkt werden darf, oder null. */
function zielFehler(datei, text, ziel, ctx) {
  const z = zielAufloesen(datei, ziel)
  if (z === null) return null
  if (imPrivat(z.pfad) && !imPrivat(datei)) return `Ziel im privaten Ordner ${PRIVAT}/, nicht versioniert`
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

/**
 * Tote relative Links einer Markdown-Datei: [{ nr, ziel, grund }]. Externe Ziele werden nicht geprüft. `doku-ok` in der
 * Zeile nimmt tote Links und fehlende Sprungmarken aus, nie Links in den privaten Ordner.
 */
export function toteLinks(datei, text, ctx) {
  const tot = []
  for (const { nr, zeile, roh } of textZeilen(text)) {
    const ausgenommen = roh.includes(AUSNAHME)
    for (const m of zeile.matchAll(LINK)) {
      const ziel = m[1] ?? ''
      const z = zielAufloesen(datei, ziel)
      const grund = zielFehler(datei, text, ziel, ctx)
      if (grund && !(ausgenommen && !(z && imPrivat(z.pfad)))) tot.push({ nr, ziel, grund })
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

/** Gilt die Datei als neu oder geändert? Ohne Angabe im Kontext jede geprüfte Datei. */
const istNeu = (datei, ctx) => ctx.neu === null || ctx.neu === undefined || ctx.neu.has(datei)

/**
 * Prüft Kopf und Abschnitte eines Eintrags zum Festhalten. Fehlende oder widersprüchliche Felder sind scharf, wenn der
 * Eintrag neu oder geändert ist, sonst Hinweise; fehlende Abschnitte sind Hinweise.
 * @param {{ art: string, ordner: string, name: string }} ort
 */
export function pruefeEintrag(datei, text, ort, ctx) {
  const treffer = []
  const neu = istNeu(datei, ctx)
  const fund = (titel, wert, scharf = neu, zeile = 0, regel = 'felder') => treffer.push({ datei, zeile, art: 'eintrag', regel, titel, treffer: wert, scharf })
  const def = ctx.regeln.festhalten
  const artDef = def.arten[ort.art]
  const gelesen = parseKopf(text)
  if (!gelesen) {
    fund('Kopf fehlt (Felder zwischen zwei Zeilen „---“ am Anfang)', ort.name)
    return treffer
  }
  const k = gelesen.kopf
  // Angedockte Sammlung: Pflichtfelder, Statuswerte und Abschnitte aus dem Schema; übrige Felder nur, wenn gesetzt
  const schema = schemaVon(ctx.beschreibung, ort.art)
  const pflicht = schema ? (Array.isArray(schema.pflicht) ? schema.pflicht.map(String) : []) : [...def.felder, ...(artDef.ergebnis === null ? [] : ['ergebnis', 'erledigt-durch'])]
  const erlaubt = schema?.status && typeof schema.status === 'object' ? Object.keys(schema.status) : def.status
  const klasse = statusKlasse(k.status, schema, ctx.regeln)
  for (const feld of pflicht) if (!(feld in k)) fund(['ergebnis', 'erledigt-durch'].includes(feld) && !schema ? 'Feld fehlt (leer lassen, solange offen)' : 'Feld fehlt', feld)
  if ('titel' in k && leer(k.titel)) fund('Feld leer', 'titel')
  if ('datum' in k && !/^\d{4}-\d{2}-\d{2}$/.test(String(k.datum))) fund('datum nicht JJJJ-MM-TT', String(k.datum))
  if ('status' in k && klasse === null) fund(`status ungültig (${erlaubt.join(', ')})`, String(k.status))
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
  } else if (!schema || pflicht.includes('ergebnis') || pflicht.includes('erledigt-durch') || !leer(k.ergebnis) || !leer(k['erledigt-durch'])) {
    const ergebnis = leer(k.ergebnis) ? '' : String(k.ergebnis)
    const durch = leer(k['erledigt-durch']) ? '' : String(k['erledigt-durch'])
    if (klasse === 'offen' && ergebnis !== '') fund(`status ${k.status}, aber ergebnis gefüllt`, ergebnis)
    if (klasse === 'erledigt' && ergebnis === '' && (!schema || pflicht.includes('ergebnis'))) fund(`status ${k.status}, aber ergebnis leer`, 'ergebnis')
    if (ergebnis !== '' && !artDef.ergebnis.includes(ergebnis)) fund(`ergebnis ungültig (${artDef.ergebnis.join(', ')})`, ergebnis)
    if (ergebnis !== '' && durch === '') fund('ergebnis gefüllt, aber erledigt-durch leer', 'erledigt-durch')
    if (ergebnis === '' && durch !== '') fund('erledigt-durch gefüllt, aber ergebnis leer', durch)
    if (durch !== '') for (const f of pruefeErledigtDurch(datei, text, durch, ergebnis, ort, ctx)) fund(f, durch)
  }

  const ueberschriften = new Set(textZeilen(text).map(z => /^##\s+(.*?)\s*$/.exec(z.roh)?.[1]).filter(Boolean).map(h => h.replace(/\s*…$/, '')))
  const abschnitte = schema ? (Array.isArray(schema.abschnitte) ? schema.abschnitte.map(String) : []) : artDef.abschnitte
  for (const a of abschnitte) if (!ueberschriften.has(a)) fund('Abschnitt fehlt', `## ${a}`, false, 0, 'abschnitte')
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

/** Prüfungen je Datei unabhängig von der Art: tote Links (scharf), Inhaltsverzeichnis (Hinweis). */
function dateiPruefungen(datei, text, ctx) {
  const treffer = []
  const r = ctx.regeln
  if (r.links?.dateien.some(g => passt(g, datei))) {
    for (const t of toteLinks(datei, text, ctx)) {
      const titel = t.grund.includes(PRIVAT) ? `Link nach ${PRIVAT}/ (privat, nicht versioniert)` : `Toter Link (${t.grund})`
      treffer.push({ datei, zeile: t.nr, art: 'links', regel: 'links', titel, treffer: t.ziel, scharf: true })
    }
  }
  const inh = r.inhaltsverzeichnis
  if (inh?.dateien.some(g => passt(g, datei)) && text.split(/\r?\n/).length > inh.abZeilen) {
    for (const t of inhaltsLuecken(text))
      treffer.push({ datei, zeile: t.nr, art: 'inhalt', regel: 'inhaltsverzeichnis', titel: 'Fehlt im Inhaltsverzeichnis', treffer: t.ueberschrift, scharf: false })
  }
  return treffer
}

/** Ziele aller relativen Links einer Datei, aufgelöst relativ zur Wurzel. */
function linkZiele(datei, text) {
  const ziele = new Set()
  for (const { zeile } of textZeilen(text)) {
    for (const m of zeile.matchAll(LINK)) {
      const z = zielAufloesen(datei, m[1] ?? '')
      if (z !== null) ziele.add(z.pfad)
    }
  }
  return ziele
}

/**
 * Dateien und Unterordner direkt im Ordner des Wegweisers, auf die er nicht verlinkt (ein Link auf einen Pfad darunter
 * zählt für den Unterordner). Versteckte Namen und der Wegweiser selbst zählen nicht; liegt er in der Wurzel, gibt es
 * nichts zu prüfen.
 */
export function wegweiserLuecken(root, wegweiser, text) {
  const ordner = posix.dirname(wegweiser)
  if (ordner === '.') return []
  let namen
  try {
    namen = readdirSync(join(root, ordner)).sort()
  } catch {
    return []
  }
  const ziele = [...linkZiele(wegweiser, text)]
  return namen
    .filter(n => !n.startsWith('.') && `${ordner}/${n}` !== wegweiser)
    .filter(n => {
      const pfad = `${ordner}/${n}`
      return !ziele.some(z => z === pfad || z.startsWith(`${pfad}/`))
    })
}

/** Hinweise zur Vollständigkeit des Wegweisers: alle Lücken, wenn er selbst geprüft wird, sonst nur die der Datei. */
function wegweiserPruefung(datei, text, ctx, mitWegweiser) {
  const wegweiser = ctx.beschreibung?.orte?.wegweiser
  if (!wegweiser || !ctx.beschreibung?.bausteine?.includes('wegweiser')) return []
  const fund = (d, name) => ({ datei: d, zeile: 0, art: 'wegweiser', regel: 'wegweiser', titel: `fehlt im Wegweiser ${wegweiser}`, treffer: name, scharf: false })
  if (datei === wegweiser) return wegweiserLuecken(ctx.root, wegweiser, text).map(n => fund(datei, n))
  if (mitWegweiser || posix.dirname(datei) !== posix.dirname(wegweiser)) return []
  const wtext = ctx.lesen(wegweiser)
  if (wtext === null) return []
  return wegweiserLuecken(ctx.root, wegweiser, wtext).includes(posix.basename(datei)) ? [fund(datei, posix.basename(datei))] : []
}

/** Zeilen des Abschnitts „Codemap“ (Überschrift ab `##`, die mit Codemap beginnt, bis zur nächsten gleich hohen). */
function codemapZeilen(text) {
  const aus = []
  let ebene = 0
  for (const z of textZeilen(text)) {
    const h = /^(#{1,6})\s+(.*)$/.exec(z.roh)
    if (h) {
      if (ebene && h[1].length <= ebene) ebene = 0
      if (!ebene && h[1].length >= 2 && /^codemap\b/i.test(h[2].trim())) {
        ebene = h[1].length
        continue
      }
    }
    if (ebene) aus.push(z)
  }
  return aus
}

/** Pfade der Codemap: Inhalt von Backticks mit `/`, ohne Platzhalter und Muster. [{ nr, pfad }] */
export function codemapPfade(text) {
  const aus = []
  for (const { nr, roh } of codemapZeilen(text)) {
    for (const m of roh.matchAll(/`([^`\s]+)`/g)) {
      const t = m[1] ?? ''
      if (!t.includes('/') || /[*<>()?:{}|]|^\.\.?\/?$|^[a-z][a-z0-9+.-]*:\/\//i.test(t)) continue
      aus.push({ nr, pfad: t.replace(/^\.\//, '').replace(/\/+$/, '').split('#')[0] ?? '' })
    }
  }
  return aus.filter(p => p.pfad !== '')
}

/**
 * Ordner oberster Ebene, die die Codemap nicht nennt (ohne versteckte, Abhängigkeiten, Build-Ausgaben). Nennt die Codemap
 * noch keinen Pfad (Gerüst, Erstfassung fehlt), gibt es keine Lücken.
 */
export function codemapLuecken(root, text) {
  const pfade = codemapPfade(text)
  if (pfade.length === 0) return []
  const genannt = new Set(pfade.map(p => p.pfad.split('/')[0]))
  return projektOrdner(root).filter(o => !genannt.has(o))
}

/** Hinweise zur Codemap der ARCHITECTURE.md: genannte Pfade, die es nicht gibt. */
function codemapPruefung(datei, text, ctx) {
  const b = ctx.beschreibung
  if (!b?.bausteine?.includes('architektur') || b.orte?.architektur !== datei) return []
  const basis = posix.dirname(datei)
  return codemapPfade(text)
    .filter(p => !ctx.gibt(basis === '.' ? p.pfad : `${basis}/${p.pfad}`))
    .map(p => ({ datei, zeile: p.nr, art: 'codemap', regel: 'codemap', titel: 'Pfad der Codemap fehlt', treffer: p.pfad, scharf: false }))
}

/**
 * Wendet `pruefung` aus .claude/doku.json an: Regeln in `aus` fallen weg, Regeln in `hinweis` werden Hinweise.
 * @template {{ regel: string, scharf: boolean }} T
 * @param {T[]} treffer
 * @param {any} pruefung
 * @returns {T[]}
 */
export function anpassen(treffer, pruefung) {
  const aus = new Set(pruefung?.aus ?? [])
  const hinweis = new Set(pruefung?.hinweis ?? [])
  return treffer.filter(t => !aus.has(t.regel)).map(t => (hinweis.has(t.regel) ? { ...t, scharf: false } : t))
}

/**
 * Prüft mehrere Dateien (Pfade relativ zur Wurzel); Dateien ohne Art werden nur auf Links geprüft, erzeugte gar nicht.
 * Ohne `neu` im Kontext gilt jede genannte Datei als neu oder geändert.
 */
export function pruefeDateien(dateien, ctx) {
  const treffer = []
  const mitWegweiser = dateien.includes(ctx.beschreibung?.orte?.wegweiser)
  for (const datei of dateien) {
    if (imPrivat(datei)) continue
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
    treffer.push(...wegweiserPruefung(datei, text, ctx, mitWegweiser))
    treffer.push(...codemapPruefung(datei, text, ctx))
  }
  return anpassen(treffer, ctx.beschreibung?.pruefung)
}

/**
 * Markdown-Dateien, die Git als geändert oder neu nennt (auch in neuen Ordnern), relativ zur Wurzel; ohne Git oder
 * außerhalb eines Repos eine leere Liste.
 */
export function geaenderteDateien(root) {
  const r = spawnSync('git', ['status', '--porcelain', '-uall', '-z', '--', '.'], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) return []
  const praefix = spawnSync('git', ['rev-parse', '--show-prefix'], { cwd: root, encoding: 'utf8' }).stdout?.trim() ?? ''
  const teile = r.stdout.split('\0')
  const aus = []
  for (let i = 0; i < teile.length; i++) {
    const eintrag = teile[i]
    if (!eintrag || eintrag.length < 4) continue
    const code = eintrag.slice(0, 2)
    // Bei Umbenennen und Kopieren folgt der alte Pfad als eigenes Feld
    if (code.includes('R') || code.includes('C')) i++
    if (code.includes('D')) continue
    const pfad = eintrag.slice(3)
    if (pfad.startsWith(praefix)) aus.push(pfad.slice(praefix.length))
  }
  return aus
}

/**
 * Alle Markdown-Dateien des Projekts, Pfade relativ mit `/`. Ausgelassen in jeder Tiefe: `.git`, `node_modules`, der
 * private Ordner, `.claude/worktrees` und jeder Unterordner mit eigener `.git` (Datei oder Ordner: verschachteltes Repo
 * oder Worktree, gehört nicht zu diesem Projekt).
 */
export function markdownDateien(root) {
  const aus = []
  const gehe = rel => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      if (name === '.git' || name === 'node_modules' || name === PRIVAT) continue
      if (name === 'worktrees' && posix.basename(rel) === '.claude') continue
      const r = rel ? `${rel}/${name}` : name
      if (statSync(join(root, r)).isDirectory()) {
        if (!existsSync(join(root, r, '.git'))) gehe(r)
      } else if (name.endsWith('.md')) aus.push(r)
    }
  }
  gehe('')
  return aus
}

/** Ist die eigene Übersicht der Art in .claude/doku.json vereinbart (`schemata.<art>.uebersicht: eigen`)? Dann still. */
const uebersichtEigenGewollt = (ctx, art) => ctx.beschreibung?.schemata?.[art]?.uebersicht === 'eigen'

/**
 * Hook-Ausgabe für PostToolUse oder null, wenn nichts zu melden ist. Erneuert die Übersicht, wenn ein Eintrag geschrieben wurde.
 * @param {any} eingabe Hook-Eingabe (tool_input.file_path, cwd)
 * @param {string} root Projektwurzel
 */
export function hookAusgabe(eingabe, root) {
  const pfad = eingabe?.tool_input?.file_path
  if (typeof pfad !== 'string' || !pfad.endsWith('.md')) return null
  const datei = relative(root, isAbsolute(pfad) ? pfad : join(root, pfad)).split(sep).join('/')
  if (datei.startsWith('..')) return null
  const ctx = kontext(root, { neu: [datei] })
  if (ctx.beschreibung === null) return null
  // Marke für den Stop-Hook: Markdown geändert, die Status-Seite wird am Ende der Antwort neu gebaut. Lässt sie sich nicht
  // setzen (etwa privater Ordner als Symlink), fehlt nur der Neubau der Seite; die Prüfung läuft weiter.
  if (!imPrivat(datei)) {
    try {
      schreibePrivat(root, MARKE, '')
    } catch {
      // Marke nicht gesetzt
    }
  }
  const ort = festhaltenOrt(datei, ctx.orte)
  const eigen = ort && ort.rolle !== 'anleitung' && eigeneUebersicht(root, ort.ordner) && !uebersichtEigenGewollt(ctx, ort.art)
  if (ort && ort.rolle !== 'anleitung') schreibeUebersicht(root, ort.art, ctx)
  const treffer = pruefeDateien([datei], ctx)
  const hinweisEigen = eigen ? [`${ort.ordner}/README.md: eigene Übersicht, nicht erneuert.`] : []
  if (treffer.length === 0) return hinweisEigen.length ? { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `Doku-Prüfer: ${hinweisEigen[0]}` } } : null
  const hoechstens = ctx.regeln.hookHoechstens
  const zeilen = treffer.slice(0, hoechstens).map(formatiere)
  if (treffer.length > hoechstens) zeilen.push(`+${treffer.length - hoechstens} weitere`)
  const hilfe = ort?.rolle === 'eintrag' ? `Gerüst und Felder: ${anleitungPfad(ctx.beschreibung, ort.art, ort.ordner)}` : `Regeln: ${SCHREIBREGELN}`
  const kopf = `Doku-Prüfer: ${treffer.length} Treffer in ${datei}. ${hilfe}; Fehlalarm bei Hinweisen: \`${AUSNAHME}\` in die Zeile.`
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: [kopf, ...zeilen, ...hinweisEigen].join('\n') } }
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

async function main(argv) {
  if (argv.includes('--hook')) return hook()
  const rootIdx = argv.indexOf('--root')
  const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd())
  if (argv.includes('--status')) {
    // Status-Seite auf Befehl; geladen nur hier, damit der Hook schlank bleibt
    const { baueStatus } = await import('./status.mjs')
    if (baueStatus(root) === null) {
      console.error('Prüfer: .claude/doku.json fehlt; keine Status-Seite')
      return 3
    }
    console.log(`${PRIVAT}/status.html geschrieben`)
    return 0
  }
  const angegeben = argv.filter((a, i) => !a.startsWith('--') && !(rootIdx >= 0 && i === rootIdx + 1))
  const dateien = angegeben.length > 0 ? angegeben.map(d => relative(root, resolve(d)).split(sep).join('/')) : markdownDateien(root)
  let ctx
  try {
    ctx = kontext(root, { neu: angegeben.length > 0 ? dateien : geaenderteDateien(root) })
  } catch (e) {
    // Etwa .claude/doku.json kaputt: eine Zeile statt Stacktrace
    console.error(`Prüfer: ${String(e instanceof Error ? e.message : e).replace(/\s*\n\s*/g, ' ')}`)
    return 1
  }
  const treffer = pruefeDateien(dateien, ctx)
  for (const t of treffer) console.log(formatiere(t))
  const scharf = treffer.filter(t => t.scharf).length
  const schluss = `${dateien.length} Dateien, ${treffer.length} Treffer (${scharf} scharf, ${treffer.length - scharf} Hinweise)`
  console.log(`\n${schluss}${ctx.beschreibung ? '' : '; ohne .claude/doku.json, Standard-Zuordnung'}`)
  if (angegeben.length === 0 && ctx.beschreibung) {
    // Voller Lauf: Ergebnis festhalten und Status-Seite neu; ein Fehler dabei ändert das Ergebnis des Prüfers nicht
    try {
      const { baueStatus, schreibePruefung } = await import('./status.mjs')
      schreibePruefung(root, schluss, treffer)
      baueStatus(root, ctx.regeln)
    } catch (e) {
      console.error(`Prüfer: Status-Seite nicht erneuert: ${e instanceof Error ? e.message : e}`)
    }
  }
  return scharf > 0 ? 1 : 0
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main(process.argv.slice(2)).then(code => { process.exitCode = code })
