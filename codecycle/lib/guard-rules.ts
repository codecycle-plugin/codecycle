// Regeln des mechanischen Schutzes (Schutz gegen ‚Tests passend machen‘).
// Rein: kein Node, keine Mod-API. Werkzeug (`codecycle guard`) und Mod teilen sie. Die Befehlsprüfungen liegen in
// `guard-bypass`, `guard-calls`, `bash-allowlist`, `bash-write-targets`, `bash-read-targets`, die Zerlegung in `bash-shell`.

export type TestCounts = { total: number; skipped: number }

/** Verstöße gegen die Testzahl-Regel: Zahl der Tests sinkt nicht, übersprungene steigen nicht. */
export function checkTestCounts(before: TestCounts, after: TestCounts): string[] {
  const out: string[] = []
  if (after.total < before.total) out.push(`Zahl der Tests gesunken (vorher ${before.total}, jetzt ${after.total})`)
  if (after.skipped > before.skipped) out.push(`übersprungene Tests gestiegen (vorher ${before.skipped}, jetzt ${after.skipped})`)
  return out
}
