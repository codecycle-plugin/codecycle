// Umgehung der Git-Hooks erkennen (`--no-verify`, `commit -n`, `core.hooksPath` …). Der Mod sperrt solche Befehle
// Rein: kein Node, keine Mod-API.

import { bashWriteTargets, segTargets } from './bash-write-targets.ts'
import { heredocsRun, MAX_DEPTH, positionals, splitShell, unwrap } from './bash-shell.ts'

/**
 * Umgeht der Befehl die Git-Hooks? `--no-verify` (jeder Git-Befehl, auch abgekürzt), `git commit -n`,
 * das Setzen von `core.hooksPath` (auch über `include.path`, Abschnitt `core`, Umgebungsvariablen,
 * Aliase) und Schreiben in `.git/config` bzw. `.git/hooks/`. Liefert den Grund oder null.
 * Verpackungen werden entpackt: `sh|bash|zsh|dash -c`, `pwsh|powershell -c|-Command`, `cmd /c`, `eval`,
 * `Invoke-Expression`, Befehlsersetzung `$(…)` und Backticks (auch in Anführungszeichen), Klammern und
 * Blöcke. Heredoc-Inhalte zählen, wenn im selben Befehl ein Interpreter läuft (Abschnitt `heredocsRun`).
 * Text in Anführungszeichen (Commit-Nachrichten) löst nichts aus. Lieber ein Fehlalarm als eine Lücke.
 * PowerShell: Backslashes werden zu Schrägstrichen (dort kein Fluchtzeichen), Schreibziele auch über Cmdlets.
 * `agent`: zusätzlich `git commit-tree` und `git update-ref` (Commit ohne `git commit`, also ohne Pre-Commit-Hook).
 */
export function hookBypass(command: string, shell: 'bash' | 'powershell' = 'bash', agent = false): string | null {
  const text = shell === 'powershell' ? command.replace(/\\/g, '/') : command
  const hit = bypassIn(text, 0, false, agent)
  if (hit) return hit
  // Schreibziele über alle Verpackungen, auch Cmdlets und [IO.File]:: (bash-write-targets.ts)
  return bashWriteTargets(text).some(t => GIT_INTERNAL.test(normalize(t))) ? 'Schreiben in .git/config oder .git/hooks' : null
}

function bypassIn(command: string, depth: number, run: boolean, agent: boolean): string | null {
  if (depth > MAX_DEPTH) return /(^|[^\w.-])git(\.exe)?([^\w.-]|$)/i.test(command) ? 'zu tief verschachtelter Git-Aufruf (nicht prüfbar)' : null
  const segs = splitShell(command)
  const heredocs = run || heredocsRun(segs)
  const hasGit = segs.some(s => s.words.some(isGit))
  for (const seg of segs) {
    const hit = gitBypass(seg.words, depth, agent) ?? envBypass(seg.words, hasGit, command)
    if (hit) return hit
    if (segTargets(seg).some(t => GIT_INTERNAL.test(normalize(t)))) return 'Schreiben in .git/config oder .git/hooks'
    for (const inner of unwrap(seg.words)) {
      if (inner.encoded === null) return 'verschlüsselter Befehl (-EncodedCommand, nicht prüfbar)'
      const r = bypassIn(inner.encoded ?? inner.text, depth + 1, true, agent)
      if (r) return r
    }
    for (const inner of [...seg.nested, ...(heredocs ? seg.heredocs : [])]) {
      const r = bypassIn(inner, depth + 1, false, agent)
      if (r) return r
    }
  }
  return null
}

/** `.git/config`, `.git/config.worktree`, `.git/worktrees/<name>/config*`, `.git/hooks/…` (wie DEFAULT_CONTROL in protected.ts) */
const REPO_INTERNAL = /(^|\/)\.git\/(config(\.worktree)?|worktrees\/[^/]+\/config(\.worktree)?|hooks(\/.*)?)$/i
/**
 * Git-Konfiguration des Benutzers und des Systems: dort kann `core.hooksPath` ebenso stehen. Global `~/.gitconfig`,
 * `~/.config/git/config`, `$XDG_CONFIG_HOME/git/config` (auch `${XDG_CONFIG_HOME:-…}`, PowerShell `$env:`, cmd `%…%`); System `<prefix>/etc/gitconfig` (auch Git für Windows,
 * `…/Git/etc/gitconfig`) und unter Windows `%PROGRAMDATA%/Git/config`. Ein Projektordner `git/config` zählt nicht.
 */
