import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { OutlineSymbol } from '../../lib/outline.ts'
import { changedFiles, changedRanges, diffBase } from '../changes.ts'
import { ToolBroken } from '../errors.ts'
import type { GSymbol } from '../graph/index.ts'
import { isTestPath } from '../graph/util.ts'
import { openGraph } from '../graph-use.ts'
import { outlineLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree, tryLoadConfig } from '../project.ts'

const MAX_LINES = 25
/** Schwellen für die Stufe (Annahme: Risikowerte 0..1 wie bei code-review-graph; bei anderen Anbietern gibt es keinen) */
export const RISK_HIGH = 0.7
export const RISK_MEDIUM = 0.4

export function riskLevel(score: number): 'hoch' | 'mittel' | 'niedrig' {
  return score >= RISK_HIGH ? 'hoch' : score >= RISK_MEDIUM ? 'mittel' : 'niedrig'
}

type Changed = { datei: string; sym: OutlineSymbol }

/** Geänderte Symbole aus den Zeilenbereichen des Diffs und der Outline (ohne Graph). */
export function symbolsFromDiff(work: string, base: string, files: string[], staged: boolean): Changed[] {
  const out: Changed[] = []
  for (const f of files) {
    if (isTestPath(f) || outlineLib.languageOf(f) === null) continue
    const path = join(work, f)
    if (!existsSync(path)) continue
    const outline = outlineLib.outline(readFileSync(path, 'utf8'), f)
    const ranges = changedRanges(work, base, f, staged)
    const hit = ranges.length === 0 ? outline : outline.filter(s => ranges.some(([a, b]) => a <= s.ende && b >= s.start))
    // Klasse nur, wenn kein Mitglied von ihr selbst getroffen ist
    const kept = hit.filter(s => !(['class', 'interface', 'trait', 'enum'].includes(s.kind) && hit.some(o => o !== s && o.parent === s.name)))
    kept.forEach(sym => out.push({ datei: f, sym }))
  }
  return out
}

function listed(ctx: Ctx, title: string, items: string[]): void {
  if (items.length === 0) return
  ctx.out(`${title} (${items.length}):`)
  items.slice(0, MAX_LINES).forEach(i => ctx.out(`  ${i}`))
  if (items.length > MAX_LINES) ctx.out(`  … und ${items.length - MAX_LINES} weitere`)
}

/**
 * `impact [--staged]`: betroffene Dateien und Symbole des aktuellen Diffs mit Risiko.
 * Ohne Graph: geänderte Symbole aus Diff und Outline, Risiko „unbekannt“ (nie erfunden).
 */
export function impact(args: string[], ctx: Ctx): number {
  const unknown = args.find(a => a !== '--staged')
  if (unknown) throw new ToolBroken(`unbekannte Option ${unknown}`)
  const staged = args.includes('--staged')
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const config = tryLoadConfig(root)
  const base = diffBase(root, work, config)
  const files = changedFiles(work, base, staged)
  if (files.length === 0) {
    ctx.out('keine Änderungen')
    return 0
  }
  const og = openGraph(root)
  const result = og.adapter?.impact(root, files) ?? null
  const label = og.adapter && result ? og.adapter.label : null

  // geänderte Symbole: vom Graphen, sonst aus dem Diff
  let changed: { text: string; sym?: GSymbol }[] = []
  if (result && result.changed.length > 0) {
    changed = result.changed.map(c => ({
      text: `${c.symbol.datei}${c.symbol.start ? `:${c.symbol.start}-${c.symbol.ende ?? c.symbol.start}` : ''} ${c.symbol.name}${c.risk !== null ? ` Risiko ${c.risk.toFixed(2)}` : ''}`,
      sym: c.symbol,
    }))
  } else {
    changed = symbolsFromDiff(work, base, files, staged).map(c => ({
      text: `${c.datei}:${c.sym.start}-${c.sym.ende} ${c.sym.parent ? `${c.sym.parent}::` : ''}${c.sym.name}`,
    }))
  }

  // Aufrufer geänderter Symbole (wenn der Anbieter kein Impact-Ergebnis mit Dateien liefert)
  const callerFiles = new Set<string>(result?.files ?? [])
  if (og.adapter && (!result || result.files.length === 0)) {
    for (const f of files.filter(f => !isTestPath(f) && outlineLib.languageOf(f) !== null).slice(0, 10)) {
      for (const c of symbolsFromDiff(work, base, [f], staged).filter(c => c.sym.kind !== 'class').slice(0, 8)) {
        const found = og.adapter.find(root, c.sym.name)?.filter(s => s.datei === f)
        if (found?.length !== 1) continue // mehrdeutig oder unbekannt: nicht raten
        for (const caller of og.adapter.callers(root, found[0]!) ?? []) if (caller.datei !== f) callerFiles.add(caller.datei)
      }
    }
  }

  if (result?.risk != null) ctx.out(`Risiko: ${riskLevel(result.risk)} (${result.risk.toFixed(2)}) · Graph: ${label}`)
  else if (label) ctx.out(`Risiko: unbekannt (${label} liefert keinen Wert) · Graph: ${label}`)
  else ctx.out(`Risiko: unbekannt (kein Graph${og.note ? `: ${og.note}` : ''}) · nur Diff und Outline`)
  listed(ctx, 'Dateien im Diff', files)
  listed(ctx, 'geänderte Symbole', changed.map(c => c.text))
  listed(ctx, 'betroffen (Aufrufer)', [...callerFiles].filter(f => !files.includes(f)).sort())
  listed(ctx, 'betroffene Tests', result?.tests ?? [])
  listed(ctx, 'ohne Test', result?.testGaps ?? [])
  if (og.note && og.adapter) ctx.out(`Hinweis: ${og.note}`)
  return 0
}
