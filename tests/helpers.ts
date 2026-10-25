// Gemeinsame Attrappen und Hilfen der Mod-Tests (plugin/tests/*.test.ts); selbst kein Test.
// Dateisystem, Prozesse und Sitzung stehen als Attrappen unter dem Mod (fakeWorld, memStore).
// Prüfstand-Fallen: jede Attrappe nur einmal anmelden, absolute Pfade des Betriebssystems.
// Jede Testdatei läuft in einem eigenen Prozess; der Zustand hier (LOGS, WRITES, TOOLS, TOASTS, CLOCK, SESSION_ID, FIVE)
// gehört daher je Datei einem Lauf und wird von fakeWorld zu Beginn jedes Tests zurückgesetzt.

import { mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

export const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

export const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 8,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 8 },
    view: {},
  },
} as const

const PROFILES_JSON = JSON.stringify({
  profiles: {
    sparsam: { builder: 'sonnet', 'final-reviewer': 'opus', 'part-reviewer': 'opus', 'plan-reviewer': 'opus', setup: 'sonnet', toolsmith: 'sonnet' },
    grosszuegig: { builder: 'opus', 'final-reviewer': 'opus', 'part-reviewer': 'opus', 'plan-reviewer': 'opus', setup: 'sonnet', toolsmith: 'sonnet' },
    extrem: { builder: 'opus', 'final-reviewer': 'opus', 'part-reviewer': 'opus', 'plan-reviewer': 'opus', setup: 'sonnet', toolsmith: 'sonnet' },
  },
})

export const DIR = 'docs/codecycle/aufgabe-t'

export const STATE = `---
aufgabe: aufgabe-t
art: feature
groesse: gross
zustand: in-arbeit
branch: codecycle/t
budget: { geplant: 5, verbraucht: 1 }
zuletzt: tag-1
---

## Nächster Schritt
P1.
`

const GROUP_PHP = `<?php
namespace App;

class Group
{
    public function remove(int $id): void
    {
        $this->items = [];
    }
}
`

export const FILES: Record<string, string> = {
  [`${DIR}/TASK.md`]: '# T\n\n## Abnahmekriterien\n\n| ID | Kriterium | Prüfweg |\n|---|---|---|\n| K1 | Mitglied sieht Liste | Test |\n',
  [`${DIR}/STATE.md`]: STATE,
  'src/Group.php': GROUP_PHP,
  'tests/GroupTest.php': '<?php\nclass GroupTest {}\n',
  '.claude/codecycle.md': '# Projekt\n\n## Konventionen\n- PHP: strict_types\n- Tests: PHPUnit\n\n## Schalter\n- fence: an\n',
  'profiles.json': PROFILES_JSON,
}

export type Engine = Parameters<TestBody>[0]

/** Ein Agent-Aufruf der Hauptsitzung, wie ihn `agent.spawn` sieht. */
export function spawn($: Engine, prompt: string, subagentType: string, cwd?: string) {
  return $.agent.spawn({
    ...(cwd ? { cwd } : {}),
    tool_use_id: 'tu',
    prompt,
    description: 'Test',
    subagentType,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-sonnet-5-5',
    background: false,
    fork: false,
  } as never)
}

export const LOGS: string[] = []

/** Jeder Schreibvorgang des Mods im laufenden Test (Pfad relativ zum Projekt). */
export const WRITES: string[] = []

/** Namen der Werkzeuge, die der Mod im laufenden Test angemeldet hat. */
export const TOOLS: string[] = []

/** Meldungen (Toasts) des Mods im laufenden Test. */
export const TOASTS: string[] = []

export type Ops = Parameters<typeof mock.store>[0]

/** Uhr der Attrappe im laufenden Test (Cache-Restzeit, Arbeitszeit) */
export const CLOCK: { current: ReturnType<typeof mock.clock> | null } = { current: null }

/** Sitzungs-ID, die die Attrappe `session.id` meldet (Tests der Profil-Sperre setzen sie) */
export const SESSION_ID = { current: 'test-sitzung' }

/** Stand des 5-Stunden-Fensters, den die Attrappe `session.usage` meldet (fakeWorld setzt 42). */
export const FIVE = { percent: 42, fail: false, none: false }

