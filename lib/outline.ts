// Eigener Symbol-Scanner (PHP, JS/TS, Python, Go): Sprache, Maskierung von Strings und Kommentaren, Outline.
// Rein: kein Node, keine Mod-API, kein Dateizugriff. Grundlage von `locate` (Symbolsuche).
// Zeilennummern sind 1-basiert, `start`/`ende` einschließlich.

export type SymbolKind = 'class' | 'interface' | 'trait' | 'enum' | 'type' | 'function' | 'method' | 'const'

/** Ein Symbol der Outline. */
export type OutlineSymbol = {
  name: string
  kind: SymbolKind
  start: number
  ende: number
  signatur: string
  /** umschließende Klasse (bei Go: Empfängertyp) */
  parent?: string
}

// ---------------------------------------------------------------------------
// Sprache und Maskierung (Strings und Kommentare unsichtbar machen)

export type Lang = 'php' | 'js' | 'py' | 'go'

export function languageOf(datei: string): Lang | null {
  const ext = datei.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  switch (ext) {
    case 'php':
      return 'php'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'js'
    case 'py':
      return 'py'
    case 'go':
      return 'go'
    default:
      return null
  }
}

type Mode = 'code' | 'block' | 'tmpl' | 'raw' | 'tripleD' | 'tripleS'

/**
 * Ersetzt Strings und Kommentare durch Leerzeichen (Zeilenlänge bleibt), damit Klammern
 * und Schlüsselwörter darin nicht zählen. Grenzen: reguläre Ausdrücke in JS und
 * Heredocs in PHP werden nicht erkannt.
 */
export function maskCode(lines: string[], lang: Lang): string[] {
  const out: string[] = []
  let mode: Mode = 'code'
  for (const line of lines) {
    let res = ''
    let i = 0
    while (i < line.length) {
      const c = line[i]!
      const two = line.slice(i, i + 2)
      if (mode === 'block') {
        if (two === '*/') {
          mode = 'code'
          res += '  '
          i += 2
        } else {
          res += ' '
          i++
        }
        continue
      }
      if (mode === 'tmpl' || mode === 'raw') {
        if (c === '\\' && mode === 'tmpl') {
          res += '  '
          i += 2
          continue
        }
        if (c === '`') mode = 'code'
        res += ' '
        i++
        continue
      }
      if (mode === 'tripleD' || mode === 'tripleS') {
        const q = mode === 'tripleD' ? '"""' : "'''"
        if (line.startsWith(q, i)) {
          mode = 'code'
          res += '   '
          i += 3
        } else {
          res += ' '
          i++
        }
        continue
      }
      if (lang !== 'py' && two === '/*') {
        mode = 'block'
        res += '  '
        i += 2
        continue
      }
      if (lang !== 'py' && two === '//') {
        res += ' '.repeat(line.length - i)
        break
      }
      if ((lang === 'py' || lang === 'php') && c === '#' && !(lang === 'php' && line[i + 1] === '[')) {
        res += ' '.repeat(line.length - i)
        break
      }
      if (lang === 'py' && (line.startsWith('"""', i) || line.startsWith("'''", i))) {
        mode = line.startsWith('"""', i) ? 'tripleD' : 'tripleS'
        res += '   '
        i += 3
        continue
      }
      if (c === '`' && (lang === 'js' || lang === 'go')) {
        mode = lang === 'js' ? 'tmpl' : 'raw'
        res += ' '
        i++
        continue
      }
      if (c === '"' || c === "'") {
        let j = i + 1
        while (j < line.length && line[j] !== c) {
          if (line[j] === '\\') j++
          j++
        }
        const last = Math.min(j, line.length - 1)
        res += ' '.repeat(last - i + 1)
        i = last + 1
        continue
      }
      res += c
      i++
    }
    out.push(res)
  }
  return out
}

// ---------------------------------------------------------------------------
// Outline

export const CLASS_LIKE = new Set<SymbolKind>(['class', 'interface', 'trait', 'enum'])
const NOT_METHODS = new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'with', 'new', 'typeof', 'await', 'throw'])
const MODIFIERS = '(?:(?:public|private|protected|static|async|override|readonly|abstract|final|get|set|declare)\\s+)*'

