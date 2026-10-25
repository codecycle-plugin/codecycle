import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export const FILE = 'aufwand.json'

/**
 * Inhalt von `aufwand.json`: die Messung von `codecycle effort --record`. Felder älterer Fassungen
 * (`merkmale`, `gestrichen`, `plan`) bleiben beim Schreiben unverändert erhalten.
 */
export type Aufwand = {
  version: 1
  messung: {
    laeufe: number
    nachlaeufe: number
    diffZeilen: number
    laeufeJe100Zeilen: number | null
    aufgenommen: string
    /**
     * Hauptmaß aus costs.json: gewichtete Tokens der Agenten (Summe der Rollen), des Bauleiters und
     * fremder Agenten, Anteil des Bauleiters an allem in %; fehlt ohne lesbare costs.json bzw. ohne `fremd`
     */
    agentenGewichtet?: number
    bauleiterGewichtet?: number
    fremdGewichtet?: number
    bauleiterAnteil?: number
    /** Konto-Näherung aus costs.json (Summe limitProzent der Rollen bzw. Hauptsitzung); fehlt, wenn dort kein Wert steht */
    agentenProzent?: number
    bauleiterProzent?: number
    bauleiterModell?: string
    /** Hauptsitzungen mit Startstand in costs.json (`hauptsitzung.starts[]`, je Sitzung einmal); fehlt bei Büchern ohne Startstände */
    hauptsitzungen?: number
  } | null
  [weitere: string]: unknown
}

function emptyAufwand(): Aufwand {
  return { version: 1, messung: null }
}

export function readAufwand(path: string): Aufwand {
  if (!existsSync(path)) return emptyAufwand()
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<Aufwand>
    if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyAufwand()
    return { ...data, version: 1, messung: data.messung ?? null }
  } catch {
    return emptyAufwand()
  }
}

export function writeAufwand(path: string, data: Aufwand): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
