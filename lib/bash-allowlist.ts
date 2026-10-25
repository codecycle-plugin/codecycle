// Erlaubtliste für Bash der Lese-Rollen. Rein: kein Node, keine Mod-API.

import { bashWriteTargets } from './bash-write-targets.ts'
import { commandName, positionals, PREFIX, walkSegments } from './bash-shell.ts'

// ---------------------------------------------------------------------------
// Bash der Lese-Rollen: nur git (lesend), codecycle-Lesebefehle (auch der Rückfall `node …/cli.ts`) und Lesebefehle,
// ohne Schreibziel (`bashWriteTargets`).
//
// Der Zaun bleibt ein Netz gegen Versehen, keine Sicherheitsgrenze. Die Bash-Ausnahme soll aber keine bequeme
// Hintertür sein: Deshalb prüft die Liste auch Optionen, über die erlaubte Befehle Programme starten
// oder Dateien schreiben (`rg --pre`, `sort -o`, `tree -o`, zweites Argument von `uniq`, `git -c`, `--ext-diff`,
// `--textconv`, `--output`, `node -e`/`--require`). Interaktive Anzeiger (`less`, `more`, `bat` mit Pager) fehlen
// absichtlich: Sie kennen Befehls-Escapes und hängen ohne Terminal ohnehin.

/** Lese- und Hilfsbefehle ohne Schreibwirkung; Optionen von rg, sort, tree, uniq, sed, find werden gesondert geprüft. */
const PLAIN_COMMANDS = new Set([
  'cat', 'head', 'tail', 'wc', 'nl', 'tac', 'grep', 'egrep', 'fgrep', 'rg', 'ls', 'dir', 'tree',
  'pwd', 'cd', 'echo', 'printf', 'test', '[', 'true', 'false', 'sort', 'uniq', 'cut', 'diff', 'basename', 'dirname',
  'realpath', 'readlink', 'which', 'type', 'date', 'stat', 'file',
])

/** Optionen erlaubter Befehle, die ein Programm starten oder eine Datei schreiben (Name → Prüfung je Wort). */
const BAD_OPTION: Record<string, (a: string) => boolean> = {
  tree: a => /^-o/.test(a) || /^--output(=|$)/.test(a),
}

/**
 * Erlaubtliste der Optionen für `rg` und `sort`: Beide haben Optionen, die Programme
 * starten (`rg --pre`, `--hostname-bin`, `-z`/`--search-zip` mit Entpackern; `sort --compress-program`) oder Dateien
 * schreiben (`sort -o`, `-T`). Eine Sperrliste übersieht neue Optionen künftiger Versionen; deshalb hier nur bekannte
 * Lese- und Anzeige-Optionen (für `sed` siehe `sedProblem`). Bei `tree`, `find`, `uniq` bleibt es (ohne großen Umbau) bei der gezielten Sperre:
 * deren Schreib- und Startoptionen sind wenige und seit Langem fest. Unbekannte Optionen werden verweigert, auch harmlose
 * (lieber eine Rückfrage zu viel als eine Hintertür).
 */
type OptionList = { short: string; shortValued: string; long: readonly string[]; longValued: readonly string[] }

