// Werkzeug-Kopie im Projekt: `.codecycle/tool/` mit `lib/` und `githooks/` darin.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Layout } from './paths.ts'
import { TOOL_VERSION } from './version.ts'

export const COPY_DIR = '.codecycle/tool'
export const COPY_INFO = '.copy-info.json'

export type CopyFile = { rel: string; abs: string }
export type CopyInfo = { version: string; hash: string }

const SKIP_DIRS = new Set(['tests', 'lib', 'githooks', 'node_modules'])
const SKIP_FILES = new Set(['tsconfig.json', COPY_INFO])

function walk(dir: string, prefix: string, skipDirs: Set<string>, keep: (name: string) => boolean): CopyFile[] {
  if (!existsSync(dir)) return []
  const out: CopyFile[] = []
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      if (!skipDirs.has(name)) out.push(...walk(abs, `${prefix}${name}/`, skipDirs, keep))
    } else if (keep(name)) out.push({ rel: `${prefix}${name}`, abs })
  }
  return out
}

/** Dateien der Kopie: Werkzeug, Kern (ohne Tests) und Hook-Vorlagen, mit Pfaden relativ zur Kopie. */
export function copyFiles(layout: Layout): CopyFile[] {
  const isSource = (n: string) => n.endsWith('.ts') && !n.endsWith('.spec.ts')
  return [
    ...walk(layout.toolDir, '', SKIP_DIRS, n => isSource(n) && !SKIP_FILES.has(n)),
    ...walk(layout.libDir, 'lib/', new Set(), isSource),
    ...walk(layout.githooksDir, 'githooks/', new Set(), () => true),
  ]
}

/** Prüfsumme über Pfade und Inhalte (Zeilenenden vereinheitlicht: unabhängig von autocrlf). */
export function treeHash(files: CopyFile[]): string {
  const h = createHash('sha256')
  for (const f of [...files].sort((a, b) => (a.rel < b.rel ? -1 : 1))) {
    h.update(`${f.rel}\n`)
    h.update(readFileSync(f.abs, 'utf8').replace(/\r\n/g, '\n'))
    h.update('\n')
  }
  return h.digest('hex').slice(0, 16)
}

export function readCopyInfo(root: string): CopyInfo | null {
  try {
    const j = JSON.parse(readFileSync(join(root, COPY_DIR, COPY_INFO), 'utf8')) as Partial<CopyInfo>
    return typeof j.version === 'string' && typeof j.hash === 'string' ? { version: j.version, hash: j.hash } : null
  } catch {
    return null
  }
}

export type InstallResult = { files: number; changed: boolean; info: CopyInfo; removed: string[] }

/** Kopie anlegen oder erneuern; Dateien, die es in der Quelle nicht mehr gibt, werden entfernt. */
export function installCopy(root: string, source: Layout, dryRun: boolean): InstallResult {
  const files = copyFiles(source)
  const info: CopyInfo = { version: TOOL_VERSION, hash: treeHash(files) }
  const dest = join(root, COPY_DIR)
  const current = readCopyInfo(root)
  const wanted = new Set(files.map(f => f.rel))
  const existing = existsSync(dest)
    ? copyFiles({ toolDir: dest, libDir: join(dest, 'lib'), githooksDir: join(dest, 'githooks'), isCopy: true })
    : []
  const removed = existing.map(f => f.rel).filter(r => !wanted.has(r))
  // auch bei gleichem Inhalt, wenn der Versionsvermerk abweicht (sonst bliebe ein falscher Vermerk stehen)
  const changed = current === null || current.hash !== info.hash || current.version !== info.version || removed.length > 0
  if (dryRun || !changed) return { files: files.length, changed, info, removed }
  for (const rel of removed) rmSync(join(dest, rel), { force: true })
  for (const f of files) {
    const target = join(dest, f.rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(f.abs))
  }
  writeFileSync(join(dest, COPY_INFO), `${JSON.stringify(info)}\n`)
  return { files: files.length, changed, info, removed }
}
