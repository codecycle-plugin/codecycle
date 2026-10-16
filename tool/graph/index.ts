// Auswahl des Graph-Anbieters (tool.config.json: graph.provider) und gemeinsame Hilfen.

import type { GraphProviderName } from '../project.ts'
import { createCodeReviewGraph } from './code-review-graph.ts'
import { createCodegraph } from './codegraph.ts'
import type { GraphAdapter, GraphStatus, ProviderId, Run } from './types.ts'
import { defaultRun } from './util.ts'

export type { GSymbol, GraphAdapter, GraphStatus, ImpactResult, ProviderId, Run } from './types.ts'

export function createAdapter(id: ProviderId, run: Run = defaultRun): GraphAdapter {
  return id === 'codegraph' ? createCodegraph(run) : createCodeReviewGraph(run)
}

export type Selection = {
  adapter: GraphAdapter | null
  /** Grund, warum es keinen Graphen gibt (für den Hinweis), sonst null */
  note: string | null
}

const ORDER: ProviderId[] = ['code-review-graph', 'codegraph']

/**
 * `none`: kein Graph. Ausdrücklicher Anbieter: genau dieser, mit Hinweis, wenn er fehlt.
 * `auto`: erster Anbieter mit vorhandenem Index im Projekt, der auch installiert ist.
 * Es wird nie ein Index angelegt und nichts installiert.
 */
export function selectGraph(root: string, provider: GraphProviderName | undefined, run: Run = defaultRun): Selection {
  const choice = provider ?? 'auto'
  if (choice === 'none') return { adapter: null, note: 'Graph abgeschaltet (graph.provider none)' }
  const ids: ProviderId[] = choice === 'auto' ? ORDER : [choice]
  const notes: string[] = []
  for (const id of ids) {
    const a = createAdapter(id, run)
    if (!a.hasIndex(root)) {
      notes.push(`${a.label}: kein Index`)
      continue
    }
    if (!a.installed(root)) {
      notes.push(`${a.label}: nicht installiert`)
      continue
    }
    return { adapter: a, note: null }
  }
  return { adapter: null, note: `kein Graph (${notes.join('; ')})` }
}

/** Ein Graph mit leerem Index wird nicht befragt; ein veralteter schon (die Auflösung prüft die Zeilen selbst). */
export function usableStatus(adapter: GraphAdapter, root: string): { ok: boolean; status: GraphStatus | null } {
  const status = adapter.status(root)
  return { ok: status !== null && (status.state === 'fresh' || status.state === 'stale'), status }
}
