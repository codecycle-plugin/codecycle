import { spawnSync } from 'node:child_process'

import { ToolBroken } from '../errors.ts'
import type { Ctx } from '../main.ts'
import { findWorkTree } from '../project.ts'
import { clearRedMark, indexTree, stagedFiles, writeRedMark } from '../red-tests.ts'
import { isTestPath } from '../graph/util.ts'

/** Schlusszeile jedes Commits von `commit-tests` */
export const TESTS_TRAILER = 'Codecycle-Tests: rot'

/**
 * `commit-tests -m <nachricht>`: committet gestagte Testdateien auch dann, wenn die Tests rot sind
 * (roter Test-Autor-Commit). Nur Testdateien erlaubt. Der Pre-Commit-Hook läuft normal (kein
 * `--no-verify`); die einmalige Markierung erlaubt ihm nur für genau diesen Index das Ergebnis „rot“.
 * Die Nachricht bekommt die Zeile `${TESTS_TRAILER}`; daran findet `paket pruefen` die Tests des Test-Autors.
 */
export function commitTests(args: string[], ctx: Ctx): number {
  let message: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '-m' || a === '--message') {
      message = args[++i] ?? null
      if (message === null || message.trim() === '') throw new ToolBroken('-m braucht eine Nachricht')
    } else throw new ToolBroken(`unbekannte Option ${a} (Aufruf: codecycle commit-tests -m <nachricht>)`)
  }
  if (message === null) throw new ToolBroken('Aufruf: codecycle commit-tests -m <nachricht>')
  const work = findWorkTree(ctx.cwd)
  const files = stagedFiles(work)
  if (files.length === 0) {
    ctx.out('commit-tests: nichts gestagt (erst `git add` auf die Testdateien)')
    return 1
  }
  const others = files.filter(f => !isTestPath(f))
  if (others.length > 0) {
    ctx.out('commit-tests: nur Testdateien erlaubt, gestagt sind auch:')
    others.forEach(f => ctx.out(`  ${f}`))
    ctx.out('Diese Dateien aus dem Index nehmen (`git restore --staged <datei>`) oder normal committen.')
    return 1
  }
  const tree = indexTree(work)
  if (tree === null) throw new ToolBroken('git write-tree fehlgeschlagen (ungelöste Konflikte im Index?)')
  try {
    writeRedMark(work, tree)
    const r = spawnSync('git', ['commit', '-m', message, '-m', TESTS_TRAILER], { cwd: work, encoding: 'utf8', windowsHide: true })
    if (r.error) throw new ToolBroken(`git commit nicht ausführbar: ${String(r.error)}`)
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd()
    if (text !== '') text.split(/\r?\n/).forEach(l => ctx.out(l))
    // git meldet bei jedem Hook-Abbruch Exit 1; die 2 (Werkzeug kaputt) steht nur in der Hook-Meldung
    if (r.status === 0) return 0
    return /codecycle: Werkzeug kaputt \(Exit 2\)/.test(text) ? 2 : 1
  } finally {
    clearRedMark(work)
  }
}
