// Gemeinsame Pfad-Konstanten und die Regel für den Hauptzweig: Mod und Werkzeug
// lesen dieselben Werte hier, damit es je Sache nur eine Stelle gibt. Reiner Code ohne Node und ohne Mod-API.

/** Aufgabenordner des Plugins im Projekt (je Aufgabe ein Unterordner mit STATE.md, TASK.md, reports/ …). */
export const TASKS_DIR = 'docs/codecycle'

/** Werkzeug-Konfiguration des Projekts, relativ zum Hauptordner. */
export const TOOL_CONFIG = '.codecycle/tool.config.json'

/** Git-Optionen vor dem Unterbefehl: Pfade mit Umlauten unverändert statt in Anführungszeichen mit Oktal-Escapes. */
export const GIT_QUIET = ['-c', 'core.quotepath=false'] as const

/** Pfad mit Schrägstrichen (Backslash → `/`) und ohne führendes `./`; sonst unverändert. */
export function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Hauptzweig des Projekts: der getrimmte, nicht leere Text aus der Konfiguration (`mainBranch`); sonst `master`,
 * wenn `refs/heads/main` bekanntermaßen fehlt (`mainExists === false`), sonst `main`. `null` = unbekannt → `main`.
 */
export function mainBranchFrom(configValue: unknown, mainExists: boolean | null): string {
  if (typeof configValue === 'string' && configValue.trim() !== '') return configValue.trim()
  return mainExists === false ? 'master' : 'main'
}
