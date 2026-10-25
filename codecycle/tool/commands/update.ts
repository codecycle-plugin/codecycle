// `codecycle update`: Plugin aktualisieren, Werkzeug-Kopie aus der neuen Version, ohne KI.
// Teil A: `claude plugin marketplace update`, `claude plugin update --json`, je Bereich danach `claude plugin install` (holt
// neue Abhängigkeiten nach) und `claude plugin update` je Abhängigkeit, `claude plugin list --json`; liegt danach eine
// andere Version auf der Platte als die, aus der dieser Befehl läuft, übernimmt deren Werkzeug Teil B
// (`update --nur-werkzeug --plugin-vorher <v>`), so wie früher die KI Teil B aus der neuen SKILL.md las.
// Teil B: install-tool --update-config (in diesem Prozess), dann hooks install, guard --record, selftest über die Kopie.
// Exit 0 fertig, 3 braucht eine Entscheidung (KI übernimmt mit /codecycle:update), 2 Werkzeug kaputt.
// Letzte Zeile immer `UPDATE_RESULT {json}` für den Mod.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { COPY_DIR, readCopyInfo } from '../copy.ts'
import { ToolBroken } from '../errors.ts'
import { versionsLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { pluginToolDir } from '../paths.ts'
import { CONFIG_PATH, findProjectRoot } from '../project.ts'
import { TOOL_VERSION } from '../version.ts'
import { installTool } from './install-tool.ts'

export const RESULT_PREFIX = 'UPDATE_RESULT '
export const PLUGIN_ID = 'codecycle@codecycle'
const MARKETPLACE = 'codecycle'
/** Abhängigkeiten aus plugin.json: für den Hinweis, wenn die Brücke scheitert, und für ihr eigenes Update. */
export const DEPENDENCIES = ['codecycle-doku@codecycle']
const CODECYCLE_MD = '.claude/codecycle.md'

export type Status = 'aktuell' | 'aktualisiert' | 'nicht-eingerichtet' | 'entscheidung' | 'kaputt'
export type UpdateResult = {
  status: Status
  plugin: { vorher: string; nachher: string; aktualisiert: boolean; hinweis?: string }
  kopie: { vorher: string | null; nachher: string | null }
  neuLaden: boolean
}

export type Run = { code: number; stdout: string; stderr: string; missing: boolean }
/**
 * Prozessaufruf, im Test ersetzbar. `claude` unter Windows über die Shell (claude.cmd aus npm). `timeoutMs`: danach
 * wird der Prozess beendet und der Aufruf gilt als gescheitert (Code 1); ohne Angabe kein Zeitlimit.
 */
export type Runner = (argv: string[], cwd: string, opts?: { timeoutMs?: number }) => Run

export const defaultRunner: Runner = (argv, cwd, opts) => {
  const [cmd, ...rest] = argv as [string, ...string[]]
  const shell = process.platform === 'win32' && cmd === 'claude'
  const r = spawnSync(cmd === 'node' ? process.execPath : cmd, rest, {
    cwd,
    encoding: 'utf8',
    shell,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...(opts?.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  })
  const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' || (shell && r.status !== 0 && /not recognized|nicht gefunden|nicht erkannt/i.test(r.stderr ?? ''))
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', missing }
}

function pluginVersionOf(root: string): string {
  try {
    const v = (JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')) as { version?: unknown }).version
    return typeof v === 'string' ? v : '?'
  } catch {
    return '?'
  }
}

/** Letzte JSON-Zeile einer Ausgabe (claude … --json druckt eine). */
/** JSON einer Ausgabe: die ganze Ausgabe (`plugin list --json` druckt mehrzeilig), sonst die letzte JSON-Zeile. */
export function lastJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // weiter: zeilenweise
  }
  for (const line of text.trim().split(/\r?\n/).reverse()) {
    try {
      return JSON.parse(line)
    } catch {
      // weiter suchen
    }
  }
  return null
}

/**
 * Ordner der installierten Version aus `claude plugin list --json`: eine Liste (so mit 2.1.296);
 * mit `--available` ein Objekt `{ installed, available }`, beides wird verstanden.
 */
export function installPathOf(listJson: unknown): string | null {
  const entry = entriesOf(listJson)[0]
  return typeof entry?.installPath === 'string' ? entry.installPath : null
}

/** Ein Eintrag von codecycle in `claude plugin list --json`; je Bereich (`user`, `project`, `local`) einer, `local`/`project` mit `projectPath`. */
export type Entry = { id?: string; scope?: string; projectPath?: string; installPath?: string; version?: string }

/** Alle Einträge von codecycle, in der Reihenfolge der Liste. */
export function entriesOf(listJson: unknown): Entry[] {
  const installed = Array.isArray(listJson) ? (listJson as Entry[]) : (listJson as { installed?: Entry[] } | null)?.installed
  return Array.isArray(installed) ? installed.filter(p => p.id === PLUGIN_ID) : []
}

const SCOPE_RANK: Record<string, number> = { local: 0, project: 1 }
/**
 * Der Eintrag, der für den Arbeitsordner gilt: `local` oder `project`, dessen `projectPath` der Ordner oder ein Oberordner
 * ist (der längste gewinnt, so hat ein Worktree im Projekt seinen eigenen; `local` vor `project`), sonst `user`, sonst der
 * erste (Liste ohne Bereiche). Unbestätigt: ob Claude Code `projectPath` genauso zuordnet.
 */
export function entryFor(listJson: unknown, cwd: string): Entry | null {
  const entries = entriesOf(listJson)
  const here = norm(cwd)
  const matching = entries
    .filter(e => e.scope !== undefined && e.scope in SCOPE_RANK && typeof e.projectPath === 'string')
    .filter(e => here === norm(e.projectPath!) || here.startsWith(`${norm(e.projectPath!)}/`))
    .sort((a, b) => norm(b.projectPath!).length - norm(a.projectPath!).length || SCOPE_RANK[a.scope!]! - SCOPE_RANK[b.scope!]!)
  return matching[0] ?? entries.find(e => e.scope === 'user') ?? entries[0] ?? null
}

const norm = (p: string): string => resolve(p).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
/** Aus dem Cache von Claude Code geladen? Sonst `--plugin-dir` (Entwicklungsstand): nichts aktualisieren. */
export const fromCache = (root: string): boolean => norm(root).includes('/.claude/plugins/cache/')

function finish(ctx: Ctx, r: UpdateResult): number {
  ctx.out(`${RESULT_PREFIX}${JSON.stringify(r)}`)
  return r.status === 'kaputt' ? 2 : r.status === 'entscheidung' ? 3 : 0
}

export function update(args: string[], ctx: Ctx, run: Runner = defaultRunner): number {
  let toolOnly = false
  let before: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--nur-werkzeug') toolOnly = true
    else if (a === '--plugin-vorher') {
      before = args[++i] ?? null
      if (before === null) throw new ToolBroken('--plugin-vorher braucht eine Version')
    } else throw new ToolBroken(`unbekannte Option ${a}`)
  }
  const toolDir = pluginToolDir()
  if (toolDir === null) throw new ToolBroken('update läuft nur aus dem Plugin: node <plugin>/tool/cli.ts update')
  const pluginRoot = dirname(toolDir)
  const own = pluginVersionOf(pluginRoot)
  const plugin: UpdateResult['plugin'] = { vorher: before ?? own, nachher: own, aktualisiert: before !== null && before !== own }
  if (!toolOnly) {
    const delegated = updatePlugin(ctx, run, pluginRoot, plugin)
    if (delegated !== null) return delegated
  } else if (before !== null && bridgeMissingIn(before)) bridgeAfterDelegation(ctx, run, pluginRoot)
  return partB(ctx, run, plugin, before !== null)
}

