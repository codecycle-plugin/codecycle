// Zusammenfassung eines Prüfschritts: grüner Lauf eine Zeile,
// bei Rot die ersten DETAILED Fehlschläge ausführlich, weitere nur mit Namen.

import type { ShellResult } from './exec.ts'
import type { JunitSummary } from './junit.ts'

export const DETAILED = 5
const TAIL_LINES = 20
const NOISE = /node_modules|vendor[\/]|node:internal|<anonymous>/

function projectLines(detail: string): string[] {
  return detail
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '' && !NOISE.test(l))
}

export function summarize(label: string, r: ShellResult, junit: JunitSummary | null, logPath: string): string[] {
  const state = r.broken ? `Werkzeug kaputt (${r.broken})` : r.code === 0 ? 'grün' : 'rot'
  const counts = r.broken
    ? ''
    : junit
      ? ` (${junit.failed} fehlgeschlagen, ${junit.passed} bestanden, ${junit.skipped} übersprungen)`
      : r.code === 0
        ? ''
        : ` (Exit-Code ${r.code})`
  const lines = [`${label}: ${state}${counts} · Log: ${logPath}`]
  if (r.code === 0 && !r.broken) return lines
  if (junit && junit.failures.length > 0) {
    junit.failures.forEach((f, i) => {
      lines.push(`  ✘ ${f.name}`)
      if (i >= DETAILED) return
      if (f.message) lines.push(`    ${f.message}`)
      for (const l of projectLines(f.detail).slice(0, 6)) lines.push(`    ${l}`)
    })
  } else {
    for (const l of r.output.trimEnd().split(/\r?\n/).slice(-TAIL_LINES)) lines.push(`  ${l}`)
  }
  return lines
}
