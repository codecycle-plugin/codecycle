// Einrichtung des Projekts, Node-Prüfung und Werkzeug-Kopie beim Sitzungsstart.
// Einrichtung, Node-Prüfung und Werkzeug-Kopie aktuell halten. Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { BAND, FILES, spawn, CLOCK, fakeWorld } from './helpers'
import { TOOL_VERSION } from '../tool/version.ts'

describe('Einrichtung und Werkzeug-Kopie', () => {
  test('Einrichtung: Hinweis auf /codecycle:setup, Warnung bei fehlendem Node und Hinweis zur Werkzeug-Kopie', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    fakeWorld(on, files)
    let node: 'fehlt' | 'alt' | 'gut' = 'fehlt'
    on('process.run', (_$, e) => {
      if (e.argv[0] === 'git') return { value: { exitCode: 0, stdout: 'git version 2.55.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      if (node === 'fehlt') throw new Error('spawn node ENOENT')
      return { value: { exitCode: 0, stdout: node === 'alt' ? '22.3.0\n' : '24.15.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    // Terminal: volle Hinweisliste oben in der Seitenleiste; die Bautafel zeigt nur den ersten (unten geprüft)
    const band = async () => {
      const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'Pane', requestId: 'codecycle-panel', props: { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
      const r = {
        setup: await ui.find({ type: 'Text', text: /nicht eingerichtet: \/codecycle:setup/ }),
        fehlt: await ui.find({ type: 'Text', text: /Node fehlt/ }),
        alt: await ui.find({ type: 'Text', text: /Node 22\.3\.0 ist zu alt/ }),
        kopie: await ui.find({ type: 'Text', text: /Werkzeug-Kopie fehlt \(Plugin hat \d+\.\d+\.\d+\): \/codecycle:update(?!-)/ }),
        alt_kopie: await ui.find({ type: 'Text', text: /Werkzeug-Kopie 0\.0\.1, Plugin hat \d+\.\d+\.\d+: \/codecycle:update(?!-)/ }),
      }
      await ui.unmount()
      return r
    }
    // ohne .claude/codecycle.md: Einrichtung, kein Hinweis zur Werkzeug-Kopie
    const md = files['.claude/codecycle.md']!
    delete files['.claude/codecycle.md']
    await $.session.start({ cwd: '/proj', surface: null } as never)
    let r = await band()
    expect(r.setup).toBeDefined()
    expect(r.kopie).toBeUndefined()
    expect(r.fehlt).toBeDefined()
    // Bautafel im Terminal: Einrichtung zuerst, Node dahinter als „+1 weitere“; Desktop-App wie bisher
    const first = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    // Hinweis und „+1 weitere“ getrennt: der Hinweis wird gekürzt, der Zusatz bleibt sichtbar
    expect(await first.find({ type: 'Text', text: /^▲ Projekt noch nicht eingerichtet: \/codecycle:setup$/ })).toBeDefined()
    expect(await first.find({ type: 'Text', text: '+1 weitere unter Details' })).toBeDefined()
    expect(await first.find({ type: 'Text', text: /Node fehlt/ })).toBeUndefined()
    await first.unmount()
    const desktop = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', ...BAND })
    expect(await desktop.find({ type: 'Text', text: /nicht eingerichtet: \/codecycle:setup/ })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: /Node fehlt/ })).toBeDefined()
    await desktop.unmount()

    // .claude/codecycle.md da (frisch geklont), .codecycle/ fehlt: Hinweis auf /codecycle:update statt Einrichtung
    files['.claude/codecycle.md'] = md
    await $.session.start({ cwd: '/proj', surface: null } as never)
    r = await band()
    expect(r.setup).toBeUndefined()
    expect(r.kopie).toBeDefined()

    node = 'alt'
    await $.session.start({ cwd: '/proj', surface: null } as never)
    r = await band()
    expect(r.fehlt).toBeUndefined()
    expect(r.alt).toBeDefined()

    node = 'gut'
    files['.codecycle/tool.config.json'] = '{}'
    files['.codecycle/tool/.copy-info.json'] = '{"version":"0.0.1","hash":"x"}'
    await $.session.start({ cwd: '/proj', surface: null } as never)
    r = await band()
    expect(r.setup).toBeUndefined()
    expect(r.alt).toBeUndefined()
    expect(r.kopie).toBeUndefined()
    expect(r.alt_kopie).toBeDefined()

    // nach /codecycle:update verschwindet die Zeile im 10-Sekunden-Takt, ohne neue Sitzung
    files['.codecycle/tool/.copy-info.json'] = '{"version":"999.0.0","hash":"x"}'
    await CLOCK.current!.advance(10_000)
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Werkzeug-Kopie 0\.0\.1/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Werkzeug-Kopie 999\.0\.0 ist neuer als das Plugin .*: \/codecycle:update holt das neue Plugin/ })).toBeDefined()
    await ui.unmount()
  })
})


// /codecycle:update als Vorschlag im Eingabefeld, nur bei veralteter oder fehlender Kopie,
// beim Sitzungsstart und beim Wechsel im 10-s-Takt; Claudes eigener Vorschlag wird nicht ersetzt.
describe('Vorschlag /codecycle:update', () => {
  test('Kopie fehlt: Vorschlag beim Start; aktuell: keiner; neu veraltet: einmal im Takt', async ($, on) => {
    mock.store(on)
    const files: Record<string, string> = { ...FILES }
    fakeWorld(on, files)
    on('process.run', () => ({ value: { exitCode: 0, stdout: '24.15.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    const shown: string[] = []
    on('prompt.suggest', (_$, e) => {
      shown.push(`${e.origin.kind}:${e.text}`)
      return { isShown: true }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    expect(shown).toEqual(['plugin:/codecycle:update'])
    // Claudes eigener Vorschlag bleibt unverändert (Vorrang)
    const own = await $.prompt.suggest({ text: 'Tests laufen lassen', origin: { kind: 'suggestion' } })
    expect(own.isShown).toBe(true)
    expect(shown.at(-1)).toBe('suggestion:Tests laufen lassen')
    // Kopie aktuell: im Takt kein weiterer Vorschlag
    files['.codecycle/tool.config.json'] = '{}'
    shown.length = 0
    files['.codecycle/tool/.copy-info.json'] = `{"version":"${TOOL_VERSION}","hash":"x"}`
    await CLOCK.current!.advance(10_000)
    await CLOCK.current!.advance(10_000)
    expect(shown).toEqual([])
    // wieder veraltet: genau ein Vorschlag beim Wechsel, nicht alle 10 s
    files['.codecycle/tool/.copy-info.json'] = '{"version":"0.0.1","hash":"x"}'
    await CLOCK.current!.advance(10_000)
    await CLOCK.current!.advance(10_000)
    expect(shown).toEqual(['plugin:/codecycle:update'])
  })
})