export function sig(line: string): string {
  const s = line.trim().replace(/\s*\{$/, '')
  return s.length > 200 ? `${s.slice(0, 197)}...` : s
}

type Decl = { name: string; kind: SymbolKind; parent?: string }

function matchBraceDecl(masked: string, lang: Lang, inClass: boolean): Decl | null {
  let m: RegExpMatchArray | null
  if (lang === 'php') {
    if ((m = masked.match(/^\s*(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+(\w+)/)))
      return { name: m[2]!, kind: m[1] as SymbolKind }
    if ((m = masked.match(new RegExp(`^\\s*${MODIFIERS}function\\s+&?(\\w+)\\s*\\(`))))
      return { name: m[1]!, kind: inClass ? 'method' : 'function' }
    return null
  }
  if (lang === 'go') {
    if ((m = masked.match(/^func\s+\(\s*\w*\s*\*?\s*(\w+)(?:\[[^\]]*\])?\s*\)\s*(\w+)/)))
      return { name: m[2]!, kind: 'method', parent: m[1]! }
    if ((m = masked.match(/^func\s+(\w+)/))) return { name: m[1]!, kind: 'function' }
    if ((m = masked.match(/^type\s+(\w+)(?:\[[^\]]*\])?\s+(struct|interface)\b/)))
      return { name: m[1]!, kind: m[2] === 'interface' ? 'interface' : 'class' }
    if ((m = masked.match(/^type\s+(\w+)\s/))) return { name: m[1]!, kind: 'type' }
    return null
  }
  // js / ts
  const exp = '(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?'
  if ((m = masked.match(new RegExp(`^\\s*${exp}(?:abstract\\s+)?class\\s+(\\w+)`)))) return { name: m[1]!, kind: 'class' }
  if ((m = masked.match(new RegExp(`^\\s*${exp}interface\\s+(\\w+)`)))) return { name: m[1]!, kind: 'interface' }
  if ((m = masked.match(new RegExp(`^\\s*${exp}(?:const\\s+)?enum\\s+(\\w+)`)))) return { name: m[1]!, kind: 'enum' }
  if ((m = masked.match(new RegExp(`^\\s*${exp}type\\s+(\\w+)\\s*(?:<|=)`)))) return { name: m[1]!, kind: 'type' }
  if ((m = masked.match(new RegExp(`^\\s*${exp}(?:async\\s+)?function\\s*\\*?\\s*([\\w$]+)`))))
    return { name: m[1]!, kind: inClass ? 'method' : 'function' }
  if (
    (m = masked.match(
      new RegExp(
        `^\\s*${exp}(?:const|let|var)\\s+([\\w$]+)\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]*)?=>|\\(\\s*$|[\\w$]+\\s*=>)`,
      ),
    ))
  )
    return { name: m[1]!, kind: 'function' }
  if (inClass) {
    if ((m = masked.match(new RegExp(`^\\s*${MODIFIERS}\\*?\\s*(#?[\\w$]+)\\s*(?:<[^>]*>)?\\s*\\(`))) && !NOT_METHODS.has(m[1]!))
      return { name: m[1]!, kind: 'method' }
    if ((m = masked.match(new RegExp(`^\\s*${MODIFIERS}(#?[\\w$]+)\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[\\w$]+)\\s*(?::[^=]*)?=>`))))
      return { name: m[1]!, kind: 'method' }
  }
  return null
}

/** Ende (1-basiert) der Deklaration, die in Zeile `startIdx` (0-basiert) beginnt, über Klammerzählung. */
export function braceEnd(masked: string[], startIdx: number): number {
  let depth = 0
  let seen = false
  for (let k = startIdx; k < masked.length; k++) {
    const l = masked[k]!
    for (const ch of l) {
      if (ch === '{' || ch === '(' || ch === '[') {
        depth++
        if (ch === '{') seen = true
      } else if (ch === '}' || ch === ')' || ch === ']') depth--
    }
    if (depth <= 0) {
      if (seen) return k + 1
      const t = l.trimEnd()
      if (t.endsWith(';')) return k + 1
      let m = k + 1
      while (m < masked.length && masked[m]!.trim() === '') m++
      if (m < masked.length && masked[m]!.trimStart().startsWith('{')) continue
      if (/(=>|=|,|\+|&&|\|\||\?)$/.test(t)) continue
      return k + 1
    }
  }
  return masked.length
}

