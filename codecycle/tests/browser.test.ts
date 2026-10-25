// Browser nach dem Schlussprüfer: endet er ohne browser_close, bekommt der Bauleiter beim nächsten Prompt einmal
// den Hinweis als Kontext (hooks/lib/browser-close.ts). Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { FILES, spawn, fakeWorld } from './helpers'

const CLOSE = 'mcp__plugin_playwright_playwright__browser_close'
const NAV = 'mcp__plugin_playwright_playwright__browser_navigate'
const SDIR = 'docs/codecycle/solo-s'
const SOLO_STATE = `---\naufgabe: solo-s\nart: feature\ngroesse: klein\nzustand: in-arbeit\nweg: solo\nhaltepunkt: 3\nbranch: codecycle/s\nbudget: { geplant: 0, verbraucht: 0, nachlauf: 0 }\nzuletzt: tag-1\ngeprueftAuf: abc1234\n---\n\n## Nächster Schritt\nPrüfen.\n`
const prompt = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

describe('Browser nach dem Schlussprüfer', () => {
  test('ohne browser_close am Ende: Kontext einmal an den nächsten Prompt; mit browser_close: nichts', async ($, on) => {
    mock.store(on)
    fakeWorld(on, { ...FILES, [`${SDIR}/STATE.md`]: SOLO_STATE })
    // git diff seit geprueftAuf: nichts außerhalb des Aufgabenordners geändert (Startsperre offen)
    on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    let n = 0
    on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag${++n}` }))
    on('tool.call', () => ({ result: {} }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('prompt.submit', (_$, e) => ({ text: e.text, ...(e.context ? { context: e.context } : {}) }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const end = (agentId: string) => $.turn.complete({ answer: 'QUITTUNG', durationMs: 1, isAborted: false, turnId: 't', agentId, reason: 'answer' })
    const call = (agentId: string, tool: string) => $.tool.call({ tool, agentId } as never)
    const start = async () => expect((await spawn($, `Aufgabenordner: ${SDIR}/\nWortlaut und Diff: …`, 'codecycle:final-reviewer')).deny).toBeUndefined()

    // Lauf 1: navigiert, schließt nicht
    await start()
    await call('ag1', NAV)
    await end('ag1')
    const first = await $.prompt.submit(prompt('weiter'))
    expect(first.context?.join('\n') ?? '').toMatch(/Browser offen, bitte schließen.*ag1.*browser_close/)
    // nur einmal
    expect((await $.prompt.submit(prompt('noch was'))).context ?? []).toEqual([])

    // Lauf 2: schließt am Ende
    await start()
    await call('ag2', NAV)
    await call('ag2', CLOSE)
    await end('ag2')
    expect((await $.prompt.submit(prompt('weiter'))).context ?? []).toEqual([])

    // Lauf 3: ohne Browser-Aufruf: nichts
    await start()
    await end('ag3')
    expect((await $.prompt.submit(prompt('weiter'))).context ?? []).toEqual([])
  })
})
