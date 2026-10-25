// Agentenstart: Modell aus models.json, Berichtspfad, Aufgabenordner, Effort bleibt beim Wert des Schritts.
// Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { BAND, DIR, FILES, spawn, LOGS, fakeWorld } from './helpers'

describe('Agentenstart: Modellwahl, Berichtspfad, Effort', () => {
  test('agent.spawn: Modell aus models.json und Berichtspfad an der Startnachricht, kein Kontextpaket, Register', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, FILES)
    let n = 0
    let seen: { model?: string; prompt: string } | undefined
    on('agent.spawn', (_$, e) => {
      seen = { model: e.model, prompt: e.prompt }
      return { model: e.model ?? 'inherit', agentId: `ag${++n}` }
    })
    const prompt = `Aufgabenordner: ${DIR}/\nBaue den Teil Liste.`
    const first = await spawn($, prompt, 'codecycle:builder')
    expect(LOGS.join(String.fromCharCode(10))).toBe('')
    expect(first.model).toBe('sonnet')
    // Startnachricht unverändert vorn, angehängt nur der Berichtspfad (absolut im Hauptordner); kein Kontextpaket
    expect(seen!.prompt.startsWith(prompt)).toBe(true)
    expect(seen!.prompt.slice(prompt.length)).toMatch(/^\n\nBericht: \/proj\/docs\/codecycle\/aufgabe-t\/reports\/builder\.md \(absoluter Pfad/)
    expect(seen!.prompt).not.toMatch(/Kontextpaket|Fundstelle|Leseregel|Lese-Budget|PLAN\.md/)
    expect(seen!.prompt).not.toMatch(/src\/Group\.php/)

    // Jeder weitere Start wählt wieder aus models.json; Agenten ohne Präfix bleiben unberührt
    expect((await spawn($, prompt, 'codecycle:builder')).model).toBe('sonnet')
    expect((await spawn($, prompt, 'codecycle:plan-reviewer')).model).toBe('opus')
    // Rolle fehlt in models.json: kein Modell gesetzt, der Start erbt (Rückfall wie bei unbekannter Rolle)
    expect((await spawn($, prompt, 'codecycle:gibt-es-nicht')).model).toBe('inherit')
    expect((await spawn($, 'x', 'Explore')).model).toBe('inherit')
    expect(seen!.prompt).toBe('x')

    // Plan-Prüfer: Bericht aus der Startnachricht, absolut im Hauptordner (session.root ist /proj)
    await spawn($, `Aufgabenordner: ${DIR}/\nBericht: ${DIR}/reports/plan-pruefung.md`, 'codecycle:plan-reviewer')
    expect(seen!.prompt).toMatch(/Bericht: \/proj\/docs\/codecycle\/aufgabe-t\/reports\/plan-pruefung\.md/)
    expect(seen!.prompt).not.toMatch(/Kontextpaket/)

    // Ende der Sitzung schreibt Register und Token-Buch; neue Einträge ohne Felder des alten Kontextpakets
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const reg = JSON.parse(written[`${DIR}/agents.json`]!)
    expect(reg.agenten.ag1.rolle).toBe('builder')
    expect(reg.agenten.ag1.bericht).toBe(`${DIR}/reports/builder.md`)
    expect('mitgeliefert' in reg.agenten.ag1).toBe(false)
    expect('eltern' in reg.agenten.ag1).toBe(false)
    const costs = JSON.parse(written[`${DIR}/costs.json`]!)
    expect(costs.rollen['builder'].laeufe).toBeGreaterThan(0)
    expect('fehlenderKontext' in costs).toBe(false)
  })

  test('Effort: der Mod ändert ihn nicht, der Wert des Schritts bleibt; Hauptsitzung unberührt', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    const efforts: (string | number | undefined)[] = []
    on('turn.step', async function* (_$, e) {
      efforts.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    await spawn($, `${DIR}/ Paket: P1`, 'codecycle:builder')
    await spawn($, `${DIR}/ Paket: P2`, 'codecycle:builder')
    const step = async (agentId?: string, index = 0) => {
      for await (const chunk of $.turn.step({ turnId: 't', index, model: 'sonnet', effort: 'medium', messageCount: 1, ...(agentId ? { agentId } : {}) })) {
        void chunk
      }
    }
    await step('ag1')
    await step('ag1', 1)
    await step('ag2')
    await step()
    expect(efforts).toEqual(['medium', 'medium', 'medium', 'medium'])
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
    await spawn($, `${DIR}/ Paket: P2`, 'codecycle:builder')
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
    const missing = await spawn($, 'Aufgabenordner: docs/codecycle/gibt-es-nicht', 'codecycle:plan-reviewer')
    expect(missing.deny).toMatch(/Agent nicht gestartet.*docs\/codecycle\/gibt-es-nicht.*keine offene Aufgabe.*Offene Aufgaben: .*aufgabe-t.*aufgabe-u/)
    expect(n).toBe(0)
    // fertige Aufgabe zählt nicht als offen
    expect((await spawn($, `Aufgabenordner: ${DONE}`, 'codecycle:plan-reviewer')).deny).toMatch(/keine offene Aufgabe/)
    // existierender offener Ordner bei unbekannter Sitzungs-Aufgabe: gilt und bindet die Sitzung
    expect((await spawn($, `Aufgabenordner: ${DIR}`, 'codecycle:plan-reviewer')).deny).toBeUndefined()
    expect(n).toBe(1)
    // jetzt arbeitet die Sitzung an aufgabe-t: der andere offene Ordner wird verweigert, die Meldung nennt den richtigen
    const wrong = await spawn($, `Aufgabenordner: ${OTHER}\nPaket: P1`, 'codecycle:builder')
    expect(wrong.deny).toMatch(new RegExp(`nennt den Aufgabenordner ${OTHER}, diese Sitzung arbeitet aber an ${DIR}\\. Richtig: „Aufgabenordner: ${DIR}“`))
    expect(wrong.deny).toMatch(/codecycle:continue/)
    // vertippt, Sitzung gebunden: der Pfad der Sitzung steht in der Meldung
    expect((await spawn($, 'Aufgabenordner: docs/codecycle/aufgabe-tt', 'codecycle:plan-reviewer')).deny).toMatch(new RegExp(`Richtig: „Aufgabenordner: ${DIR}“`))
    expect(n).toBe(1)
    // ohne Ordner in der Startnachricht: die Aufgabe der Sitzung
    expect((await spawn($, 'Prüfe die Abnahme.', 'codecycle:plan-reviewer')).deny).toBeUndefined()
    // /codecycle:continue löst die Bindung: der andere offene Ordner gilt wieder
    await $.skill.prompt({ skill: 'codecycle:continue', text: 'Ablauf …' })
    expect((await spawn($, `Aufgabenordner: ${OTHER}`, 'codecycle:plan-reviewer')).deny).toBeUndefined()
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
    await spawn($, `Aufgabenordner: ${DIR}\nPaket: P1`, 'codecycle:builder')
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
    const again = await resume('ag1', 'Bitte noch Befund K2 prüfen.', 'codecycle:builder')
    expect(again.deny).toBeUndefined()
    // Startnachricht unverändert (Claude Code verwirft Änderungen beim Fortsetzen), kein neuer Agent
    expect(seen.at(-1)).toBe('Bitte noch Befund K2 prüfen.')
    expect(n).toBe(1)
    await $.tool.call({ tool: 'Bash', command: 'grep -rn add src', agentId: 'ag1' } as never)
    // nach einem Neuladen des Mods: Agent aus dem Register wieder bekannt, Suchen zählen weiter (alter Eintrag mit
    // entfernter Rolle und Feld mitgeliefert bleibt lesbar)
    await resume('alt1', 'Noch eine Frage.', 'codecycle:surveyor')
    await $.tool.call({ tool: 'Bash', command: 'find src -name "*.php"', agentId: 'alt1' } as never)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const reg = JSON.parse(written[`${DIR}/agents.json`]!)
    // „Paket: P1“ im Text ergibt kein Paket mehr (nur alte Einträge tragen eins)
    expect(reg.agenten.ag1.paket ?? null).toBeNull()
    expect(reg.agenten.ag1.suchen).toBe(2)
    expect(reg.agenten.alt1.suchen).toBe(3)
    expect(JSON.parse(written[`${DIR}/costs.json`]!).rollen['builder'].laeufe).toBe(1)
  })
})

