// Schnittstelle der Graph-Anbieter (Adapter-Schicht). Die Befehle locate, callers,
// tests-for, impact und test --affected sprechen nur diese Schnittstelle an.
// Ein Adapter liefert `null`, wenn er eine Frage nicht beantworten kann (Anbieter
// fehlt, Index fehlt, Aufruf scheitert, Ausgabe unlesbar): der Aufrufer fällt dann
// auf Outline bzw. Textsuche zurück und sagt das. Adapter raten nie.

export type ProviderId = 'code-review-graph' | 'codegraph'

/** Aufruf eines Programms; austauschbar, damit Tests gefälschte Ausgaben liefern können. */
export type Run = (cmd: string, args: string[], cwd: string) => RunResult
export type RunResult = { code: number; stdout: string; stderr: string; missing: boolean }

/** Ein Symbol aus dem Graphen. Pfade relativ zum Projekt, mit `/`. */
export type GSymbol = {
  name: string
  kind: string
  datei: string
  /** Zeilen 1-basiert; `ende` fehlt, wenn der Anbieter sie nicht liefert */
  start?: number
  ende?: number
  parent?: string
  isTest: boolean
  /** anbieterspezifische Kennung für Folgeabfragen (z. B. qualified_name) */
  ref: string
}

export type GraphStatus = {
  /** fresh = Index passt zum Stand, stale = veraltet, empty = leer, missing = kein Index */
  state: 'fresh' | 'stale' | 'empty' | 'missing'
  detail: string
}

export type ImpactResult = {
  /** 0..1, null = der Anbieter liefert kein Risiko */
  risk: number | null
  changed: { symbol: GSymbol; risk: number | null }[]
  /** betroffene Dateien (ohne die geänderten) */
  files: string[]
  /** betroffene Testdateien */
  tests: string[]
  /** geänderte Symbole ohne Test */
  testGaps: string[]
}

export interface GraphAdapter {
  readonly id: ProviderId
  readonly label: string
  /** Befehl, den Git-Hooks im Hintergrund ausführen (nur Anzeige und Vorlage) */
  readonly updateCommand: string
  /** Index im Projekt vorhanden? Ruft keinen Anbieter auf (legt nichts an). */
  hasIndex(root: string): boolean
  /** Anbieter installiert? */
  installed(root: string): boolean
  status(root: string): GraphStatus | null
  /** Symbole mit diesem Namen (ohne Tests und Dateien) */
  find(root: string, name: string): GSymbol[] | null
  callers(root: string, symbol: GSymbol): GSymbol[] | null
  testsFor(root: string, symbol: GSymbol): GSymbol[] | null
  /** Auswirkung geänderter Dateien (Pfade relativ) */
  impact(root: string, files: string[]): ImpactResult | null
  /** Testdateien, die von den geänderten Dateien betroffen sind */
  affectedTests(root: string, files: string[]): string[] | null
  /** Index aktualisieren; false bei Fehlschlag */
  update(root: string, base?: string): boolean
}
