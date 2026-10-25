// Pixel-Figuren für die Agenten-Leiste des Mods: eine eigene Figur je Rolle.
// Das Kostüm zeigt die Rolle, die Farbe (Bauchschild) das Modell.
// Design nach Savvy Progress (JohnnyVizz/claude-kit, MIT): Pixel-Krabbe aus <rect> auf einem
// Raster von 30×28, Körper plus Kostüm, Requisiten in eigenen <g class>-Gruppen, Bewegung nur
// per CSS-Animation, `prefers-reduced-motion` hält alles an. Neu geschrieben für codecycle.
// Reiner Code ohne Node und ohne Mod-API, wie die übrigen Dateien in lib/.

import { known, modelColor } from './figure-meta.ts'

// --- Zeichnen ---------------------------------------------------------------

const CLAY = '#D97757'
const INK = '#1F1E1D'
const GLASS = 'rgba(169,214,245,.55)'

// `cls`: Gruppe des Pixels. `bd` (Standard) ist Körper samt Kostüm, `la`/`lb` die Beinpaare,
// alles andere eine Requisite mit eigener Bewegung.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

/** Zeilen aus Zeichen als Pixel setzen; `.` und unbekannte Zeichen bleiben leer. */
function stamp(f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void {
  rows.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      const c = map[ch]
      if (c) f(x + dx, y + dy, 1, 1, c, cls)
    }),
  )
}

/** Mütze oder Hut: Zeilen enden direkt über dem Körper (Körper beginnt bei y = 10). */
function hat(f: Fill, rows: string[], map: Record<string, string>): void {
  stamp(f, 6, 10 - rows.length, rows, map)
}

/** Körper der Krabbe; `armCls` lässt die gehobene Schere mit ihrer Requisite wandern. */
function body(f: Fill, armUp = false, armCls?: string): void {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, armUp ? 10 : 14, 4, 4, CLAY, armCls)
  // Augen in eigener Gruppe `ey` (umherschauen und blinzeln, siehe EYES und FIGURE_CSS)
  f(9, 12, 2, 2, INK, 'ey')
  f(19, 12, 2, 2, INK, 'ey')
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

