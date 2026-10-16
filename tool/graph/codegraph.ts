// Adapter für CodeGraph (github.com/colbymchenry/codegraph, npm @colbymchenry/codegraph, CLI `codegraph`).
// BESTÄTIGT (README; Programm hier nicht installiert, nicht ausprobiert): Befehle
// `query <text> [--kind] [--limit] [--json]`, `callers <symbol> [--limit] [--json]`, `callees`,
// `impact <symbol> [--depth] [--json]`, `files`, `node <symbol|datei>` (Quelltext mit Zeilennummern),
// `affected [dateien…] [--stdin] [-d] [-f] [-j]`, `sync`, `status`; Index `.codegraph/codegraph.db`.
// UNBESTÄTIGT: die Feldnamen der JSON-Ausgabe (die README nennt keine), ob Symbole Start- und
// Endzeilen tragen, und was `affected` genau liefert (hier angenommen: Testdateien zu geänderten
// Dateien). Deshalb liest der Adapter tolerant: mehrere Feldnamen, Liste oder Objekt mit Liste.
// Was sich nicht lesen lässt, ergibt `null` (Rückfall), nie geratene Werte. Fehlt die Endzeile,
// bleibt `ende` leer und die Auflösung schätzt (Hinweis „Bereich geschätzt“).

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { GSymbol, GraphAdapter, GraphStatus, ImpactResult, Run } from './types.ts'
import { isTestPath, parseJson, relPath } from './util.ts'

const CMD = 'codegraph'

type Raw = Record<string, unknown>

const str = (o: Raw, ...keys: string[]): string | undefined => {
  for (const k of keys) if (typeof o[k] === 'string' && o[k] !== '') return o[k] as string
  return undefined
}
const num = (o: Raw, ...keys: string[]): number | undefined => {
  for (const k of keys) if (typeof o[k] === 'number') return o[k] as number
  return undefined
}

/** Liste aus `[...]` oder `{ results|nodes|symbols|items|callers|affected|tests|files: [...] }`. */
function listOf(j: unknown): unknown[] | null {
  if (Array.isArray(j)) return j
  if (j && typeof j === 'object') {
    for (const k of ['results', 'nodes', 'symbols', 'items', 'callers', 'affected', 'tests', 'files']) {
      const v = (j as Raw)[k]
      if (Array.isArray(v)) return v
    }
  }
  return null
}

export function toSymbol(root: string, n: unknown): GSymbol | null {
  if (!n || typeof n !== 'object') return null
  const o = n as Raw
  // manche Ausgaben verschachteln: { node: {...} } oder { symbol: {...} }
  const inner = (o.node ?? o.symbol) as Raw | undefined
  const r: Raw = inner && typeof inner === 'object' ? { ...o, ...inner } : o
  const name = str(r, 'name', 'symbol')
  const file = str(r, 'filePath', 'file_path', 'file', 'path')
  if (!name || !file) return null
  const datei = relPath(root, file)
  const start = num(r, 'startLine', 'start_line', 'line_start', 'line')
  const ende = num(r, 'endLine', 'end_line', 'line_end')
  const parent = str(r, 'parent', 'parentName', 'parent_name', 'container', 'className')
  return {
    name,
    kind: str(r, 'kind', 'type') ?? '',
    datei,
    ...(start !== undefined ? { start } : {}),
    ...(ende !== undefined ? { ende } : {}),
    ...(parent ? { parent } : {}),
    isTest: isTestPath(datei),
    ref: name,
  }
}

function paths(root: string, list: unknown[]): string[] {
  return [
    ...new Set(
      list.flatMap(x => {
        if (typeof x === 'string') return [relPath(root, x)]
        const s = toSymbol(root, x)
        if (s) return [s.datei]
        const f = x && typeof x === 'object' ? str(x as Raw, 'filePath', 'file_path', 'file', 'path') : undefined
        return f ? [relPath(root, f)] : []
      }),
    ),
  ]
}

export function createCodegraph(run: Run): GraphAdapter {
  const json = (root: string, args: string[]): unknown => {
    const r = run(CMD, args, root)
    if (r.missing || r.code !== 0) return null
    return parseJson(r.stdout)
  }
  const symbols = (root: string, args: string[]): GSymbol[] | null => {
    const list = listOf(json(root, args))
    return list ? list.map(n => toSymbol(root, n)).filter((s): s is GSymbol => s !== null) : null
  }
  const affected = (root: string, files: string[]): string[] | null => {
    if (files.length === 0) return []
    const list = listOf(json(root, ['affected', ...files, '--json']))
    return list ? paths(root, list) : null
  }

  return {
    id: 'codegraph',
    label: 'CodeGraph',
    updateCommand: 'codegraph sync',
    hasIndex: root => existsSync(join(root, '.codegraph')),
    installed: root => {
      const r = run(CMD, ['--version'], root)
      return !r.missing && r.code === 0
    },
    status(root): GraphStatus | null {
      const r = run(CMD, ['status'], root)
      if (r.missing || r.code !== 0) return null
      // Ob der Index veraltet ist, sagt `status` nicht (unbestätigt): „frisch“ nur im Sinne von „vorhanden“
      const first = (r.stdout.trim().split(/\r?\n/)[0] ?? '').slice(0, 100)
      return { state: 'fresh', detail: `${first} (Aktualität unbekannt; codegraph sync)` }
    },
    find(root, name) {
      const found = symbols(root, ['query', name, '--limit', '30', '--json'])
      return found ? found.filter(s => !s.isTest && s.name === name && s.kind.toLowerCase() !== 'file') : null
    },
    callers: (root, s) => symbols(root, ['callers', s.ref, '--limit', '50', '--json'])?.filter(c => !c.isTest) ?? null,
    // CodeGraph kennt kein „Tests zu Symbol“: Testdateien, die von der Datei des Symbols betroffen sind (gröber)
    testsFor(root, s) {
      const files = affected(root, [s.datei])
      return files ? files.map(f => ({ name: f, kind: 'Test', datei: f, isTest: true, ref: f })) : null
    },
    impact(root, files): ImpactResult | null {
      const tests = affected(root, files)
      if (tests === null) return null
      // kein Risikowert und keine Symbole je Diff: der Aufrufer leitet geänderte Symbole aus dem Diff ab
      return { risk: null, changed: [], files: [], tests, testGaps: [] }
    },
    affectedTests: (root, files) => affected(root, files),
    update(root) {
      const r = run(CMD, ['sync'], root)
      return !r.missing && r.code === 0
    },
  }
}
