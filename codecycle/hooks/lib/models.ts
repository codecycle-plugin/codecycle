// Modellwahl: Rolle → Modell aus models.json. Rein, ohne Node und ohne Mod-API. Effort wird hier nie bestimmt.

export const ROLE_PREFIX = 'codecycle:'

/** Inhalt von models.json: eine Tabelle Rolle → Modell (Aliase von Claude Code) */
export type ModelsFile = { models: Record<string, string> }

/** `codecycle:builder` → `builder`; alles andere null. */
export function roleOf(subagentType: string | undefined): string | null {
  if (!subagentType || !subagentType.startsWith(ROLE_PREFIX)) return null
  const role = subagentType.slice(ROLE_PREFIX.length)
  return /^[a-z][a-z-]*$/.test(role) ? role : null
}

/** Liest models.json; null ohne Tabelle `models`. Einträge, deren Wert kein Text ist, fallen weg. */
export function parseModels(text: string): ModelsFile | null {
  try {
    const j = JSON.parse(text.replace(/^﻿/, '')) as { models?: unknown }
    if (!j.models || typeof j.models !== 'object' || Array.isArray(j.models)) return null
    const models: Record<string, string> = {}
    for (const [role, model] of Object.entries(j.models as Record<string, unknown>)) {
      if (typeof model === 'string' && model !== '') models[role] = model
    }
    return { models }
  } catch {
    return null
  }
}

export type ModelInput = {
  role: string
  models: ModelsFile
}

export type ModelChoice = { model: string | undefined; reason: string }

/** Das Modell für eine Rolle; `model` undefined = nichts ändern (Rolle unbekannt). */
export function chooseModel(i: ModelInput): ModelChoice {
  const model = i.models.models[i.role]
  if (!model) return { model: undefined, reason: `Rolle ${i.role} fehlt in models.json` }
  return { model, reason: 'models.json' }
}
