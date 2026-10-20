// Bautafel über dem Eingabefeld (on('ui.render', { component: 'AbovePrompt' })): reine Funktion „Daten → JSX“.
// Der Handler in register.tsx sammelt die Daten (alle `$`-Aufrufe, Atome) und gibt fertige
// Rückrufe mit; diese Datei sieht `$` nie. Die Elemente (Box, Button, Text) kommen aus `$.ui.resolve(e)` als Parameter,
// `h` ist das globale JSX-Werkzeug des Mods.

import type { ElementTable, RenderChildren } from 'claude-code'

import type { Board, Limits, Profile } from '../types'
import { BOX, PROFILES, PROFILE_LABEL, bar, currentPackage, percent, resetText, type ShownLimits } from './state'
import { runsText } from './lib/budget.ts'
import { DOT, deskChip, deskNote } from './desk.tsx'
import { modelColor } from './lib/figure-meta.ts'
import {
  COLLAPSE_LABEL,
  EXPAND_LABEL,
  FRAME_LEFT,
  FRAME_RIGHT,
  HINT_GLYPH,
  TERM_BOX,
  type Hint,
  bandSpacing,
  bandWidth,
  barSegments,
  effortLabel,
  frameBottom,
  frameTop,
  hintCountText,
  levelColor,
  modelLabel,
  moreHintsText,
} from './lib/term-parts.ts'

/** Was die Bautafel zeigt (vom Handler gesammelt) */
export type BandData = {
  /** `e.surface` und `e.props.bodyColumns` des Zeichenereignisses */
  surface: string
  bodyColumns: number
  /** Modell der Hauptsitzung (Titel im Rahmen in seiner Farbe); leer, solange unbekannt */
  mainModel: string
  active: Profile
  lim: Limits
  /** alter Limit-Stand, gekennzeichnet (nur ohne frischen Wert) */
  alt?: ShownLimits
  board: Board
  isLocked: boolean
  isCollapsed: boolean
  /** Hinweise mit Art; im Terminal in fester Rangfolge, sonst wie bisher (Einrichtungshinweis nie: die Bautafel gibt es nur im eingerichteten Projekt) */
  notes: Hint[]
  /** Anzahl laufender codecycle-Agenten */
  running: number
  /** Zeilen, die die Leiste bekommt (`e.props.maxRows`) */
  maxRows: number
  /** Engine kennt `weight`, `size`, `tabular`, Abstandsstufen (ab 2.1.299) */
  rich: boolean
}

/** Rückrufe, die der Handler mit `$` bereitstellt */
export type BandActions = {
  onTogglePanel: () => void
  onSetProfile: (profile: Profile) => void
  onSetCollapsed: (collapsed: boolean) => void
}

// ---------------------------------------------------------------------------------------------------------------------
// Terminal: Bautafel im selbst gezeichneten Rahmen, Fußzeile rechts. Werte kommen aus den Quellen des Plugins (Board, Hinweise, Limits, Modell).

/** Balken aus ━ (farbig) und ─ (gedimmt), auch für die Seitenleiste (hooks/panel.tsx) */
export function termBar(ui: ElementTable, pct: number | null, width: number, color: string) {
  const { Text } = ui
  const s = barSegments(pct, width)
  return [<Text color={color}>{s.filled}</Text>, <Text dimColor>{s.rest}</Text>]
}

