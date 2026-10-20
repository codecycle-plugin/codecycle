// `codecycle notiz '<Text>'`: eine Beobachtung mit Datum und Uhrzeit festhalten, ohne Modell (Schalter `notizen`).
// Ziel: `notizen.md` im Ordner der offenen Aufgabe (`docs/codecycle/<ordner>/`, gewählt wie die Bautafel: `pickActive`);
// ohne offene Aufgabe `.codecycle/setup/notizen.md` (neben dem Setup-Buch, lokal), damit Notizen aus einer Einrichtung
// oder zwischen Aufgaben nicht verloren gehen. Schalter aus: nichts schreiben.
// Exit 0 gespeichert, 1 Schalter aus, 2 falscher Aufruf. Der Mod beantwortet `/codecycle:notiz` mit diesem Befehl.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { TaskState } from '../../types'
import { ToolBroken } from '../errors.ts'
import { pathsLib, stateFile, switchesLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot } from '../project.ts'

export const NOTES_FILE = 'notizen.md'
/** Ohne offene Aufgabe: neben dem Token-Buch für Läufe ohne Aufgabe (`hooks/register.tsx :: SETUP_DIR`) */
export const SETUP_NOTES = `.codecycle/setup/${NOTES_FILE}`
export const SWITCH_OFF =
  'Schalter notizen ist aus; nichts gespeichert. Einschalten: in .claude/codecycle.md im Block unter „## Schalter“ die Zeile „notizen: aus“ auf „notizen: an“ setzen (fehlt sie, „notizen: an“ ergänzen).'

/** Zeile der Notiz: Datum und Uhrzeit (Ortszeit), Text auf eine Zeile gebracht. */
export function noteLine(text: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`
  return `- ${stamp} ${text.replace(/\s*\r?\n\s*/g, ' ').trim()}\n`
}

/** Pfad (relativ zum Hauptordner) der Notizdatei: offene Aufgabe, sonst Setup-Ordner. */
export function notesPath(root: string): string {
  const dir = join(root, pathsLib.TASKS_DIR)
  const states: TaskState[] = []
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = `${pathsLib.TASKS_DIR}/${entry.name}/STATE.md`
      if (!existsSync(join(root, path))) continue
      try {
        states.push(stateFile.parseState(readFileSync(join(root, path), 'utf8'), path))
      } catch {
        // unlesbare STATE.md zählt nicht als offene Aufgabe (wie auf der Bautafel)
      }
    }
  }
  const active = stateFile.pickActive(states)
  return active ? `${dirname(active.quelle)}/${NOTES_FILE}` : SETUP_NOTES
}

export function notiz(args: string[], ctx: Ctx): number {
  const text = args.join(' ').trim()
  if (text === '') throw new ToolBroken("Text fehlt: codecycle notiz '<Text>'")
  const root = findProjectRoot(ctx.cwd)
  const md = join(root, '.claude', 'codecycle.md')
  const switches = switchesLib.parseSwitches(existsSync(md) ? readFileSync(md, 'utf8') : null)
  if (!switchesLib.isOn(switches, 'notizen')) {
    ctx.out(SWITCH_OFF)
    return 1
  }
  const rel = notesPath(root)
  const file = join(root, rel)
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, (existsSync(file) ? '' : '# Notizen\n\n') + noteLine(text, new Date()))
  ctx.out(`Notiz gespeichert in ${rel}`)
  return 0
}
