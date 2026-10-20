# codecycle: Projektbeschreibung

Vorlage für `.claude/codecycle.md`. Wird vom Agenten `setup` ausgefüllt, der Nutzer bestätigt. Nur Dauerhaftes: kein Zustand (wie „Projekt ist leer“, „entsteht mit dieser Aufgabe“, „offen“) und keine Angaben zur Umgebung; die Browser-Bereitschaft meldet `codecycle selftest`.

## Sprache und Struktur
- Sprache der Agenten-Ausgaben (Berichte, Quittungen, Rückfragen, Commit-Messages): Deutsch
- Struktur: <vorhandene Ordner und ihre Aufgabe, Haupt-Sprachen, Frameworks>

## Befehle
Über das Projekt-Werkzeug (`codecycle test`, `lint`, `format`, `check`, `server`); je Befehl oder „nicht vorhanden“. Den Serverbefehl übernimmt `codecycle install-tool` als `commands.server` in `.codecycle/tool.config.json` (`--update-config` ergänzt ihn dort, wenn er fehlt); in der Zeile `server:` steht deshalb nur der Befehl in Backticks oder „nicht vorhanden“.
- test: <…>
- lint: <… | nicht vorhanden>
- format: <… | nicht vorhanden>
- server: <`befehl` | nicht vorhanden>

## Oberfläche
- Gibt es eine: <ja | nein>
- Start: <…>
- Wegwerf-Daten: <Umgebungsvariable der Datendatei | ohne Daten | keine Wegwerf-Möglichkeit> (Umgebungsvariable: steht als `serverTemp.env` in `.codecycle/tool.config.json`, `codecycle server --temp` startet den Server mit einer frischen Wegwerf-Datei, damit Prüfer echte Daten nicht ändern; „ohne Daten“: der Server speichert nichts, steht als `serverTemp: { "ohneDaten": true }`, `--temp` startet ihn ohne Variable)
- Test-Zugang: <Testwerte, keine echten Zugangsdaten>

## Code-Graph
- Anbieter: <code-review-graph | codegraph | keiner> (Konfiguration `.codecycle/tool.config.json`: `graph.provider` = `auto` | `code-review-graph` | `codegraph` | `none`)
- Aktualisierung: <Git-Hooks in .githooks/ | von Hand | –>

## Risikobereiche
- <Bereich>: <Grund> (Pfade: <Muster>, …) (z. B. `- Auth: Anmeldung und Rechte (Pfade: src/auth/**, api/login.ts)`; Muster wie in `.gitignore`: `**` beliebige Ordner, `*` innerhalb eines Namens, ohne `/` in jeder Tiefe. Ohne „(Pfade: …)“ erkennt `codecycle solo check` den Bereich nicht und die Sitzung urteilt selbst.)

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
notizen: aus   # Beobachtungen mit /codecycle:notiz bzw. codecycle notiz in notizen.md der Aufgabe
assume-and-continue: an
graph: an   # wenn vorhanden
cache-ttl-builder: 5m
```
