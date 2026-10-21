// Zerlegung von Bash-/PowerShell-Befehlen in Abschnitte und gemeinsame Helfer dafür (Entpacken von Verpackungen,
// Gang durch alle Abschnitte). Grundlage von `guard-bypass`, `guard-calls`, `bash-write-targets`, `bash-read-targets`
// und `bash-allowlist`. Rein: kein Node, keine Mod-API. Heuristik, kein vollständiger Shell-Parser.

/** Höchste Verschachtelung (`bash -c "eval '…'"`), die noch entpackt wird; tiefer zählt Git darin als Umgehung. */
export const MAX_DEPTH = 4

export type Segment = {
  words: string[]
  redirects: string[]
  /** Eingabe kommt aus einer Pipe (`a | b`, nicht `||`) */
  pipedIn: boolean
  /** Eingabe aus Datei bzw. Here-String (`<`, `<<<`) oder Heredoc (`<<`) */
  stdin: 'file' | 'heredoc' | null
  /** Inhalte der Heredocs dieses Abschnitts (nicht als Befehle zerlegt) */
  heredocs: string[]
  /** Befehlsersetzungen in Anführungszeichen (`"$(…)"`, `` "`…`" ``), werden ausgeführt */
  nested: string[]
}

/** Index der schließenden Klammer zu `(` an `open` (zählt nur Klammern); sonst Textende. */
function closing(command: string, open: number): number {
  let depth = 0
  for (let k = open; k < command.length; k++) {
    if (command[k] === '(') depth++
    else if (command[k] === ')' && --depth === 0) return k
  }
  return command.length
}

/**
 * Endwort eines Heredocs wie bash: Anführungszeichen und Backslashes entfernt (`<<'EOF'`, `<<"E"OF`,
 * `<<\EOF`). Liefert das Wort und die Stelle danach.
 */
function hereWord(command: string, start: number): { word: string; end: number } {
  let j = start
  let word = ''
  while (j < command.length && !/[\s;|&<>()]/.test(command[j]!)) {
    const c = command[j]!
    if (c === "'") {
      const e = command.indexOf("'", j + 1)
      const end = e < 0 ? command.length : e
      word += command.slice(j + 1, end)
      j = end + 1
    } else if (c === '"') {
      j++
      while (j < command.length && command[j] !== '"') {
        if (command[j] === '\\' && j + 1 < command.length) j++
        word += command[j++]
      }
      j++
    } else if (c === '\\' && j + 1 < command.length) {
      word += command[j + 1]
      j += 2
    } else {
      word += c
      j++
    }
  }
  return { word, end: j }
}

/**
 * Zerlegt in Befehlsabschnitte (`;`, `&&`, `||`, `|`, `&`, Zeilenumbruch, `(`, `)`, `$(`, Backtick,
 * `{`/`}` als eigenes Wort) mit Wörtern und Umleitungszielen. Heredoc-Inhalte (`<<EOF` … `EOF`) sind
 * keine Befehle: sie landen in `heredocs` des Abschnitts. Endzeile wie bash: exakt das Endwort,
 * bei `<<-` nach Entfernen führender Tabs.
 */
