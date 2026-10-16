import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type Aufwand, writeAufwand } from './effort-file.ts'
import { ToolBroken } from './errors.ts'
import { git } from './exec.ts'
import { mainBranch } from './git-hints.ts'
import { pathsLib, stateFile } from './lib-path.ts'
import type { Ctx } from './main.ts'
import { tryLoadConfig } from './project.ts'

const { GIT_QUIET, TASKS_DIR } = pathsLib

/** `--record`: Läufe und Nachläufe aus STATE.md, Diff-Zeilen ohne `docs/codecycle/`. */
export function recordMeasure(ctx: Ctx, root: string, rel: string, name: string, statePath: string, path: string, data: Aufwand): number {
  const state = stateFile.parseState(readFileSync(statePath, 'utf8'), `${rel}/STATE.md`)
  const base = mainBranch(root, tryLoadConfig(root) ?? undefined)
  const branch = state.branch || 'HEAD'
  const diff = git([...GIT_QUIET, 'diff', '--numstat', `${base}...${branch}`, '--', '.', `:(exclude)${TASKS_DIR}`], root)
  if (!diff.ok) throw new ToolBroken(`git diff ${base}...${branch} fehlgeschlagen`)
  let lines = 0
  for (const row of diff.out.split(/\r?\n/).filter(Boolean)) {
    const [add = '0', del = '0'] = row.split('\t')
    lines += (Number(add) || 0) + (Number(del) || 0)
  }
  const laeufe = state.budget.verbraucht
  const shares = costShares(join(dirname(path), 'costs.json'))
  data.messung = {
    laeufe,
    nachlaeufe: state.budget.nachlauf,
    diffZeilen: lines,
    laeufeJe100Zeilen: lines > 0 ? Math.round((laeufe / lines) * 1000) / 10 : null,
    aufgenommen: new Date().toISOString(),
    ...shares,
  }
  writeAufwand(path, data)
  const m = data.messung
  const parts = [`${m.laeufe} Läufe (Nachlauf ${m.nachlaeufe})`]
  if (m.agentenProzent !== undefined) parts.push(`Agenten ${percent(m.agentenProzent)}`)
  if (m.bauleiterProzent !== undefined) parts.push(`Bauleiter${m.bauleiterModell ? ` (${m.bauleiterModell})` : ''} ${percent(m.bauleiterProzent)}`)
  parts.push(`${m.diffZeilen} Zeilen`, `${m.laeufeJe100Zeilen === null ? '–' : String(m.laeufeJe100Zeilen).replace('.', ',')} Läufe je 100 Zeilen`)
  ctx.out(`effort ${name}: ${parts.join(' · ')}`)
  return 0
}

function percent(n: number): string {
  return `${String(Math.round(n * 10) / 10).replace('.', ',')} %`
}

/** Modell-ID kurz (`claude-sonnet-4-6` → `sonnet`), wie im Panel; Unbekanntes bleibt. */
function shortModel(model: string): string {
  const m = model.toLowerCase()
  return ['haiku', 'sonnet', 'opus', 'fable'].find(f => m.includes(f)) ?? model
}

/**
 * Anteile am 5-Stunden-Fenster aus `costs.json` (Aufbau `hooks/lib/ledger-costs.ts :: Costs`): Agenten = Summe `limitProzent`
 * aller Rollen, Bauleiter = `hauptsitzung.limitProzent` mit Modell. Fehlt die Datei oder ein Wert, fehlt das Feld.
 */
export function costShares(file: string): { agentenProzent?: number; bauleiterProzent?: number; bauleiterModell?: string } {
  if (!existsSync(file)) return {}
  let c: { rollen?: unknown; hauptsitzung?: { limitProzent?: unknown; modell?: unknown } }
  try {
    c = JSON.parse(readFileSync(file, 'utf8')) as typeof c
  } catch {
    return {}
  }
  if (!c || typeof c !== 'object') return {}
  const out: { agentenProzent?: number; bauleiterProzent?: number; bauleiterModell?: string } = {}
  const values = c.rollen && typeof c.rollen === 'object' ? Object.values(c.rollen as Record<string, { limitProzent?: unknown }>) : []
  const nums = values.map(r => r?.limitProzent).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length > 0) out.agentenProzent = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100
  const h = c.hauptsitzung
  if (h && typeof h.limitProzent === 'number' && Number.isFinite(h.limitProzent)) {
    out.bauleiterProzent = h.limitProzent
    if (typeof h.modell === 'string' && h.modell !== '') out.bauleiterModell = shortModel(h.modell)
  }
  return out
}
