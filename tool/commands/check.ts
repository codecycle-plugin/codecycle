import { ToolBroken } from '../errors.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree, loadConfig } from '../project.ts'
import { runAffected } from '../run-affected.ts'
import { redMarkMatches } from '../red-tests.ts'
import { runStep } from '../step.ts'

/**
 * Lint, Format, Tests zusammen; Ergebnis ist der schlechteste Schritt (2 > 1 > 0).
 * `--full`: ganze Suite. `--affected [--staged]`: nur Tests zum Diff (gestufter Pre-Commit).
 */
export function check(args: string[], ctx: Ctx): number {
  const unknown = args.find(a => !['--full', '--affected', '--staged'].includes(a))
  if (unknown) throw new ToolBroken(`unbekannte Option ${unknown}`)
  const full = args.includes('--full')
  const affected = args.includes('--affected')
  const staged = args.includes('--staged')
  if (full && affected) throw new ToolBroken('--full und --affected schließen sich aus')
  if (staged && !affected) throw new ToolBroken('--staged gilt nur mit --affected')
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const config = loadConfig(root)
  const { lint, format, test, testFull } = config.commands
  if (test === undefined) throw new ToolBroken('kein Testbefehl in .codecycle/tool.config.json eingetragen')
  // ohne eigene Gesamt-Suite (`testFull` null oder fehlend) ist `test` schon die ganze Suite
  const steps: [string, string | null | undefined][] = [
    ['lint', lint],
    ['format', format],
    ['test', full ? (testFull ?? test) : test],
  ]
  let worst = 0
  for (const [label, command] of steps) {
    // Lint und Format sind freiwillig: fehlend ist kein Werkzeugfehler, wird aber benannt
    if (command === undefined) {
      ctx.out(`${label}: nicht eingerichtet`)
      continue
    }
    if (command === null) {
      ctx.out(`${label}: nicht vorhanden`)
      continue
    }
    if (label === 'test' && affected) {
      const r = runAffected(root, work, config, staged, staged && redMarkMatches(work))
      r.lines.forEach(line => ctx.out(line))
      worst = Math.max(worst, r.code)
      continue
    }
    const step = runStep(work, config, label, command)
    step.lines.forEach(line => ctx.out(line))
    worst = Math.max(worst, step.code)
  }
  return worst
}
