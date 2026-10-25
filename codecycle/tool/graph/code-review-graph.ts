// Adapter für code-review-graph (CLI `code-review-graph`).
// BESTÄTIGT (Version vor Ort ausprobiert, Windows): `status --json`,
// `search <text> [--kind K] [--limit N]`, `query <muster> <ziel>` mit callers_of / tests_for,
// `impact [--files …]`, `detect-changes [--base B]` (JSON, Risiko), `update [-q] [--base B]`.
// Alle liefern JSON mit absoluten Pfaden (Windows: Rückstriche), `query` bei mehreren
// Treffern `status: "ambiguous"`. Index in `.code-review-graph/`. Die CLI kann also mehr, als die
// README für die CLI nennt (dort laufen Aufrufer/Impact über MCP); der Adapter nutzt die CLI.
// UNBESTÄTIGT: wie `search` Methoden benennt (Klasse.Methode oder nur Name); der Elternname
// wird aus `parent_name` bzw. `qualified_name` gelesen, wenn vorhanden. Fällt eine Abfrage aus,
// liefert der Adapter `null` (Rückfall auf Outline).

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { GSymbol, GraphAdapter, GraphStatus, ImpactResult, Run } from './types.ts'
import { isTestPath, parseJson, relPath } from './util.ts'

const CMD = 'code-review-graph'

type RawNode = {
  name?: string
  kind?: string
  qualified_name?: string
  file_path?: string
  line_start?: number
  line_end?: number
  parent_name?: string | null
  is_test?: boolean
}

function toSymbol(root: string, n: RawNode): GSymbol | null {
  if (typeof n.name !== 'string' || typeof n.file_path !== 'string') return null
  const datei = relPath(root, n.file_path)
  // `<pfad>::Klasse.methode`: Elternname aus dem qualifizierten Namen, falls kein parent_name
  const q = typeof n.qualified_name === 'string' ? n.qualified_name.split('::').slice(1).join('::') : ''
  const parts = q.split(/\.|::/).filter(Boolean)
  const parent = n.parent_name ?? (parts.length > 1 ? parts[parts.length - 2] : undefined)
  return {
    name: n.name,
    kind: n.kind ?? '',
    datei,
    ...(typeof n.line_start === 'number' ? { start: n.line_start } : {}),
    ...(typeof n.line_end === 'number' ? { ende: n.line_end } : {}),
    ...(parent ? { parent } : {}),
    isTest: n.is_test === true || n.kind === 'Test' || isTestPath(datei),
    ref: n.qualified_name ?? n.name,
  }
}

function nodes(root: string, list: unknown): GSymbol[] {
  if (!Array.isArray(list)) return []
  return list.map(n => toSymbol(root, n as RawNode)).filter((s): s is GSymbol => s !== null)
}

export function createCodeReviewGraph(run: Run): GraphAdapter {
  const json = (root: string, args: string[]): Record<string, unknown> | null => {
    const r = run(CMD, [...args, '--repo', root], root)
    if (r.missing || r.code !== 0) return null
    const j = parseJson(r.stdout)
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
  }
  const query = (root: string, pattern: string, symbol: GSymbol): GSymbol[] | null => {
    const j = json(root, ['query', pattern, symbol.ref])
    if (!j || (j.status !== 'ok' && j.status !== undefined)) return null
    return nodes(root, j.results)
  }

  return {
    id: 'code-review-graph',
    label: 'code-review-graph',
    updateCommand: 'code-review-graph update --quiet',
    hasIndex: root => existsSync(join(root, '.code-review-graph')),
    installed: root => {
      const r = run(CMD, ['--version'], root)
      return !r.missing && r.code === 0
    },
    status(root): GraphStatus | null {
      const j = json(root, ['status', '--json'])
      if (!j) return null
      if (!j.nodes) return { state: 'empty', detail: 'Graph leer (code-review-graph build)' }
      const built = j.built_at_commit
      const cur = j.current_sha
      if (typeof built === 'string' && typeof cur === 'string' && built !== cur) {
        return { state: 'stale', detail: `Graph von ${built.slice(0, 7)}, Stand ${cur.slice(0, 7)} (code-review-graph update)` }
      }
      return { state: 'fresh', detail: `${String(j.nodes)} Knoten, ${String(j.files)} Dateien` }
    },
    find(root, name) {
      const j = json(root, ['search', name, '--limit', '30'])
      if (!j) return null
      return nodes(root, j.results).filter(s => !s.isTest && s.kind !== 'File' && s.name === name)
    },
    callers: (root, s) => query(root, 'callers_of', s),
    testsFor: (root, s) => query(root, 'tests_for', s),
    impact(root, files): ImpactResult | null {
      const detect = json(root, ['detect-changes', '--base', 'HEAD'])
      const imp = json(root, ['impact', '--files', ...files])
      if (!detect && !imp) return null
      const changed = Array.isArray(detect?.changed_functions)
        ? (detect.changed_functions as (RawNode & { risk_score?: number })[]).flatMap(n => {
            const symbol = toSymbol(root, n)
            return symbol ? [{ symbol, risk: typeof n.risk_score === 'number' ? n.risk_score : null }] : []
          })
        : []
      const impacted = nodes(root, imp?.impacted_nodes)
      const tests = [...new Set(impacted.filter(s => s.isTest).map(s => s.datei))]
      const impactedFiles = Array.isArray(imp?.impacted_files) ? (imp.impacted_files as string[]).map(f => relPath(root, f)) : []
      const gaps = Array.isArray(detect?.test_gaps)
        ? (detect.test_gaps as RawNode[]).map(n => n.name).filter((n): n is string => typeof n === 'string')
        : []
      return {
        risk: typeof detect?.risk_score === 'number' ? detect.risk_score : null,
        changed,
        files: impactedFiles.filter(f => !files.includes(f) && !isTestPath(f)),
        tests,
        testGaps: gaps,
      }
    },
    affectedTests(root, files) {
      const imp = json(root, ['impact', '--files', ...files])
      if (!imp) return null
      return [...new Set(nodes(root, imp.impacted_nodes).filter(s => s.isTest).map(s => s.datei))]
    },
    update(root, base) {
      const r = run(CMD, ['update', '-q', ...(base ? ['--base', base] : []), '--repo', root], root)
      return !r.missing && r.code === 0
    },
  }
}
