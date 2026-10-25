// Hauptordner des Projekts: Bücher, `.claude/codecycle.md`, `docs/codecycle/` und
// `.codecycle/` liegen immer im Git-Hauptordner, auch wenn die Sitzung per `cd` in einem Unterordner oder
// einem Worktree neben dem Projekt (`…--wt-…`) steht. Reiner Code ohne Node und ohne Mod-API.

const slashes = (p: string): string => p.replace(/\\/g, '/')

/** Absoluter Pfad? (`/…`, `\…`, `C:/…`, `C:\…`) */
export function isAbsolutePath(p: string): boolean {
  return /^([\\/]|[A-Za-z]:[\\/])/.test(p)
}

/** `a/b/../c` → `a/c`, `./` entfernt; Laufwerk bzw. führender Schrägstrich bleiben. */
function collapse(p: string): string {
  const s = slashes(p)
  const lead = s.match(/^([A-Za-z]:)?\//)?.[0] ?? ''
  const out: string[] = []
  for (const part of s.slice(lead.length).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length > 0 && out.at(-1) !== '..') out.pop()
      else if (lead === '') out.push('..')
    } else out.push(part)
  }
  return lead + out.join('/')
}

/**
 * Hauptordner aus der Ausgabe von `git rev-parse --path-format=absolute --git-common-dir` (letzte Zeile):
 * der Ordner über dem `.git`-Verzeichnis. Für einen Worktree nennt Git das `.git` des Hauptordners, also
 * ist das Ergebnis auch dort der Hauptordner. Relative Ausgabe (ältere Git-Fassungen) gilt vom Ordner `base`
 * aus, in dem der Befehl lief. null, wenn kein `.git`-Ordner erkennbar ist (bare, `GIT_DIR` umgebogen, Unsinn).
 */
export function mainRootFromCommonDir(output: string, base: string | null): string | null {
  const line = output.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '').at(-1)
  if (!line) return null
  let dir = slashes(line).replace(/\/+$/, '')
  if (!/(^|\/)\.git$/.test(dir)) return null
  if (!isAbsolutePath(dir)) {
    if (!base) return null
    dir = `${slashes(base).replace(/\/+$/, '')}/${dir}`
  }
  const root = collapse(dir).replace(/\/?\.git$/, '')
  return root === '' ? null : root
}

/** Projektpfad im Hauptordner: relative Pfade gegen `root`, absolute unverändert; ohne `root` bleibt der Pfad (bisheriges Verhalten). */
export function inRoot(root: string | null | undefined, path: string): string {
  if (!root || isAbsolutePath(path)) return path
  return `${root.replace(/[\\/]+$/, '')}/${path.replace(/^\.[\\/]/, '')}`
}