/** Erste Plugin-Version, deren Teil A die Brücke und das Update der Abhängigkeiten selbst ausführt. */
export const BRIDGE_SINCE = '0.25.0'

/**
 * Fehlte der abgebenden Version (`--plugin-vorher`) die Brücke? Dann holt die neue sie nach. Ab `BRIDGE_SINCE` hat Teil A
 * sie schon ausgeführt, ein zweiter Lauf entfällt. Nicht vergleichbare Versionen gelten als ohne Brücke (der Aufruf ist harmlos).
 */
export function bridgeMissingIn(before: string): boolean {
  const cmp = versionsLib.compareVersions(before, BRIDGE_SINCE)
  return cmp === null || cmp < 0
}

/** Bereiche, die das Update anhebt: der Eintrag dieses Ordners, dazu `user`, falls vorhanden; Liste ohne Bereiche: ohne `--scope`. */
export function scopesFor(listJson: unknown, cwd: string): Array<string | undefined> {
  const own = entryFor(listJson, cwd)
  return own?.scope === undefined ? [undefined] : [...new Set([own.scope, ...(entriesOf(listJson).some(e => e.scope === 'user') ? ['user'] : [])])]
}

/**
 * Brücke, wenn eine ältere Version das Plugin aktualisiert hat und Teil B hierher abgibt (`--nur-werkzeug --plugin-vorher`):
 * Die ältere Version kennt die Abhängigkeiten der neuen nicht und holt sie darum nicht nach; ohne sie lädt codecycle nach
 * dem Neuladen nicht. Je Bereich wie im Update `installDependencies` und `updateDependencies`. Nur aus dem Cache.
 */
