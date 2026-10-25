// Suchen in Bash-Befehlen (Register: Zahl der Suchen). Rein: kein Node, keine Mod-API.
//
// Hintergrund: In den nativen Builds von Claude Code für Linux und macOS fehlen die Werkzeuge Grep und Glob; gesucht
// wird über Bash mit `grep` (ugrep), `find` (bfs) und `rg` (ripgrep). Unter Windows gibt es Grep und Glob weiter.
// Das Plugin behandelt immer beide Wege, ohne das System zu erkennen: eine erkannte Bash-Suche zählt wie ein
// Aufruf von Grep oder Glob.
//
// Regel je Befehlsabschnitt (Pipeline-Stufe, Glied einer `&&`/`;`-Kette, auch in Verpackungen und Befehlsersetzung):
// - `find`, `bfs`: immer eine Suche.
// - `grep`, `egrep`, `fgrep`, `ugrep`: eine Suche, wenn rekursiv (`-r`, `-R`, `--recursive`, `--dereference-recursive`,
//   `-d recurse`, `--directories=recurse`) oder mit Datei- bzw. Ordner-Argumenten nach dem Muster. Ohne beides liest
//   grep die Eingabe (Filter wie `git log | grep x`) und sucht keine Dateien.
// - `rg`: eine Suche, wenn Pfade nach dem Muster stehen oder die Eingabe nicht aus Pipe oder Datei kommt (rg ohne Pfad
//   durchsucht den Ordner).
// - `--help`, `--version` (`-V`) zählen nicht.
// Jede Suchstufe zählt einzeln (`find … ; grep -rn x src` = 2), wie zwei Aufrufe von Grep/Glob. Nicht erkannt:
// `xargs grep …` (Programm ist xargs), `git grep`, Programme mit Pfad werden wie ohne Pfad behandelt (Name zählt).

import { commandName, walkSegments } from './bash-shell.ts'
import type { Segment } from './bash-shell.ts'

const GREPS = new Set(['grep', 'egrep', 'fgrep', 'ugrep'])
const FINDS = new Set(['find', 'bfs'])

/** grep/ugrep: kurze Optionen mit Wert (Rest der Gruppe oder nächstes Wort). */
const GREP_SHORT_VALUED = 'efABCmdDgtOMNJK'
/** grep/ugrep: lange Optionen, deren Wert ohne `=` im nächsten Wort steht. */
const GREP_LONG_VALUED = [
  'regexp', 'file', 'after-context', 'before-context', 'context', 'max-count', 'devices', 'directories', 'label', 'include',
  'exclude', 'exclude-dir', 'exclude-from', 'include-dir', 'include-from', 'glob', 'iglob', 'file-type', 'file-extension',
  'file-magic', 'neg-regexp', 'jobs', 'range', 'binary-files', 'and', 'andnot', 'not',
]
/** rg: kurze und lange Optionen mit Wert. */
const RG_SHORT_VALUED = 'ABCdeEfgjmMrtT'
const RG_LONG_VALUED = [
  'regexp', 'file', 'glob', 'iglob', 'type', 'type-not', 'type-add', 'type-clear', 'context', 'after-context', 'before-context',
  'max-count', 'max-depth', 'color', 'colors', 'sort', 'sortr', 'replace', 'max-columns', 'max-filesize', 'threads', 'encoding',
  'field-match-separator', 'field-context-separator', 'context-separator', 'path-separator', 'ignore-file', 'engine', 'pre', 'pre-glob',
]

type Parsed = { positional: string[]; pattern: boolean; recursive: boolean; info: boolean }

/** Optionen und Wörter eines grep- bzw. rg-Aufrufs; `pattern`: Muster kam über `-e`/`-f` (dann sind alle Wörter Pfade). */
function parseArgs(args: readonly string[], shortValued: string, longValued: readonly string[]): Parsed {
  const out: Parsed = { positional: [], pattern: false, recursive: false, info: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--') {
      out.positional.push(...args.slice(i + 1))
      break
    }
    if (a === '-' || !a.startsWith('-')) {
      out.positional.push(a)
      continue
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const key = a.slice(2, eq < 0 ? undefined : eq)
      const value = eq < 0 ? undefined : a.slice(eq + 1)
      if (key === 'help' || key === 'version') out.info = true
      if (key === 'recursive' || key === 'dereference-recursive') out.recursive = true
      if (key === 'regexp' || key === 'file') out.pattern = true
      if (longValued.includes(key) && value === undefined) {
        const v = args[++i]
        if (key === 'directories' && v === 'recurse') out.recursive = true
      } else if (key === 'directories' && value === 'recurse') out.recursive = true
      continue
    }
    const s = a.slice(1)
    for (let k = 0; k < s.length; k++) {
      const c = s[k]!
      if (c === 'r' || c === 'R') out.recursive = true
      if (c === 'V') out.info = true
      if (shortValued.includes(c)) {
        if (c === 'e' || c === 'f') out.pattern = true
        const v = k === s.length - 1 ? args[++i] : s.slice(k + 1)
        if (c === 'd' && v === 'recurse') out.recursive = true
        break
      }
    }
  }
  return out
}

/** Zählt dieser Abschnitt als Suche? */
function segSearch(seg: Segment): boolean {
  const { name, args } = commandName(seg)
  if (FINDS.has(name)) return true
  const isGrep = GREPS.has(name)
  if (!isGrep && name !== 'rg') return false
  const p = isGrep ? parseArgs(args, GREP_SHORT_VALUED, GREP_LONG_VALUED) : parseArgs(args, RG_SHORT_VALUED, RG_LONG_VALUED)
  if (p.info) return false
  const paths = p.pattern ? p.positional : p.positional.slice(1)
  const fileArgs = paths.filter(f => f !== '-')
  if (isGrep) return p.recursive || fileArgs.length > 0
  // rg: mit Pfaden, oder ohne Eingabe aus Pipe/Datei (dann durchsucht es den Ordner); `--files` braucht kein Muster
  if (args.includes('--files')) return true
  return fileArgs.length > 0 || (!seg.pipedIn && seg.stdin === null)
}

/**
 * Zahl der Suchen in einem Bash-Befehl (`grep`, `egrep`, `fgrep`, `ugrep`, `rg`, `find`, `bfs`; Regel oben), auch in
 * Verpackungen (`bash -c`), Befehlsersetzung und ausgeführten Heredocs. Heuristik wie `bashReadTargets`.
 */
export function bashSearchCount(command: string): number {
  let n = 0
  walkSegments(command, seg => {
    if (segSearch(seg)) n += 1
  })
  return n
}
