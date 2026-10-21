// Token-Buch (costs.json), Agenten-Register (agents.json), Hauptsitzung, Projektordner = Git-Hauptordner, Limit-Kachel und Läufe.
// Token-Buch, Limit-Messung, Register und Weiterleitung, Projektordner. Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { BAND, DIR, STATE, FILES, spawn, WRITES, TOOLS, CLOCK, FIVE, fakeWorld, memStore, type Engine, type Ops } from './helpers'

describe('Token-Buch, Register, Hauptsitzung', () => {
  test('Token-Buch: jede Anfrage verbucht, Hauptsitzung getrennt', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 },
      }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    // Wie im Betrieb: der Sitzungsstart lädt die aktive Aufgabe, erst dann wird die Hauptsitzung verbucht.
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder-logic')
    for (const agentId of ['ag1', undefined]) {
      for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, ...(agentId ? { agentId } : {}) })) {
        void chunk
      }
    }
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })
    const costs = JSON.parse(written[`${DIR}/costs.json`]!)
    expect(costs.agenten.ag1.runden).toBe(1)
    expect(costs.agenten.ag1.cacheRead).toBe(80)
    expect(costs.hauptsitzung.runden).toBe(1)
    // Bauleiter (Hauptsitzung) mit eigenem Modell
    expect(costs.hauptsitzung.modell).toBe('sonnet')
    expect(costs.rollen['builder-logic'].input).toBe(10)
  })

  test('Erste Anfrage eines Agenten vor seinem Eintrag im Register: beim Agenten gebucht, nicht „fremd“', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    let release = (): void => undefined
    const gate = new Promise<void>(r => {
      release = r
    })
    on('turn.step', async function* (_$, e) {
      if (e.agentId === 'ag1') await gate
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: { model: 'sonnet', input_tokens: 2, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 900 },
      }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    // die Anfrage läuft schon, bevor agent.spawn den Agenten einträgt
    const step = (async () => {
      for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, agentId: 'ag1' })) void chunk
    })()
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder-logic')
    release()
    await step
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })
    const costs = JSON.parse(written[`${DIR}/costs.json`]!)
    expect(costs.agenten.ag1.runden).toBe(1)
    expect(costs.agenten.ag1.cacheWrite).toBe(900)
    expect(costs.fremd).toBeUndefined()
  })

  test('Agent ohne codecycle-Rolle: eigene Zeile „fremd“ im Token-Buch, nicht beim Bauleiter', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 },
      }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder-logic')
    for (const agentId of ['noop1', 'noop1', undefined]) {
      for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, ...(agentId ? { agentId } : {}) })) {
        void chunk
      }
    }
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
    const costs = JSON.parse(written[`${DIR}/costs.json`]!)
    expect(costs.fremd.runden).toBe(2)
    expect(costs.fremd.cacheRead).toBe(160)
    expect(costs.hauptsitzung.runden).toBe(1)
    expect(Object.keys(costs.agenten)).toEqual(['ag1'])
    expect(Object.keys(costs.rollen)).toEqual(['builder-logic'])
  })

  test('Urteil aus der Quittung landet im Register, ohne Quittung kein Feld', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `${DIR}/ Paket: alle`, 'codecycle:reviewer')
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder-logic')
    await $.turn.complete({ answer: 'Bericht geschrieben.\nQUITTUNG\nstatus: rot\npaket: alle\n', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'ag1', reason: 'answer' })
    await $.turn.complete({ answer: 'abgebrochen', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'ag2', reason: 'answer' })
    const reg = JSON.parse(written[`${DIR}/agents.json`]!)
    expect(reg.agenten.ag1.urteil).toBe('rot')
    expect(reg.agenten.ag2.urteil).toBeUndefined()
  })

  test('Bauleiter: Modell und Limit getrennt von den Agenten; Panel und Bautafel', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, { ...FILES, [`${DIR}/STATE.md`]: STATE.replace('budget: { geplant: 5, verbraucht: 1 }', 'budget: { geplant: 5, verbraucht: 1, nachlauf: 1 }') })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('turn.step', async function* (_$, e) {
      const model = e.agentId ? 'claude-sonnet-5-5' : 'claude-opus-5-5'
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model, input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 0 } }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const step = async (index: number, agentId?: string) => {
      for await (const chunk of $.turn.step({ turnId: 't', index, model: 'opus', messageCount: 1, ...(agentId ? { agentId } : {}) })) void chunk
    }
    await $.session.start({ cwd: '/proj', surface: null } as never)
    FIVE.percent = 10
    await step(0)
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder-logic')
    await step(0, 'ag1')
    FIVE.percent = 11
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'a', agentId: 'ag1', reason: 'answer' })
    FIVE.percent = 12
    await step(1)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
    const costs = JSON.parse(written[`${DIR}/costs.json`]!)
    expect(costs.hauptsitzung.modell).toBe('claude-opus-5-5')
    expect(costs.hauptsitzung.limitProzent).toBe(1)
    expect(costs.rollen['builder-logic'].limitProzent).toBe(1)

    const pane = await $.ui.mount({
      plugin: 'codecycle',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'codecycle-panel',
      props: { title: 'codecycle', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 120 }, view: {} },
    })
    // Entscheidung 2a: gewichtete Tokens zuerst (je Anfrage 10 + 5·5 + 80·0,1 = 43), Prozent zuletzt als Konto-Näherung
    expect(await pane.find({ type: 'Text', text: /^Agenten: 43 gew\. · neu 15 · Cache 80 · Konto ≈ 1,0 %$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^Bauleiter \(opus\): 43 gew\. · neu 15 · Cache 80 · Cache warm .* · Konto ≈ 1,0 %$/ })).toBeDefined()
    // Rollenzeile: gewichtete Tokens als Zahl, Prozent nachrangig
    expect(await pane.find({ type: 'Text', text: /gewichtete Tokens/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /neu 15 · Cache 80 · 1 Lauf · Konto ≈ 1,0 %/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /1\/5 Läufe · Nachlauf 1/ })).toBeDefined()
    await pane.unmount()
    // schmale Leiste: Prozent (Konto-Näherung) entfällt in den Summenzeilen, statt umzubrechen
    const narrow = await $.ui.mount({
      plugin: 'codecycle',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'codecycle-panel',
      props: { title: 'codecycle', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
    })
    expect(await narrow.find({ type: 'Text', text: /^Agenten: 43 gew\. · neu 15 · Cache 80$/ })).toBeDefined()
    expect(await narrow.find({ type: 'Text', text: /Konto/ })).toBeUndefined()
    await narrow.unmount()
    // Desktop-App: Kurzfassung „Agenten 43 gew.“, Summenzeilen hinter „+3 weitere“ mit Konto-Näherung
    const desk = await $.ui.mount({
      plugin: 'codecycle',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'codecycle-panel',
      props: { title: 'codecycle', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
    })
    expect(await desk.find({ type: 'Text', text: /^Agenten 43 gew\.$/ })).toBeDefined()
    await desk.unmount()
    // Terminal: Budget in der Zeile der Aufgabe (ohne Beschriftung „Budget“), Desktop-App wie bisher
    for (const [surface, text] of [['terminal', /1\/5 Läufe · Nachlauf 1/], ['desktop', /Budget 1\/5 Läufe · Nachlauf 1/]] as const) {
      const band = await $.ui.mount({ plugin: 'codecycle', surface, ...BAND })
      expect(await band.find({ type: 'Text', text })).toBeDefined()
      await band.unmount()
    }
  })

  test('register-forwarding: codecycle_owner nennt den Agenten, der die Datei geändert hat', async ($, on) => {
    mock.store(on)
    const files = { ...FILES, '.claude/codecycle.md': `${FILES['.claude/codecycle.md']}- register-forwarding: an\n` }
    fakeWorld(on, files)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(TOOLS).toContain('codecycle_owner')
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    await $.tool.call({ tool: 'Edit', file_path: '/wt/P1/src/Group.php', old_string: 'a', new_string: 'b', agentId: 'ag1' } as never)
    const owner = async (path: string) => {
      const r = (await $.tool.call({ tool: 'mcp__codecycle__codecycle_owner', path } as never)).result
      expect(typeof r).toBe('string')
      return JSON.stringify(r)
    }
    expect(await owner('src/Group.php')).toMatch(/Agent ag1, Rolle builder-logic, Paket P1/)
    expect(await owner('src/Neu.php')).toMatch(/kein Agent hat die Datei/)
  })

  test('Register mit Pfaden relativ zum Projekt, Bash-Schreibziele, Git-Änderungen beim Ende', async ($, on) => {
    mock.store(on)
    // ohne Zaun: Bash-Schreibziele sollen trotzdem ins Register
    const files: Record<string, string> = { ...FILES, '.claude/codecycle.md': '# Projekt\n' }
    const written = fakeWorld(on, files)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('tool.call', (_$, e) => {
      const cmd = (e as { command?: string }).command ?? ''
      if (cmd.includes('> tests/neu.test.ts')) files['tests/neu.test.ts'] = 'x'
      return { result: {} }
    })
    const runs: string[][] = []
    on('process.run', (_$, e) => {
      runs.push([...e.argv])
      const a = e.argv
      const out = a.includes('rev-parse') ? 'abc123\n' : a.includes('diff') ? 'M\ttests/list.test.ts\n' : a.includes('status') ? '?? tests/frisch.test.ts\n' : ''
      return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const wt = 'C:\\Users\\jemand\\proj--wt-P1'
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:test-author', wt)
    expect(runs.some(r => r.includes('rev-parse'))).toBe(true)
    const call = (input: object) => $.tool.call({ ...input, agentId: 'ag1' } as never)
    await call({ tool: 'Read', file_path: `${wt}\\src\\Group.php` })
    await call({ tool: 'Read', file_path: '/proj/src/Other.php' })
    await call({ tool: 'Edit', file_path: `${wt}\\tests\\GroupTest.php`, old_string: 'a', new_string: 'b' })
    await call({ tool: 'Bash', command: 'echo x > tests/neu.test.ts' })
    await call({ tool: 'Bash', command: "sed -i 's/a/b/' src/Group.php" })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(runs.some(r => r.includes('diff') && r.includes('abc123'))).toBe(true)
    const reg = JSON.parse(written[`${DIR}/agents.json`]!)
    const a = reg.agenten.ag1
    const paths = (list: { pfad: string }[]) => list.map(t => t.pfad)
    expect(paths(a.gelesen)).toEqual(['src/Group.php', 'src/Other.php'])
    expect(paths(a.geaendert)).toEqual(['tests/GroupTest.php', 'src/Group.php', 'tests/list.test.ts'])
    expect(paths(a.erstellt)).toEqual(['tests/neu.test.ts', 'tests/frisch.test.ts'])
    const costs = written[`${DIR}/costs.json`]!
    expect(`${JSON.stringify(reg)}${costs}`).not.toMatch(/jemand|proj--wt|\/proj\//)
    expect(Object.keys(JSON.parse(costs).fehlenderKontext)).toContain('src/Other.php')
  })

  test('Lauf ohne Aufgabe (Einrichter) wird in .codecycle/setup/ gebucht, die Hauptsitzung danach auch', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    delete files[`${DIR}/STATE.md`]
    const written = fakeWorld(on, files)
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: { model: 'sonnet', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 },
      }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, 'Richte das Projekt ein.', 'codecycle:setup')
    expect(seen).toMatch(/Bericht: .*\/proj\/\.codecycle\/tmp\/reports\/setup\.md/)
    for (const agentId of ['ag1', undefined]) {
      for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, ...(agentId ? { agentId } : {}) })) void chunk
    }
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const costs = JSON.parse(written['.codecycle/setup/costs.json']!)
    expect(costs.agenten.ag1.runden).toBe(1)
    expect(costs.rollen.setup.laeufe).toBe(1)
    expect(costs.hauptsitzung.runden).toBe(1)
    expect(JSON.parse(written['.codecycle/setup/agents.json']!).agenten.ag1.rolle).toBe('setup')
    expect(written[`${DIR}/costs.json`]).toBeUndefined()
  })

  test('Token-Buch: gleichzeitige Starts ohne Aufgabe verlieren keine Buchung', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    delete files[`${DIR}/STATE.md`]
    const written = fakeWorld(on, files)
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    await Promise.all([spawn($, 'Richte ein.', 'codecycle:setup'), spawn($, 'Werkzeug.', 'codecycle:toolsmith')])
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const reg = JSON.parse(written['.codecycle/setup/agents.json']!)
    expect(Object.keys(reg.agenten).sort()).toEqual(['ag1', 'ag2'])
    const costs = JSON.parse(written['.codecycle/setup/costs.json']!)
    expect(costs.rollen.setup.laeufe + costs.rollen.toolsmith.laeufe).toBe(2)
  })

  // Arbeitsordner der Sitzung im Aufgabenordner (oder Sitzung in einem Unterordner gestartet)
  const B6_FILES: Record<string, string> = { ...FILES, '.codecycle/tool.config.json': '{}' }

  test('Sitzung im Unterordner der Aufgabe: Bücher im Hauptordner, Bautafel zeigt Aufgabe und eingerichtetes Projekt', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, B6_FILES, { sessionRoot: `/proj/${DIR}`, strict: true })
    on('process.run', () => ({ value: { exitCode: 0, stdout: '24.15.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    let n = 0
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: `ag${++n}` }
    })
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: `/proj/${DIR}`, surface: null } as never)
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /nicht eingerichtet/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Keine offene Aufgabe/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /aufgabe-t/ })).toBeDefined()
    await ui.unmount()
    // Handwerker im Paket-Worktree neben dem Projekt: Bericht und Bücher trotzdem im Hauptordner
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic', '/proj--wt-t--P1')
    expect(seen).toMatch(new RegExp(`Bericht: /proj/${DIR}/reports/P1-builder-logic\\.md`))
    expect(seen).toMatch(/PHP: strict_types/) // Projektbeschreibung aus dem Hauptordner gelesen
    await $.tool.call({ tool: 'Edit', file_path: '/proj--wt-t--P1/src/Group.php', old_string: 'a', new_string: 'b', agentId: 'ag1' } as never)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(JSON.parse(written[`${DIR}/agents.json`]!).agenten.ag1.rolle).toBe('builder-logic')
    expect(written[`${DIR}/costs.json`]).toBeDefined()
    expect(Object.keys(written).filter(k => k.startsWith('AUSSEN:') || k.includes(`${DIR}/docs/`))).toEqual([])
  })

  test('ohne session.repo bestimmt git rev-parse --git-common-dir den Hauptordner', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, B6_FILES, { sessionRoot: `/proj/${DIR}`, repoRoot: null, strict: true })
    const calls: string[][] = []
    on('process.run', (_$, e) => {
      calls.push([...e.argv])
      const stdout = e.argv[0] === 'git' && e.argv.includes('--git-common-dir') ? '/proj/.git\n' : '24.15.0\n'
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    await $.session.start({ cwd: `/proj/${DIR}`, surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(calls.some(c => c.includes('--git-common-dir'))).toBe(true)
    expect(written[`${DIR}/agents.json`]).toBeDefined()
    expect(Object.keys(written).filter(k => k.startsWith('AUSSEN:'))).toEqual([])
  })

  // Buchdateien blockieren den Wechsel auf den Hauptbranch
  test('nach zustand fertig, ohne STATE.md und ohne Änderung schreibt der Mod die Bücher nicht', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    fakeWorld(on, files)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'opus', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    })
    const step = async () => {
      for await (const chunk of $.turn.step({ turnId: 't', index: 1, model: 'opus', messageCount: 1 })) void chunk
    }
    const booked = () => WRITES.filter(w => w === `${DIR}/costs.json`).length
    // Die Hauptsitzung bucht erst nach einem Signal in die Aufgabe; Sitzungsende hebt es auf
    on('tool.call', () => ({ result: {} }))
    const bind = () => $.tool.call({ tool: 'Edit', file_path: `/proj/${DIR}/STATE.md`, old_string: 'a', new_string: 'b' } as never)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await bind()
    await step()
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(booked()).toBe(1)
    // nichts Neues: kein erneutes Schreiben (nur Zeitstempel wäre anders)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(booked()).toBe(1)
    // Bauleiter setzt zustand: fertig (noch im selben Zug, Bautafel noch nicht neu geladen) und bucht weiter
    files[`${DIR}/STATE.md`] = STATE.replace('zustand: in-arbeit', 'zustand: fertig')
    await bind()
    await step()
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(booked()).toBe(1)
    // Hauptbranch ohne Aufgabenordner (vor dem Merge): keine neue Datei
    delete files[`${DIR}/STATE.md`]
    await bind()
    await step()
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(booked()).toBe(1)
  })

  test('Bücher einer fertigen (alten) Aufgabe werden nie geschrieben, auch wenn ein Agent dort bucht', async ($, on) => {
    mock.store(on)
    const done = STATE.replace('zustand: in-arbeit', 'zustand: fertig')
    fakeWorld(on, { ...FILES, [`${DIR}/STATE.md`]: done })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(WRITES.filter(w => w.includes(DIR))).toEqual([])
  })

  test('Lesen per Bash/PowerShell im Register (ohne Lese-Budget), verweigerte Schreibversuche nicht', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = {
      ...FILES,
      '.claude/codecycle.md': `${FILES['.claude/codecycle.md']}- read-budget: an, 1\n`,
      'src/list.ts': 'x',
      'src/Zweite.php': 'y',
    }
    const written = fakeWorld(on, files)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('tool.call', () => ({ result: {} }))
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    const run = (tool: string, command: string) => $.tool.call({ tool, command, agentId: 'ag1' } as never)
    expect((await run('Bash', 'cat src/list.ts')).deny).toBeUndefined()
    expect((await run('Bash', "sed -n '1,5p' src/Zweite.php")).deny).toBeUndefined()
    expect((await run('PowerShell', 'Get-Content -Path src/list.ts -Tail 5')).deny).toBeUndefined()
    expect((await run('Bash', 'cat src/gibt-es-nicht.ts')).deny).toBeUndefined()
    // Bash-Lesen verbraucht das Lese-Budget (1) nicht: ein Read einer fremden Datei geht noch, das zweite nicht
    const read = (file_path: string) => $.tool.call({ tool: 'Read', file_path, agentId: 'ag1' } as never)
    expect((await read('/proj/src/A.php')).deny).toBeUndefined()
    expect((await read('/proj/src/B.php')).deny).toMatch(/Lese-Budget erschöpft/)
    // Zaun: verweigertes Schreiben (und Lesen im selben Befehl) kommt nicht ins Register
    expect((await run('Bash', 'cat src/Group.php > phpunit.xml')).deny).toMatch(/Kontrolldatei/)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const a = JSON.parse(written[`${DIR}/agents.json`]!).agenten.ag1
    const gelesen = a.gelesen as { pfad: string; bash?: boolean }[]
    expect(gelesen.filter(g => g.bash).map(g => g.pfad)).toEqual(['src/list.ts', 'src/Zweite.php'])
    expect(gelesen.map(g => g.pfad)).not.toContain('src/gibt-es-nicht.ts')
    expect(gelesen.map(g => g.pfad)).not.toContain('src/Group.php')
    expect([...a.geaendert, ...a.erstellt].map((t: { pfad: string }) => t.pfad)).not.toContain('phpunit.xml')
  })

  // Suchen über Bash (Linux/macOS ohne Grep/Glob) zählen im Register wie Grep/Glob
  test('Suchen per Grep/Glob und per Bash (grep -rn, find, rg) im Register, Filter in der Pipe nicht', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('tool.call', () => ({ result: {} }))
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    const run = (tool: string, command: string) => $.tool.call({ tool, command, agentId: 'ag1' } as never)
    await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'ag1' } as never) // 1
    await $.tool.call({ tool: 'Glob', pattern: '*.php', agentId: 'ag1' } as never) // 2
    await run('Bash', 'grep -rn Group src') // 3
    await run('Bash', 'find . -name "*.php" | grep -v vendor') // 4 (grep filtert nur)
    await run('Bash', 'rg -n Group src && rg --files') // 5, 6
    await run('Bash', 'git log --oneline | grep fix') // keine Suche
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const a = JSON.parse(written[`${DIR}/agents.json`]!).agenten.ag1
    expect(a.suchen).toBe(6)
  })

  test('ohne Arbeitsordner im agent.spawn den Worktree aus dem ersten Pfad ableiten, neue Datei beim Ende aus Git', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, { ...FILES, '.claude/codecycle.md': '# Projekt\n' })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('tool.call', () => ({ result: {} }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const runs: { argv: string[]; cwd?: string }[] = []
    on('process.run', (_$, e) => {
      runs.push({ argv: [...e.argv], ...(e.init?.cwd ? { cwd: e.init.cwd } : {}) })
      const a = e.argv
      const out = a.includes('rev-parse') ? 'abc123\n' : a.includes('diff') ? 'A\tsrc/storage.ts\n' : ''
      return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    // kein cwd im Spawn und kein Pfad in der Nachricht: erst der erste Werkzeugaufruf zeigt den Worktree
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P2`, 'codecycle:builder-routine')
    expect(runs.some(r => r.argv.includes('rev-parse'))).toBe(false)
    const wt = 'C:\\Users\\jemand\\proj--wt-P2'
    await $.tool.call({ tool: 'Read', file_path: `${wt}\\src\\list.ts`, agentId: 'ag1' } as never)
    expect(runs.find(r => r.argv.includes('rev-parse'))?.cwd).toBe(wt)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })
    expect(runs.some(r => r.argv.includes('diff') && r.argv.includes('abc123') && r.cwd === wt)).toBe(true)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const a = JSON.parse(written[`${DIR}/agents.json`]!).agenten.ag1
    expect(a.erstellt.map((t: { pfad: string }) => t.pfad)).toEqual(['src/storage.ts'])
    expect(JSON.stringify(a)).not.toMatch(/jemand/)
  })

  test('Pfade außerhalb von Projekt und Worktree ohne Benutzername (Home als ~/…)', async ($, on) => {
    mock.store(on)
    mock.env(on, { USERPROFILE: 'C:\\Users\\jemand' })
    const written = fakeWorld(on, { ...FILES, '.claude/codecycle.md': '# Projekt\n' })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    const read = (file_path: string) => $.tool.call({ tool: 'Read', file_path, agentId: 'ag1' } as never)
    await read('C:\\Users\\jemand\\.claude\\CLAUDE.md')
    await read('C:\\Users\\jemand\\.claude\\plugins\\cache\\codecycle\\codecycle\\0.4.1\\skills\\workflow\\SKILL.md')
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const text = `${written[`${DIR}/agents.json`]!}${written[`${DIR}/costs.json`]!}`
    expect(text).not.toMatch(/jemand/)
    expect(text).toMatch(/~\/\.claude\/CLAUDE\.md/)
  })
})

describe('Limit-Kachel, Kosten je Aufgabe, Cache-Zeit, Läufe', () => {
  const USAGE = { model: 'claude-sonnet-5-5', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 20 }
  const paneProps = { title: 'codecycle', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } as const
  const handlers = (on: Ops) => {
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: USAGE }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('tool.call', () => ({ result: {} }))
    on('skill.prompt', (_$, e) => ({ text: e.text }))
    on('classic.PostModelSwitch', () => ({}))
  }
  const step = async ($: Engine, agentId?: string, index = 0) => {
    for await (const chunk of $.turn.step({ turnId: 't', index, model: 'sonnet', messageCount: 1, ...(agentId ? { agentId } : {}) })) void chunk
  }
  const done = ($: Engine, agentId?: string) =>
    $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', ...(agentId ? { agentId } : {}), reason: 'answer' })
  const pane = ($: Engine, surface: 'terminal' | 'desktop') =>
    $.ui.mount({ plugin: 'codecycle', surface, component: 'Pane', requestId: 'codecycle-panel', props: paneProps })

  test('Limit nur in der Fußzeile (echtes Fenster, sofort bei Start und Ende), nicht im Kopf der Seitenleiste; Anteil der Aufgabe getrennt', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    handlers(on)
    // Fußzeile der Engine unter dem Mod (das Limit steht dort: Terminal und Desktop-App)
    on('ui.render', { component: 'SessionMode' }, () => ({ type: 'engine', ref: 1 }) as never)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    // ohne session.measure: der Start des Agenten liest das Fenster neu
    FIVE.percent = 8
    await CLOCK.current!.advance(2_000)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    let ui = await pane($, 'desktop')
    let head = JSON.stringify(await ui.find({ type: 'Svg' }))
    // Keine Kennzahl „Limit 5 Std.“ mehr im Kopf; die Fußzeile der Desktop-App zeigt den Stand sofort
    expect(head).not.toMatch(/Limit 5 Std\./)
    const deskFooter = async () => {
      const m = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', component: 'SessionMode', props: { modes: [] } } as never)
      const t = await m.find({ type: 'Text', text: /^5h \d+ %/ })
      await m.unmount()
      return String(t?.text)
    }
    expect(await deskFooter()).toBe('5h 8 %')
    await ui.unmount()
    await step($, 'ag1')
    FIVE.percent = 11
    await CLOCK.current!.advance(2_000)
    await done($, 'ag1')
    ui = await pane($, 'desktop')
    head = JSON.stringify(await ui.find({ type: 'Svg' }))
    // Fenster 11 % in der Fußzeile, nicht die Summe der Agenten (3 Punkte); im Kopf steht nur der Anteil der Aufgabe
    expect(head).not.toMatch(/Limit 5 Std\./)
    expect(await deskFooter()).toBe('5h 11 %')
    expect(head).toMatch(/Aufgabe: Agenten 68 gew\. · Bauleiter 0 gew\. · Konto ≈ 3,0 % \/ 0,0 %/)
    await ui.unmount()
    ui = await pane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /Agenten: 68 gew\. · neu/ })).toBeDefined()
    // Terminal: kein Limit in der Seitenleiste, es steht in der Fußzeile rechts
    expect(await ui.find({ type: 'Text', text: /5 Std\./ })).toBeUndefined()
    await ui.unmount()
    const modes = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'SessionMode', props: { modes: [] } } as never)
    expect(await modes.find({ type: 'Text', text: /^5h .*11 %/ })).toBeDefined()
    await modes.unmount()
  })

  test('Hauptsitzung bucht nur nach einem Signal in die Aufgabe; Vorlauf und Startstand', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    handlers(on)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    // Arbeit ohne Bezug (Entwicklung, Tester, Vorarbeit): Aufgabe offen, aber kein Signal → nicht ins Buch
    await step($)
    await step($, undefined, 1)
    await done($)
    await CLOCK.current!.advance(10_000) // der Takt schreibt geänderte Bücher
    expect(written[`${DIR}/costs.json`]).toBeUndefined()
    // /codecycle:new: Vorlauf; das Anlegen der STATE.md bindet die Sitzung an die Aufgabe
    await $.skill.prompt({ skill: 'codecycle:new', text: 'Ablauf …' })
    await step($)
    await $.tool.call({ tool: 'Write', file_path: `/proj/${DIR}/STATE.md`, content: 'x' } as never)
    await step($)
    await $.classic.PostModelSwitch({ from_model: 'a', to_model: 'b', requested_model: null, source: 'command', context_tokens: 0, prompt_cache_warm: true, cache_ttl: '1h', estimated_cache_write_usd: 0, pricing: 'catalog' } as never)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const main = JSON.parse(written[`${DIR}/costs.json`]!).hauptsitzung
    expect(main.runden).toBe(2)
    expect(main.starts.length).toBe(1)
    expect(main.starts[0].vorher.runden).toBe(2)
    expect(main.starts[0].signal).toMatch(/codecycle:new/)
    expect(main.cacheTtl).toBe('1h')
  })

  const submit = ($: Engine, text: string, command?: { name: string; args: string }) =>
    $.prompt.submit({ text, wait: false, origin: { kind: 'sdk' }, ...(command ? { command } : {}) } as never)

  test('Kopfmodus -p: Befehl nur über prompt.submit, Anlegen per Bash mit Variable bindet über die Nennung', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    handlers(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await submit($, '/codecycle:new Probe', { name: 'codecycle:new', args: 'Probe' })
    await step($)
    // Lesen einer fertigen oder fremden Aufgabe bindet nicht (keine offene STATE.md)
    await $.tool.call({ tool: 'Bash', command: 'ls docs/codecycle/alt-fertig' } as never)
    await step($)
    await $.tool.call({ tool: 'Bash', command: `D=${DIR}\nsed -i 's/a/b/' $D/STATE.md` } as never)
    await step($)
    await $.session.end({ reason: 'other', sessionId: 'test-sitzung' } as never)
    const main = JSON.parse(written[`${DIR}/costs.json`]!).hauptsitzung
    expect(main.runden).toBe(3)
    expect(main.starts.length).toBe(1)
    expect(main.starts[0].signal).toMatch(/befehl \/codecycle:new/)
    expect(main.starts[0].vorher.runden).toBe(0)
  })

  test('ohne Vorlauf bindet eine Nennung nicht (Entwicklungssitzung liest eine Aufgabe)', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    handlers(on)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await $.tool.call({ tool: 'Read', file_path: `/proj/${DIR}/STATE.md` } as never)
    await step($)
    await $.session.end({ reason: 'other', sessionId: 'test-sitzung' } as never)
    expect(written[`${DIR}/costs.json`]).toBeUndefined()
  })

  test('Fortsetzen mit --resume: Vorlauf und Zuordnung überleben das Prozessende, /clear löscht sie', async ($, on) => {
    const mem = memStore(on)
    const written = fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    handlers(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    // Prozess 1: /codecycle:continue, Rückfrage, Ende ohne Bindung
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await submit($, '/codecycle:continue', { name: 'codecycle:continue', args: '' })
    await step($)
    await step($, undefined, 1)
    await $.session.end({ reason: 'other', sessionId: 'test-sitzung' } as never)
    expect(written[`${DIR}/costs.json`]).toBeUndefined()
    expect(Object.keys(mem.mainClaims as object)).toEqual(['test-sitzung'])
    // Prozess 2 (dieselbe Sitzungs-ID): Antwort ohne Befehl, dann ein Agent mit Aufgabenordner
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await submit($, '1a, 2a.')
    await step($)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-routine')
    await $.session.end({ reason: 'other', sessionId: 'test-sitzung' } as never)
    let main = JSON.parse(written[`${DIR}/costs.json`]!).hauptsitzung
    expect(main.runden).toBe(3)
    expect(main.starts.length).toBe(1)
    expect(main.starts[0].signal).toMatch(/codecycle:continue/)
    // Prozess 3: gebunden fortgesetzt, bucht weiter ohne neuen Startstand
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await step($)
    await $.session.end({ reason: 'clear', sessionId: 'test-sitzung' } as never)
    main = JSON.parse(written[`${DIR}/costs.json`]!).hauptsitzung
    expect(main.runden).toBe(4)
    expect(main.starts.length).toBe(1)
    expect(Object.keys(mem.mainClaims as object)).toEqual([])
  })

  test('Agent mit Aufgabenordner bindet; Dashboard zeigt Cache der Hauptsitzung', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    handlers(on)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await step($)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    await step($, undefined, 1)
    await done($)
    await CLOCK.current!.advance(10_000)
    const ui = await pane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /Bauleiter.*Cache warm 59:50 \(Annahme 1 h\)/ })).toBeDefined()
    // „Nächster Schritt“ ehrlich als Angabe aus STATE.md
    expect(await ui.find({ type: 'Text', text: /^Nächster Schritt\s+laut STATE\.md$/ })).toBeDefined()
    await ui.unmount()
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const main = JSON.parse(written[`${DIR}/costs.json`]!).hauptsitzung
    expect(main.runden).toBe(1)
    expect(main.starts[0].vorher.runden).toBe(1)
  })

  test('Läufe des Architekten, Cache-Zeit aus der Agenten-Datei, arbeitszeitMs', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, { ...FILES, 'agents/architect.md': '---\nname: architect\nexperimental: { cacheTtl: 1h }\n---\n# Architekt\n' })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    handlers(on)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/`, 'codecycle:architect')
    let ui = await pane($, 'terminal')
    // Ohne Meldungen „geschätzt“ (sobald es Runden gibt), laufend „läuft“ statt Countdown
    await ui.unmount()
    await step($, 'ag1')
    ui = await pane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /geschätzt/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /· läuft/ })).toBeDefined()
    await ui.unmount()
    await CLOCK.current!.advance(82_000)
    await done($, 'ag1')
    await CLOCK.current!.advance(108_000)
    ui = await pane($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /Arbeit 1:22 von \d+ min · Cache warm 5\d:\d\d/ })).toBeDefined()
    await ui.unmount()
    // Plan-Nachricht nach 7:38 Pause
    await CLOCK.current!.advance(350_000)
    await step($, 'ag1')
    await CLOCK.current!.advance(84_000)
    await done($, 'ag1')
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const runs = JSON.parse(written[`${DIR}/costs.json`]!).agenten.ag1.laeufe
    expect(runs.length).toBe(2)
    expect(runs[0].cacheWrite).toBe(20)
    expect(runs[1].pauseMs).toBe(458_000)
    expect(runs[1].cacheRead).toBe(80)
    expect(JSON.parse(written[`${DIR}/agents.json`]!).agenten.ag1.arbeitszeitMs).toBe(166_000)
  })
})

