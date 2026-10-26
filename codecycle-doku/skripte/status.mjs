// Status-Seite im privaten Ordner: .codecycle-doku/status.json und status.html (eine Datei, ohne Netz und ohne externe
// Skripte). Blöcke: A auf einen Blick, B so ist die Doku aufgebaut, D wartet auf dich, E wichtig. Aufruf:
//   node status.mjs [--root <ordner>]   baut die Seite; Exit 3 ohne .claude/doku.json (dann nichts geschrieben)
// Gebaut nach jedem schreibenden Lauf der Einrichtung, nach jedem vollen Prüferlauf und vom Stop-Hook, wenn Markdown
// geschrieben wurde (wartet.mjs --stop).
import { readFileSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BAUSTEINE, stand } from './einrichten.mjs'
import { festhaltenOrte, ladeBeschreibung, ladeRegeln, leseEintraege, PRIVAT, schemaVon, schreibePrivat, statusKlasse } from './gemeinsam.mjs'
import { codemapLuecken, wegweiserLuecken } from './pruefer.mjs'
import { gebrocheneVerweise, proben, versionen, versionsPunkte } from './wartet.mjs'

/** Ergebnis des letzten vollen Prüferlaufs, geschrieben von pruefer.mjs. */
export const PRUEFUNG = 'pruefung.json'
const HOECHSTENS_WICHTIG = 5

const lies = (root, pfad) => {
  try {
    return readFileSync(join(root, ...pfad.split('/')), 'utf8')
  } catch {
    return null
  }
}

/** Art eines Bausteins für Block B. */
const ART = { readme: 'nachschlagen', 'claude-md': 'anweisung', changelog: 'chronik', schreibregeln: 'anweisung', festhalten: 'eintrag', chronik: 'chronik', entscheidungen: 'entscheidung', architektur: 'nachschlagen', wegweiser: 'nachschlagen', berichte: 'bericht', prompts: 'prompt' }
const ZUSTAND_B = { vorhanden: 'eingerichtet', veraltet: 'veraltet', fehlt: 'fehlt', 'eigener Inhalt': 'angedockt' }

