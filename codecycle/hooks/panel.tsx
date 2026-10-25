// Seitenleiste (on('ui.render', { component: 'Pane', requestId: PANE })): reine Funktion „Daten → JSX“.
// Der Handler in register.tsx sammelt die Daten (alle `$`-Aufrufe, Atome, Zustand des Mods)
// und gibt fertige Rückrufe mit; diese Datei sieht `$` nie. Die Elemente (Box, Button, Text, Svg) kommen aus
// `$.ui.resolve(e)` als Parameter, `h` ist das globale JSX-Werkzeug des Mods.

import type { ElementTable, RenderChildren } from 'claude-code'

import type { Board, Limits, Metrics } from '../types'
import { TASKS_DIR } from '../lib/paths.ts'
import { canonicalRole } from '../lib/roles.ts'
import { bar, percent, resetText, type ShownLimits } from './state'
import { runsText } from './lib/budget.ts'
import { type AgentRow, type agentDetail, cacheState, cacheText, crewSummary, kontoText, modelName, progressLabel, timeText, usageText, weightedText } from './lib/agent-view.ts'
import { type CrewHead, HEAD_H, ROW_H, agentRowSvg, crewHeadSvg, metaText, shareText, statsText } from './lib/agent-svg.ts'
import { modelColor, modelFamily, roleGlyph, roleLabel } from './lib/figure-meta.ts'
import { shortTokens } from './lib/ledger-costs.ts'
import { termBar } from './band.tsx'
import { deskBar, deskChip, deskNote, deskRule } from './desk.tsx'
import { taskMetaText } from './lib/desk-parts.ts'
import {
  HINT_GLYPH,
  TERM_STATUS,
  type Hint,
  comma,
  costBarLength,
  fitParts,
  isWide,
  levelColor,
  paneWidth,
  quoteLines,
  rule,
  runsCount,
} from './lib/term-parts.ts'

/** Breite (CSS-Pixel), die der Knopf › rechts neben einer Agentenzeile bekommt (geschätzt, live prüfen) */
export const DETAIL_BUTTON_W = 32

/** Was die Seitenleiste zeigt (vom Handler gesammelt) */
export type PanelData = {
  /** `e.surface` und `e.props.bodyColumns` des Zeichenereignisses */
  surface: string
  bodyColumns: number
  board: Board
  rows: AgentRow[]
  /** `crewNow` (Uhr des Mods) */
  now: number
  /** Detailansicht eines Agenten (Klick auf „Details“), sonst null */
  detail: { row: AgentRow; info: ReturnType<typeof agentDetail> } | null
  head: CrewHead
  /** Limit-Block (bei neuer Sitzung ohne Messwert der alte Stand, `alt`) */
  shown: Limits
  alt?: ShownLimits
  kosten: Board['kosten']
  kennzahlen: Board['kennzahlen']
  /** Summe der Rollenwerte in Prozentpunkten */
  agentenProzent: number
  /** Hinweise mit Art; im Terminal in fester Rangfolge, sonst wie bisher */
  notes: Hint[]
  /** Cache-Zeit des Bauleiters als Text, leer ohne Anfrage */
  mainCache: string
  /** Zugeklappte Abschnitte (Desktop-App) */
  closed: string[]
  /** Engine kennt `weight`, `size`, `tabular`, Abstandsstufen (ab 2.1.299); sonst Aussehen von 0.13.1 */
  rich: boolean
}

/** Rückrufe, die der Handler mit `$` bereitstellt */
export type PanelActions = {
  onSelectAgent: (id: string) => void
  onBack: () => void
  /** Abschnitt der Seitenleiste auf- oder zuklappen (Desktop-App) */
  onToggleSection: (id: string) => void
}

/** Kopfzeile der Leiste als Text (Terminal, Alt-Text): Fenster wie Statuszeile, Anteil der Aufgabe getrennt. */
function crewAlt(rows: readonly AgentRow[], head: CrewHead): string {
  const s = crewSummary(rows)
  return `${s.laufend} ${s.laufend === 1 ? 'läuft' : 'laufen'}, ${s.fertig} fertig${s.abgebrochen > 0 ? `, ${s.abgebrochen} abgebrochen` : ''} · ${weightedText(s.gewichtet)} · ${usageText(s.frisch, s.cache)} · 5 Std. ${percent(head.fuenf)} · ${shareText(head)}`
}

