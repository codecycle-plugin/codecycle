// Plan als eigenständige HTML-Seite (Schalter `plan-html`, Schritt 3 „Plan prüfen“).
// Reiner Code ohne Node und ohne Mod-API, wie plan-file.ts: bekommt die gelesenen Dateien, liefert Text.
// Eine Datei, kein Skript, kein Nachladen: helles und dunkles Design, auch auf schmalen Anzeigen lesbar.

import type { TaskState } from '../types'
import type { Task } from '../lib/task-file.ts'
import type { Plan, PlanPackage } from '../lib/plan-file.ts'

export type PlanHtmlInput = {
  plan: Plan
  /** PLAN.md im Wortlaut; wird, wenn vorhanden, einklappbar angehängt */
  planText?: string
  task?: Task | null
  state?: TaskState | null
  titel?: string
}

/** Maskiert Text für HTML (Inhalt und Attributwerte). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const e = escapeHtml

const CSS = `
:root{--bg:#fff;--fg:#1f1f1f;--muted:#6b6b68;--line:#e4e4e1;--card:#f4f3f0;--accent:#c4552f;--ok:#2f7d4d;--warn:#a86a00}
@media (prefers-color-scheme: dark){:root{--bg:#1c1c1b;--fg:#ececec;--muted:#a8a8a4;--line:#333331;--card:#262625;--accent:#e68a66;--ok:#6fcf97;--warn:#e0b050}}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:28px 0 8px}
.sub{color:var(--muted);margin:0 0 16px}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px;padding:0;list-style:none}
.facts li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px}
.facts b{display:block;font-size:.75rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.bar{height:6px;border-radius:3px;background:var(--line);margin-top:4px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent)}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;background:var(--card)}
tr:last-child td{border-bottom:0}
code{font:13px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-word}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 8px;font-size:.8rem}
.heikel{color:var(--warn);border-color:var(--warn)}.einfach{color:var(--ok);border-color:var(--ok)}
ul.files{margin:0;padding-left:16px}ul.files li{margin:0}
.k{font-weight:600}.muted{color:var(--muted)}
.note{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:10px 14px;margin:24px 0 0}
details{margin-top:24px}summary{cursor:pointer;color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-word;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;font:13px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
`

function fileList(label: string, files: string[]): string {
  if (files.length === 0) return ''
  return `<div class="muted">${e(label)}</div><ul class="files">${files.map(f => `<li><code>${e(f)}</code></li>`).join('')}</ul>`
}

function ids(list: string[]): string {
  return list.length === 0 ? '<span class="muted">–</span>' : list.map(i => `<span class="k">${e(i)}</span>`).join(', ')
}

function packageRow(p: PlanPackage): string {
  const files = fileList('Neu', p.neu) + fileList('Ändern', p.aendern) + fileList('Tests', p.tests)
  return `<tr>
<td class="k">${e(p.id)}</td>
<td>${e(p.titel)}${p.testansatz ? `<div class="muted">Testansatz: ${e(p.testansatz)}</div>` : ''}</td>
<td><code>${e(p.rolle)}</code></td>
<td><span class="tag ${e(p.schwierigkeit)}">${e(p.schwierigkeit)}</span></td>
<td>${files || '<span class="muted">–</span>'}</td>
<td>${ids(p.kriterien)}</td>
<td>${p.abhaengigVon.length > 0 ? `nach ${ids(p.abhaengigVon)}` : '<span class="muted">frei</span>'}${p.parallelMit.length > 0 ? `<div>parallel mit ${ids(p.parallelMit)}</div>` : ''}</td>
</tr>`
}

function facts(state: TaskState | null | undefined, count: number): string {
  const items: [string, string, string?][] = []
  if (state) {
    items.push(['Größe', state.groesse || '–'], ['Zustand', state.zustand || '–'])
    const { geplant, verbraucht } = state.budget
    const share = geplant > 0 ? Math.min(100, Math.round((verbraucht / geplant) * 100)) : 0
    items.push(['Budget', `${verbraucht} von ${geplant} Läufen`, `<div class="bar"><i style="width:${share}%"></i></div>`])
    if (state.planrunden > 0) items.push(['Planrunden', String(state.planrunden)])
  }
  items.push(['Pakete', String(count)])
  return `<ul class="facts">${items.map(([k, v, extra]) => `<li><b>${e(k)}</b>${e(v)}${extra ?? ''}</li>`).join('')}</ul>`
}

/** Baut die vollständige HTML-Seite zum Plan. Alle Texte aus den Dateien werden maskiert. */
export function renderPlanHtml(input: PlanHtmlInput): string {
  const { plan, planText, task, state } = input
  const titel = input.titel?.trim() || state?.aufgabe || plan.quelle
  const ziel = task?.abschnitte['ziel']
  const criteria = task?.kriterien ?? []
  const covered = new Set(plan.pakete.flatMap(p => p.kriterien))

  const packages = `<div class="wrap"><table>
<thead><tr><th>ID</th><th>Titel</th><th>Rolle</th><th>Schwierigkeit</th><th>Dateien</th><th>Kriterien</th><th>Reihenfolge</th></tr></thead>
<tbody>
${plan.pakete.map(packageRow).join('\n')}
</tbody></table></div>`

  const criteriaTable =
    criteria.length === 0
      ? ''
      : `<h2>Abnahmekriterien</h2>
<div class="wrap"><table>
<thead><tr><th>ID</th><th>Kriterium</th><th>Prüfweg</th><th>Gedeckt von</th></tr></thead>
<tbody>
${criteria
  .map(c => {
    const by = plan.pakete.filter(p => p.kriterien.includes(c.id)).map(p => p.id)
    return `<tr><td class="k">${e(c.id)}</td><td>${e(c.kriterium)}</td><td>${e(c.pruefweg)}</td><td>${by.length > 0 ? ids(by) : '<span class="tag heikel">kein Paket</span>'}</td></tr>`
  })
  .join('\n')}
</tbody></table></div>`

  const unknown = [...covered].filter(id => criteria.length > 0 && !criteria.some(c => c.id === id))
  const unknownNote = unknown.length > 0 ? `<p class="muted">Pakete nennen Kriterien, die in der TASK.md fehlen: ${ids(unknown)}</p>` : ''

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(titel)}: Plan</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${e(titel)}</h1>
<p class="sub">Plan aus <code>${e(plan.quelle)}</code>${ziel ? `: ${e(ziel.split('\n')[0] ?? '')}` : ''}</p>
${facts(state, plan.pakete.length)}
<h2>Pakete</h2>
${packages}
${criteriaTable}
${unknownNote}
<div class="note"><b>Freigabe im Chat.</b> Diese Seite zeigt den Plan nur an. Freigegeben wird im Gespräch mit dem Bauleiter, erst dann geht es an die Umsetzung.</div>
${planText ? `<details><summary>PLAN.md im Wortlaut</summary><pre>${e(planText)}</pre></details>` : ''}
</main>
</body>
</html>
`
}
