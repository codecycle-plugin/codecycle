// Kontextpaket: Fundstellen aus PLAN.md als Abschnitte, Kriterien, Paketabschnitt,
// Konventionen. Rein, ohne Node und ohne Mod-API: der Aufrufer (Mod) liefert `readFile`.
// Der Aufbau (Auflösung, Abschnitte) nutzt dieselben Funktionen wie das Werkzeug (`locate.ts`).

import type { Criterion } from '../../lib/task-file.ts'
import { type Locus, type PlanPackage, parseHeading } from '../../lib/plan-file.ts'
import { SMALL_FILE_LINES, buildContextSection } from '../../lib/context-section.ts'
import { type GraphHit, isTreffer, locateSymbol } from '../../lib/locate.ts'
import type { Signatur } from '../../lib/signatures.ts'

export type PackageKind = 'full' | 'review' | 'none'

/** Rollen laut 9a: Handwerker und Test-Autor volles Paket; Prüfer Diff + Aufrufer; Gutachter und andere keins. */
export function packageKind(role: string): PackageKind {
  if (role === 'builder-logic' || role === 'builder-routine' || role === 'test-author') return 'full'
  if (role === 'reviewer' || role === 'refuter' || role === 'security-reviewer') return 'review'
  return 'none'
}

/**
 * Rollen, die über die ganze Aufgabe arbeiten und kein eigenes Paket haben: Für sie gilt ein Paket nur,
 * wenn die Startnachricht es ausdrücklich nennt (`Paket: P2` oder `Paket: alle`), nicht eine beiläufige P-Nummer im Text.
 */
const TASK_WIDE_ROLES: readonly string[] = ['acceptance', 'architect', 'area-architect', 'plan-reviewer', 'surveyor', 'doc-keeper', 'browser-reviewer']

/**
 * Schreibziel aus der Startnachricht (Name ohne `.md`): ein einziger `reports/*.md` gilt; bei mehreren der Pfad
 * nach „Bericht:“, sonst der Name `<nr|P<n>>-<rolle>` bzw. `<rolle>`, sonst keiner (Standardpfad aus `reportPath`).
 * Ein Lesehinweis auf einen fremden Bericht verschiebt so das Schreibrecht nicht.
 */
