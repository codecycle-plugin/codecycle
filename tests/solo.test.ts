// Solo-Weg: Modell des Solo-Prüfers, Startsperre, Schreibrechte in Solo-Aufgaben, Merge-Sperre, Signal /codecycle:solo.
// Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { FILES, spawn, fakeWorld, type Ops } from './helpers'

const SDIR = 'docs/codecycle/solo-s'

const soloState = (geprueftAuf = ''): string =>
  `---\naufgabe: solo-s\nart: feature\ngroesse: klein\nzustand: in-arbeit\nweg: solo\nhaltepunkt: 3\nbranch: codecycle/s\nbudget: { geplant: 0, verbraucht: 0, nachlauf: 0 }\nplanrunden: 0\nzuletzt: tag-1\n${geprueftAuf ? `geprueftAuf: ${geprueftAuf}\n` : ''}---\n\n## Nächster Schritt\nPrüfen.\n`

const PROFILES = JSON.stringify({
  profiles: {
    sparsam: { 'builder-logic': 'sonnet', 'builder-routine': 'sonnet', reviewer: 'sonnet', 'solo-reviewer': 'opus', 'doc-keeper': 'haiku', surveyor: 'haiku' },
    grosszuegig: { 'builder-logic': 'opus', 'builder-routine': 'sonnet', reviewer: 'opus', 'solo-reviewer': 'opus', 'doc-keeper': 'sonnet', surveyor: 'haiku' },
    extrem: { 'builder-logic': 'opus', 'builder-routine': 'sonnet', reviewer: 'opus', 'solo-reviewer': 'opus', 'doc-keeper': 'sonnet', surveyor: 'sonnet' },
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
  test('Solo-Prüfer: Opus aus dem Profil, Bericht reports/pruefung.md; Startsperre ohne grünen solo check', async ($, on) => {
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
    expect((await spawn($, prompt, 'codecycle:solo-reviewer')).deny).toMatch(/`codecycle solo check docs\/codecycle\/solo-s` grün/)
    // nach solo check, seitdem eine Datei außerhalb des Aufgabenordners geändert: kein Start
    files[`${SDIR}/STATE.md`] = soloState('abc1234')
    changed = `src/a.ts\n${SDIR}/STATE.md\n`
    expect((await spawn($, prompt, 'codecycle:solo-reviewer')).deny).toMatch(/seit `codecycle solo check` geändert \(src\/a\.ts\)/)
    // nur der Aufgabenordner geändert (STATE.md committet): Start mit Opus und festem Berichtsnamen
    changed = `${SDIR}/STATE.md\n`
    const ok = await spawn($, prompt, 'codecycle:solo-reviewer')
    expect(ok.deny).toBeUndefined()
    expect(ok.model).toBe('opus')
    expect(seen).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/solo-s\/reports\/pruefung\.md/)
    // zweiter Prüfer: Startnachricht mit „Auftrag: Sicherheit“ → eigener Bericht, gleiche Startsperre, gleiches Modell
    const sec = await spawn($, `Aufgabenordner: ${SDIR}/\nAuftrag: Sicherheit\nRisikobereiche: …`, 'codecycle:solo-reviewer')
    expect(sec.deny).toBeUndefined()
    expect(sec.model).toBe('opus')
    expect(seen).toMatch(/Bericht: .*\/proj\/docs\/codecycle\/solo-s\/reports\/pruefung-sicherheit\.md/)
  })

  test('Schreiben in der Solo-Aufgabe: Handwerker ja, andere Rollen nein, Prüfer nur Bericht, fremde Agenten nur lesen', async ($, on) => {
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
    await $.skill.prompt({ skill: 'codecycle:solo', text: 'Ablauf …' })
    await $.tool.call({ tool: 'Edit', file_path: `/proj/${SDIR}/TASK.md`, old_string: 'a', new_string: 'b' } as never)
    expect((await edit('fremd', '/proj/src/a.ts')).deny).toMatch(/ohne codecycle-Rolle darf hier nicht schreiben/)
    expect((await bash('fremd', 'echo x > src/b.ts')).deny).toMatch(/Schreibziel im Bash-Befehl/)
    expect((await $.tool.call({ tool: 'Read', file_path: '/proj/src/a.ts', agentId: 'fremd' } as never)).deny).toBeUndefined()
    // die Sitzung selbst baut
    expect((await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBeUndefined()

    const prompt = `Aufgabenordner: ${SDIR}/`
    await spawn($, prompt, 'codecycle:builder-logic') // ag1
    await spawn($, prompt, 'codecycle:doc-keeper') // ag2
    await spawn($, prompt, 'codecycle:solo-reviewer') // ag3
    expect((await edit('ag1', '/proj/src/a.ts')).deny).toBeUndefined()
    expect((await edit('ag2', '/proj/README.md')).deny).toMatch(/Rolle doc-keeper darf hier nicht schreiben/)
    expect((await edit('ag3', '/proj/src/a.ts')).deny).toMatch(/nicht dein Bericht/)
    expect((await $.tool.call({ tool: 'Write', file_path: `/proj/${SDIR}/reports/pruefung.md`, content: 'x', agentId: 'ag3' } as never)).deny).toBeUndefined()
    expect((await bash('ag3', 'node cli.js --wert 0 > /tmp/aus.txt')).deny).toBeUndefined()
  })

  test('Merge-Sperre: ohne Prüfbericht oder mit offenen Funden kein git merge des Solo-Branchs', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    const branch: Record<string, string | null> = {
      [`codecycle/s:${SDIR}/STATE.md`]: soloState('abc1234'),
      [`codecycle/s:${SDIR}/TASK.md`]: '# x\n\n## Funde\n- M1: behoben (abc)\n',
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
    branch[`codecycle/s:${SDIR}/TASK.md`] = '# x\n\n## Funde\n- M1: behoben (abc)\n- M2: verworfen: Wortlaut verlangt es nicht\n'
    expect((await bash('git merge codecycle/s')).deny).toBeUndefined()
    // andere Branches und Aufgaben des vollen Ablaufs bleiben frei
    expect((await bash('git merge codecycle/t')).deny).toBeUndefined()
    // ab zwei Risikobereichen (zweitpruefung: sicherheit): auch der Bericht des zweiten Prüfers und seine Funde
    branch[`codecycle/s:${SDIR}/STATE.md`] = soloState('abc1234').replace('haltepunkt: 3', 'haltepunkt: 5\nzweitpruefung: sicherheit')
    expect((await bash('git merge codecycle/s')).deny).toMatch(/pruefung-sicherheit\.md fehlt/)
    branch[`codecycle/s:${SDIR}/reports/pruefung-sicherheit.md`] = '# Sicherheit\n\n### Z1 Sperre\n'
    expect((await bash('git merge codecycle/s')).deny).toMatch(/offenen Funden \(Z1\)/)
    branch[`codecycle/s:${SDIR}/TASK.md`] += '- Z1: behoben (def)\n'
    expect((await bash('git merge codecycle/s')).deny).toBeUndefined()
  })
})
