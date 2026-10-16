// TASK.md lesen: Abschnitte und Tabelle der Abnahmekriterien.
// Reiner Code ohne Node und ohne Mod-API, wie state-file.ts.

export type Criterion = { id: string; kriterium: string; pruefweg: string }

export type Task = {
  quelle: string
  /** Abschnittstext nach Überschrift (klein geschrieben, z. B. `ziel`), ohne die Tabelle der Kriterien */
  abschnitte: Record<string, string>
  kriterien: Criterion[]
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())
}

/** Liest eine TASK.md; wirft, wenn es keinen `##`-Abschnitt gibt oder eine Kriterien-ID doppelt vorkommt. */
export function parseTask(text: string, quelle: string): Task {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n')
  const sections: Record<string, string[]> = {}
  let current = ''
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/)
    if (h) {
      current = h[1]!.trim().toLowerCase()
      sections[current] = []
    } else if (current) {
      sections[current]!.push(line)
    }
  }
  if (Object.keys(sections).length === 0) throw new Error('TASK.md: keine Abschnitte (`## …`) gefunden')

  const kriterien: Criterion[] = []
  const seen = new Set<string>()
  const abschnitte: Record<string, string> = {}
  for (const [name, body] of Object.entries(sections)) {
    const isCriteria = name === 'abnahmekriterien'
    const rest: string[] = []
    for (const line of body) {
      if (isCriteria && line.includes('|')) {
        const [id = '', kriterium = '', pruefweg = ''] = cells(line)
        // Kopf- und Trennzeile überspringen
        if (id === '' || /^:?-+:?$/.test(id) || id.toLowerCase() === 'id') continue
        if (seen.has(id)) throw new Error(`TASK.md: Kriterium ${id} kommt doppelt vor`)
        seen.add(id)
        kriterien.push({ id, kriterium, pruefweg })
      } else {
        rest.push(line)
      }
    }
    abschnitte[name] = rest.join('\n').trim()
  }
  return { quelle, abschnitte, kriterien }
}