const OPTION_LISTS: Record<string, OptionList> = {
  rg: {
    short: 'abcFHhiIlLnNopqsSuUvVwx0.',
    shortValued: 'ABCdeEfgjmMrtT',
    long: [
      'line-number', 'no-line-number', 'ignore-case', 'smart-case', 'case-sensitive', 'word-regexp', 'line-regexp', 'fixed-strings',
      'files-with-matches', 'files-without-match', 'files', 'count', 'count-matches', 'only-matching', 'invert-match', 'hidden',
      'no-hidden', 'no-ignore', 'no-ignore-vcs', 'no-ignore-parent', 'no-ignore-dot', 'no-ignore-global', 'no-ignore-exclude',
      'no-ignore-files', 'no-require-git', 'unrestricted', 'multiline', 'multiline-dotall', 'json', 'heading', 'no-heading',
      'with-filename', 'no-filename', 'stats', 'follow', 'pcre2', 'no-pcre2', 'trim', 'column', 'no-column', 'vimgrep', 'null',
      'null-data', 'quiet', 'type-list', 'passthru', 'passthrough', 'no-messages', 'binary', 'no-binary', 'text', 'crlf',
      'one-file-system', 'include-zero', 'pretty', 'byte-offset', 'glob-case-insensitive', 'ignore-file-case-insensitive',
      'max-columns-preview', 'block-buffered', 'line-buffered', 'no-unicode', 'sort-files', 'no-config', 'debug', 'help', 'version',
    ],
    longValued: [
      'regexp', 'file', 'glob', 'iglob', 'type', 'type-not', 'type-add', 'type-clear', 'context', 'after-context', 'before-context',
      'max-count', 'max-depth', 'color', 'colors', 'sort', 'sortr', 'replace', 'max-columns', 'max-filesize', 'threads', 'encoding',
      'field-match-separator', 'field-context-separator', 'context-separator', 'path-separator', 'ignore-file', 'engine',
    ],
  },
  sort: {
    short: 'bdfghiMnrRsuVzcCm',
    shortValued: 'ktS',
    long: [
      'ignore-leading-blanks', 'dictionary-order', 'ignore-case', 'general-numeric-sort', 'ignore-nonprinting', 'month-sort',
      'human-numeric-sort', 'numeric-sort', 'random-sort', 'reverse', 'version-sort', 'check', 'merge', 'stable', 'unique',
      'zero-terminated', 'debug', 'help', 'version',
    ],
    longValued: ['key', 'field-separator', 'buffer-size', 'parallel', 'sort', 'batch-size', 'files0-from', 'random-source'],
  },
}

/** Erste Option außerhalb der Erlaubtliste (so geschrieben wie im Befehl), sonst null. Nach `--` nur Dateien. */
function optionOutsideList(args: readonly string[], list: OptionList): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--') return null
    if (a === '-' || !a.startsWith('-')) continue
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const key = a.slice(2, eq < 0 ? undefined : eq)
      if (list.long.includes(key) && eq < 0) continue
      if (list.long.includes(key) && key === 'check') continue // sort --check=quiet
      if (list.longValued.includes(key)) {
        if (eq < 0) i++
        continue
      }
      return a
    }
    const s = a.slice(1)
    for (let k = 0; k < s.length; k++) {
      const c = s[k]!
      if (list.shortValued.includes(c)) {
        if (k === s.length - 1) i++
        break
      }
      if (!list.short.includes(c)) return a
    }
  }
  return null
}

/**
 * grep, egrep, fgrep, ugrep: Optionen, die Programme starten, Dateien schreiben oder eine Konfiguration laden. Auf
 * Linux und macOS ist `grep` in Claude Code eine Shell-Funktion auf das eingebaute ugrep (sie gibt genau diese
 * Optionen an das System-grep weiter, das sie meist nicht kennt); anderswo kann ugrep das echte grep sein. ugrep:
 * `--filter` startet Filterprogramme, `--pager` einen Anzeiger, `-Q`/`--query` eine Oberfläche, die mit `--view`
 * oder PAGER/EDITOR Programme startet, `--save-config` schreibt eine Datei, `--config`/`---` liest eine Konfiguration,
 * die wieder `filter=` setzen kann. ugrep kennt keine Abkürzungen langer Optionen (geprüft mit 7.8.4: `--pag` ist
 * ungültig); GNU grep hat keine solchen Optionen. Gezielte Sperre statt Erlaubtliste: die Lese-Optionen von GNU grep und
 * ugrep sind sehr viele, die gefährlichen wenige und benannt.
 */
const GREP_NAMES = new Set(['grep', 'egrep', 'fgrep', 'ugrep'])
const GREP_BAD_LONG = /^--(filter|pager|view|query|save-config|config)(=|-|$)/
/** kurze Optionen mit Wert (GNU grep und ugrep): danach ist der Rest der Gruppe der Wert */
const GREP_SHORT_VALUED = 'efABCmdDgtOMNJK'

function grepProblem(name: string, args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--') return null
    if (a === '-' || !a.startsWith('-')) continue
    if (a.startsWith('---') || GREP_BAD_LONG.test(a)) return `${name} ${a} ist nicht erlaubt (startet ein Programm, schreibt eine Datei oder lädt eine Konfiguration)`
    if (a.startsWith('--')) continue
    const s = a.slice(1)
    for (let k = 0; k < s.length; k++) {
      const c = s[k]!
      if (c === 'Q') return `${name} ${a} ist nicht erlaubt (-Q startet die Suchoberfläche von ugrep, die Programme starten kann)`
      if (GREP_SHORT_VALUED.includes(c)) {
        if (k === s.length - 1) i++
        break
      }
    }
  }
  return null
}

