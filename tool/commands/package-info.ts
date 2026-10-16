// `package-info "Datei :: Symbol" …`: Zuarbeit für das Kontextpaket des Mods.
// Eine JSON-Zeile auf stdout, damit der Mod sie mit einem einzigen Prozessaufruf pro Agentenstart liest:
//   fundstellen: Graph-Treffer je Fundstelle (Stufe „Graph“ der Auflösung; null = kein Graph)
//   signaturen:  Signaturen der im Abschnitt aufgerufenen Funktionen und Typen (nur die Kopfzeile)
//   offen:       was nicht eindeutig war (nie geraten)
// Exit 0 auch bei leeren Ergebnissen; 2 nur bei falschem Aufruf.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { GraphHit } from '../../lib/locate.ts'
import type { Signatur } from '../../lib/signatures.ts'
import { ctagsOutline } from '../ctags.ts'
import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { type OpenGraph, openGraph } from '../graph-use.ts'
import { locateLib, outlineLib, pathsLib, signaturesLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree } from '../project.ts'
import { relativeInside } from './locate.ts'

const { GIT_QUIET } = pathsLib

/** Höchstens so viele Namen werden aufgelöst (alle Fundstellen zusammen). */
const MAX_NAMES = 20
/** Mehr Kandidaten als das: mehrdeutig, nicht mitgeliefert. */
const MAX_CANDIDATES = 3
const SKIP_DIRS = /^(vendor|node_modules|dist|build|\.git|\.codecycle)\//

export type PackageInfo = {
  version: 1
  fundstellen: { ref: string; datei: string; symbol: string | null; graph: GraphHit[] | null }[]
  signaturen: Signatur[]
  offen: string[]
  hinweis?: string
}

function readIn(work: string, root: string, datei: string): string | null {
  const path = [join(work, datei), join(root, datei)].find(p => existsSync(p))
  return path ? readFileSync(path, 'utf8') : null
}

function graphHits(og: OpenGraph, root: string, datei: string, name: string): GraphHit[] | null {
  if (!og.adapter) return null
  const found = og.adapter.find(root, name)
  if (!found) return null
  return found
    .filter(s => s.datei === datei && s.start !== undefined)
    .map(s => ({ name: s.name, start: s.start!, ende: s.ende ?? s.start!, ...(s.parent ? { parent: s.parent } : {}) }))
}

/** Kandidaten-Dateien mit Zeile für eine Definition: Graph, sonst `git grep -E`. */
function definitionSites(og: OpenGraph, root: string, work: string, name: string): { datei: string; zeile?: number }[] | null {
  if (og.adapter) {
    const found = og.adapter.find(root, name)
    if (found) {
      return found
        .filter(s => !s.isTest && s.name === name && !SKIP_DIRS.test(s.datei))
        .map(s => ({ datei: s.datei, ...(s.start !== undefined ? { zeile: s.start } : {}) }))
    }
  }
  const r = git([...GIT_QUIET, 'grep', '-n', '-I', '-E', '-e', signaturesLib.definitionPattern(name), '--', '.'], work)
  if (!r.ok && r.out.trim() === '') return []
  return r.out
    .split(/\r?\n/)
    .map(l => l.match(/^(.*?):(\d+):/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(m => ({ datei: m[1]!.replace(/\\/g, '/'), zeile: Number(m[2]) }))
    .filter(s => !SKIP_DIRS.test(s.datei))
}

export function packageInfo(args: string[], ctx: Ctx): number {
  const refs = args.filter(a => a.trim() !== '')
  if (refs.length === 0) throw new ToolBroken('Aufruf: codecycle package-info "Datei :: Symbol" [weitere …]')
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const og = openGraph(root)
  const out: PackageInfo = { version: 1, fundstellen: [], signaturen: [], offen: [] }
  if (!og.adapter && og.note) out.hinweis = `ohne Graph: ${og.note}`

  const names: string[] = []
  const own: string[] = []
  for (const ref of refs) {
    const parsed = locateLib.parseRef(ref) ?? { datei: ref.trim(), symbol: '' }
    const datei = relativeInside(work, parsed.datei)
    if (datei === null) {
      out.offen.push(`${ref}: außerhalb des Projekts`)
      continue
    }
    const symbol = parsed.symbol === '' ? null : parsed.symbol
    const q = symbol ? locateLib.splitSymbol(symbol) : null
    const graph = q ? graphHits(og, root, datei, q.name) : null
    out.fundstellen.push({ ref, datei, symbol, graph })
    if (!symbol || !q) continue
    own.push(q.name)

    const inhalt = readIn(work, root, datei)
    if (inhalt === null) continue
    const outline = outlineLib.languageOf(datei) === null ? ctagsOutline(join(work, datei), inhalt.split(/\r?\n/)) : undefined
    const hit = locateLib.locateSymbol(datei, symbol, inhalt, { ...(graph ? { graph } : {}), ...(outline ? { outline } : {}) })
    if (!locateLib.isTreffer(hit)) continue
    const section = inhalt.split(/\r?\n/).slice(hit.start - 1, hit.ende).join('\n')
    for (const n of signaturesLib.calledNames(section, datei, own)) if (!names.includes(n)) names.push(n)
  }

  for (const name of names.filter(n => !own.includes(n)).slice(0, MAX_NAMES)) {
    const sites = definitionSites(og, root, work, name)
    if (!sites || sites.length === 0) continue
    const files = [...new Set(sites.map(s => s.datei))]
    if (files.length > MAX_CANDIDATES) {
      out.offen.push(`${name}: mehrdeutig (${files.length} Dateien), Signatur nicht mitgeliefert`)
      continue
    }
    for (const datei of files) {
      const inhalt = readIn(work, root, datei)
      if (inhalt === null) continue
      let found = signaturesLib.signaturesIn(inhalt, datei, [name])
      const lines = sites.filter(s => s.datei === datei && s.zeile !== undefined).map(s => s.zeile!)
      if (lines.length > 0 && found.some(f => lines.includes(f.zeile))) found = found.filter(f => lines.includes(f.zeile))
      if (found.length === 0 && lines[0] !== undefined) {
        // Sprache ohne eigene Outline: die Fundzeile selbst als Signatur
        const text = (inhalt.split(/\r?\n/)[lines[0] - 1] ?? '').trim()
        if (text !== '') found = [{ name, datei, zeile: lines[0], signatur: text.length > 160 ? `${text.slice(0, 157)}...` : text }]
      }
      out.signaturen.push(...found.slice(0, 2))
    }
  }
  ctx.out(JSON.stringify(out))
  return 0
}
