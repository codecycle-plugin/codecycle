// Steuerung des Aufwands: Merkmale → Größe,
// Rollen-Set, Läufe, Effort-Aufschlag. Rein, ohne Node und ohne Mod-API.

import type { Effort, Switches } from './switches.ts'
import { isOn } from './switches.ts'

export type Art = 'feature' | 'bugfix' | 'refactoring' | 'routine' | 'review'
export type Size = 'klein' | 'mittel' | 'gross'
/** Doku über den Changelog hinaus: `nein`, nur `changelog` (Handwerker im Paket), `mehr` (README, CLAUDE.md, Architektur-Doku, mehrere Pakete). */
export type Doku = 'nein' | 'changelog' | 'mehr'
export type Features = {
  art: Art
  dateien: number
  risiko: boolean
  schnittstelle: boolean
  struktur: boolean
  unumkehrbar: boolean
  logik: boolean
  oberflaeche: boolean
  /** alte aufwand.json: true = mehr, false = nein (`dokuLevel`) */
  doku: Doku | boolean
  // nach dem Gutachter; undefined = noch unbekannt
  alternativen?: boolean
  bereiche?: number
  pakete?: number
  /** Pakete, die einen Risikobereich berühren oder eine Schnittstelle ändern */
  risikoPakete?: number
  ungetestet?: boolean
  /** R2 (12): ein Handwerker schreibt die Doku vollständig im Paket (README, CLAUDE.md, Beispiele, Changelog); undefined = noch offen */
  dokuImPaket?: boolean
  /** Größe laut Gutachter; senkt die Größe nur ohne Risiko, ohne Schnittstelle und bei einem Paket */
  gutachterGroesse?: Size
}
export type RoleRun = { rolle: string; laeufe: number; grund: string; schutz: boolean; unsicher: boolean }
export type EffortPlan = {
  groesse: Size
  rollen: RoleRun[]
  laeufe: { min: number; max: number }
  nachlaufErlaubt: number | null
  /** Hinweis, wenn die Zahl der Läufe noch steigen kann */
  hinweis?: string
  /** Zeilen zu Regeln ohne eigenen Lauf (Changelog, Sicherheitsprüfliste, Plan ohne Architekt, Größe) */
  notizen?: string[]
}

/** Rollen, deren Effort bei Risiko auf high steigt. */
export const RISK_RAISE: readonly string[] = ['builder-logic', 'builder-routine', 'test-author', 'reviewer', 'security-reviewer']

/** Alte Rollennamen → aktuelle (`inspector` heißt jetzt `browser-reviewer`). */
export const ROLE_ALIASES: Readonly<Record<string, string>> = { inspector: 'browser-reviewer' }
export function canonicalRole(role: string): string {
  return ROLE_ALIASES[role] ?? role
}

/** Doku-Merkmal mit Rückfall für alte Ja/Nein-Werte (ja → mehr). */
export function dokuLevel(v: unknown): Doku {
  if (v === true || v === 'ja' || v === 'mehr') return 'mehr'
  if (v === 'changelog') return 'changelog'
  return 'nein'
}

const RANK: Record<Size, number> = { klein: 0, mittel: 1, gross: 2 }

/** Größe, nur noch abgeleitet. */
export function deriveSize(f: Features): Size {
  const yes = [f.risiko, f.schnittstelle, f.struktur, f.unumkehrbar].filter(Boolean).length
  const rule: Size = f.dateien > 10 || yes >= 2 ? 'gross' : f.dateien <= 3 && yes === 0 ? 'klein' : 'mittel'
  // Gutachter-Urteil nur nach unten und nur ohne Risiko, ohne Schnittstelle, bei genau einem Paket
  // (mit Risiko nie unter mittel: klein strich den Prüfer). Zurückdrehen: diese Zeile entfernen.
  if (f.gutachterGroesse && !f.risiko && !f.schnittstelle && f.pakete === 1 && RANK[f.gutachterGroesse] < RANK[rule]) return f.gutachterGroesse
  return rule
}

