// Agenten-Register (agents.json): wer was gelesen, geändert und erstellt hat, Urteile, Lese-Budget.
// Rein, ohne Node und ohne Mod-API. Das Token-Buch (costs.json) steht in `ledger-costs.ts`.

import { normPath } from '../../lib/paths.ts'

export type Verdict = 'grün' | 'rot' | 'blockiert'

/** `status:` aus dem Schlusstext eines Agenten (Quittung, templates/receipt.md); null ohne Quittung. */
export function parseReceiptStatus(text: string | null | undefined): Verdict | null {
  if (!text) return null
  const hits = [...text.matchAll(/^\s*status:\s*(grün|gruen|rot|blockiert)\s*$/gim)]
  const last = hits.at(-1)?.[1]?.toLowerCase()
  if (!last) return null
  return last === 'gruen' ? 'grün' : (last as Verdict)
}

/** Urteil eines Agenten ins Register; null (keine Quittung) lässt ein früheres Urteil stehen. */
export function setVerdict(reg: Registry, agentId: string, v: Verdict | null): void {
  const a = reg.agenten[agentId]
  if (a && v) a.urteil = v
}

/** Arbeitszeit ins Register (agents.json, `arbeitszeitMs`). */
export function setWorkTime(reg: Registry, agentId: string, ms: number): void {
  const a = reg.agenten[agentId]
  if (a) a.arbeitszeitMs = ms
}

// ---------------------------------------------------------------------------
// Agenten-Register

/** `bash: true`: aus einem Bash-/PowerShell-Befehl erkannt; zählt nicht gegen das Lese-Budget */
export type Touch = { pfad: string; zeit: string; abschnitt?: string; bash?: true }

export type AgentEntry = {
  id: string
  rolle: string
  paket: string | null
  modell: string
  gestartet: string
  letzteAktivitaet: string
  /** Pfade, die das Kontextpaket mitgeliefert hat */
  mitgeliefert: string[]
  gelesen: Touch[]
  geaendert: Touch[]
  erstellt: Touch[]
  /** Glob-/Grep-Aufrufe */
  suchen: number
  /** Agent, der diesen gestartet hat (Paketleiter, Schalter `package-lead`); fehlt = Hauptsitzung */
  eltern?: string
  /** Urteil aus der Quittung (`status:`) beim Ende des Laufs; fehlt = keine Quittung erkannt */
  urteil?: Verdict
  /** Arbeitszeit: Summe der Läufe (Start bzw. Folgenachricht bis Ende), ohne Wartezeit */
  arbeitszeitMs?: number
}

export type Registry = { version: 1; aufgabe: string; agenten: Record<string, AgentEntry> }

export function emptyRegistry(aufgabe: string): Registry {
  return { version: 1, aufgabe, agenten: {} }
}

export function parseRegistry(text: string | null, aufgabe: string): Registry {
  if (!text) return emptyRegistry(aufgabe)
  try {
    const j = JSON.parse(text) as Partial<Registry>
    if (j.version !== 1 || typeof j.agenten !== 'object' || j.agenten === null) return emptyRegistry(aufgabe)
    return { version: 1, aufgabe, agenten: j.agenten as Registry['agenten'] }
  } catch {
    return emptyRegistry(aufgabe)
  }
}

const isAbsolute = (p: string): boolean => p.startsWith('/') || /^[A-Za-z]:\//.test(p)

/** Vergleichsform eines absoluten Pfads: `/c/x` und `C:/x` gleich, Laufwerkspfade ohne Groß-/Kleinschreibung. */
function compareForm(p: string): string {
  const drive = p.match(/^\/([A-Za-z])\/(.*)$/) ?? p.match(/^([A-Za-z]):\/(.*)$/)
  return drive ? `${drive[1]!.toLowerCase()}:/${drive[2]!.toLowerCase()}` : p
}

/**
 * Pfad relativ zum Projekt: Register und Token-Buch speichern keine absoluten
 * Pfade mit Benutzernamen oder Worktree. `roots` sind Hauptordner und Agenten-Worktree; die längste passende
 * Wurzel gewinnt. Rückfall: Muster `--wt-<name>/` (Paket-Worktree neben dem Hauptordner). Pfade außerhalb
 * bleiben normalisiert absolut; relative Pfade bleiben, wie sie sind (ohne `./`).
 */
