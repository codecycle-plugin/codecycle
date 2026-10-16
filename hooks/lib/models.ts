// Modellwahl: Rolle + Profil → Modell, mit haiku-simple, escalation und
// „anderer Prüfer“. Rein, ohne Node und ohne Mod-API. Effort wird hier nie bestimmt.

import type { Switches } from '../../lib/switches.ts'
import { isOn } from '../../lib/switches.ts'

export const ROLE_PREFIX = 'codecycle:'
export const TIERS = ['haiku', 'sonnet', 'opus', 'fable'] as const

export type ProfilesFile = { profiles: Record<string, Record<string, string>> }

/** `codecycle:builder-logic` → `builder-logic`; alles andere null. */
export function roleOf(subagentType: string | undefined): string | null {
  if (!subagentType || !subagentType.startsWith(ROLE_PREFIX)) return null
  const role = subagentType.slice(ROLE_PREFIX.length)
  return /^[a-z][a-z-]*$/.test(role) ? role : null
}

export function parseProfiles(text: string): ProfilesFile | null {
  try {
    const j = JSON.parse(text.replace(/^﻿/, '')) as { profiles?: unknown }
    if (!j.profiles || typeof j.profiles !== 'object') return null
    return { profiles: j.profiles as ProfilesFile['profiles'] }
  } catch {
    return null
  }
}

function tier(model: string): number {
  const i = TIERS.findIndex(t => model.toLowerCase().includes(t))
  return i < 0 ? 1 : i
}

export type ModelInput = {
  role: string
  profile: string
  profiles: ProfilesFile
  switches: Switches
  /** Schwierigkeit des Pakets laut PLAN.md */
  schwierigkeit?: string
  /** Korrekturrunden des Pakets laut STATE.md */
  paketRunden?: number
  /** Modell des Handwerkers dieses Pakets, falls bekannt (für den Prüfer) */
  builderModel?: string
}

export type ModelChoice = { model: string | undefined; reason: string }

/** Das Modell für eine Rolle; `model` undefined = nichts ändern (Rolle oder Profil unbekannt). */
export function chooseModel(i: ModelInput): ModelChoice {
  const table = i.profiles.profiles[i.profile]
  const base = table?.[i.role]
  if (!table) return { model: undefined, reason: `Profil ${i.profile} fehlt in profiles.json` }
  if (!base) return { model: undefined, reason: `Rolle ${i.role} fehlt in profiles.json` }

  if (i.role === 'builder-routine' && isOn(i.switches, 'haiku-simple') && i.schwierigkeit === 'einfach') {
    return { model: 'haiku', reason: 'haiku-simple: einfaches Routine-Paket' }
  }
  if (i.role.startsWith('builder-') && isOn(i.switches, 'escalation') && (i.paketRunden ?? 0) >= 2) {
    const next = TIERS[Math.min(TIERS.length - 1, tier(base) + 1)]!
    return { model: next, reason: `escalation: ${i.paketRunden} Korrekturrunden, nächststärkeres Modell` }
  }
  // sparsam stuft nie hoch
  if (i.role === 'reviewer' && i.profile !== 'sparsam' && i.builderModel && tier(i.builderModel) === tier(base)) {
    // anderes Modell nur, wenn das Profil es für eine andere Rolle schon vorsieht
    const others = [...new Set(Object.entries(table).filter(([r]) => r !== 'reviewer').map(([, m]) => m))].filter(m => tier(m) !== tier(base))
    // ein stärkeres Modell zuerst (der Prüfer soll nicht schwächer werden), sonst das nächstliegende schwächere
    const rank = (m: string) => (tier(m) > tier(base) ? tier(m) - tier(base) : 100 + (tier(base) - tier(m)))
    others.sort((a, b) => rank(a) - rank(b))
    if (others[0]) return { model: others[0], reason: `anderer Prüfer als Handwerker (${i.builderModel})` }
  }
  return { model: base, reason: `Profil ${i.profile}` }
}