export function planEffort(f: Features, sw: Switches): EffortPlan {
  const groesse = deriveSize(f)
  const out: RoleRun[] = []
  const notizen: string[] = []
  const add = (rolle: string, laeufe: number, grund: string, schutz = false, unsicher = false): void => {
    if (laeufe > 0) out.push({ rolle, laeufe, grund, schutz, unsicher })
  }
  const klein = groesse === 'klein'
  const pakete = f.pakete ?? 1
  const risikoPakete = Math.max(1, f.risikoPakete ?? 1)
  const pruefPflicht = f.risiko || f.schnittstelle

  // Erkunden
  if (!klein) {
    if (f.art === 'bugfix') add('debugger', 1, 'Bugfix: Ursache eingrenzen, roter Reproduktionstest')
    else add('surveyor', 1, 'Fundstellen, offene Entscheidungen, Risiken')
  }

  // Architekt nur bei Bedarf (Risiko allein reicht nicht mehr)
  if (!klein) {
    const why: string[] = []
    if (groesse === 'gross') why.push('groß')
    if (f.schnittstelle) why.push('Schnittstelle oder Format ändert sich')
    if (f.alternativen === true) why.push('echte Alternativen')
    if (f.pakete !== undefined && f.pakete > 1) why.push('mehr als ein Paket')
    if (why.length > 0) add('architect', 1, why.join(', '))
    else if (f.alternativen === undefined || f.pakete === undefined) {
      add('architect', 1, `nur falls der Gutachter Alternativen oder mehrere Pakete meldet${f.risiko ? ' (Risiko allein reicht nicht)' : ''}`, false, true)
    } else notizen.push('Plan: kein Architekt (ein Paket, keine Alternativen, keine Schnittstelle); du schreibst das Paket nach der Vorlage, Auftrag und Plan in einer Freigabe')
  }
  if (groesse === 'gross') {
    add('plan-reviewer', 1, 'groß: Plan prüfen')
    if (isOn(sw, 'multi-planner') && (f.bereiche ?? 1) >= 2) add('area-architect', f.bereiche!, `${f.bereiche} getrennte Bereiche`)
  }

  // Test-Autor
  if (f.logik && isOn(sw, 'test-author')) {
    // bei Risiko dazu ein Lauf im Aufgabenmodus für die nicht riskanten Pakete (nur wenn es sie laut Plan gibt)
    const rest = f.risiko && f.pakete !== undefined && f.pakete > risikoPakete ? 1 : 0
    const n = f.risiko ? risikoPakete + rest : 1
    const grund = !f.risiko
      ? 'ein Lauf für alle Logik-Pakete'
      : rest > 0
        ? 'Risikobereich: je Risikopaket, dazu 1 Lauf für die übrigen Logik-Pakete (streichen, wenn sie keine Logik haben)'
        : 'Risikobereich: je Risikopaket'
    add('test-author', n, grund, f.risiko)
  }
  if (isOn(sw, 'test-author') && f.ungetestet && f.art !== 'bugfix') {
    const at = out.find(r => r.rolle === 'test-author')
    if (at) {
      at.laeufe += 1
      at.grund += '; P0 Verhalten absichern'
    } else add('test-author', 1, 'P0 Verhalten absichern')
  }

  // Handwerker: einer je Bereich (Stammhandwerker), aber nie mehr als Pakete
  const handwerker = Math.max(1, Math.min(f.bereiche ?? 1, f.pakete ?? Infinity))
  add(f.logik ? 'builder-logic' : 'builder-routine', klein ? 1 : handwerker, 'je Bereich ein Stammhandwerker (höchstens einer je Paket), weitere Pakete per Nachricht')

  // Prüfen; klein ohne Prüfer (vorläufig; B: Bedingung entfernen, C: `!klein || f.logik`)
  if (!klein) {
    if (!pruefPflicht) add('reviewer', 1, 'Abschlussprüfung über den Gesamtdiff mit allen Kriterien (ersetzt die Abnahme)')
    else if (pakete === 1) add('reviewer', 1, 'ein Paket: Paketprüfung und Abnahme in einem Lauf', f.risiko)
    else if (f.risikoPakete === 1) {
      // Nur bei ausdrücklich bekanntem risikoPakete = 1; unbekannt bleibt beim strengeren Zweig (fail-closed).
      // Genau ein Risiko-/Schnittstellenpaket neben einfachen: eine Abschlussprüfung statt Prüfer plus Abnahme
      // (lockert den Mindestschutz im Risikobereich mit Zustimmung des Nutzers; sie ist dann die Schutzrolle).
      // Zurückdrehen: diesen Zweig entfernen, dann gilt wieder Prüfer je Risikopaket plus Abnahme.
      add('reviewer', 1, `ein Paket mit Risiko oder Schnittstelle neben einfachen: eine Abschlussprüfung über alles (Paket: alle) statt Prüfer plus Abnahme (R2)${f.risiko ? ' mit Sicherheitsprüfliste' : ''}`, f.risiko)
    } else {
      add('reviewer', risikoPakete, 'je Paket mit Risikobereich oder Schnittstelle', f.risiko)
      add('acceptance', 1, 'Abnahme über alle Pakete', f.risiko)
    }
    // Bei genau einem Paket ohne `unumkehrbar` prüft der Prüfer mit Sicherheitsprüfliste, kein eigener Lauf.
    // Auch bei mehreren Paketen eigener Sicherheitsprüfer nur bei `unumkehrbar` fest, sonst nur, wenn der Prüfer
    // (mit `Sicherheitsprüfung: ja`) ein Sicherheitsrisiko meldet (unsicherer Lauf). Zurückdrehen: unsicher=true im mittleren Zweig entfernen.
    if (f.risiko && isOn(sw, 'security-reviewer')) {
      if (f.unumkehrbar) add('security-reviewer', risikoPakete, 'Risikobereich, unumkehrbar (Prüfer bekommt zusätzlich „Sicherheitsprüfung: ja“)')
      else if (f.pakete === undefined || f.pakete > 1) add('security-reviewer', risikoPakete, 'nur, wenn der Prüfer ein Sicherheitsrisiko meldet (R2); der Prüfer bekommt „Sicherheitsprüfung: ja“', false, true)
      else notizen.push('Sicherheit: kein eigener Sicherheitsprüfer (ein Paket); Startnachricht des Prüfers mit „Sicherheitsprüfung: ja“')
    }
  }
  if (f.oberflaeche) add('browser-reviewer', 1, 'Oberfläche betroffen (nur prüfen, kein Code)')
  // Doku-Pfleger nur, wenn die Doku über den Changelog hinausgeht
  const doku = dokuLevel(f.doku)
  // Schreibt ein Handwerker die Doku vollständig im Paket, entfällt der Doku-Pfleger (Abnahme/Abschlussprüfung gleicht ab).
  // Zurückdrehen: den dokuImPaket-Zweig entfernen.
  if (doku === 'mehr' && !klein) {
    if (f.dokuImPaket === true) notizen.push('Doku: Handwerker schreibt sie im Paket, Abnahme/Abschlussprüfung gleicht sie ab; kein Doku-Pfleger (R2)')
    else add('doc-keeper', 1, f.dokuImPaket === false ? 'Doku über den Changelog hinaus' : 'nur, wenn kein Paket die Doku vollständig schreibt (R2)', false, f.dokuImPaket === undefined)
  }
  else if (doku === 'changelog') notizen.push('Changelog: Handwerker im Paket, Bauleiter prüft')
  else if (doku === 'mehr') notizen.push('Doku: klein, du ziehst die wenigen Zeilen selbst nach')
  const { gutachterGroesse: _g, ...ohneGutachter } = f
  if (f.gutachterGroesse && groesse !== deriveSize(ohneGutachter)) notizen.push(`Größe: ${groesse} laut Gutachter (ohne Risiko, ohne Schnittstelle, ein Paket)`)

  const min = out.filter(r => !r.unsicher).reduce((n, r) => n + r.laeufe, 0)
  const max = out.reduce((n, r) => n + r.laeufe, 0)
  // vor dem Gutachter ist die Zahl der Pakete unbekannt; bei Risiko oder Schnittstelle kann es mehr werden
  const hinweis =
    !klein && pruefPflicht && f.pakete === undefined
      ? 'je weiteres Risikopaket +Test-Autor; ab 2 Risiko-/Schnittstellenpaketen +Prüfer je Paket, +Abnahme (Zahl nach dem Gutachter)'
      : undefined
  return {
    groesse,
    rollen: out,
    laeufe: { min, max },
    nachlaufErlaubt: f.risiko ? null : 1,
    ...(hinweis ? { hinweis } : {}),
    ...(notizen.length > 0 ? { notizen } : {}),
  }
}

/** Effort-Aufschlag bei Risiko; null = Wert der Agenten-Datei behalten. */
export function riskEffort(role: string, risiko: boolean): Effort | null {
  return risiko && RISK_RAISE.includes(role) ? 'high' : null
}
