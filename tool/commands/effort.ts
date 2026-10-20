import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import type { EffortPlan, Features } from '../../lib/effort-plan.ts'
import { FILE, REQUIRED, parseFeature, readAufwand, writeAufwand } from '../effort-file.ts'
import { recordMeasure } from '../effort-measure.ts'
import { ToolBroken } from '../errors.ts'
import { effortLib, switchesLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot } from '../project.ts'

/** Plan ohne die gestrichenen Rollen, Läufe neu summiert. */
function withoutDropped(plan: EffortPlan, dropped: string[]): EffortPlan {
  const rollen = plan.rollen.filter(r => !dropped.includes(r.rolle))
  return {
    ...plan,
    rollen,
    laeufe: {
      min: rollen.filter(r => !r.unsicher).reduce((n, r) => n + r.laeufe, 0),
      max: rollen.reduce((n, r) => n + r.laeufe, 0),
    },
  }
}

/**
 * `effort <aufgabenordner> [--set k=v …] [--drop rolle[=grund] …] [--confirm-risk] | --record`
 * Steuerung des Aufwands: Merkmale → Rollen-Set und Läufe in `aufwand.json`;
 * `--record` schreibt die Messung (Läufe, Nachläufe, Diff-Zeilen, gewichtete Tokens von Agenten und Bauleiter aus costs.json, Prozent als Konto-Näherung, erfasste Hauptsitzungen) und nennt, was nicht erfasst ist. Exit 0 ok, 1 Schutzrolle ohne
 * `--confirm-risk` (nichts geschrieben), 2 Aufruffehler.
 */
