import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import type { EffortPlan, Features } from '../lib/effort-plan.ts'
import { ToolBroken } from './errors.ts'
import { effortLib } from './lib-path.ts'

export const FILE = 'aufwand.json'

export type Aufwand = {
  version: 1
  merkmale: Partial<Features>
  gestrichen: { rolle: string; grund: string; schutzBestaetigt: boolean }[]
  plan: EffortPlan | null
  messung: {
    laeufe: number
    nachlaeufe: number
    diffZeilen: number
    laeufeJe100Zeilen: number | null
    aufgenommen: string
    /** aus costs.json (Summe limitProzent der Rollen bzw. Hauptsitzung); fehlt, wenn dort kein Wert steht */
    agentenProzent?: number
    bauleiterProzent?: number
    bauleiterModell?: string
  } | null
}

export const ARTS = ['feature', 'bugfix', 'refactoring', 'routine', 'review']
export const BOOLS = ['risiko', 'schnittstelle', 'struktur', 'unumkehrbar', 'logik', 'oberflaeche', 'alternativen', 'ungetestet', 'dokuImPaket'] as const
/** doku = nein | changelog | mehr; alte Werte ja/yes/true → mehr, no/false → nein */
const DOKU = ['nein', 'changelog', 'mehr']
const SIZES = ['klein', 'mittel', 'gross']
export const NUMS = ['dateien', 'bereiche', 'pakete', 'risikoPakete'] as const
/** Pflicht-Merkmale vor dem Gutachter (Konzept Teil 1); ohne sie kein Plan. */
export const REQUIRED = ['art', 'dateien', 'risiko', 'schnittstelle', 'struktur', 'unumkehrbar', 'logik', 'oberflaeche', 'doku'] as const

function emptyAufwand(): Aufwand {
  return { version: 1, merkmale: {}, gestrichen: [], plan: null, messung: null }
}

export function readAufwand(path: string): Aufwand {
  if (!existsSync(path)) return emptyAufwand()
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<Aufwand>
    if (!data || typeof data !== 'object') return emptyAufwand()
    const merkmale = data.merkmale && typeof data.merkmale === 'object' ? data.merkmale : {}
    // alte Ja/Nein-Werte von doku auf die drei Stufen bringen
    if (merkmale.doku !== undefined) merkmale.doku = effortLib.dokuLevel(merkmale.doku)
    // alte Rollennamen (inspector) unter dem neuen Namen führen
    const gestrichen = (Array.isArray(data.gestrichen) ? data.gestrichen : []).map(g => ({ ...g, rolle: effortLib.canonicalRole(g.rolle) }))
    return {
      version: 1,
      merkmale,
      gestrichen,
      plan: data.plan ?? null,
      messung: data.messung ?? null,
    }
  } catch {
    return emptyAufwand()
  }
}

/** `name=wert` → Merkmal; unbekannter Name oder unpassender Wert ist ein Aufruffehler. */
export function parseFeature(pair: string): [keyof Features, Features[keyof Features]] {
  const i = pair.indexOf('=')
  const key = (i < 0 ? pair : pair.slice(0, i)).trim()
  const value = i < 0 ? '' : pair.slice(i + 1).trim()
  if (key === 'art') {
    if (!ARTS.includes(value)) throw new ToolBroken(`art muss eines von ${ARTS.join(', ')} sein: ${value}`)
    return ['art', value as Features['art']]
  }
  if (key === 'doku') {
    if (/^(ja|yes|true)$/i.test(value)) return ['doku', 'mehr']
    if (/^(no|false)$/i.test(value)) return ['doku', 'nein']
    if (!DOKU.includes(value.toLowerCase())) throw new ToolBroken(`doku braucht nein, changelog oder mehr: ${value}`)
    return ['doku', value.toLowerCase() as Features['doku']]
  }
  if (key === 'gutachterGroesse') {
    const v = value.toLowerCase().replace('groß', 'gross')
    if (!SIZES.includes(v)) throw new ToolBroken(`gutachterGroesse braucht klein, mittel oder gross: ${value}`)
    return ['gutachterGroesse', v as NonNullable<Features['gutachterGroesse']>]
  }
  if ((BOOLS as readonly string[]).includes(key)) {
    if (/^(ja|yes|true)$/i.test(value)) return [key as keyof Features, true]
    if (/^(nein|no|false)$/i.test(value)) return [key as keyof Features, false]
    throw new ToolBroken(`${key} braucht ja oder nein: ${value}`)
  }
  if ((NUMS as readonly string[]).includes(key)) {
    if (!/^\d+$/.test(value)) throw new ToolBroken(`${key} braucht eine Zahl: ${value}`)
    return [key as keyof Features, Number(value)]
  }
  throw new ToolBroken(`unbekanntes Merkmal „${key}“ (bekannt: art, doku, gutachterGroesse, ${[...BOOLS, ...NUMS].join(', ')})`)
}

export function writeAufwand(path: string, data: Aufwand): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}
