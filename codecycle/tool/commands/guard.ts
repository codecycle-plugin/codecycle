import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { mainBranch } from '../git-hints.ts'
import { countTests, storedCounts } from '../guard-count.ts'
import { type Records, changedHidden, hiddenControl, loadRecords, refreshControl, saveRecords, workKey } from '../guard-records.ts'
import { guardRules, pathsLib, protectedLib } from '../lib-path.ts'
import type { Ctx } from '../main.ts'
import { TMP_DIR, findProjectRoot, findWorkTree, tryLoadConfig } from '../project.ts'

const { GIT_QUIET } = pathsLib

type Options = { base?: string; record: boolean; noTests: boolean }

function parseArgs(args: string[]): Options {
  const o: Options = { record: false, noTests: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    const value = (): string => {
      const v = args[++i]
      if (v === undefined || v.startsWith('--')) throw new ToolBroken(`${a} braucht einen Wert`)
      return v
    }
    if (a === '--base') o.base = value()
    else if (a === '--record') o.record = true
    else if (a === '--no-tests') o.noTests = true
    else throw new ToolBroken(`unbekannte Option ${a} (Aufruf: codecycle guard [--base <ref>] [--record] [--no-tests])`)
  }
  return o
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).filter(l => l !== '')
}

/**
 * Alle Dateien, die der Arbeitsordner gegenüber der Basis berührt: Commits, Arbeitsbaum und neue Dateien; Umbenennungen mit
 * altem und neuem Namen. Ignorierte Kontrolldateien zählen nur, wenn sie sich seit der Grundlage dieses Arbeitsordners
 * (`guard --record`, `install-tool`, `hooks install`, `exclude`) geändert haben (vorher zählte jede vorhandene ignorierte Datei, im Hauptordner also immer rot).
 * `hiddenUnchecked`: Zahl ignorierter Kontrolldateien ohne Grundlage. Fail-closed: `guard`
 * meldet sie rot, weil ohne Grundlage niemand sagen kann, ob sie unverändert sind. In Worktrees liegen keine
 * ignorierten Kontrolldateien (sie sind nicht versioniert), dort bleibt die Zahl 0.
 */
function touchedFiles(work: string, mergeBase: string, records: Records): { files: string[]; hiddenUnchecked: number } {
  const tracked = lines(git([...GIT_QUIET, 'diff', '--name-only', '--no-renames', mergeBase], work).out)
  const untracked = lines(git([...GIT_QUIET, 'ls-files', '--others', '--exclude-standard'], work).out)
  const now = hiddenControl(work)
  const base = records.control[workKey(work)]
  const hidden = base ? changedHidden(now, base.files) : []
  const files = [...new Set([...tracked, ...untracked, ...hidden])].filter(f => !f.startsWith(`${TMP_DIR}/`))
  return { files, hiddenUnchecked: base ? 0 : Object.keys(now).length }
}

/**
 * `guard [--base <ref>]`: mechanischer Schutz, immer an.
 * Prüft den Diff gegen die Basis (Standard: Hauptbranch):
 *  - Kontrolldateien berührt → rot (Exit 1);
 *  - Abhängigkeitsdateien berührt → Hinweis „toolsmith nötig“;
 *  - Testzahl: `--record` merkt die Zahlen vor dem Bau (im Hauptordner .codecycle/tmp/guard-records.json, mit Commit;
 *    gilt der Eintrag des nächstgelegenen Vorfahren von HEAD, also auch der eines entfernten Worktrees), danach
 *    vergleicht `guard` (Tests laufen, Zahl sinkt nicht, übersprungene steigen nicht); `--no-tests` überspringt das.
 *  - Ignorierte Kontrolldateien: `--record` (und `install-tool`, `hooks install`, `exclude`) merkt ihre Prüfsummen
 *    (Arbeitsordner und Hauptordner, tool/guard-records.ts); nur Abweichungen davon zählen als geändert; liegen ignorierte Kontrolldateien ohne (gültige) Grundlage vor, ist das
 *    das Ergebnis rot (fail-closed).
 * Die Testzahl braucht `junit` in der Werkzeug-Konfiguration; sonst ein Hinweis, kein Fehler.
 * Exit 0 grün (auch mit Hinweisen), 1 rot, 2 Aufruf oder Werkzeug kaputt.
 */
