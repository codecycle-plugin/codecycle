// Zaun und Sperren: Zaun (Schalter fence), Doku-Pfleger- und Lese-Rollen-Zaun, Lese-Budget, --no-verify, Python, commit-tests,
// Grundlage für guard. Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { DIR, PLAN, FILES, spawn, fakeWorld, type Engine, type Ops } from './helpers'

describe('Zaun und Sperren', () => {
  const PROJECT_MD = '.claude/codecycle.md'

  test('--no-verify ist gesperrt, normale Befehle laufen', async ($, on) => {
    on('tool.call', () => ({ result: {} }))
    const call = (command: string) => $.tool.call({ tool: 'Bash', command })
    expect((await call('git commit -m "x" --no-verify')).deny).toMatch(/--no-verify/)
    expect((await call('git commit -n -m x')).deny).toBeDefined()
    expect((await call('git commit -m "x"')).deny).toBeUndefined()
  })

  test('Zaun (Schalter fence): Kontrolldateien, fremde Pakete, Tests des Test-Autors', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    on('tool.call', () => ({ result: {} }))
    const prompt = `Aufgabenordner: ${DIR}/\nPaket: P1`
    await spawn($, prompt, 'codecycle:test-author')
    await spawn($, prompt, 'codecycle:builder-logic')
    const edit = (agentId: string, file_path: string) =>
      $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', agentId } as never)
    expect((await edit('ag2', '/wt/P1/src/Group.php')).deny).toBeUndefined()
    expect((await edit('ag2', '/wt/P1/phpunit.xml')).deny).toMatch(/Kontrolldatei/)
    expect((await edit('ag2', '/wt/P1/src/Other.php')).deny).toMatch(/offenen Paket P2/)
    expect((await edit('ag2', '/wt/P1/tests/GroupTest.php')).deny).toMatch(/Test-Autors/)
    expect((await edit('ag1', '/wt/P1/tests/GroupTest.php')).deny).toBeUndefined()
    expect((await edit('fremd', '/wt/P1/phpunit.xml')).deny).toBeUndefined()

    // Bash: erkannte Schreibziele wie Edit/Write
    const bash = (agentId: string, command: string) => $.tool.call({ tool: 'Bash', command, agentId } as never)
    expect((await bash('ag2', "sed -i 's/a/b/' phpunit.xml")).deny).toMatch(/Kontrolldatei.*Schreibziel im Bash-Befehl/)
    expect((await bash('ag2', 'echo x > src/Other.php')).deny).toMatch(/offenen Paket P2/)
    expect((await bash('ag2', 'rm tests/GroupTest.php')).deny).toMatch(/Test-Autors/)
    expect((await bash('ag2', 'cat phpunit.xml && echo ok > src/Group.php')).deny).toBeUndefined()
  })

  test('Lese-Budget (Schalter read-budget, Wert 2): danach verweigert, Mitgeliefertes und Wiederholtes frei', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, '.claude/codecycle.md': `${FILES['.claude/codecycle.md']}- read-budget: an, 2\n` })
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'ag1' }
    })
    on('tool.call', () => ({ result: {} }))
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    expect(seen).toMatch(/Lese-Budget: höchstens 2 zusätzliche/)
    const call = (tool: string, file_path?: string) => $.tool.call({ tool, ...(file_path ? { file_path } : { pattern: 'x' }), agentId: 'ag1' } as never)
    expect((await call('Read', '/wt/P1/src/Group.php')).deny).toBeUndefined() // mitgeliefert
    expect((await call('Read', '/wt/P1/src/A.php')).deny).toBeUndefined() // 1
    expect((await call('Grep')).deny).toBeUndefined() // 2
    expect((await call('Read', '/wt/P1/src/A.php')).deny).toBeUndefined() // dieselbe Datei: frei
    expect((await call('Read', '/wt/P1/src/B.php')).deny).toMatch(/Lese-Budget erschöpft \(2 /)
    expect((await call('Glob')).deny).toMatch(/Lese-Budget erschöpft/)
    expect((await call('Read', '/wt/P1/tests/GroupTest.php')).deny).toBeUndefined() // mitgeliefert
    expect((await call('Edit', '/wt/P1/src/Group.php')).deny).toBeUndefined()
  })

  // Linux/macOS haben in Claude Code kein Grep/Glob, gesucht wird über Bash; derselbe Ablauf wie oben, nur über Bash
  test('Lese-Budget (Wert 2) mit Suche über Bash: grep -rn und find zählen, Filter in der Pipe nicht', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, '.claude/codecycle.md': `${FILES['.claude/codecycle.md']}- read-budget: an, 2\n` })
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag1' }))
    on('tool.call', () => ({ result: {} }))
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    const read = (file_path: string) => $.tool.call({ tool: 'Read', file_path, agentId: 'ag1' } as never)
    const bash = (command: string) => $.tool.call({ tool: 'Bash', command, agentId: 'ag1' } as never)
    expect((await read('/wt/P1/src/Group.php')).deny).toBeUndefined() // mitgeliefert
    expect((await read('/wt/P1/src/A.php')).deny).toBeUndefined() // 1
    expect((await bash('git log --oneline | grep fix')).deny).toBeUndefined() // Filter: keine Suche
    expect((await bash('grep -rn Group src')).deny).toBeUndefined() // 2
    expect((await read('/wt/P1/src/A.php')).deny).toBeUndefined() // dieselbe Datei: frei
    expect((await bash('find . -name "*.php"')).deny).toMatch(/Lese-Budget erschöpft \(2 /)
    expect((await bash('rg Group')).deny).toMatch(/Lese-Budget erschöpft/)
    expect((await bash('git status')).deny).toBeUndefined()
    expect((await read('/wt/P1/tests/GroupTest.php')).deny).toBeUndefined() // mitgeliefert
  })

  test('Zaun: Test-Autor mit Paket alle schützt die Tests aller Pakete', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, [`${DIR}/PLAN.md`]: PLAN.replace('- Ändern: src/Other.php\n', '- Ändern: src/Other.php\n- Tests: tests/P2Test.php\n') })
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    on('tool.call', () => ({ result: {} }))
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: alle`, 'codecycle:test-author')
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    const edit = (agentId: string, file_path: string) =>
      $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', agentId } as never)
    expect((await edit('ag2', '/wt/P1/tests/P2Test.php')).deny).toMatch(/Test-Autors/)
    expect((await edit('ag2', '/wt/P1/tests/GroupTest.php')).deny).toMatch(/Test-Autors/)
    // der Test-Autor im Aufgabenmodus darf die Tests aller Pakete schreiben, auch die des Pakets P2
    expect((await edit('ag1', '/wt/P1/tests/P2Test.php')).deny).toBeUndefined()
  })

  test('Hook-Sperre gilt auch für PowerShell', async ($, on) => {
    on('tool.call', () => ({ result: {} }))
    expect((await $.tool.call({ tool: 'PowerShell', command: 'git commit -m x --no-verify' } as never)).deny).toMatch(/--no-verify/)
    expect((await $.tool.call({ tool: 'PowerShell', command: 'git status' } as never)).deny).toBeUndefined()
  })

  // Doku-Pfleger mit Bash, Zaun auf Doku-Pfade, unabhängig vom Schalter fence
  test('Doku-Pfleger schreibt nur Doku, Bash nur git/codecycle/Lesen; auch mit fence aus', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, [PROJECT_MD]: FILES[PROJECT_MD]!.replace('fence: an', 'fence: aus') })
    let seen = ''
    on('agent.spawn', (_$, e) => {
      seen = e.prompt
      return { model: e.model ?? 'inherit', agentId: 'doc' }
    })
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nBericht: ${DIR}/reports/05-doc-keeper.md`, 'codecycle:doc-keeper')
    // Berichtspfad in der Startnachricht, als Pflicht
    expect(seen).toMatch(new RegExp(`Bericht: /proj/${DIR}/reports/05-doc-keeper\\.md`))
    expect(seen).toMatch(/Pflicht/)
    const edit = (file_path: string) => $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', agentId: 'doc' } as never)
    const bash = (command: string) => $.tool.call({ tool: 'Bash', command, agentId: 'doc' } as never)
    expect((await edit('/proj/CHANGELOG.md')).deny).toBeUndefined()
    expect((await edit('/proj/src/billing/CLAUDE.md')).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Write', file_path: `/proj/${DIR}/reports/05-doc-keeper.md`, content: 'x', agentId: 'doc' } as never)).deny).toBeUndefined()
    expect((await edit('/proj/src/Group.php')).deny).toMatch(/Doku-Pfleger.*src\/Group\.php/)
    expect((await bash('git add CHANGELOG.md && git commit -m "Doku"')).deny).toBeUndefined()
    expect((await bash('codecycle test')).deny).toBeUndefined()
    expect((await bash('git status && cat README.md')).deny).toBeUndefined()
    expect((await bash('npm test')).deny).toMatch(/Doku-Pfleger.*npm/)
    expect((await bash('git add src/Group.php')).deny).toMatch(/src\/Group\.php/)
    expect((await bash('echo x > src/Group.php')).deny).toMatch(/Doku-Pfleger.*src\/Group\.php/)
    expect((await bash('echo x >> CHANGELOG.md')).deny).toBeUndefined()
    // node nur mit genau dem cli.ts im Hauptordner bzw. Plugin, in den Doku-Ordnern keine Code-Dateien
    expect((await bash('node /proj/.codecycle/tool/cli.ts test')).deny).toBeUndefined()
    expect((await bash('node /proj/docs/x/tool/cli.ts test')).deny).toMatch(/Doku-Pfleger.*node nur als Rückfall/)
    expect((await $.tool.call({ tool: 'Write', file_path: '/proj/docs/x/tool/cli.ts', content: 'x', agentId: 'doc' } as never)).deny).toMatch(/keine Doku-Datei/)
    expect((await bash('PAGER="sh -c id" git log')).deny).toMatch(/Umgebungsvariable/)
    // Grundlage für guard setzt der Doku-Pfleger nicht
    expect((await bash('codecycle guard --record')).deny).toMatch(/Grundlage für guard setzt nur der Bauleiter oder codecycle:toolsmith/)
  })

  // H1 (KP7): Git-Hooks, Werkzeug und guard-Grundlage auch mit fence aus nur für toolsmith; Hauptsitzung frei
  test('Kontrolldateien der Prüfung: auch mit fence aus gesperrt für Agenten (auch ohne Rolle), frei für toolsmith und Hauptsitzung', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, [PROJECT_MD]: FILES[PROJECT_MD]!.replace('fence: an', 'fence: aus') })
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `a${++n}` }))
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    await spawn($, `Aufgabenordner: ${DIR}/`, 'codecycle:toolsmith')
    const as = (agentId: string | undefined, input: Record<string, unknown>) => $.tool.call({ ...input, ...(agentId ? { agentId } : {}) } as never)
    for (const input of [
      { tool: 'Edit', file_path: '/proj/.githooks/pre-commit', old_string: 'a', new_string: 'b' },
      { tool: 'Write', file_path: '/proj/.codecycle/tool.config.json', content: '{}' },
      { tool: 'Bash', command: 'mv .githooks/pre-commit /tmp/pc' },
      { tool: 'Bash', command: 'chmod -x .githooks/pre-commit' },
      { tool: 'Bash', command: 'git checkout HEAD~3 .githooks/pre-commit' },
      { tool: 'Bash', command: 'echo {} > .codecycle/tmp/guard-records.json' },
      { tool: 'PowerShell', command: 'Remove-Item .codecycle\\tool\\cli.ts' },
    ]) {
      expect((await as('a1', input)).deny, JSON.stringify(input)).toMatch(/steuert die Prüfung.*toolsmith/)
      expect((await as('fremd-1', input)).deny, `ohne Rolle: ${JSON.stringify(input)}`).toMatch(/steuert die Prüfung/)
      expect((await as('a2', input)).deny, `toolsmith: ${JSON.stringify(input)}`).toBeUndefined()
      expect((await as(undefined, input)).deny, `Hauptsitzung: ${JSON.stringify(input)}`).toBeUndefined()
    }
    // Anderes in .codecycle/tmp/ bleibt frei
    expect((await as('a1', { tool: 'Bash', command: 'echo x > .codecycle/tmp/notiz.txt' })).deny).toBeUndefined()
  })

  // Lese-Rollen schreiben nur ihren Bericht, Bash nach Erlaubtliste; auch mit fence aus
  test('Lese-Rollen schreiben nur ihren Bericht, Bash nur Erlaubtliste, Meldung nennt alles Erlaubte, Stopp-Hinweis nach 3', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, [PROJECT_MD]: FILES[PROJECT_MD]!.replace('fence: an', 'fence: aus') })
    let n = 0
    const ids: Record<string, string> = {}
    on('agent.spawn', (_$, e) => {
      const id = `ag${++n}`
      ids[e.subagentType ?? ''] = id
      return { model: e.model ?? 'inherit', agentId: id }
    })
    on('tool.call', () => ({ result: {} }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:reviewer')
    await spawn($, 'Richte das Projekt ein.', 'codecycle:setup')
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: alle`, 'codecycle:browser-reviewer')
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: P1`, 'codecycle:builder-logic')
    const rev = ids['codecycle:reviewer']!
    const call = (agentId: string, input: Record<string, unknown>) => $.tool.call({ ...input, agentId } as never)
    const write = (agentId: string, file_path: string) => call(agentId, { tool: 'Write', file_path, content: 'x' })
    const bash = (agentId: string, command: string) => call(agentId, { tool: 'Bash', command })

    expect((await write(rev, `/proj/${DIR}/reports/P1-reviewer.md`)).deny).toBeUndefined()
    const denied = (await write(rev, '/proj/src/Group.php')).deny
    expect(denied).toMatch(/Lese-Rolle reviewer.*src\/Group\.php/)
    // vollständige Liste des Erlaubten und Hinweis „nicht umgehen“
    expect(denied).toMatch(new RegExp(`Erlaubt.*/proj/${DIR}/reports/P1-reviewer\\.md`))
    expect(denied).toMatch(/codecycle test/)
    expect(denied).toMatch(/git status/)
    expect(denied).toMatch(/Nicht umgehen.*Offene Punkte/)
    expect((await bash(rev, 'codecycle test')).deny).toBeUndefined()
    expect((await write(rev, `/proj/${DIR}/reports/P1-builder-logic.md`)).deny).toMatch(/Lese-Rolle/)
    // drei Verweigerungen in Folge (Write, Edit, check): ab der dritten der Stopp-Hinweis, vorher nicht
    expect((await call(rev, { tool: 'Edit', file_path: '/proj/src/Group.php', old_string: 'a', new_string: 'b' })).deny).not.toMatch(/Stopp/)
    const third = (await bash(rev, 'codecycle check')).deny
    expect(third).toMatch(/codecycle check/)
    expect(third).toMatch(/Stopp/)
    expect((await bash(rev, 'echo x > src/Group.php')).deny).toMatch(/src\/Group\.php.*Stopp/)
    // ein erlaubter Aufruf setzt den Zähler zurück
    expect((await bash(rev, 'git diff')).deny).toBeUndefined()
    expect((await call(rev, { tool: 'PowerShell', command: 'Get-ChildItem' })).deny).toMatch(/PowerShell/)
    expect((await call(rev, { tool: 'PowerShell', command: 'Get-ChildItem' })).deny).not.toMatch(/Stopp/)
    // Lesen bleibt frei
    expect((await call(rev, { tool: 'Read', file_path: '/proj/src/Group.php' })).deny).toBeUndefined()

    // Einrichter: zusätzlich .claude/codecycle.md
    const setup = ids['codecycle:setup']!
    expect((await write(setup, '/proj/.claude/codecycle.md')).deny).toBeUndefined()
    // aktive Aufgabe: der Bericht liegt in deren Ordner
    expect((await write(setup, `/proj/${DIR}/reports/setup.md`)).deny).toBeUndefined()
    expect((await write(setup, '/proj/.codecycle/tool.config.json')).deny).toMatch(/Lese-Rolle setup/)
    // Browser-Prüfer: codecycle server
    expect((await bash(ids['codecycle:browser-reviewer']!, 'codecycle server')).deny).toBeUndefined()
    expect((await bash(ids['codecycle:browser-reviewer']!, 'codecycle server --temp --same')).deny).toBeUndefined()
    expect((await bash(ids['codecycle:browser-reviewer']!, 'codecycle server --stop')).deny).toBeUndefined()
    expect((await bash(ids['codecycle:browser-reviewer']!, 'codecycle server --port 80')).deny).toMatch(/codecycle server/)
    expect((await bash(ids['codecycle:browser-reviewer']!, 'EINKAUF_DATEI=x codecycle server --temp')).deny).toBeDefined()
    expect((await bash(rev, 'codecycle server')).deny).toMatch(/codecycle server/)
    // Bau-Rollen bleiben unberührt (fence aus)
    expect((await bash(ids['codecycle:builder-logic']!, 'codecycle check')).deny).toBeUndefined()
    expect((await write(ids['codecycle:builder-logic']!, '/proj/src/Group.php')).deny).toBeUndefined()
  })

  test('codecycle commit-tests nur für Test-Autor und Fehlersucher, die Hauptsitzung darf', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    let n = 0
    const ids: Record<string, string> = {}
    on('agent.spawn', (_$, e) => {
      const id = `ag${++n}`
      ids[e.subagentType ?? ''] = id
      return { model: e.model ?? 'inherit', agentId: id }
    })
    on('tool.call', () => ({ result: {} }))
    const prompt = `Aufgabenordner: ${DIR}/\nPaket: P1`
    for (const t of ['codecycle:test-author', 'codecycle:debugger', 'codecycle:builder-logic', 'codecycle:reviewer']) await spawn($, prompt, t)
    const run = (tool: string, command: string, agentId?: string) => $.tool.call({ tool, command, ...(agentId ? { agentId } : {}) } as never)
    const cmd = 'codecycle commit-tests -m "rote Tests P1"'
    expect((await run('Bash', cmd, ids['codecycle:test-author'])).deny).toBeUndefined()
    expect((await run('Bash', cmd, ids['codecycle:debugger'])).deny).toBeUndefined()
    expect((await run('Bash', cmd)).deny).toBeUndefined() // Hauptsitzung
    // außerhalb eines Paket-Branchs: Debugger und Hauptsitzung ja, Test-Autor nie
    const ohne = 'codecycle commit-tests -m "Reproduktion" --ohne-paket'
    expect((await run('Bash', ohne, ids['codecycle:test-author'])).deny).toMatch(/nur im Paket-Worktree/)
    expect((await run('Bash', ohne, ids['codecycle:debugger'])).deny).toBeUndefined()
    expect((await run('Bash', ohne)).deny).toBeUndefined()
    for (const role of ['codecycle:builder-logic', 'codecycle:reviewer']) {
      expect((await run('Bash', cmd, ids[role])).deny).toMatch(/rote Tests committet nur der Test-Autor bzw\. Debugger/)
    }
    // Rückfall, PowerShell, Verpackung, unbekannter Agent
    const builder = ids['codecycle:builder-logic']
    expect((await run('Bash', 'node .codecycle/tool/cli.ts commit-tests -m x', builder)).deny).toBeDefined()
    expect((await run('PowerShell', '& codecycle commit-tests -m x', builder)).deny).toBeDefined()
    expect((await run('PowerShell', 'node C:\\proj\\.codecycle\\tool\\cli.ts commit-tests -m x', builder)).deny).toBeDefined()
    expect((await run('Bash', `bash -c 'codecycle commit-tests -m x'`, builder)).deny).toBeDefined()
    expect((await run('Bash', cmd, 'unbekannt')).deny).toBeDefined()
    // normale Befehle und Erwähnungen laufen
    expect((await run('Bash', 'codecycle check --affected --staged', builder)).deny).toBeUndefined()
    expect((await run('Bash', 'git commit -m "codecycle commit-tests"', builder)).deny).toBeUndefined()
  })

  test('Grundlage für guard (guard --record, exclude, install-tool, hooks install) nur Bauleiter und toolsmith', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    let n = 0
    const ids: Record<string, string> = {}
    on('agent.spawn', (_$, e) => {
      const id = `ag${++n}`
      ids[e.subagentType ?? ''] = id
      return { model: e.model ?? 'inherit', agentId: id }
    })
    on('tool.call', () => ({ result: {} }))
    const prompt = `Aufgabenordner: ${DIR}/\nPaket: P1`
    for (const t of ['codecycle:toolsmith', 'codecycle:builder-logic', 'codecycle:test-author']) await spawn($, prompt, t)
    const run = (tool: string, command: string, agentId?: string) => $.tool.call({ tool, command, ...(agentId ? { agentId } : {}) } as never)
    const cmds = ['codecycle guard --record', 'codecycle exclude', 'codecycle install-tool', 'codecycle hooks install']
    for (const cmd of cmds) {
      expect((await run('Bash', cmd)).deny).toBeUndefined() // Hauptsitzung
    // außerhalb eines Paket-Branchs: Debugger und Hauptsitzung ja, Test-Autor nie
    const ohne = 'codecycle commit-tests -m "Reproduktion" --ohne-paket'
    expect((await run('Bash', ohne, ids['codecycle:test-author'])).deny).toMatch(/nur im Paket-Worktree/)
    expect((await run('Bash', ohne, ids['codecycle:debugger'])).deny).toBeUndefined()
    expect((await run('Bash', ohne)).deny).toBeUndefined()
      expect((await run('Bash', cmd, ids['codecycle:toolsmith'])).deny).toBeUndefined()
      for (const id of [ids['codecycle:builder-logic'], ids['codecycle:test-author'], 'unbekannt']) {
        expect((await run('Bash', cmd, id)).deny).toMatch(/Grundlage für guard setzt nur der Bauleiter oder codecycle:toolsmith/)
      }
    }
    const builder = ids['codecycle:builder-logic']
    expect((await run('PowerShell', 'node C:\\proj\\.codecycle\\tool\\cli.ts guard --record', builder)).deny).toBeDefined()
    expect((await run('Bash', `bash -c 'codecycle exclude'`, builder)).deny).toBeDefined()
    // prüfen ohne --record bleibt erlaubt
    expect((await run('Bash', 'codecycle guard --base main', builder)).deny).toBeUndefined()
    // paket start und fertig nur der Bauleiter, auch nicht toolsmith; paket pruefen frei
    for (const cmd of ['codecycle paket start P1', 'codecycle paket fertig P1']) {
      expect((await run('Bash', cmd)).deny).toBeUndefined()
      for (const id of [ids['codecycle:toolsmith'], builder, 'unbekannt']) {
        expect((await run('Bash', cmd, id)).deny).toMatch(/ruft nur der Bauleiter auf/)
      }
    }
    expect((await run('Bash', 'codecycle paket pruefen P1', builder)).deny).toBeUndefined()
    expect((await run('Bash', 'codecycle hooks status', builder)).deny).toBeUndefined()
  })
})

