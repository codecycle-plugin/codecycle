// Sitzungsstart, Profil und Sperre, Limit-Stand und Laufzeit.
// Sitzungsstart, Profil und Sperre, Limit-Messung, Werkzeug codecycle_budget, Warnungen.
// Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { RUN, BAND, DIR, FILES, spawn, LOGS, TOOLS, TOASTS, CLOCK, SESSION_ID, FIVE, fakeWorld, memStore, type Engine, type Ops } from './helpers'

describe('Sitzungsstart und Profil', () => {
  test('codecycle_budget: Empfehlung, Reset und Schwelle', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    const r = await $.tool.call({ tool: 'mcp__codecycle__codecycle_budget', role: 'builder-logic' } as never)
    expect(r.deny).toBeUndefined()
    // Claude Code verlangt String, Array oder undefined als Ergebnis eines Mod-Werkzeugs
    expect(typeof r.result).toBe('string')
    const text = JSON.stringify(r.result)
    expect(text).toMatch(/Empfehlung: starten \(Rolle builder-logic\)/)
    expect(text).toMatch(/5-Stunden-Fenster: 42 %/)
    expect(text).toMatch(/Schwelle: 92 %/)
    expect(text).toMatch(/auto-resume: aus/)
  })

  test('paket start/fertig der Hauptsitzung: Antwort von codecycle_budget als Kontext', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    on('tool.call', () => ({ result: 'grün: P1 fertig' }))
    for (const command of ['codecycle paket start P1', 'codecycle paket fertig P1 --runden 0']) {
      const r = await $.tool.call({ tool: 'Bash', command } as never)
      expect(r.deny).toBeUndefined()
      expect(r.result).toBe('grün: P1 fertig')
      const ctx = (r.context ?? []).join('\n')
      expect(ctx).toMatch(/codecycle_budget \(vom Mod nach codecycle paket start\/fertig angehängt\)/)
      expect(ctx).toMatch(/Hauptsitzung: /)
      expect(ctx).toMatch(/5-Stunden-Fenster: 42 %/)
    }
    // paket pruefen und andere Befehle: kein Anhang
    for (const command of ['codecycle paket pruefen P1', 'git status']) {
      expect((await $.tool.call({ tool: 'Bash', command } as never)).context ?? []).toEqual([])
    }
  })

  test('register-forwarding aus: kein codecycle_owner', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(TOOLS).toContain('codecycle_budget')
    expect(TOOLS).not.toContain('codecycle_owner')
  })

  test('agent-progress erst nach dem Sitzungsstart eingeschaltet: kein Hinweis, einmal „Neustart nötig“', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    fakeWorld(on, files)
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(TOOLS).not.toContain('codecycle_step')
    files['.claude/codecycle.md'] = `${FILES['.claude/codecycle.md']}- agent-progress: an\n- register-forwarding: an\n`
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    expect(seen).not.toMatch(/codecycle_step/)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    expect(TOASTS.filter(t => /agent-progress.*Neustart/.test(t)).length).toBe(1)
    expect(TOASTS.filter(t => /register-forwarding.*Neustart/.test(t)).length).toBe(1)
  })

  test('Bautafel zeigt das gespeicherte Profil auch ohne session.start; Sperre erst mit dem ersten codecycle-Agenten', async ($, on) => {
    mock.store(on, { profile: 'extrem' })
    fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    const band = async () => {
      const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
      // Terminal, Stil 1: das aktive Profil ist Text fett in Cyan, kein Knopf
      const r = {
        knopf: await ui.find({ key: 'profile-extrem' }),
        extrem: (await ui.find({ type: 'Text', text: /^extrem$/ }))?.props.color,
        gesperrt: await ui.find({ type: 'Text', text: /gesperrt/ }),
      }
      await ui.unmount()
      return r
    }
    expect((await band()).extrem).toBe('cyan')
    expect((await band()).knopf).toBeUndefined()
    await $.turn.start({ text: 'los', turnId: 't1' })
    expect((await band()).gesperrt).toBeUndefined()
    const first = await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    // Profil extrem aus dem Speicher wirkt auf die Modellwahl
    expect(first.model).toBe('opus')
    expect((await band()).gesperrt).toBeDefined()
    const changed = await $.command.run({ ...RUN, command: 'profile', args: 'sparsam' })
    expect(changed.text).toMatch(/ersten codecycle-Agenten/)
  })

  test('Profil ohne gespeicherten Wert: $.store wird beim Zeichnen nicht jedes Mal gelesen', async ($, on) => {
    let reads = 0
    on('store.get', () => {
      reads += 1
      return { value: undefined }
    })
    on('ui.status', () => ({ value: undefined }))
    for (let i = 0; i < 3; i++) {
      const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
      // Stil 1: sparsam aktiv = Text fett in Cyan, die anderen Knöpfe
      expect((await ui.find({ type: 'Text', text: /^sparsam$/ }))?.props.color).toBe('cyan')
      expect(await ui.find({ key: 'profile-sparsam' })).toBeUndefined()
      expect(await ui.find({ key: 'profile-extrem' })).toBeDefined()
      await ui.unmount()
    }
    // Profil, Einklappen und letzter Limit-Stand je höchstens einmal
    expect(reads).toBeLessThanOrEqual(3)
  })

  test('Sitzungsstart: scheitern Bautafel und Limit-Stand, werden die Werkzeuge trotzdem angemeldet', async ($, on) => {
    mock.store(on)
    const tools: string[] = []
    on('fs.exists', () => {
      throw new Error('Platte weg')
    })
    on('fs.read', () => {
      throw new Error('Platte weg')
    })
    on('fs.list', () => {
      throw new Error('Platte weg')
    })
    on('session.usage', () => {
      throw new Error('kein Messwert')
    })
    on('process.run', () => {
      throw new Error('kein Prozess')
    })
    on('ui.log', () => ({ value: undefined }))
    on('ui.status', () => ({ value: undefined }))
    mock.clock(on)
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.root', () => ({ value: '/proj' }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('tool.register', (_$, e) => {
      tools.push(e.name)
      return { value: { tool: e.name } }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(tools).toContain('codecycle_budget')
  })
})

