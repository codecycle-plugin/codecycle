import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Plan } from '../../lib/plan-file.ts'
import type { TaskState } from '../../types'
import { agentHints, gitHints, mainBranch } from '../git-hints.ts'
import { pathsLib, planFile, stateFile } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { CONFIG_PATH, type ToolConfig, findProjectRoot, loadConfig } from '../project.ts'

const { analyzeStartability, parsePlan } = planFile
const { DONE_STATES, currentPackage, parseState } = stateFile

const { TASKS_DIR } = pathsLib

/** Budgetangabe der Kopfzeile; Nachläufe erhöhen nur verbraucht und nachlauf, nie geplant. */
function budgetText(b: TaskState['budget']): string {
  let text = `Budget ${b.verbraucht}/${b.geplant}`
  if (b.nachlauf > 0) text += ` (Nachlauf ${b.nachlauf})`
  const over = b.verbraucht - b.geplant
  if (over > 0) {
    text += ` · über Plan +${over}`
    if (over > b.nachlauf) text += `, davon ohne Nachlauf-Grund: ${over - b.nachlauf}`
  }
  return text
}

/** Namen der sechs Haltepunkte des Solo-Wegs (skills/solo/SKILL.md) */
const SOLO_STOPS: Record<number, string> = {
  1: 'Start',
  2: 'Kurzplan',
  3: 'Eigene Kontrolle',
  4: 'Prüfung',
  5: 'Nachbesserung',
  6: 'Abschluss',
}

type Row = { folder: string; state?: TaskState; error?: string; plan?: Plan; planError?: string }

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
      const row: Row = { folder: entry.name, state: parseState(readFileSync(join(root, path), 'utf8'), path) }
      // PLAN.md ist optional (vor dem Planen gibt es keine); ein kaputter Plan stoppt die Übersicht nicht
      const planPath = `${TASKS_DIR}/${entry.name}/PLAN.md`
      if (existsSync(join(root, planPath))) {
        try {
          row.plan = parsePlan(readFileSync(join(root, planPath), 'utf8'), planPath)
        } catch (err) {
          row.planError = `${planPath}: ${(err as Error).message}`
        }
      }
      rows.push(row)
    } catch (err) {
      rows.push({ folder: entry.name, error: `${path}: ${(err as Error).message}` })
    }
  }
  rows.sort((a, b) => (b.state?.zuletzt ?? '').localeCompare(a.state?.zuletzt ?? '') || b.folder.localeCompare(a.folder))

  if (rows.length === 0) ctx.out('keine Aufgaben')
  let stuck = false
  for (const row of rows) {
    const s = row.state
    if (!s) {
      ctx.out(`${row.folder} · nicht lesbar`)
      ctx.out(`  ! ${row.error}`)
      continue
    }
    // Solo-Weg: kein Paket, sondern der Haltepunkt (1–6)
    if (s.weg === 'solo') {
      const teile = s.teile ?? []
      const done = teile.filter(p => p.status === 'fertig').length
      const open = teile.find(p => p.status !== 'fertig')
      // große Aufgabe: Zwischen-Haltepunkt 2.n nach jedem fertigen Teil
      const parts = teile.length > 0 ? ` · Teile ${done}/${teile.length}${open ? ` (jetzt ${open.name})` : ''}` : ''
      const halt = s.haltepunkt ? `Haltepunkt ${s.haltepunkt}${SOLO_STOPS[s.haltepunkt] ? ` (${SOLO_STOPS[s.haltepunkt]})` : ''}` : 'Haltepunkt ?'
      ctx.out(`${s.aufgabe} · ${s.zustand} · solo · ${halt}${parts}${s.geprueftAuf ? ` · geprüft auf ${s.geprueftAuf.slice(0, 7)}` : ''} · zuletzt ${s.zuletzt}`)
      if (s.naechsterSchritt[0]) ctx.out(`  nächster Schritt: ${s.naechsterSchritt[0]}`)
      for (const hint of gitHints(root, s, main, today)) ctx.out(`  ! ${hint}`)
      for (const hint of agentHints(root, `${TASKS_DIR}/${row.folder}`, s, today)) ctx.out(`  ! ${hint}`)
      continue
    }
    const done = s.pakete.filter(p => p.status === 'fertig').length
    // "jetzt Pn" nur bei einem offenen Paket (currentPackage fällt sonst auf das letzte zurück)
    const cur = DONE_STATES.includes(s.zustand) ? undefined : currentPackage(s)
    const current = cur && cur.status !== 'fertig' ? cur : undefined
    ctx.out(
      `${s.aufgabe} · ${s.zustand} · Pakete ${done}/${s.pakete.length}` +
        `${current ? ` (jetzt ${current.id})` : ''} · ${budgetText(s.budget)}` +
        ` · zuletzt ${s.zuletzt}`,
    )
    if (s.naechsterSchritt[0]) ctx.out(`  nächster Schritt: ${s.naechsterSchritt[0]}`)
    for (const hint of gitHints(root, s, main, today)) ctx.out(`  ! ${hint}`)
    for (const hint of agentHints(root, `${TASKS_DIR}/${row.folder}`, s, today)) ctx.out(`  ! ${hint}`)
    if (row.planError) ctx.out(`  ! ${row.planError}`)
    if (!DONE_STATES.includes(s.zustand)) {
      const a = analyzeStartability(s.pakete, row.plan)
      if (a.keinesStartbar) {
        stuck = true
        const waiting = a.wartend.map(w => `${w.id} wartet auf ${w.wartetAuf.join(', ')}`).join('; ')
        ctx.out(`  ! kein Paket startbar: ${waiting}`)
        if (a.zyklus) ctx.out(`  ! Abhängigkeitsschleife: ${[...a.zyklus, a.zyklus[0]].join(' -> ')}`)
      }
    }
  }
  // Exit 1, wenn eine laufende Aufgabe festsitzt (Abschnitt 10a: 1 = rot); sonst wie bisher 0
  return stuck ? 1 : 0
}
