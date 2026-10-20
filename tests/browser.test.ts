// Browser nach dem Browser-Prüfer: endet er ohne browser_close, bekommt der Bauleiter beim nächsten Prompt einmal
// den Hinweis als Kontext (hooks/lib/browser-close.ts). Attrappen und Hilfen: ./helpers.

import { describe, expect, mock, test } from 'claude-code/testing'
import { DIR, FILES, spawn, fakeWorld } from './helpers'

const CLOSE = 'mcp__plugin_playwright_playwright__browser_close'
const NAV = 'mcp__plugin_playwright_playwright__browser_navigate'
const prompt = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

describe('Browser nach dem Browser-Prüfer', () => {
  test('ohne browser_close am Ende: Kontext einmal an den nächsten Prompt; mit browser_close: nichts', async ($, on) => {
    mock.store(on)
    fakeWorld(on, FILES)
    let n = 0
    const ids: Record<string, string> = {}
    on('agent.spawn', (_$, e) => {
      const id = `ag${++n}`
      ids[`${e.subagentType}-${n}`] = id
      return { model: e.model ?? 'inherit', agentId: id }
    })
    on('tool.call', () => ({ result: {} }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('prompt.submit', (_$, e) => ({ text: e.text, ...(e.context ? { context: e.context } : {}) }))
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const end = (agentId: string) => $.turn.complete({ answer: 'QUITTUNG', durationMs: 1, isAborted: false, turnId: 't', agentId, reason: 'answer' })
    const call = (agentId: string, tool: string) => $.tool.call({ tool, agentId } as never)

    // Lauf 1: navigiert, schließt nicht
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: alle`, 'codecycle:browser-reviewer')
    await call('ag1', NAV)
    await end('ag1')
    const first = await $.prompt.submit(prompt('weiter'))
    expect(first.context?.join('\n') ?? '').toMatch(/Browser offen, bitte schließen.*ag1.*browser_close/)
    // nur einmal
    expect((await $.prompt.submit(prompt('noch was'))).context ?? []).toEqual([])

    // Lauf 2: schließt am Ende
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: alle`, 'codecycle:browser-reviewer')
    await call('ag2', NAV)
    await call('ag2', CLOSE)
    await end('ag2')
    expect((await $.prompt.submit(prompt('weiter'))).context ?? []).toEqual([])

    // Lauf 3: ohne Browser-Aufruf (blockiert): nichts
    await spawn($, `Aufgabenordner: ${DIR}/\nPaket: alle`, 'codecycle:browser-reviewer')
    await end('ag3')
    expect((await $.prompt.submit(prompt('weiter'))).context ?? []).toEqual([])
  })
})
