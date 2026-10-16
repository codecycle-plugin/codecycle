// Nacharbeit aus Git: Commits nach `zustand: fertig` auf denselben
// Dateien der Aufgabe. Rein: der Aufrufer liefert Git-Ausgaben, dieser Teil wertet aus.

export type StateAt = { commit: string; zeit: string; zustand: string }

/**
 * Der Commit, der STATE.md auf `fertig` setzt: der letzte Übergang von „nicht fertig“ nach
 * „fertig“ in der Reihenfolge alt → neu. Null, wenn es keinen gibt.
 */
export function findFertigCommit(history: readonly StateAt[]): StateAt | null {
  let found: StateAt | null = null
  let prev = ''
  for (const h of history) {
    if (h.zustand === 'fertig' && prev !== 'fertig') found = h
    prev = h.zustand
  }
  return found
}

export type ReworkCommit = { hash: string; datum: string; betreff: string; dateien: string[] }

/** Ausgabe von `git log --name-only --format=@%h%x09%cs%x09%s` lesen. */
export function parseReworkLog(text: string): ReworkCommit[] {
  const out: ReworkCommit[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (raw === '') continue
    if (raw.startsWith('@')) {
      const [hash = '', datum = '', ...rest] = raw.slice(1).split('\t')
      out.push({ hash, datum, betreff: rest.join('\t'), dateien: [] })
    } else out.at(-1)?.dateien.push(raw.trim().replace(/\\/g, '/'))
  }
  return out
}

export type ReworkSummary = {
  commits: number
  /** Dateien mit Anzahl der Nacharbeits-Commits, häufigste zuerst */
  dateien: { datei: string; commits: number }[]
  gesamtDateien: number
}

export function summarizeRework(commits: readonly ReworkCommit[], files: readonly string[]): ReworkSummary {
  const wanted = new Set(files.map(f => f.toLowerCase()))
  const count = new Map<string, number>()
  for (const c of commits) {
    for (const f of new Set(c.dateien)) if (wanted.has(f.toLowerCase())) count.set(f, (count.get(f) ?? 0) + 1)
  }
  const dateien = [...count].map(([datei, commits]) => ({ datei, commits })).sort((a, b) => b.commits - a.commits || (a.datei < b.datei ? -1 : 1))
  return { commits: commits.length, dateien, gesamtDateien: files.length }
}
