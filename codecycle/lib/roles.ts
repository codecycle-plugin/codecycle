// Rollennamen älterer Register- und Kosten-Einträge (`agents.json`, `costs.json`) auf die heutigen Rollen abbilden.
// Reiner Code ohne Node und ohne Mod-API; genutzt von Figuren und Bezeichnungen im Mod und von `codecycle effort --record`.

/** Alter Rollenname → heutige Rolle; Einträge mit altem Namen zeigen Figur und Bezeichnung der heutigen Rolle. */
export const ROLE_ALIASES: Readonly<Record<string, string>> = {
  'solo-reviewer': 'final-reviewer',
  'builder-logic': 'builder',
  'builder-routine': 'builder',
}

/** Heutiger Name einer Rolle; unbekannte Namen bleiben, wie sie sind. */
export function canonicalRole(role: string): string {
  return ROLE_ALIASES[role] ?? role
}