function pickReport(prompt: string, role?: string): string | undefined {
  const names = [...prompt.matchAll(/reports[\\/]([\w.-]+?)\.md/g)].map(m => m[1]!)
  if (new Set(names).size <= 1) return names[0]
  const labelled = prompt.match(/\bBericht(?:spfad)?\s*:\s*[`"']?[^\s`"']*?reports[\\/]([\w.-]+?)\.md/i)
  if (labelled) return labelled[1]
  if (!role) return undefined
  return names.find(n => n === role || new RegExp(`^(?:P\\d+|\\d+)-${role}$`, 'i').test(n))
}

/** Aufgabenordner, Paket und Berichtspfad aus der Startnachricht des Bauleiters; `role` (ohne Präfix) schränkt die Paket-Ableitung für Aufgaben-Rollen ein. */
export function parseSpawnPrompt(prompt: string, role?: string): { aufgabeDir?: string; paket?: string; bericht?: string } {
  const out: { aufgabeDir?: string; paket?: string; bericht?: string } = {}
  const dir = prompt.match(/(?:^|[\s"'`(])((?:[\w./\\:-]*?)docs[\\/]codecycle[\\/][^\s"'`)\\/]+)/)
  if (dir) out.aufgabeDir = dir[1]!.replace(/\\/g, '/').replace(/^.*?(docs\/codecycle\/)/, '$1')
  const report = pickReport(prompt, role)
  if (report) out.bericht = `reports/${report}.md`
  // Aufgabenmodus: Paket „alle“ geht vor jeder P-Nummer im Text
  const all = prompt.match(/\bPaket(?:-ID)?\s*[:=]?\s*`?alle\b/i)
  if (all) {
    out.paket = 'alle'
    return out
  }
  const labelled = prompt.match(/\bPaket(?:-ID)?\s*[:=]?\s*`?(P\d+)\b/i)
  if (role && TASK_WIDE_ROLES.includes(role)) {
    if (labelled?.[1]) out.paket = labelled[1].toUpperCase()
    return out
  }
  const fromReport = report?.match(/^(P\d+)-/)
  const any = prompt.match(/\b(P\d+)\b/)
  const id = labelled?.[1] ?? fromReport?.[1] ?? any?.[1]
  if (id) out.paket = id.toUpperCase()
  return out
}

/**
 * Absoluter Berichtspfad im Hauptordner: Agenten in einem Paket-Worktree sollen
 * ihren Bericht nicht in den Worktree schreiben. Regel wie in den Agenten-Anleitungen: `reports/<paket>-<rolle>.md`
 * im Aufgabenordner, ohne Paket `reports/<rolle>.md`, ohne Aufgabe `.codecycle/tmp/reports/<rolle>.md`.
 * Nennt der Bauleiter einen Pfad (`bericht` aus `parseSpawnPrompt`), gilt dessen Dateiname.
 */
export function reportPath(o: { root: string; dir: string | null; paket: string | null; rolle: string; bericht?: string }): string {
  const root = o.root.replace(/\\/g, '/').replace(/\/+$/, '')
  const base = o.dir ? `${o.dir.replace(/\/+$/, '')}/reports` : '.codecycle/tmp/reports'
  const name = o.bericht ? o.bericht.replace(/^.*reports\//, '') : `${o.paket ? `${o.paket}-` : ''}${o.rolle}.md`
  return `${root}/${base}/${name}`
}

/** Der Rohtext eines Pakets (`### P1 – Titel` bis zur nächsten Überschrift) aus PLAN.md. */
export function extractPackageBlock(planText: string, id: string): string | null {
  const lines = planText.replace(/\r\n/g, '\n').split('\n')
  let inPakete = false
  let take = false
  const out: string[] = []
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      inPakete = h2[1]!.trim().toLowerCase() === 'pakete'
      if (take) break
      continue
    }
    if (!inPakete) continue
    const h3 = line.match(/^###\s+(.*)$/)
    if (h3) {
      if (take) break
      // ID ohne Satzzeichen und Formatierung: `P1 – …`, `P1: …`, `P1 …`, `**P1** …`
      take = parseHeading(h3[1]!)?.id.toUpperCase() === id.toUpperCase()
    }
    if (take) out.push(line)
  }
  const text = out.join('\n').trim()
  return text === '' ? null : text
}

/** Der ganze Abschnitt „## Pakete“ aus PLAN.md (Aufgabenmodus `Paket: alle`); null ohne Abschnitt. */
export function extractPackagesSection(planText: string): string | null {
  const lines = planText.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let take = false
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      if (take) break
      take = h2[1]!.trim().toLowerCase() === 'pakete'
    }
    if (take) out.push(line)
  }
  const text = out.join('\n').trim()
  return text === '' ? null : text
}

/** Aufzählungspunkte aus dem Abschnitt „Konventionen“ einer Markdown-Datei. */
export function conventionBullets(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let level = 0
  const out: string[] = []
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (h) {
      const l = h[1]!.length
      if (level > 0 && l <= level) level = 0
      if (level === 0 && /^konventionen\b/i.test(h[2]!)) level = l
      continue
    }
    if (level === 0) continue
    const b = line.match(/^\s*[-*]\s+(.*\S)\s*$/)
    if (b) out.push(b[1]!)
  }
  return out
}

/** Die `max` Punkte mit den meisten Treffern zu den Stichwörtern (Pfade, Symbole); ohne Treffer die ersten. */
export function pickConventions(bullets: readonly string[], keywords: readonly string[], max = 3): string[] {
  const words = [...new Set(keywords.map(k => k.toLowerCase()).filter(k => k.length >= 3))]
  const scored = bullets.map((b, i) => ({ b, i, s: words.filter(w => b.toLowerCase().includes(w)).length }))
  scored.sort((a, c) => c.s - a.s || a.i - c.i)
  return scored.slice(0, max).map(x => x.b)
}

/** Stichwörter aus Fundstellen: Dateiendungen, Ordner- und Dateinamen, Symbole. */
export function keywordsOf(loci: readonly Locus[]): string[] {
  const out: string[] = []
  for (const l of loci) {
    out.push(...l.datei.split(/[\\/.]/), ...(l.symbol ? l.symbol.split(/::|\.|->|#/) : []))
  }
  return out
}

export type PackageInput = {
  role: string
  paket: string
  plan?: PlanPackage
  /** Rohtext des Paketabschnitts aus PLAN.md */
  planBlock?: string
  criteria: readonly Criterion[]
  /** liest eine Datei relativ zum Projekt (oder Worktree); null = nicht vorhanden */
  readFile: (path: string) => Promise<string | null>
  contextPackage: boolean
  sections: boolean
  conventions: readonly string[]
  /** nur Prüfer: Diff des Pakets (bereits gekürzt) und Aufrufer-Zeilen */
  diff?: string
  callers?: readonly string[]
  /** Zeilen Umfeld um ein Symbol */
  umfeld?: number
  /** höchstens so viele Zeichen für eingebettete Code-Abschnitte */
  maxChars?: number
  /** Graph-Treffer je Fundstelle, Schlüssel `datei::symbol` (aus `codecycle package-info`); fehlt = Outline/Suche */
  graph?: Readonly<Record<string, GraphHit[]>>
  /** Signaturen der im Abschnitt aufgerufenen Funktionen und Typen (aus `codecycle package-info`) */
  signaturen?: readonly Signatur[]
}

export type PackageResult = {
  /** Text zum Anhängen an die Startnachricht ('' = nichts anhängen) */
  text: string
  /** Dateien, deren Inhalt oder Abschnitt mitgeliefert wurde (für „fehlender Kontext“) */
  mitgeliefert: string[]
  /** Fundstellen, die nicht aufgelöst werden konnten (mit Grund) */
  offen: string[]
}

const FENCE = '```'
export const READ_RULE =
  'Leseregel: In der ersten Runde alle Fundstellen gleichzeitig lesen, nur als Abschnitte (offset/limit; `codecycle locate "Datei :: Symbol"` löst Symbole auf). Ganze Dateien nur bis etwa 150 Zeilen oder wenn du sie ganz brauchst.'

function lociList(loci: readonly Locus[]): string[] {
  return loci.map(l => `- ${l.datei}${l.symbol ? ` :: ${l.symbol}` : ''}`)
}

function criteriaText(plan: PlanPackage | undefined, all: readonly Criterion[]): string[] {
  if (!plan) return []
  const rows = plan.kriterien.map(id => all.find(c => c.id === id) ?? { id, kriterium: '(nicht in TASK.md gefunden)', pruefweg: '' })
  return rows.map(c => `- ${c.id}: ${c.kriterium}${c.pruefweg ? ` (Prüfweg: ${c.pruefweg})` : ''}`)
}

/** Baut das Kontextpaket für eine Rolle (Abschnitt 9a). */
export async function buildPackage(i: PackageInput): Promise<PackageResult> {
  const kind = packageKind(i.role)
  const none: PackageResult = { text: '', mitgeliefert: [], offen: [] }
  if (kind === 'none') return none
  if (!i.plan) {
    return {
      ...none,
      text: `Kontextpaket: Paket ${i.paket} nicht in PLAN.md gefunden, kein Paket mitgeliefert. ${READ_RULE}`,
    }
  }
  const umfeld = i.umfeld ?? 5
  const maxChars = i.maxChars ?? 40_000
  const mitgeliefert: string[] = []
  const offen: string[] = []
  const parts: string[] = []

  parts.push(`## Kontextpaket (vom codecycle-Mod, Rolle ${i.role}, Paket ${i.paket})`)

  if (!i.contextPackage) {
    // Schalter context-package aus: nur Fundstellen-Liste und Leseregel (wie ohne Mod)
    parts.push('### Fundstellen', ...lociList(i.plan.fundstellen), '', READ_RULE)
    return { text: parts.join('\n'), mitgeliefert, offen }
  }

  parts.push(
    'Zeilennummern gelten für den Stand beim Start. Lies die aktuelle Datei neu, bevor du änderst. Fehlt dir etwas, hole es gezielt als Abschnitt (alles in einer Runde).',
  )
  if (i.planBlock) parts.push('### Paketabschnitt (PLAN.md)', i.planBlock)
  const crit = criteriaText(i.plan, i.criteria)
  if (crit.length > 0) parts.push('### Kriterien (TASK.md)', ...crit)

  if (kind === 'review') {
    parts.push('### Diff des Pakets', i.diff && i.diff.trim() !== '' ? `${FENCE}diff\n${i.diff.trim()}\n${FENCE}` : '(Diff nicht verfügbar: `git diff` selbst ausführen)')
    parts.push('### Betroffene Aufrufer', ...(i.callers && i.callers.length > 0 ? i.callers.map(c => `- ${c}`) : ['(keine ermittelt: `codecycle callers "Symbol"` nutzen)']))
    return { text: parts.join('\n'), mitgeliefert, offen }
  }

  // volles Paket: Abschnitte der Fundstellen
  const code: string[] = []
  let used = 0
  const done = new Set<string>()
  for (const l of i.plan.fundstellen) {
    const key = `${l.datei}::${l.symbol ?? ''}`
    if (done.has(key)) continue
    done.add(key)
    const content = await i.readFile(l.datei)
    if (content === null) {
      offen.push(`${l.datei}${l.symbol ? ` :: ${l.symbol}` : ''}: Datei fehlt (neu anzulegen oder noch nicht vorhanden)`)
      continue
    }
    let block: string
    if (!i.sections || (l.symbol === null && content.split('\n').length <= SMALL_FILE_LINES)) {
      block = `${l.datei}  (ganze Datei)\n${FENCE}\n${content.replace(/\r\n/g, '\n').trimEnd()}\n${FENCE}`
    } else if (l.symbol === null) {
      offen.push(`${l.datei}: große Datei ohne Symbol, als Abschnitt nachlesen`)
      continue
    } else {
      const hits = i.graph?.[`${l.datei}::${l.symbol}`]
      const r = locateSymbol(l.datei, l.symbol, content, hits && hits.length > 0 ? { graph: hits } : {})
      if (isTreffer(r)) block = buildContextSection(content, r, umfeld)
      else {
        offen.push(
          r.kandidaten.length === 0
            ? `${l.datei} :: ${l.symbol}: nicht gefunden`
            : `${l.datei} :: ${l.symbol}: mehrdeutig (${r.kandidaten.map(t => `${t.start}-${t.ende}`).join(', ')}), nicht geraten`,
        )
        continue
      }
    }
    if (used + block.length > maxChars) {
      offen.push(`${l.datei}${l.symbol ? ` :: ${l.symbol}` : ''}: Paket zu groß, nicht eingebettet`)
      continue
    }
    used += block.length
    code.push(block)
    if (!mitgeliefert.includes(l.datei)) mitgeliefert.push(l.datei)
  }
  if (code.length > 0) parts.push('### Zu ändernde Stellen (Abschnitte)', ...code)
  const sigs = (i.signaturen ?? []).filter(s => !i.plan!.fundstellen.some(l => l.datei === s.datei && l.symbol?.split(/::|\.|->|#/).at(-1) === s.name))
  if (sigs.length > 0) {
    parts.push(
      '### Signaturen aufgerufener Funktionen und Typen (nur Kopfzeilen)',
      ...sigs.map(s => `- ${s.datei}:${s.zeile}  ${s.parent ? `${s.parent}::` : ''}${s.signatur}`),
    )
  }

  // Logik-Pakete: Tests des Test-Autors (Handwerker); der Test-Autor bekommt die bestehenden Testdateien aus „Tests:“,
  // die er ändert oder ergänzt (sonst fehlte eine geänderte Testdatei im Paket)
  if ((i.role === 'builder-logic' || i.role === 'test-author') && i.plan.tests.length > 0) {
    const tests: string[] = []
    const neu: string[] = []
    for (const t of i.plan.tests) {
      const content = await i.readFile(t)
      if (content === null) {
        neu.push(t)
        continue
      }
      const text = content.replace(/\r\n/g, '\n').trimEnd()
      if (used + text.length > maxChars * 1.5) {
        offen.push(`${t}: Testdatei zu groß, nicht eingebettet`)
        continue
      }
      used += text.length
      tests.push(`${t}\n${FENCE}\n${text}\n${FENCE}`)
      mitgeliefert.push(t)
    }
    if (i.role === 'test-author') {
      if (tests.length > 0) parts.push('### Bestehende Testdateien des Pakets (du änderst oder ergänzt sie)', ...tests)
      if (neu.length > 0) parts.push(`Neu anzulegen: ${neu.join(', ')}`)
    } else if (tests.length > 0) parts.push('### Tests des Test-Autors (nicht ändern)', ...tests)
  }

  if (i.conventions.length > 0) parts.push('### Konventionen (Auswahl)', ...i.conventions.map(c => `- ${c}`))
  if (i.plan.angeboten.length > 0) parts.push('### Angeboten (nur Liste, bei Bedarf in einer Runde lesen)', ...lociList(i.plan.angeboten))
  if (offen.length > 0) parts.push('### Nicht mitgeliefert', ...offen.map(o => `- ${o}`))
  return { text: parts.join('\n'), mitgeliefert, offen }
}
