// Erkennung von Aufrufen im Befehlstext: Python (`pythonCall`) und Werkzeug-Befehle (`commitTestsCall`, `baselineCall`).
// Rein: kein Node, keine Mod-API.

import { commandName, splitShell, stripPrefix, walkSegments } from './bash-shell.ts'

/**
 * Ruft der Befehl Python auf (`python`, `python3`, `python3.12`, `py`, auch über `sh -c`/`eval`)?
 * 'repl': Python liest Skript oder Befehle von der Eingabe, die nicht sicher ankommt – nackt, `-i`, oder `-`
 * ohne Pipe, Datei oder Heredoc, in PowerShell immer. Solche Prozesse hingen bis zu 50 Minuten.
 * 'heredoc': in Bash liefert ein Heredoc das Skript (`python3 - <<EOF`); hing nur in Windows-Bash.
 * 'call': sonstiger Aufruf. null: kein Python. Der Mod sperrt 'repl' immer, 'heredoc' unter Windows und 'call'
 * unter Windows ohne echtes Python (Store-Platzhalter). Vorrang beim Zusammenfassen: repl, heredoc, call.
 */
export function pythonCall(command: string, shell: 'bash' | 'powershell' = 'bash', depth = 0): 'repl' | 'heredoc' | 'call' | null {
  let found: 'heredoc' | 'call' | null = null
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
      // Eingabe sicher vorhanden: in Bash aus einer Pipe, einer Datei oder einem Here-String; nie in PowerShell
      const fed = shell === 'bash' && (seg.pipedIn || seg.stdin === 'file')
      if (interactive) return 'repl'
      if (fromStdin && !fed) {
        if (shell !== 'bash' || seg.stdin !== 'heredoc') return 'repl'
        found = 'heredoc'
      } else found = found ?? 'call'
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
        if (r === 'heredoc') found = r
        else found = found ?? r
      }
    }
  }
  return found
}

/**
 * Ruft der Befehl einen Werkzeug-Befehl auf, auf dessen Argumente (nach `codecycle` bzw. nach `…/cli.ts`) `match`
 * passt? Erkannt: `codecycle …`, auch mit Pfad (`./bin/codecycle`, `…\codecycle.cmd`, `& codecycle …`), der Rückfall
 * `<beliebiger Starter> <Pfad>/cli.ts …` (`node`, `npx tsx`, `bun`, `deno run` …), `codecycle` hinter einem Paket-Starter
 * (`npx`, `bunx`, `pnpm exec`, `xargs` …) und alles in Verpackungen (`bash -c`, `pwsh -Command`, `eval`, Befehlsersetzung, Heredocs,
 * die laufen). Text in Anführungszeichen als Argument (Commit-Nachricht) zählt nicht.
 */
/** Programme, die einen anderen Befehl starten: `codecycle` dahinter ist ein Werkzeug-Aufruf. */
const LAUNCHERS = new Set(['npx', 'bunx', 'pnpx', 'pnpm', 'yarn', 'bun', 'deno', 'xargs', 'npm', 'exec', 'command', 'nohup', 'time', 'timeout', 'nice'])

/**
 * `subcommands`: Unterbefehle, zu denen ein Treffer gehören kann. Hinter `xargs` kommen weitere Argumente erst zur Laufzeit
 * aus der Eingabe; ein Treffer ist es dann ohne Unterbefehl, mit einem Platzhalter (`{}`) oder einem passenden Unterbefehl
 * (`xargs codecycle guard` kann `--record` bekommen), nicht mit einem anderen (`xargs codecycle check`).
 */
