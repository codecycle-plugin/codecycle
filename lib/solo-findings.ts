// Solo-Weg: Funde aus dem Prüfbericht gegen ihren Status in TASK.md, Abschnitt „Funde“.
// Reiner Code ohne Node und ohne Mod-API, wie state-file.ts; genutzt von `codecycle solo funde` und der Merge-Sperre.

/** Bericht des Prüfers im Aufgabenordner */
export const SOLO_REPORT = 'reports/pruefung.md'

/** Bericht des zweiten Prüfers (Startnachricht `Auftrag: Sicherheit`); Funde `Z1`, `Z2` … */
export const SOLO_SECURITY_REPORT = 'reports/pruefung-sicherheit.md'

/** Wert von `zweitpruefung` in STATE.md, wenn `codecycle solo check` mindestens zwei Risikobereiche fand */
export const SECOND_REVIEW = 'sicherheit'

/** Berichtsname des Solo-Prüfers nach seiner Startnachricht */
export function soloReportFor(prompt: string): string {
  return /^\s*Auftrag:\s*Sicherheit\b/im.test(prompt) ? SOLO_SECURITY_REPORT : SOLO_REPORT
}

/** Berichte, die vor dem Merge da sein müssen: immer der Prüfbericht, mit `zweitpruefung: sicherheit` auch der zweite. */
export function requiredReports(state: { zweitpruefung?: string | undefined }): string[] {
  return state.zweitpruefung === SECOND_REVIEW ? [SOLO_REPORT, SOLO_SECURITY_REPORT] : [SOLO_REPORT]
}

export type FindingStatus = { id: string; status: 'behoben' | 'verworfen' | 'offen'; grund: string }

export type FindingsCheck = {
  /** Fund-IDs aus dem Bericht, in Reihenfolge */
  ids: string[]
  /** IDs ohne gültigen Status (fehlt, `offen`, `verworfen` ohne Grund) */
  fehlend: string[]
}

const ID_AT_START = /^\s*(?:#{1,6}\s*|[-*]\s+|\d+\.\s+)?(?:\*\*|__)?\s*([MZ]\d+)\b/

/** Fund-IDs (`M1`, `M2` …; zweiter Prüfer `Z1` …) am Anfang einer Überschrift, eines Listenpunkts oder einer Zeile; jede nur einmal. */
export function reportFindingIds(text: string): string[] {
  const ids: string[] = []
  let fence = false
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const m = line.match(ID_AT_START)
    if (m && !ids.includes(m[1]!)) ids.push(m[1]!)
  }
  return ids
}

/**
 * Status je Fund aus TASK.md, Abschnitt „Funde“: `- M1: behoben (…)`, `- M2: verworfen: <Grund>`, `- M3: offen: …`.
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
    const m = line.match(/^\s*[-*]\s+(?:\*\*|__)?([MZ]\d+)(?:\*\*|__)?\s*[:–-]?\s*(behoben|verworfen|offen)\b\s*[:–-]?\s*(.*)$/i)
    if (!m) continue
    out.push({ id: m[1]!, status: m[2]!.toLowerCase() as FindingStatus['status'], grund: m[3]!.trim() })
  }
  return out
}

/** Jede Fund-ID des Berichts braucht `behoben` oder `verworfen` mit Grund; der letzte Eintrag je ID gilt. */
export function checkFindings(reportText: string, taskText: string): FindingsCheck {
  const ids = reportFindingIds(reportText)
  const last = new Map<string, FindingStatus>()
  for (const s of findingStatuses(taskText)) last.set(s.id, s)
  const fehlend = ids.filter(id => {
    const s = last.get(id)
    if (!s) return true
    if (s.status === 'behoben') return false
    if (s.status === 'verworfen') return s.grund === ''
    return true
  })
  return { ids, fehlend }
}
