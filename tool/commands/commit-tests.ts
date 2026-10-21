import { spawnSync } from 'node:child_process'

import { ToolBroken } from '../errors.ts'
import { git } from '../exec.ts'
import { mainBranch } from '../git-hints.ts'
import type { Ctx } from '../main.ts'
import { findProjectRoot, findWorkTree, tryLoadConfig } from '../project.ts'
import { clearRedMark, indexTree, stagedFiles, writeRedMark } from '../red-tests.ts'
import { isTestPath } from '../graph/util.ts'

/** Schlusszeile jedes Commits von `commit-tests` */
export const TESTS_TRAILER = 'Codecycle-Tests: rot'

const USAGE = 'Aufruf: codecycle commit-tests -m <nachricht> [--ohne-paket]'
/** Paket-Branch des vollen Ablaufs (`<aufgaben-branch>--P<n>`, `paket start`) */
const PACKAGE_BRANCH = /--P\d+$/

/**
 * `commit-tests -m <nachricht>`: committet gestagte Testdateien auch dann, wenn die Tests rot sind
 * (roter Test-Autor-Commit). Nur Testdateien erlaubt. Der Pre-Commit-Hook läuft normal (kein
 * `--no-verify`); die einmalige Markierung erlaubt ihm nur für genau diesen Index das Ergebnis „rot“.
 * Die Nachricht bekommt die Zeile `${TESTS_TRAILER}`; daran findet `paket pruefen` die Tests des Test-Autors.
 * Nur auf einem Paket-Branch; sonst nur mit `--ohne-paket` (Reproduktionstest des Debuggers; der Mod verweigert die
 * Option dem Test-Autor), auf dem Hauptbranch nie: rote Tests dort machen `check`, `guard` und andere Pakete rot.
 */
export function commitTests(args: string[], ctx: Ctx): number {
  let message: string | null = null
  let outsidePackage = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '-m' || a === '--message') {
      message = args[++i] ?? null
      if (message === null || message.trim() === '') throw new ToolBroken('-m braucht eine Nachricht')
    } else if (a === '--ohne-paket') outsidePackage = true
    else throw new ToolBroken(`unbekannte Option ${a} (${USAGE})`)
  }
  if (message === null) throw new ToolBroken(USAGE)
  const work = findWorkTree(ctx.cwd)
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], work).out
  const root = findProjectRoot(ctx.cwd)
  const main = mainBranch(root, tryLoadConfig(root) ?? undefined)
  if (branch === main) {
    ctx.out(`commit-tests: nie auf dem Hauptbranch ${main} (rote Tests machen ihn rot); im Paket-Worktree committen`)
    return 1
  }
  if (!PACKAGE_BRANCH.test(branch) && !outsidePackage) {
    ctx.out(`commit-tests: ${branch} ist kein Paket-Branch (<aufgabe>--P<n>); im Paket-Worktree committen`)
    ctx.out('  Reproduktionstest außerhalb eines Pakets (Debugger, Bauleiter im Notfall): --ohne-paket')
    return 1
  }
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
