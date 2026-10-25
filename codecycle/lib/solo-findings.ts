// Solo-Weg: Funde aus dem Prüfbericht gegen ihren Status in TASK.md, Abschnitt „Funde“.
// Reiner Code ohne Node und ohne Mod-API, wie state-file.ts; genutzt von `codecycle solo funde` und der Merge-Sperre.

/** Bericht des Prüfers im Aufgabenordner */
export const SOLO_REPORT = 'reports/pruefung.md'

/** Bericht des zweiten Prüfers (Startnachricht `Auftrag: Sicherheit`); Funde `Z1`, `Z2` … */
export const SOLO_SECURITY_REPORT = 'reports/pruefung-sicherheit.md'

/** Wert von `zweitpruefung` in STATE.md, wenn `codecycle solo check` mindestens zwei Risikobereiche fand */
export const SECOND_REVIEW = 'sicherheit'

/** Startnachricht mit der Zeile `Auftrag: Teil`: Prüfer je Teil (Bericht `partReportPath`, Funde `TF1`, `TF2` …) */
export function isPartReview(prompt: string): boolean {
  return /^\s*Auftrag:\s*Teil\s*$/im.test(prompt)
}

/** Name des Teils aus der Zeile `Teil: <name>` der Startnachricht (erstes Wort), sonst null */
export function partNameOf(prompt: string): string | null {
  const m = prompt.match(/^\s*Teil:\s*([a-z0-9][a-z0-9-]{0,30})(?=\s|$)/im)
  return m ? m[1]! : null
}

/** Bericht des Prüfers je Teil im Aufgabenordner; ohne Namen `reports/pruefung-teil.md` */
export function partReportPath(name: string | null): string {
  return name ? `reports/pruefung-teil-${name}.md` : 'reports/pruefung-teil.md'
}

/** Bericht des Bauenden eines Teils (Zeile `Bericht:` seiner Startnachricht); ein neuer Bauender desselben Teils schreibt ihn neu */
export function partBuilderReport(name: string): string {
  return `reports/teil-${name}-builder.md`
}

/** Berichtsname des Schlussprüfers nach seiner Startnachricht (`Auftrag: Teil`, `Auftrag: Sicherheit`, sonst der Prüfbericht) */
export function soloReportFor(prompt: string): string {
  if (isPartReview(prompt)) return partReportPath(partNameOf(prompt))
  return /^\s*Auftrag:\s*Sicherheit\b/im.test(prompt) ? SOLO_SECURITY_REPORT : SOLO_REPORT
}

/** Berichte, die vor dem Merge da sein müssen: immer der Prüfbericht, mit `zweitpruefung: sicherheit` auch der zweite. */
export function requiredReports(state: { zweitpruefung?: string | undefined }): string[] {
  return state.zweitpruefung === SECOND_REVIEW ? [SOLO_REPORT, SOLO_SECURITY_REPORT] : [SOLO_REPORT]
}

export type FindingStatus = { id: string; status: 'behoben' | 'verworfen' | 'gemerkt' | 'offen'; grund: string }

export type FindingsCheck = {
  /** Fund-IDs aus dem Bericht, in Reihenfolge */
  ids: string[]
  /** IDs ohne gültigen Status (fehlt, `offen`, `verworfen` ohne Grund, `gemerkt` ohne Ort, `behoben` ohne Commit in Klammern) */
  fehlend: string[]
}

const ID_AT_START = /^\s*(?:#{1,6}\s*|[-*]\s+|\d+\.\s+)?(?:\*\*|__)?\s*((?:TF|[MZ])\d+)\b/

/** Zeilen außerhalb von Codeblöcken, die mit einer Fund-ID der Arten `kinds` beginnen: [ID, Zeile] */
function findingLines(text: string, kinds: readonly string[]): [string, string][] {
  const out: [string, string][] = []
  let fence = false
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const m = line.match(ID_AT_START)
    if (m && kinds.includes(m[1]!.replace(/\d+$/, ''))) out.push([m[1]!, line])
  }
  return out
}

/**
 * Fund-IDs (`M1`, `M2` …; zweiter Prüfer `Z1` …) am Anfang einer Überschrift, eines Listenpunkts oder einer Zeile; jede nur
 * einmal. `kinds`: erlaubte Arten; Funde des Prüfers je Teil (`TF1` …) zählen für den Merge nicht.
 */
export function reportFindingIds(text: string, kinds: readonly string[] = ['M', 'Z']): string[] {
  const ids: string[] = []
  for (const [id] of findingLines(text, kinds)) if (!ids.includes(id)) ids.push(id)
  return ids
}

/**
 * Offene Funde im Bericht des Prüfers je Teil: jede ID `TF<n>`, deren letzte Zeile nicht mit `· behoben` endet
 * (`### TF1 <Titel> · behoben` bzw. `· offen`; ohne Stand gilt der Fund als offen).
 */
export function openPartFindings(text: string): string[] {
  const last = new Map<string, string>()
  for (const [id, line] of findingLines(text, ['TF'])) last.set(id, line)
  // Stand = Text nach dem letzten `·`, ohne Hervorhebung; nur genau `behoben` gilt („nicht behoben“ bleibt offen)
  const done = (line: string): boolean => (line.split('·').at(-1) ?? '').replace(/[*_\s.]/g, '').toLowerCase() === 'behoben'
  return [...last].filter(([, line]) => !line.includes('·') || !done(line)).map(([id]) => id)
}

/**
 * Status je Fund aus TASK.md, Abschnitt „Funde“: `- M1: behoben (…)`, `- M2: verworfen: <Grund>`, `- M3: gemerkt: <Ort>`
 * (Nebenfund als eigene Aufgabe gemerkt), `- M4: offen: …`.
 * Ohne den Abschnitt eine leere Liste.
 */
export function findingStatuses(taskText: string): FindingStatus[] {
  const out: FindingStatus[] = []
  let inside = false
  for (const line of taskText.replace(/\r\n/g, '\n').split('\n')) {
    const h = line.match(/^##\s+(.*)$/)
    if (h) {
      inside = h[1]!.trim().toLowerCase() === 'funde'
      continue
    }
    if (!inside) continue
    const m = line.match(/^\s*[-*]\s+(?:\*\*|__)?([MZ]\d+)(?:\*\*|__)?\s*[:–-]?\s*(behoben|verworfen|gemerkt|offen)\b\s*[:–-]?\s*(.*)$/i)
    if (!m) continue
    out.push({ id: m[1]!, status: m[2]!.toLowerCase() as FindingStatus['status'], grund: m[3]!.trim() })
  }
  return out
}

/** `behoben` gilt nur mit Commit in Klammern: `(abc1234)`, 7 bis 40 Hex-Zeichen. */
const FIXED_WITH_COMMIT = /^\(\s*[0-9a-f]{7,40}\b/i

/** Jede Fund-ID des Berichts braucht `behoben (<commit>)`, `verworfen` mit Grund oder `gemerkt` mit Ort; der letzte Eintrag je ID gilt. */
export function checkFindings(reportText: string, taskText: string): FindingsCheck {
  const ids = reportFindingIds(reportText)
  const last = new Map<string, FindingStatus>()
  for (const s of findingStatuses(taskText)) last.set(s.id, s)
  const fehlend = ids.filter(id => {
    const s = last.get(id)
    if (!s) return true
    if (s.status === 'behoben') return !FIXED_WITH_COMMIT.test(s.grund)
    if (s.status === 'verworfen' || s.status === 'gemerkt') return s.grund === ''
    return true
  })
  return { ids, fehlend }
}
