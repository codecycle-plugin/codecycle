// Prüf-Worktrees neben dem Projekt (`codecycle solo pruefung`): Verweise auf die Pakete in node_modules, Entfernen ohne `--force`.

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

import { ToolBroken } from './errors.ts'
import { gitCommonDir } from './project.ts'

const NODE_MODULES = 'node_modules'
/** Eintrag in `info/exclude`: ohne Schrägstrich am Ende, trifft so den Ordner und einen älteren Verweis (`node_modules/` träfe keinen Verweis). */
const EXCLUDE_LINK = `/${NODE_MODULES}`

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/** Ordner (auch über einen Verweis, etwa bei pnpm)? */
function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Gibt es den Eintrag (auch einen Verweis ins Leere)? */
function present(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** Ordnerverweis, unter Windows als Junction (ohne Adminrechte). */
function linkDir(target: string, link: string): void {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * Ziel des Verweises auf das Paket `from`: Liegt es (`realpath`) im Projekt außerhalb jedes `node_modules` (Workspace-Paket,
 * `file:`-Abhängigkeit) und gibt es denselben Pfad im Worktree, der Pfad im Worktree, sonst `from`.
 */
function packageTarget(root: string, wt: string, from: string): string {
  try {
    const rel = relative(realpathSync(root), realpathSync(from))
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes(NODE_MODULES)) return from
    const own = join(wt, rel)
    return isDir(own) ? own : from
  } catch {
    return from
  }
}

/**
 * Echter Ordner `.bin` im Worktree: Verweise darin mit demselben (meist relativen) Ziel, das so die Paketverweise im Worktree
 * trifft; Dateien (Shims unter Windows) als Kopie. Nie ein Verweis auf `.bin` selbst: npm im Worktree legt dort Programme an
 * und löscht sie beim Entfernen eines Pakets. Rückgabe: Zahl der neuen und der schon vorhandenen Einträge.
 */
function mirrorBin(from: string, to: string): { n: number; kept: number } {
  mkdirSync(to, { recursive: true })
  let n = 0
  let kept = 0
  for (const name of readdirSync(from)) {
    const src = join(from, name)
    const dest = join(to, name)
    if (present(dest)) {
      kept++
      continue
    }
    if (isLink(src)) symlinkSync(readlinkSync(src), dest)
    else if (lstatSync(src).isFile()) copyFileSync(src, dest)
    else continue
    n++
  }
  return { n, kept }
}

/**
 * Echter Ordner `<worktree>/node_modules` mit einem Verweis je Paket des Hauptordners, damit Lint, Typprüfung und Tests im
 * Worktree laufen. Nie ein Verweis auf den ganzen Ordner, einen Scope-Ordner (`@types`) oder `.bin`: npm im Worktree (`npm ci`,
 * `npm install`, `npm uninstall`) löscht durch ihn im Hauptordner. Scope-Ordner sind echt, darin ein Verweis je Paket; `.bin`
 * ist echt (siehe `mirrorBin`). Workspace-Pakete zeigen auf ihre Fassung im Worktree (`packageTarget`). Dateien wie
 * `.package-lock.json` bleiben weg. Vorhandene Einträge im Worktree bleiben unberührt, es kommen nur fehlende dazu (auch in
 * einem Ordner, in den npm echt installiert hat). `/node_modules` kommt in `info/exclude` des gemeinsamen Git-Verzeichnisses,
 * sonst wäre der Worktree nie sauber. Ein Verweis auf den ganzen Ordner (älterer Worktree) wird ersetzt. Nichts, wenn der
 * Hauptordner keins hat.
 */
export function linkNodeModules(root: string, wt: string): string | null {
  const target = join(root, NODE_MODULES)
  const dir = join(wt, NODE_MODULES)
  if (!existsSync(target)) return null
  if (isLink(dir)) unlinkSync(dir)
  const exclude = join(gitCommonDir(root), 'info', 'exclude')
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (!text.split(/\r?\n/).some(l => l.trim() === EXCLUDE_LINK)) {
    mkdirSync(dirname(exclude), { recursive: true })
    writeFileSync(exclude, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${EXCLUDE_LINK}\n`)
  }
  let n = 0
  let kept = 0
  const link = (from: string, to: string): void => {
    if (present(to)) kept++
    else {
      linkDir(packageTarget(root, wt, from), to)
      n++
    }
  }
  try {
    mkdirSync(dir, { recursive: true })
    for (const name of readdirSync(target)) {
      const from = join(target, name)
      if (!isDir(from)) continue
      if (name === '.bin') {
        const bin = mirrorBin(from, join(dir, name))
        n += bin.n
        kept += bin.kept
      } else if (name.startsWith('@') && !isLink(from)) {
        mkdirSync(join(dir, name), { recursive: true })
        for (const pkg of readdirSync(from)) if (isDir(join(from, pkg))) link(join(from, pkg), join(dir, name, pkg))
      } else link(from, join(dir, name))
    }
  } catch (err) {
    return `${NODE_MODULES}: Verweise unvollständig (${n} angelegt; ${String(err)}); Lint und Typen im Worktree ohne alle Abhängigkeiten`
  }
  return `${NODE_MODULES}: ${n} Verweise auf Pakete in ${target}${kept > 0 ? ` (${kept} vorhandene Einträge unverändert)` : ''}`
}

/**
 * Entfernt in `<worktree>/node_modules` nur Verweise (nie ihr Ziel, das gehört dem Hauptordner), auch in Scope-Ordnern und
 * `.bin`, danach leere Unterordner und den Ordner selbst, wenn er leer ist. Was npm im Worktree echt installiert hat und die
 * kopierten Shims bleiben für `git worktree remove`. Rückgabe: Fehlermeldung oder null.
 */
function unlinkNodeModules(wt: string): string | null {
  const dir = join(wt, NODE_MODULES)
  try {
    if (isLink(dir)) {
      unlinkSync(dir)
      return null
    }
    if (!existsSync(dir)) return null
    const emptyDir = (p: string): void => {
      if (readdirSync(p).length === 0) rmdirSync(p)
    }
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (isLink(p)) unlinkSync(p)
      else if ((name.startsWith('@') || name === '.bin') && isDir(p)) {
        for (const entry of readdirSync(p)) if (isLink(join(p, entry))) unlinkSync(join(p, entry))
        emptyDir(p)
      }
    }
    emptyDir(dir)
    return null
  } catch (err) {
    return String(err)
  }
}

/** Git mit Ausgabe auf stdout und stderr (für Merge und Commit, deren Meldungen gebraucht werden). */
export function gitFull(args: string[], cwd: string): { ok: boolean; text: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  if (r.error) throw new ToolBroken(`git nicht ausführbar: ${String(r.error)}`)
  return { ok: r.status === 0, text: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

/**
 * Worktree entfernen, nie mit `--force`: vorher nur die Verweise in `node_modules` löschen (nie ihren Inhalt, der gehört dem
 * Hauptordner); scheitert das, bleibt der Worktree. Scheitert `git worktree remove`, `prune` und die Verweise neu anlegen.
 * Rückgabe: Zusatz für den Verlauf, leer, wenn alles weg ist.
 */
export function removeWorktree(root: string, wt: string): string {
  const unlinked = unlinkNodeModules(wt)
  if (unlinked) return `; Worktree ${wt} nicht entfernt (Verweise in ${NODE_MODULES} nicht löschbar: ${unlinked}), ansehen, nie mit --force`
  const r = gitFull(['worktree', 'remove', wt], root)
  if (r.ok) return ''
  gitFull(['worktree', 'prune'], root)
  if (!existsSync(wt)) return ''
  if (readdirSync(wt).length === 0) return `; leerer Ordner ${wt} bleibt, später löschen`
  const relinked = linkNodeModules(root, wt)
  return `; Worktree ${wt} nicht entfernt (${r.text.split(/\r?\n/).at(-1) ?? ''}), Inhalt ansehen${relinked ? `; ${relinked}` : ''}`
}