/** Ein sed-Befehl `p` mit Zeilenadresse: `5p`, `$p`, `10,20p`, `3,$p`, `1,+4p`. */
const SED_PRINT = /^(\d+|\$)(,(\d+|\$|\+\d+))?p$/

/**
 * `sed` nur als Zeilenanzeige
 * `sed -n '<Adresse>p' <Dateien>`, auch mehrere `-e` oder mit `;` getrennt. Eine Sperre nur von `-i` ließ Skripte durch,
 * die schreiben (`w`, `W`, `s///w`) oder Programme starten (`e`, `s///e`), ebenso Skriptdateien (`-f`). Erlaubtliste
 * statt Zerlegung der sed-Grammatik, wie bei `rg` und `sort`.
 */
function sedProblem(args: readonly string[]): string | null {
  if (args.some(a => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) return 'sed -i ändert Dateien (nicht erlaubt)'
  const why = (detail: string) => `sed ${detail} ist nicht erlaubt (nur Zeilenanzeige: sed -n '10,20p' <datei>; andere sed-Skripte können Dateien schreiben oder Programme starten)`
  let quiet = false
  const scripts: string[] = []
  const pos: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--') {
      pos.push(...args.slice(i + 1))
      break
    }
    if (a === '-n' || a === '--quiet' || a === '--silent') quiet = true
    else if (a === '-e' || a === '-ne' || a === '--expression') {
      if (a === '-ne') quiet = true
      if (args[i + 1] === undefined) return why(a)
      scripts.push(args[++i]!)
    } else if (a.startsWith('--expression=')) scripts.push(a.slice('--expression='.length))
    else if (a.startsWith('-') && a !== '-') return why(a)
    else pos.push(a)
  }
  if (scripts.length === 0) {
    if (pos.length === 0) return why('ohne Skript')
    scripts.push(pos.shift()!)
  }
  if (!quiet) return why('ohne -n')
  for (const s of scripts) {
    const bad = s.split(/[;\n]/).map(p => p.trim()).find(p => p !== '' && !SED_PRINT.test(p))
    if (bad !== undefined || s.trim() === '') return why(`'${s}'`)
  }
  return null
}

/** Erlaubte Werkzeug-Pfade einer Lese-Rolle (vom Mod: Hauptordner und Plugin-Wurzel). */
export type ReaderAllowed = {
  /** genaue Pfade von `cli.ts` für `node <pfad> <befehl>`: `<Hauptordner>/.codecycle/tool/cli.ts`, `<Plugin>/tool/cli.ts` */
  cli: readonly string[]
  /** genaue Pfade des Starters `codecycle` mit Pfad (ohne `.cmd`/`.ps1`): `<Plugin>/bin/codecycle` */
  launchers?: readonly string[]
}

/** Gleicher Pfad? Schrägstriche, Git-Bash-Laufwerk `/c/…` = `c:/…`; mit Laufwerksbuchstaben ohne Groß-/Kleinschreibung. */
export function sameToolPath(a: string, b: string): boolean {
  const norm = (p: string): string => p.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  let x = norm(a)
  const y = norm(b)
  const drive = /^[A-Za-z]:\//
  if (drive.test(y)) {
    const m = /^\/([A-Za-z])\//.exec(x)
    if (m) x = `${m[1]}:/${x.slice(3)}`
  }
  if (x === '' || y === '') return false
  return drive.test(y) || drive.test(x) ? x.toLowerCase() === y.toLowerCase() : x === y
}

/** git-Unterbefehle, die nur lesen */
const GIT_READ = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'blame'])

/** git-Unterbefehle für Lese-Rollen: nur lesend, ohne Optionen, die Dateien schreiben oder Programme starten. */
function readerGitProblem(args: readonly string[]): string | null {
  let i = 0
  while (i < args.length && args[i]!.startsWith('-')) {
    const a = args[i]!
    if (a === '-C') i += 2
    else if (a === '--no-pager') i += 1
    else return `git ${a} ist nicht erlaubt (globale Optionen nur -C <ordner> und --no-pager)`
  }
  const sub = args[i] ?? ''
  if (!GIT_READ.has(sub)) return `git ${sub || '(ohne Unterbefehl)'} ist für Lese-Rollen nicht erlaubt (nur ${[...GIT_READ].join(', ')})`
  const bad = args.slice(i + 1).find(a => /^--(output|ext-diff|textconv)(=|$)/.test(a))
  return bad ? `git ${sub} ${bad} ist nicht erlaubt (schreibt eine Datei oder startet ein Programm)` : null
}

