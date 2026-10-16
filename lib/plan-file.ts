// PLAN.md lesen und Startbarkeit der Pakete bestimmen.
// Reiner Code ohne Node und ohne Mod-API, wie state-file.ts.

import type { Package } from '../types'

export type Difficulty = 'einfach' | 'normal' | 'heikel'

/** Eine Fundstelle als „Datei :: Symbol“; `symbol` ist null, wenn nur eine Datei genannt wird. */
export type Locus = { datei: string; symbol: string | null }

export type PlanPackage = {
  id: string
  titel: string
  rolle: string
  schwierigkeit: Difficulty
  /** Paketzeile `Risiko: ja|nein`: berührt einen Risikobereich; fehlt = nein */
  risiko: boolean
  kriterien: string[]
  neu: string[]
  aendern: string[]
  tests: string[]
  fundstellen: Locus[]
  angeboten: Locus[]
  testansatz: string
  abhaengigVon: string[]
  parallelMit: string[]
}

export type Plan = { quelle: string; pakete: PlanPackage[] }

const DIFFICULTIES: Difficulty[] = ['einfach', 'normal', 'heikel']

/** Schneidet einen Kommentar (` # …`) ab. */
function stripComment(value: string): string {
  const m = value.match(/\s#(\s|$)/)
  return (m ? value.slice(0, m.index) : value).trim()
}

function isNone(value: string): boolean {
  return /^(–|-|—|keine?r?|keins|…|null|~)?$/i.test(value.trim())
}

function clean(item: string): string {
  return item.trim().replace(/^\*+|\*+$/g, '').trim().replace(/^`+|`+$/g, '').trim()
}

/**
 * Trennt eine Liste an ';' und ',' außerhalb von Klammern und Backticks (Zeilenumbrüche zählen wie ';').
 * Kommas in Klammerzusätzen („(Typ-Import, nur lesen)“) trennen also nicht.
 */
export function splitList(value: string, separators = ';,'): string[] {
  const out: string[] = []
  let depth = 0
  let tick = false
  let cur = ''
  for (const ch of value) {
    if (ch === '`') tick = !tick
    else if (!tick && (ch === '(' || ch === '[')) depth++
    else if (!tick && (ch === ')' || ch === ']') && depth > 0) depth--
    if (depth === 0 && !tick && (separators.includes(ch) || ch === '\n')) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** Eine Angabe von Formatierung befreien: Aufzählungszeichen, Fettdruck, Backticks, Klammerzusätze, Erläuterung nach „ – “. */
function bare(entry: string): string {
  return entry
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+\([^)]*\)/g, '')
    .replace(/\s+[–—-]\s+.*$/, '')
    .replace(/\(\)$/, '')
    .trim()
}

/** Dateiliste: Trennen außerhalb von Klammern, Zusätze und Formatierung entfernen; „Datei :: Symbol“ zählt als Datei. */
function fileList(value: string): string[] {
  if (isNone(value)) return []
  return splitList(value)
    .map(s => bare(s).split('::')[0]!)
    .map(clean)
    .filter(s => s !== '' && !isNone(s))
}

function idList(value: string): string[] {
  if (isNone(value)) return []
  return value
    .split(/\s*(?:,|;|\bund\b)\s*/i)
    .map(clean)
    .filter(s => s !== '' && !isNone(s))
}

/**
 * Die eine gemeinsame Zerlegung der Fundstellen-Zeile: Trenner ';' und ',' außerhalb von Klammern,
 * auch Unterlisten (zu ';' zusammengezogen); Backticks, Fettdruck und Klammerzusätze entfallen.
 * Ergebnis je Eintrag „Datei :: Symbol“ oder reine Datei.
 */
export function parseLoci(value: string): Locus[] {
  if (isNone(value)) return []
  return splitList(value)
    .map(bare)
    .filter(s => s !== '' && !isNone(s))
    .map(s => {
      const i = s.indexOf('::')
      if (i < 0) return { datei: clean(s), symbol: null }
      const symbol = clean(s.slice(i + 2))
      return { datei: clean(s.slice(0, i)), symbol: symbol === '' ? null : symbol }
    })
    .filter(l => l.datei !== '')
}

/** Alle Dateien eines Plans: Neu, Ändern, Tests und Fundstellen (ohne „Angeboten“), ohne Doppelte, mit `/`. */
export function planFiles(plan: Plan): string[] {
  const set = new Set<string>()
  for (const p of plan.pakete) {
    for (const f of [...p.neu, ...p.aendern, ...p.tests, ...p.fundstellen.map(l => l.datei)]) set.add(f.replace(/\\/g, '/'))
  }
  return [...set]
}

/**
 * Überschrift eines Pakets: „P1 – Titel“, „P1 - Titel“, „P1: Titel“, „P1 Titel“, „**P1** Titel“.
 * Die ID wird ohne Satzzeichen und Formatierung geliefert; null, wenn keine ID zu erkennen ist.
 */
export function parseHeading(head: string): { id: string; titel: string } | null {
  const h = head.replace(/[*`]/g, '').trim()
  const m = h.match(/^([^\s:–—]+?)[.:]?(?:\s*[–—:]\s*|\s+-\s+|\s+|$)(.*)$/)
  if (!m || m[1] === '') return null
  return { id: m[1]!, titel: (m[2] ?? '').trim() }
}

const FIELDS: Record<string, string> = {
  rolle: 'rolle',
  schwierigkeit: 'schwierigkeit',
  risiko: 'risiko',
  kriterien: 'kriterien',
  neu: 'neu',
  ändern: 'aendern',
  aendern: 'aendern',
  tests: 'tests',
  fundstellen: 'fundstellen',
  angeboten: 'angeboten',
  'angeboten (optional)': 'angeboten',
  testansatz: 'testansatz',
  'abhängig von': 'abhaengigVon',
  'abhaengig von': 'abhaengigVon',
  'parallel möglich mit': 'parallelMit',
  'parallel moeglich mit': 'parallelMit',
}

/** Liest eine PLAN.md; wirft, wenn der Abschnitt „Pakete“ oder alle Pakete fehlen oder eine ID doppelt vorkommt. */
export function parsePlan(text: string, quelle: string): Plan {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n')

  let inPakete = false
  let hasSection = false
  const blocks: { head: string; lines: string[] }[] = []
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      inPakete = h2[1]!.trim().toLowerCase() === 'pakete'
      hasSection ||= inPakete
      continue
    }
    if (!inPakete) continue
    const h3 = line.match(/^###\s+(.*)$/)
    if (h3) blocks.push({ head: h3[1]!.trim(), lines: [] })
    else blocks.at(-1)?.lines.push(line)
  }
  if (!hasSection) throw new Error('PLAN.md: Abschnitt „Pakete“ fehlt')

  const seen = new Set<string>()
  const pakete = blocks.map((block): PlanPackage => {
    const head = parseHeading(block.head)
    if (!head) throw new Error(`PLAN.md: Paketüberschrift ohne ID: ${block.head}`)
    const { id, titel } = head
    if (seen.has(id)) throw new Error(`PLAN.md: Paket ${id} kommt doppelt vor`)
    seen.add(id)

    const raw: Record<string, string> = {}
    // Unterlisten („  - src/a.ts :: f“) unter einem Feld gehören zu diesem Feld
    let current: string | undefined
    let currentIndent = 0
    for (const line of block.lines) {
      const m = line.match(/^(\s*)[-*]\s+([^:]+?):\s*(.*)$/)
      const field = m ? FIELDS[m[2]!.trim().toLowerCase()] : undefined
      const indent = (line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length
      if (m && field && (current === undefined || indent <= currentIndent)) {
        current = field
        currentIndent = indent
        raw[field] = stripComment(m[3]!)
        continue
      }
      const item = line.match(/^\s*[-*+]\s+(.*\S)\s*$/)
      if (current !== undefined && item && indent > currentIndent) {
        raw[current] = `${raw[current] ?? ''}; ${stripComment(item[1]!)}`
      } else if (line.trim() !== '' && indent <= currentIndent) current = undefined
    }
    const schwierigkeit = (raw.schwierigkeit ?? '').toLowerCase() as Difficulty
    return {
      id,
      titel,
      rolle: raw.rolle && !isNone(raw.rolle) ? raw.rolle : '?',
      schwierigkeit: DIFFICULTIES.includes(schwierigkeit) ? schwierigkeit : 'normal',
      risiko: /^(ja|yes|true)\b/i.test((raw.risiko ?? '').trim()),
      kriterien: idList(raw.kriterien ?? ''),
      neu: fileList(raw.neu ?? ''),
      aendern: fileList(raw.aendern ?? ''),
      tests: fileList(raw.tests ?? ''),
      fundstellen: parseLoci(raw.fundstellen ?? ''),
      angeboten: parseLoci(raw.angeboten ?? ''),
      testansatz: raw.testansatz ?? '',
      abhaengigVon: idList(raw.abhaengigVon ?? ''),
      parallelMit: idList(raw.parallelMit ?? ''),
    }
  })
  if (pakete.length === 0) throw new Error('PLAN.md: keine Pakete gefunden')
  return { quelle, pakete }
}

export const ALL_PACKAGES = 'alle'

const RANK: Record<Difficulty, number> = { einfach: 0, normal: 1, heikel: 2 }

/** Ein Paket über die ganze Aufgabe (Aufgabenmodus): für Test-Autor und Abschlussprüfung. */
export function mergePackages(plan: Plan): PlanPackage {
  const uniq = <T>(xs: T[], key: (x: T) => string): T[] => {
    const seen = new Set<string>()
    return xs.filter(x => (seen.has(key(x)) ? false : (seen.add(key(x)), true)))
  }
  const ps = plan.pakete
  const all = <K extends 'kriterien' | 'neu' | 'aendern' | 'tests'>(k: K): string[] => uniq(ps.flatMap(p => p[k]), x => x)
  const loci = (k: 'fundstellen' | 'angeboten'): Locus[] => uniq(ps.flatMap(p => p[k]), l => `${l.datei}::${l.symbol ?? ''}`)
  return {
    id: ALL_PACKAGES,
    titel: 'alle Pakete',
    rolle: ps.some(p => p.rolle === 'logik') ? 'logik' : (ps[0]?.rolle ?? '?'),
    risiko: ps.some(p => p.risiko),
    schwierigkeit: ps.reduce<Difficulty>((d, p) => (RANK[p.schwierigkeit] > RANK[d] ? p.schwierigkeit : d), 'einfach'),
    kriterien: all('kriterien'),
    neu: all('neu'),
    aendern: all('aendern'),
    tests: all('tests'),
    fundstellen: loci('fundstellen'),
    angeboten: loci('angeboten'),
    testansatz: ps.map(p => p.testansatz).filter(Boolean).join(' / '),
    abhaengigVon: [],
    parallelMit: [],
  }
}

export type Startability = {
  /** offene Pakete, deren Abhängigkeiten alle fertig sind */
  startbar: string[]
  /** offene Pakete mit den Abhängigkeiten, die noch nicht fertig sind (auch unbekannte IDs) */
  wartend: { id: string; wartetAuf: string[] }[]
  /** eine Abhängigkeitsschleife unter den offenen Paketen (IDs in Reihenfolge), sonst null */
  zyklus: string[] | null
  /** true, wenn nichts in Arbeit ist, offene Pakete da sind und keines startbar ist */
  keinesStartbar: boolean
}

/**
 * Welche offenen Pakete dürfen starten? Der Status kommt aus STATE.md, die Abhängigkeiten
 * aus PLAN.md (fehlt ein Paket dort, hat es keine). Ein Paket gilt als erledigt nur mit
 * Status `fertig`; eine unbekannte ID bleibt unerfüllt.
 */
export function analyzeStartability(pakete: Package[], plan?: Plan): Startability {
  const status = new Map(pakete.map(p => [p.id, p.status]))
  const deps = new Map((plan?.pakete ?? []).map(p => [p.id, p.abhaengigVon]))
  const offen = pakete.filter(p => p.status === 'offen')

  const startbar: string[] = []
  const wartend: { id: string; wartetAuf: string[] }[] = []
  for (const p of offen) {
    const wartetAuf = (deps.get(p.id) ?? []).filter(d => status.get(d) !== 'fertig')
    if (wartetAuf.length === 0) startbar.push(p.id)
    else wartend.push({ id: p.id, wartetAuf })
  }

  // Schleife nur unter offenen Paketen: Tiefensuche mit Pfad
  const offenIds = new Set(offen.map(p => p.id))
  let zyklus: string[] | null = null
  const done = new Set<string>()
  const visit = (id: string, path: string[]): void => {
    if (zyklus || done.has(id)) return
    const at = path.indexOf(id)
    if (at >= 0) {
      zyklus = path.slice(at)
      return
    }
    for (const d of deps.get(id) ?? []) if (offenIds.has(d)) visit(d, [...path, id])
    done.add(id)
  }
  for (const p of offen) visit(p.id, [])

  const inArbeit = pakete.some(p => p.status === 'in-arbeit')
  return { startbar, wartend, zyklus, keinesStartbar: !inArbeit && offen.length > 0 && startbar.length === 0 }
}
