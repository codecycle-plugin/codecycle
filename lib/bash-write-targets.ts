// Schreibziele eines Bash-Befehls (Zaun). Rein: kein Node, keine Mod-API.

import { heredocsRun, MAX_DEPTH, positionals, splitShell, stripPrefix, unwrap } from './bash-shell.ts'
import type { Segment } from './bash-shell.ts'

// ---------------------------------------------------------------------------
// Schreibziele eines Bash-Befehls (Zaun, Schalter `fence`)
//
// Heuristik, kein vollständiger Shell-Parser. Erkannt: Umleitungen `>`/`>>` (auch `2>`, `&>`),
// `tee`, `sed -i`, `perl -i`, Ziel von `cp`/`install`/`ln`, bei `mv` auch die Quellen (sie verschwinden), `rm`,
// `touch`, `truncate`, `unlink`, `shred`, `dd of=`, `chmod`/`chown`/`chgrp`/`chattr`/`setfacl` (Pfade nach Modus
// bzw. Besitzer), `git checkout [<rev>] [--] <dateien>`, `git restore`, `git rm`, `git mv`; PowerShell-Cmdlets und ihre
// Aliase (`Set-Content`, `Add-Content`, `Out-File`, `New-Item`, `Remove-Item`, `Move-Item`, `Copy-Item`,
// `Rename-Item`) und `[IO.File]::Write…/Append…/Delete/Copy/Move/Replace`; auch in Verpackungen (`bash -c`, `eval`,
// `pwsh -c` …), Befehlsersetzung, Klammern und in Heredocs, die ein Interpreter ausführt. Nicht erkannt (bewusst):
// Schreiben aus Skripten (`node -e`, `python -c`), Variablen und Befehlsersetzung in Pfaden, `xargs`, `find -delete`,
// `git stash` und `git reset --hard` (ganzer Arbeitsbaum). Der Zaun bleibt damit ein Netz gegen Versehen, keine
// Sicherheitsgrenze.

/** Modus von `chmod` (`755`, `+x`, `u=rw,go-w`) und `chattr` (`+i`, `-a`, `=e`) */
const CHMOD_MODE = /^([0-7]{3,4}|[ugoa]*[-+=][rwxXst]*([,][ugoa]*[-+=][rwxXst]*)*)$/
const CHATTR_MODE = /^[-+=][aAcCdDeFijmPsStTux]+$/

/** PowerShell: Schalter ohne Wert; jeder andere `-Name` nimmt das nächste Wort als Wert */
const PS_SWITCH = /^-(force|recurse|nonewline|append|whatif|confirm|passthru|noclobber|asjob|container)$/i
/** PowerShell-Parameter mit Pfad */
const PS_PATH = /^-(path|literalpath|filepath|destination|pspath|lp)$/i

/** Argumente eines Cmdlets: Pfad-Parameter (`-Path x`, `-Path:x`) und Positionen (Kommalisten aufgelöst) */
function psArgs(args: readonly string[]): { paths: string[]; dest: string[]; pos: string[] } {
  const paths: string[] = [], dest: string[] = [], pos: string[] = []
  const list = (v: string): string[] => v.split(',').map(s => s.trim()).filter(Boolean)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    const named = a.match(/^(-[A-Za-z]+):(.+)$/)
    if (named) {
      if (PS_PATH.test(named[1]!)) (/^-destination$/i.test(named[1]!) ? dest : paths).push(...list(named[2]!))
      continue
    }
    if (/^-[A-Za-z]+$/.test(a)) {
      if (PS_SWITCH.test(a)) continue
      const v = args[++i]
      if (v !== undefined && PS_PATH.test(a)) (/^-destination$/i.test(a) ? dest : paths).push(...list(v))
      continue
    }
    pos.push(...list(a))
  }
  return { paths, dest, pos }
}

/** Ziele eines PowerShell-Cmdlets (Name und Aliase in Kleinbuchstaben); null = kein schreibendes Cmdlet. */
function psTargets(cmd: string, args: readonly string[]): string[] | null {
  const p = () => psArgs(args)
  switch (cmd) {
    case 'set-content': case 'sc': case 'add-content': case 'ac': case 'out-file': case 'new-item': case 'ni':
    case 'rename-item': case 'ren': case 'rni': case 'clear-content': case 'clc': {
      const a = p()
      return [...a.paths, ...a.pos.slice(0, 1)]
    }
    case 'remove-item': case 'del': case 'erase': case 'ri': case 'rd': case 'rmdir': {
      const a = p()
      return [...a.paths, ...a.pos]
    }
    case 'move-item': case 'mi': case 'move': {
      const a = p()
      return [...a.paths, ...a.dest, ...a.pos]
    }
    case 'copy-item': case 'cpi': case 'copy': {
      // nur das Ziel: -Destination, sonst die Position nach der Quelle (die Quelle steht in -Path oder an Position 0)
      const a = p()
      if (a.dest.length) return a.dest
      return a.paths.length ? a.pos.slice(0, 1) : a.pos.slice(1, 2)
    }
    default:
      return null
  }
}

