// Schreibziele eines Bash-Befehls (Zaun). Rein: kein Node, keine Mod-API.

import { heredocsRun, MAX_DEPTH, positionals, splitShell, stripPrefix, unwrap } from './bash-shell.ts'
import type { Segment } from './bash-shell.ts'

// ---------------------------------------------------------------------------
// Schreibziele eines Bash-Befehls (Zaun, Schalter `fence`)
//
// Heuristik, kein vollständiger Shell-Parser. Erkannt: Umleitungen `>`/`>>` (auch `2>`, `&>`),
// `tee`, `sed -i`, `perl -i`, Ziel von `cp`/`mv`/`install`/`ln`, `rm`, `touch`, `truncate`,
// `unlink`, `shred`, `dd of=`, `git checkout -- <dateien>`, `git restore <dateien>`; auch in
// Verpackungen (`bash -c`, `eval` …), Befehlsersetzung, Klammern und in Heredocs, die ein Interpreter
// ausführt. Nicht erkannt (bewusst): Schreiben aus Skripten (`node -e`, `python -c`), Variablen und
// Befehlsersetzung in Pfaden, `xargs`, `find -delete`. Der Zaun bleibt damit ein Netz gegen
// Versehen, keine Sicherheitsgrenze.

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
      const pos = positionals(args, ['-t', '--target-directory', '-S', '--suffix', '-m', '--mode'])
      if (pos.length >= 2) found.push(pos.at(-1)!)
      break
    }
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
      if (name === 'checkout' && rest.includes('--')) found.push(...rest.slice(rest.indexOf('--') + 1))
      else if (name === 'restore') found.push(...positionals(rest, ['-s', '--source']))
      break
    }
    default:
      break
  }
  found.push(...seg.redirects)
  return found.filter(f => f !== '' && f !== '/dev/null' && !/^nul$/i.test(f))
}

/** Dateien, in die ein Bash-Befehl schreibt oder die er löscht (Reihenfolge des Auftretens, ohne Doppelte). */
export function bashWriteTargets(command: string): string[] {
  const out: string[] = []
  const walk = (text: string, depth: number, run: boolean): void => {
    const segs = splitShell(text)
    const heredocs = run || heredocsRun(segs)
    for (const seg of segs) {
      for (const f of segTargets(seg)) if (!out.includes(f)) out.push(f)
      if (depth >= MAX_DEPTH) continue
      for (const inner of unwrap(seg.words)) walk(inner.encoded ?? inner.text, depth + 1, true)
      for (const inner of seg.nested) walk(inner, depth + 1, false)
      if (heredocs) for (const inner of seg.heredocs) walk(inner, depth + 1, false)
    }
  }
  walk(command, 0, false)
  return out
}