/**
 * Summenzeilen unter „Kosten pro Rolle“ (beide Oberflächen): Agenten (Summe der Rollen), Bauleiter und, falls es welche
 * gab, fremde Agenten. Zuerst die gewichteten Tokens (Hauptmaß), dann neu und Cache; die Prozentpunkte des 5h-Fensters
 * nur mit `konto` und zuletzt, als Konto-Näherung gekennzeichnet (Entscheidung 2a).
 */
export function costSumLines(k: Metrics, agentenProzent: number, mainCache: string, konto: boolean): { key: string; text: string }[] {
  const gew = (n: number | undefined) => (n === undefined ? '' : `${weightedText(n)} · `)
  const fremdFrisch = k.fremd?.frisch ?? 0
  const fremdCache = k.fremd?.cache ?? 0
  const family = k.bauleiterModell ? modelFamily(k.bauleiterModell) : null
  const lines = [
    {
      key: 'agenten',
      text: `Agenten: ${gew(k.agentenGewichtet)}${usageText((k.frisch ?? k.tokens) - (k.bauleiterFrisch ?? 0) - fremdFrisch, (k.cache ?? 0) - (k.bauleiterCache ?? 0) - fremdCache)}${konto ? ` · ${kontoText(agentenProzent)}` : ''}`,
    },
    {
      key: 'bauleiter',
      text: `Bauleiter${k.bauleiterModell ? ` (${family === 'other' ? k.bauleiterModell : family})` : ''}: ${gew(k.bauleiterGewichtet)}${
        k.bauleiterFrisch !== undefined ? usageText(k.bauleiterFrisch, k.bauleiterCache ?? 0) : shortTokens(k.hauptsitzung)
      }${mainCache ? ` · ${mainCache}` : ''}${konto ? ` · ${kontoText(k.bauleiterProzent ?? 0)}` : ''}`,
    },
  ]
  if (k.fremd) lines.push({ key: 'fremd', text: `Fremde Agenten: ${weightedText(k.fremd.gewichtet)} · ${usageText(k.fremd.frisch, k.fremd.cache)}` })
  return lines
}

/** Summenzeilen im Terminal: je Zeile mit Konto-Näherung, wenn sie in `width` passt, sonst ohne. */
function sumLinesFitting(k: Metrics, agentenProzent: number, mainCache: string, wide: boolean, width: number): { key: string; text: string }[] {
  const without = costSumLines(k, agentenProzent, mainCache, false)
  if (!wide) return without
  return costSumLines(k, agentenProzent, mainCache, true).map((l, i) => ([...l.text].length <= width ? l : without[i]!))
}

