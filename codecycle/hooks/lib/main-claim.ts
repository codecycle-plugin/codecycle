// Hauptsitzung je Aufgabe: In welches Token-Buch bucht die Hauptsitzung (Bauleiter)?
// Rein, ohne Mod-API. Der Mod meldet Signale, hier entsteht daraus das Ziel.
//
// Regel (Begründung): Bisher buchte die Hauptsitzung jede Anfrage in die gerade aktive Aufgabe, auch
// Arbeit ohne Bezug (Vorarbeit vor /codecycle:new, Tester-Arbeit, Entwicklungssitzungen in diesem Repo in die Beispielaufgabe).
// „Aktiv“ heißt nur „es gibt eine offene STATE.md“, nicht „diese Sitzung arbeitet daran“. Jetzt bucht sie nur, wenn sie in
// dieser Sitzung selbst ein Signal gab, an der Aufgabe zu arbeiten:
//   1. Skill /codecycle:new, /codecycle:continue oder /codecycle:brainstorming → Vorlauf (Aufgabe noch offen; bei new und
//      brainstorming gibt es den Ordner noch nicht).
//      Was im Vorlauf anfällt, geht beim ersten eindeutigen Signal in diese Aufgabe; ohne ein solches nirgends hin.
//   2. Start eines codecycle-Agenten aus der Hauptsitzung mit `Aufgabenordner: docs/codecycle/X` → Aufgabe X.
//   3. Schreibzugriff der Hauptsitzung in `docs/codecycle/X/` (STATE.md, TASK.md, …) → Aufgabe X.
//   4. /codecycle:setup oder ein codecycle-Agent ohne Aufgabe → Einrichtungsbuch.
//   5. Nur im Vorlauf: ein Aufruf der Hauptsitzung nennt `docs/codecycle/X` (Pfad oder Befehl) und X hat danach eine
//      offene STATE.md → Aufgabe X (Rückfall für Signal 3, siehe taskDirsMentioned).
// Gilt bis /clear, auch über das Prozessende hinaus (Fortsetzen mit --resume, siehe SavedClaim); ein Signal für eine andere
// Aufgabe wechselt. Ohne Signal bucht die Hauptsitzung nirgends hin (nur ein Topf im Speicher für den Startstand).
// Signal 1 kommt im Kopfmodus `claude -p` über `prompt.submit` (Feld `command`), `skill.prompt` kam dort live nicht an.

import { TASKS_DIR, normPath } from '../../lib/paths.ts'
import type { MainEntry } from './ledger-costs.ts'

export type MainClaim = { dir: string | null; pending: boolean }

export const NO_CLAIM: MainClaim = { dir: null, pending: false }

export type ClaimSignal = { kind: 'skill'; which: 'task' } | { kind: 'skill'; which: 'setup'; setupDir: string } | { kind: 'dir'; dir: string }

export type MainTarget = { kind: 'none' } | { kind: 'pending' } | { kind: 'dir'; dir: string }

const TASK_SKILLS = new Set(['codecycle:new', 'codecycle:continue', 'codecycle:brainstorming'])

/** Welche Art Signal ist dieser Skill? `task` (new, continue, brainstorming), `setup`, sonst null (status, check, workflow …). */
export function skillKind(name: string): 'task' | 'setup' | null {
  const n = name.trim().toLowerCase()
  if (TASK_SKILLS.has(n)) return 'task'
  if (n === 'codecycle:setup') return 'setup'
  return null
}

/** Skill aus einem getippten Prompt (`/codecycle:new …` am Anfang); null sonst. */
export function promptSkill(text: string): string | null {
  const m = text.match(/^\s*\/(codecycle:(?:new|continue|brainstorming|setup))(?=\s|$)/i)
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

// ---------------------------------------------------------------------------
// Rückfall im Vorlauf: Nennung des Aufgabenordners. Der Bauleiter legt Dateien oft per Bash mit Variablen an
// (`D=docs/codecycle/X; cat > $D/STATE.md`), das erkennt Signal 3 nicht. Im Vorlauf (nach /codecycle:new|continue) bindet
// darum auch ein Aufruf der Hauptsitzung, der einen Aufgabenordner nennt, dessen STATE.md nach dem Aufruf offen ist
// (Prüfung im Mod). Nur im Vorlauf: sonst bänden Lesezugriffe von Entwicklungssitzungen an Beispielaufgaben.

/** Aufgabenordner (`docs/codecycle/X`), die ein Pfad, Muster oder Befehl nennt, auch in absoluten Pfaden; in Reihenfolge, ohne Doppelte. */
export function taskDirsMentioned(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?<![\w.-])docs[\\/]+codecycle[\\/]+([A-Za-z0-9][\w.-]*)/g)) {
    const name = m[1]!.replace(/\.+$/, '')
    const dir = `${TASKS_DIR}/${name}`
    if (name && !out.includes(dir)) out.push(dir)
  }
  return out
}

