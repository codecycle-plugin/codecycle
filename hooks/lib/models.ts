// Modellwahl: Rolle + Profil → Modell. Rein, ohne Node und ohne Mod-API. Effort wird hier nie bestimmt.

export const ROLE_PREFIX = 'codecycle:'

export type ProfilesFile = { profiles: Record<string, Record<string, string>> }

/** `codecycle:builder` → `builder`; alles andere null. */
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

export type ModelInput = {
  role: string
  profile: string
  profiles: ProfilesFile
}

export type ModelChoice = { model: string | undefined; reason: string }

/** Das Modell für eine Rolle; `model` undefined = nichts ändern (Rolle oder Profil unbekannt). */
export function chooseModel(i: ModelInput): ModelChoice {
  const table = i.profiles.profiles[i.profile]
  const base = table?.[i.role]
  if (!table) return { model: undefined, reason: `Profil ${i.profile} fehlt in profiles.json` }
  if (!base) return { model: undefined, reason: `Rolle ${i.role} fehlt in profiles.json` }
  return { model: base, reason: `Profil ${i.profile}` }
}
