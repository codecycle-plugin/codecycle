// Zustandsvertrag des codecycle-Mods.

export type Profile = 'sparsam' | 'grosszuegig' | 'extrem'

export type PackageStatus = 'offen' | 'in-arbeit' | 'fertig' | 'blockiert'

export type Package = {
  id: string
  rolle: string
  status: PackageStatus
  agent: string | null
  commit: string | null
  runden: number
}

export type RoleCost = {
  rolle: string
  /** gemessene Prozentpunkte des 5-Stunden-Fensters (Summe der Läufe dieser Aufgabe); Konto-Näherung, andere Sitzungen zählen mit */
  prozent: number
  /** gewichtete Tokens der Rolle (Hauptmaß, `lib/tokens.ts :: weightedTokens`); fehlt bei Beispieldaten */
  gewichtet?: number
  /** Tokens der Rolle in dieser Aufgabe (Token-Buch); fehlt bei Beispieldaten */
  tokens?: number
  laeufe?: number
  /** Anteil an allen Tokens der Aufgabe in % */
  anteil?: number
  /** neu verarbeitete Tokens (Eingabe, Ausgabe, Cache-Schreiben) */
  frisch?: number
  /** aus dem Cache gelesene Tokens */
  cache?: number
}

/** Eine Aufgabe, wie sie in ihrer STATE.md steht. */
export type TaskState = {
  /** Pfad der STATE.md, relativ zum Projekt; `beispiel` für eingebaute Beispieldaten, `leer` ohne offene Aufgabe */
  quelle: string
  aufgabe: string
  art: string
  groesse: string
  zustand: string
  branch: string
  /** nachlauf: ungeplante Läufe; fehlt in alten STATE.md = 0 */
  budget: { geplant: number; verbraucht: number; nachlauf: number }
  planrunden: number
  zuletzt: string
  /** Weg der Aufgabe: `solo` (Sitzung baut, ein Prüfer am Ende) oder `voll` (Pakete); fehlt in alten STATE.md = voll */
  weg?: 'solo' | 'voll'
  /** Solo-Weg: Commit, auf dem `codecycle solo check` zuletzt grün war; leer = noch nie */
  geprueftAuf?: string
  /** Solo-Weg: Haltepunkt 1–6, an dem die Aufgabe steht; 0 = nicht gesetzt */
  haltepunkt?: number
  pakete: Package[]
  naechsterSchritt: string[]
  offeneFragen: string[]
  blocker: string[]
}

/** Die aktive Aufgabe, wie Bautafel, Statuszeile und Seitenleiste sie zeigen. */
export type Board = TaskState & {
  /** Kosten pro Rolle aus costs.json (Token-Buch); bei Beispieldaten Beispielwerte */
  kosten: RoleCost[]
  /** Kennzahlen aus dem Token-Buch; fehlt bei Beispieldaten und ohne costs.json */
  kennzahlen?: Metrics
  /**
   * Nur bei `quelle: 'leer'` (keine offene Aufgabe): die zuletzt bearbeitete Aufgabe, deren Zahlen
   * (`kosten`, `kennzahlen`) die Anzeige weiter zeigt. Fehlt, wenn es noch keine Aufgabe gibt.
   */
  letzte?: { aufgabe: string; zustand: string; quelle: string }
}

export type Metrics = {
  tokens: number
  /** davon neu (Eingabe, Ausgabe, Cache-Schreiben) und aus dem Cache gelesen */
  frisch: number
  cache: number
  /** gewichtete Tokens (Hauptmaß, `lib/tokens.ts :: weightedTokens`): gesamt, Agenten (Summe der Rollen), Bauleiter */
  gewichtet?: number
  agentenGewichtet?: number
  bauleiterGewichtet?: number
  /** Agenten ohne codecycle-Rolle (Zeile `fremd` im Token-Buch); fehlt, wenn es keine gab */
  fremd?: { gewichtet: number; frisch: number; cache: number }
  /** Modell-Anfragen (Runden) aller Agenten und der Hauptsitzung */
  runden: number
  /** Cache-Lesen ÷ gesamte Eingabe, 0 bis 1 */
  trefferquote: number | null
  /** Anzahl Dateien, die Agenten zusätzlich zum Kontextpaket lasen */
  fehlenderKontext: number
  /** Tokens der Hauptsitzung */
  hauptsitzung: number
  /** Bauleiter (Hauptsitzung) getrennt von den Agenten: Modell, neu, Cache, Prozentpunkte des 5h-Fensters (Konto-Näherung) */
  bauleiterModell?: string
  bauleiterFrisch?: number
  bauleiterCache?: number
  bauleiterProzent?: number
  /** Summe der gemessenen Prozentpunkte aller Rollen */
  agentenProzent?: number
}

