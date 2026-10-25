// Aufgabenordner beim Agentenstart: aus der aktiven Aufgabe, nicht aus dem Text der Startnachricht.
// Rein, ohne Node und ohne Mod-API. Der Mod (`hooks/register.tsx :: spawnTaskDir`) liefert die offenen Aufgaben
// (Ordner unter docs/codecycle/ mit STATE.md, nicht fertig/verworfen) und die Aufgabe dieser Sitzung.
//
// Anlass: Der Bauleiter schrieb `docs/codecycle/<aufgabe>./` mit Satzpunkt in die
// Startnachricht; Bericht und Lese-Rollen-Zaun folgten dem Text, der Bericht landete in einem neuen, falschen Ordner.
// Jetzt gilt: Nennt die Startnachricht einen Ordner, muss er eine offene Aufgabe sein (Satzzeichen am Ende werden
// nachsichtig abgeschnitten, wenn danach eine offene Aufgabe herauskommt) und zur Aufgabe dieser Sitzung passen;
// sonst startet der Agent nicht, und der Bauleiter bekommt den richtigen Pfad genannt.
// Das ist ein Netz gegen Versehen, keine Sicherheitsgrenze (wie der Zaun).

import { TASKS_DIR, normPath } from '../../lib/paths.ts'

/** Satzzeichen, die beim Abschreiben hinter einem Pfad hängen bleiben (Satzende, Klammer, Fettdruck, Anführung). */
const TRAILING = /[.,;:!?)\]*“”»«]+$/

export type TaskDirInput = {
  /** Aufgabenordner aus der Startnachricht (`parseSpawnPrompt`), wenn einer genannt ist */
  named?: string | undefined
  /** Offene Aufgabenordner (`docs/codecycle/x`); null = nicht lesbar, dann keine Prüfung (Verhalten wie vorher) */
  open: readonly string[] | null
  /** Aufgabe, an der diese Sitzung arbeitet; zählt nur, wenn sie offen ist */
  expected?: string | null | undefined
}

export type TaskDirResult =
  /** `corrected`: der genannte Text, wenn er nachsichtig berichtigt wurde (Hinweis an den Agenten) */
  | { kind: 'ok'; dir: string; corrected?: string }
  /** Nichts genannt und keine Aufgabe eindeutig: der Aufrufer nimmt den bisherigen Rückfall */
  | { kind: 'unnamed' }
  /** Agentenstart verweigern; `text` geht an den Bauleiter */
  | { kind: 'deny'; text: string }

const trimDir = (p: string): string => normPath(p).replace(/\/+$/, '')

/** Die genannte Angabe als offene Aufgabe: genau, sonst ohne Satzzeichen am Ende; null, wenn keine passt. */
export function matchOpenDir(named: string, open: readonly string[]): string | null {
  const exact = trimDir(named)
  if (open.includes(exact)) return exact
  const stripped = trimDir(exact.replace(TRAILING, ''))
  if (stripped !== exact && stripped.startsWith(`${TASKS_DIR}/`) && open.includes(stripped)) return stripped
  return null
}

/** Welche Aufgabe gilt, ohne auf den Text zu schauen: die der Sitzung (wenn offen), sonst die einzige offene. */
export function expectedTaskDir(open: readonly string[], expected: string | null | undefined): string | null {
  const e = expected ? trimDir(expected) : null
  if (e && open.includes(e)) return e
  return open.length === 1 ? open[0]! : null
}

/** Aufgabenordner für Bericht, Quittung und Zaun eines neuen Agenten. */
export function resolveTaskDir(i: TaskDirInput): TaskDirResult {
  if (i.open === null) return i.named ? { kind: 'ok', dir: trimDir(i.named) } : { kind: 'unnamed' }
  const expected = expectedTaskDir(i.open, i.expected)
  if (!i.named) return expected ? { kind: 'ok', dir: expected } : { kind: 'unnamed' }
  const named = trimDir(i.named)
  const hit = matchOpenDir(named, i.open)
  if (hit && (!expected || hit === expected)) return hit === named ? { kind: 'ok', dir: hit } : { kind: 'ok', dir: hit, corrected: named }
  return { kind: 'deny', text: denyText(named, hit, expected, i.open) }
}

/** Meldung an den Bauleiter: was falsch ist und welcher Pfad richtig ist. */
export function denyText(named: string, hit: string | null, expected: string | null, open: readonly string[]): string {
  // ohne angehängtes Satzzeichen anzeigen (aus „… web-oberflaeche. Bericht: …“ sonst „web-oberflaeche.;“)
  const shown = trimDir(named.replace(TRAILING, '')) || named
  const head = `codecycle: Agent nicht gestartet. Die Startnachricht nennt den Aufgabenordner ${shown}`
  if (hit && expected) {
    return `${head}, diese Sitzung arbeitet aber an ${expected}. Richtig: „Aufgabenordner: ${expected}“ (Bericht unter ${expected}/reports/). Ist wirklich ${hit} gemeint: zuerst die Aufgabe wechseln (/codecycle:continue).`
  }
  const why = `; das ist keine offene Aufgabe (Ordner unter ${TASKS_DIR}/ mit STATE.md, nicht fertig/verworfen)`
  if (expected) return `${head}${why}. Richtig: „Aufgabenordner: ${expected}“ (Bericht unter ${expected}/reports/). Startnachricht berichtigen und den Agenten neu starten.`
  if (open.length > 0) return `${head}${why}. Offene Aufgaben: ${open.join(', ')}. Den richtigen Ordner genau so nennen und den Agenten neu starten.`
  return `${head}${why}. Es gibt keine offene Aufgabe. Zuerst die Aufgabe anlegen (/codecycle:new) oder fortsetzen (/codecycle:continue); ein Agent ohne Aufgabe bekommt keinen Aufgabenordner.`
}

/** Hinweis an den Agenten, wenn der Mod den genannten Ordner berichtigt hat. */
export function correctedNote(dir: string, named: string): string {
  return `Aufgabenordner: ${dir} (die Startnachricht nannte ${named}; es gilt ${dir}, auch für Bericht und Quittung).`
}