function renderBandTerminal(ui: ElementTable, d: BandData, act: BandActions) {
  const { Box, Button, Text } = ui
  const { active, board: b, isLocked, isCollapsed, notes, running } = d
  const W = bandWidth(d.bodyColumns)
  const empty = b.quelle === 'leer'
  const current = currentPackage(b)
  const done = b.pakete.filter(p => p.status === 'fertig').length
  const blocked = b.pakete.filter(p => p.status === 'blockiert').length
  const dim = (s: string) => <Text dimColor>{s}</Text>
  const sep = dim('│')
  const glyphs = (
    <Text>
      <Text dimColor>Pakete </Text>
      {b.pakete.map(p => (
        <Text color={TERM_BOX[p.status].color} dimColor={TERM_BOX[p.status].dim}>
          {TERM_BOX[p.status].glyph}
        </Text>
      ))}
    </Text>
  )
  const blockText = blocked > 0 ? <Text color="red">{`${blocked} blockiert`}</Text> : null

  // Bedienknöpfe rechtsbündig in der ersten Zeile im Rahmen, nur per Klick: keine Tasten-Kürzel im Terminal
  const controls = (
    <Box key="controls" flexGrow={1} flexShrink={0} justifyContent="flex-end" columnGap={2}>
      <Button key="panel" label="Details" plain onPress={() => act.onTogglePanel()} />
      {isCollapsed ? (
        <Button key="expand" label={EXPAND_LABEL} plain onPress={() => act.onSetCollapsed(false)} />
      ) : (
        <Button key="collapse" label={COLLAPSE_LABEL} plain onPress={() => act.onSetCollapsed(true)} />
      )}
    </Box>
  )

  // Oberer Rand mit Titel in der Farbe des Modells (Cyan gehört dem aktiven Profil); Linie mit genau berechneter
  // Länge und flexShrink 0, sonst „…“ am Ende bzw. Umbruch im Titel (Muster)
  const top = frameTop(W)
  const titleRow = (
    <Box key="titel" width={W}>
      <Box key="titel-text" flexShrink={0}>
        <Text>
          <Text dimColor>{top.left}</Text>
          <Text bold color={d.mainModel ? modelColor(d.mainModel) : undefined}>
            {top.title}
          </Text>
          <Text dimColor>{top.right}</Text>
        </Text>
      </Box>
    </Box>
  )
  const bottom = <Text dimColor>{frameBottom(W)}</Text>
  const row = (key: string, children: RenderChildren) => (
    <Box key={key} width={W}>
      <Text dimColor>{FRAME_LEFT}</Text>
      <Box key={`${key}-in`} flexGrow={1} flexShrink={1} overflow="hidden" columnGap={2}>
        {children}
      </Box>
      <Text dimColor>{FRAME_RIGHT}</Text>
    </Box>
  )
  const blank = (key: string) => row(key, <Text> </Text>)
  const activeText = <Text bold color="cyan">{PROFILE_LABEL[active]}</Text>

  if (isCollapsed) {
    const sp = bandSpacing(1, d.maxRows)
    return (
      <Box flexDirection="column" width={W} marginTop={sp.marginTop ? 1 : 0}>
        {titleRow}
        {row('kurz', [
          activeText,
          sep,
          <Text bold>{empty ? 'Keine offene Aufgabe' : b.aufgabe}</Text>,
          empty ? null : glyphs,
          blockText,
          ...(notes.length > 0 ? [sep, <Text color="yellow">{hintCountText(notes.length)}</Text>] : []),
          controls,
        ])}
        {bottom}
      </Box>
    )
  }

  // Profil: aktives Profil fett in Cyan als Text, die anderen schlichte Knöpfe ohne Kürzel
  const profiles = isLocked
    ? [activeText, dim('(gesperrt bis /clear oder zur nächsten Sitzung)')]
    : PROFILES.map(p =>
        p === active ? activeText : <Button key={`profile-${p}`} label={PROFILE_LABEL[p]} plain onPress={() => act.onSetProfile(p)} />,
      )
  const facts = [
    current && current.status !== 'fertig' ? `jetzt ${current.id}` : '',
    runsText(b.budget),
    running > 0 ? `${running} ${running === 1 ? 'Agent läuft' : 'Agenten laufen'}` : '',
  ].filter(Boolean)
  const taskRow = empty
    ? [
        <Text bold>Keine offene Aufgabe</Text>,
        b.letzte ? dim(`zuletzt: ${b.letzte.aufgabe} (${b.letzte.zustand})`) : null,
        running > 0 ? dim(`${running} ${running === 1 ? 'Agent läuft' : 'Agenten laufen'}`) : null,
      ]
    : [
        <Text bold>{b.aufgabe}</Text>,
        glyphs,
        dim(`${done} von ${b.pakete.length} fertig`),
        blockText,
        dim(facts.join(' · ')),
        b.quelle === 'beispiel' ? dim('(Beispieldaten)') : null,
      ]
  // Hinweise: nur der erste (feste Rangfolge), der Rest „+n weitere unter Details“
  const first = notes[0]
  const content = [
    row('row-1', [dim('Profil'), ...profiles, controls]),
    row('row-2', taskRow),
    ...(first
      ? [
          // der Hinweis wird gekürzt, „+n weitere unter Details“ bleibt immer sichtbar (live: langer Hinweis schnitt ihn ab)
          row('row-3', [
            <Box key="hinweis" flexShrink={1} overflow="hidden">
              <Text color="yellow" wrap="truncate-end">{`${HINT_GLYPH} ${first.text}`}</Text>
            </Box>,
            notes.length > 1 ? (
              <Box key="hinweis-mehr" flexShrink={0}>
                <Text dimColor>{moreHintsText(notes.length - 1)}</Text>
              </Box>
            ) : null,
          ]),
        ]
      : []),
  ]
  // Eine Leerzeile zwischen den Zeilen und über dem Rahmen, soweit die Zeilen der Bautafel reichen
  const sp = bandSpacing(content.length, d.maxRows)
  const rows = sp.gaps ? content.flatMap((r, i) => (i === 0 ? [r] : [blank(`gap-${i}`), r])) : content
  return (
    <Box flexDirection="column" width={W} marginTop={sp.marginTop ? 1 : 0}>
      {titleRow}
      {rows}
      {bottom}
    </Box>
  )
}

