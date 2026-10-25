// Graph für einen Befehl öffnen: Anbieter aus der Konfiguration wählen, Zustand prüfen,
// Hinweistext für den Rückfall bereithalten. Ein Graph, der nicht antwortet, ist kein Fehler.

import { type GraphAdapter, selectGraph, usableStatus } from './graph/index.ts'
import type { Run } from './graph/types.ts'
import { tryLoadConfig } from './project.ts'

export type OpenGraph = {
  /** nutzbarer Anbieter oder null */
  adapter: GraphAdapter | null
  /** warum kein Graph, sonst Hinweis auf veralteten Stand, sonst null */
  note: string | null
}

/** Test-Haken: tauscht den Programmaufruf aus (gefälschte Ausgaben). */
export const hooks: { run?: Run } = {}

export function openGraph(root: string): OpenGraph {
  const config = tryLoadConfig(root)
  const sel = selectGraph(root, config?.graph?.provider, hooks.run)
  if (!sel.adapter) return { adapter: null, note: sel.note }
  const { ok, status } = usableStatus(sel.adapter, root)
  if (!ok) {
    return { adapter: null, note: `${sel.adapter.label}: ${status ? status.detail : 'antwortet nicht'}` }
  }
  return { adapter: sel.adapter, note: status?.state === 'stale' ? `Graph veraltet: ${status.detail}` : null }
}
