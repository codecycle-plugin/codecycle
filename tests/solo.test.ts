// Solo-Weg: Modell des Schlussprüfers, Startsperre, Schreibrechte in Solo-Aufgaben, Merge-Sperre, Signal /codecycle:new.
// Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { FILES, spawn, fakeWorld, type Ops } from './helpers'

const SDIR = 'docs/codecycle/solo-s'

const soloState = (geprueftAuf = ''): string =>
  `---\naufgabe: solo-s\nart: feature\ngroesse: klein\nzustand: in-arbeit\nweg: solo\nhaltepunkt: 3\nbranch: codecycle/s\nbudget: { geplant: 0, verbraucht: 0, nachlauf: 0 }\nplanrunden: 0\nzuletzt: tag-1\n${geprueftAuf ? `geprueftAuf: ${geprueftAuf}\n` : ''}---\n\n## Nächster Schritt\nPrüfen.\n`

const PROFILES = JSON.stringify({
  profiles: {
    sparsam: { builder: 'sonnet', 'final-reviewer': 'opus', 'part-reviewer': 'sonnet', 'plan-reviewer': 'opus', setup: 'sonnet', toolsmith: 'sonnet' },
    grosszuegig: { builder: 'opus', 'final-reviewer': 'opus', 'part-reviewer': 'opus', 'plan-reviewer': 'opus', setup: 'sonnet', toolsmith: 'sonnet' },
    extrem: { builder: 'opus', 'final-reviewer': 'opus', 'part-reviewer': 'opus', 'plan-reviewer': 'opus', setup: 'sonnet', toolsmith: 'sonnet' },
  },
})

