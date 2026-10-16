// Schalter: Abschnitt „Schalter“ in `.claude/codecycle.md` lesen.
// Rein, ohne Node und ohne Mod-API. Fehlt ein Eintrag, gilt der Standard (vorläufiger Wert).
//
// Erkannte Schreibweisen (eine pro Zeile, das Format ist nicht festgelegt):
//   - fence: an            - `fence` an            | fence | an |            fence = aus
// Zusätze hinter dem Wert gelten als Parameter: `read-budget: an, 6`.

export type SwitchState = { on: boolean; value: string }
export type Switches = Record<string, SwitchState>

const DEFAULT_ON = [
  'context-package',
  'sections',
  'reuse-agents',
  'half-blind',
  'test-author',
  'ideas-auto',
  'multi-planner',
  'conflict-check',
  'helper-scripts',
  'security-reviewer',
  'graph',
]
const DEFAULT_OFF = [
  'refuter',
  'fence',
  'escalation',
  'haiku-simple',
  // effort-by-size entfällt seit 0.5.0 (Effort je Rolle und Risiko); steht er noch im Projekt, zeigt der Mod „wirkungslos“
  'register-forwarding',
  'package-lead',
  'read-budget',
  'plan-html',
  'auto-resume',
  'agent-progress',
  // Beispieldaten auf Bautafel und Seitenleiste, wenn keine Aufgabe offen ist
  'demo-data',
]

export function defaultSwitches(): Switches {
  const out: Switches = {}
  for (const n of DEFAULT_ON) out[n] = { on: true, value: '' }
  for (const n of DEFAULT_OFF) out[n] = { on: false, value: '' }
  out['cache-ttl-builder'] = { on: true, value: '5m' }
  return out
}

const ON = /^(an|ein|on|true|ja|yes)\b/i
const OFF = /^(aus|off|false|nein|no)\b/i

/** Liest die Schalter; unbekannte Namen bleiben erhalten, Standardwerte füllen den Rest. */
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
    else if (prev && name === 'cache-ttl-builder') out[name] = { on: true, value: rest }
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