/**
 * codecycle-Befehle für Lese-Rollen. Ohne `effort`: `--record` schreibt `aufwand.json`. `notiz` hängt nur eine Zeile
 * an `notizen.md` an, und nur mit Schalter `notizen` an.
 */
export const READER_TOOL_COMMANDS = ['test', 'locate', 'callers', 'info', 'tasks', 'selftest', 'guard', 'notiz'] as const

function readerToolProblem(args: readonly string[]): string | null {
  const sub = args[0] ?? 'help'
  if (sub === 'help' || sub === '--help' || sub === '--version') return null
  if (sub === 'check' || sub === 'lint' || sub === 'format') {
    return `codecycle ${sub} ist für Lese-Rollen nicht erlaubt (führt Lint und Format des Projekts aus; Format und Lint mit Korrektur ändern Dateien). Lint- und Format-Ergebnis steht im Bericht des Bauenden; Tests mit codecycle test`
  }
  if (!(READER_TOOL_COMMANDS as readonly string[]).includes(sub)) return `codecycle ${sub} ist für Lese-Rollen nicht erlaubt`
  if (sub === 'guard' && args.includes('--record')) return 'codecycle guard --record ist für Lese-Rollen nicht erlaubt (setzt die Grundlage für guard)'
  return null
}

/** Was eine Lese-Rolle per Bash darf, vollständig, für Verweigerungsmeldungen (gleiche Liste in agents/*.md). */
export function readerBashAllowedText(): string {
  const tool: string[] = READER_TOOL_COMMANDS.map(c => (c === 'guard' ? 'guard (ohne --record)' : c))
  return `git ${[...GIT_READ].join('/')} (nur lesend); codecycle ${tool.join(', ')} (Rückfall: node <Hauptordner>/.codecycle/tool/cli.ts <befehl>); Lesebefehle wie cat, head, tail, wc, grep, rg, ls, find (ohne -exec/-delete), sed -n '10,20p' <datei>`
}

/** Wofür die Erlaubtliste gilt: Name in Meldungen, git- und codecycle-Regeln der Rolle. */
type AllowProfile = {
  who: string
  git: (args: readonly string[]) => string | null
  /** Argumente nach `codecycle` bzw. nach `…/cli.ts`; null = erlaubt */
  tool: (args: readonly string[]) => string | null
}

/**
 * Warum ein Bash-Befehl einer Lese-Rolle (Plan-Prüfer, Einrichter) verweigert wird, sonst null. Jeder Abschnitt (auch in
 * Befehlsersetzung) muss erlaubt sein; Verpackungen (`bash -c`, `eval`, `pwsh`) sind es nicht. git nur lesend, codecycle
 * nur `READER_TOOL_COMMANDS` (kein check/lint/format: Format kann schreiben) und kein Schreibziel, auch keine Umleitung.
 * Hilfsskripte fallen weg, weil node nur mit genau dem cli.ts des Werkzeugs läuft. Heuristik wie `bashWriteTargets`.
 */
export function readerBashProblem(command: string, allowed: ReaderAllowed): string | null {
  const problem = allowlistProblem(command, allowed, { who: 'Lese-Rollen', git: readerGitProblem, tool: readerToolProblem })
  if (problem) return problem
  const target = bashWriteTargets(command)[0]
  return target ? `${target} wäre ein Schreibziel (Umleitung oder schreibender Befehl); Lese-Rollen schreiben nur ihren Bericht, und den mit Write` : null
}

