# codecycle: Projektbeschreibung

Vorlage für `.claude/codecycle.md`. Wird vom Agenten `setup` ausgefüllt, der Nutzer bestätigt.

## Sprache und Struktur
- Sprache der Agenten-Ausgaben (Berichte, Quittungen, Rückfragen, Commit-Messages): Deutsch
- Struktur: <Ordner und ihre Aufgabe, Haupt-Sprachen, Frameworks>

## Befehle
Über das Projekt-Werkzeug (`codecycle test`, `lint`, `format`, `check`, `server`); je Befehl oder „nicht vorhanden“.
- test: <…>
- lint: <… | nicht vorhanden>
- format: <… | nicht vorhanden>
- server: <… | nicht vorhanden>

## Oberfläche
- Gibt es eine: <ja | nein>
- Browser-Voraussetzung für den Browser-Prüfer: ein Browser-Werkzeug (Desktop-App oder Playwright-Plugin; Namen unbestätigt), sonst entfällt der Browser-Prüfer
- Start: <…>
- Wegwerf-Daten: <Umgebungsvariable der Datendatei | keine> (steht als `serverTemp.env` in `.codecycle/tool.config.json`; `codecycle server --temp` startet damit den Server mit einer frischen Wegwerf-Datei, damit der Browser-Prüfer echte Daten nicht ändert)
- Test-Zugang: <Testwerte, keine echten Zugangsdaten>

## Code-Graph
- Anbieter: <code-review-graph | codegraph | keiner> (Konfiguration `.codecycle/tool.config.json`: `graph.provider` = `auto` | `code-review-graph` | `codegraph` | `none`)
- Aktualisierung: <Git-Hooks in .githooks/ | von Hand | –>

## Risikobereiche
- <Bereich, Grund> (z. B. Mandantentrennung, Auth, Migrationen)

## Konventionen
- <2–3 knappe Regeln je Bereich; Details stehen in der Bereichs-CLAUDE.md>

## Projektspezifische Prüfhinweise
- <z. B. „Mandantentrennung bei jeder Abfrage prüfen“>

## Doku-Aufbau
- <Wurzel-CLAUDE.md kurz, Verweise als Pfad in Backticks (kein @-Import); Bereichs-CLAUDE.md in <Ordnern>; Architektur unter <docs/architecture/>; Changelog: <Datei>>

## Ablage
- teilen | lokal

## Schalter
Standardwerte sind Vorschläge, noch nicht vom Nutzer bestätigt. Alle Schalter stehen hier; Wirkung bei „aus“ steht im Workflow-Skill.
```
context-package: an
sections: an
reuse-agents: an
half-blind: an
test-author: an
ideas-auto: an
multi-planner: an
conflict-check: an
helper-scripts: an
security-reviewer: an
refuter: aus
fence: aus
escalation: aus
haiku-simple: aus
register-forwarding: aus
package-lead: aus
read-budget: aus
plan-html: aus
auto-resume: aus
agent-progress: aus
demo-data: aus   # Beispieldaten auf Bautafel und Seitenleiste, solange keine Aufgabe offen ist
assume-and-continue: an
graph: an   # wenn vorhanden
cache-ttl-builder: 5m
```
