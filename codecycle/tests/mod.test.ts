// Bautafel und Zustand: Lesen von STATE.md und Limit-Stand (hooks/state.ts), Bautafel ohne Profil, Ein- und Ausklappen,
// Seitenleiste mit Beispieldaten. Die übrigen Mod-Tests liegen nach Fachbereich in den
// Dateien neben dieser (Attrappen und Hilfen: ./helpers).

import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { EMPTY_BOARD, limitsFrom, parseState, pickActive, staleLimits, statusText } from '../hooks/state'

const STATE = `---
aufgabe: einkaufsliste-teilen
art: feature            # feature | bugfix
groesse: gross
zustand: in-arbeit
branch: codecycle/einkaufsliste-teilen
budget: { geplant: 11, verbraucht: 7 }
planrunden: 1
zuletzt: tag-1
pakete:
  - { id: P1, rolle: logik,   status: fertig,    agent: a1b2c3, commit: 3f2e1aa, runden: 1 }
  - { id: P2, rolle: routine, status: in-arbeit, agent: d4e5f6, commit: null,    runden: 0 }
  - { id: P3, rolle: logik,   status: blockiert, agent: null,   commit: null,    runden: 0 }
---

## Nächster Schritt
P2 umsetzen.

## Offene Fragen
- keine

## Blocker
- P3 wartet auf P2.
`

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

type Engine = Parameters<TestBody>[0]
type Ops = Parameters<typeof mock.store>[0]

/**
 * Beispieldaten gibt es nur mit dem Schalter demo-data: Sitzungsstart mit einer
 * Projektbeschreibung, die ihn einschaltet, ohne Aufgabenordner.
 */