describe('Limit-Stand und Laufzeit', () => {
  const PANE = 'codecycle-panel'
  const paneProps = { title: 'codecycle', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } as const
  const PANE_UP = { id: PANE, title: 'codecycle', isShown: true, isFocused: false, isPlaced: true }
  /** Ortszeit HH:MM wie die Anzeige (die Prüfumgebung kennt keine feste Zeitzone) */
  const hm = (ms: number) => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const NOW = Date.UTC(2026, 9, 8, 12)
  const MEASURED = Date.UTC(2026, 9, 8, 11, 5)
  const stored = (resetsAt: string) => ({
    lastLimits: { at: MEASURED, limits: { fuenfStunden: 11, woche: null, resetFuenf: resetsAt } },
  })
  /** Sitzung ohne Messwert (vor der ersten Antwort: rateLimits leer) */
  const noMeasure = () => {
    FIVE.none = true
  }
  /**
   * Wo das Limit steht: in beiden Darstellungen in der Fußzeile (Render-Platz SessionMode): im Terminal mit Balken und
   * Reset, in der Desktop-App nur als Text „5h 11 %“. Bautafel und Seitenleiste zeigen es nirgends mehr
   * (weder Terminal noch Desktop-App). Die Desktop-Fußzeile kennzeichnet einen alten Stand nicht mit „Stand HH:MM“, nur
   * „neu seit HH:MM“ bei abgelaufenem Fenster (hooks/lib/desk-parts.ts :: deskFooterText).
   */
  const SURFACES = ['terminal', 'desktop'] as const
  const engineModes = (on: Ops) => on('ui.render', { component: 'SessionMode' }, () => ({ type: 'engine', ref: 1 }) as never)
  const mountLimit = ($: Engine, surface: 'terminal' | 'desktop') =>
    $.ui.mount({ plugin: 'codecycle', surface, component: 'SessionMode', props: { modes: [] } } as never)
  const mountBand = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => $.ui.mount({ plugin: 'codecycle', surface, ...BAND })

  test('4a: neue Sitzung ohne Messwert zeigt den gespeicherten Stand als alt („Stand HH:MM“)', async ($, on) => {
    memStore(on, stored('2026-10-08T18:00:00Z'))
    fakeWorld(on, FILES)
    engineModes(on)
    noMeasure()
    await $.session.start({ cwd: '/proj', surface: null } as never)
    for (const surface of SURFACES) {
      const ui = await mountLimit($, surface)
      // Terminal: Kennzeichnung „Stand HH:MM“; Desktop-App: nur der Text der Fußzeile
      if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: new RegExp(`Stand ${hm(MEASURED)}`) })).toBeDefined()
      else expect(String((await ui.find({ type: 'Text', text: /^5h / }))?.text)).toBe('5h 11 %')
      expect(await ui.find({ type: 'Text', text: /11 %/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /noch kein Messwert/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('eingeklappte Bautafel und Seitenleiste zeigen kein Limit, die Fußzeile den alten Stand', async ($, on) => {
    memStore(on, { ...stored('2026-10-08T18:00:00Z'), collapsed: true })
    fakeWorld(on, FILES)
    engineModes(on)
    noMeasure()
    await $.session.start({ cwd: '/proj', surface: null } as never)
    // Desktop-App: eingeklappte Bautafel und Seitenleiste ohne Limit, die Fußzeile zeigt den Text
    const slim = await mountBand($, 'desktop')
    expect(await slim.find({ key: 'expand' })).toBeDefined()
    expect(await slim.find({ type: 'Text', text: /11 %|Stand \d\d:\d\d/ })).toBeUndefined()
    await slim.unmount()
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', component: 'Pane', requestId: PANE, props: paneProps })
    expect(await ui.find({ type: 'Text', text: /5 Std\.|11 %|Stand \d\d:\d\d/ })).toBeUndefined()
    await ui.unmount()
    const deskModes = await mountLimit($, 'desktop')
    expect(await deskModes.find({ type: 'Text', text: /^5h 11 %$/ })).toBeDefined()
    await deskModes.unmount()
    // Terminal: Fußzeile, eingeklappte Bautafel und Seitenleiste ohne Limit
    const modes = await mountLimit($, 'terminal')
    expect(await modes.find({ type: 'Text', text: new RegExp(`11 %.*Stand ${hm(MEASURED)}`) })).toBeDefined()
    await modes.unmount()
    const termBand = await mountBand($, 'terminal')
    expect(await termBand.find({ key: 'expand' })).toBeDefined()
    expect(await termBand.find({ type: 'Text', text: /11 %/ })).toBeUndefined()
    await termBand.unmount()
    const termPane = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps })
    expect(await termPane.find({ type: 'Text', text: /5 Std\.|11 %/ })).toBeUndefined()
    await termPane.unmount()
  })

  test('4a: der erste frische Wert ersetzt den alten Stand, die Kennzeichnung verschwindet', async ($, on) => {
    memStore(on, stored('2026-10-08T18:00:00Z'))
    fakeWorld(on, FILES)
    engineModes(on)
    noMeasure()
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const uis = [await mountLimit($, 'terminal'), await mountLimit($, 'desktop')]
    // Terminal kennzeichnet den alten Stand, die Desktop-Fußzeile zeigt nur den Wert
    expect(await uis[0]!.find({ type: 'Text', text: /Stand \d\d:\d\d/ })).toBeDefined()
    expect(await uis[1]!.find({ type: 'Text', text: /^5h 11 %$/ })).toBeDefined()
    await $.session.measure({ context: { window: 200000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-08T18:00:00Z' }], changed: ['rateLimits'] })
    for (const ui of uis) {
      expect(await ui.find({ type: 'Text', text: /Stand \d\d:\d\d/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /23 %/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('4a: abgelaufenes resetsAt zeigt „neu seit HH:MM“ statt der Zahl', async ($, on) => {
    const reset = '2026-10-08T11:30:00Z'
    memStore(on, stored(reset))
    fakeWorld(on, FILES)
    engineModes(on)
    noMeasure()
    await $.session.start({ cwd: '/proj', surface: null } as never)
    for (const surface of SURFACES) {
      const ui = await mountLimit($, surface)
      expect(await ui.find({ type: 'Text', text: new RegExp(`neu seit ${hm(Date.parse(reset))}`) })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /11 %/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('4a: der gespeicherte Stand geht nie als frisch ein (Budget-Werkzeug, Warnung ab 80 %)', async ($, on) => {
    memStore(on, { lastLimits: { at: MEASURED, limits: { fuenfStunden: 91, woche: null, resetFuenf: '2026-10-08T18:00:00Z' } } })
    fakeWorld(on, FILES)
    noMeasure()
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const r = await $.tool.call({ tool: 'mcp__codecycle__codecycle_budget', role: 'builder-logic' } as never)
    expect(JSON.stringify(r.result)).not.toMatch(/91 %/)
    expect(JSON.stringify(r.result)).toMatch(/Empfehlung: starten/)
    for (const surface of SURFACES) {
      const ui = await mountBand($, surface)
      expect(await ui.find({ type: 'Text', text: /Limit 5 Std\. bei/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /Hinweis/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('4a: setLimits legt Stand, Messzeit und resetsAt im Store ab, nur bei Änderung', async ($, on) => {
    const mem = memStore(on)
    fakeWorld(on, FILES)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(mem.lastLimits).toEqual({
      at: NOW,
      limits: { fuenfStunden: 42, woche: null, resetFuenf: '2026-10-08T18:00:00Z' },
    })
    await CLOCK.current!.advance(5_000)
    await $.session.measure({ context: { window: 200000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-08T18:00:00Z' }], changed: ['rateLimits'] })
    expect(((mem.lastLimits) as { at: number }).at).toBe(NOW)
    await $.session.measure({ context: { window: 200000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 50, resetsAt: '2026-10-08T18:00:00Z' }], changed: ['rateLimits'] })
    expect((mem.lastLimits) as { at: number; limits: { fuenfStunden: number } }).toMatchObject({ at: NOW + 5_000, limits: { fuenfStunden: 50 } })
  })

  describe('5a: Laufzeit live', () => {
    const run = async ($: Engine, on: Ops, panes: { current: (typeof PANE_UP)[] }) => {
      mock.store(on)
      fakeWorld(on, FILES)
      on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
      on('ui.panes', () => ({ value: panes.current }) as never)
      on('turn.complete', (_$, e) => ({ text: e.answer }))
      await $.session.start({ cwd: '/proj', surface: null } as never)
      await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
      return $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps })
    }
    const finish = ($: Engine) => $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })

    test('Agent läuft, Seitenleiste sichtbar: die Arbeitszeit zählt je Sekunde', async ($, on) => {
      const ui = await run($, on, { current: [PANE_UP] })
      expect(await ui.find({ type: 'Text', text: /Arbeit 0:00/ })).toBeDefined()
      await CLOCK.current!.advance(1_000)
      expect(await ui.find({ type: 'Text', text: /Arbeit 0:01/ })).toBeDefined()
      await CLOCK.current!.advance(2_000)
      expect(await ui.find({ type: 'Text', text: /Arbeit 0:03/ })).toBeDefined()
      await ui.unmount()
    })

    test('Seitenleiste verborgen: kein Update von crewNow', async ($, on) => {
      const ui = await run($, on, { current: [{ ...PANE_UP, isShown: false }] })
      await CLOCK.current!.advance(3_000)
      expect(await ui.find({ type: 'Text', text: /Arbeit 0:00/ })).toBeDefined()
      await ui.unmount()
    })

    test('Agent fertig: der Takt ist aus', async ($, on) => {
      const ui = await run($, on, { current: [PANE_UP] })
      await CLOCK.current!.advance(2_000)
      expect(await ui.find({ type: 'Text', text: /Arbeit 0:02/ })).toBeDefined()
      await finish($)
      const before = JSON.stringify(await ui.find({ type: 'Text', text: /Arbeit/ }))
      await CLOCK.current!.advance(5_000)
      expect(JSON.stringify(await ui.find({ type: 'Text', text: /Arbeit/ }))).toBe(before)
      await ui.unmount()
    })
  })
})

describe('Profil-Sperre übersteht Neustart', () => {
  const SID = 'sitzung-a'
  const KEY = 'lockedSessions'
  /** Welt mit Sitzungs-ID `id.current` und einem Agent-Start, der durchgeht */
  const world = (on: Ops, seed: Record<string, unknown>) => {
    const mem = memStore(on, seed)
    fakeWorld(on, FILES)
    SESSION_ID.current = SID
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    return mem
  }
  const gesperrt = async ($: Engine) => {
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    const r = await ui.find({ type: 'Text', text: /gesperrt/ })
    await ui.unmount()
    return r !== undefined
  }

  test('1: der erste codecycle-Agent trägt die Sitzungs-ID im Store ein', async ($, on) => {
    const mem = world(on, {})
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    expect(Object.keys((mem[KEY] ?? {}) as object)).toEqual([SID])
  })

  test('2: nach Neustart (Atome leer, gleicher Store, gleiche ID) zeigt die Bautafel gesperrt, das Profil bleibt', async ($, on) => {
    world(on, { [KEY]: { [SID]: 1 }, profile: 'extrem' })
    // ohne session.start gezeichnet
    expect(await gesperrt($)).toBe(true)
    // gesperrt: die Bautafel zeichnet keine Profil-Knöpfe, der Befehl meldet den Hinweis und wechselt nicht
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'profile-sparsam' })).toBeUndefined()
    await ui.unmount()
    TOASTS.length = 0
    expect((await $.command.run({ ...RUN, command: 'profile', args: 'sparsam' })).text).toMatch(/ersten codecycle-Agenten/)
    expect(TOASTS.join('\n')).toMatch(/ersten codecycle-Agenten/)
    // auch mit session.start
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(await gesperrt($)).toBe(true)
    expect((await $.command.run({ ...RUN, command: 'profile', args: 'sparsam' })).text).toMatch(/ersten codecycle-Agenten/)
  })

  test('3: andere Sitzungs-ID bleibt frei', async ($, on) => {
    world(on, { [KEY]: { 'sitzung-b': 1 } })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(await gesperrt($)).toBe(false)
    expect((await $.command.run({ ...RUN, command: 'profile', args: 'extrem' })).text).toMatch(/Profil gewechselt/)
  })

  test('4: /clear entfernt die endende Sitzung aus dem Store und gibt frei', async ($, on) => {
    const mem = world(on, { [KEY]: { [SID]: 1, 'sitzung-b': 2 } })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(await gesperrt($)).toBe(true)
    await $.session.end({ reason: 'clear', sessionId: SID } as never)
    expect(Object.keys(mem[KEY] as object)).toEqual(['sitzung-b'])
    expect(await gesperrt($)).toBe(false)
  })

  test('4b: andere Gründe lassen den Eintrag stehen', async ($, on) => {
    const mem = world(on, { [KEY]: { [SID]: 1 } })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await $.session.end({ reason: 'exit', sessionId: SID } as never)
    expect(Object.keys(mem[KEY] as object)).toEqual([SID])
  })

  test('5: der Store hält höchstens die jüngsten 50 Sitzungen', async ($, on) => {
    const seed: Record<string, number> = {}
    for (let i = 0; i < 50; i++) seed[`alt-${i}`] = 1000 + i
    const mem = world(on, { [KEY]: seed })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    const keys = Object.keys(mem[KEY] as object)
    expect(keys).toHaveLength(50)
    expect(keys).toContain(SID)
    expect(keys).not.toContain('alt-0')
    expect(keys).toContain('alt-1')
  })

  test('6: Debug-Zeile zur Sitzungs-ID beim Start', async ($, on) => {
    world(on, { [KEY]: { [SID]: 1 } })
    LOGS.length = 0
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(LOGS.join('\n')).toMatch(new RegExp(`codecycle: Sitzung ${SID}, Profil-Sperre ja`))
  })
})


// /codecycle:update lädt am Ende neu; command.run nicht abgewartet, Rückfall Eingabefeld
describe('Neuladen nach dem Plugin-Update', () => {
  function world(on: Ops, reject: boolean) {
    mock.store(on)
    fakeWorld(on, FILES)
    const runs: string[] = []
    const fills: string[] = []
    on('command.run', { command: 'reload-plugins' }, (_$, e) => {
      if (reject) throw new Error('abgelehnt')
      runs.push(`${e.command}${e.args ? ' ' + e.args : ''}`)
      return {}
    })
    on('prompt.fill', (_$, e) => {
      fills.push(e.text)
      return { isFilled: true } as never
    })
    return { runs, fills }
  }

  test('codecycle_reload stellt /reload-plugins nach dem Zug in die Warteschlange, ohne --force', async ($, on) => {
    const { runs, fills } = world(on, false)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(TOOLS).toContain('codecycle_reload')
    const r = (await $.tool.call({ tool: 'mcp__codecycle__codecycle_reload' } as never)).result
    expect(String(r)).toMatch(/Neuladen eingeplant/)
    expect(runs).toEqual([]) // nicht im Werkzeugaufruf selbst
    await CLOCK.current!.advance(10)
    expect(runs).toEqual(['reload-plugins'])
    expect(fills).toEqual([])
  })

  test('codecycle_reload: abgelehnt → Befehl ins Eingabefeld; Agenten dürfen nicht', async ($, on) => {
    const { fills } = world(on, true)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await $.tool.call({ tool: 'mcp__codecycle__codecycle_reload' } as never)
    await CLOCK.current!.advance(10)
    expect(fills).toEqual(['/reload-plugins '])
    const agent = (await $.tool.call({ tool: 'mcp__codecycle__codecycle_reload', agentId: 'ag1' } as never)).result
    expect(String(agent)).toMatch(/Nur für die Hauptsitzung/)
    await CLOCK.current!.advance(10)
    expect(fills).toEqual(['/reload-plugins '])
  })
})

// /codecycle:update beantwortet der Mod selbst, das Werkzeug macht die Arbeit; Exit 3/2 → Skill (KI)
describe('/codecycle:update ohne KI', () => {
  function world(on: Ops, exitCode: number, stdout: string) {
    mock.store(on)
    fakeWorld(on, FILES)
    const argv: string[][] = []
    on('process.run', (_$, e) => {
      if (e.argv.includes('update')) {
        argv.push([...e.argv])
        return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      }
      return { value: { exitCode: 0, stdout: '24.15.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    const skill: string[] = []
    on('command.run', { command: 'codecycle:update' }, (_$, e) => {
      skill.push(e.args)
      return { text: 'Skill lief' }
    })
    const reloads: string[] = []
    on('command.run', { command: 'reload-plugins' }, (_$, e) => {
      reloads.push(e.command)
      return {}
    })
    return { argv, skill, reloads }
  }

  test('Exit 0: Zusammenfassung ohne Ergebniszeile, Neuladen eingeplant, Skill läuft nicht', async ($, on) => {
    const out = 'Plugin 0.11.1 → 0.12.0 (gilt ab jetzt für alle Projekte auf diesem Rechner)\nSelbsttest: ok\nUPDATE_RESULT {"status":"aktualisiert","neuLaden":true}\n'
    const { argv, skill, reloads } = world(on, 0, out)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const r = await $.command.run({ ...RUN, command: 'codecycle:update', args: '' })
    expect(argv.length).toBe(1)
    expect(argv[0]!.at(-1)).toBe('update')
    expect(argv[0]![0]).toBe('node')
    expect(String(argv[0]!.at(-2))).toMatch(/tool\/cli\.ts$/)
    expect(r.text).toMatch(/^Plugin 0\.11\.1 → 0\.12\.0/)
    expect(r.text).not.toMatch(/UPDATE_RESULT/)
    expect(r.text).toMatch(/Neuladen eingeplant/)
    // Desktop-App: /reload-plugins kann anlaufen und selbst scheitern, ohne dass command.run ablehnt
    expect(r.text).toMatch(/Falls nicht neu geladen wird: \/reload-plugins eingeben\.$/)
    expect(skill).toEqual([])
    await CLOCK.current!.advance(10)
    expect(reloads).toEqual(['reload-plugins'])
  })

  test('Exit 3: der Skill übernimmt mit der Meldung des Werkzeugs als Argument, kein Neuladen durch den Mod', async ($, on) => {
    const out = '.codecycle/tool.config.json fehlt (frisch geklont?): Vorlage prüfen …\nUPDATE_RESULT {"status":"entscheidung","neuLaden":false}\n'
    const { skill, reloads } = world(on, 3, out)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const r = await $.command.run({ ...RUN, command: 'codecycle:update', args: '' })
    expect(r.text).toBe('Skill lief')
    expect(skill.length).toBe(1)
    expect(skill[0]).toMatch(/^Das Werkzeug meldete \(Exit 3\):\n\.codecycle\/tool\.config\.json fehlt/)
    await CLOCK.current!.advance(10)
    expect(reloads).toEqual([])
  })
})

// /codecycle:notiz beantwortet der Mod mit `codecycle notiz`; der Skill (KI) läuft nur, wenn der Prozess nicht startet
describe('/codecycle:notiz ohne KI', () => {
  function world(on: Ops, run: { exitCode: number; stdout: string } | 'fehlt') {
    mock.store(on)
    fakeWorld(on, FILES)
    const argv: string[][] = []
    on('process.run', (_$, e) => {
      if (e.argv.includes('notiz')) {
        argv.push([...e.argv])
        if (run === 'fehlt') throw new Error('spawn node ENOENT')
        return { value: { ...run, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      }
      return { value: { exitCode: 0, stdout: '24.15.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    const skill: string[] = []
    on('command.run', { command: 'codecycle:notiz' }, (_$, e) => {
      skill.push(e.args)
      return { text: 'Skill lief' }
    })
    return { argv, skill }
  }

  test('gespeichert: Ausgabe des Werkzeugs, Text als ein Argument, Skill läuft nicht', async ($, on) => {
    const { argv, skill } = world(on, { exitCode: 0, stdout: 'Notiz gespeichert in docs/codecycle/x/notizen.md\n' })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const r = await $.command.run({ ...RUN, command: 'codecycle:notiz', args: 'Knopf "Details" springt; prüfen' })
    expect(r.text).toBe('Notiz gespeichert in docs/codecycle/x/notizen.md')
    expect(argv.length).toBe(1)
    expect(argv[0]!.slice(-2)).toEqual(['notiz', 'Knopf "Details" springt; prüfen'])
    expect(skill).toEqual([])
  })

  test('Schalter aus: Hinweis des Werkzeugs, ohne KI', async ($, on) => {
    const { skill } = world(on, { exitCode: 1, stdout: 'Schalter notizen ist aus; nichts gespeichert. Einschalten: …\n' })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const r = await $.command.run({ ...RUN, command: 'codecycle:notiz', args: 'x' })
    expect(r.text).toMatch(/^Schalter notizen ist aus/)
    expect(skill).toEqual([])
  })

  test('ohne Text: kurzer Hinweis, kein Prozess; Prozess startet nicht: Skill übernimmt', async ($, on) => {
    const { argv, skill } = world(on, 'fehlt')
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const leer = await $.command.run({ ...RUN, command: 'codecycle:notiz', args: '  ' })
    expect(leer.text).toMatch(/Notiz ohne Text/)
    expect(argv).toEqual([])
    const r = await $.command.run({ ...RUN, command: 'codecycle:notiz', args: 'y' })
    expect(r.text).toBe('Skill lief')
    expect(skill).toEqual(['y'])
  })
})
