import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { FILE, readAufwand } from '../effort-file.ts'
import { recordMeasure } from '../effort-measure.ts'
import { ToolBroken } from '../errors.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot } from '../project.ts'

const USAGE = 'Aufruf: codecycle effort <aufgabenordner> --record'

/**
 * `effort <aufgabenordner> --record`: schreibt die Messung der Aufgabe nach `aufwand.json` (Läufe, Nachläufe,
 * Diff-Zeilen, gewichtete Tokens von Agenten und Bauleiter aus costs.json, Prozent als Konto-Näherung, erfasste
 * Hauptsitzungen) und nennt, was nicht erfasst ist. Exit 0 ok, 2 Aufruffehler.
 */
export function effort(args: string[], ctx: Ctx): number {
  let folder: string | undefined
  let record = false
  for (const a of args) {
    if (a === '--record') record = true
    else if (a.startsWith('--') || folder) throw new ToolBroken(USAGE)
    else folder = a
  }
  if (!folder || !record) throw new ToolBroken(USAGE)

  const root = findProjectRoot(ctx.cwd)
  const abs = isAbsolute(folder) ? folder : [resolve(ctx.cwd, folder), resolve(root, folder)].find(p => existsSync(join(p, 'STATE.md'))) ?? resolve(ctx.cwd, folder)
  const rel = relative(root, abs).replace(/\\/g, '/')
  if (rel === '' || rel.startsWith('..')) throw new ToolBroken(`Ordner außerhalb des Projekts: ${folder}`)
  const statePath = join(abs, 'STATE.md')
  if (!existsSync(statePath)) throw new ToolBroken(`STATE.md fehlt in ${rel}`)
  const name = rel.split('/').at(-1)!
  const path = join(abs, FILE)
  return recordMeasure(ctx, root, rel, name, statePath, path, readAufwand(path))
}