const COSTUMES: Record<string, (f: Fill) => void> = {
  // Ingenieur mit Schutzhelm; der Schraubenschlüssel dreht an einer Schraube.
  builder: f => {
    body(f)
    hat(f, ['.....oooooooo.....', '..oooooohhoooooo..', '..oooooohhoooooo..', '..oooooohhoooooo..', '.ooooooohhooooooo.', 'dddddddddddddddddd'], { o: '#F28C28', h: '#F9C27A', d: '#B5651D' })
    stamp(f, 0, 9, ['s.s.', 'sss.', '.s..', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  // Schlussprüfer: Detektiv mit grauem Hut und Brille; die Lupe tastet die Fläche ab.
  'final-reviewer': f => {
    body(f, true, 'it')
    hat(f, ['.....gggggggg.....', '....gggggggggg....', '....gggggggggg....', '....kkkkkkkkkk....', '.gggggggggggggggg.'], { g: '#5E6470', k: '#2E2E33' })
    stamp(f, 23, 0, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 1, 3, 3, GLASS, 'it')
    f(25, 5, 1, 5, '#5E6470', 'it')
  },
  // Lehrer mit Doktorhut; der Rotstift streicht an.
  'plan-reviewer': f => {
    body(f, true)
    hat(f, ['.kkkkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkkkk.', '....kkkkkkkkkk....', '....kkkkkkkkkk....', '....kkkkkkkkkk....'], { k: '#2E2E33' })
    f(21, 6, 1, 5, '#F5C542')
    f(21, 11, 2, 2, '#F5C542') // Quastenende neben dem rechten Auge, nicht darüber
    f(26, 6, 2, 1, '#F0A0A8', 'it')
    f(26, 7, 2, 5, '#D0453F', 'it')
    f(26, 12, 2, 1, '#E8C9A0', 'it')
  },
  // Schmied mit Lederschürze und Stirnband; der Hammer schlägt auf den Amboss, Funken fliegen.
  toolsmith: f => {
    body(f, true)
    f(9, 15, 12, 7, '#8A5A3B')
    f(11, 15, 8, 1, '#5C3A24')
    f(7, 9, 16, 2, '#55514C')
    f(10, 7, 3, 2, '#8E929A')
    f(17, 7, 3, 2, '#8E929A')
    f(0, 18, 6, 2, '#6B6B68')
    f(1, 20, 4, 2, '#55514C')
    f(0, 22, 6, 2, '#6B6B68')
    f(1, 16, 1, 1, '#F5C542', 'sp')
    f(3, 17, 1, 1, '#F5C542', 'sp')
    f(25, 5, 1, 8, '#7A4A26', 'it')
    f(22, 3, 7, 3, '#8E929A', 'it')
  },
  // Einrichter mit Kappe und Werkzeugkiste; die Kiste wippt.
  setup: f => {
    body(f)
    hat(f, ['.....gggggggg.....', '...gggggggggggg...', '..gggggggggggggg..', '.gggggggggggggggg.'], { g: '#6B7B8C' })
    f(2, 15, 1, 2, '#3A3A3C', 'it')
    f(2, 15, 3, 1, '#3A3A3C', 'it')
    f(4, 15, 1, 2, '#3A3A3C', 'it')
    f(0, 17, 7, 5, '#C0392B', 'it')
    f(0, 19, 7, 1, '#8E2A20', 'it')
    f(3, 19, 1, 2, '#F5C542', 'it')
  },
  // Fremder Agent: die schlichte Krabbe.
  other: f => body(f),
}

// Bewegung je Rolle: [Gruppe, CSS]. Jede Krabbe läuft (Beine, Körper); dazu kommt die Requisite.
const MOTION: Record<string, [string, string][]> = {
  builder: [['it', 'transform-origin:100% 100%;animation:cc-twist .5s ease-in-out infinite']],
  'final-reviewer': [['it', 'animation:cc-scan .8s steps(1) infinite']],
  'plan-reviewer': [['it', 'animation:cc-write .5s steps(1) infinite']],
  toolsmith: [['it', 'transform-origin:50% 100%;animation:cc-strike .6s ease-in-out infinite'], ['sp', 'animation:cc-blink .3s steps(1) infinite']],
  setup: [['it', 'animation:cc-bob .5s steps(1) infinite']],
}

/**
 * Augen laufender Figuren: `look` schaut nach links und rechts und blinzelt,
 * `blink` blinzelt nur (Brille oder Requisite direkt neben dem Auge).
 * Fehlt eine Rolle hier, gilt `look`.
 */
const EYES: Record<string, 'look' | 'blink'> = {
  'plan-reviewer': 'blink',
}

/** Zeitversatz des Blinzelns je Agent (aus der Agenten-ID), damit nicht alle gleichzeitig blinzeln. */
const EYE_PERIOD = 4.4

function eyeDelay(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `-${((h % (EYE_PERIOD * 10)) / 10).toFixed(1)}s`
}

function motionCss(): string {
  const rules = Object.entries(MOTION).flatMap(([role, list]) => list.map(([cls, css]) => `.r-${role}.run .${cls}{${css}}`))
  return rules.join('\n')
}

// Reine CSS-Animation, vom Browser selbst ausgeführt (kein Neuzeichnen). `prefers-reduced-motion` stoppt alles.
export const FIGURE_CSS: string = `<style>
.run .la{animation:cc-st .5s steps(1) infinite}.run .lb{animation:cc-st .5s steps(1) infinite -.25s}
.run .bd{animation:cc-bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes cc-st{50%{transform:translateY(-1px)}}
@keyframes cc-bob{50%{transform:translateY(1px)}}
@keyframes cc-blink{50%{opacity:.15}}
@keyframes cc-twist{50%{transform:rotate(-35deg)}}
@keyframes cc-strike{40%{transform:rotate(-30deg)}60%{transform:rotate(15deg)}}
@keyframes cc-scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
@keyframes cc-write{50%{transform:translateX(-2px)}}
@keyframes cc-wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.ey{transform-box:fill-box;transform-origin:50% 50%}
.run.e-look .ey{animation:cc-eyes ${EYE_PERIOD}s steps(1) infinite;animation-delay:var(--eye,0s)}
.run.e-blink .ey{animation:cc-eyes-blink ${EYE_PERIOD}s steps(1) infinite;animation-delay:var(--eye,0s)}
@keyframes cc-eyes{0%{transform:none}22%{transform:translateX(-1px)}34%{transform:none}50%{transform:translateX(1px)}62%{transform:none}86%{transform:scaleY(.5)}88%{transform:scaleY(.01)}91%{transform:scaleY(.5)}93%{transform:none}}
@keyframes cc-eyes-blink{0%{transform:none}86%{transform:scaleY(.5)}88%{transform:scaleY(.01)}91%{transform:scaleY(.5)}93%{transform:none}}
${motionCss()}
@media (prefers-reduced-motion: reduce){.run,.run *{animation:none!important}}
</style>`

export type FigureOptions = {
  role: string
  model: string
  x?: number
  y?: number
  scale?: number
  running?: boolean
  dim?: boolean
  /** z. B. die Agenten-ID: verschiebt den Zeitpunkt des Blinzelns; ohne Angabe die Rolle */
  seed?: string
}

/**
 * Eine Figur als `<g>`-Fragment (kein `<svg>`), 30×28 Einheiten groß. Körper und Requisiten liegen
 * in `bd` (die Requisiten fahren das Wippen mit), die Beine daneben. `running` setzt die Klasse
 * `run` und schaltet damit die Bewegung ein; `dim` macht die Figur blass.
 */
export function figureSvg(o: FigureOptions): string {
  const role = known(o.role)
  const eyes = EYES[role] ?? 'look'
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  ;(COSTUMES[role] ?? COSTUMES.other!)(f)
  f(12, 18, 6, 3, modelColor(o.model)) // Bauchschild: die Farbe zeigt das Modell
  const group = (cls: string): string => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const inner = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>${group('la')}${group('lb')}`
  const x = o.x ?? 0
  const y = o.y ?? 0
  const scale = o.scale ?? 1
  return `<g transform="translate(${x},${y}) scale(${scale})" opacity="${o.dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="r-${role} e-${eyes}${o.running ? ' run' : ''}" data-role="${role}" style="--eye:${eyeDelay(o.seed ?? role)}">${inner}</g></g>`
}

/** Vollständiges `<svg>` mit dem Stil für alle Figuren. */
export function figureDocument(width: number, height: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${FIGURE_CSS}${content}</svg>`
}