export function bridgeAfterDelegation(ctx: Ctx, run: Runner, pluginRoot: string): void {
  if (!fromCache(pluginRoot)) return
  const listed = lastJson(run(['claude', 'plugin', 'list', '--json'], ctx.cwd).stdout)
  for (const scope of scopesFor(listed, ctx.cwd)) {
    const here = { ...ctx, cwd: scopeCwd(listed, ctx.cwd, scope) }
    installDependencies(here, run, scope)
    updateDependencies(here, run, scope)
  }
}

/**
 * Arbeitsordner für einen Aufruf mit `--scope local|project`: der `projectPath` des Eintrags dieses Ordners, damit der
 * Eintrag im richtigen Projekt landet, auch wenn das Update aus einem Unterordner läuft (wie Claude Code das Projekt für
 * `--scope` bestimmt, ist nicht dokumentiert). Sonst der Arbeitsordner.
 */
export function scopeCwd(listJson: unknown, cwd: string, scope: string | undefined): string {
  if (scope !== 'local' && scope !== 'project') return cwd
  const own = entryFor(listJson, cwd)
  return own?.scope === scope && typeof own.projectPath === 'string' ? own.projectPath : cwd
}

/** Teil A. Gibt den Exit-Code zurück, wenn die neue Version Teil B übernommen hat, sonst null (Teil B hier). */
export function updatePlugin(ctx: Ctx, run: Runner, pluginRoot: string, plugin: UpdateResult['plugin']): number | null {
  if (!fromCache(pluginRoot)) {
    plugin.hinweis = 'Entwicklungsstand (--plugin-dir): Plugin nicht aktualisiert'
    ctx.out(`Plugin ${plugin.vorher}: ${plugin.hinweis}`)
    return null
  }
  const list = (): unknown => lastJson(run(['claude', 'plugin', 'list', '--json'], ctx.cwd).stdout)
  const market = run(['claude', 'plugin', 'marketplace', 'update', MARKETPLACE], ctx.cwd)
  let upd = market
  if (market.code === 0) {
    // Ohne --scope hebt `claude plugin update` nur einen Eintrag an: erst den dieses Ordners, dann den für alle Projekte (user)
    const before = list()
    for (const [i, scope] of scopesFor(before, ctx.cwd).entries()) {
      const here = { ...ctx, cwd: scopeCwd(before, ctx.cwd, scope) }
      const r = run(['claude', 'plugin', 'update', PLUGIN_ID, ...(scope ? ['--scope', scope] : []), '--json'], here.cwd)
      if (i === 0) upd = r
      // Scheitert nur der zusätzliche Bereich, gilt der Eintrag dieses Ordners trotzdem: Hinweis, weiter
      else if (r.code !== 0) ctx.out(`Plugin-Update für ${scope} nicht möglich (${lastLine(r.stderr) || lastLine(r.stdout) || `Exit ${r.code}`}); Update über /plugin`)
      if (upd.code !== 0) break
      if (r.code === 0) {
        installDependencies(here, run, scope)
        updateDependencies(here, run, scope)
      }
    }
  }
  if (upd.code !== 0) {
    const why = upd.missing ? '`claude` nicht gefunden' : (lastLine(upd.stderr) || lastLine(upd.stdout) || `Exit ${upd.code}`)
    plugin.hinweis = `Plugin-Update nicht möglich (${why}); Update über /plugin`
    ctx.out(`Plugin ${plugin.vorher}: ${plugin.hinweis}`)
    return null
  }
  const after = list()
  const versions = entriesOf(after).map(e => `${e.scope === 'user' || e.scope === undefined ? (e.scope ?? '?') : `${e.scope} ${basename(e.projectPath ?? '?')}`} ${e.version ?? '?'}`)
  if (new Set(entriesOf(after).map(e => e.version)).size > 1) ctx.out(`Installationen mit verschiedenen Versionen: ${versions.join(', ')}`)
  const path = entryFor(after, ctx.cwd)?.installPath ?? null
  if (path === null || norm(path) === norm(pluginRoot) || !existsSync(join(path, 'tool', 'cli.ts'))) {
    ctx.out(`Plugin ${plugin.vorher}: aktuell`)
    return null
  }
  const found = pluginVersionOf(path)
  const cmp = versionsLib.compareVersions(found, plugin.vorher)
  if (cmp !== 1) {
    // Gleich, älter oder nicht vergleichbar: nie als Update melden, Teil B mit dem laufenden Werkzeug
    ctx.out(
      cmp === 0
        ? `Plugin ${plugin.vorher}: aktuell`
        : cmp === null
          ? `Plugin ${plugin.vorher}: Version für diesen Ordner nicht vergleichbar (${found}), nicht gewechselt; /plugin zeigt die Einträge`
          : `Plugin ${plugin.vorher}: für diesen Ordner ist ${found} installiert, nicht zurückgestuft; /plugin zeigt die Einträge`,
    )
    return null
  }
  // Neue Version auf der Platte (gerade geholt oder schon im Hintergrund): ihr Werkzeug macht Teil B
  ctx.out(`Plugin ${plugin.vorher} → ${found} (gilt ab jetzt für alle Projekte auf diesem Rechner)`)
  const child = run(['node', join(path, 'tool', 'cli.ts'), 'update', '--nur-werkzeug', '--plugin-vorher', plugin.vorher], ctx.cwd)
  for (const line of child.stdout.replace(/\r?\n$/, '').split(/\r?\n/)) if (line !== '') ctx.out(line)
  return child.code
}