describe('Python-Sperre (Python-Befehle dürfen nicht hängen)', () => {
  const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  const STUB = 'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\r\nC:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe\r\n'
  const world = (on: Ops, where: string | null, env: Record<string, string>) => {
    mock.store(on)
    mock.env(on, env)
    fakeWorld(on, FILES)
    on('process.run', (_$, e) => {
      if (e.argv[0] === 'where') {
        if (where === null) throw new Error('where fehlt')
        return ok(where, where === '' ? 1 : 0)
      }
      return ok('24.15.0\n')
    })
    on('tool.call', () => ({ result: {} }))
  }
  const call = ($: Engine, tool: string, command: string) => $.tool.call({ tool, command } as never)

  test('Windows mit Store-Platzhalter: jeder Python-Aufruf gesperrt, Bash und PowerShell', async ($, on) => {
    world(on, STUB, { OS: 'Windows_NT' })
    // vor der Prüfung gilt: kein echtes Python
    expect((await call($, 'Bash', 'python3 -c "print(1)"')).deny).toMatch(/Microsoft-Store-Platzhalter/)
    await $.session.start({ cwd: 'C:/proj', surface: null } as never)
    expect((await call($, 'Bash', 'python3 -c "print(1)"')).deny).toMatch(/Microsoft-Store-Platzhalter.*node/)
    expect((await call($, 'PowerShell', 'py skript.py')).deny).toMatch(/Microsoft-Store-Platzhalter/)
    expect((await call($, 'Bash', 'python')).deny).toMatch(/auf Eingabe warten und hängen/)
    expect((await call($, 'Bash', 'node -e "1"')).deny).toBeUndefined()
  })

  test('Windows mit echtem Python: Aufrufe frei, nacktes python gesperrt; where scheitert = kein echtes Python', async ($, on) => {
    world(on, `C:\\Python312\\python.exe\r\n${STUB}`, { OS: 'Windows_NT' })
    await $.session.start({ cwd: 'C:/proj', surface: null } as never)
    expect((await call($, 'Bash', 'python3 -c "print(1)"')).deny).toBeUndefined()
    expect((await call($, 'PowerShell', 'python skript.py')).deny).toBeUndefined()
    expect((await call($, 'PowerShell', 'python')).deny).toMatch(/auf Eingabe warten/)
    // Heredoc in Bash und `python -` in PowerShell warten auf Eingabe, die nicht sicher ankommt
    expect((await call($, 'Bash', 'python3 - <<EOF\nprint(1)\nEOF')).deny).toMatch(/Heredoc/)
    expect((await call($, 'PowerShell', 'Get-Content x.py | python -')).deny).toMatch(/auf Eingabe warten/)
    // Bash-Pipe in `python -` kommt an
    expect((await call($, 'Bash', 'cat x.py | python -')).deny).toBeUndefined()
  })

  test('Windows, where nicht ausführbar: gesperrt', async ($, on) => {
    world(on, null, { OS: 'Windows_NT' })
    await $.session.start({ cwd: 'C:/proj', surface: null } as never)
    expect((await call($, 'Bash', 'python3 x.py')).deny).toMatch(/Microsoft-Store-Platzhalter/)
  })

  test('Nicht-Windows: nur nacktes python gesperrt', async ($, on) => {
    world(on, null, {})
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect((await call($, 'Bash', 'python3 x.py')).deny).toBeUndefined()
    expect((await call($, 'Bash', 'python3')).deny).toMatch(/auf Eingabe warten/)
    // Heredoc liefert das Skript; gesperrt nur unter Windows
    expect((await call($, 'Bash', "python3 - <<'EOF'\nprint(1)\nEOF")).deny).toBeUndefined()
    expect((await call($, 'Bash', 'python3 - <<EOF\nprint(1)\nEOF\npython')).deny).toMatch(/auf Eingabe warten/)
  })
})