/** Was die Fußzeile rechts zeigt (Render-Platz `SessionMode`, nur Terminal) */
export type FooterData = {
  /** Modell der Hauptsitzung, roh (`claude-opus-5-5[1m]`); leer, solange unbekannt */
  model: string
  /** Effort, roh (low … max oder Zahl als Text); leer, solange weder gemessen noch Startwert bekannt */
  effort: string
  /** true: gemessen (Anfrage oder /effort mit Stufe oder gespeicherte Änderung); false: Startwert, gedimmt */
  effortMeasured: boolean
  lim: Limits
  alt?: ShownLimits
}

export type FooterActions = {
  onModel: () => void
  onEffort: () => void
}

/**
 * Fußzeile rechts: ● in Modellfarbe und Name als Knopf, · Effort als Knopf, │ 5h-Balken
 * mit Prozent und Reset, │ Woche; danach die Angaben der Engine (`theirs`, z. B. „auto mode“).
 */
export function renderFooter(ui: ElementTable, d: FooterData, act: FooterActions, theirs: RenderChildren) {
  const { Box, Button, Text } = ui
  const sep = <Text dimColor>│</Text>
  const head = []
  if (d.model) {
    const color = modelColor(d.model)
    // Ein Button kennt keine Textfarbe in Ruhe (ButtonProps: nur dimColor und hover): Punkt in Modellfarbe davor, der
    // Name färbt sich unter dem Mauszeiger; eigene Box mit Schlüssel, weil hover für die nächste Box mit Schlüssel gilt
    head.push(
      <Box key="modell" columnGap={1}>
        <Text color={color}>●</Text>
        <Box key="modell-name">
          <Button key="model" label={modelLabel(d.model)} plain hover={{ color, bold: true }} onPress={() => act.onModel()} />
        </Box>
        {d.effort ? <Text dimColor>·</Text> : null}
        {d.effort ? (
          <Button key="effort" label={effortLabel(d.effort)} plain dimColor={!d.effortMeasured} onPress={() => act.onEffort()} />
        ) : null}
      </Box>,
      sep,
    )
  }
  const { lim, alt } = d
  const limit = (label: string, value: number | null, reset: string | undefined, neu: string | undefined, stand: boolean) => {
    if (neu) return <Text dimColor>{`${label} neu seit ${neu}`}</Text>
    if (value === null) return <Text dimColor>{`${label} –`}</Text>
    const color = levelColor(value)
    return (
      <Text>
        <Text dimColor>{`${label} `}</Text>
        {termBar(ui, value, 6, color)}
        <Text color={color}>{` ${Math.round(value)} %`}</Text>
        {reset ? <Text dimColor>{` (↻ ${resetText(reset)})`}</Text> : ''}
        {stand && alt ? <Text dimColor>{` · Stand ${alt.stand}`}</Text> : ''}
      </Text>
    )
  }
  const limits = []
  // ohne Messwert und ohne gespeicherten Stand nichts zeigen; ein Fenster ohne Wert nur, wenn das andere einen hat
  if (lim.fuenfStunden !== null || alt?.neuFuenf || lim.woche !== null || alt?.neuWoche) {
    limits.push(limit('5h', lim.fuenfStunden, lim.resetFuenf, alt?.neuFuenf, true))
    if (lim.woche !== null || alt?.neuWoche) limits.push(sep, limit('Woche', lim.woche, lim.resetWoche, alt?.neuWoche, lim.fuenfStunden === null))
  }
  if (limits.length === 0 && head.length > 0) head.pop()
  // Umbruch, wenn die Zeile nicht neben den Text der Engine passt (in der Praxis beobachtet): Modell mit Effort und die
  // Limits als ganze Stücke, sie brechen nur zwischeneinander um. Die Breite kennt der Mod hier nicht (SessionMode hat
  // nur `modes`), umbrechen muss das Layout; ob die Engine dafür eine zweite Zeile gibt, ist live zu prüfen.
  return (
    <Box columnGap={1} flexWrap="wrap" justifyContent="flex-end">
      {head.length > 0 ? (
        <Box key="fuss-modell" columnGap={1} flexShrink={0}>
          {head}
        </Box>
      ) : null}
      {limits.length > 0 ? (
        <Box key="fuss-limit" columnGap={1} flexShrink={0}>
          {limits}
        </Box>
      ) : null}
      {theirs}
    </Box>
  )
}