/** Inhalt der Seite als Daten (status.json). */
export function sammleStatus(root, regeln = ladeRegeln()) {
  const b = ladeBeschreibung(root)
  if (b === null) return null
  const s = stand(root, regeln)
  const v = versionen(b)

  // B: je Schritt Art → Ort mit Zustand; angedockte Sammlungen als solche
  const aufbau = s.schritte
    .filter(x => x.schritt !== 'privat' && x.schritt !== 'verweis')
    .map(x => {
      const art = x.schritt.startsWith('festhalten:') ? x.schritt.slice('festhalten:'.length) : null
      const angedockt = art !== null && schemaVon(b, art) !== null
      let zustand = x.gewaehlt ? (ZUSTAND_B[x.zustand] ?? x.zustand) : 'nicht gewählt'
      if (angedockt && x.gewaehlt) zustand = 'angedockt'
      const typ = x.baustein ? ART[x.baustein] : x.schritt === 'doku-json' ? 'beschreibung' : 'anweisung'
      return { baustein: x.baustein ?? x.schritt, schritt: x.schritt, art: regeln.arten[typ]?.titel.split(':')[0] ?? typ, pfad: x.pfad, zustand }
    })

  // A: Bausteine, Prüfer, offene Einträge
  const gewaehlt = s.bausteine.filter(x => BAUSTEINE[x] && x !== 'mermaid')
  const eingerichtet = gewaehlt.filter(x => aufbau.filter(z => z.baustein === x || z.schritt.startsWith(`${x}:`)).every(z => ['eingerichtet', 'angedockt'].includes(z.zustand)))
  let pruefung = null
  try {
    pruefung = JSON.parse(lies(root, `${PRIVAT}/${PRUEFUNG}`) ?? 'null')
  } catch {
    pruefung = null
  }
  const orte = festhaltenOrte(b, regeln)
  const eintraege = leseEintraege(root, orte)
  const offen = {}
  for (const o of orte) offen[o.art] = eintraege.filter(e => e.art === o.art && statusKlasse(e.kopf.status, schemaVon(b, o.art), regeln) !== 'erledigt').length

  // D: wartet auf dich
  const d = [...gebrocheneVerweise(root, b)]
  for (const t of pruefung?.tote ?? []) d.push({ art: 'tot', text: `Toter Link in ${t.datei}:${t.zeile} → ${t.ziel}`, pfad: t.datei })
  d.push(...proben(root), ...versionsPunkte(v))
  const architektur = b.bausteine?.includes('architektur') ? b.orte?.architektur : null
  const atext = architektur ? lies(root, architektur) : null
  if (atext !== null) for (const o of codemapLuecken(root, atext)) d.push({ art: 'codemap', text: `Ordner ${o}/ fehlt in der Codemap von ${architektur}`, pfad: architektur })
  const wegweiser = b.bausteine?.includes('wegweiser') ? b.orte?.wegweiser : null
  const wtext = wegweiser ? lies(root, wegweiser) : null
  if (wtext !== null) for (const n of wegweiserLuecken(root, wegweiser, wtext)) d.push({ art: 'wegweiser', text: `${posix.dirname(wegweiser)}/${n} fehlt im Wegweiser ${wegweiser}`, pfad: wegweiser })

  // E: offene, wichtige Einträge, neueste zuerst
  const e = eintraege
    .filter(x => x.kopf.wichtigkeit === 'wichtig' && statusKlasse(x.kopf.status, schemaVon(b, x.art), regeln) !== 'erledigt')
    .sort((x, y) => String(y.kopf.datum ?? '').localeCompare(String(x.kopf.datum ?? '')))
    .slice(0, HOECHSTENS_WICHTIG)
    .map(x => ({ art: x.art, titel: String(x.kopf.titel || x.name), datum: String(x.kopf.datum ?? ''), pfad: x.datei }))

  return {
    erzeugt: new Date().toISOString(),
    a: { bausteine: { gewaehlt: gewaehlt.length, eingerichtet: eingerichtet.length }, pruefer: pruefung ? { zeit: pruefung.zeit, schluss: pruefung.schluss } : null, offen, wartet: d.length, versionen: v },
    b: aufbau,
    d,
    e,
  }
}

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Link von .codecycle-doku/status.html auf eine Datei im Projekt. */
const link = (pfad, text = pfad) => `<a href="../${esc(pfad.split('/').map(encodeURIComponent).join('/'))}">${esc(text)}</a>`