/** Dateisystem und Sitzung im Speicher unter dem Mod; liefert, was der Mod geschrieben hat. */
export function fakeWorld(
  on: Ops,
  files: Record<string, string>,
  /** `strict` = nur Pfade unter /proj zählen (relative Pfade löst der Prüfstand gegen einen anderen Ordner auf: `AUSSEN:`) */
  opts: { sessionRoot?: string; repoRoot?: string | null; strict?: boolean } = {},
): Record<string, string> {
  const written: Record<string, string> = {}
  // Der Prüfstand reicht absolute Pfade des Betriebssystems durch (unter Windows mit `\`); die Attrappe rechnet sie
  // auf Pfade relativ zum Projekt mit `/` um, wie sie in `files` stehen (`process` gibt es im Prüfstand nicht,
  // deshalb über die bekannten Projektordner).
  const rel = (path: string): string => {
    const p = path.replace(/\\/g, '/')
    // unter Windows macht der Prüfstand aus `/proj/x` `C:\proj\x`
    if (opts.strict) return /^([A-Za-z]:)?\/proj\//.test(p) ? p.replace(/^([A-Za-z]:)?\/proj\//, '') : `AUSSEN:${p}`
    // Projektpfade (`/proj/…`): ab der ersten Marke (`src/tests/a.ts` bleibt ganz). Andere Pfade, etwa Dateien des
    // Plugins: ab der letzten Marke, sonst schnitte ein Plugin unter `…/.claude/worktrees/…` beim ersten `/.claude/` ab
    const inProj = /^([A-Za-z]:)?\/proj\//.test(p)
    const at = ['docs', '.claude', '.codecycle', 'src', 'tests', 'agents']
      .map(a => (inProj ? p.indexOf(`/${a}/`) : p.lastIndexOf(`/${a}/`)))
      .filter(i => i >= 0)
    return at.length ? p.slice((inProj ? Math.min(...at) : Math.max(...at)) + 1) : p
  }
  const find = (abs: string): string | undefined => {
    const path = rel(abs)
    const hit = written[path] ?? files[path]
    if (hit !== undefined) return hit
    return path.endsWith('profiles.json') ? files['profiles.json'] : undefined
  }
  on('fs.exists', (_$, e) => ({
    value: find(e.path) !== undefined || Object.keys({ ...files, ...written }).some(k => k.startsWith(`${rel(e.path)}/`)),
  }))
  on('fs.read', (_$, e) => ({ value: find(e.path) ?? '' }))
  WRITES.length = 0
  on('fs.write', (_$, e) => {
    written[rel(e.path)] = e.text
    WRITES.push(rel(e.path))
    return { value: undefined }
  })
  // Aufgabenordner unter docs/codecycle/: aufgabe-t immer, dazu jeder Ordner mit Dateien in `files` oder geschriebenen
  on('fs.list', (_$, e) => {
    if (rel(e.path) !== 'docs/codecycle') return { value: [] }
    const names = new Set(['aufgabe-t'])
    for (const k of Object.keys({ ...files, ...written })) {
      const m = k.match(/^docs\/codecycle\/([^/]+)\//)
      if (m) names.add(m[1]!)
    }
    return { value: [...names].map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) }
  })
  FIVE.percent = 42
  FIVE.fail = false
  FIVE.none = false
  on('session.usage', () => {
    if (FIVE.fail) throw new Error('Limit nicht lesbar')
    return { value: { startedAt: 0, context: { window: 200000 }, rateLimits: FIVE.none ? [] : [{ kind: 'five_hour', percentUsed: FIVE.percent, resetsAt: '2026-10-08T18:00:00Z' }] } }
  })
  on('ui.log', (_$, e) => {
    LOGS.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  TOASTS.length = 0
  on('ui.toast', (_$, e) => {
    TOASTS.push(e.text)
    return { value: undefined }
  })
  CLOCK.current = mock.clock(on, { now: Date.UTC(2026, 9, 8, 12) })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.root', () => ({ value: opts.sessionRoot ?? '/proj' }))
  // Git-Hauptordner (null = kein Repo)
  on('session.repo', () => {
    const root = opts.repoRoot === undefined ? '/proj' : opts.repoRoot
    return { value: root === null ? null : { root, remote: null, internal: false, name: null } }
  })
  SESSION_ID.current = 'test-sitzung'
  on('session.id', () => ({ value: SESSION_ID.current }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  TOOLS.length = 0
  on('tool.register', (_$, e) => {
    TOOLS.push(e.name)
    return { value: { tool: e.name } }
  })
  return written
}

/** Store im Speicher wie mock.store, aber lesbar: der Test sieht, was der Mod ablegt. */
export function memStore(on: Ops, seed: Record<string, unknown> = {}): Record<string, unknown> {
  const mem: Record<string, unknown> = { ...seed }
  on('store.get', (_$, e) => ({ value: mem[e.key] }))
  on('store.set', (_$, e) => {
    mem[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete mem[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(mem) }))
  return mem
}