const USER_CONFIG = /(^|\/)(\.gitconfig|\.config\/git\/config|etc\/gitconfig)$|(^|\/)(\$\{XDG_CONFIG_HOME[^}]*\}|\$XDG_CONFIG_HOME|\$env:XDG_CONFIG_HOME|%XDG_CONFIG_HOME%)\/git\/config$|(^|[/:%}])programdata%?\/git\/config$/i
const GIT_INTERNAL = { test: (p: string): boolean => REPO_INTERNAL.test(p) || USER_CONFIG.test(p) }

/** Schrägstriche vereinheitlichen, `.` und `..` auflösen (`.git/./config`, `src/../.git/config`). */
export function normalize(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  const out: string[] = []
  parts.forEach((part, i) => {
    if (part === '.' || (part === '' && i > 0 && i < parts.length - 1)) return
    if (part === '..' && out.length > 0 && out.at(-1) !== '..' && out.at(-1) !== '') out.pop()
    else out.push(part)
  })
  return out.join('/')
}

const isGit = (w: string): boolean => /^git(\.exe|\.cmd)?$/i.test(w.split(/[\\/]/).at(-1)!)

/** Schlüssel, deren Setzen die Hooks umgehen kann: `core.hooksPath` und Einbinden fremder Konfiguration. */
const GUARDED_KEY = /^(core\.hookspath|include\.path|includeif\..+\.path)$/i
const GUARDED_ASSIGN = /^(core\.hookspath|include\.path|includeif\..+\.path)(=|$)/i
const keyReason = (key: string): string => (/hookspath/i.test(key) ? 'core.hooksPath' : 'include.path (fremde Konfiguration mit core.hooksPath)')