function toolCall(command: string, match: (args: readonly string[]) => boolean, subcommands: readonly string[]): boolean {
  // Der Zerleger kennt Bash: ein Backslash ist dort Fluchtzeichen und würde Windows-Pfade zerstören; deshalb
  // zusätzlich eine Fassung mit Schrägstrichen prüfen (PowerShell kennt keinen Backslash-Fluchtzeichen).
  return [command, command.replace(/\\/g, '/')].some(text => {
    let hit = false
    walkSegments(text, seg => {
      if (hit) return
      const { name, args } = commandName(seg)
      if (name === 'codecycle') {
        hit = match(args)
        return
      }
      // Starter egal: das erste Wort auf `cli.(ts|js|mjs)` ist das Werkzeug (lieber ein Fehlalarm als eine Lücke)
      const cli = args.findIndex(a => /(^|[\\/])cli\.(ts|js|mjs)$/i.test(a))
      if (cli >= 0) {
        hit = match(args.slice(cli + 1))
        return
      }
      if (LAUNCHERS.has(name)) {
        const cc = args.findIndex(a => /^codecycle(\.(cmd|exe))?$/i.test(a.split(/[\\/]/).at(-1)!))
        if (cc < 0) return
        const rest = args.slice(cc + 1)
        const sub = rest.find(a => !a.startsWith('-'))
        hit = match(rest) || (name === 'xargs' && (sub === undefined || !/^[a-z][a-z-]*$/.test(sub) || subcommands.includes(sub)))
      }
    })
    return hit
  })
}

/** `codecycle commit-tests` (roter Test-Commit nur für Test-Autor und Fehlersucher). */
export function commitTestsCall(command: string): boolean {
  return toolCall(command, args => args.find(a => !a.startsWith('-')) === 'commit-tests', ['commit-tests'])
}

/** `codecycle commit-tests … --ohne-paket` (roter Commit außerhalb eines Paket-Branchs; nicht für den Test-Autor). */
export function commitTestsOutsidePackageCall(command: string): boolean {
  return toolCall(command, args => args.find(a => !a.startsWith('-')) === 'commit-tests' && args.includes('--ohne-paket'), ['commit-tests'])
}

/**
 * `codecycle paket start` und `paket fertig`: Worktree, `guard --record`, Merge in den Aufgaben-Branch und
 * `STATE.md`; ebenso `solo teil start|fertig` (Teil-Worktree, Merge) sowie `solo plan` und `solo zwischenstand` (Teile in `STATE.md`). Nur der Bauleiter bzw. die Solo-Sitzung
 * (Hauptsitzung); `paket pruefen` prüft nur und bleibt frei.
 */
export function packageBookkeepingCall(command: string): boolean {
  return toolCall(command, args => {
    // Werte von Optionen (`--aufgabe <ordner>`, `--runden <n>`, `--test-commit <hash>`) sind keine Wörter des Befehls
    const pos = args.filter((a, i) => !a.startsWith('-') && !/^--(aufgabe|runden|test-commit)$/.test(args[i - 1] ?? ''))
    if (pos[0] === 'paket') return pos[1] === 'start' || pos[1] === 'fertig'
    // Solo-Weg: Teil-Worktree anlegen und übernehmen (Merge in den Aufgaben-Branch) wie paket start|fertig
    if (pos[0] === 'solo' && (pos[1] === 'plan' || pos[1] === 'zwischenstand')) return true
    return pos[0] === 'solo' && pos[1] === 'teil' && (pos[2] === 'start' || pos[2] === 'fertig')
  }, ['paket', 'solo'])
}

/** `codecycle solo check` (Haltepunkt „Eigene Kontrolle“; der Mod hängt danach den Füllstand an). */
export function soloCheckCall(command: string): boolean {
  return toolCall(command, args => {
    const pos = args.filter(a => !a.startsWith('-'))
    return pos[0] === 'solo' && pos[1] === 'check'
  }, ['solo'])
}

/** `codecycle check` (der Mod hängt danach in der Hauptsitzung die Zeile „Hauptsitzung“ an). */
export function checkCall(command: string): boolean {
  return toolCall(command, args => args.find(a => !a.startsWith('-')) === 'check', ['check'])
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
  }, ['exclude', 'install-tool', 'update', 'hooks', 'guard'])
}