const lastLine = (s: string): string => s.trim().split(/\r?\n/).at(-1)?.trim() ?? ''

/**
 * Brücke für Abhängigkeiten: `claude plugin update` installiert eine neu hinzugekommene Abhängigkeit nicht mit, ohne sie
 * lädt codecycle nicht. `claude plugin install` auf das schon installierte Plugin holt sie nach, im selben Bereich wie das
 * Update. Scheitert es, nur ein Hinweis mit dem Befehl von Hand; das Update gilt trotzdem.
 * Unbestätigt: welchen Exit-Code `install` bei „already installed“ liefert; diese Meldung zählt darum nicht als Fehler.
 */
export function installDependencies(ctx: Ctx, run: Runner, scope: string | undefined): void {
  const r = run(['claude', 'plugin', 'install', PLUGIN_ID, ...(scope ? ['--scope', scope] : [])], ctx.cwd)
  const text = `${r.stdout}\n${r.stderr}`
  if (r.code === 0 || /already installed/i.test(text)) {
    const added = text.split(/\r?\n/).find(l => /dependenc/i.test(l))
    if (added) ctx.out(`Abhängigkeiten${scope ? ` (${scope})` : ''}: ${added.trim()}`)
    return
  }
  const why = r.missing ? '`claude` nicht gefunden' : lastLine(r.stderr) || lastLine(r.stdout) || `Exit ${r.code}`
  ctx.out(`Abhängigkeiten${scope ? ` für ${scope}` : ''} nicht nachgeholt (${why}); einmal von Hand: claude plugin install ${DEPENDENCIES.join(' ')}`)
}

/**
 * Abhängigkeiten aktualisieren: `claude plugin update <id>` je Abhängigkeit im selben Bereich, nach der Brücke (eine gerade
 * nachinstallierte Abhängigkeit ist schon aktuell). Meldet eine Zeile mit „updated from“; scheitert es, nur ein Hinweis, das
 * Update von codecycle gilt trotzdem. Unbestätigt: ob eine Abhängigkeit immer im selben Bereich wie codecycle installiert ist.
 */
export function updateDependencies(ctx: Ctx, run: Runner, scope: string | undefined): void {
  for (const id of DEPENDENCIES) {
    const r = run(['claude', 'plugin', 'update', id, ...(scope ? ['--scope', scope] : [])], ctx.cwd)
    if (r.code === 0) {
      const line = lastLine(r.stdout)
      if (/updated from/i.test(line)) ctx.out(`${id}${scope ? ` (${scope})` : ''}: ${line}`)
      continue
    }
    const why = r.missing ? '`claude` nicht gefunden' : lastLine(r.stderr) || lastLine(r.stdout) || `Exit ${r.code}`
    ctx.out(`${id}${scope ? ` für ${scope}` : ''} nicht aktualisiert (${why}); Update über /plugin`)
  }
}