/** Git-Antworten der Attrappe: Befehl (argv ohne `git -c core.quotepath=false`) → stdout oder null (Exit 128) */
function gitAnswers(on: Ops, answer: (args: string[]) => string | null): void {
  on('process.run', (_$, e) => {
    const args = e.argv[0] === 'git' ? e.argv.slice(1).filter((a, i, all) => a !== '-c' && all[i - 1] !== '-c') : []
    const out = e.argv[0] === 'git' ? answer(args) : ''
    return { value: { exitCode: out === null ? 128 : 0, stdout: out ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
}

describe('Solo-Weg im Mod', () => {
  test('Schlussprüfer: Opus aus dem Profil, Bericht reports/pruefung.md; Startsperre ohne grünen solo check', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES, 'profiles.json': PROFILES, [`${SDIR}/STATE.md`]: soloState() }
    fakeWorld(on, files)
    let changed = ''
    gitAnswers(on, args => (args[0] === 'diff' ? changed : ''))
    let n = 0
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: `ag${++n}` }
    })
    const prompt = `Aufgabenordner: ${SDIR}/\nWortlaut und Diff: …`
    // ohne geprueftAuf: kein Start
    expect((await spawn($, prompt, 'codecycle:final-reviewer')).deny).toMatch(/`codecycle solo check docs\/codecycle\/solo-s` grün/)
    // nach solo check, seitdem eine Datei außerhalb des Aufgabenordners geändert: kein Start
    files[`${SDIR}/STATE.md`] = soloState('abc1234')
    changed = `src/a.ts\n${SDIR}/STATE.md\n`
    expect((await spawn($, prompt, 'codecycle:final-reviewer')).deny).toMatch(/seit `codecycle solo check` geändert \(src\/a\.ts\)/)
    // nur der Aufgabenordner geändert (STATE.md committet): Start mit Opus und festem Berichtsnamen
    changed = `${SDIR}/STATE.md\n`
    const ok = await spawn($, prompt, 'codecycle:final-reviewer')
    expect(ok.deny).toBeUndefined()
    expect(ok.model).toBe('opus')
    expect(seen).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/solo-s\/reports\/pruefung\.md/)
    // Seitenleiste: Schlussprüfer mit seiner Figur (Desktop) und Bezeichnung (Terminal)
    const pane = (surface: 'terminal' | 'desktop') =>
      $.ui.mount({ plugin: 'codecycle', surface, component: 'Pane', requestId: 'codecycle-panel', props: { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
    const term = await pane('terminal')
    expect(String((await term.find({ key: `agent-ag${n}` }))?.props.label)).toMatch(/^Schlussprüfer ›$/)
    await term.unmount()
    const desk = await pane('desktop')
    const figur = JSON.stringify(await desk.find({ key: `ag-ag${n}` }))
    expect(figur).toMatch(/Schlussprüfer: /)
    expect(figur).toMatch(/data-role=\\"final-reviewer\\"/)
    await desk.unmount()
    // zweiter Prüfer: Startnachricht mit „Auftrag: Sicherheit“ → eigener Bericht, gleiche Startsperre, gleiches Modell
    const sec = await spawn($, `Aufgabenordner: ${SDIR}/\nAuftrag: Sicherheit\nRisikobereiche: …`, 'codecycle:final-reviewer')
    expect(sec.deny).toBeUndefined()
    expect(sec.model).toBe('opus')
    expect(seen).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/solo-s\/reports\/pruefung-sicherheit\.md/)
  })

  test('Prüfer je Teil: final-reviewer mit „Auftrag: Teil“ bekommt pruefung-teil-<name>.md und das Modell aus part-reviewer; Startsperre am Teil', async ($, on) => {
    mock.store(on)
    const partState = (status: string): string =>
      soloState().replace('haltepunkt: 3', `haltepunkt: 2\nteile: { eins: ${status}, zwei: offen }`)
    const files: Record<string, string> = { ...FILES, 'profiles.json': PROFILES, [`${SDIR}/STATE.md`]: partState('offen') }
    fakeWorld(on, files)
    let head = 'codecycle/s--eins'
    let status = ''
    gitAnswers(on, args => (args[0] === 'rev-parse' ? `${head}\n` : args[0] === 'status' ? status : ''))
    let n = 0
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: `ag${++n}` }
    })
    const prompt = `Aufgabenordner: ${SDIR}/\nAuftrag: Teil\nTeil: eins · Liste und Filter\nWorktree: /proj--wt-solo-pruefung`
    // Teil nicht in Arbeit: kein Start (auch ohne geprueftAuf geht es nur um den Teil)
    expect((await spawn($, prompt, 'codecycle:final-reviewer')).deny).toMatch(/Teil eins ist nicht in Arbeit/)
    files[`${SDIR}/STATE.md`] = partState('in-arbeit codecycle/s--eins')
    // Uncommittetes außerhalb des Aufgabenordners: kein Start; im Aufgabenordner zählt es nicht
    status = ` M src/a.ts\n M ${SDIR}/costs.json\n`
    expect((await spawn($, prompt, 'codecycle:final-reviewer')).deny).toMatch(/Teil eins hat Uncommittetes \(src\/a\.ts\)/)
    // Hauptordner auf einem anderen Branch: kein Start
    status = ` M ${SDIR}/costs.json\n`
    head = 'codecycle/s'
    expect((await spawn($, prompt, 'codecycle:final-reviewer')).deny).toMatch(/steht auf codecycle\/s, Teil eins wird auf codecycle\/s--eins gebaut/)
    head = 'codecycle/s--eins'
    const ok = await spawn($, prompt, 'codecycle:final-reviewer')
    expect(ok.deny).toBeUndefined()
    expect(ok.model).toBe('sonnet')
    expect(seen).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/solo-s\/reports\/pruefung-teil-eins\.md/)
    // Bauender eines Teils: eigener Bericht aus der Zeile „Bericht:“, keine Paket-Ableitung aus einer P-Nummer im Text
    const b = await spawn($, `Aufgabenordner: ${SDIR}/\nBranch: codecycle/s--eins\nTeil: eins · Fehlercode P1 bei leerer Liste\nBericht: /proj/${SDIR}/reports/teil-eins-builder.md`, 'codecycle:builder')
    expect(b.deny).toBeUndefined()
    expect(seen).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/solo-s\/reports\/teil-eins-builder\.md/)
    expect(seen).not.toMatch(/P1-builder/)
    // ohne „Auftrag: Teil“ gilt weiter die Sperre des Schlussprüfers (kein geprueftAuf)
    expect((await spawn($, `Aufgabenordner: ${SDIR}/\nTeil: eins`, 'codecycle:final-reviewer')).deny).toMatch(/`codecycle solo check docs\/codecycle\/solo-s` grün/)
  })

  test('Schreiben in der Solo-Aufgabe: Bauender ja, andere Rollen nein, Prüfer nur Bericht, fremde Agenten nur lesen', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, 'profiles.json': PROFILES, [`${SDIR}/STATE.md`]: soloState('abc1234'), '.claude/codecycle.md': '# Projekt\n' })
    gitAnswers(on, () => '')
    on('skill.prompt', (_$, e) => ({ text: e.text }))
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    on('tool.call', () => ({ result: {} }))
    const edit = (agentId: string, file_path: string) => $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', agentId } as never)
    const bash = (agentId: string, command: string) => $.tool.call({ tool: 'Bash', command, agentId } as never)

    // Agent ohne codecycle-Rolle: erst gesperrt, wenn die Sitzung an der Solo-Aufgabe arbeitet
    expect((await edit('fremd', '/proj/src/a.ts')).deny).toBeUndefined()
    await $.skill.prompt({ skill: 'codecycle:new', text: 'Ablauf …' })
    await $.tool.call({ tool: 'Edit', file_path: `/proj/${SDIR}/TASK.md`, old_string: 'a', new_string: 'b' } as never)
    expect((await edit('fremd', '/proj/src/a.ts')).deny).toMatch(/ohne codecycle-Rolle darf hier nicht schreiben/)
    expect((await bash('fremd', 'echo x > src/b.ts')).deny).toMatch(/Schreibziel im Bash-Befehl/)
    expect((await $.tool.call({ tool: 'Read', file_path: '/proj/src/a.ts', agentId: 'fremd' } as never)).deny).toBeUndefined()
    // die Sitzung selbst baut
    expect((await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBeUndefined()

    const prompt = `Aufgabenordner: ${SDIR}/`
    await spawn($, prompt, 'codecycle:builder') // ag1
    await spawn($, prompt, 'codecycle:toolsmith') // ag2
    await spawn($, prompt, 'codecycle:final-reviewer') // ag3
    expect((await edit('ag1', '/proj/src/a.ts')).deny).toBeUndefined()
    expect((await edit('ag2', '/proj/README.md')).deny).toMatch(/Rolle toolsmith darf hier nicht schreiben/)
    expect((await edit('ag3', '/proj/src/a.ts')).deny).toMatch(/nicht dein Bericht/)
    expect((await $.tool.call({ tool: 'Write', file_path: `/proj/${SDIR}/reports/pruefung.md`, content: 'x', agentId: 'ag3' } as never)).deny).toBeUndefined()
    expect((await bash('ag3', 'node cli.js --wert 0 > /tmp/aus.txt')).deny).toBeUndefined()
  })

  test('Planprüfer im einen Weg: startet ohne PLAN.md, schreibt nur reports/plan-pruefung.md', async ($, on) => {
    mock.store(on)
    const state = soloState().replace('haltepunkt: 3', 'haltepunkt: 2\nentwurf: freigegeben 2026-10-24')
    fakeWorld(on, { ...FILES, 'profiles.json': PROFILES, [`${SDIR}/STATE.md`]: state, '.claude/codecycle.md': '# Projekt\n' })
    gitAnswers(on, () => '')
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'pr1' }
    })
    on('tool.call', () => ({ result: {} }))
    const started = await spawn($, `Aufgabenordner: ${SDIR}/\nAuftrag: Abgleich\nBericht: /proj/${SDIR}/reports/plan-pruefung.md`, 'codecycle:plan-reviewer')
    expect(started.deny).toBeUndefined()
    expect(seen).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/solo-s\/reports\/plan-pruefung\.md/)
    expect(seen).not.toMatch(/nicht in PLAN\.md gefunden/)
    const write = (file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId: 'pr1' } as never)
    expect((await write(`/proj/${SDIR}/reports/plan-pruefung.md`)).deny).toBeUndefined()
    expect((await write('/proj/src/a.ts')).deny).toBeDefined()
  })

  test('Fortgesetzter Schlussprüfer: Bericht steht im Register und gilt nach einem Neuladen des Mods weiter', async ($, on) => {
    mock.store(on)
    const written = fakeWorld(on, {
      ...FILES,
      'profiles.json': PROFILES,
      [`${SDIR}/STATE.md`]: soloState('abc1234'),
      // Prüfer aus einem früheren Prozess (nur im Register bekannt), zweiter Prüfer mit eigenem Bericht
      [`${SDIR}/agents.json`]: JSON.stringify({
        version: 1,
        aufgabe: 'solo-s',
        agenten: {
          alt1: { id: 'alt1', rolle: 'final-reviewer', paket: null, modell: 'opus', gestartet: '2026-10-23T08:00:00.000Z', mitgeliefert: [], letzteAktivitaet: '2026-10-23T08:01:00.000Z', gelesen: [], geaendert: [], erstellt: [], suchen: 0, bericht: `${SDIR}/reports/pruefung-sicherheit.md` },
        },
      }),
    })
    gitAnswers(on, () => '')
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: e.resume?.agentId ?? `ag${++n}` }))
    on('tool.call', () => ({ result: {} }))
    const write = (agentId: string, file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId } as never)
    await $.session.start({ cwd: '/proj', surface: null } as never)

    // neuer Start: Bericht repo-relativ im Register
    await spawn($, `Aufgabenordner: ${SDIR}/`, 'codecycle:final-reviewer') // ag1
    // Fortsetzen nach einem Neuladen: Laufzeit nur aus dem Register
    await $.agent.spawn({
      tool_use_id: 'tu2',
      prompt: 'Schreibe den Bericht fertig.',
      description: 'Test',
      subagentType: 'codecycle:final-reviewer',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-sonnet-5-5',
      background: false,
      fork: false,
      resume: { agentId: 'alt1' },
    } as never)
    expect((await write('alt1', `/proj/${SDIR}/reports/pruefung-sicherheit.md`)).deny).toBeUndefined()
    expect((await write('alt1', `/proj/${SDIR}/reports/pruefung.md`)).deny).toMatch(/nicht dein Bericht/)
    expect((await write('alt1', '/proj/src/a.ts')).deny).toMatch(/nicht dein Bericht/)
    await $.session.end({ reason: 'other', sessionId: 's' } as never)
    const reg = JSON.parse(written[`${SDIR}/agents.json`]!)
    expect(reg.agenten.ag1.bericht).toBe(`${SDIR}/reports/pruefung.md`)
    expect(reg.agenten.alt1.bericht).toBe(`${SDIR}/reports/pruefung-sicherheit.md`)
  })

  test('Merge-Sperre: ohne Prüfbericht oder mit offenen Funden kein git merge des Solo-Branchs', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    const branch: Record<string, string | null> = {
      [`codecycle/s:${SDIR}/STATE.md`]: soloState('abc1234'),
      [`codecycle/s:${SDIR}/TASK.md`]: '# x\n\n## Funde\n- M1: behoben (abc1234)\n',
      [`codecycle/s:${SDIR}/reports/pruefung.md`]: null,
    }
    gitAnswers(on, args => {
      if (args[0] === 'ls-tree') return args.at(-1) === 'codecycle/s:docs/codecycle' ? 'solo-s\nalt\n' : null
      if (args[0] === 'show') return branch[args[1]!] ?? null
      return ''
    })
    on('tool.call', () => ({ result: {} }))
    const bash = (command: string) => $.tool.call({ tool: 'Bash', command } as never)
    expect((await bash('git switch main && git merge --no-ff codecycle/s')).deny).toMatch(/kein Merge ohne Prüfung/)
    branch[`codecycle/s:${SDIR}/reports/pruefung.md`] = '# Prüfung\n\n## M1 Grenze\n## M2 Text\n'
    expect((await bash('git merge codecycle/s')).deny).toMatch(/offenen Funden \(M2\)/)
    branch[`codecycle/s:${SDIR}/TASK.md`] = '# x\n\n## Funde\n- M1: behoben (abc1234)\n- M2: verworfen: Wortlaut verlangt es nicht\n'
    expect((await bash('git merge codecycle/s')).deny).toBeUndefined()
    // andere Branches und Aufgaben des vollen Ablaufs bleiben frei
    expect((await bash('git merge codecycle/t')).deny).toBeUndefined()
    // ab zwei Risikobereichen (zweitpruefung: sicherheit): auch der Bericht des zweiten Prüfers und seine Funde
    branch[`codecycle/s:${SDIR}/STATE.md`] = soloState('abc1234').replace('haltepunkt: 3', 'haltepunkt: 5\nzweitpruefung: sicherheit')
    expect((await bash('git merge codecycle/s')).deny).toMatch(/pruefung-sicherheit\.md fehlt/)
    branch[`codecycle/s:${SDIR}/reports/pruefung-sicherheit.md`] = '# Sicherheit\n\n### Z1 Sperre\n'
    expect((await bash('git merge codecycle/s')).deny).toMatch(/offenen Funden \(Z1\)/)
    branch[`codecycle/s:${SDIR}/TASK.md`] += '- Z1: behoben (def5678)\n'
    expect((await bash('git merge codecycle/s')).deny).toBeUndefined()
  })
})