export function renderPanel(ui: ElementTable, d: PanelData, act: PanelActions) {
  const { Box, Button, Text } = ui
  const { board: b, rows, now, head, shown, alt, kosten, kennzahlen, agentenProzent } = d
  const notes = d.notes.map(n => n.text)

  // Detailansicht eines Agenten (Klick auf „Details“ in seiner Zeile); live über crew und crewNow
  if (d.detail) {
    const { row: chosen, info } = d.detail
    return (
      <Box flexDirection="column">
        <Box key="detail-kopf" columnGap={1} alignItems="center">
          <Button key="back" label="Zurück" onPress={() => act.onBack()} />
          <Text bold>
            <Text color={modelColor(chosen.modell)}>{roleGlyph(chosen.rolle)}</Text> Agent {chosen.id}
          </Text>
        </Box>
        {info.kopf.map((line, i) => (
          <Text key={`detail-${i}`} wrap="truncate-end">
            {line}
          </Text>
        ))}
        {info.listen.map(l => (
          <Box key={`liste-${l.titel}`} flexDirection="column" marginTop={1}>
            <Text bold>{l.titel}</Text>
            {l.items.length === 0 ? (
              <Text dimColor>– keine</Text>
            ) : (
              l.items.map((item, i) => (
                <Text key={`${l.titel}-${i}`} dimColor wrap="truncate-start">
                  {item}
                </Text>
              ))
            )}
          </Box>
        ))}
      </Box>
    )
  }
  // Terminal und Desktop-App haben je eine eigene Darstellung
  if (d.surface === 'terminal') return renderPanelTerminal(ui, d, act)
  // Die API kennt nur Button als Bedienelement (Svg und Box nehmen keine Klicks; ein Button nimmt nur Text auf,
  // die Figur kann also nicht Teil des Knopfs sein). Der Knopf › steht rechts neben dem SVG.
  // Schlüssel bleiben stabil, damit der 10-s-Takt den Klick nicht verschluckt.
  const empty = b.quelle === 'leer'
  // Neue Eigenschaften nur ab 2.1.299, sonst ganze Zeilen und `bold` wie in 0.13.1
  const rich = d.rich
  // Ab 2.1.299 › größer (`heading`) und oben an der Zeile statt klein wie ein Komma
  const detailButton = (r: AgentRow) =>
    rich ? (
      <Button key={`agent-${r.id}`} label="›" plain onPress={() => act.onSelectAgent(r.id)}>
        <Text size="heading">›</Text>
      </Button>
    ) : (
      <Button key={`agent-${r.id}`} label="›" plain onPress={() => act.onSelectAgent(r.id)} />
    )
  // Ohne Gedankenstrich; vor 2.1.299 wie bisher
  const none = (text: string) => (rich ? text : `– ${text}`)
  const num = rich ? { tabular: true as const } : {}
  const comma1 = (n: number) => n.toFixed(1).replace('.', ',')

  // Abschnitt = Kopfzeile (Knopf „▾/› Titel“, Kurzfassung rechts) über feiner Linie; Inhalt nur, wenn offen.
  // Ab Claude Code 2.1.299: Titel halbfett als Text im Knopf (`label` bleibt Name des Knopfs), Abstände als Stufen der
  // App statt ganzer Zeilen, Kurzfassung bei `accent` in der Akzentfarbe `claude`, sonst gedimmt.
  // Kurzfassung immer gedimmt, keine Akzentfarbe mehr. `startClosed`: Abschnitt beginnt zu (z. B.
  // „Kosten pro Rolle“); offen ist er dann, wenn `auf-<id>` in der Liste steht.
  // Stufen live gemessen: vor dem Abschnitt `lg` (20 px), Linie, `md` (12 px) bis zum Titel, `sm`
  // (8 px) bis zum Inhalt, Zeilen `xs` (6 px); Inhalt `lg` (12 px) eingerückt, also unter dem Titeltext; Titel `medium`.
  const section = (id: string, title: string, summary: string, body: RenderChildren, startClosed = false) => {
    const token = startClosed ? `auf-${id}` : id
    const open = startClosed ? d.closed.includes(token) : !d.closed.includes(id)
    // gleiche Pfeilform offen und zu (▾ und › wirkten fremd zueinander)
    const label = `${open ? '▾' : '▸'} ${title}`
    return (
      <Box key={`abschnitt-${id}`} flexDirection="column" marginTop={rich ? 'lg' : 2}>
        {deskRule(ui, `linie-${id}`)}
        <Box key={`kopf-${id}`} columnGap={1} alignItems="center" marginTop={rich ? 'md' : 1}>
          {rich ? (
            <Button key={`sec-${id}`} label={label} plain onPress={() => act.onToggleSection(token)}>
              <Text weight="medium">{label}</Text>
            </Button>
          ) : (
            // vor 2.1.299 ohne Fett: `bold` im Knopf zeichnet die App 2.1.295 nicht
            <Button key={`sec-${id}`} label={label} plain onPress={() => act.onToggleSection(token)} />
          )}
          <Box key={`summe-${id}`} flexGrow={1} justifyContent="flex-end">
            <Text dimColor {...num} wrap="truncate-end">
              {summary}
            </Text>
          </Box>
        </Box>
        {open && body !== null && (
          <Box key={`inhalt-${id}`} flexDirection="column" paddingLeft={rich ? 'lg' : 2} rowGap={rich ? 'xs' : 0} marginTop={rich ? 'sm' : 0}>
            {body}
          </Box>
        )}
      </Box>
    )
  }
  // Lange Abschnitte gekürzt: die ersten `limit` Einträge je eine Zeile, der Rest hinter „+n weitere“ (Zustand
  // `mehr-<id>` in derselben Liste wie die zugeklappten Abschnitte, nur für die Sitzung)
  const more = (id: string) => d.closed.includes(`mehr-${id}`)
  const moreButton = (id: string, hidden: number) => (
    <Button
      key={`mehr-${id}`}
      label={more(id) ? 'weniger' : `+${hidden} weitere`}
      plain
      dimColor
      onPress={() => act.onToggleSection(`mehr-${id}`)}
    />
  )
  const list = (items: string[], key: string, limit = 2) => {
    if (items.length === 0) return <Text dimColor>{none('keine')}</Text>
    const all = more(key) || items.length <= limit
    const shown = all ? items : items.slice(0, limit)
    return [
      ...shown.map((item, i) => (
        <Text key={`${key}-${i}`} dimColor wrap={all ? 'wrap' : 'truncate-end'}>
          {item}
        </Text>
      )),
      items.length > limit ? moreButton(key, items.length - limit) : null,
    ]
  }

  const crew = crewSummary(rows)
  const crewBody = (() => {
    if (rows.length === 0) return <Text dimColor>{none('noch keine codecycle-Agenten in dieser Sitzung')}</Text>
    if (!('Svg' in ui)) return <Text dimColor>{crewAlt(rows, head)}</Text>
    const { Svg } = ui
    const W = Math.max(240, Math.min(900, (d.bodyColumns || 40) * 8 - 24))
    // Platz für den Knopf › rechts neben dem SVG (geschätzt, CSS-Pixel)
    const rowW = Math.max(240, W - DETAIL_BUTTON_W)
    return [
      <Svg key="kopf-svg" source={crewHeadSvg(W, rows, head)} alt={crewAlt(rows, head)} width={W} height={HEAD_H} />,
      ...rows.map(r => (
        <Box key={`ag-${r.id}`} flexDirection="row" alignItems={rich ? 'flex-start' : 'center'} columnGap={1}>
          <Svg source={agentRowSvg(rowW, r, now)} alt={`${roleLabel(r.rolle)}: ${metaText(r)} · ${statsText(r, now)}`} width={rowW} height={ROW_H} />
          {detailButton(r)}
        </Box>
      )),
    ]
  })()

  // Zeile „Name ▬▬▬ 35 %“ mit dünnem grauem Balken in der Mitte
  const barRow = (key: string, name: string, value: number) => (
    <Box key={key} columnGap={2} alignItems="center">
      <Box key="name" width={12} flexShrink={0}>
        <Text dimColor>{name}</Text>
      </Box>
      <Box key="balken" flexGrow={1} flexDirection="column" justifyContent="center">
        {/* 3 px statt 5 px ab 2.1.299 (0.25 = 5 px gemessen) */}
        {deskBar(ui, `${key}-balken`, value, 'subtle', rich ? 0.15 : 0.25)}
      </Box>
      <Box key="wert" width={6} flexShrink={0} justifyContent="flex-end">
        <Text dimColor {...num}>
          {Math.round(value)} %
        </Text>
      </Box>
    </Box>
  )
  const pct = b.budget.geplant > 0 ? (b.budget.verbraucht / b.budget.geplant) * 100 : 0

  // Titel kurz, ohne Erklärzeile (die Zeile „Prozentpunkte …“ darunter war überflüssig);
  // bei Beispieldaten steht „Beispielwerte“ rechts in der Kurzfassung, die letzte Aufgabe nennt schon der Kopf
  const kostenTitle = 'Kosten pro Rolle'
  const kostenSummary = b.quelle === 'beispiel' ? 'Beispielwerte' : kennzahlen?.agentenGewichtet !== undefined ? `Agenten ${weightedText(kennzahlen.agentenGewichtet)}` : `Agenten ${comma1(agentenProzent)} %`
  const kostenBody = [
    kosten.length === 0 ? <Text key="keine" dimColor>– noch keine Läufe gebucht</Text> : null,
    ...kosten.map(k => (
      <Box key={`kosten-${k.rolle}`} columnGap={2}>
        <Box key="rolle" width={18} flexShrink={0}>
          <Text>{roleLabel(k.rolle)}</Text>
        </Box>
        {/* Hauptmaß gewichtete Tokens; Beispieldaten haben nur Prozent */}
        <Box key="wert" width={7} flexShrink={0} justifyContent="flex-end">
          <Text {...num}>{k.gewichtet !== undefined ? shortTokens(k.gewichtet) : `${comma1(k.prozent)} %`}</Text>
        </Box>
        {k.tokens !== undefined ? (
          <Text dimColor wrap="truncate-end">
            {`${k.gewichtet !== undefined ? 'gew. · ' : ''}${usageText(k.frisch ?? k.tokens, k.cache ?? 0)} · ${runsCount(k.laeufe ?? 0)} · ${kontoText(k.prozent)}`}
          </Text>
        ) : null}
      </Box>
    )),
    // Die Summenzeilen (gesamt, Agenten, Bauleiter, ggf. fremde Agenten) erst nach „+n weitere“
    kennzahlen ? moreButton('kosten', kennzahlen.fremd ? 4 : 3) : null,
    kennzahlen && more('kosten') ? (
      <Text key="gesamt" dimColor>
        gesamt {kennzahlen.gewichtet !== undefined ? `${weightedText(kennzahlen.gewichtet)} · ` : ''}
        {usageText(kennzahlen.frisch ?? kennzahlen.tokens, kennzahlen.cache ?? 0)} · {kennzahlen.runden} Runden · Cache-Treffer{' '}
        {kennzahlen.trefferquote === null ? '–' : `${Math.round(kennzahlen.trefferquote * 100)} %`}
      </Text>
    ) : null,
    ...(kennzahlen && more('kosten')
      ? costSumLines(kennzahlen, agentenProzent, d.mainCache, true).map(l => (
          <Text key={l.key} dimColor>
            {l.text}
          </Text>
        ))
      : []),
  ]

  // ab 2.1.299 steht „keine“ nur in der Kurzfassung, der Inhalt entfällt (Live 0.15.3: „keine“ stand doppelt)
  const n = (items: readonly string[]) => (items.length === 0 ? 'keine' : String(items.length))

  return (
    <Box flexDirection="column">
      {empty ? (
        // Keine offene Aufgabe: die zuletzt bearbeitete mit ihren Zahlen, kein Budget
        <Box key="kopf" flexDirection="column" paddingBottom={1}>
          {rich ? (
            <Text weight="semibold" size="heading">
              Keine offene Aufgabe
            </Text>
          ) : (
            <Text bold>Keine offene Aufgabe</Text>
          )}
          <Text dimColor>
            {b.letzte ? `zuletzt: ${b.letzte.aufgabe} (${b.letzte.zustand})` : `noch keine Aufgabe unter ${TASKS_DIR}/`}
          </Text>
        </Box>
      ) : (
        <Box key="kopf" flexDirection="column" paddingBottom={1}>
          {rich ? (
            <Text weight="semibold" size="heading">
              {b.aufgabe}
            </Text>
          ) : (
            <Text bold>{b.aufgabe}</Text>
          )}
          <Text dimColor>
            {/* Ab 2.1.299 lesbar („Feature · groß · in Arbeit“), vorher die Rohwerte der STATE.md */}
            {rich ? taskMetaText(b.art, b.groesse, b.zustand) : `${b.art} · ${b.groesse} · ${b.zustand}`}
          </Text>
          {/* Ab 2.1.299 nur der Pfad in Festbreitenschrift */}
          {b.branch !== '' &&
            (rich ? (
              <Text dimColor mono>
                {b.branch}
              </Text>
            ) : (
              <Text dimColor>Branch {b.branch}</Text>
            ))}
        </Box>
      )}

      {section(
        'agenten',
        'Agenten',
        rows.length === 0 ? '' : `${crew.laufend} ${crew.laufend === 1 ? 'läuft' : 'laufen'} · ${crew.fertig} fertig${crew.abgebrochen > 0 ? ` · ${crew.abgebrochen} abgebrochen` : ''}`,
        crewBody,
      )}

      {!empty && section('budget', 'Budget', runsText(b.budget), [barRow('budget-laeufe', 'Läufe', pct)])}

      {section('kosten', kostenTitle, kostenSummary, kostenBody, true)}

      {notes.length > 0 && (
        // Eigener Abstand `lg` davor, damit der Hinweis nicht unter dem Abschnitt darüber klebt
        <Box key="hinweise" flexDirection="column" {...(rich ? { marginTop: 'lg' as const, rowGap: 'xs' as const } : { paddingBottom: 1 })}>
          {notes.map((note, i) => deskNote(ui, `note-${i}`, 'warning', note, rich))}
        </Box>
      )}

      {/* Text aus der freien Zeile „Nächster Schritt“ der STATE.md (schreibt der Bauleiter), keine eigene Ableitung */}
      {!empty && section('next', 'Nächster Schritt (laut STATE.md)', '', list(b.naechsterSchritt, 'next'))}
      {!empty && section('fragen', 'Offene Fragen', n(b.offeneFragen), rich && b.offeneFragen.length === 0 ? null : list(b.offeneFragen, 'fragen'))}
      {!empty &&
        section(
          'blocker',
          'Blocker',
          n(b.blocker),
          b.blocker.length === 0 ? (rich ? null : <Text dimColor>{none('keine')}</Text>) : b.blocker.map((x, i) => deskNote(ui, `blocker-${i}`, 'error', x, rich)),
        )}

      {rich ? (
        // Linie mit Abstand wie bei den Abschnitten, darunter nur der Pfad in Festbreitenschrift
        <Box key="fuss" flexDirection="column" marginTop="lg">
          {deskRule(ui, 'linie-fuss')}
          <Box key="foot" marginTop="md">
            {b.quelle === 'beispiel' ? (
              <Text dimColor>Beispieldaten</Text>
            ) : (
              <Text dimColor mono wrap="truncate-start">
                {empty ? (b.letzte?.quelle ?? '–') : b.quelle}
              </Text>
            )}
          </Box>
        </Box>
      ) : (
        [
          deskRule(ui, 'linie-fuss'),
          <Box key="foot" paddingTop={1}>
            <Text dimColor>Quelle: {b.quelle === 'beispiel' ? 'Beispieldaten' : empty ? (b.letzte?.quelle ?? '–') : b.quelle}</Text>
          </Box>,
        ]
      )}
      {/* Kein eigener Knopf „Schließen“ mehr, das ✕ der App oben an der Seitenleiste reicht */}
    </Box>
  )
}

