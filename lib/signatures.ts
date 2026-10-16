// Signaturen aufgerufener Funktionen und Typen für das Kontextpaket
// (Stufe „Mitgeliefert“: nur Signaturen, kein Volltext).
// Rein: kein Node, keine Mod-API. Das Werkzeug (`codecycle package-info`) sucht damit die
// Namen in einem Code-Abschnitt und die Definitionen in den Kandidaten-Dateien.
//
// Grenzen (Heuristik, kein Parser): erkannt werden Aufrufe `name(`, `->name(`, `::name(`,
// `.name(`, `new Klasse`, `Klasse::`, Typangaben `: Typ` und PHP-Parametertypen `Typ $x`.
// Strings und Kommentare zählen nicht (maskCode). Unbekannte Sprachen liefern nichts.

import { languageOf, maskCode, outline } from './outline.ts'

/** Schlüsselwörter und Eingebautes, die wie Aufrufe aussehen, aber keine Projekt-Symbole sind. */
const SKIP = new Set([
  // Sprachkonstrukte
  'if', 'for', 'foreach', 'while', 'switch', 'catch', 'function', 'return', 'match', 'fn', 'func', 'def',
  'array', 'list', 'isset', 'unset', 'empty', 'echo', 'print', 'exit', 'die', 'eval', 'include', 'require',
  'require_once', 'include_once', 'new', 'typeof', 'instanceof', 'await', 'yield', 'sizeof', 'super', 'this',
  'self', 'parent', 'static', 'elseif', 'else', 'do', 'try', 'throw', 'case', 'with', 'assert', 'lambda',
  // häufiges Eingebautes (PHP, JS/TS, Python, Go)
  'count', 'strlen', 'in_array', 'array_map', 'array_filter', 'array_keys', 'array_values', 'implode', 'explode',
  'sprintf', 'printf', 'json_encode', 'json_decode', 'is_array', 'is_string', 'is_int', 'trim', 'str_replace',
  'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Date', 'JSON', 'Math', 'Error',
  'console', 'log', 'push', 'map', 'filter', 'reduce', 'forEach', 'join', 'split', 'slice', 'includes', 'then',
  'string', 'number', 'boolean', 'void', 'any', 'unknown', 'never', 'null', 'undefined', 'int', 'float', 'bool',
  'mixed', 'iterable', 'callable', 'object', 'len', 'range', 'str', 'dict', 'set', 'tuple', 'make', 'append',
  'panic', 'Record', 'Partial', 'Readonly',
])

/** Namen aus SKIP, die nach `Klasse::` doch als Projekt-Symbol zählen. */
const KEEP_WHEN_STATIC = new Set(['log'])

const MAX_NAMES = 15

const CALL = /(?<![\w$])([A-Za-z_]\w*)\s*\(/g

/**
 * Namen, die im Abschnitt aufgerufen oder als Typ benutzt werden, in Reihenfolge des ersten
 * Auftretens, ohne Doppelte, ohne `exclude` (die eigenen Symbole) und ohne SKIP.
 */
export function calledNames(code: string, datei: string, exclude: readonly string[], max = MAX_NAMES): string[] {
  const lang = languageOf(datei)
  if (!lang) return []
  const masked = maskCode(code.split(/\r?\n/), lang).join('\n')
  const hits: { at: number; name: string }[] = []
  const add = (re: RegExp, pick: (m: RegExpExecArray) => string | undefined, keepStatic = false) => {
    for (let m = re.exec(masked); m; m = re.exec(masked)) {
      const raw = pick(m)
      if (!raw) continue
      const name = raw.split('\\').filter(Boolean).at(-1) ?? raw
      if (SKIP.has(name) && !(keepStatic && KEEP_WHEN_STATIC.has(name))) continue
      hits.push({ at: m.index, name })
    }
  }
  // Klasse vor `::` (statischer Aufruf)
  add(/\b([A-Z][A-Za-z0-9_]*)::/g, m => m[1])
  // Aufrufe mit und ohne Empfänger; eine Deklaration (`function name(`) ist kein Aufruf.
  // Nach `Klasse::` zählen auch Namen aus KEEP_WHEN_STATIC (z. B. `Audit::log`).
  for (let m = CALL.exec(masked); m; m = CALL.exec(masked)) {
    const name = m[1]!
    const before = masked.slice(Math.max(0, m.index - 12), m.index)
    if (/(function|def|func|fn)\s+$/.test(before)) continue
    const isStatic = /::\s*$/.test(before)
    if (SKIP.has(name) && !(isStatic && KEEP_WHEN_STATIC.has(name))) continue
    hits.push({ at: m.index, name })
  }
  // new Klasse (auch mit Namensraum)
  add(/\bnew\s+\\?([A-Za-z_][\w\\]*)/g, m => m[1])
  // Typangaben: `: Typ`, `?Typ $x`, `Typ $x`, generisch `<Typ>`
  add(/[:(,]\s*\??\\?([A-Z][\w\\]*)\s*(?=[\s$>{=,)|;]|$)/gm, m => m[1])
  add(/<\s*([A-Z]\w*)\s*>/g, m => m[1])

  hits.sort((a, b) => a.at - b.at)
  const out: string[] = []
  for (const h of hits) {
    if (exclude.includes(h.name) || out.includes(h.name)) continue
    out.push(h.name)
    if (out.length >= max) break
  }
  return out
}

export type Signatur = { name: string; datei: string; zeile: number; signatur: string; parent?: string }

/** Definitionen der gesuchten Namen in einer Datei (über die Outline), mit Signaturzeile. */
export function signaturesIn(inhalt: string, datei: string, names: readonly string[]): Signatur[] {
  const wanted = new Set(names)
  return outline(inhalt, datei)
    .filter(s => wanted.has(s.name))
    .map(s => ({ name: s.name, datei, zeile: s.start, signatur: s.signatur.trim(), ...(s.parent ? { parent: s.parent } : {}) }))
}

/** Erweitertes Suchmuster (git grep -E) für Zeilen, die `name` definieren könnten. */
export function definitionPattern(name: string): string {
  const n = name.replace(/[^A-Za-z0-9_]/g, '')
  // `[ \t]` statt `\s` oder `[[:space:]]`: gilt in git grep -E und in JavaScript gleich
  return `(function|class|interface|trait|enum|type|def|func|fn|struct|const|let|var)[ \t]+(\\([^)]*\\)[ \t]*)?${n}([^A-Za-z0-9_]|$)`
}