function scanBrace(lines: string[], masked: string[], lang: Lang): OutlineSymbol[] {
  const depthStart: number[] = []
  let depth = 0
  for (const l of masked) {
    depthStart.push(depth)
    for (const ch of l) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
  }
  const out: OutlineSymbol[] = []
  const containers: { name: string; kind: SymbolKind; base: number; ende: number }[] = []
  for (let i = 0; i < masked.length; i++) {
    while (containers.length > 0 && containers[containers.length - 1]!.ende < i + 1) containers.pop()
    const cur = containers[containers.length - 1]
    const allowed = cur ? cur.base + 1 : 0
    if (depthStart[i] !== allowed) continue
    const decl = matchBraceDecl(masked[i]!, lang, cur !== undefined && CLASS_LIKE.has(cur.kind))
    if (!decl) continue
    const ende = braceEnd(masked, i)
    const parent = decl.parent ?? (cur && CLASS_LIKE.has(cur.kind) ? cur.name : undefined)
    out.push({ name: decl.name, kind: decl.kind, start: i + 1, ende, signatur: sig(lines[i]!), ...(parent ? { parent } : {}) })
    if (CLASS_LIKE.has(decl.kind) && lang !== 'go') containers.push({ name: decl.name, kind: decl.kind, base: depthStart[i]!, ende })
  }
  return out
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/** Ende (1-basiert) eines Python-Blocks, der in Zeile `startIdx` beginnt. */
export function pyEnd(lines: string[], masked: string[], startIdx: number): number {
  const base = indentOf(masked[startIdx]!)
  let k = startIdx
  let paren = 0
  // Kopf bis zum Doppelpunkt am Zeilenende (Klammern über mehrere Zeilen)
  for (; k < masked.length; k++) {
    for (const ch of masked[k]!) {
      if (ch === '(' || ch === '[' || ch === '{') paren++
      else if (ch === ')' || ch === ']' || ch === '}') paren--
    }
    if (paren <= 0 && masked[k]!.trimEnd().endsWith(':')) break
    if (paren <= 0 && !masked[k]!.trimEnd().endsWith('\\')) break
  }
  // Einzeiler `def f(): return 1`
  const headLine = masked[k]!.trimEnd()
  if (!headLine.endsWith(':')) return k + 1
  let last = k
  for (let m = k + 1; m < masked.length; m++) {
    const l = masked[m]!
    if (l.trim() === '') {
      // leer oder nur Zeichenkette/Kommentar: gehört dazu, solange die Originalzeile eingerückt ist
      if (lines[m]!.trim() !== '' && indentOf(lines[m]!) > base) last = m
      continue
    }
    if (indentOf(l) <= base) break
    last = m
  }
  return last + 1
}

function scanPython(lines: string[], masked: string[]): OutlineSymbol[] {
  const out: OutlineSymbol[] = []
  const stack: { name: string; kind: 'class' | 'function'; indent: number; ende: number }[] = []
  for (let i = 0; i < masked.length; i++) {
    const m = masked[i]!.match(/^(\s*)(?:async\s+)?(def|class)\s+(\w+)/)
    if (!m) continue
    const indent = m[1]!.length
    while (stack.length > 0 && (stack[stack.length - 1]!.ende < i + 1 || stack[stack.length - 1]!.indent >= indent)) stack.pop()
    const top = stack[stack.length - 1]
    if (top && top.kind === 'function') continue // verschachtelt in einer Funktion: nicht Teil der Outline
    const isClass = m[2] === 'class'
    const ende = pyEnd(lines, masked, i)
    const kind: SymbolKind = isClass ? 'class' : top ? 'method' : 'function'
    out.push({ name: m[3]!, kind, start: i + 1, ende, signatur: sig(lines[i]!), ...(top ? { parent: top.name } : {}) })
    stack.push({ name: m[3]!, kind: isClass ? 'class' : 'function', indent, ende })
  }
  return out
}

export function splitLines(inhalt: string): string[] {
  return inhalt.split(/\r?\n/)
}

/** Eigener, leichter Symbol-Scanner (Regex plus Klammer-/Einrückungszählung). Unbekannte Sprache: leer. */
export function outline(inhalt: string, datei: string): OutlineSymbol[] {
  const lang = languageOf(datei)
  if (!lang) return []
  const lines = splitLines(inhalt)
  const masked = maskCode(lines, lang)
  return lang === 'py' ? scanPython(lines, masked) : scanBrace(lines, masked, lang)
}
