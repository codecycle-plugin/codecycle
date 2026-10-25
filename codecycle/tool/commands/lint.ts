import { ToolBroken } from '../errors.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree, loadConfig } from '../project.ts'
import { runStep } from '../step.ts'

function configured(label: 'lint' | 'format', args: string[], ctx: Ctx): number {
  if (args.length > 0) throw new ToolBroken(`${label} nimmt keine Argumente (unbekannt: ${args[0]})`)
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const config = loadConfig(root)
  const command = config.commands[label]
  // wie in `check`: fehlend ist kein Werkzeugfehler, wird aber benannt
  if (command === undefined) {
    ctx.out(`${label}: nicht eingerichtet`)
    return 0
  }
  if (command === null) {
    ctx.out(`${label}: nicht vorhanden`)
    return 0
  }
  const step = runStep(work, config, label, command)
  step.lines.forEach(line => ctx.out(line))
  return step.code
}

export const lint = (args: string[], ctx: Ctx): number => configured('lint', args, ctx)
export const format = (args: string[], ctx: Ctx): number => configured('format', args, ctx)
