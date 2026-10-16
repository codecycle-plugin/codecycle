// Lesziele eines Bash-/PowerShell-Befehls (Register). Rein: kein Node, keine Mod-API.

import { commandName, walkSegments } from './bash-shell.ts'
import type { Segment } from './bash-shell.ts'

/** Optionen je Lese-Befehl, deren Wert im nächsten Wort steht und keine Datei ist (klein verglichen). */
const READERS: Record<string, readonly string[]> = {
  cat: [],
  tac: [],
  bat: [],
  less: [],
  more: [],
  type: [],
  head: ['-n', '-c', '--lines', '--bytes'],
  tail: ['-n', '-c', '--lines', '--bytes'],
  nl: ['-b', '-d', '-f', '-h', '-i', '-l', '-n', '-s', '-v', '-w'],
  wc: [],
  'get-content': ['-tail', '-totalcount', '-head', '-first', '-last', '-skip', '-readcount', '-encoding', '-delimiter', '-filter', '-include', '-exclude', '-stream'],
}
READERS.gc = READERS['get-content']!

/** Dateien eines Lese-Befehls: Wörter ohne Optionen; `-Path`/`-LiteralPath` (auch `-Path:x`) nennen die Datei, Listen mit Komma. */
function readFiles(args: readonly string[], valued: readonly string[]): string[] {
  const files: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    const low = a.toLowerCase()
    if (a === '--') {
      files.push(...args.slice(i + 1))
      break
    }
    if (low === '-path' || low === '-literalpath' || low === '-lp') {
      if (args[i + 1] !== undefined) files.push(...args[++i]!.split(','))
    } else if (/^-(path|literalpath|lp):/.test(low)) files.push(...a.slice(a.indexOf(':') + 1).split(','))
    else if (a.startsWith('-') && a !== '-') {
      if (valued.includes(low)) i++
    } else files.push(...a.split(','))
  }
  return files
}

/** Lesziele eines einzelnen Abschnitts. */
function segReads(seg: Segment, shell: 'bash' | 'powershell'): string[] {
  const { name, args } = commandName(seg)
  if (name === 'type' && shell === 'bash') return [] // Bash: Builtin zum Nachschlagen von Befehlen
  if (name === 'sed') {
    if (args.some(a => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) return [] // schreibt: bashWriteTargets
    let hasScript = false
    const pos: string[] = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!
      if (/^-[a-zA-Z]*[ef]$/.test(a)) {
        hasScript = true
        i++
      } else if (a.startsWith('--expression=') || a.startsWith('--file=')) hasScript = true
      else if (a === '--') pos.push(...args.slice(i + 1))
      else if (!a.startsWith('-') || a === '-') pos.push(a)
    }
    return hasScript ? pos : pos.slice(1)
  }
  const valued = READERS[name]
  return valued ? readFiles(args, valued) : []
}

/**
 * Dateien, die ein Bash- oder PowerShell-Befehl liest (`cat`, `head`, `tail`, `less`, `more`, `nl`, `wc`,
 * `sed` ohne `-i`, `Get-Content`/`gc`/`type`), auch in Verpackungen. Ohne Doppelte, in der Reihenfolge des
 * Auftretens (`type` nur in PowerShell). Wie `bashWriteTargets` eine Heuristik: Pfade mit Variablen oder Platzhaltern (`*`) bleiben draußen.
 */
export function bashReadTargets(command: string, shell: 'bash' | 'powershell' = 'bash'): string[] {
  const out: string[] = []
  // PowerShell kennt den Backslash nicht als Fluchtzeichen: Pfade wie `src\a.ts` bleiben so erhalten (als `src/a.ts`)
  walkSegments(shell === 'powershell' ? command.replace(/\\/g, '/') : command, seg => {
    for (const f of segReads(seg, shell)) {
      if (f === '' || f === '-' || f === '/dev/null' || /^nul$/i.test(f) || /[*?$]/.test(f) || out.includes(f)) continue
      out.push(f)
    }
  })
  return out
}
