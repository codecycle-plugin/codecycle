// Solo-Weg im Mod: Schreibrechte in Solo-Aufgaben, Startsperre des Prüfers, Merge-Sperre.
// Reine Funktionen, ohne Node und ohne Mod-API; hooks/register.tsx holt die Daten (STATE.md, Git) und gibt die Meldungen weiter.
// Ein Netz gegen Versehen, keine Sicherheitsgrenze (wie der Zaun).

import { commandName, positionals, walkSegments } from '../../lib/bash-shell.ts'
import { SOLO_REPORT, SOLO_SECURITY_REPORT, checkFindings } from '../../lib/solo-findings.ts'
import { samePath } from './ledger-registry.ts'
import { isWriteTool, writeTargetsOf, type ToolCall } from './fence.ts'

/** Rolle des Prüfers auf dem Solo-Weg */
export const SOLO_REVIEWER = 'solo-reviewer'

/**
 * Agenten, die in einer Solo-Aufgabe schreiben dürfen (neben der Sitzung); der Prüfer nur seinen Bericht.
 * Einzige Stelle dieser Liste: Ändert sich das Rollen-Set, nur hier anpassen.
 */
export const SOLO_WRITERS: ReadonlySet<string> = new Set(['builder-logic', 'builder-routine'])

const WHO_WRITES = 'Schreiben dürfen die Sitzung, builder-logic und builder-routine; der Solo-Prüfer nur seinen Bericht'

/**
 * Darf dieser Aufruf in einer Solo-Aufgabe schreiben? `role` null = Agent ohne codecycle-Rolle. `SOLO_WRITERS` dürfen alles,
 * jede codecycle-Rolle ihren eigenen Bericht (`bericht` aus der Startnachricht). Der Solo-Prüfer darf mit Write, Edit und
 * NotebookEdit nur seinen Bericht schreiben, Bash bleibt ihm frei (er probiert Kommandozeile und Schnittstelle aus).
 * Alle anderen: keine Schreibziele (Datei des Aufrufs, erkannte Ziele in Bash). Rückgabe: Meldung bei Verweigerung, sonst null.
 */
export function soloWriteDeny(role: string | null, call: ToolCall, env: { rel: (p: string) => string; bericht?: string | undefined }): string | null {
  if (role !== null && SOLO_WRITERS.has(role)) return null
  if (role === SOLO_REVIEWER && !isWriteTool(call.tool)) return null
  const own = env.bericht ? env.rel(env.bericht) : null
  const mine = (t: string): boolean => {
    const rel = env.rel(t)
    return own !== null && samePath(rel, own) && samePath(own, rel)
  }
  const target = writeTargetsOf(call).find(t => !mine(t))
  if (target === undefined) return null
  if (role === SOLO_REVIEWER) {
    return `codecycle (Solo-Prüfer): ${env.rel(target)} ist nicht dein Bericht. Schreibe nur ${own ?? `<Aufgabenordner>/${SOLO_REPORT}`}; Funde gehören in den Bericht, nicht in den Code.`
  }
  const who = role === null ? 'Ein Agent ohne codecycle-Rolle' : `Die Rolle ${role}`
  return `codecycle (Solo-Aufgabe): ${who} darf hier nicht schreiben (${env.rel(target)}${call.tool === 'Bash' ? ', Schreibziel im Bash-Befehl' : ''}). ${WHO_WRITES}. Lesen und Suchen bleiben frei; gib dein Ergebnis als Antwort zurück.`
}

/**
 * Startsperre des Prüfers (Haltepunkt „Eigene Kontrolle“): nur in einer Solo-Aufgabe, nur nach grünem
 * `codecycle solo check`, und seitdem nichts außerhalb des Aufgabenordners geändert. `changed`: Dateien zwischen
 * `geprueftAuf` und dem Aufgaben-Branch ohne den Aufgabenordner; null, wenn Git das nicht beantworten konnte.
 */
export function reviewerStartProblem(
  state: { weg?: string | undefined; geprueftAuf?: string | undefined } | null,
  dir: string | null,
  changed: readonly string[] | null,
): string | null {
  const folder = dir ?? '<aufgabenordner>'
  if (!state || state.weg !== 'solo') return `codecycle: ${SOLO_REVIEWER} prüft nur Solo-Aufgaben (STATE.md mit „weg: solo“); im vollen Ablauf prüft reviewer.`
  if (!state.geprueftAuf) return `codecycle: kein Prüfer ohne eigene Kontrolle. Erst \`codecycle solo check ${folder}\` grün, dann den Prüfer starten.`
  if (changed === null) return `codecycle: Stand von geprueftAuf ${state.geprueftAuf.slice(0, 7)} nicht prüfbar. \`codecycle solo check ${folder}\` erneut ausführen.`
  if (changed.length > 0) {
    const list = `${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ' …' : ''}`
    return `codecycle: seit \`codecycle solo check\` geändert (${list}). Erst \`codecycle solo check ${folder}\` erneut grün, dann den Prüfer starten.`
  }
  return null
}

const GIT_VALUED = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']
const MERGE_VALUED = ['-m', '-F', '-s', '-X', '--message', '--file', '--strategy', '--strategy-option', '--into-name', '--cleanup', '-S', '--gpg-sign']

/** Branches, die ein Befehl per `git merge` einholt (auch in `sh -c`, nach `&&`); andere Git-Befehle zählen nicht. */
export function mergedBranches(command: string): string[] {
  const out: string[] = []
  walkSegments(command, seg => {
    const { name, args } = commandName(seg)
    if (name !== 'git') return
    let i = 0
    while (i < args.length && args[i]!.startsWith('-')) i += GIT_VALUED.includes(args[i]!) ? 2 : 1
    if (args[i] !== 'merge') return
    for (const b of positionals(args.slice(i + 1), MERGE_VALUED)) if (!out.includes(b)) out.push(b)
  })
  return out
}

/**
 * Merge-Sperre (Haltepunkte „Prüfung“ und „Nachbesserung“): die nötigen Berichte (`requiredReports`) und TASK.md aus dem
 * Stand des Aufgaben-Branchs; Text null = Bericht fehlt bzw. nicht committet. Rückgabe: Meldung, sonst null.
 */
export function soloMergeProblem(dir: string, reports: readonly { path: string; text: string | null }[], task: string | null): string | null {
  const missing = reports.filter(r => r.text === null).map(r => r.path)
  if (missing.length > 0) {
    const second = missing.includes(SOLO_SECURITY_REPORT) ? ' (zweiter Prüfer mit „Auftrag: Sicherheit“)' : ''
    return `codecycle: kein Merge ohne Prüfung. ${missing.map(p => `${dir}/${p}`).join(', ')} fehlt im Aufgaben-Branch: Prüfer (${SOLO_REVIEWER})${second} starten, Bericht committen.`
  }
  const r = checkFindings(reports.map(x => x.text).join('\n'), task ?? '')
  if (r.fehlend.length > 0) {
    return `codecycle: kein Merge mit offenen Funden (${r.fehlend.join(', ')}). In TASK.md, Abschnitt „Funde“, je Fund „behoben (<commit>)“ oder „verworfen: <Grund>“ eintragen, committen; prüfen mit \`codecycle solo funde ${dir}\`.`
  }
  return null
}