/** Status-Seite als eine HTML-Datei: nur eingebettetes CSS, keine Skripte, keine Verweise ins Netz. */
export function renderHtml(st) {
  const v = st.a.versionen
  const offen = Object.entries(st.a.offen).map(([art, n]) => `${esc(art)}: ${n}`).join(', ') || 'keine Festhalten-Orte'
  const zeile = (k, w) => `<tr><th>${esc(k)}</th><td>${w}</td></tr>`
  const a = [
    zeile('Bausteine', `${st.a.bausteine.eingerichtet} von ${st.a.bausteine.gewaehlt} eingerichtet`),
    zeile('Prüfer', st.a.pruefer ? `${esc(st.a.pruefer.schluss)} <span class="leise">(${esc(st.a.pruefer.zeit)})</span>` : 'noch kein voller Lauf: <code>codecycle-doku-pruefer</code>'),
    zeile('Offene Einträge', offen),
    zeile('Wartet auf dich', String(st.a.wartet)),
    zeile('Versionen', `aktiv ${esc(v.aktiv)} · eingerichtet mit ${esc(v.eingerichtet ?? 'unbekannt')}${v.marketplace ? ` · im Marketplace ${esc(v.marketplace)} (laut lokaler Kopie)` : ''}`),
  ].join('\n')
  const b = st.b.map(x => `<tr class="${esc(x.zustand.replace(/\s/g, '-'))}"><td>${esc(x.baustein)}</td><td>${esc(x.art)}</td><td>${x.zustand === 'fehlt' || x.zustand === 'nicht gewählt' ? esc(x.pfad) : link(x.pfad)}</td><td>${esc(x.zustand)}</td></tr>`).join('\n')
  const d = st.d.length ? `<ul>\n${st.d.map(x => `<li><span class="marke ${esc(x.art)}">${esc(x.art)}</span> ${esc(x.text)}</li>`).join('\n')}\n</ul>` : '<p class="leer">Nichts wartet.</p>'
  const e = st.e.length ? `<ul>\n${st.e.map(x => `<li>${link(x.pfad, x.titel)} <span class="leise">${esc(x.art)}, ${esc(x.datum)}</span></li>`).join('\n')}\n</ul>` : '<p class="leer">Keine offenen Einträge mit Wichtigkeit „wichtig“.</p>'
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Doku-Status</title>
<style>
:root { --text: #1d1f23; --leise: #5f6670; --flaeche: #ffffff; --linie: #d9dde3; --rot: #b42318; --gelb: #8a5a00; --gruen: #1a7f37; }
@media (prefers-color-scheme: dark) { :root { --text: #e6e8eb; --leise: #9aa3ad; --flaeche: #16181c; --linie: #2e333a; --rot: #ff7b72; --gelb: #e3b341; --gruen: #56d364; } }
body { margin: 0 auto; max-width: 960px; padding: 16px; background: var(--flaeche); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
h1 { font-size: 1.4em; } h2 { font-size: 1.1em; margin-top: 1.6em; border-bottom: 1px solid var(--linie); }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--linie); vertical-align: top; }
a { color: inherit; } .leise, .leer { color: var(--leise); } code { font-size: .95em; }
.marke { display: inline-block; min-width: 5em; font-size: .85em; color: var(--rot); }
.veraltet td:last-child, .fehlt td:last-child { color: var(--gelb); } .eingerichtet td:last-child, .angedockt td:last-child { color: var(--gruen); }
</style>
</head>
<body>
<h1>Doku-Status</h1>
<p class="leise">Erzeugt ${esc(st.erzeugt)} aus <code>.claude/doku.json</code>; privat, nicht versioniert. Neu erzeugen: <code>codecycle-doku-pruefer --status</code>.</p>
<h2>A · Auf einen Blick</h2>
<table>
${a}
</table>
<h2>D · Wartet auf dich</h2>
${d}
<h2>E · Wichtig</h2>
${e}
<h2>B · So ist die Doku aufgebaut</h2>
<table>
<tr><th>Baustein</th><th>Art</th><th>Ort</th><th>Zustand</th></tr>
${b}
</table>
</body>
</html>
`
}

/** Baut status.json und status.html; null ohne .claude/doku.json. */
export function baueStatus(root, regeln = ladeRegeln()) {
  const st = sammleStatus(root, regeln)
  if (st === null) return null
  schreibePrivat(root, 'status.json', `${JSON.stringify(st, null, 2)}\n`)
  return schreibePrivat(root, 'status.html', renderHtml(st))
}

/** Hält das Ergebnis eines vollen Prüferlaufs fest (für Block A und tote Links in D). */
export function schreibePruefung(root, schluss, treffer) {
  const tote = treffer.filter(t => t.regel === 'links' && t.scharf).map(t => ({ datei: t.datei, zeile: t.zeile, ziel: t.treffer }))
  return schreibePrivat(root, PRUEFUNG, `${JSON.stringify({ zeit: new Date().toISOString(), schluss, tote }, null, 2)}\n`)
}

function main(argv) {
  const i = argv.indexOf('--root')
  const root = resolve(i >= 0 ? argv[i + 1] : process.cwd())
  try {
    const ziel = baueStatus(root)
    if (ziel === null) {
      console.error('status: .claude/doku.json fehlt; erst einrichten')
      return 3
    }
    console.log(`${PRIVAT}/status.html geschrieben`)
    return 0
  } catch (e) {
    console.error(`status: ${e instanceof Error ? e.message : e}`)
    return 1
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