/**
 * Limit-Stand in Prozent aus der letzten API-Antwort (`$.session.usage()`);
 * `null`, solange es keinen Messwert gibt (vor der ersten Antwort, ohne Abo).
 */
export type Limits = {
  fuenfStunden: number | null
  woche: number | null
  /** Reset-Zeitpunkte als ISO-8601-Text */
  resetFuenf?: string
  resetWoche?: string
}

export type AgentStatus = 'laeuft' | 'fertig' | 'abgebrochen'

/** Live-Zustand eines codecycle-Agenten (Agenten-Leiste), mitgeschrieben aus agent.spawn, turn.step und turn.complete. */
export type LiveAgent = {
  id: string
  rolle: string
  paket: string | null
  modell: string
  effort?: string
  status: AgentStatus
  /** Startzeit und Ende in ms (Uhr des Mods) */
  start: number
  ende?: number
  /** Tokens, die die letzte Anfrage gesendet hat (Kontextfüllung) */
  kontext: number
  /** gemeldete Schritte (Schalter agent-progress, Werkzeug codecycle_step) */
  schritte?: { done: number; total: number; note?: string }
  /** Höchster bisher gezeigter Fortschritt 0..1 (der Balken läuft nie rückwärts) */
  balken?: number
  /** Runden des Agenten bei Beginn des laufenden Abschnitts (nach einer Folgenachricht), Grundlage der Schätzung */
  rundenAb?: number
  /** Eltern-Agent (Paketleiter) */
  eltern?: string
  /** Aktuelle Tätigkeit: letztes Werkzeug mit Ziel (Pfad relativ zum Projekt, Befehl gekürzt) */
  taetigkeit?: { werkzeug: string; ziel: string; zeit: number }
  /** Zeit (ms) der letzten Modell-Anfrage des Agenten: Grundlage der Cache-Restzeit */
  letzteAnfrage?: number
  /** Cache-Laufzeit des Agenten in ms: 1 h mit `experimental.cacheTtl: 1h` in der Agenten-Datei, sonst 5 min */
  cacheTtlMs?: number
  /** Arbeitszeit der abgeschlossenen Läufe in ms (ohne Wartezeit zwischen Ende und Folgenachricht) */
  arbeitMs?: number
  /** Beginn des laufenden Laufs (Start oder Folgenachricht) in ms */
  laufStart?: number
}

declare module 'claude-code' {
  interface PluginState {
    codecycle: {
      profile: Profile
      board: Board
      limits: Limits
      /** true, sobald in dieser Sitzung der erste codecycle-Agent gestartet wurde */
      locked: boolean
      /** Bautafel eingeklappt (auch in $.store, gilt über Sitzungen) */
      collapsed: boolean
      /** Füllstand der Hauptsitzung in % (Ereignis session.measure), null ohne Messwert */
      context: number | null
      /** Modell der Hauptsitzung laut $.session.model(), leer solange unbekannt (Takt alle 2 s liest es neu) */
      mainModel: string
      /**
       * Effort der Hauptsitzung, gemessen (turn.step ohne agentId, /effort mit Stufe, Änderung der gespeicherten Stufe):
       * roh (low … max, Zahl als Text), leer solange unbekannt; Fußzeile im Terminal
       */
      mainEffort: string
      /** Startwert des Efforts (Umgebung, gespeicherte Stufe, Standard des Modells), gedimmt gezeigt; leer solange unbekannt */
      startEffort: string
      /** Live-Zustand der codecycle-Agenten dieser Sitzung (Agenten-Leiste, hooks/lib/agent-view.ts) */
      crew: LiveAgent[]
      /** Agent, dessen Detailansicht die Seitenleiste zeigt; null = Übersicht */
      selectedAgent: string | null
      /** Zugeklappte Abschnitte der Seitenleiste in der Desktop-App, nur für die Sitzung; leer = alle offen */
      closedSections: string[]
      /** Uhrzeit (ms) des letzten Neuzeichnens der Agenten-Leiste, für Laufzeiten */
      crewNow: number
      /**
       * Einrichtung: .claude/codecycle.md da? Node-Version, 'fehlt' oder null (nicht prüfbar); Konfiguration da?
       * Werkzeug-Kopie: Version, 'fehlt', 'unlesbar' oder null; hooks/lib/setup-check.ts
       */
      setup: { projekt: boolean | null; node: string | null; config?: boolean; kopie?: string | null }
    }
  }
}
