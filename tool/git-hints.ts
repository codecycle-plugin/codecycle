// Abgleich Status gegen Git: STATE.md ist ein Hinweis, Git die Wahrheit.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { TaskState } from '../types'
import { git } from './exec.ts'
import { pathsLib, stateFile } from './lib-path.ts'
import type { ToolConfig } from './project.ts'

const { DONE_STATES } = stateFile

export const STALE_DAYS = 14

/** Ein Agent ohne Urteil, der so lange nichts getan hat, gilt als abgebrochen. */
export const STALE_AGENT_MINUTES = 30

function dauer(minuten: number): string {
  if (minuten < 60) return `${minuten} Min.`
  if (minuten < 24 * 60) return `${Math.floor(minuten / 60)} Std.`
  const tage = Math.floor(minuten / (24 * 60))
  return `${tage} ${tage === 1 ? 'Tag' : 'Tage'}`
}

/**
 * Hinweise zu Agenten aus `agents.json` im Aufgabenordner (Format: hooks/lib/ledger-registry.ts, hier tolerant gelesen):
 * ohne Urteil und länger still als STALE_AGENT_MINUTES = vermutlich abgebrochen. Fehlende Datei: kein Hinweis.
 */
export function agentHints(root: string, taskDir: string, state: TaskState, now: Date): string[] {
  if (DONE_STATES.includes(state.zustand)) return []
  const path = join(root, taskDir, 'agents.json')
  if (!existsSync(path)) return []
  let agenten: unknown
  try {
    agenten = (JSON.parse(readFileSync(path, 'utf8')) as { agenten?: unknown }).agenten
  } catch {
    return ['agents.json nicht lesbar']
  }
  if (typeof agenten !== 'object' || agenten === null) return []
  const hints: string[] = []
  for (const a of Object.values(agenten) as Array<Record<string, unknown>>) {
    if (typeof a !== 'object' || a === null || a.urteil) continue
    const zeit = Date.parse(String(a.letzteAktivitaet ?? a.gestartet ?? ''))
    if (Number.isNaN(zeit)) continue
    const minuten = Math.floor((now.getTime() - zeit) / 60_000)
    if (minuten < STALE_AGENT_MINUTES) continue
    const id = String(a.id ?? '').slice(0, 8)
    hints.push(
      `${String(a.rolle ?? '?')} ${typeof a.paket === 'string' ? a.paket : 'alle'} (${id}) ohne Urteil, still seit ${dauer(minuten)}: abgebrochen? Neu starten zählt als Nachlauf`,
    )
  }
  return hints
}

/** Hauptzweig: Konfiguration, sonst `main` oder `master` je nachdem, was existiert (Regel in `lib/paths.ts`). */
export function mainBranch(root: string, config?: ToolConfig): string {
  const value = config?.mainBranch
  const configured = typeof value === 'string' && value.trim() !== ''
  const exists = configured ? null : git(['rev-parse', '--verify', '--quiet', 'refs/heads/main'], root).ok
  return pathsLib.mainBranchFrom(value, exists)
}

function daysSince(date: string, today: Date): number | null {
  const then = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(then)) return null
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.floor((now - then) / 86_400_000)
}

export function gitHints(root: string, state: TaskState, main: string, today: Date): string[] {
  if (DONE_STATES.includes(state.zustand)) return []
  const hints: string[] = []
  if (state.branch !== '') {
    const exists = git(['rev-parse', '--verify', '--quiet', `refs/heads/${state.branch}`], root).ok
    const remote = !exists && git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${state.branch}`], root).ok
    if (remote) {
      // Ablage „teilen“: auf einem zweiten Gerät gibt es den Branch oft nur auf origin
      hints.push(`Branch ${state.branch} nur auf origin: git switch ${state.branch}`)
    } else if (!exists) {
      hints.push(`Branch ${state.branch} fehlt: fertig oder verworfen?`)
    } else {
      // Ein frisch angelegter Branch zeigt auf denselben Commit wie main und ist
      // damit auch „enthalten“; erst ein Merge-Commit macht den Unterschied.
      // Grenze: ein Fast-Forward-Merge wird so nicht erkannt.
      const merged = git(['merge-base', '--is-ancestor', state.branch, main], root).ok
      const sameTip = git(['rev-parse', state.branch], root).out === git(['rev-parse', main], root).out
      if (merged && !sameTip) hints.push(`Branch ${state.branch} ist schon in ${main}: als fertig markieren?`)
    }
  }
  for (const p of state.pakete) {
    if (p.status === 'in-arbeit' && p.commit === null) hints.push(`${p.id} in Arbeit, noch ohne Commit (abgebrochen?)`)
  }
  const days = daysSince(state.zuletzt, today)
  if (days !== null && days >= STALE_DAYS) hints.push(`ruht seit ${days} Tagen`)
  return hints
}