/**
 * Seitenleiste im Terminal, aufgeräumt: Überschriften fett in Cyan mit gedimmter Kennzahl und Linie,
 * Spalten fester Breite, farbige Balken ━/─, ▎ nur bei Hinweisen und Blockern. Hinweise oben;
 * kein Abschnitt Limit (steht in der Fußzeile), keine Zeile „Quelle“, kein Knopf „Schließen“, keine
 * Figuren. Tokens bei Agenten und Kosten nur bei breiter Leiste.
 */
function renderPanelTerminal(ui: ElementTable, d: PanelData, act: PanelActions) {
  const { Box, Button, Text } = ui
  const { board: b, rows, now, kosten, kennzahlen, agentenProzent, notes } = d
  const W = paneWidth(d.bodyColumns)
  const wide = isWide(d.bodyColumns)
  const empty = b.quelle === 'leer'

  const heading = (key: string, title: string, info = '') => (
    <Box key={key} flexDirection="column" marginTop={1}>
      <Text>
        <Text bold color="cyan">
          {title}
        </Text>
        {info ? <Text dimColor>{`   ${info}`}</Text> : ''}
      </Text>
      <Text dimColor>{rule(W)}</Text>
    </Box>
  )
  // Zelle fester Breite; rechtsbündig für Zahlen
  const cell = (width: number, child: RenderChildren, right = false) => (
    <Box width={width} flexShrink={0} justifyContent={right ? 'flex-end' : 'flex-start'}>
      {child}
    </Box>
  )
  const quote = (key: string, color: string, lines: readonly string[]) => (
    <Box key={key} flexDirection="column">
      {quoteLines(lines).map((l, i) => (
        <Text key={`${key}-${i}`} color={color}>
          {l}
        </Text>
      ))}
    </Box>
  )
  const list = (key: string, title: string, items: readonly string[], info = '', color?: string) => [
    heading(key, title, info),
    items.length === 0 ? (
      <Text dimColor>– keine</Text>
    ) : color ? (
      quote(`${key}-liste`, color, items)
    ) : (
      items.map((item, i) => <Text key={`${key}-${i}`}>– {item}</Text>)
    ),
  ]

  const kopf = empty ? (
    <Box key="kopf" flexDirection="column">
      <Text bold>Keine offene Aufgabe</Text>
      <Text dimColor>{b.letzte ? `zuletzt: ${b.letzte.aufgabe} (${b.letzte.zustand})` : `noch keine Aufgabe unter ${TASKS_DIR}/`}</Text>
    </Box>
  ) : (
    <Box key="kopf" flexDirection="column">
      <Text>
        <Text bold>{b.aufgabe}</Text>
        <Text dimColor>{`   ${[b.art, b.groesse].filter(Boolean).join(' · ')}`}</Text>
        {b.quelle === 'beispiel' ? <Text dimColor>   (Beispieldaten)</Text> : ''}
      </Text>
      <Text dimColor>{[b.zustand, b.branch].filter(Boolean).join(' · ')}</Text>
    </Box>
  )

  const hinweise =
    notes.length > 0 ? (
      <Box key="hinweise" flexDirection="column" marginTop={1}>
        {quote(
          'hinweise-liste',
          'yellow',
          notes.map(n => `${HINT_GLYPH} ${n.text}`),
        )}
      </Box>
    ) : null

  // Agenten: Statusspalte (2 breit), Rolle als Knopf zur Detailansicht; darunter bündig Modell in seiner Farbe und Details,
  // dann Balken (Fortschritt, Farbe des Status) mit Kontext und Zeit
  const s = crewSummary(rows)
  const agenten = [
    heading(
      'agenten',
      'Agenten',
      rows.length === 0 ? '' : `${s.laufend} ${s.laufend === 1 ? 'läuft' : 'laufen'} · ${s.fertig} fertig${s.abgebrochen > 0 ? ` · ${s.abgebrochen} abgebrochen` : ''}`,
    ),
    ...(rows.length === 0
      ? [<Text dimColor>– noch keine codecycle-Agenten in dieser Sitzung</Text>]
      : rows.map((r, i) => {
          const st = TERM_STATUS[r.status]
          const progress = progressLabel(r)
          const meta = [
            r.effort ?? '',
            r.paket ? `Paket ${r.paket}` : '',
            r.runden > 0 ? `${r.runden} Runden` : '',
            progress ? `${progress}${r.schritte?.note ? ` ${r.schritte.note}` : ''}` : '',
          ].filter(Boolean)
          const cache = cacheText(cacheState(r, now))
          // gewichtete Tokens (Hauptmaß) gleich nach dem Kontext; was nicht passt, fällt weg statt abgeschnitten zu werden:
          // zuerst der Limit-Anteil (Konto-Näherung), dann neu/Cache, Arbeitszeit, Cache-Zeit. Zeile: 2 + Balken 12 + 2
          const stats = fitParts(
            [
              { text: `Kontext ${r.kontextProzent} %`, prio: 1 },
              { text: weightedText(r.gewichtet), prio: 1 },
              { text: timeText(r, now), prio: 3 },
              { text: cache, prio: 2 },
              { text: usageText(r.frisch, r.cache), prio: 4 },
              { text: r.limitProzent !== null ? kontoText(r.limitProzent) : '', prio: 5 },
            ],
            W - 16,
          )
          return (
            <Box key={`ag-${r.id}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
              <Box key={`ag-${r.id}-titel`}>
                {cell(2, <Text color={st.color}>{st.glyph}</Text>)}
                <Button key={`agent-${r.id}`} label={`${roleLabel(r.rolle)} ›`} plain onPress={() => act.onSelectAgent(r.id)} />
              </Box>
              <Text wrap="truncate-end">
                {'  '}
                <Text color={modelColor(r.modell)}>{modelName(r.modell)}</Text>
                <Text dimColor>{meta.length > 0 ? ` · ${meta.join(' · ')}` : ''}</Text>
              </Text>
              <Text wrap="truncate-end">
                {'  '}
                {termBar(ui, (r.fortschritt ?? 0) * 100, 12, st.color)}
                <Text dimColor>{`  ${stats}`}</Text>
              </Text>
            </Box>
          )
        })),
  ]

  const pct = b.budget.geplant > 0 ? (b.budget.verbraucht / b.budget.geplant) * 100 : 0
  const budget = [heading('budget', 'Budget', runsText(b.budget)), <Text>{termBar(ui, pct, 16, levelColor(pct))}</Text>]

  // Hauptmaß gewichtete Tokens; Beispieldaten haben nur Prozent des 5-Std.-Fensters
  const value = (k: Board['kosten'][number]) => k.gewichtet ?? k.prozent
  const maxK = Math.max(0, ...kosten.map(value))
  const unit = kosten.length > 0 && kosten.every(k => k.gewichtet === undefined) ? '% des 5-Std.-Fensters' : 'gewichtete Tokens'
  const kostenInfo =
    b.quelle === 'beispiel'
      ? 'Beispielwerte, % des 5-Std.-Fensters'
      : empty && b.letzte
        ? `letzte Aufgabe ${b.letzte.aufgabe}, ${unit}`
        : unit
  const kostenBlock = [
    heading('kosten', 'Kosten pro Rolle', kostenInfo),
    ...(kosten.length === 0 ? [<Text dimColor>– noch keine Läufe gebucht</Text>] : []),
    ...kosten.map(k => (
      <Box key={`kosten-${k.rolle}`}>
        {cell(18, <Text wrap="truncate-end">{canonicalRole(k.rolle)}</Text>)}
        {cell(12, <Text>{'━'.repeat(costBarLength(value(k), maxK, 12))}</Text>)}
        {cell(7, <Text>{k.gewichtet !== undefined ? shortTokens(k.gewichtet) : comma(k.prozent)}</Text>, true)}
        {wide && k.tokens !== undefined ? (
          <Text dimColor wrap="truncate-end">{`   ${fitParts([{ text: usageText(k.frisch ?? k.tokens, k.cache ?? 0), prio: 2 }, { text: runsCount(k.laeufe ?? 0), prio: 1 }, { text: kontoText(k.prozent), prio: 3 }], W - 40)}`}</Text>
        ) : null}
      </Box>
    )),
    ...(kennzahlen
      ? [
          <Text dimColor wrap="truncate-end">
            {`gesamt ${fitParts(
              [
                { text: kennzahlen.gewichtet !== undefined ? weightedText(kennzahlen.gewichtet) : '', prio: 1 },
                { text: usageText(kennzahlen.frisch ?? kennzahlen.tokens, kennzahlen.cache ?? 0), prio: 2 },
                { text: `Treffer ${kennzahlen.trefferquote === null ? '–' : `${Math.round(kennzahlen.trefferquote * 100)} %`}`, prio: 3 },
                { text: `${kennzahlen.runden} Runden`, prio: 4 },
              ],
              W - 7,
            )}`}
          </Text>,
          // Agenten = Summe der Rollen, Bauleiter und fremde Agenten getrennt; Prozent (Konto-Näherung) nur, wenn die
          // Zeile damit noch passt (weggelassen statt abgeschnitten)
          ...sumLinesFitting(kennzahlen, agentenProzent, d.mainCache, wide, W).map(l => <Text dimColor wrap="truncate-end">{l.text}</Text>),
        ]
      : []),
  ]

  return (
    <Box flexDirection="column" paddingRight={2}>
      {kopf}
      {hinweise}
      {agenten}
      {empty ? null : budget}
      {kostenBlock}
      {/* Text aus der freien Zeile „Nächster Schritt“ der STATE.md (schreibt der Bauleiter), keine eigene Ableitung */}
      {empty ? null : list('next', 'Nächster Schritt', b.naechsterSchritt, 'laut STATE.md')}
      {empty ? null : list('fragen', 'Offene Fragen', b.offeneFragen)}
      {empty ? null : list('blocker', 'Blocker', b.blocker, '', 'red')}
    </Box>
  )
}