function allowlistProblem(command: string, allowed: ReaderAllowed, profile: AllowProfile): string | null {
  let problem: string | null = null
  walkSegments(command, seg => {
    if (problem) return
    // Zuweisungen und Präfixe vor dem Befehl (`PAGER=…`, `GIT_EXTERNAL_DIFF=…`,
    // `RIPGREP_CONFIG_PATH=…`, `env`, `sudo` …) können erlaubte Befehle Programme starten lassen
    const first = seg.words[0] ?? ''
    if (/^[A-Za-z_]\w*=/.test(first)) {
      problem = `Umgebungsvariable vor dem Befehl (${first.split('=')[0]}=…) ist nicht erlaubt (kann über PAGER, GIT_EXTERNAL_DIFF u. Ä. Programme starten)`
      return
    }
    if (PREFIX.has(first)) {
      problem = `${first} ist für ${profile.who} nicht erlaubt`
      return
    }
    // `.`/`source` führt in Bash eine Datei aus (ohne Pfad auch aus dem aktuellen Ordner); commandName
    // entfernt `.` als PowerShell-Aufrufzeichen, PowerShell ist für diese Rollen aber gesperrt
    if (first === '.' || first === 'source') {
      problem = `${first} (source) führt eine Datei als Skript aus und ist für ${profile.who} nicht erlaubt`
      return
    }
    const { name, args, program } = commandName(seg)
    if (name === '') return
    // Programme nur mit Namen (Suche über den PATH); mit Pfad könnte es jede Datei im Projekt sein
    // (`./cat`, `src/git`). Einzige Ausnahme: genau der Starter des Plugins, geprüft im Zweig `codecycle`.
    if (/[\\/]/.test(program) && name !== 'codecycle') {
      problem = `${name} bitte ohne Pfad aufrufen, nicht ${program} (für ${profile.who} laufen Programme nur über ihren Namen; mit Pfad könnte es eine beliebige Datei sein)`
      return
    }
    if (name === 'git') problem = profile.git(args)
    else if (name === 'codecycle') {
      // nackt (Starter auf dem PATH) oder genau der Starter des Plugins; nie ein Programm gleichen Namens anderswo
      if (/[\\/]/.test(program) && !allowed.launchers?.some(l => sameToolPath(program.replace(/\.(exe|cmd|bat|ps1)$/i, ''), l))) {
        problem = `codecycle nur als „codecycle <befehl>“ oder über den Starter des Plugins, nicht ${program}`
      } else problem = profile.tool(args)
    } else if (name === 'node') {
      // nur genau `node <Hauptordner>/.codecycle/tool/cli.ts <befehl>` oder `node <Plugin>/tool/cli.ts <befehl>`, keine
      // Optionen davor. Genaue Pfade statt Endung `tool/cli.ts`: sonst liefe etwa eine angelegte x/tool/cli.ts.
      if (!allowed.cli.some(p => sameToolPath(args[0] ?? '', p))) {
        problem = 'node nur als Rückfall des Werkzeugs in genau dieser Form: node <Hauptordner>/.codecycle/tool/cli.ts <befehl> (absoluter Pfad; keine Optionen wie -e, -p, --require, --import)'
      } else problem = profile.tool(args.slice(1))
    } else if (name === 'uniq') {
      if (positionals(args, ['-f', '-s', '-w', '--skip-fields', '--skip-chars', '--check-chars']).length > 1) problem = 'uniq mit zweitem Dateinamen schreibt eine Ausgabedatei'
    } else if (OPTION_LISTS[name]) {
      const bad = optionOutsideList(args, OPTION_LISTS[name]!)
      if (bad) problem = `${name} ${bad} ist nicht erlaubt (nur bekannte Lese-Optionen; andere können Programme starten oder Dateien schreiben)`
    } else if (BAD_OPTION[name] && args.some(BAD_OPTION[name]!)) {
      problem = `${name} ${args.find(BAD_OPTION[name]!)} ist nicht erlaubt (startet ein Programm oder schreibt eine Datei)`
    } else if (name === 'sed') {
      problem = sedProblem(args)
    } else if (GREP_NAMES.has(name)) {
      problem = grepProblem(name, args)
    } else if (name === 'find' || name === 'bfs') {
      // GNU find und bfs (auf Linux/macOS in Claude Code die Shell-Funktion `find`): Aktionen, die löschen
      // (`-delete`, bfs auch `-rm`), Programme starten (`-exec`, `-execdir`, `-ok`, `-okdir`) oder Dateien schreiben
      // (`-fprint`, `-fprint0`, `-fprintf`, `-fls`)
      const bad = args.find(a => /^-(delete|rm|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(a))
      if (bad) problem = `${name} ${bad} ist nicht erlaubt`
    } else if (!PLAIN_COMMANDS.has(name)) problem = `${name} ist für ${profile.who} nicht erlaubt`
  })
  return problem
}
