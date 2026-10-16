// Hauptsitzung je Aufgabe: In welches Token-Buch bucht die Hauptsitzung (Bauleiter)?
// Rein, ohne Mod-API. Der Mod meldet Signale, hier entsteht daraus das Ziel.
//
// Regel (Begründung): Bisher buchte die Hauptsitzung jede Anfrage in die gerade aktive Aufgabe, auch
// Arbeit ohne Bezug (Vorarbeit vor /codecycle:new, Tester-Arbeit, Entwicklungssitzungen in diesem Repo in die Beispielaufgabe).
// „Aktiv“ heißt nur „es gibt eine offene STATE.md“, nicht „diese Sitzung arbeitet daran“. Jetzt bucht sie nur, wenn sie in
// dieser Sitzung selbst ein Signal gab, an der Aufgabe zu arbeiten:
//   1. Skill /codecycle:new oder /codecycle:continue → Vorlauf (Aufgabe noch offen; bei new gibt es den Ordner noch nicht).
//      Was im Vorlauf anfällt, geht beim ersten eindeutigen Signal in diese Aufgabe; ohne ein solches nirgends hin.
//   2. Start eines codecycle-Agenten aus der Hauptsitzung mit `Aufgabenordner: docs/codecycle/X` → Aufgabe X.
//   3. Schreibzugriff der Hauptsitzung in `docs/codecycle/X/` (STATE.md, TASK.md, …) → Aufgabe X.
//   4. /codecycle:setup oder ein codecycle-Agent ohne Aufgabe → Einrichtungsbuch.
// Gilt bis Sitzungsende oder /clear; ein Signal für eine andere Aufgabe wechselt. Ohne Signal bucht die Hauptsitzung
// nirgends hin (nur ein Topf im Speicher für den Startstand). Signale 2 und 3 sind robust, weil der Ablauf sie immer erzeugt
// (der Bauleiter legt TASK.md/STATE.md an und startet Agenten mit Aufgabenordner); Signal 1 hängt am Namen, den Claude
// Code im Ereignis `skill.prompt` meldet (live unbestätigt), und hat darum einen Rückfall über den getippten Befehl.

import { TASKS_DIR, normPath } from '../../lib/paths.ts'

export type MainClaim = { dir: string | null; pending: boolean }

export const NO_CLAIM: MainClaim = { dir: null, pending: false }

export type ClaimSignal = { kind: 'skill'; which: 'task' } | { kind: 'skill'; which: 'setup'; setupDir: string } | { kind: 'dir'; dir: string }

export type MainTarget = { kind: 'none' } | { kind: 'pending' } | { kind: 'dir'; dir: string }

const TASK_SKILLS = new Set(['codecycle:new', 'codecycle:continue'])

/** Welche Art Signal ist dieser Skill? `task` (new, continue), `setup`, sonst null (status, ideas, check, workflow …). */
export function skillKind(name: string): 'task' | 'setup' | null {
  const n = name.trim().toLowerCase()
  if (TASK_SKILLS.has(n)) return 'task'
  if (n === 'codecycle:setup') return 'setup'
  return null
}

/** Skill aus einem getippten Prompt (`/codecycle:new …` am Anfang); null sonst. */
export function promptSkill(text: string): string | null {
  const m = text.match(/^\s*\/(codecycle:(?:new|continue|setup))(?=\s|$)/i)
  return m ? m[1]!.toLowerCase() : null
}

/** Aufgabenordner (`docs/codecycle/X`) eines Pfads relativ zum Projekt, wenn er darin liegt; sonst null. */
export function taskDirOfPath(rel: string): string | null {
  const p = normPath(rel)
  if (!p.startsWith(`${TASKS_DIR}/`)) return null
  const m = p.slice(TASKS_DIR.length + 1).match(/^([^/]+)\/.+/)
  return m ? `${TASKS_DIR}/${m[1]}` : null
}

export function claimAfter(_claim: MainClaim, s: ClaimSignal): MainClaim {
  if (s.kind === 'dir') return { dir: s.dir, pending: false }
  if (s.which === 'setup') return { dir: s.setupDir, pending: false }
  return { dir: null, pending: true }
}

export function mainTarget(claim: MainClaim): MainTarget {
  if (claim.dir) return { kind: 'dir', dir: claim.dir }
  return claim.pending ? { kind: 'pending' } : { kind: 'none' }
}
