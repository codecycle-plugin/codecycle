// Bausteine des Desktop-Aussehens: Textfarben aus dem Theme von Claude Code,
// Flächen und Spuren als halbdurchsichtiges Grau (Theme-Flächen wie `inactive` sind im dunklen Theme zu grell),
// Hinweise mit schmalem Balken links (`quote` zeichnet in der Desktop-App einen ganzen Rahmen),
// dünne Balken über `height={0.25}` und Breiten in Prozent (Pixelwerte weist die Engine ab).

import type { ElementTable, RenderChildren } from 'claude-code'

import type { Limits, PackageStatus } from '../types'
import { deskFooterText } from './lib/desk-parts.ts'
import type { ShownLimits } from './state'

/** Fläche (Hinweise, Etiketten, Profil-Umschalter): in hell und dunkel dezent */
export const SURFACE = 'rgba(128,128,128,0.12)'
/** Spur der Balken und Trennlinien */
export const TRACK = 'rgba(128,128,128,0.25)'

/** Paket-Punkte: Zeichen und Farbe (Theme-Schlüssel) je Zustand */
export const DOT: Record<PackageStatus, { glyph: string; color: string }> = {
  fertig: { glyph: '●', color: 'success' },
  'in-arbeit': { glyph: '◐', color: 'text' },
  offen: { glyph: '○', color: 'subtle' },
  blockiert: { glyph: '●', color: 'error' },
}

/** Textfarbe des Zustands-Etiketts je Paket (offen ohne Farbe, gedimmt) */
export const CHIP_COLOR: Record<PackageStatus, string | undefined> = {
  fertig: 'success',
  'in-arbeit': 'text',
  offen: undefined,
  blockiert: 'error',
}

/** Leicht getönte Fläche hinter Hinweisen und Blockern, in hell und dunkel dezent */
export const TINT: Record<string, string> = {
  warning: 'rgba(219,147,0,0.12)',
  error: 'rgba(236,126,126,0.12)',
}

/** Dünner Balken über die volle Breite; `value` in Prozent, null = leere Spur. `height` 0.25 = 5 px in der Desktop-App (gemessen) */
export function deskBar(ui: ElementTable, key: string, value: number | null, color: string, height = 0.25) {
  const { Box } = ui
  const fill = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  return (
    <Box key={key} width="100%" height={height} backgroundColor={TRACK}>
      {fill > 0 ? <Box key={`${key}-fill`} width={`${fill}%`} height={height} backgroundColor={color} /> : null}
    </Box>
  )
}

/** Feine Trennlinie zwischen Abschnitten */
export function deskRule(ui: ElementTable, key: string) {
  const { Box } = ui
  return <Box key={key} width="100%" height={0.07} backgroundColor={TRACK} />
}

/** Hinweis oder Blocker: schmaler Balken links in `color`, Fläche dahinter */
export function deskNote(ui: ElementTable, key: string, color: string, text: RenderChildren, rich = false) {
  const { Box, Text } = ui
  // Ab 2.1.299: schmaler Balken (0,5 Zelle = 4 px), getönte Fläche, Innenabstand oben/unten `sm` (8 px) und rechts `md`
  if (rich) {
    return (
      <Box key={key} columnGap="md" backgroundColor={TINT[color] ?? SURFACE}>
        <Box key={`${key}-bar`} width={0.5} flexShrink={0} backgroundColor={color} />
        <Box key={`${key}-text`} flexGrow={1} paddingY="sm" paddingRight="md">
          <Text>{text}</Text>
        </Box>
      </Box>
    )
  }
  return (
    <Box key={key} columnGap={1} backgroundColor={SURFACE}>
      <Box key={`${key}-bar`} width={1} flexShrink={0} backgroundColor={color}>
        <Text> </Text>
      </Box>
      <Text>{text}</Text>
    </Box>
  )
}

/** Kleines Etikett mit Fläche (Paketzustand, Hinweiszahl) */
export function deskChip(ui: ElementTable, key: string, text: string, color?: string) {
  const { Box, Text } = ui
  return (
    <Box key={key} backgroundColor={SURFACE} paddingX={1} flexShrink={0}>
      {color ? <Text color={color}>{text}</Text> : <Text dimColor>{text}</Text>}
    </Box>
  )
}

/** Fußzeile (Render-Platz `SessionMode`) in der Desktop-App (Text aus lib/desk-parts.ts :: deskFooterText); die Angaben der Engine bleiben rechts daneben */
export function renderFooterDesk(ui: ElementTable, lim: Limits, alt: ShownLimits | undefined, theirs: RenderChildren) {
  const { Box, Text } = ui
  const text = deskFooterText(lim, alt)
  return (
    <Box columnGap={1} justifyContent="flex-end">
      {text ? (
        <Text key="fuss-limit" dimColor wrap="truncate-end">
          {text}
        </Text>
      ) : null}
      {theirs}
    </Box>
  )
}
