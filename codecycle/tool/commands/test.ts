import { ToolBroken } from '../errors.ts'
import { shellArg } from '../exec.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree, loadConfig } from '../project.ts'
import { runAffected } from '../run-affected.ts'
import { runStep } from '../step.ts'

/** `test [filter]`, `test --affected [--staged]` (nur Tests zum aktuellen Diff, über Graph oder Namenskonvention). */
export function test(args: string[], ctx: Ctx): number {
  const affected = args.includes('--affected')
  const staged = args.includes('--staged')
  const option = args.find(a => a.startsWith('--') && a !== '--affected' && a !== '--staged')
  if (option) throw new ToolBroken(`unbekannte Option ${option}`)
  if (staged && !affected) throw new ToolBroken('--staged gilt nur mit --affected')
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const config = loadConfig(root)
  const base = config.commands.test
  if (base === undefined) throw new ToolBroken('kein Testbefehl in .codecycle/tool.config.json eingetragen')
  if (base === null) {
    ctx.out('test: nicht vorhanden')
    return 0
  }
  if (affected) {
    if (args.some(a => !a.startsWith('--'))) throw new ToolBroken('--affected und Filter schließen sich aus')
    const r = runAffected(root, work, config, staged)
    r.lines.forEach(line => ctx.out(line))
    return r.code
  }
  const filter = args.join(' ').trim()
  // als ein Argument, sonst zerlegt die Shell „eine Zeile“ und ein Runner findet
  // keinen Test (falsches Grün); Funktion statt Text: kein `$'`-Ersatzmuster
  const arg = shellArg('CODECYCLE_FILTER', filter)
  const command =
    filter === ''
      ? base
      : config.commands.testFilter
        ? config.commands.testFilter.replaceAll('{filter}', () => arg.ref)
        : `${base} ${arg.ref}`
  const step = runStep(work, config, 'test', command, filter === '' ? undefined : arg.env)
  step.lines.forEach(line => ctx.out(line))
  return step.code
}