export function toRepoRelative(
  p: string,
  roots: readonly (string | null | undefined)[],
  /** Ordner außerhalb des Projekts, die kurz benannt werden: Plugin → `<plugin>/…`, Home → `~/…` */
  outside: { plugin?: string | null; home?: string | null } = {},
): string {
  const path = normPath(p)
  if (!isAbsolute(path)) return path
  const target = compareForm(path)
  let best: string | null = null
  for (const r of roots) {
    if (!r) continue
    const root = compareForm(normPath(r).replace(/\/+$/, ''))
    if (root === '' || !isAbsolute(root)) continue
    if ((target === root || target.startsWith(`${root}/`)) && (best === null || root.length > best.length)) best = root
  }
  if (best !== null) {
    // gleiche Länge in Vergleichs- und Originalform (nur Kleinschreibung und Laufwerk-Schreibweise unterscheiden sich)
    const rest = target.slice(best.length).replace(/^\/+/, '')
    const original = path.length - rest.length
    return rest === '' ? '.' : path.slice(original)
  }
  const wt = path.match(/--wt-[^/]+\/(.+)$/)
  if (wt) return wt[1]!
  // außerhalb des Projekts keinen Benutzernamen speichern
  for (const [dir, short] of [[outside.plugin, '<plugin>'], [outside.home, '~']] as const) {
    if (!dir) continue
    const root = compareForm(normPath(dir).replace(/\/+$/, ''))
    if (root === '' || !isAbsolute(root)) continue
    if (target === root) return short
    if (target.startsWith(`${root}/`)) return `${short}/${path.slice(path.length - (target.length - root.length - 1))}`
  }
  const home = path.match(/^(?:[A-Za-z]:|\/[A-Za-z])?\/(?:Users|home)\/[^/]+\/(.*)$/i)
  return home ? `~/${home[1]}` : path
}

/**
 * Worktree-Ordner (`…--wt-<name>`) aus einem Text (Pfad eines Werkzeugaufrufs, Befehl, Startnachricht);
 * null, wenn keiner vorkommt. Der Mod nutzt es, wenn `agent.spawn` keinen Arbeitsordner meldet.
 */