export function guard(args: string[], ctx: Ctx): number {
  const o = parseArgs(args)
  const root = findProjectRoot(ctx.cwd)
  const work = findWorkTree(ctx.cwd)
  const config = tryLoadConfig(root)

  if (o.record) {
    if (!config) throw new ToolBroken('.codecycle/tool.config.json fehlt oder ist fehlerhaft (Einrichtung: /codecycle:setup)')
    // Grundlage der ignorierten Kontrolldateien: dieser Arbeitsordner und der Hauptordner (dort läuft guard nach dem Merge)
    const records = refreshControl(root, [work, root])
    const r = countTests(work, config)
    if (r.code === 2) {
      r.lines.forEach(l => ctx.out(l))
      return 2
    }
    if (!r.counts) {
      ctx.out(`guard: ${r.note ?? 'Testzahl nicht erfassbar'}`)
      return 0
    }
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], work).out
    const head = git(['rev-parse', 'HEAD'], work).out
    records.counts = [...records.counts, { branch, head, work: workKey(work), ...r.counts, recordedAt: new Date().toISOString() }]
    saveRecords(root, records)
    ctx.out(`guard: Testzahl festgehalten (${r.counts.total} Tests, ${r.counts.skipped} übersprungen)${r.code === 0 ? '' : ', Tests derzeit rot'}`)
    return 0
  }

  const base = o.base ?? mainBranch(root, config ?? undefined)
  const mb = git(['merge-base', 'HEAD', base], work)
  if (!mb.ok || mb.out === '') throw new ToolBroken(`Basis ${base} nicht gefunden (guard --base <ref>)`)
  const records = loadRecords(root)
  const { files, hiddenUnchecked } = touchedFiles(work, mb.out, records)
  const kinds = protectedLib.classifyAll(files, config as unknown as import("../../lib/protected.ts").ProtectedConfig | null)

  const red: string[] = []
  const notes: string[] = []
  if (kinds.control.length > 0) {
    red.push('guard rot: Kontrolldateien geändert', ...kinds.control.map(f => `  - ${f}`))
    red.push('  Änderungen daran nur über codecycle:toolsmith mit Freigabe des Nutzers.')
  }
  if (hiddenUnchecked > 0) {
    red.push(`guard rot: keine Grundlage für ignorierte Kontrolldateien (${hiddenUnchecked} Dateien); vor dem Bau bzw. nach der Einrichtung: codecycle guard --record`)
  }
  if (kinds.dependency.length > 0) {
    notes.push('Hinweis: Abhängigkeitsdateien geändert, toolsmith nötig:', ...kinds.dependency.map(f => `  - ${f}`))
  }

  if (!o.noTests) {
    const stored = storedCounts(work, records)
    if (!stored) {
      notes.push('Hinweis: Testzahl nicht geprüft (keine festgehaltenen Zahlen; vor dem Bau: codecycle guard --record)')
    } else if (!config) {
      notes.push('Hinweis: Testzahl nicht geprüft (.codecycle/tool.config.json fehlt oder ist fehlerhaft)')
    } else {
      const r = countTests(work, config)
      if (r.code === 2) {
        r.lines.forEach(l => ctx.out(l))
        return 2
      }
      if (!r.counts) notes.push(`Hinweis: ${r.note ?? 'Testzahl nicht erfassbar'}`)
      else {
        const problems = guardRules.checkTestCounts(stored, r.counts)
        if (problems.length > 0) red.push('guard rot: Testzahl-Regel verletzt', ...problems.map(p => `  - ${p}`))
        else notes.push(`Testzahl: ${r.counts.total} Tests, ${r.counts.skipped} übersprungen (vorher ${stored.total}/${stored.skipped})`)
      }
    }
  }

  ctx.out(red.length > 0 ? 'guard: rot' : `guard: grün (${files.length} Dateien im Diff gegen ${base})`)
  red.forEach(l => ctx.out(l))
  notes.forEach(l => ctx.out(l))
  return red.length > 0 ? 1 : 0
}
