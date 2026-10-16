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

/**
 * `git diff` für das Kontextpaket der Prüfer. Branch-Namen kommen aus `STATE.md`, der
 * Hauptbranch aus `.codecycle/tool.config.json`; ein Name wie `--output=datei` würde sonst als Option gelesen. Deshalb
 * `--end-of-options` und nur Namen aus Buchstaben, Ziffern, `._/-`, nicht mit `-` am Anfang, ohne `..`. Sonst null.
 * Abschlussprüfung (`all`): Hauptbranch...Aufgaben-Branch; sonst Aufgaben-Branch...Paket-Branch (`<branch>--<paket>`).
 */
export function reviewDiffArgs(main: string, branch: string, paket: string, all: boolean): string[] | null {
  const [from, to] = all ? [main, branch] : [branch, `${branch}--${paket}`]
  const safe = (ref: string): boolean => /^[A-Za-z0-9._/-]+$/.test(ref) && !ref.startsWith('-') && !ref.includes('..')
  return safe(from) && safe(to) ? ['git', 'diff', '--end-of-options', `${from}...${to}`] : null
}