export function worktreeOf(text: string): string | null {
  const m = text.match(/(?:[A-Za-z]:[\\/]|\/)?[^\s"'`<>|;&()]*--wt-[^\s"'`<>|;&()\\/]+/)
  return m ? m[0] : null
}

export type GitChange = { pfad: string; art: 'geaendert' | 'erstellt' }

function gitPath(raw: string): string {
  const t = raw.trim()
  return normPath(t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t)
}

/**
 * Geänderte und neue Dateien eines Worktrees aus `git diff --name-status <start>` und
 * `git status --porcelain` (Schreibvorgänge, die kein Werkzeugaufruf zeigte). Gelöschte Dateien
 * zählen als geändert; bei Umbenennung zählt der neue Name als erstellt. Ohne Doppelte, erstellt vor geändert.
 */
export function parseGitChanges(nameStatus: string, porcelain: string): GitChange[] {
  const out = new Map<string, GitChange['art']>()
  const put = (pfad: string, art: GitChange['art']) => {
    if (pfad === '') return
    if (out.get(pfad) !== 'erstellt') out.set(pfad, art)
  }
  for (const line of nameStatus.replace(/\r\n/g, '\n').split('\n')) {
    const parts = line.split('\t')
    const code = parts[0]?.trim() ?? ''
    if (code === '' || parts.length < 2) continue
    if (/^[RC]/.test(code)) put(gitPath(parts[2] ?? parts[1]!), 'erstellt')
    else put(gitPath(parts[1]!), code.startsWith('A') ? 'erstellt' : 'geaendert')
  }
  for (const line of porcelain.replace(/\r\n/g, '\n').split('\n')) {
    if (line.length < 4) continue
    const xy = line.slice(0, 2)
    const rest = line.slice(3)
    const pfad = gitPath(rest.includes(' -> ') ? rest.split(' -> ').at(-1)! : rest)
    put(pfad, xy === '??' || xy.includes('A') || xy.startsWith('R') ? 'erstellt' : 'geaendert')
  }
  return [...out].map(([pfad, art]) => ({ pfad, art }))
}

/** Änderungen aus Git ins Register übernehmen, ohne Doppelte zu dem, was die Werkzeugaufrufe schon zeigten. */
export function mergeChanges(reg: Registry, agentId: string, changes: readonly GitChange[], zeit: string): number {
  const a = reg.agenten[agentId]
  if (!a) return 0
  let n = 0
  for (const c of changes) {
    if ([...a.erstellt, ...a.geaendert].some(t => samePath(t.pfad, c.pfad) || samePath(c.pfad, t.pfad))) continue
    if (a[c.art].length >= MAX_TOUCHES) continue
    a[c.art].push({ pfad: c.pfad, zeit })
    n += 1
  }
  return n
}

/** Passt ein (evtl. absoluter) Pfad auf einen Projektpfad? Pfadende-Vergleich, ohne Groß-/Kleinschreibung. */
export function samePath(actual: string, projectPath: string): boolean {
  const a = normPath(actual).toLowerCase()
  const p = normPath(projectPath).toLowerCase()
  return a === p || a.endsWith(`/${p}`)
}

export function registerAgent(reg: Registry, e: Omit<AgentEntry, 'gelesen' | 'geaendert' | 'erstellt' | 'suchen' | 'letzteAktivitaet'>, zeit: string): AgentEntry {
  const entry: AgentEntry = { ...e, letzteAktivitaet: zeit, gelesen: [], geaendert: [], erstellt: [], suchen: 0 }
  reg.agenten[e.id] = entry
  return entry
}

export type TouchKind = 'gelesen' | 'geaendert' | 'erstellt' | 'suche'

const MAX_TOUCHES = 500

/**
 * Eine Berührung eintragen. Rückgabe: true, wenn eine gelesene Datei nicht mitgeliefert war (fehlender Kontext).
 * `viaBash`: Lesen aus einem Bash-/PowerShell-Befehl: nur Register, kein Lese-Budget.
 */
export function recordTouch(reg: Registry, agentId: string, kind: TouchKind, pfad: string, zeit: string, abschnitt?: string, viaBash = false): boolean {
  const a = reg.agenten[agentId]
  if (!a) return false
  a.letzteAktivitaet = zeit
  if (kind === 'suche') {
    a.suchen += 1
    return false
  }
  const list = a[kind]
  const t: Touch = { pfad: normPath(pfad), zeit, ...(abschnitt ? { abschnitt } : {}), ...(viaBash ? { bash: true as const } : {}) }
  if (list.length < MAX_TOUCHES) list.push(t)
  if (kind !== 'gelesen') return false
  const delivered = a.mitgeliefert.some(m => samePath(pfad, m))
  const before = a.gelesen.slice(0, -1).some(g => samePath(g.pfad, pfad))
  return !delivered && !before
}

/** Wer hat die Datei zuletzt geändert oder erstellt? (Weiterleitung, Schalter `register-forwarding`) */
export function ownersOf(reg: Registry, pfad: string): AgentEntry[] {
  return Object.values(reg.agenten)
    .filter(a => [...a.geaendert, ...a.erstellt].some(t => samePath(t.pfad, pfad) || samePath(pfad, t.pfad)))
    .sort((a, b) => (a.letzteAktivitaet < b.letzteAktivitaet ? 1 : -1))
}

/** Dateien eines Agenten, die er gelesen, aber nicht mitgeliefert bekam. */
export function extraReads(a: AgentEntry): string[] {
  const seen: string[] = []
  for (const g of a.gelesen) {
    if (g.bash) continue // Lesen per Bash zählt nicht gegen das Lese-Budget
    if (a.mitgeliefert.some(m => samePath(g.pfad, m))) continue
    if (!seen.some(s => samePath(s, g.pfad))) seen.push(g.pfad)
  }
  return seen
}

// ---------------------------------------------------------------------------
// Lese-Budget (Schalter `read-budget`, nur als Messvariante)
//
// Gezählt werden Aufrufe, keine Modell-Runden (Annahme: `tool.call` kennt die Runde nicht):
// jede nicht mitgelieferte Datei einmal (weitere Abschnitte derselben Datei sind frei) plus jede Suche.

/** Grenze, wenn der Schalter keinen Wert hat. vorläufiger Wert („z. B. höchstens 4“), nach Messung festlegen. */
export const READ_BUDGET_DEFAULT = 4

/** Wert des Schalters (`read-budget: an, 6` oder `an 6`) als Zahl; sonst der Standard. */
export function parseReadBudget(value: string): number {
  const n = Number(value.match(/\d+/)?.[0])
  return Number.isInteger(n) && n > 0 ? n : READ_BUDGET_DEFAULT
}

/** Bisher verbrauchte zusätzliche Lese- und Suchaufrufe. */
export function extraReadCount(a: AgentEntry): number {
  return extraReads(a).length + a.suchen
}

/** Zählt dieser Aufruf zum Lese-Budget? Read einer nicht mitgelieferten, noch nicht gelesenen Datei; jede Suche. */
export function isExtraRead(a: AgentEntry, tool: string, pfad?: string): boolean {
  if (tool === 'Grep' || tool === 'Glob') return true
  if (tool !== 'Read' || !pfad) return false
  if (a.mitgeliefert.some(m => samePath(pfad, m))) return false
  return !a.gelesen.some(g => !g.bash && (samePath(g.pfad, pfad) || samePath(pfad, g.pfad)))
}
