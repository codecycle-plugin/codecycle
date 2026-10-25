// Schalter: Abschnitt „Schalter“ in `.claude/codecycle.md` lesen.
// Rein, ohne Node und ohne Mod-API. Fehlt ein Eintrag, gilt der Standard (vorläufiger Wert).
//
// Erkannte Schreibweisen (eine pro Zeile, das Format ist nicht festgelegt):
//   - fence: an            - `fence` an            | fence | an |            fence = aus
// Zusätze hinter dem Wert gelten als Parameter: `graph: an, nur lesen`.

export type SwitchState = { on: boolean; value: string }
export type Switches = Record<string, SwitchState>

const DEFAULT_ON = [
  'conflict-check',
  'helper-scripts',
  'graph',
  // Prüfer je Teil großer Aufgaben (final-reviewer mit `Auftrag: Teil`); `codecycle solo teil fertig` verlangt dann seinen Bericht
  'part-review',
]
const DEFAULT_OFF = [
  'fence',
  'auto-resume',
  'agent-progress',
  // Beispieldaten auf Bautafel und Seitenleiste, wenn keine Aufgabe offen ist
  'demo-data',
  // Beobachtungen mit `codecycle notiz` bzw. `/codecycle:notiz` festhalten (notizen.md im Aufgabenordner)
  'notizen',
]

export function defaultSwitches(): Switches {
  const out: Switches = {}
  for (const n of DEFAULT_ON) out[n] = { on: true, value: '' }
  for (const n of DEFAULT_OFF) out[n] = { on: false, value: '' }
  return out
}

const ON = /^(an|ein|on|true|ja|yes)\b/i
const OFF = /^(aus|off|false|nein|no)\b/i

/** Liest die Schalter; unbekannte Namen (auch entfallene Schalter) bleiben erhalten, ohne Fehler und ohne Wirkung; Standardwerte füllen den Rest. */
export function parseSwitches(markdown: string | null | undefined): Switches {
  const out = defaultSwitches()
  if (!markdown) return out
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let level = 0
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (h) {
      const l = h[1]!.length
      if (level > 0 && l <= level) level = 0
      if (level === 0 && /^schalter\b/i.test(h[2]!)) level = l
      continue
    }
    if (level === 0) continue
    const m = line.match(/^\s*(?:[-*]\s*)?\|?\s*`?([a-z][a-z0-9-]*)`?\s*(?::|=|\|)\s*(.*?)\s*\|?\s*$/i)
    const hit = m ?? line.match(/^\s*[-*]\s*`?([a-z][a-z0-9-]*)`?\s+((?:an|aus|ein|on|off)\b.*?)\s*$/i)
    if (!hit) continue
    const name = hit[1]!.toLowerCase()
    const rest = hit[2]!.replace(/^`+|`+$/g, '').trim()
    const prev = out[name]
    if (ON.test(rest)) out[name] = { on: true, value: rest.replace(ON, '').replace(/^[\s,;(]+|[\s)]+$/g, '') }
    else if (OFF.test(rest)) out[name] = { on: false, value: rest.replace(OFF, '').replace(/^[\s,;(]+|[\s)]+$/g, '') }
    else if (rest !== '') out[name] = { on: prev?.on ?? true, value: rest }
  }
  return out
}

export function isOn(sw: Switches, name: string): boolean {
  return sw[name]?.on ?? false
}

export function switchValue(sw: Switches, name: string): string {
  return sw[name]?.value ?? ''
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
