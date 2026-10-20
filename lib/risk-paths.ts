// Risikobereiche aus `.claude/codecycle.md` mit optionalen Pfadmustern; ordnet geänderte Dateien zu.
// Reiner Code ohne Node und ohne Mod-API, wie state-file.ts.
//
// Format je Zeile im Abschnitt „Risikobereiche“:
//   - Auth: Anmeldung und Rechte (Pfade: src/auth/**, `api/login.ts`)
// Ohne „(Pfade: …)“ hat der Bereich keine Muster; dann urteilt die Sitzung selbst.

import { normPath } from './paths.ts'

export type RiskArea = { name: string; grund: string; pfade: string[] }

export type RiskHit = { bereich: string; datei: string; muster: string }

/** Liest die Risikobereiche; Platzhalter der Vorlage (`<…>`) und „keine“ zählen nicht. */
export function parseRiskAreas(text: string): RiskArea[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: RiskArea[] = []
  let inside = false
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/)
    if (h) {
      inside = h[1]!.trim().toLowerCase() === 'risikobereiche'
      continue
    }
    if (!inside) continue
    const item = line.match(/^\s*[-*]\s+(.*)$/)
    if (!item) continue
    let body = item[1]!.trim()
    if (body.startsWith('<') || /^(keine|keiner|-)$/i.test(body)) continue
    let pfade: string[] = []
    const paths = body.match(/\(\s*Pfade?\s*:\s*([^)]*)\)/i)
    if (paths) {
      pfade = paths[1]!
        .split(',')
        .map(p => p.trim().replace(/^`|`$/g, '').trim())
        .filter(p => p !== '')
      body = body.replace(paths[0], '').trim()
    }
    const sep = body.search(/[:,]/)
    const name = (sep >= 0 ? body.slice(0, sep) : body).trim()
    const grund = sep >= 0 ? body.slice(sep + 1).trim() : ''
    if (name !== '') out.push({ name, grund, pfade })
  }
  return out
}

/**
 * Glob-Muster als regulärer Ausdruck: `**` beliebig viele Ordner, `*` beliebig innerhalb eines Namens, `?` ein
 * Zeichen. Ein Muster ohne `/` gilt für den Dateinamen in jeder Tiefe (wie in `.gitignore`); ein Muster, das auf `/`
 * endet, für alles darunter.
 */
export function globToRegExp(pattern: string): RegExp {
  let p = normPath(pattern.trim()).replace(/^\/+/, '')
  if (p.endsWith('/')) p += '**'
  const anyDepth = !p.includes('/')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!
    if (c === '*' && p[i + 1] === '*') {
      // `**/` passt auch auf keinen Ordner
      if (p[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${anyDepth ? '(?:.*/)?' : ''}${re}$`)
}

/** Dateien (relativ zum Projekt), die ein Muster eines Risikobereichs treffen; je Datei und Bereich ein Treffer. */
export function matchRiskAreas(areas: readonly RiskArea[], files: readonly string[]): RiskHit[] {
  const hits: RiskHit[] = []
  for (const area of areas) {
    const compiled = area.pfade.map(m => ({ m, re: globToRegExp(m) }))
    for (const file of files) {
      const f = normPath(file)
      const hit = compiled.find(c => c.re.test(f))
      if (hit) hits.push({ bereich: area.name, datei: f, muster: hit.m })
    }
  }
  return hits
}