// ---------------------------------------------------------------------------
// Zuordnung über das Prozessende hinaus. `claude -p` endet nach jeder Antwort; die Antwort auf eine Rückfrage läuft als
// `claude -p --resume <id>` in einem neuen Prozess mit derselben Sitzungs-ID (session.start feuert erneut). Der Mod legt
// darum beim Sitzungsende Zuordnung, Vorlauf-Topf und Startstand je Sitzungs-ID im Store ab und holt sie beim nächsten
// Start derselben Sitzung zurück. `/clear` löscht den Eintrag.

type Usage5 = { runden: number; input: number; output: number; cacheRead: number; cacheWrite: number }
export type PendingSince = { zeit: string; signal: string; vorher: Usage5 }
/** Was eine Sitzung über ihr Prozessende hinaus behält; `at` = Zeitpunkt des Ablegens (ms) */
export type SavedClaim = { claim: MainClaim; sessionKey: string; pending: MainEntry; since: PendingSince | null; session: MainEntry; at: number }

/** Höchstalter und Höchstzahl abgelegter Zuordnungen */
export const SAVED_CLAIM_MAX_AGE_MS = 7 * 24 * 3_600_000
export const SAVED_CLAIM_MAX = 30

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function entryOf(v: unknown): MainEntry | null {
  if (!isObj(v)) return null
  const keys = ['runden', 'input', 'output', 'cacheRead', 'cacheWrite'] as const
  if (!keys.every(k => isNum(v[k]))) return null
  const e: MainEntry = { runden: v.runden as number, input: v.input as number, output: v.output as number, cacheRead: v.cacheRead as number, cacheWrite: v.cacheWrite as number }
  if (typeof v.modell === 'string') e.modell = v.modell
  if (isNum(v.limitProzent)) e.limitProzent = v.limitProzent
  return e
}

function savedOf(v: unknown): SavedClaim | null {
  if (!isObj(v) || !isObj(v.claim) || typeof v.sessionKey !== 'string' || !isNum(v.at)) return null
  const dir = v.claim.dir
  if (dir !== null && typeof dir !== 'string') return null
  const pending = entryOf(v.pending)
  const session = entryOf(v.session)
  if (!pending || !session) return null
  const s = v.since
  const since =
    isObj(s) && typeof s.zeit === 'string' && typeof s.signal === 'string' && entryOf(s.vorher)
      ? { zeit: s.zeit, signal: s.signal, vorher: usage5(entryOf(s.vorher)!) }
      : null
  return { claim: { dir, pending: v.claim.pending === true }, sessionKey: v.sessionKey, pending, since, session, at: v.at }
}

const usage5 = (m: MainEntry): Usage5 => ({ runden: m.runden, input: m.input, output: m.output, cacheRead: m.cacheRead, cacheWrite: m.cacheWrite })

function savedMap(raw: unknown): Record<string, SavedClaim> {
  const out: Record<string, SavedClaim> = {}
  if (!isObj(raw)) return out
  for (const [id, v] of Object.entries(raw)) {
    const s = savedOf(v)
    if (s) out[id] = s
  }
  return out
}

/** Abgelegte Zuordnung der Sitzung `id`; null, wenn keine oder unbrauchbar. */
export function savedClaimOf(raw: unknown, id: string): SavedClaim | null {
  return savedMap(raw)[id] ?? null
}

/** Store-Wert mit der Zuordnung der Sitzung `id`; Einträge älter als `SAVED_CLAIM_MAX_AGE_MS` und über `SAVED_CLAIM_MAX` (älteste zuerst) fallen weg. */
export function withSavedClaim(raw: unknown, id: string, saved: SavedClaim): Record<string, SavedClaim> {
  const all = { ...savedMap(raw), [id]: saved }
  const keep = Object.entries(all)
    .filter(([, s]) => saved.at - s.at <= SAVED_CLAIM_MAX_AGE_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, SAVED_CLAIM_MAX)
  return Object.fromEntries(keep)
}

/** Store-Wert ohne die Sitzung `id` (nach /clear). */
export function withoutSavedClaim(raw: unknown, id: string): Record<string, SavedClaim> {
  const all = savedMap(raw)
  delete all[id]
  return all
}