export function splitShell(command: string): Segment[] {
  const segs: Segment[] = []
  let words: string[] = []
  let redirects: string[] = []
  let heredocs: string[] = []
  let nested: string[] = []
  let pipedIn = false
  let stdin: Segment['stdin'] = null
  const pending: { delim: string; tabs: boolean; into: string[] }[] = []
  let cur = ''
  let has = false
  let target: 'word' | 'redirect' | 'skip' = 'word'
  const endWord = () => {
    if (!has) return
    if (target === 'redirect') redirects.push(cur)
    else if (target === 'word') words.push(cur)
    target = 'word'
    cur = ''
    has = false
  }
  const endSeg = () => {
    endWord()
    if (words.length > 0 || redirects.length > 0 || heredocs.length > 0 || nested.length > 0 || pending.some(p => p.into === heredocs)) {
      segs.push({ words, redirects, pipedIn, stdin, heredocs, nested })
    }
    words = []
    redirects = []
    heredocs = []
    nested = []
    pipedIn = false
    stdin = null
    target = 'word'
  }
  const n = command.length
  for (let i = 0; i < n; i++) {
    const c = command[i]!
    if (c === "'") {
      const j = command.indexOf("'", i + 1)
      const end = j < 0 ? n : j
      cur += command.slice(i + 1, end)
      has = true
      i = end
    } else if (c === '"') {
      let j = i + 1
      while (j < n && command[j] !== '"') {
        if (command[j] === '\\' && j + 1 < n && '$`"\\\n'.includes(command[j + 1]!)) {
          // wie bash: in "…" nur vor $ ` " \ und Zeilenumbruch ein Fluchtzeichen (Zeilenfortsetzung entfällt),
          // sonst bleibt der Backslash (Windows-Pfade wie "C:\…\codecycle.cmd")
          if (command[j + 1] !== '\n') cur += command[j + 1]
          j += 2
        } else if (command[j] === '$' && command[j + 1] === '(') {
          // Befehlsersetzung in Anführungszeichen wird ausgeführt: gesondert prüfen, im Wort bleibt der Text
          const end = closing(command, j + 1)
          nested.push(command.slice(j + 2, end))
          cur += command.slice(j, end + 1)
          j = end + 1
        } else if (command[j] === '`') {
          const e = command.indexOf('`', j + 1)
          const end = e < 0 ? n : e
          nested.push(command.slice(j + 1, end))
          cur += command.slice(j, end + 1)
          j = end + 1
        } else cur += command[j++]
      }
      has = true
      i = j
    } else if (c === '\\' && i + 1 < n && command[i + 1] !== '\n') {
      cur += command[++i]
      has = true
    } else if (c === '\n' || c === ';') {
      endSeg()
      if (c === '\n' && pending.length > 0) {
        // Heredoc-Inhalte bis zur Endzeile lesen; danach geht es mit Befehlen weiter
        let pos = i + 1
        for (const h of pending.splice(0)) {
          const body: string[] = []
          while (pos < n) {
            const nl = command.indexOf('\n', pos)
            const raw = command.slice(pos, nl < 0 ? n : nl)
            pos = nl < 0 ? n : nl + 1
            const line = h.tabs ? raw.replace(/^\t+/, '') : raw
            if (line === h.delim) break
            body.push(line)
          }
          h.into.push(body.join('\n'))
        }
        i = pos - 1
      }
    } else if (/\s/.test(c)) endWord()
    else if (c === '(' || c === ')' || c === '`') endSeg()
    else if (c === '$' && command[i + 1] === '(') {
      endSeg()
      i++
    } else if ((c === '{' || c === '}') && !has && (i + 1 >= n || /[\s;)]/.test(command[i + 1]!))) endSeg()
    else if (c === '&' && command[i + 1] === '&') {
      endSeg()
      i++
    } else if (c === '|') {
      endSeg()
      if (command[i + 1] === '|') i++
      else pipedIn = true
    } else if (c === '>') {
      // Kanal davor (`2>`, `&>`) gehört zur Umleitung, nicht zu den Wörtern
      if (has && /^(\d+|&)$/.test(cur)) {
        cur = ''
        has = false
      } else endWord()
      // `>>` anhängen, `>|` überschreiben trotz noclobber: beides schreibt in die Datei danach
      if (command[i + 1] === '>' || command[i + 1] === '|') i++
      if (command[i + 1] === '&') {
        // `>&2`, `2>&1`: Kanal, keine Datei
        i++
        while (i + 1 < n && /[\d-]/.test(command[i + 1]!)) i++
        continue
      }
      target = 'redirect'
    } else if (c === '<') {
      endWord()
      if (command[i + 1] === '<' && command[i + 2] !== '<') {
        // Heredoc: Endwort lesen (auch `<<-EOF`, `<<'EOF'`, `<<"EOF"`, `<<\EOF`); der Inhalt folgt ab der nächsten Zeile
        let j = i + 2
        const tabs = command[j] === '-'
        if (tabs) j++
        while (command[j] === ' ' || command[j] === '\t') j++
        const { word, end } = hereWord(command, j)
        if (word !== '') pending.push({ delim: word, tabs, into: heredocs })
        stdin = 'heredoc'
        i = end - 1
        continue
      }
      if (command[i + 1] === '<') i += 2 // Here-String `<<<`
      stdin = stdin ?? 'file'
      target = 'skip'
    } else if (c === '&') endSeg()
    else {
      cur += c
      has = true
    }
  }
  endSeg()
  return segs
}

/** Wörter ohne Optionen; `valued` nennt Optionen, deren Wert im nächsten Wort steht. Nach `--` zählt alles. */
export function positionals(args: readonly string[], valued: readonly string[] = []): string[] {
  const out: string[] = []
  let rest = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (rest) out.push(a)
    else if (a === '--') rest = true
    else if (valued.includes(a)) i++
    else if (!a.startsWith('-') || a === '-') out.push(a)
  }
  return out
}

export const PREFIX = new Set(['sudo', 'env', 'command', 'nice', 'time', 'nohup', 'exec'])

/** Wörter ohne vorangestellte Zuweisungen (`A=1`) und Präfixe (`sudo`, `env` …). */
export function stripPrefix(words: readonly string[]): readonly string[] {
  let w = words
  while (w.length > 0 && (/^[A-Za-z_]\w*=/.test(w[0]!) || PREFIX.has(w[0]!))) w = w.slice(1)
  return w
}

