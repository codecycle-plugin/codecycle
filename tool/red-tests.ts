// Roter Test-Commit des Test-Autors: einmalige Markierung im Git-Verzeichnis des Worktrees.
// `codecycle commit-tests` schreibt sie, der Pre-Commit-Hook (`check --affected --staged`) liest sie.
// Sie liegt nicht im Arbeitsbaum, gilt nur für genau den Tree-Hash des Index und wird nach dem Commit gelöscht.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { git } from './exec.ts'
import { isTestPath } from './graph/util.ts'
import { pathsLib } from './lib-path.ts'

const { GIT_QUIET } = pathsLib

export const RED_MARK = 'codecycle-red-tests'

/** Pfad der Markierung im (Worktree-eigenen) Git-Verzeichnis; null, wenn es keins gibt. */
export function redMarkPath(work: string): string | null {
  const r = git(['rev-parse', '--git-dir'], work)
  if (!r.ok || r.out === '') return null
  const dir = isAbsolute(r.out) ? r.out : resolve(work, r.out)
  return join(dir, RED_MARK)
}

/** Tree-Hash des Index (`git write-tree`); null bei Fehler (z. B. ungelöste Merge-Konflikte). */
export function indexTree(work: string): string | null {
  const r = git(['write-tree'], work)
  return r.ok && /^[0-9a-f]{40,64}$/.test(r.out) ? r.out : null
}

/** Gestagte Dateien (neu, geändert, gelöscht, umbenannt). */
export function stagedFiles(work: string): string[] {
  const r = git([...GIT_QUIET, 'diff', '--cached', '--name-only', '--no-renames'], work)
  return r.out.split(/\r?\n/).filter(l => l !== '')
}

export function writeRedMark(work: string, tree: string): void {
  const path = redMarkPath(work)
  if (path) writeFileSync(path, `${tree}\n`)
}

export function clearRedMark(work: string): void {
  const path = redMarkPath(work)
  if (path && existsSync(path)) rmSync(path, { force: true })
}

/**
 * Gilt die Markierung für den aktuellen Index? Nur wenn sie zum Tree-Hash passt und alle gestagten
 * Dateien Testdateien sind. Jedes weitere `git add` ändert den Tree und macht sie wirkungslos.
 */
export function redMarkMatches(work: string): boolean {
  const path = redMarkPath(work)
  if (!path || !existsSync(path)) return false
  const tree = indexTree(work)
  if (tree === null || readFileSync(path, 'utf8').trim() !== tree) return false
  const files = stagedFiles(work)
  return files.length > 0 && files.every(isTestPath)
}