export function effort(args: string[], ctx: Ctx): number {
  const sets: string[] = []
  const drops: { rolle: string; grund: string }[] = []
  const keeps: string[] = []
  let folder: string | undefined
  let confirm = false
  let record = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--set' || a === '--drop' || a === '--keep') {
      const v = args[++i]
      if (!v) throw new ToolBroken(`${a} braucht einen Wert`)
      if (a === '--set') sets.push(v)
      else if (a === '--keep') keeps.push(effortLib.canonicalRole(v.trim()))
      else {
        const j = v.indexOf('=')
        const rolle = effortLib.canonicalRole((j < 0 ? v : v.slice(0, j)).trim())
        drops.push({ rolle, grund: j < 0 ? '' : v.slice(j + 1).trim() })
      }
    } else if (a === '--confirm-risk') confirm = true
    else if (a === '--record') record = true
    else if (a.startsWith('--') || folder) throw new ToolBroken('Aufruf: codecycle effort <aufgabenordner> [--set k=v] [--drop rolle[=grund]] [--keep rolle] [--confirm-risk] | --record')
    else folder = a
  }
  if (!folder) throw new ToolBroken('Aufruf: codecycle effort <aufgabenordner> [--set k=v] [--drop rolle[=grund]] [--keep rolle] [--confirm-risk] | --record')
  if (record && (sets.length > 0 || drops.length > 0 || keeps.length > 0)) throw new ToolBroken('--record nicht zusammen mit --set, --drop oder --keep')

  const root = findProjectRoot(ctx.cwd)
  const abs = isAbsolute(folder) ? folder : [resolve(ctx.cwd, folder), resolve(root, folder)].find(p => existsSync(join(p, 'STATE.md'))) ?? resolve(ctx.cwd, folder)
  const rel = relative(root, abs).replace(/\\/g, '/')
  if (rel === '' || rel.startsWith('..')) throw new ToolBroken(`Ordner außerhalb des Projekts: ${folder}`)
  const statePath = join(abs, 'STATE.md')
  if (!existsSync(statePath)) throw new ToolBroken(`STATE.md fehlt in ${rel}`)
  const name = rel.split('/').at(-1)!
  const path = join(abs, FILE)
  const data = readAufwand(path)

  if (record) return recordMeasure(ctx, root, rel, name, statePath, path, data)

  for (const s of sets) {
    const [k, v] = parseFeature(s)
    ;(data.merkmale as Record<string, unknown>)[k] = v
  }
  // --keep hebt eine Streichung auf
  data.gestrichen = data.gestrichen.filter(g => !keeps.includes(g.rolle))
  const codecycleMd = join(root, '.claude', 'codecycle.md')
  const projectMd = existsSync(codecycleMd) ? readFileSync(codecycleMd, 'utf8') : null
  // Risikobereich, aber Zaun aus: nur melden (gehört in die Auftragsfreigabe), nicht umschalten
  const fenceHint = switchesLib.fenceHint(projectMd, data.merkmale.risiko === true)
  const missing = REQUIRED.filter(k => data.merkmale[k] === undefined)
  if (missing.length > 0) {
    // ohne vollständige Merkmale ist unbekannt, welche Rollen Schutzrollen sind
    if (drops.length > 0) throw new ToolBroken(`Streichen erst mit allen Pflicht-Merkmalen (fehlt: ${missing.join(', ')})`)
    data.plan = null
    writeAufwand(path, data)
    ctx.out(`effort ${name}: fehlt: ${missing.join(', ')}`)
    if (fenceHint) ctx.out(fenceHint)
    return 0
  }

  const switches = switchesLib.parseSwitches(projectMd)
  const full = effortLib.planEffort(data.merkmale as Features, switches)

  // Mindestschutz: Schutzrollen nur mit ausdrücklicher Bestätigung streichbar
  for (const d of drops) {
    const role = full.rollen.find(r => r.rolle === d.rolle)
    if (!role) throw new ToolBroken(`${d.rolle} steht nicht im Rollen-Set (${full.rollen.map(r => r.rolle).join(', ')})`)
    if (role.schutz && !confirm) {
      ctx.out(`Mindestschutz: ${d.rolle} ist bei Risikobereich nur mit --confirm-risk streichbar`)
      return 1
    }
  }
  for (const d of drops) {
    const prot = full.rollen.find(r => r.rolle === d.rolle)?.schutz === true
    const old = data.gestrichen.find(g => g.rolle === d.rolle)
    if (old) {
      old.grund = d.grund || old.grund
      old.schutzBestaetigt ||= prot
    } else data.gestrichen.push({ rolle: d.rolle, grund: d.grund, schutzBestaetigt: prot })
  }

  // früher gestrichene Rolle ist jetzt Schutzrolle, ohne Bestätigung → zurückholen und melden
  const restored = data.gestrichen.filter(g => !g.schutzBestaetigt && full.rollen.some(r => r.rolle === g.rolle && r.schutz)).map(g => g.rolle)
  data.gestrichen = data.gestrichen.filter(g => !restored.includes(g.rolle))

  const plan = withoutDropped(full, data.gestrichen.map(g => g.rolle))
  data.plan = plan
  writeAufwand(path, data)

  const { min, max } = plan.laeufe
  ctx.out(`effort ${name}: ${plan.groesse} · ${min === max ? min : `${min}–${max}`} Läufe`)
  const risiko = data.merkmale.risiko === true
  for (const r of plan.rollen) {
    const raise = effortLib.riskEffort(r.rolle, risiko)
    ctx.out(`  ${r.rolle.padEnd(18)}${r.laeufe}  ${r.unsicher ? '? ' : ''}${r.grund}${raise ? ` · Effort ${raise} (Risikobereich)` : ''}`)
  }
  if (plan.hinweis) ctx.out(`  Hinweis: ${plan.hinweis}`)
  for (const n of plan.notizen ?? []) ctx.out(`  ${n}`)
  for (const g of data.gestrichen) ctx.out(`gestrichen: ${g.rolle}${g.grund ? ` (${g.grund})` : ''}`)
  if (restored.length > 0) ctx.out(`wieder aufgenommen (Mindestschutz): ${restored.join(', ')}; streichen nur mit --drop … --confirm-risk`)
  ctx.out(plan.nachlaufErlaubt === null
    ? 'Nachlauf: Risikobereich, kein fester Deckel; jeder ungeplante Lauf mit Grund in STATE.md'
    : `Nachlauf: höchstens ${plan.nachlaufErlaubt} ungeplanter Lauf (kein Risikobereich)`)
  if (fenceHint) ctx.out(fenceHint)
  return 0
}
