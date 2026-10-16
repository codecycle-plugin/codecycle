import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import type { Task } from '../../lib/task-file.ts'
import type { TaskState } from '../../types'
import { ToolBroken } from '../errors.ts'
import { planFile, stateFile, taskFile } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { renderPlanHtml } from '../plan-html.ts'
import { findProjectRoot } from '../project.ts'

/**
 * `plan-html <aufgabenordner>`: schreibt `<aufgabenordner>/plan.html` (Schalter `plan-html`, Schritt 3).
 * PLAN.md ist Pflicht, TASK.md und STATE.md sind optional (unlesbar: die Seite entsteht ohne sie, mit Hinweis).
 * Gibt den Pfad der Seite aus. Exit 0; 1, wenn PLAN.md fehlt oder nicht lesbar ist; 2 bei falschem Aufruf.
 */
export function planHtml(args: string[], ctx: Ctx): number {
  const folder = args.find(a => !a.startsWith('--'))
  if (!folder || args.length !== 1) throw new ToolBroken('Aufruf: codecycle plan-html <aufgabenordner>')
  const root = findProjectRoot(ctx.cwd)
  const dir = isAbsolute(folder) ? folder : [resolve(ctx.cwd, folder), resolve(root, folder)].find(p => existsSync(join(p, 'PLAN.md'))) ?? resolve(ctx.cwd, folder)

  const planPath = join(dir, 'PLAN.md')
  if (!existsSync(planPath)) {
    ctx.out(`plan-html: PLAN.md fehlt in ${folder}`)
    return 1
  }
  let planText: string
  let plan
  try {
    planText = readFileSync(planPath, 'utf8')
    plan = planFile.parsePlan(planText, 'PLAN.md')
  } catch (err) {
    ctx.out(`plan-html: PLAN.md nicht lesbar: ${(err as Error).message}`)
    return 1
  }

  const notes: string[] = []
  let task: Task | null = null
  if (existsSync(join(dir, 'TASK.md'))) {
    try {
      task = taskFile.parseTask(readFileSync(join(dir, 'TASK.md'), 'utf8'), 'TASK.md')
    } catch (err) {
      notes.push(`plan-html: TASK.md übergangen: ${(err as Error).message}`)
    }
  }
  let state: TaskState | null = null
  if (existsSync(join(dir, 'STATE.md'))) {
    try {
      state = stateFile.parseState(readFileSync(join(dir, 'STATE.md'), 'utf8'), 'STATE.md')
    } catch (err) {
      notes.push(`plan-html: STATE.md übergangen: ${(err as Error).message}`)
    }
  }

  const out = join(dir, 'plan.html')
  writeFileSync(out, renderPlanHtml({ plan, planText, task, state }))
  notes.forEach(n => ctx.out(n))
  ctx.out(out)
  return 0
}
