import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { COPY_DIR, installCopy } from '../copy.ts'
import { ToolBroken } from '../errors.ts'
import type { Ctx } from '../main.ts'
import { type Layout, layoutOf, pluginToolDir } from '../paths.ts'
import { updateConfig, writeConfigIfMissing } from '../config-template.ts'
import { refreshControl } from '../guard-records.ts'
import { CONFIG_PATH, findProjectRoot } from '../project.ts'

/**
 * `install-tool [--from <plugin-ordner>] [--dry-run] [--update-config]`: legt `.codecycle/tool/` im Hauptordner
 * des Projekts an oder erneuert es (Werkzeug, `lib/`, `githooks/`). Idempotent.
 * `--update-config` ergänzt fehlende Felder einer bestehenden Konfiguration (junit, mainBranch, graph), nie Vorhandenes; hebt eine ältere `version` auf den Werkzeugstand.
 */
export function installTool(args: string[], ctx: Ctx): number {
  let from: string | null = null
  let dryRun = false
  let update = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--dry-run') dryRun = true
    else if (a === '--update-config') update = true
    else if (a === '--from') {
      from = args[++i] ?? null
      if (from === null) throw new ToolBroken('--from braucht einen Ordner')
    } else throw new ToolBroken(`unbekannte Option ${a}`)
  }
  let source: Layout
  if (from !== null) {
    const dir = resolve(ctx.cwd, from)
    const toolDir = existsSync(join(dir, 'tool', 'cli.ts')) ? join(dir, 'tool') : dir
    if (!existsSync(join(toolDir, 'cli.ts'))) throw new ToolBroken(`kein Werkzeug in ${dir} (cli.ts fehlt)`)
    source = layoutOf(toolDir)
  } else {
    const toolDir = pluginToolDir()
    if (toolDir === null) {
      throw new ToolBroken(
        'Quelle unbekannt: aus der Kopie heraus mit --from <plugin-ordner> aufrufen oder `node <plugin>/tool/cli.ts install-tool`',
      )
    }
    source = layoutOf(toolDir)
  }
  const root = findProjectRoot(ctx.cwd)
  const r = installCopy(root, source, dryRun)
  const where = `${COPY_DIR}/`
  if (!r.changed) ctx.out(`Werkzeug-Kopie unverändert (${r.files} Dateien, Version ${r.info.version}, ${r.info.hash})`)
  else if (dryRun) ctx.out(`würde ${where} aktualisieren: ${r.files} Dateien, ${r.removed.length} zu entfernen (Probelauf)`)
  else ctx.out(`Werkzeug-Kopie aktualisiert: ${r.files} Dateien nach ${where} (Version ${r.info.version}, ${r.info.hash})`)
  const created = writeConfigIfMissing(root, dryRun)
  if (created) {
    const c = created.commands
    const cmds = (['test', 'lint', 'format'] as const).map(k => `${k}: ${c[k] === null ? 'null' : c[k]}`).join('; ')
    ctx.out(`${dryRun ? 'würde ' : ''}${CONFIG_PATH} ${dryRun ? 'anlegen' : 'angelegt'} (Vorlage: ${cmds}; graph ${created.graph?.provider}${created.junit ? `; junit ${created.junit}` : ''}). Bitte prüfen und anpassen.`)
  }
  let updated = false
  if (update && !created) {
    const u = updateConfig(root, dryRun)
    updated = u.added.length > 0
    if (u.added.length > 0) ctx.out(`${dryRun ? 'würde ' : ''}${CONFIG_PATH} ${dryRun ? 'ergänzen' : 'ergänzt'}: ${u.added.join('; ')}`)
    else ctx.out(`${CONFIG_PATH}: nichts zu ergänzen`)
    for (const n of u.notes) ctx.out(`Hinweis: ${n}`)
  }
  // rechtmäßig geänderte Kontrolldateien: neue Grundlage für guard; nur nach echter Änderung, sonst übernähme ein beliebiger Aufruf vorherige Änderungen an Kontrolldateien still in die Grundlage
  if (!dryRun && (r.changed || created || updated)) refreshControl(root, [root])
  return 0
}
