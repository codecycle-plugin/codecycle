// Agentenstart: Modell aus dem Profil, Kontextpaket, Prüfer im Aufgabenmodus, Paketleiter, Effort je Rolle und Risiko.
// Modellwahl, Kontextpaket, Paketleiter, Effort. Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { RUN, BAND, DIR, PLAN, FILES, spawn, LOGS, FIVE, fakeWorld, type Ops } from './helpers'

describe('Agentenstart: Modellwahl, Kontextpaket, Paketleiter, Effort', () => {
  test('agent.spawn: Modell aus dem Profil, Kontextpaket an der Startnachricht, Register', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    let n = 0
    let seen: { model?: string; prompt: string } | undefined
    on('agent.spawn', (_$, e) => {
      seen = { model: e.model, prompt: e.prompt }
      return { model: e.model ?? 'inherit', agentId: `ag${++n}` }
    })
    const prompt = `Aufgabenordner: ${DIR}/\nPaket: P1\nBericht: ${DIR}/reports/P1-builder-logic.md`
    const first = await spawn($, prompt, 'codecycle:builder-logic')
    expect(LOGS.join(String.fromCharCode(10))).toBe('')
    expect(first.model).toBe('sonnet')
    expect(seen!.prompt.startsWith(prompt)).toBe(true)
    expect(seen!.prompt).toMatch(/Kontextpaket \(vom codecycle-Mod, Rolle builder-logic, Paket P1\)/)
    expect(seen!.prompt).toMatch(/src\/Group\.php:\d+-\d+/)
    expect(seen!.prompt).toMatch(/K1: Mitglied sieht Liste/)
    expect(seen!.prompt).toMatch(/PHP: strict_types/)
    expect(seen!.prompt).toMatch(/Tests des Test-Autors[\s\S]*class GroupTest/)

    // Nach dem ersten codecycle-Agenten ist das Profil gesperrt; Agenten ohne Präfix bleiben unberührt
    expect((await $.command.run({ ...RUN, command: 'profile', args: 'großzügig' })).text).toMatch(/ersten codecycle-Agenten/)
    expect((await spawn($, prompt, 'codecycle:builder-logic')).model).toBe('sonnet')
    expect((await spawn($, 'x', 'Explore')).model).toBe('inherit')
    expect(seen!.prompt).toBe('x')

    // Gutachter bekommen kein Paket
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:surveyor')
    expect(seen!.prompt.startsWith(`${DIR}/ Paket: P1`)).toBe(true)
    expect(seen!.prompt).not.toMatch(/Kontextpaket/)
    // Absoluter Berichtspfad im Hauptordner (session.root ist /proj)
    expect(seen!.prompt).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/aufgabe-t\/reports\/P1-surveyor\.md/)

    // Ende der Sitzung schreibt Register und Token-Buch
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const reg = JSON.parse(written[`${DIR}/agents.json`]!)
    expect(reg.agenten.ag1.rolle).toBe('builder-logic')
    expect(reg.agenten.ag1.paket).toBe('P1')
    expect(reg.agenten.ag1.mitgeliefert).toContain('src/Group.php')
    expect(JSON.parse(written[`${DIR}/costs.json`]!).rollen['builder-logic'].laeufe).toBeGreaterThan(0)
  })

  test('Prüfer: Diff statt Code, anderes Modell als der Handwerker', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    on('process.run', (_$, e) => ({
      value: {
        exitCode: 0,
        stdout: e.argv[0] === 'git' ? '+neue Zeile in Group' : 'src/Ctl.php:12 $g->remove()\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }))
    let seen = ''
    let n = 0
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: `ag${++n}` }
    })
    const prompt = `Aufgabenordner: ${DIR}/\nPaket: P1`
    await spawn($, prompt, 'codecycle:builder-logic')
    const review = await spawn($, prompt, 'codecycle:reviewer')
    // sparsam stuft den Prüfer nie hoch
    expect(review.model).toBe('sonnet')
    expect(seen).toMatch(/### Diff des Pakets\n```diff\n\+neue Zeile in Group/)
    expect(seen).toMatch(/Group::remove: src\/Ctl\.php:12/)
    expect(seen).not.toMatch(/Zu ändernde Stellen/)
  })

  test('Kontextpaket: Signaturen und Graph-Treffer aus einem einzigen package-info-Aufruf', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    const calls: string[][] = []
    const info = {
      version: 1,
      fundstellen: [{ ref: 'src/Group.php :: Group::remove', datei: 'src/Group.php', symbol: 'Group::remove', graph: [{ name: 'remove', start: 6, ende: 6, parent: 'Group' }] }],
      signaturen: [{ name: 'findItem', datei: 'src/Repo.php', zeile: 4, signatur: 'public function findItem(int $id): ?Item', parent: 'Repo' }],
      offen: [],
    }
    on('process.run', (_$, e) => {
      calls.push([...e.argv])
      return { value: { exitCode: 0, stdout: `${JSON.stringify(info)}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    expect(calls.length).toBe(1)
    expect(calls[0]!.slice(2)).toEqual(['package-info', 'src/Group.php :: Group::remove'])
    expect(seen).toMatch(/### Signaturen aufgerufener Funktionen und Typen \(nur Kopfzeilen\)\n- src\/Repo\.php:4 {2}Repo::public function findItem/)
    // Graph-Treffer 6-6 statt Outline 6-9
    expect(seen).toMatch(/src\/Group\.php:6-6 /)
  })

  test('Paketleiter: Start aus einem Agenten erbt Aufgabe und Paket, Register nennt den Eltern-Agenten', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    let n = 0
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: `ag${++n}` }
    })
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:package-lead')
    // Der Paketleiter startet den Handwerker ohne Aufgabenordner und Paket in der Nachricht
    await $.agent.spawn({
      tool_use_id: 'tu2',
      prompt: 'Setze das Paket um.',
      description: 'Handwerker',
      subagentType: 'codecycle:builder-logic',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-sonnet-5-5',
      parentAgentId: 'ag1',
      background: false,
      fork: false,
    } as never)
    expect(seen).toMatch(/Kontextpaket \(vom codecycle-Mod, Rolle builder-logic, Paket P1\)/)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const reg = JSON.parse(written[`${DIR}/agents.json`]!)
    expect(reg.agenten.ag2.paket).toBe('P1')
    expect(reg.agenten.ag2.eltern).toBe('ag1')
    expect(reg.agenten.ag1.eltern).toBeUndefined()
  })

  test('Effort: Risikopaket hebt Handwerker auf high, sonst bleibt der Agenten-Wert; Hauptsitzung unberührt', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    const efforts: (string | number | undefined)[] = []
    on('turn.step', async function* (_$, e) {
      efforts.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder-logic')
    await spawn($, `${DIR}/ Paket: P2`, 'codecycle:builder-routine')
    const step = async (agentId?: string, index = 0) => {
      for await (const chunk of $.turn.step({ turnId: 't', index, model: 'sonnet', effort: 'medium', messageCount: 1, ...(agentId ? { agentId } : {}) })) {
        void chunk
      }
    }
    await step('ag1')
    await step('ag1', 1)
    await step('ag2')
    await step()
    expect(efforts).toEqual(['high', 'high', 'medium', 'medium'])
  })

  test('Effort: Risiko-Aufschlag auch im ersten Schritt, wenn der Limit-Stand nicht lesbar ist', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    const efforts: (string | number | undefined)[] = []
    on('turn.step', async function* (_$, e) {
      efforts.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder-logic')
    FIVE.fail = true
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', effort: 'medium', messageCount: 1, agentId: 'ag1' })) void chunk
    expect(efforts).toEqual(['high'])
  })

  // Aufgabenmodus „Paket: alle“ : Abschlussprüfung und ein Test-Autor je Aufgabe
  const PLAN_ALLE = PLAN.replace('- Rolle: routine\n', '- Rolle: routine\n- Kriterien: K2\n')
  const TASK_ALLE = '# T\n\n## Abnahmekriterien\n\n| ID | Kriterium | Prüfweg |\n|---|---|---|\n| K1 | Mitglied sieht Liste | Test |\n| K2 | Andere Datei bleibt lesbar | Test |\n'
  const gitStub = (on: Ops) =>
    on('process.run', (_$, e) => ({
      value: {
        exitCode: 0,
        stdout: e.argv[0] === 'git' && e.argv.includes('main...codecycle/t') ? '+DIFF-GESAMT' : e.argv[0] === 'git' ? '+DIFF-PAKET' : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }))

  test('Prüfer im Aufgabenmodus: Gesamtdiff, alle Kriterien, kein Hinweis „Paket nicht gefunden“', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, [`${DIR}/PLAN.md`]: PLAN_ALLE, [`${DIR}/TASK.md`]: TASK_ALLE })
    gitStub(on)
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/, Paket: alle, Pakete P1 und P2`, 'codecycle:reviewer')
    expect(seen).toMatch(/\+DIFF-GESAMT/)
    expect(seen).not.toMatch(/DIFF-PAKET/)
    expect(seen).toMatch(/K1: Mitglied sieht Liste/)
    expect(seen).toMatch(/K2: Andere Datei bleibt lesbar/)
    expect(seen).not.toMatch(/nicht in PLAN\.md gefunden/)
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Kontextpaket/ })).toBeUndefined()
    await ui.unmount()
  })

  test('Gesamtdiff: ohne Konfigurationswert und ohne Zweig main (Exit 1) gegen master, sonst main (eine Regel für den Hauptzweig)', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, [`${DIR}/PLAN.md`]: PLAN_ALLE, [`${DIR}/TASK.md`]: TASK_ALLE })
    on('process.run', (_$, e) => {
      const verify = e.argv[0] === 'git' && e.argv.includes('--verify')
      const stdout = e.argv[0] === 'git' && e.argv.includes('master...codecycle/t') ? '+DIFF-MASTER' : ''
      return { value: { exitCode: verify ? 1 : 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/, Paket: alle, Pakete P1 und P2`, 'codecycle:reviewer')
    expect(seen).toMatch(/\+DIFF-MASTER/)
  })

  test('Plan mit nur einem Paket, Paket alle: Kontextpaket wird gebaut', async ($, on) => {
    mock.store(on)
    const one = PLAN.slice(0, PLAN.indexOf('### P2'))
    fakeWorld(on, { ...FILES, [`${DIR}/PLAN.md`]: one })
    gitStub(on)
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: alle`, 'codecycle:test-author')
    expect(seen).toMatch(/Kontextpaket \(vom codecycle-Mod, Rolle test-author, Paket alle\)/)
    expect(seen).toMatch(/K1: Mitglied sieht Liste/)
    expect(seen).not.toMatch(/nicht in PLAN\.md gefunden/)
  })

  test('alter Schalter effort-by-size: wirkungslos, Hinweis auf der Bautafel', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, '.claude/codecycle.md': '# Projekt\n\n## Schalter\n- effort-by-size: an, mittel=low\n' })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    const efforts: (string | number | undefined)[] = []
    on('turn.step', async function* (_$, e) {
      efforts.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `${DIR}/ Paket: P2`, 'codecycle:builder-routine')
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', effort: 'medium', messageCount: 1, agentId: 'ag1' })) void chunk
    expect(efforts).toEqual(['medium'])
    // Desktop-App: alle Hinweise auf der Bautafel; Terminal: dort nur der erste nach Rangfolge (hier die Werkzeug-Kopie),
    // die volle Liste oben in der Seitenleiste
    const band = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', ...BAND })
    expect(await band.find({ type: 'Text', text: /effort-by-size ist wirkungslos/ })).toBeDefined()
    await band.unmount()
    const pane = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
    expect(await pane.find({ type: 'Text', text: /^▎ ▲ Schalter effort-by-size ist wirkungslos/ })).toBeDefined()
    await pane.unmount()
  })

  // Anlass: der Bauleiter schrieb den Aufgabenordner mit Satzpunkt in die Startnachricht
  test('Aufgabenordner mit Satzpunkt: berichtigt, Bericht und Lese-Zaun im Ordner der aktiven Aufgabe', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'pr1' }
    })
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const res = await spawn($, `Prüfe den Plan in ${DIR}.\nBericht: ${DIR}./reports/plan-reviewer.md`, 'codecycle:plan-reviewer')
    expect(res.deny).toBeUndefined()
    expect(seen).toMatch(new RegExp(`Bericht: /proj/${DIR}/reports/plan-reviewer\\.md`))
    expect(seen).toMatch(new RegExp(`Aufgabenordner: ${DIR} \\(die Startnachricht nannte ${DIR}\\.;`))
    const write = (file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId: 'pr1' } as never)
    expect((await write(`/proj/${DIR}/reports/plan-reviewer.md`)).deny).toBeUndefined()
    expect((await write(`/proj/${DIR}./reports/plan-reviewer.md`)).deny).toMatch(/Lese-Rolle plan-reviewer/)
    // Register und Buch in der aktiven Aufgabe, nicht im vertippten Ordner
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    expect(JSON.parse(written[`${DIR}/agents.json`]!).agenten.pr1.rolle).toBe('plan-reviewer')
    expect(Object.keys(written).some(k => k.startsWith(`${DIR}./`))).toBe(false)
  })

  test('Aufgabenordner existiert nicht oder passt nicht zur Sitzung: Start verweigert, Meldung nennt den richtigen Pfad', async ($, on) => {
    mock.store(on)
    const OTHER = 'docs/codecycle/aufgabe-u'
    const DONE = 'docs/codecycle/aufgabe-alt'
    fakeWorld(on, {
      ...FILES,
      [`${OTHER}/STATE.md`]: FILES[`${DIR}/STATE.md`]!.replace('aufgabe: aufgabe-t', 'aufgabe: aufgabe-u'),
      [`${DONE}/STATE.md`]: FILES[`${DIR}/STATE.md`]!.replace('zustand: in-arbeit', 'zustand: fertig'),
    })
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    on('skill.prompt', (_$, e) => ({ text: e.text }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    // zwei offene Aufgaben, Sitzung ohne Bindung: ein nicht vorhandener Ordner → Liste der offenen
    const missing = await spawn($, 'Aufgabenordner: docs/codecycle/gibt-es-nicht', 'codecycle:surveyor')
    expect(missing.deny).toMatch(/Agent nicht gestartet.*docs\/codecycle\/gibt-es-nicht.*keine offene Aufgabe.*Offene Aufgaben: .*aufgabe-t.*aufgabe-u/)
    expect(n).toBe(0)
    // fertige Aufgabe zählt nicht als offen
    expect((await spawn($, `Aufgabenordner: ${DONE}`, 'codecycle:surveyor')).deny).toMatch(/keine offene Aufgabe/)
    // existierender offener Ordner bei unbekannter Sitzungs-Aufgabe: gilt und bindet die Sitzung
    expect((await spawn($, `Aufgabenordner: ${DIR}`, 'codecycle:surveyor')).deny).toBeUndefined()
    expect(n).toBe(1)
    // jetzt arbeitet die Sitzung an aufgabe-t: der andere offene Ordner wird verweigert, die Meldung nennt den richtigen
    const wrong = await spawn($, `Aufgabenordner: ${OTHER}\nPaket: P1`, 'codecycle:builder-logic')
    expect(wrong.deny).toMatch(new RegExp(`nennt den Aufgabenordner ${OTHER}, diese Sitzung arbeitet aber an ${DIR}\\. Richtig: „Aufgabenordner: ${DIR}“`))
    expect(wrong.deny).toMatch(/codecycle:continue/)
    // vertippt, Sitzung gebunden: der Pfad der Sitzung steht in der Meldung
    expect((await spawn($, 'Aufgabenordner: docs/codecycle/aufgabe-tt', 'codecycle:surveyor')).deny).toMatch(new RegExp(`Richtig: „Aufgabenordner: ${DIR}“`))
    expect(n).toBe(1)
    // ohne Ordner in der Startnachricht: die Aufgabe der Sitzung
    expect((await spawn($, 'Prüfe die Abnahme.', 'codecycle:acceptance')).deny).toBeUndefined()
    // /codecycle:continue löst die Bindung: der andere offene Ordner gilt wieder
    await $.skill.prompt({ skill: 'codecycle:continue', text: 'Ablauf …' })
    expect((await spawn($, `Aufgabenordner: ${OTHER}`, 'codecycle:surveyor')).deny).toBeUndefined()
  })

  test('Folgenachricht an einen fertigen Agenten (resume): kein neuer Start, Register und Läufe laufen weiter', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, {
      ...FILES,
      // Agent aus einem früheren Lauf des Mods (nur im Register bekannt)
      [`${DIR}/agents.json`]: JSON.stringify({
        version: 1,
        aufgabe: 'aufgabe-t',
        agenten: {
          alt1: { id: 'alt1', rolle: 'surveyor', paket: null, modell: 'haiku', gestartet: '2026-10-18T08:00:00.000Z', mitgeliefert: [], letzteAktivitaet: '2026-10-18T08:01:00.000Z', gelesen: [], geaendert: [], erstellt: [], suchen: 2 },
        },
      }),
    })
    let n = 0
    const seen: string[] = []
    on('agent.spawn', (_$, e) => {
      seen.push(e.prompt)
      return { model: e.model ?? 'inherit', agentId: e.resume?.agentId ?? `ag${++n}` }
    })
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}\nPaket: P1`, 'codecycle:reviewer')
    await $.tool.call({ tool: 'Bash', command: 'grep -rn remove src', agentId: 'ag1' } as never)
    const resume = (agentId: string, prompt: string, subagentType: string) =>
      $.agent.spawn({
        tool_use_id: 'tu2',
        prompt,
        description: 'Test',
        subagentType,
        provider: { plugin: 'engine', tier: 'core' },
        parentModel: 'claude-sonnet-5-5',
        background: false,
        fork: false,
        resume: { agentId },
      } as never)
    const again = await resume('ag1', 'Bitte noch Befund K2 prüfen.', 'codecycle:reviewer')
    expect(again.deny).toBeUndefined()
    // Startnachricht unverändert (Claude Code verwirft Änderungen beim Fortsetzen), kein neuer Agent
    expect(seen.at(-1)).toBe('Bitte noch Befund K2 prüfen.')
    expect(n).toBe(1)
    await $.tool.call({ tool: 'Bash', command: 'grep -rn add src', agentId: 'ag1' } as never)
    // nach einem Neuladen des Mods: Agent aus dem Register wieder bekannt, Suchen zählen weiter
    await resume('alt1', 'Noch eine Frage.', 'codecycle:surveyor')
    await $.tool.call({ tool: 'Bash', command: 'find src -name "*.php"', agentId: 'alt1' } as never)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const reg = JSON.parse(written[`${DIR}/agents.json`]!)
    expect(reg.agenten.ag1.paket).toBe('P1')
    expect(reg.agenten.ag1.suchen).toBe(2)
    expect(reg.agenten.alt1.suchen).toBe(3)
    expect(JSON.parse(written[`${DIR}/costs.json`]!).rollen.reviewer.laeufe).toBe(1)
  })
})