/** Base64 von PowerShell `-EncodedCommand` (UTF-16LE); null, wenn nicht lesbar. */
function decodePwsh(b64: string): string | null {
  try {
    if (typeof atob !== 'function') return null
    const bin = atob(b64)
    let out = ''
    for (let i = 0; i + 1 < bin.length; i += 2) out += String.fromCharCode(bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8))
    return out
  } catch {
    return null
  }
}

/**
 * Befehle in Verpackungen: `sh|bash|zsh|dash|ksh -c '…'`, `pwsh|powershell -c|-Command …`
 * (auch `/Command`, abgekürzt), `-EncodedCommand` (entschlüsselt; `encoded: null` = nicht lesbar),
 * `cmd /c|/k …`, `eval …`, `Invoke-Expression|iex …`.
 */
export function unwrap(words: readonly string[]): { text: string; encoded?: string | null }[] {
  const out: { text: string; encoded?: string | null }[] = []
  for (let k = 0; k < words.length; k++) {
    const name = words[k]!.split(/[\\/]/).at(-1)!.replace(/\.exe$/i, '').toLowerCase()
    const after = (re: RegExp): number => words.findIndex((a, m) => m > k && re.test(a))
    if (/^(sh|bash|zsh|dash|ksh)$/.test(name)) {
      const ci = after(/^-[a-z]*c[a-z]*$/i)
      if (ci >= 0 && words[ci + 1] !== undefined) out.push({ text: words[ci + 1]! })
    } else if (name === 'pwsh' || name === 'powershell') {
      const ei = after(/^[-/](e|ec|en[a-z]*)$/i)
      if (ei >= 0 && words[ei + 1] !== undefined) out.push({ text: '', encoded: decodePwsh(words[ei + 1]!) })
      const ci = after(/^[-/]c(o(m(m(a(n(d)?)?)?)?)?)?$/i)
      if (ci >= 0) out.push({ text: words.slice(ci + 1).join(' ') })
    } else if (name === 'cmd') {
      const ci = after(/^\/[ck]$/i)
      if (ci >= 0) out.push({ text: words.slice(ci + 1).join(' ') })
    } else if (name === 'eval' || name === 'iex' || name === 'invoke-expression') {
      out.push({ text: words.slice(k + 1).join(' ') })
    }
  }
  return out
}

/** Programme, die Befehle von der Eingabe oder aus einer Datei ausführen (für Heredoc-Inhalte). */
export const INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'eval', 'source', '.', 'pwsh', 'powershell', 'cmd', 'iex', 'invoke-expression'])

/**
 * Werden Heredoc-Inhalte in diesem Befehl womöglich ausgeführt? Ja, wenn ein Abschnitt einen Interpreter
 * startet (`bash <<EOF`, `cat <<EOF | sh`, `cat <<EOF > x.sh; bash x.sh`) oder ein Skript direkt
 * (`./x.sh`, `x.ps1`). Sonst sind sie Text (Commit-Nachrichten, Dateiinhalte) und lösen nichts aus.
 */
export function heredocsRun(segs: readonly Segment[]): boolean {
  return segs.some(s => {
    const w = stripPrefix(s.words)[0]
    if (w === undefined) return false
    const name = w.split(/[\\/]/).at(-1)!.replace(/\.exe$/i, '').toLowerCase()
    return INTERPRETERS.has(name) || /^\.{1,2}[\\/]/.test(w) || /\.(sh|bash|ps1|cmd|bat)$/i.test(name)
  })
}

// ---------------------------------------------------------------------------
// Gemeinsamer Gang durch alle Befehlsabschnitte (auch Verpackungen, Befehlsersetzung, Heredocs, die laufen)

export function walkSegments(command: string, visit: (seg: Segment) => void): void {
  const walk = (text: string, depth: number, run: boolean): void => {
    const segs = splitShell(text)
    const heredocs = run || heredocsRun(segs)
    for (const seg of segs) {
      visit(seg)
      if (depth >= MAX_DEPTH) continue
      for (const inner of unwrap(seg.words)) {
        if (inner.encoded === null) continue
        walk(inner.encoded ?? inner.text, depth + 1, true)
      }
      for (const inner of seg.nested) walk(inner, depth + 1, false)
      if (heredocs) for (const inner of seg.heredocs) walk(inner, depth + 1, false)
    }
  }
  walk(command, 0, false)
}

/** Name des Programms eines Abschnitts: ohne Pfad, ohne `.exe|.cmd|.ps1|.bat`, klein; PowerShell-Aufrufzeichen `&`/`.` entfernt. */
export function commandName(seg: Segment): { name: string; args: string[]; program: string } {
  let w = [...stripPrefix(seg.words)]
  while (w[0] === '&' || w[0] === '.') w = w.slice(1)
  const program = w[0] ?? ''
  const name = program.split(/[\\/]/).at(-1)!.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase()
  return { name, args: w.slice(1), program }
}