async function startWithDemo($: Engine, on: Ops) {
  on('fs.exists', (_$, e) => ({ value: e.path.replace(/\\/g, '/').endsWith('.claude/codecycle.md') }))
  on('fs.read', () => ({ value: '## Schalter\n- demo-data: an\n' }))
  on('fs.list', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.root', () => ({ value: '/proj' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: e.name } }))
  on('process.run', () => {
    throw new Error('kein Prozess im Test')
  })
  on('ui.log', () => ({ value: undefined }))
  mock.clock(on)
  await $.session.start({ cwd: '/proj', surface: null } as never)
}

describe('STATE.md lesen', () => {
  test('Kopf und Abschnitte; eine alte STATE.md mit Block pakete: wird fehlerfrei gelesen, der Block bleibt unbeachtet', () => {
    const b = parseState(STATE, 'docs/codecycle/x/STATE.md')
    expect(b.aufgabe).toBe('einkaufsliste-teilen')
    expect(b.art).toBe('feature')
    expect(b.budget).toEqual({ geplant: 11, verbraucht: 7, nachlauf: 0 })
    expect(b.zuletzt).toBe('tag-1')
    expect('pakete' in b).toBe(false)
    expect(b.naechsterSchritt).toEqual(['P2 umsetzen.'])
    expect(b.offeneFragen).toEqual([])
    expect(b.blocker).toEqual(['P3 wartet auf P2.'])
    expect(statusText({ fuenfStunden: 42, woche: 18 }, b)).toBe('5h 42% · einkaufsliste-teilen')
  })

  test('ohne YAML-Kopf wird abgelehnt, fertige Aufgaben sind nicht aktiv', () => {
    expect(() => parseState('# nur Text', 'x')).toThrow()
    const done = { ...parseState(STATE, 'a'), zustand: 'fertig' }
    expect(pickActive([done])).toBe(undefined)
  })

  test('Limit-Fenster der API', () => {
    const lim = limitsFrom([
      { kind: 'five_hour', percentUsed: 37.5, resetsAt: '2026-10-07T18:00:00Z' },
      { kind: 'seven_day', percentUsed: 12 },
    ])
    expect(lim.fuenfStunden).toBe(37.5)
    expect(lim.woche).toBe(12)
    expect(lim.resetFuenf).toBe('2026-10-07T18:00:00Z')
    expect(limitsFrom([]).fuenfStunden).toBe(null)
    const b = parseState(STATE, 'a')
    expect(statusText(limitsFrom([]), b)).toBe('5h – · einkaufsliste-teilen')
    // Ohne offene Aufgabe nur das 5-Stunden-Fenster
    expect(statusText({ fuenfStunden: 26, woche: 3 }, EMPTY_BOARD)).toBe('5h 26%')
  })

  test('Alter Limit-Stand: Stand, abgelaufenes Fenster, ungültiger Speicher', () => {
    const hm = (ms: number) => {
      const d = new Date(ms)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const at = Date.UTC(2026, 9, 8, 11, 5)
    const now = Date.UTC(2026, 9, 8, 12)
    const lim = { fuenfStunden: 11, woche: 40, resetFuenf: '2026-10-08T18:00:00Z', resetWoche: '2026-10-12T00:00:00Z' }
    const shown = staleLimits({ at, limits: lim }, now)
    expect(shown?.stand).toBe(hm(at))
    expect(shown?.lim.fuenfStunden).toBe(11)
    expect(shown?.lim.woche).toBe(40)
    expect(shown?.neuFuenf).toBeUndefined()
    expect(statusText(shown!.lim, EMPTY_BOARD, shown)).toBe(`5h 11% (Stand ${hm(at)})`)
    // 5-Stunden-Fenster schon zurückgesetzt: keine Zahl, „neu seit“; Woche bleibt
    const expired = staleLimits({ at, limits: { ...lim, resetFuenf: '2026-10-08T11:30:00Z' } }, now)
    expect(expired?.lim.fuenfStunden).toBe(null)
    expect(expired?.neuFuenf).toBe(hm(Date.parse('2026-10-08T11:30:00Z')))
    expect(expired?.lim.woche).toBe(40)
    expect(statusText(expired!.lim, EMPTY_BOARD, expired)).toBe(`5h neu seit ${hm(Date.parse('2026-10-08T11:30:00Z'))}`)
    // ohne gültigen Eintrag nichts anzeigen
    expect(staleLimits(undefined, now)).toBeUndefined()
    expect(staleLimits({ at: 'x' }, now)).toBeUndefined()
    expect(staleLimits({ at, limits: { fuenfStunden: null, woche: null } }, now)).toBeUndefined()
  })
})

describe('Mod', () => {
  test('Bautafel ohne Profil-Zeile: Aufgabe mit Knöpfen „Details“ und Einklappen, keine Statuszeile', async ($, on) => {
    mock.store(on)
    const statuses: (string | undefined)[] = []
    on('ui.status', (_$, e) => {
      statuses.push(e.text)
      return { value: undefined }
    })
    // Statuszeile: in keiner Oberfläche (weder Terminal noch Desktop-App)
    let surfaces: string[] = ['desktop']
    on('session.surfaces', () => ({ value: surfaces }) as never)
    await startWithDemo($, on)
    const noProfile = (all: string) => {
      expect(all).not.toMatch(/"key":"profile-|"key":"row-profile"|profile-group/)
      expect(all).not.toMatch(/\b(Profil|sparsam|großzügig|extrem)\b|gesperrt/)
    }
    // Desktop-App
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', ...BAND })
    noProfile(JSON.stringify(await ui.find({})))
    expect(await ui.find({ type: 'Text', text: /\d+\/\d+ Läufe/ })).toBeDefined()
    expect(await ui.find({ key: 'panel' })).toBeDefined()
    expect(await ui.find({ key: 'collapse' })).toBeDefined()
    // Auch die Desktop-App bekommt keine Statuszeile (Limit in der Fußzeile)
    expect(statuses.length).toBeGreaterThan(0)
    expect(statuses.every(s => s === undefined)).toBe(true)
    await ui.unmount()

    // Terminal: Aufgabe und Bedienknöpfe in der ersten Zeile im Rahmen; keine Statuszeile
    surfaces = ['terminal']
    const term = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    noProfile(JSON.stringify(await term.find({})))
    expect(await term.find({ type: 'Text', text: /\d+\/\d+ Läufe/ })).toBeDefined()
    expect((await term.find({ key: 'panel' }))?.props.plain).toBe(true)
    expect((await term.find({ key: 'collapse' }))?.props.plain).toBe(true)
    expect(statuses.at(-1)).toBeUndefined()
    await term.unmount()
  })

  test('ohne Aufgabe und ohne demo-data: Bautafel zeigt „Keine offene Aufgabe“ statt Beispieldaten', async ($, on) => {
    mock.store(on)
    const ui = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Keine offene Aufgabe/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\d+\/\d+ Läufe|einkaufsliste/ })).toBe(undefined)
    // Knopf zur Seitenleiste auch ohne Aufgabe
    expect(await ui.find({ key: 'panel' })).toBeDefined()
    await ui.unmount()
  })

  test('/codecycle-panel öffnet die Seitenleiste ohne Ausgabezeile im Verlauf', async ($, on) => {
    mock.store(on)
    let opened = 0
    on('ui.open', () => {
      opened += 1
      return { value: { isPlaced: true } } as never
    })
    const r = await $.command.run({ ...RUN, command: 'codecycle-panel', args: '' })
    expect(opened).toBe(1)
    expect(r.text).toBe(undefined)
  })

  test('Seitenleiste zeigt Budget, Kosten, Fragen und Blocker (Beispieldaten mit demo-data)', async ($, on) => {
    mock.store(on)
    on('ui.status', () => ({ value: undefined }))
    await startWithDemo($, on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'codecycle',
        surface,
        component: 'Pane',
        requestId: 'codecycle-panel',
        props: {
          title: 'codecycle',
          isFocused: true,
          bodyColumns: 60,
          placement: 'dock',
          scroll: { offset: 0, bodyRows: 40 },
          view: {},
        },
      })
      if (surface === 'terminal') {
        // Blocker mit ▎ in Rot, kein Abschnitt Pakete, kein Limit, kein „Schließen“
        expect(await ui.find({ type: 'Text', text: /^Pakete$/ })).toBeUndefined()
        expect((await ui.find({ type: 'Text', text: /^▎ Teil Freigabe wartet/ }))?.props.color).toBe('red')
        expect((await ui.find({ type: 'Text', text: /^Kosten pro Rolle$/ }))?.props.color).toBe('cyan')
        expect(await ui.find({ type: 'Text', text: /^Limit$/ })).toBeUndefined()
        expect(await ui.find({ key: 'close' })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: /Kosten pro Rolle/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /Offene Fragen/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /Blocker/ })).toBeDefined()
      } else {
        // jeder Abschnitt hat einen Kopfknopf `sec-<id>` „▾ Titel“; kein Abschnitt Pakete, kein Abschnitt Limit
        expect(await ui.find({ key: 'sec-pakete' })).toBeUndefined()
        // Kein eigener Knopf „Schließen“, das ✕ der App reicht
        expect(await ui.find({ key: 'close' })).toBeUndefined()
        // „Kosten pro Rolle“ beginnt zu; ein Druck öffnet ihn, die Rollen stehen auf Deutsch da
        expect(String((await ui.find({ key: 'sec-kosten' }))?.props.label ?? '')).toMatch(/^▸ Kosten pro Rolle/)
        await ui.press({ key: 'sec-kosten' })
        expect(String((await ui.find({ key: 'sec-kosten' }))?.props.label ?? '')).toMatch(/^▾ Kosten pro Rolle/)
        expect(await ui.find({ type: 'Text', text: /^builder$|^final-reviewer$/ })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: /^Bauender$/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /^Schlussprüfer$/ })).toBeDefined()
        // Budget als Zeilen mit Balken und Prozent, kein doppelter Text
        expect(JSON.stringify(await ui.find({ key: 'budget-laeufe' }))).toMatch(/Läufe.*\d+ %/)
        expect(String((await ui.find({ key: 'sec-fragen' }))?.props.label ?? '')).toMatch(/^▾ Offene Fragen/)
        expect(String((await ui.find({ key: 'sec-blocker' }))?.props.label ?? '')).toMatch(/^▾ Blocker/)
        expect(await ui.find({ key: 'sec-limit' })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: /^Limit$|5 Std\./ })).toBeUndefined()
      }
      expect(await ui.find({ type: 'Text', text: /\d+\/\d+ Läufe/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('Seitenleiste Desktop: ein Druck auf `sec-budget` klappt den Abschnitt zu und beim zweiten Druck wieder auf', async ($, on) => {
    mock.store(on)
    // Engine ab 2.1.299 (Schriftstärke im Knopf)
    on('session.version', () => ({ value: { version: '2.1.299', base: '2.1.299' } }) as never)
    on('ui.status', () => ({ value: undefined }))
    await startWithDemo($, on)
    const ui = await $.ui.mount({
      plugin: 'codecycle',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'codecycle-panel',
      props: { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    const label = async (id: string) => String((await ui.find({ key: `sec-${id}` }))?.props.label ?? '')
    // alle Abschnitte beginnen offen
    expect(await label('budget')).toMatch(/^▾ Budget/)
    expect(await ui.find({ key: 'budget-laeufe' })).toBeDefined()
    await ui.press({ key: 'sec-budget' })
    expect(await label('budget')).toMatch(/^▸ Budget/)
    expect(await ui.find({ key: 'budget-laeufe' })).toBeUndefined()
    // andere Abschnitte bleiben offen
    expect(await label('fragen')).toMatch(/^▾ Offene Fragen/)
    await ui.press({ key: 'sec-budget' })
    expect(await label('budget')).toMatch(/^▾ Budget/)
    expect(await ui.find({ key: 'budget-laeufe' })).toBeDefined()
    // Titel als Text im Knopf, Stärke `medium`
    const kopf = JSON.stringify(await ui.find({ key: 'sec-budget' }))
    expect(kopf).toMatch(/"weight":"medium"/)
    // Abstände wie in der Seitenleiste, Quelle ohne „Quelle:“
    expect(JSON.stringify(await ui.find({ key: 'abschnitt-budget' }))).toMatch(/"marginTop":"lg"/)
    expect(JSON.stringify(await ui.find({ key: 'foot' }))).not.toMatch(/Quelle:/)
    // Kopfzeile lesbar
    expect(JSON.stringify(await ui.find({ key: 'kopf' }))).toMatch(/Feature · groß/)
    // Beispieldaten haben nur eine offene Frage und keine Kennzahlen: „+n weitere“ ist hier nicht zu sehen
    expect(await ui.find({ key: 'mehr-fragen' })).toBeUndefined()
    await ui.unmount()
  })

  test('ältere Engine (Desktop-App mit 2.1.295) bekommt kein weight, size, tabular und keine Abstandsstufen', async ($, on) => {
    mock.store(on)
    on('ui.status', () => ({ value: undefined }))
    on('session.version', () => ({ value: { version: '2.1.295', base: '2.1.295' } }) as never)
    await startWithDemo($, on)
    const band = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', ...BAND })
    const pane = await $.ui.mount({
      plugin: 'codecycle',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'codecycle-panel',
      props: { title: 'codecycle', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    for (const ui of [band, pane]) {
      const all = JSON.stringify(await ui.find({}))
      // das Test-Kit von 2.1.299 schreibt `bold` zusätzlich als weight semibold; eigenes weight stünde ohne bold
      expect(all).not.toMatch(/"(size|tabular|mono)":/)
      expect(all).not.toMatch(/{"weight":/)
      expect(all).not.toMatch(/"(marginTop|paddingLeft|paddingY|paddingRight|rowGap|columnGap)":"(xs|sm|md|lg|xl)"/)
    }
    expect(await band.find({ key: 'panel' })).toBeDefined()
    await band.unmount()
    await pane.unmount()
  })

  test('Bautafel lässt sich ein- und ausklappen', async ($, on) => {
    mock.store(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'codecycle', surface, ...BAND })
      await ui.press({ key: 'collapse' })
      expect(await ui.find({ key: 'expand' })).toBeDefined()
      expect(await ui.find({ key: 'collapse' })).toBe(undefined)
      // Der Knopf zur Seitenleiste bleibt auch eingeklappt da (Desktop: Hotkey d bei fokussierter Bautafel;
      // Terminal: Knöpfe nur per Klick, keine Kürzel)
      expect((await ui.find({ key: 'panel' }))?.props.hotkey).toBe(surface === 'terminal' ? undefined : 'd')
      await ui.press({ key: 'expand' })
      expect(await ui.find({ key: 'collapse' })).toBeDefined()
      await ui.unmount()
    }
  })
})

describe('Fußzeile rechts im Terminal: Modell, Effort, Limit', () => {
  test('Modell ● + Knopf, Effort (Startwert gedimmt, gemessen, /effort mit Stufe sofort), 2-s-Takt, Modellwechsel, Klick öffnet den Befehl direkt', async ($, on) => {
    mock.store(on)
    let model = 'claude-opus-5-5[1m]'
    let saved: string | undefined
    let savedSonnet: string | undefined
    on('fs.exists', () => ({ value: false }))
    on('fs.read', () => ({ value: '' }))
    on('fs.list', () => ({ value: [] }))
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { window: 200000 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 62, resetsAt: '2026-10-08T14:40:00Z' },
          { kind: 'seven_day', percentUsed: 21 },
        ],
      },
    }))
    on('session.model', () => ({ value: model }) as never)
    // der Effort-Takt läuft nur, wenn im Terminal gezeichnet wird
    on('session.surfaces', () => ({ value: ['terminal'] }) as never)
    on('session.root', () => ({ value: '/proj' }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('tool.register', (_$, e) => ({ value: { tool: e.name } }))
    on('process.run', () => {
      throw new Error('kein Prozess im Test')
    })
    on('ui.log', () => ({ value: undefined }))
    on('ui.status', () => ({ value: undefined }))
    // keine Umgebungsvariable (sonst gälte CLAUDE_CODE_EFFORT_LEVEL der Maschine)
    on('env.get', () => ({ value: undefined }) as never)
    on('settings.read', () =>
      ({
        value: {
          modelSettings: {
            ...(saved ? { 'claude-opus-5-5': { effortLevel: saved } } : {}),
            ...(savedSonnet ? { 'claude-sonnet-5-5': { effortLevel: savedSonnet } } : {}),
          },
        },
      }) as never,
    )
    const clock = mock.clock(on)
    on('ui.render', { component: 'SessionMode' }, () => ({ type: 'engine', ref: 1 }) as never)
    const runs: string[] = []
    const fills: string[] = []
    on('prompt.fill', (_$, e) => {
      fills.push(e.text)
      return { isFilled: true } as never
    })
    on('command.run', { command: 'model' }, (_$, e) => {
      runs.push(e.command)
      return {}
    })
    on('command.run', { command: 'effort' }, (_$, e) => {
      runs.push(e.command)
      return {}
    })
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { model: 'x', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    })
    await $.session.start({ cwd: '/proj', surface: null } as never)
    const modes = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'SessionMode', props: { modes: ['auto'] } } as never)
    const effort = async () => (await modes.find({ key: 'effort' }))?.props
    expect(String((await modes.find({ key: 'model' }))?.props.label)).toBe('Opus 5.5')
    // ● in der Modellfarbe (Opus #8B5CF6), Name als Knopf, kein ▾; hover zeigt der Test-Rahmen nicht an: live prüfen
    expect((await modes.find({ type: 'Text', text: /^●$/ }))?.props.color).toBe('#8B5CF6')
    expect(await modes.find({ type: 'Text', text: /▾/ })).toBeUndefined()
    // ohne Einstellung: Standard des Modells (Opus 5.5: medium), gedimmt
    expect(String((await effort())?.label)).toBe('mittel')
    expect((await effort())?.dimColor).toBe(true)
    // Limit Variante 1: Balken, Prozent in Ampelfarbe, Reset in Klammern, │ Woche
    expect(await modes.find({ type: 'Text', text: /^5h ━+─+ 62 % \(↻ (\S+ )?\d\d:\d\d\)/ })).toBeDefined()
    expect((await modes.find({ type: 'Text', text: /^ 62 %$/ }))?.props.color).toBe('yellow')
    expect((await modes.find({ type: 'Text', text: /^ 21 %$/ }))?.props.color).toBe('green')
    expect(await modes.find({ type: 'Text', text: /^Woche / })).toBeDefined()
    // turn.step der Hauptsitzung (ohne agentId): gemessen, maßgeblich
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'high', messageCount: 1 } as never)) void chunk
    expect(String((await effort())?.label)).toBe('hoch')
    expect((await effort())?.dimColor).toBe(false)
    // /effort mit Stufe: sofort
    await $.command.run({ ...RUN, command: 'effort', args: 'low' })
    expect(String((await effort())?.label)).toBe('niedrig')
    // /effort ohne Stufe (Regler): der 2-s-Takt übernimmt die gespeicherte Änderung
    await $.command.run({ ...RUN, command: 'effort', args: '' })
    saved = 'xhigh'
    await clock.advance(2_100)
    expect(String((await effort())?.label)).toBe('sehr hoch')
    // Klick auf Effort und Modell: Befehl direkt (eigener Uhr-Durchlauf, nicht abgewartet), nichts ins Eingabefeld
    await modes.press({ key: 'effort' })
    await modes.press({ key: 'model' })
    await clock.advance(10)
    expect(fills).toEqual([])
    expect(runs).toEqual(['effort', 'effort', 'effort', 'model'])
    // gespeicherte Änderung ohne /effort-Ereignis
    saved = 'high'
    await clock.advance(2_100)
    expect(String((await effort())?.label)).toBe('hoch')
    // Modellwechsel ohne Meldung an den Mod: der Takt liest das Modell neu, Startwert des neuen Modells gedimmt
    model = 'claude-sonnet-5-5'
    await clock.advance(2_100)
    expect(String((await modes.find({ key: 'model' }))?.props.label)).toBe('Sonnet 5.5')
    expect(String((await effort())?.label)).toBe('mittel')
    expect((await effort())?.dimColor).toBe(true)
    savedSonnet = 'high'
    await clock.advance(2_100)
    expect(String((await effort())?.label)).toBe('hoch')
    expect((await effort())?.dimColor).toBe(false)
    await modes.unmount()
    // Desktop-App: je Limit ein Etikett mit Name, kurzem Balken und Prozent in der Farbe nach Stand, kein Knopf `model`
    // und kein Effort (die App hat ihre eigene Modellauswahl); die Angaben der Engine bleiben daneben
    const desktop = await $.ui.mount({ plugin: 'codecycle', surface: 'desktop', component: 'SessionMode', props: { modes: ['auto'] } } as never)
    expect(await desktop.find({ key: 'model' })).toBeUndefined()
    expect(await desktop.find({ key: 'effort' })).toBeUndefined()
    // nur Text „5h 62 % (↻…) │ W 21 %“; Text eines Stücks ohne Abstände, Reset nur beim 5-Stunden-Fenster
    expect(String((await desktop.find({ key: 'fuss-fuenf' }))?.text)).toMatch(/^5h62 %(\(↻.+\))?$/)
    expect((await desktop.find({ type: 'Text', text: '62 %' }))?.props.color).toBe('suggestion')
    expect(String((await desktop.find({ key: 'fuss-woche' }))?.text)).toMatch(/^W(\d+) %$/)
    expect((await desktop.find({ type: 'Text', text: '21 %' }))?.props.color).toBe('suggestion')
    expect(await desktop.find({ type: 'Text', text: /[━─]/ })).toBeUndefined()
    expect(JSON.stringify(await desktop.find({ type: 'Box' }))).toMatch(/engine/)
    await desktop.unmount()
  })

  test('Klick: scheitert der Befehl, kommt „/effort “ ins Eingabefeld (Rückfall)', async ($, on) => {
    mock.store(on)
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('ui.log', () => ({ value: undefined }))
    on('settings.read', () => ({ value: {} }) as never)
    on('env.get', () => ({ value: undefined }) as never)
    const clock = mock.clock(on)
    on('ui.render', { component: 'SessionMode' }, () => ({ type: 'engine', ref: 1 }) as never)
    const fills: string[] = []
    on('prompt.fill', (_$, e) => {
      fills.push(e.text)
      return { isFilled: true } as never
    })
    on('command.run', { command: 'effort' }, () => {
      throw new Error('kein Regler')
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    // ohne session.start: das Modell kommt mit dem ersten Zug
    await $.turn.start({ text: 'los', turnId: 't1' })
    const modes = await $.ui.mount({ plugin: 'codecycle', surface: 'terminal', component: 'SessionMode', props: { modes: [] } } as never)
    expect(String((await modes.find({ key: 'model' }))?.props.label)).toBe('Sonnet 5.5')
    expect(String((await modes.find({ key: 'effort' }))?.props.label)).toBe('mittel')
    await modes.press({ key: 'effort' })
    await clock.advance(10)
    expect(fills).toEqual(['/effort '])
    await modes.unmount()
  })
})