/** `[IO.File]::WriteAllText('pfad', …)` und Verwandte: erster Pfad, bei Copy/Move/Replace auch der zweite */
const IO_FILE = /\[(?:System\.)?IO\.File\]::(Write\w*|Append\w*|Delete|Copy|Move|Replace|Create\w*|Open\w*)\s*\(\s*(['"])([^'"]+)\2(?:\s*,\s*(['"])([^'"]+)\4)?/gi
function ioFileTargets(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(IO_FILE)) {
    out.push(m[3]!)
    if (/^(copy|move|replace)$/i.test(m[1]!) && m[5]) out.push(m[5])
  }
  return out
}

/** Schreibziele eines einzelnen Abschnitts (ohne Verpackungen und Heredocs). */
export function segTargets(seg: Segment): string[] {
  const found: string[] = []
  const w = stripPrefix(seg.words)
  const cmd = (w[0] ?? '').split(/[\\/]/).at(-1)!.replace(/\.exe$/i, '')
  const args = w.slice(1)
  switch (cmd) {
    case 'tee':
      found.push(...positionals(args))
      break
    case 'sed':
    case 'perl': {
      const inPlace = args.some(a => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))
      if (!inPlace) break
      const scriptOpts = cmd === 'sed' ? ['-e', '-f', '--expression', '--file'] : ['-e', '-E']
      const hasScriptOpt = args.some(a => scriptOpts.includes(a))
      const pos = positionals(args, scriptOpts)
      found.push(...(hasScriptOpt ? pos : pos.slice(1)))
      break
    }
    case 'cp':
    case 'mv':
    case 'install':
    case 'ln': {
      const valued = ['-t', '--target-directory', '-S', '--suffix', '-m', '--mode']
      const pos = positionals(args, valued)
      const ti = args.findIndex(a => a === '-t' || a === '--target-directory')
      if (ti >= 0 && args[ti + 1] !== undefined) found.push(args[ti + 1]!)
      else if (pos.length >= 2) found.push(pos.at(-1)!)
      // mv: die Quellen verschwinden
      if (cmd === 'mv') found.push(...(ti >= 0 ? pos : pos.slice(0, -1)))
      break
    }
    case 'chmod': {
      const rest = args.filter(a => !a.startsWith('-') || CHMOD_MODE.test(a))
      const ref = args.some(a => a.startsWith('--reference'))
      found.push(...(ref ? rest : rest.slice(1)))
      break
    }
    case 'chattr':
      found.push(...args.filter(a => !CHATTR_MODE.test(a) && !a.startsWith('-')))
      break
    case 'chown':
    case 'chgrp': {
      const pos = positionals(args)
      found.push(...(args.some(a => a.startsWith('--reference')) ? pos : pos.slice(1)))
      break
    }
    case 'setfacl':
      found.push(...positionals(args, ['-m', '-M', '-x', '-X', '--modify', '--modify-file', '--remove', '--remove-file', '--set', '--set-file']))
      break
    case 'rm':
    case 'touch':
    case 'unlink':
    case 'shred':
      found.push(...positionals(args))
      break
    case 'truncate':
      found.push(...positionals(args, ['-s', '--size', '-r', '--reference']))
      break
    case 'dd':
      for (const a of args) if (a.startsWith('of=')) found.push(a.slice(3))
      break
    case 'git': {
      const sub = args.findIndex(a => !a.startsWith('-'))
      const name = args[sub]
      const rest = args.slice(sub + 1)
      if (name === 'checkout') {
        if (rest.includes('--')) found.push(...rest.slice(rest.indexOf('--') + 1))
        else {
          // `git checkout <rev> <pfad> …`: alles nach der ersten Position sind Pfade (`-b <name>` hat einen Wert)
          const pos = positionals(rest, ['-b', '-B', '--orphan', '--conflict', '--pathspec-from-file'])
          found.push(...pos.slice(1))
        }
      } else if (name === 'restore') found.push(...positionals(rest, ['-s', '--source']))
      else if (name === 'rm' || name === 'mv') found.push(...positionals(rest, ['--pathspec-from-file']))
      break
    }
    default:
      found.push(...(psTargets(cmd.toLowerCase(), args) ?? []))
      break
  }
  found.push(...seg.redirects)
  return found.filter(f => f !== '' && f !== '/dev/null' && !/^nul$/i.test(f))
}

/**
 * Dateien, in die ein Bash- oder PowerShell-Befehl schreibt oder die er löscht (Reihenfolge des Auftretens, ohne
 * Doppelte). PowerShell kennt keinen Backslash als Fluchtzeichen: dort werden Backslashes vorher zu Schrägstrichen.
 */
export function bashWriteTargets(command: string, shell: 'bash' | 'powershell' = 'bash'): string[] {
  const out: string[] = []
  const walk = (text: string, depth: number, run: boolean): void => {
    const segs = splitShell(text)
    const heredocs = run || heredocsRun(segs)
    for (const f of ioFileTargets(text)) if (!out.includes(f)) out.push(f)
    for (const seg of segs) {
      for (const f of segTargets(seg)) if (!out.includes(f)) out.push(f)
      if (depth >= MAX_DEPTH) continue
      for (const inner of unwrap(seg.words)) walk(inner.encoded ?? inner.text, depth + 1, true)
      for (const inner of seg.nested) walk(inner, depth + 1, false)
      if (heredocs) for (const inner of seg.heredocs) walk(inner, depth + 1, false)
    }
  }
  walk(shell === 'powershell' ? command.replace(/\\/g, '/') : command, 0, false)
  return out
}
