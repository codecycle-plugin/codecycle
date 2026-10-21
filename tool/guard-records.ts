// Ablage von `codecycle guard` im Hauptordner: festgehaltene Testzahlen mit Commit
// und Prüfsummen der von Git ignorierten Kontrolldateien je Arbeitsordner. Liegt in `.codecycle/tmp/` des Hauptordners,
// damit der Hauptordner auch die Einträge eines inzwischen entfernten Paket-Worktrees findet.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { git } from './exec.ts'
import { TMP_DIR, tmpDir } from './project.ts'
import { pathsLib } from './lib-path.ts'

const { GIT_QUIET } = pathsLib

export const RECORDS_FILE = `${TMP_DIR}/guard-records.json`
const MAX_RECORDS = 50

/** Ordner mit Kontrolldateien, die lokal ausgeschlossen sein können. */
export const CONTROL_DIRS = ['.codecycle', '.githooks', '.husky']

export type CountRecord = { branch: string; head: string; work: string; total: number; skipped: number; recordedAt: string }
/** `control`: je Arbeitsordner (Schlüssel `workKey`) Prüfsummen der ignorierten Kontrolldateien */
/** `pruefungen`: je Paket-Branch das letzte Ergebnis von `paket pruefen` (Stand, grün), für `paket fertig` */
export type Records = {
  counts: CountRecord[]
  control: Record<string, { recordedAt: string; files: Record<string, string> }>
  pruefungen?: Record<string, { head: string; ok: boolean; at: string }>
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)

/** Ein `control`-Eintrag: `recordedAt` Text, `files` einfaches Objekt Text → Text. */
function validControlEntry(v: unknown): v is { recordedAt: string; files: Record<string, string> } {
  return isPlainObject(v) && typeof v.recordedAt === 'string' && isPlainObject(v.files) && Object.values(v.files).every(h => typeof h === 'string')
}

/**
 * Ablage lesen. Fail-closed: Ist die Datei nicht lesbar, kein gültiges JSON, `control`
 * kein einfaches Objekt oder auch nur ein `control`-Eintrag kaputt, gilt die ganze Grundlage als fehlend (guard wird
 * dann bei vorhandenen ignorierten Kontrolldateien rot). `counts`-Einträge mit falschen Typen werden einzeln verworfen.
 */
export function loadRecords(root: string): Records {
  const path = join(root, RECORDS_FILE)
  const empty = (): Records => ({ counts: [], control: {} })
  if (!existsSync(path)) return empty()
  try {
    const j: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isPlainObject(j)) return empty()
    const counts = Array.isArray(j.counts)
      ? (j.counts as unknown[]).filter(
          (c): c is CountRecord =>
            isPlainObject(c) && typeof c.head === 'string' && typeof c.total === 'number' && typeof c.skipped === 'number' && typeof c.recordedAt === 'string',
        )
      : []
    const raw = j.control
    const control = raw === undefined ? {} : isPlainObject(raw) && Object.values(raw).every(validControlEntry) ? (raw as Records['control']) : {}
    const p = j.pruefungen
    const pruefungen = isPlainObject(p)
      ? Object.fromEntries(
          Object.entries(p).filter(
            (e): e is [string, { head: string; ok: boolean; at: string }] =>
              isPlainObject(e[1]) && typeof e[1].head === 'string' && typeof e[1].ok === 'boolean' && typeof e[1].at === 'string',
          ),
        )
      : {}
    return { counts, control, pruefungen }
  } catch {
    return empty()
  }
}

export function saveRecords(root: string, r: Records): void {
  tmpDir(root)
  writeFileSync(join(root, RECORDS_FILE), `${JSON.stringify({ ...r, counts: r.counts.slice(-MAX_RECORDS) }, null, 2)}\n`)
}

/** Schlüssel eines Arbeitsordners (unter Windows ohne Groß-/Kleinschreibung). */
export function workKey(dir: string): string {
  const p = resolve(dir).split('\\').join('/')
  return process.platform === 'win32' ? p.toLowerCase() : p
}

/**
 * Von Git ignorierte Dateien in den Kontrollordnern (`codecycle exclude` hält .codecycle/ und .githooks/ aus Git heraus;
 * neue Kontrolldateien dort sähe `--exclude-standard` nicht), mit Prüfsumme des Inhalts, ohne `.codecycle/tmp/`.
 * Git kennt für sie keinen Basisstand; Grundlage ist der Stand beim letzten `refreshControl`.
 */
export function hiddenControl(dir: string): Record<string, string> {
  const files = git([...GIT_QUIET, 'ls-files', '--others', '--ignored', '--exclude-standard', '--', ...CONTROL_DIRS], dir).out
    .split(/\r?\n/)
    .filter(l => l !== '' && !l.startsWith(`${TMP_DIR}/`))
  const out: Record<string, string> = {}
  for (const f of files) {
    try {
      out[f] = createHash('sha1').update(readFileSync(join(dir, f))).digest('hex')
    } catch {
      out[f] = 'unlesbar'
    }
  }
  return out
}

/** Ignorierte Kontrolldateien, die seit der Grundlage neu, geändert oder gelöscht sind. */
export function changedHidden(now: Record<string, string>, before: Record<string, string>): string[] {
  return [...new Set([...Object.keys(now), ...Object.keys(before)])].filter(f => now[f] !== before[f])
}

/**
 * Grundlage der ignorierten Kontrolldateien für die Ordner neu festhalten. Aufrufer: `guard --record` (vor dem Paket)
 * und die Befehle, die Kontrolldateien rechtmäßig schreiben (`install-tool`, `hooks install`, `exclude`).
 */
export function refreshControl(root: string, dirs: string[], records = loadRecords(root)): Records {
  const recordedAt = new Date().toISOString()
  for (const dir of new Set(dirs.map(d => resolve(d)))) records.control[workKey(dir)] = { recordedAt, files: hiddenControl(dir) }
  saveRecords(root, records)
  return records
}
