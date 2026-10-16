import { spawnSync } from 'node:child_process'

import type { Run, RunResult } from './types.ts'

/** Programm aufrufen. Windows: .cmd-Starter (npm) über die Shell, nur wenn `where` das Programm kennt. */
export const defaultRun: Run = (cmd, args, cwd) => {
  const options = { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, windowsHide: true } as const
  let r = spawnSync(cmd, args, options)
  const code = (r.error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT' && process.platform === 'win32') {
    if (spawnSync('where', [cmd], { encoding: 'utf8', cwd, windowsHide: true }).status !== 0) return missing()
    // über cmd.exe: Zeichen mit Sonderbedeutung nicht zulassen statt falsch zu quoten
    if (args.some(a => /[&|<>^%"\r\n]/.test(a))) return { code: 2, stdout: '', stderr: 'Argument mit Sonderzeichen', missing: false }
    const quoted = args.map(a => (/[\s()]/.test(a) ? `"${a}"` : a))
    r = spawnSync([cmd, ...quoted].join(' '), { ...options, shell: true })
  } else if (code === 'ENOENT') {
    return missing()
  }
  if (r.error) return { code: 2, stdout: r.stdout ?? '', stderr: String(r.error), missing: false }
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', missing: false }
}

function missing(): RunResult {
  return { code: 127, stdout: '', stderr: 'Programm nicht gefunden', missing: true }
}

/** JSON aus Ausgabe, die davor Protokollzeilen haben darf. Null bei Fehlschlag. */
export function parseJson(text: string): unknown {
  const t = text.trim()
  try {
    return JSON.parse(t)
  } catch {
    // erste Zeile, die mit { oder [ beginnt, bis zum Ende
    const m = t.match(/^[[{]/m)
    if (!m || m.index === undefined) return null
    try {
      return JSON.parse(t.slice(m.index))
    } catch {
      return null
    }
  }
}

/** Absoluten Pfad aus dem Graphen relativ zum Projekt machen (mit `/`). */
export function relPath(root: string, p: string): string {
  const norm = (x: string) => x.replace(/\\/g, '/')
  const r = norm(root).replace(/\/+$/, '')
  const f = norm(p)
  const insensitive = /^[a-z]:/i.test(r)
  const prefix = `${r}/`
  const hit = insensitive ? f.toLowerCase().startsWith(prefix.toLowerCase()) : f.startsWith(prefix)
  return hit ? f.slice(prefix.length) : f
}

export function isTestPath(p: string): boolean {
  return (
    /(^|\/)(tests?|__tests__|spec)\//i.test(p) ||
    /(\.(test|spec)\.[a-z]+$|_test\.(go|py|php)$|(^|\/)test_[^/]+\.py$|Test\.php$)/.test(p)
  )
}
