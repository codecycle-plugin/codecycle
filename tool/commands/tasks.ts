import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { TaskState } from '../../types'
import { agentHints, gitHints, mainBranch } from '../git-hints.ts'
import { pathsLib, stateFile } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { CONFIG_PATH, type ToolConfig, findProjectRoot, loadConfig } from '../project.ts'

const { parseState } = stateFile

const { TASKS_DIR } = pathsLib

/** Namen der sechs Haltepunkte von /codecycle:new (skills/new/SKILL.md) */
const SOLO_STOPS: Record<number, string> = {
  1: 'Entwurf',
  2: 'Plan',
  3: 'Eigene Kontrolle',
  4: 'Prüfung',
  5: 'Nachbesserung',
  6: 'Abschluss',
}

type Row = { folder: string; state?: TaskState; error?: string }

export function tasks(_args: string[], ctx: Ctx): number {
  const root = findProjectRoot(ctx.cwd)
  const dir = join(root, TASKS_DIR)
  if (!existsSync(dir)) {
    ctx.out(`keine Aufgaben (${TASKS_DIR}/ fehlt)`)
    return 0
  }
  // Die Übersicht braucht aus der Konfiguration nur mainBranch; ein Fehler dort
  // darf sie nicht verhindern (continue stützt sich auf tasks).
  let config: ToolConfig | undefined
  try {
    config = existsSync(join(root, CONFIG_PATH)) ? loadConfig(root) : undefined
  } catch (err) {
    ctx.out(`! Konfiguration fehlerhaft: ${(err as Error).message} (Hauptbranch geraten)`)
  }
  const main = mainBranch(root, config)
  const today = new Date()

  const rows: Row[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = `${TASKS_DIR}/${entry.name}/STATE.md`
    if (!existsSync(join(root, path))) continue
    try {
      rows.push({ folder: entry.name, state: parseState(readFileSync(join(root, path), 'utf8'), path) })
    } catch (err) {
      rows.push({ folder: entry.name, error: `${path}: ${(err as Error).message}` })
    }
  }
  rows.sort((a, b) => (b.state?.zuletzt ?? '').localeCompare(a.state?.zuletzt ?? '') || b.folder.localeCompare(a.folder))

  if (rows.length === 0) ctx.out('keine Aufgaben')
  for (const row of rows) {
    const s = row.state
    if (!s) {
      ctx.out(`${row.folder} · nicht lesbar`)
      ctx.out(`  ! ${row.error}`)
      continue
    }
    // Haltepunkt (1–6), bei großen Aufgaben dazu die Teile
    if (s.weg === 'solo') {
      const teile = s.teile ?? []
      const done = teile.filter(p => p.status === 'fertig').length
      const open = teile.find(p => p.status !== 'fertig')
      // große Aufgabe: Teile nacheinander, ein Teil in Arbeit mit seinem Branch
      const now = open ? ` (jetzt ${open.name}${open.status === 'in-arbeit' ? `, in Arbeit auf ${open.branch ?? '?'}` : ''})` : ''
      const parts = teile.length > 0 ? ` · Teile ${done}/${teile.length}${now}` : ''
      const halt = s.haltepunkt ? `Haltepunkt ${s.haltepunkt}${SOLO_STOPS[s.haltepunkt] ? ` (${SOLO_STOPS[s.haltepunkt]})` : ''}` : 'Haltepunkt ?'
      ctx.out(`${s.aufgabe} · ${s.zustand} · solo · ${halt}${parts}${s.geprueftAuf ? ` · geprüft auf ${s.geprueftAuf.slice(0, 7)}` : ''} · zuletzt ${s.zuletzt}`)
      if (s.naechsterSchritt[0]) ctx.out(`  nächster Schritt: ${s.naechsterSchritt[0]}`)
      for (const hint of gitHints(root, s, main, today)) ctx.out(`  ! ${hint}`)
      for (const hint of agentHints(root, `${TASKS_DIR}/${row.folder}`, s, today)) ctx.out(`  ! ${hint}`)
      continue
    }
    // weg: voll oder ohne weg: Aufgabe aus dem vollen Ablauf, nicht fortsetzbar
    ctx.out(`${s.aufgabe} · ${s.zustand} · voller Ablauf, nicht fortsetzbar (neu mit /codecycle:new) · zuletzt ${s.zuletzt}`)
    for (const hint of gitHints(root, s, main, today)) ctx.out(`  ! ${hint}`)
  }
  return 0
}