export function renderBand(ui: ElementTable, d: BandData, act: BandActions) {
  // Terminal und Desktop-App haben je eine eigene Darstellung
  if (d.surface === 'terminal') return renderBandTerminal(ui, d, act)
  const { Box, Button, Text } = ui
  const { active, board: b, isLocked, isCollapsed, running } = d
  const notes = d.notes.map(n => n.text)
  const current = currentPackage(b)
  const done = b.pakete.filter(p => p.status === 'fertig').length
  const empty = b.quelle === 'leer'
  // Paket-Punkte: ● fertig, ◐ in Arbeit, ○ offen, rot blockiert (Theme-Farben)
  const dots = (
    <Text key="punkte">
      {b.pakete.map((p, i) => (
        <Text key={`punkt-${p.id}`} color={DOT[p.status].color}>
          {i > 0 ? ' ' : ''}
          {DOT[p.status].glyph}
        </Text>
      ))}
    </Text>
  )
  const sep = (key: string) => (
    <Text key={key} dimColor>
      ·
    </Text>
  )

  // Seitenleiste per Knopf (kein Slash-Befehl, nichts im Verlauf), in jedem Zustand der Bautafel.
  // Hotkey „d“ wirkt laut API nur, solange die Bautafel den Fokus hat (ctrl+x tab oder Klick), nie im Eingabefeld;
  // dort belegt Claude Code keine Einzeltasten. Ein `action`-Kürzel (Engine-Keybinding) ist bewusst nicht gesetzt.
  // Bedienknöpfe (Details, ein-/ausklappen) schlicht und rechtsbündig, getrennt von den Profil-Knöpfen
  const panelButton = <Button key="panel" label="Details" hotkey="d" plain onPress={() => act.onTogglePanel()} />

  // Eingeklappt: eine Zeile mit Profil, Aufgabe und Paket-Punkten, Hinweise als Etikett; kein Limit
  if (isCollapsed) {
    return (
      <Box flexWrap="wrap" columnGap={2} paddingX={1} alignItems="center">
        {d.rich ? <Text weight="semibold">codecycle</Text> : <Text bold>codecycle</Text>}
        <Text dimColor>{PROFILE_LABEL[active]}</Text>
        {!empty && <Text>{b.aufgabe}</Text>}
        {!empty && b.pakete.length > 0 && dots}
        {!empty && current && (
          <Text dimColor>
            {current.id}/{b.pakete.length}
          </Text>
        )}
        {notes.length > 0 && deskChip(ui, 'hinweise', notes.length === 1 ? '1 Hinweis' : `${notes.length} Hinweise`, 'warning')}
        <Box key="controls" flexGrow={1} justifyContent="flex-end" columnGap={2}>
          {panelButton}
          <Button key="expand" label="▾ ausklappen" plain dimColor onPress={() => act.onSetCollapsed(false)} />
        </Box>
      </Box>
    )
  }

  // Mit Zwischenzeilen nur, wenn die Leiste genug Zeilen bekommt
  const rowGap = d.maxRows >= 5 ? 1 : 0

  return (
    <Box flexDirection="column" rowGap={rowGap} paddingX={1}>
      <Box key="row-profile" flexWrap="wrap" columnGap={2} alignItems="center">
        {d.rich ? <Text weight="semibold">codecycle</Text> : <Text bold>codecycle</Text>}
        {isLocked ? (
          <Text>
            {PROFILE_LABEL[active]}
            {/* kurz, damit „Details“ und „einklappen“ in der Zeile bleiben */}
            <Text dimColor> (gesperrt)</Text>
          </Text>
        ) : (
          // Nur das aktive Profil als Chip der App, die anderen schlicht (eine Fläche hinter den Chips der
          // App ergab Kasten in Kasten; Knöpfe zeichnet die App selbst, Form und Rand sind nicht wählbar)
          <Box key="profile-group" columnGap={1} alignItems="center">
            {PROFILES.map(p => (
              <Button
                key={`profile-${p}`}
                label={PROFILE_LABEL[p]}
                variant={p === active ? 'primary' : 'secondary'}
                {...(p !== active ? { plain: true as const } : {})}
                onPress={() => act.onSetProfile(p)}
              />
            ))}
          </Box>
        )}
        <Box key="controls" flexGrow={1} justifyContent="flex-end" columnGap={2}>
          {panelButton}
          <Button key="collapse" label="▴ einklappen" plain dimColor onPress={() => act.onSetCollapsed(true)} />
        </Box>
      </Box>
      <Box key="row-task" flexWrap="wrap" columnGap={2} alignItems="center">
        {empty ? (
          // Keine offene Aufgabe: keine Pakete und kein Budget, nur die zuletzt bearbeitete
          <Text>
            Keine offene Aufgabe
            {b.letzte && <Text dimColor>{` · zuletzt: ${b.letzte.aufgabe} (${b.letzte.zustand})`}</Text>}
          </Text>
        ) : (
          d.rich ? <Text weight="medium">{b.aufgabe}</Text> : <Text>{b.aufgabe}</Text>
        )}
        {!empty && b.pakete.length > 0 && dots}
        {!empty && (
          <Text dimColor>
            {done}/{b.pakete.length} fertig{current && current.status !== 'fertig' ? ` · jetzt ${current.id}` : ''}
          </Text>
        )}
        {!empty && sep('sep-budget')}
        {!empty && (
          <Text>
            <Text dimColor>Budget </Text>
            {runsText(b.budget)}
          </Text>
        )}
        {running > 0 && sep('sep-agenten')}
        {running > 0 && (
          <Text>
            <Text color="claude">● </Text>
            {running} {running === 1 ? 'Agent läuft' : 'Agenten laufen'}
          </Text>
        )}
        {b.quelle === 'beispiel' && <Text dimColor>(Beispieldaten)</Text>}
      </Box>
      {notes.length > 0 && (
        <Box key="row-warn" flexDirection="column" rowGap={0}>
          {notes.map((n, i) => deskNote(ui, `warn-${i}`, 'warning', n))}
        </Box>
      )}
    </Box>
  )
}
