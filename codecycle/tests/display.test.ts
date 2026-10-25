// Anzeige: Bautafel (Band über dem Eingabefeld), Statuszeile, Seitenleiste, Agenten-Leiste und Fortschritt.
// Agenten-Leiste, Fortschritt, Bautafel, Statuszeile und Seitenleiste. Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { BAND, CLOCK, DIR, STATE, FILES, spawn, LOGS, TOOLS, fakeWorld, type Engine, type Ops } from './helpers'

describe('Bautafel, Seitenleiste, Agenten-Leiste', () => {
  const STEP_USAGE = { model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 248_500, cache_creation_input_tokens: 0 }
  const paneProps = { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } as const
  const stepOnce = async ($: Engine, agentId?: string) => {
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, ...(agentId ? { agentId } : {}) })) void chunk
  }
  /** Gefüllte Zeichen ━ im Balken der Agentenzeile ag1 (Terminal) */
  const agentFill = async (ui: { find: (q: { key: string }) => Promise<unknown> }) => JSON.stringify(await ui.find({ key: 'ag-ag1' })).match(/"(━+)"/)?.[1]?.length ?? 0
  const stepHandlers = (on: Ops) => {
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: STEP_USAGE }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
  }

  test('Agenten-Leiste: Start, Anfrage und Ende erscheinen in der Seitenleiste (Terminal Text, Desktop Figuren)', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    on('tool.call', () => ({ result: {} }))
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: { model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 248_500, cache_creation_input_tokens: 0 },
      }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder')
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, agentId: 'ag1' })) void chunk
    const pane = (surface: 'terminal' | 'desktop') =>
      $.ui.mount({
        plugin: 'codecycle',
        surface,
        component: 'Pane',
        requestId: 'codecycle-panel',
        props: { title: 'codecycle', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
      })
    let ui = await pane('terminal')
    // Rolle und „›“ stehen im Knopf der Titelzeile (ganze Titelzeile anklickbar), das Statuszeichen daneben
    expect(String((await ui.find({ key: 'agent-ag1' }))?.props.label)).toMatch(/^Bauender ›$/)
    expect(await ui.find({ type: 'Text', text: /●/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 läuft · 0 fertig/ })).toBeDefined()
    // Effort steht in der Agenten-Datei; ohne Angabe im Schritt keiner in der Zeile (kein Aufschlag bei Risiko)
    expect(await ui.find({ type: 'Text', text: /Sonnet · 1 Runden/ })).toBeDefined()
    // Kontextfüllung und Verbrauch getrennt (Tokens nur bei breiter Leiste, ab 60 Spalten)
    expect(await ui.find({ type: 'Text', text: /Kontext 25 % · .*neu 1,5k · Cache 249k/ })).toBeDefined()
    // Modell in seiner Farbe (Sonnet #3A7BD5), Statusspalte, Balken ━/─ statt █░
    expect((await ui.find({ type: 'Text', text: /^Sonnet$/ }))?.props.color).toBe('#3A7BD5')
    expect(await ui.find({ type: 'Text', text: /[█░]/ })).toBeUndefined()
    // Rollenkosten laufend aus dem Buch im Speicher, noch bevor costs.json geschrieben ist (Spalten fester Breite)
    expect(JSON.stringify(await ui.find({ key: 'kosten-builder' }))).toMatch(/builder.*neu 1,5k · Cache 249k/)
    await ui.unmount()
    // schmale Leiste (unter 59 Spalten): ohne Tokens
    const narrow = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: { ...paneProps, bodyColumns: 50 } })
    expect(await narrow.find({ type: 'Text', text: /Kontext 25 %/ })).toBeDefined()
    expect(await narrow.find({ type: 'Text', text: /Kontext 25 % · .*neu 1,5k/ })).toBeUndefined()
    expect(JSON.stringify(await narrow.find({ key: 'kosten-builder' }))).not.toMatch(/neu 1,5k/)
    await narrow.unmount()
    // mittlere Breite: gewichtete Tokens gleich nach dem Kontext, neu/Cache fallen weg statt abgeschnitten zu werden
    const mid = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: { ...paneProps, bodyColumns: 60 } })
    expect(await mid.find({ type: 'Text', text: /Kontext 25 % · [\d,]+k? gew\./ })).toBeDefined()
    expect(await mid.find({ type: 'Text', text: /Kontext 25 % · .*neu 1,5k/ })).toBeUndefined()
    await mid.unmount()

    // Detailansicht eines Agenten mit aktueller Tätigkeit und Register-Listen, live und mit „Zurück“
    await $.tool.call({ tool: 'Read', file_path: '/proj/src/Group.php', agentId: 'ag1' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      ui = await pane(surface)
      await ui.press({ key: 'agent-ag1' })
      expect(await ui.find({ type: 'Text', text: surface === 'terminal' ? /Jetzt: Read src\/Group\.php/ : /Jetzt: Edit src\/Group\.php/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Gelesen \(1\)/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Bauender · Sonnet/ })).toBeDefined()
      await $.tool.call({ tool: 'Edit', file_path: '/proj/src/Group.php', old_string: 'a', new_string: 'b', agentId: 'ag1' } as never)
      expect(await ui.find({ type: 'Text', text: /Jetzt: Edit src\/Group\.php/ })).toBeDefined()
      await ui.press({ key: 'back' })
      expect(await ui.find({ key: 'agent-ag1' })).toBeDefined()
      await ui.unmount()
    }
    const band = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /1 Agent läuft/ })).toBeDefined()
    await band.unmount()

    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })
    ui = await pane('terminal')
    expect(await ui.find({ type: 'Text', text: /✓/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 laufen · 1 fertig/ })).toBeDefined()
    await ui.unmount()
    ui = await pane('desktop')
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    // Figur des Bauenden: Bezeichnung im Alternativtext, Kostüm der Rolle builder
    const figur = JSON.stringify(await ui.find({ key: 'ag-ag1' }))
    expect(figur).toMatch(/Bauender: /)
    expect(figur).toMatch(/data-role=\\"builder\\"/)
    await ui.unmount()
  })

  test('Alte Kosten-Einträge (solo-reviewer, builder-logic) erscheinen als Schlussprüfer und Bauender', async ($, on) => {
    mock.store(on)
    const row = { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, runden: 1, laeufe: 1, limitProzent: 1 }
    fakeWorld(on, { ...FILES, [`${DIR}/costs.json`]: JSON.stringify({ version: 1, aufgabe: 'aufgabe-t', aktualisiert: '', agenten: {}, rollen: { 'solo-reviewer': row, 'builder-logic': row }, hauptsitzung: { ...row, laeufe: undefined } }) })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const terminal = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: paneProps })
    expect(await terminal.find({ type: 'Text', text: /^final-reviewer$/ })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /^builder$/ })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /solo-reviewer|builder-logic/ })).toBeUndefined()
    await terminal.unmount()
    const desktop = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', component: 'Pane', requestId: 'codecycle-panel', props: paneProps })
    if (String((await desktop.find({ key: 'sec-kosten' }))?.props.label ?? '').startsWith('▸')) await desktop.press({ key: 'sec-kosten' })
    expect(await desktop.find({ type: 'Text', text: /^Schlussprüfer$/ })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: /^Bauender$/ })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: /solo-reviewer|builder-logic|Solo-Prüfer|Handwerker/ })).toBeUndefined()
    await desktop.unmount()
  })

  test('agent-progress: Werkzeug codecycle_step angemeldet, Hinweis in der Startnachricht, Schritte in der Leiste', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, '.claude/codecycle.md': `${FILES['.claude/codecycle.md']}- agent-progress: an\n` })
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(TOOLS).toContain('codecycle_step')
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder')
    expect(seen).toMatch(/Fortschritt: Melde nach jedem größeren Schritt einmal mit dem Werkzeug codecycle_step/)
    const step = async (input: object) => {
      const r = (await $.tool.call({ tool: 'mcp__codecycle__codecycle_step', ...input } as never)).result
      expect(typeof r).toBe('string')
      return JSON.stringify(r)
    }
    expect(await step({ done: 2, total: 5, note: 'Tests grün', agentId: 'ag1' })).toMatch(/eingetragen: 2\/5/)
    expect(await step({ done: 1, total: 0, agentId: 'ag1' })).toMatch(/Ungültig/)
    expect(await step({ done: 1, total: 2 })).toMatch(/Nur für codecycle-Agenten/)
    const ui = await $.ui.mount({
      plugin: 'codecycle',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'codecycle-panel',
      props: { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: /2\/5 Tests grün/ })).toBeDefined()
    await ui.unmount()
  })

  test('Bautafel zeigt Hinweise bei 80 % Limit (nur Desktop-App) und großer Hauptsitzung', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    await $.session.measure({
      context: { window: 1000000, tokens: 450000, percent: 45 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 85 }],
      changed: ['context', 'rateLimits'],
    })
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Limit 5 Std\. bei 85 %/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Hauptsitzung groß \(450k Tokens/ })).toBeDefined()
    await ui.unmount()
    // Terminal: kein Limit-Hinweis (das Limit steht in der Fußzeile), ▲ statt ⚠
    const term = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await term.find({ type: 'Text', text: /Limit 5 Std\. bei/ })).toBeUndefined()
    expect(await term.find({ type: 'Text', text: /^▲ Hauptsitzung groß \(450k Tokens/ })).toBeDefined()
    expect(await term.find({ type: 'Text', text: /⚠/ })).toBeUndefined()
    await term.unmount()
  })

  test('Knopf „Neue Sitzung“ erst ab 400k Tokens; Druck: /clear, dann /codecycle:continue', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    const runs: string[] = []
    const fills: string[] = []
    on('command.run', { command: 'clear' }, (_$, e) => (runs.push(e.command), {}))
    on('command.run', { command: 'codecycle:continue' }, (_$, e) => (runs.push(e.command), {}))
    on('prompt.fill', (_$, e) => (fills.push(e.text), { isFilled: true }) as never)
    const measure = (tokens: number) => $.session.measure({ context: { window: 1000000, tokens, percent: tokens / 10000 }, rateLimits: [], changed: ['context'] })
    await measure(399_000)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'codecycle', surface, ...BAND })
      expect(await ui.find({ key: 'new-session' })).toBeUndefined()
      await ui.unmount()
    }
    await measure(450_000)
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'new-session' })).toBeDefined()
    await ui.press({ key: 'new-session' })
    await CLOCK.current!.advance(10)
    expect(runs).toEqual(['clear', 'codecycle:continue'])
    expect(fills).toEqual([])
    await ui.unmount()
  })

  test('ohne offene Aufgabe leere Ansicht mit der letzten Aufgabe, Agenten behalten ihre Tokens; Beispieldaten nur mit demo-data', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    const written = fakeWorld(on, files)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: { model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 248_500, cache_creation_input_tokens: 0 },
      }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder')
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, agentId: 'ag1' })) void chunk
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })
    const booked = written[`${DIR}/costs.json`]

    // Aufgabe abgeschlossen; der nächste Zug der Hauptsitzung lädt die Bautafel neu
    files[`${DIR}/STATE.md`] = STATE.replace('zustand: in-arbeit', 'zustand: fertig')
    const mainTurn = async () => {
      await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'h', reason: 'answer' })
      for await (const chunk of $.turn.step({ turnId: 'h', index: 0, model: 'sonnet', messageCount: 1 })) void chunk
    }
    await mainTurn()
    let band = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /Keine offene Aufgabe/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /zuletzt: aufgabe-t \(fertig\)/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /Beispieldaten|einkaufsliste/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /\d+\/\d+ Läufe/ })).toBeUndefined()
    await band.unmount()
    for (const surface of ['terminal', 'desktop'] as const) {
      const pane = await $.ui.mount({
        plugin: 'codecycle',
        surface,
        component: 'Pane',
        requestId: 'codecycle-panel',
        props: { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
      })
      expect(await pane.find({ type: 'Text', text: /Keine offene Aufgabe/ })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: /einkaufsliste|Beispiel/ })).toBeUndefined()
      if (surface === 'terminal') expect(await pane.find({ type: 'Text', text: /neu 1,5k · Cache 249k/ })).toBeDefined()
      await pane.unmount()
    }
    // Die Hauptsitzung bucht nicht mehr in die abgeschlossene Aufgabe
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(JSON.parse(written[`${DIR}/costs.json`]!).hauptsitzung.runden).toBe(JSON.parse(booked!).hauptsitzung.runden)

    files['.claude/codecycle.md'] = `${FILES['.claude/codecycle.md']}- demo-data: an\n`
    await mainTurn()
    band = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /^einkaufsliste-teilen$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^\(Beispieldaten\)$/ })).toBeDefined()
    await band.unmount()
    const desk = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', ...BAND })
    expect(await desk.find({ type: 'Text', text: /^einkaufsliste-teilen$/ })).toBeDefined()
    await desk.unmount()
  })

  test('Hinweis auf ToolSearch; fertig = total/total ohne Notiz; Folgenachricht = läuft neu', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, '.claude/codecycle.md': `${FILES['.claude/codecycle.md']}- agent-progress: an\n` })
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    stepHandlers(on)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder')
    expect(seen).toMatch(/aufgeschoben.*ToolSearch.*select:mcp__codecycle__codecycle_step/)
    const pane = () => $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: paneProps })
    await $.tool.call({ tool: 'mcp__codecycle__codecycle_step', done: 2, total: 5, note: 'Tests grün', agentId: 'ag1' } as never)
    await stepOnce($, 'ag1')
    let ui = await pane()
    expect(await ui.find({ type: 'Text', text: /2\/5 Tests grün/ })).toBeDefined()
    // Balken 12 breit aus ━ (Fortschritt) und ─ (Rest): 2/5 = 5 Zeichen
    expect(await agentFill(ui)).toBe(5)
    await ui.unmount()
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer' })
    ui = await pane()
    expect(await ui.find({ type: 'Text', text: /5\/5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Tests grün/ })).toBeUndefined()
    expect(await agentFill(ui)).toBe(12)
    await ui.unmount()
    // Folgenachricht: wieder „läuft“, Meldungen und Notiz weg, Balken beginnt neu (geschätzt, nach 1 Runde fast leer)
    await stepOnce($, 'ag1')
    ui = await pane()
    expect(await ui.find({ type: 'Text', text: /1 läuft · 0 fertig/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5\/5/ })).toBeUndefined()
    expect(await agentFill(ui)).toBeLessThan(12)
    await ui.unmount()
  })

  test('ohne Meldungen wächst der Balken mit den Runden (geschätzt, höchstens 90 %), nie rückwärts', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    stepHandlers(on)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder')
    const filled = async () => {
      const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: paneProps })
      const n = await agentFill(ui)
      await ui.unmount()
      return n
    }
    const seenFilled: number[] = []
    for (let i = 0; i < 40; i++) {
      await stepOnce($, 'ag1')
      if (i === 0 || i === 6 || i === 39) seenFilled.push(await filled())
    }
    expect(seenFilled[0]).toBeLessThanOrEqual(seenFilled[1]!)
    expect(seenFilled[1]).toBeLessThanOrEqual(seenFilled[2]!)
    // höchstens 90 % von 12 Zeichen
    expect(seenFilled[2]).toBeLessThanOrEqual(11)
    expect(seenFilled[2]).toBeGreaterThan(6)
  })

  test('Bautafel ohne Paketanzeige und ohne Profil-Zeile; Bedienknöpfe schlicht', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    fakeWorld(on, files)
    on('process.run', () => {
      throw new Error('kein Prozess')
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const mount = (surface: 'terminal' | 'desktop' = 'desktop') => $.ui.mount({ plugin: 'codecycle', surface, ...BAND })
    let ui = await mount()
    expect(await ui.find({ type: 'Text', text: /\d+\/\d+ fertig|jetzt P/ })).toBeUndefined()
    // Desktop-Aussehen: Titel, keine Profil-Knöpfe; einklappen/Details schlicht (plain)
    expect(await ui.find({ key: 'profile-group' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^codecycle$/ })).toBeDefined()
    expect(JSON.stringify(await ui.find({}))).not.toMatch(/profile-|sparsam|extrem|großzügig/)
    expect((await ui.find({ key: 'collapse' }))?.props.plain).toBe(true)
    expect(String((await ui.find({ key: 'collapse' }))?.props.label)).toMatch(/▴ einklappen/)
    expect((await ui.find({ key: 'panel' }))?.props.plain).toBe(true)
    await ui.press({ key: 'collapse' })
    expect(String((await ui.find({ key: 'expand' }))?.props.label)).toMatch(/▾ ausklappen/)
    expect((await ui.find({ key: 'expand' }))?.props.plain).toBe(true)
    await ui.press({ key: 'expand' })
    await ui.unmount()
    // Terminal: Rahmen mit Titel, keine Zeile „Profil“, „Details“ und [×] schlicht rechts
    ui = await mount('terminal')
    expect(await ui.find({ type: 'Text', text: /von \d+ fertig|^Pakete/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^1\/5 Läufe$/ })).toBeDefined()
    expect(await ui.find({ key: 'profile-group' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Profil$/ })).toBeUndefined()
    expect(JSON.stringify(await ui.find({}))).not.toMatch(/profile-|sparsam|extrem|großzügig/)
    expect((await ui.find({ key: 'panel' }))?.props.plain).toBe(true)
    expect((await ui.find({ key: 'panel' }))?.props.hotkey).toBeUndefined()
    expect(String((await ui.find({ key: 'collapse' }))?.props.label)).toBe('[×]')
    // Titel im oberen Rand: eine Zeile genau so breit wie die Bautafel (120), kein „…“; unterer Rand ebenso
    expect(await ui.find({ type: 'Text', text: /^╭─ codecycle ─+╮$/ })).toBeDefined()
    expect(String((await ui.find({ type: 'Text', text: /^╭─ codecycle ─+╮$/ }))?.text).length).toBe(120)
    expect(await ui.find({ type: 'Text', text: /^╰─+╯$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /…/ })).toBeUndefined()
    // Titel in der Farbe des Modells der Hauptsitzung (Sonnet #3A7BD5)
    expect((await ui.find({ type: 'Text', text: /^codecycle$/ }))?.props.color).toBe('#3A7BD5')
    await ui.press({ key: 'collapse' })
    expect(String((await ui.find({ key: 'expand' }))?.props.label)).toBe('[▴]')
    expect(await ui.find({ key: 'collapse' })).toBeUndefined()
    await ui.press({ key: 'expand' })
    await ui.unmount()
  })

  test('Zahlen als „1,5k“, Kennzahlen „Agenten neu“, Zeile „gesamt neu“, Knopf neben der Agentenzeile', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    stepHandlers(on)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder')
    await stepOnce($, 'ag1')
    const terminal = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: paneProps })
    // Entscheidung 2a: gewichtete Tokens vor neu und Cache
    expect(await terminal.find({ type: 'Text', text: /gesamt [\d,]+k? gew\. · neu 1,5k · Cache 249k/ })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /Tsd/ })).toBeUndefined()
    await terminal.unmount()
    const desktop = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', component: 'Pane', requestId: 'codecycle-panel', props: paneProps })
    const svg = JSON.stringify(await desktop.find({ type: 'Svg' }))
    expect(svg).toMatch(/Agenten neu/)
    expect(svg).not.toMatch(/Tsd/)
    // Knopf über der Agentenzeile (Kopfzeile), nicht mehr „Details“ unter dem Balken
    const button = await desktop.find({ key: 'agent-ag1' })
    // Kleiner Knopf rechts in der Zeile statt eigener Kopfzeile mit Rollenname
    // Desktop-Aussehen: Knopf „›“ statt „Details“
    expect(String(button?.props.label)).toBe('›')
    await desktop.unmount()
  })
})