const CONFIG_READ = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l', '--show-origin', '--show-scope'])
const CONFIG_WRITE = new Set(['--add', '--replace-all', '--unset', '--unset-all', '--edit', '-e'])
const CONFIG_VALUED = ['-f', '--file', '--blob', '--type', '--default', '--comment']
const GIT_VALUED = ['-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--attr-source', '--super-prefix', '--list-cmds']
/** Globale Git-Optionen ohne Wert; eine unbekannte Option könnte einen Wert haben (dann zählt jedes spätere `commit`). */
const GIT_FLAGS = new Set(['-p', '--paginate', '-P', '--no-pager', '--bare', '--no-replace-objects', '--no-lazy-fetch', '--no-optional-locks', '--no-advice', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--html-path', '--man-path', '--info-path', '-v', '--version', '-h', '--help'])
/** Kurzoptionen von `git commit`, deren Wert folgt (`-mtext`, `-m text`); `u`/`S` mit optionalem Wert. */
const COMMIT_VALUED = new Set(['m', 'F', 'C', 'c', 't'])
const COMMIT_OPTIONAL = new Set(['u', 'S'])

/** `--no-verify` und seine eindeutigen Abkürzungen (`--no-veri`, `--no-verif`), die Git annimmt. */
const NO_VERIFY = /^--no-veri(f|fy)?(=|$)/

/** Git-Aufruf in den Wörtern eines Abschnitts: Hooks umgangen oder `core.hooksPath` gesetzt? */
function gitBypass(words: readonly string[], depth: number, agent: boolean): string | null {
  const gi = words.findIndex(isGit)
  if (gi < 0) return null
  const args = words.slice(gi + 1)
  if (args.some(a => NO_VERIFY.test(a))) return '--no-verify'
  let i = 0
  let unsure = false
  for (; i < args.length; i++) {
    const a = args[i]!
    let set: string | undefined
    if (a === '-c' || a === '--config-env') set = args[++i]
    else if (a.startsWith('--config-env=')) set = a.slice('--config-env='.length)
    else if (GIT_VALUED.includes(a)) i++
    else if (a.startsWith('-')) {
      if (!a.includes('=') && !GIT_FLAGS.has(a)) unsure = true
      continue
    } else break
    if (set === undefined) continue
    if (GUARDED_ASSIGN.test(set)) return keyReason(set)
    const alias = set.match(/^alias\.[^=]*=([\s\S]*)$/i)
    if (alias) {
      const r = aliasBypass(alias[1]!, depth, agent)
      if (r) return r
    }
  }
  // Unbekannte globale Option: ihr Wert könnte als Unterbefehl gelesen sein; dann gilt das erste spätere `commit`
  const ci = unsure && args[i] !== 'commit' ? args.indexOf('commit', i + 1) : -1
  if (ci >= 0) i = ci
  const sub = args[i]
  const rest = args.slice(i + 1)
  if (agent && (sub === 'commit-tree' || sub === 'update-ref')) return `git ${sub} (Commit ohne Pre-Commit-Hook)`
  if (sub === 'commit') {
    for (let k = 0; k < rest.length; k++) {
      const a = rest[k]!
      if (a === '--') break
      if (!/^-[^-]/.test(a)) continue
      for (let m = 1; m < a.length; m++) {
        const ch = a[m]!
        if (ch === 'n') return 'commit -n (= --no-verify)'
        if (COMMIT_OPTIONAL.has(ch)) break
        if (COMMIT_VALUED.has(ch)) {
          if (m === a.length - 1) k++
          break
        }
      }
    }
  }
  if (sub === 'config') return configBypass(rest, depth, agent)
  return null
}

/** Ein Alias führt Git (`commit -n`) oder mit `!` die Shell aus: der Inhalt wird selbst geprüft. */
function aliasBypass(value: string, depth: number, agent: boolean): string | null {
  const v = value.trim()
  return bypassIn(v.startsWith('!') ? v.slice(1) : `git ${v}`, depth + 1, true, agent)
}

/**
 * `git config …`: Setzen (oder Entfernen/Ändern) eines bewachten Schlüssels, Entfernen oder Umbenennen
 * des Abschnitts `core`, Aliase mit Umgehung. Lesen (`git config core.hooksPath`, `--get`, `--list`,
 * `--show-origin` …) bleibt erlaubt.
 */
function configBypass(rest: readonly string[], depth: number, agent: boolean): string | null {
  const pos = positionals(rest, CONFIG_VALUED)
  const sections = rest.includes('--remove-section') || rest.includes('--rename-section') || ['remove-section', 'rename-section'].includes(pos[0]!)
  if (sections && pos.some(a => /^core$/i.test(a))) return 'core.hooksPath (Abschnitt core entfernen oder umbenennen)'
  const reading = rest.some(a => CONFIG_READ.has(a)) || pos[0] === 'get' || pos[0] === 'list'
  const ai = pos.findIndex(a => /^alias\./i.test(a))
  if (ai >= 0 && !reading && pos[ai + 1] !== undefined) {
    const r = aliasBypass(pos[ai + 1]!, depth, agent)
    if (r) return r
  }
  const keyWord = rest.find(a => GUARDED_KEY.test(a))
  if (keyWord === undefined) return null
  const reason = keyReason(keyWord)
  if (rest.some(a => CONFIG_WRITE.has(a))) return reason
  const key = pos.findIndex(a => GUARDED_KEY.test(a))
  // neue Schreibweise `git config set|unset|edit core.hooksPath …`
  if (['set', 'unset', 'edit'].includes(pos[0]!)) return reason
  if (reading) return null
  return pos.length > key + 1 ? reason : null
}

/**
 * Umgebungsvariablen, die Konfiguration für Git-Aufrufe setzen: `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_PARAMETERS`
 * mit einem bewachten Schlüssel; `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `HOME`, `XDG_CONFIG_HOME`
 * (fremde Konfigurationsdatei), wenn im selben Befehl Git läuft. `PATH` ohne den bisherigen Pfad (`$PATH`) im selben
 * Befehl wie Git: Der Pre-Commit-Hook endet ohne Node grün. Auch PowerShell (`$env:X = …`).
 */
function envBypass(words: readonly string[], hasGit: boolean, command: string): string | null {
  for (let k = 0; k < words.length; k++) {
    const w = words[k]!
    const assign = (name: string): boolean =>
      new RegExp(`^(\\$env:)?(${name})=`, 'i').test(w) || (new RegExp(`^\\$env:(${name})$`, 'i').test(w) && words[k + 1] === '=')
    if (assign('GIT_CONFIG_KEY_\\d+|GIT_CONFIG_PARAMETERS') && /core\.hookspath|include(if)?\./i.test(command.replace(/['"\\`]/g, ''))) return 'core.hooksPath'
    if (hasGit && assign('GIT_CONFIG_GLOBAL|GIT_CONFIG_SYSTEM|HOME|XDG_CONFIG_HOME')) {
      return 'core.hooksPath (fremde Git-Konfiguration über GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM oder HOME)'
    }
    if (hasGit && assign('PATH')) {
      // Wert: im selben Wort (`PATH=…`) oder nach `=` (PowerShell `$env:PATH = …`)
      const value = /=/.test(w) ? w.slice(w.indexOf('=') + 1) : (words[k + 2] ?? '')
      if (!/\$\{?PATH\}?|\$env:PATH/i.test(value)) return 'PATH ohne den bisherigen Pfad vor Git (der Pre-Commit-Hook fände Node nicht und prüfte nichts)'
    }
  }
  return null
}