/** Teil B: Werkzeug-Kopie, Hooks, guard-Grundlage, Selbsttest. */
function partB(ctx: Ctx, run: Runner, plugin: UpdateResult['plugin'], reload: boolean): number {
  const result: UpdateResult = { status: 'aktuell', plugin, kopie: { vorher: null, nachher: null }, neuLaden: reload }
  if (plugin.aktualisiert) result.status = 'aktualisiert'
  let root: string
  try {
    root = findProjectRoot(ctx.cwd)
  } catch {
    ctx.out('Kein Git-Projekt: Werkzeug-Kopie entfällt.')
    return finish(ctx, result)
  }
  if (!existsSync(join(root, CODECYCLE_MD))) {
    ctx.out('Projekt nicht eingerichtet: /codecycle:setup (nichts angelegt)')
    return finish(ctx, { ...result, status: plugin.aktualisiert ? 'aktualisiert' : 'nicht-eingerichtet' })
  }
  const copy = readCopyInfo(root)
  result.kopie.vorher = copy?.version ?? null
  result.kopie.nachher = copy?.version ?? null
  const cmp = copy ? versionsLib.compareVersions(copy.version, TOOL_VERSION) : null
  if (cmp === 1) {
    ctx.out(`Werkzeug-Kopie ${copy!.version} ist neuer als das Plugin (${TOOL_VERSION}): nicht zurückgestuft. Ein anderes Gerät hat eine neuere Version, die der Marketplace noch nicht liefert.`)
    return finish(ctx, { ...result, status: 'entscheidung' })
  }
  if (!existsSync(join(root, CONFIG_PATH))) {
    ctx.out(`${CONFIG_PATH} fehlt (frisch geklont?): Vorlage prüfen und .codecycle/ ausschließen, das macht /codecycle:update mit KI.`)
    return finish(ctx, { ...result, status: 'entscheidung' })
  }
  if (cmp === 0) {
    ctx.out(`Werkzeug-Kopie ${copy!.version}: aktuell`)
    if (!plugin.aktualisiert) ctx.out(`alles aktuell (Plugin ${plugin.nachher}, Werkzeug ${TOOL_VERSION})`)
    return finish(ctx, result)
  }
  // Kopie veraltet, fehlt oder ohne Vermerk
  const lines: string[] = []
  const code = installTool(['--update-config'], { cwd: root, out: l => lines.push(l) })
  if (code !== 0) {
    lines.forEach(l => ctx.out(l))
    return finish(ctx, { ...result, status: 'kaputt' })
  }
  lines.filter(l => /Werkzeug-Kopie|ergänzt|version/i.test(l)).forEach(l => ctx.out(l))
  result.kopie.nachher = readCopyInfo(root)?.version ?? null
  result.status = 'aktualisiert'
  const cli = join(root, COPY_DIR, 'cli.ts')
  const step = (label: string, argv: string[]): Run => {
    const r = run(['node', cli, ...argv], root)
    ctx.out(`${label}: ${r.code === 0 ? 'ok' : `Exit ${r.code}`}`)
    return r
  }
  const hooks = step('Git-Hooks', ['hooks', 'install'])
  if (hooks.code === 2) return broken(ctx, result, hooks)
  if (hooks.code !== 0) {
    hooks.stdout.trim().split(/\r?\n/).forEach(l => ctx.out(`  ${l}`))
    return finish(ctx, { ...result, status: 'entscheidung' })
  }
  const guard = step('guard-Grundlage', ['guard', '--record'])
  if (guard.code === 2) return broken(ctx, result, guard)
  const count = guard.stdout.split(/\r?\n/).find(l => /^guard: (Testzahl|.*nicht erfassbar)/.test(l))
  if (count) ctx.out(`  ${count.trim()}`)
  const self = run(['node', cli, 'selftest'], root)
  if (self.code === 2) return broken(ctx, result, self)
  const marks = self.stdout.split(/\r?\n/).filter(l => /^[!✘] /.test(l))
  ctx.out(`Selbsttest: ${marks.length === 0 ? 'ok' : `${marks.length} Hinweis(e)`}`)
  marks.forEach(l => ctx.out(`  ${l.trim()}`))
  return finish(ctx, result)
}

function broken(ctx: Ctx, result: UpdateResult, r: Run): number {
  ;`${r.stdout}${r.stderr}`.trim().split(/\r?\n/).slice(-5).forEach(l => ctx.out(`  ${l}`))
  return finish(ctx, { ...result, status: 'kaputt' })
}