describe('Bautafel-Bedienung: Details als Umschalter, Schließen nur über das ✕', () => {
  const PANE = 'codecycle-panel'
  const paneProps = { title: 'codecycle', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } as const
  const PANE_UP = { id: PANE, title: 'codecycle', isShown: true, isFocused: false, isPlaced: true }
  const recordPanes = (on: Ops, panes: { current: (typeof PANE_UP)[] }) => {
    const calls: string[] = []
    on('ui.open', (_$, e) => {
      calls.push(`open ${e.id}`)
      return { value: { isPlaced: true } } as never
    })
    on('ui.close', (_$, e) => {
      calls.push(`close ${e.id} ${e.origin.kind}`)
      return { value: undefined } as never
    })
    on('ui.panes', () => ({ value: panes.current }) as never)
    return calls
  }

  test('Punkt 1: „Details“ öffnet die Seitenleiste und schließt sie beim zweiten Druck', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    const panes = { current: [] as (typeof PANE_UP)[] }
    const calls = recordPanes(on, panes)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      calls.length = 0
      const ui = await $.ui.mount({ plugin: 'codecycle', surface, ...BAND })
      panes.current = []
      await ui.press({ key: 'panel' })
      expect(calls).toEqual([`open ${PANE}`])
      panes.current = [PANE_UP]
      await ui.press({ key: 'panel' })
      expect(calls).toEqual([`open ${PANE}`, `close ${PANE} plugin`])
      // offen, aber hinter einer anderen Seitenleiste: nach vorn holen statt schließen
      panes.current = [{ ...PANE_UP, isShown: false }]
      await ui.press({ key: 'panel' })
      expect(calls).toEqual([`open ${PANE}`, `close ${PANE} plugin`, `open ${PANE}`])
      await ui.unmount()
    }
  })

  test('kein eigener Knopf „Schließen“ (das ✕ der Engine reicht), in der Desktop-App nur die Quelle', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    await $.session.start({ cwd: '/proj', surface: null } as never)
    // Terminal: kein eigener Knopf „Schließen“ (das ✕ der Engine reicht) und keine Zeile „Quelle“
    const term = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps })
    expect(await term.find({ key: 'foot' })).toBeUndefined()
    expect(await term.find({ key: 'close' })).toBeUndefined()
    expect(await term.find({ type: 'Text', text: /Quelle:/ })).toBeUndefined()
    await term.unmount()
    // Auch in der Desktop-App kein eigener Knopf „Schließen“ mehr, die Quelle bleibt
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', component: 'Pane', requestId: PANE, props: paneProps })
    expect(JSON.stringify(await ui.find({ key: 'foot' }))).toMatch(/Quelle:/)
    expect(await ui.find({ key: 'close' })).toBeUndefined()
    expect(await ui.find({ key: 'close-row' })).toBeUndefined()
    await ui.unmount()
  })
})

