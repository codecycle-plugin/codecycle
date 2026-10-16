// JUnit-XML auswerten. Kleiner Leser für testcase-Einträge,
// ohne Fremdbibliothek.

export type JunitFailure = { name: string; message: string; detail: string }
export type JunitSummary = { passed: number; failed: number; skipped: number; failures: JunitFailure[] }

// Attributteil: > in "…"- und '…'-Werten ist erlaubt (der Node-Reporter maskiert > nicht).
const ATTRS = String.raw`((?:[^>"']|"[^"]*"|'[^']*')*?)`
const CASE = new RegExp(String.raw`<testcase\b${ATTRS}(?:\/>|>([\s\S]*?)<\/testcase>)`, 'g')
const FAIL = new RegExp(String.raw`<(failure|error)\b${ATTRS}(?:\/>|>([\s\S]*?)<\/\1>)`)

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`))
  return m ? decode(m[1]!) : ''
}

export function parseJunit(xml: string): JunitSummary {
  const out: JunitSummary = { passed: 0, failed: 0, skipped: 0, failures: [] }
  for (const m of xml.matchAll(CASE)) {
    const attrs = m[1] ?? ''
    const body = m[2] ?? ''
    const cls = attr(attrs, 'classname')
    const name = attr(attrs, 'name')
    const fail = body.match(FAIL)
    if (fail) {
      out.failed++
      const raw = (fail[3] ?? '').trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
      out.failures.push({
        name: cls ? `${cls}::${name}` : name,
        message: attr(fail[2] ?? '', 'message'),
        detail: decode(raw.trim()),
      })
    } else if (/<skipped\b/.test(body)) {
      out.skipped++
    } else {
      out.passed++
    }
  }
  return out
}
