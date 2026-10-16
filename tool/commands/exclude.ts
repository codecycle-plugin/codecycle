import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { refreshControl } from '../guard-records.ts'
import { pathsLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { gitCommonDir } from '../project.ts'

/** Ordner, die codecycle lokal hält (nicht versionieren). */
export const EXCLUDED = ['.claude/', '.codecycle/', '.githooks/'] as const

/**
 * Bei Ablage „teilen“ (`--share`): `.claude/codecycle.md` (Risikobereiche, Schalter) wird committet, deshalb nur
 * die persönlichen Einstellungen statt des ganzen Ordners `.claude/` ausschließen.
 */
export const EXCLUDED_SHARED = ['.claude/settings.local.json', '.codecycle/', '.githooks/'] as const

/** Zeilen für `.gitattributes` gegen „LF will be replaced by CRLF“ in Aufgabenordnern (nur anlegen/ergänzen). */
export const ATTRIBUTES = [`${pathsLib.TASKS_DIR}/** text eol=lf`] as const

/** Hängt fehlende Zeilen an eine Datei an (legt sie an, überschreibt nie). Gibt die neu eingetragenen zurück. */
function appendMissing(file: string, lines: readonly string[], present: (have: Set<string>, line: string) => boolean): string[] {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const have = new Set(text.split(/\r?\n/).map(l => l.trim()))
  const missing = lines.filter(l => !present(have, l))
  if (missing.length === 0) return []
  mkdirSync(dirname(file), { recursive: true })
  const sep = text === '' || text.endsWith('\n') ? '' : '\n'
  writeFileSync(file, `${text}${sep}${missing.join('\n')}\n`)
  return missing
}

/**
 * `exclude [--share] [--gitignore] [--gitattributes]`: trägt `.claude/`, `.codecycle/` und `.githooks/` (mit `--share`
 * statt `.claude/` nur `.claude/settings.local.json`) in `.git/info/exclude` des Hauptrepos ein
 * (`--git-common-dir`, gilt damit auch aus Worktrees). Idempotent, ändert ohne weitere Option nur die lokale
 * Ausschlussdatei. Auf ausdrücklichen Wunsch (Setup fragt) ergänzt `--gitignore` dieselben Einträge im versionierten
 * `.gitignore`, `--gitattributes` legt Zeilenende-Regeln an; beides nur anhängen, nie überschreiben.
 * Bereits versionierte Dateien bleiben versioniert (Hinweis).
 */
export function exclude(args: string[], ctx: Ctx): number {
  const known = ['--share', '--gitignore', '--gitattributes']
  const bad = args.find(a => !known.includes(a))
  if (bad !== undefined) throw new ToolBroken(`unbekannte Option ${bad}`)
  const share = args.includes('--share')
  const wanted: readonly string[] = share ? EXCLUDED_SHARED : EXCLUDED
  const commonDir = resolve(gitCommonDir(ctx.cwd))
  const file = join(commonDir, 'info', 'exclude')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const have = new Set(text.split(/\r?\n/).map(l => l.trim().replace(/^\//, '')))
  const missing = wanted.filter(e => !have.has(e) && !have.has(e.replace(/\/$/, '')))
  if (share && (have.has('.claude/') || have.has('.claude'))) {
    ctx.out('Hinweis: .claude/ steht noch pauschal in .git/info/exclude; bei Ablage „teilen“ die Zeile entfernen, sonst bleibt .claude/codecycle.md unversioniert.')
  }
  if (missing.length === 0) {
    ctx.out(`schon ausgeschlossen: ${wanted.join(' ')} (${file})`)
  } else {
    mkdirSync(dirname(file), { recursive: true })
    const sep = text === '' || text.endsWith('\n') ? '' : '\n'
    writeFileSync(file, `${text}${sep}${missing.join('\n')}\n`)
    ctx.out(`ausgeschlossen: ${missing.join(' ')} (${file})`)
  }
  const top = git(['rev-parse', '--show-toplevel'], ctx.cwd).out
  const tracked = git(['ls-files', '--', ...wanted], top || ctx.cwd).out.split(/\r?\n/).filter(l => l !== '')
  // ab jetzt sind Kontrolldateien für Git unsichtbar: Grundlage für guard festhalten. Nur wenn wirklich etwas
  // eingetragen wurde: sonst setzte jeder Aufruf die Grundlage still neu und übernähme
  // vorherige Änderungen an Kontrolldateien.
  if (missing.length > 0) refreshControl(dirname(commonDir), [top || ctx.cwd, dirname(commonDir)])
  if (tracked.length > 0) ctx.out(`Hinweis: schon versionierte Dateien bleiben versioniert (${tracked.length}, z. B. ${tracked[0]}); der Ausschluss gilt nur für neue.`)
  const root = top || ctx.cwd
  if (args.includes('--gitignore')) {
    const added = appendMissing(join(root, '.gitignore'), wanted, (h, l) => h.has(l) || h.has(l.replace(/\/$/, '')) || h.has(`/${l}`))
    ctx.out(added.length > 0 ? `.gitignore ergänzt: ${added.join(' ')}` : '.gitignore: schon vollständig')
  }
  if (args.includes('--gitattributes')) {
    const added = appendMissing(join(root, '.gitattributes'), ATTRIBUTES, (h, l) => h.has(l))
    ctx.out(added.length > 0 ? `.gitattributes ergänzt: ${added.join('; ')}` : '.gitattributes: schon vollständig')
  }
  return 0
}
