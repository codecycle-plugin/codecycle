// Erkennung von Aufrufen im Befehlstext: Python (`pythonCall`) und Werkzeug-Befehle (`commitTestsCall`, `baselineCall`).
// Rein: kein Node, keine Mod-API.

import { commandName, splitShell, stripPrefix, walkSegments } from './bash-shell.ts'

/**
 * Ruft der Befehl Python auf (`python`, `python3`, `python3.12`, `py`, auch über `sh -c`/`eval`)?
 * 'repl': Python liest Skript oder Befehle von der Eingabe – nackt, `-i`, oder `-` (auch mit Heredoc,
 * das in PowerShell und Hintergrund-Läufen nicht zuverlässig ankommt; ausgenommen `… | python -`
 * in Bash). Solche Prozesse hingen bis zu 50 Minuten.
 * 'call': sonstiger Aufruf. null: kein Python. Der Mod sperrt 'repl' immer und 'call' unter Windows
 * ohne echtes Python (Store-Platzhalter).
 */
export function pythonCall(command: string, shell: 'bash' | 'powershell' = 'bash', depth = 0): 'repl' | 'call' | null {
  let found: 'repl' | 'call' | null = null
  const segs = splitShell(command)
  for (const seg of segs) {
    const w = stripPrefix(seg.words)
    const cmd = (w[0] ?? '').split(/[\\/]/).at(-1)!.replace(/\.exe$/i, '').toLowerCase()
    if (/^(python[\d.]*|py)$/.test(cmd)) {
      const args = w.slice(1)
      // Optionen bis zum Skript bzw. bis -c/-m; danach gehört alles dem Skript (`python x.py -i` ist nicht interaktiv)
      const ci = args.findIndex(a => a === '-c' || a === '-m' || /^-[bBdEhIOqsSuvx]*[cm]$/.test(a))
      const si = args.findIndex(a => a === '-' || !a.startsWith('-'))
      const end = Math.min(ci < 0 ? args.length : ci, si < 0 ? args.length : si)
      const interactive = args.slice(0, end).some(a => /^-[bBdEhIOqsSuvx]*i[bBdEhIOqsSuvx]*$/.test(a))
      const fromStdin = end === args.length || args[end] === '-'
      // Eingabe sicher vorhanden: in Bash aus einer Pipe, einer Datei oder einem Here-String; nicht per Heredoc
      // (kommt in PowerShell und manchen Hintergrund-Läufen nicht an) und nie in PowerShell
      const fed = shell === 'bash' && (seg.pipedIn || seg.stdin === 'file')
      if (interactive || (fromStdin && !fed)) return 'repl'
      found = 'call'
      continue
    }
    if (depth < 3) {
      const inner: string[] = [...seg.nested]
      if (/^(sh|bash|zsh|dash)$/.test(cmd)) {
        const c = w[w.findIndex((a, k) => k > 0 && /^-[a-z]*c[a-z]*$/i.test(a)) + 1]
        if (c) inner.push(c)
      } else if (cmd === 'eval') inner.push(w.slice(1).join(' '))
      for (const text of inner) {
        const r = pythonCall(text, 'bash', depth + 1)
        if (r === 'repl') return r
        found = found ?? r
      }
    }
  }
  return found
}

/**
 * Ruft der Befehl einen Werkzeug-Befehl auf, auf dessen Argumente (nach `codecycle` bzw. nach `…/cli.ts`) `match`
 * passt? Erkannt: `codecycle …`, auch mit Pfad (`./bin/codecycle`, `…\codecycle.cmd`, `& codecycle …`), der Rückfall
 * `node <Pfad>/cli.ts …` und beides in Verpackungen (`bash -c`, `pwsh -Command`, `eval`, Befehlsersetzung, Heredocs,
 * die laufen). Text in Anführungszeichen als Argument (Commit-Nachricht) zählt nicht.
 */
function toolCall(command: string, match: (args: readonly string[]) => boolean): boolean {
  // Der Zerleger kennt Bash: ein Backslash ist dort Fluchtzeichen und würde Windows-Pfade zerstören; deshalb
  // zusätzlich eine Fassung mit Schrägstrichen prüfen (PowerShell kennt keinen Backslash-Fluchtzeichen).
  return [command, command.replace(/\\/g, '/')].some(text => {
    let hit = false
    walkSegments(text, seg => {
      if (hit) return
      const { name, args } = commandName(seg)
      if (name === 'codecycle') hit = match(args)
      else if (name === 'node' || name === 'nodejs' || name === 'tsx') {
        const cli = args.findIndex(a => /(^|[\\/])cli\.(ts|js|mjs)$/i.test(a))
        hit = cli >= 0 && match(args.slice(cli + 1))
      }
    })
    return hit
  })
}

/** `codecycle commit-tests` (roter Test-Commit nur für Test-Autor und Fehlersucher). */
export function commitTestsCall(command: string): boolean {
  return toolCall(command, args => args.find(a => !a.startsWith('-')) === 'commit-tests')
}

/**
 * Befehle, die die Grundlage von `codecycle guard` neu setzen (`guard --record`, `update`,
 * `exclude`, `install-tool`, `hooks install`). Nur der Bauleiter (Hauptsitzung) und `codecycle:toolsmith` dürfen sie
 * aufrufen; sonst könnte ein Agent eigene Änderungen an Kontrolldateien in die Grundlage übernehmen.
 */
export function baselineCall(command: string): boolean {
  return toolCall(command, args => {
    const pos = args.filter(a => !a.startsWith('-'))
    if (pos[0] === 'exclude' || pos[0] === 'install-tool' || pos[0] === 'update') return true
    if (pos[0] === 'hooks') return pos[1] === 'install'
    return pos[0] === 'guard' && args.includes('--record')
  })
}
