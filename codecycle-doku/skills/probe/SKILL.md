---
description: "Probe-Fassung von README, CLAUDE.md oder ARCHITECTURE.md: ein Agent schreibt die Fassung mit Änderungsliste, sie liegt privat in .codecycle-doku/probe/, übernommen wird nur nach Zustimmung, mit Sicherung der alten Fassung."
argument-hint: "[readme|claude-md|architektur] [pfad]"
---

# /codecycle-doku:probe

## Zweck
Eine bessere Fassung einer Doku-Datei vorschlagen, ohne die echte Datei anzufassen. Der Agent schreibt, das Skript legt ab und übernimmt; du schreibst keine Doku-Datei selbst (kein Write, kein Edit).

## Skript
- Skript: `${CLAUDE_PLUGIN_ROOT}/skripte/einrichten.mjs`, Agent: `codecycle-doku:verfasser`.
- `node "<Skript>" --root "<Projekt>" --probe`: liest die Blöcke des Verfassers von stdin und schreibt sie nach `.codecycle-doku/probe/<pfad>`, die Änderungsliste nach `.codecycle-doku/probe/<pfad ohne .md>.aenderungen.md`. Exit 3 ohne `.claude/doku.json`.
- `node "<Skript>" --root "<Projekt>" --antworten -` mit `{ "schritte": ["uebernehmen:<pfad>"] }`: sichert die alte Fassung nach `.codecycle-doku/sicherung/`, setzt die Probe an ihren Ort und entfernt Probe und Änderungsliste. Nennt die Änderungsliste in der ersten Zeile `zusammen:`, gehören alle genannten Pfade in denselben Aufruf.
- Mit `{ "schritte": ["verwerfen:<pfad>"] }`: entfernt Probe und Änderungsliste; die echte Datei bleibt.

## Ablauf
1. Ziel aus dem Argument; ohne Argument fragst du, welches der drei. Pfad: `README.md`, `CLAUDE.md` oder `ARCHITECTURE.md` in der Projektwurzel, im Monorepo auf Wunsch die README eines Pakets.
2. Fehlt `.claude/doku.json`, sag, dass zuerst `/codecycle-doku:einrichten` läuft, und ende.
3. Starte den Verfasser. Startnachricht: Ziel, Projektwurzel, Pfad; liegt `.codecycle-doku/erkundung.md` vor, deren Abschnitt zur Projektart.
4. Gib seine Antwort unverändert an `--probe` (Bash mit Heredoc `<<'BLOECKE'` … `BLOECKE`, PowerShell mit Pipe).
5. Zeige die Änderungsliste kurz im Chat und nenne den Pfad der Probe. Stelle die Frage „Übernehmen?“.
6. „a“: übernehmen (alle Pfade aus `zusammen:` im selben Aufruf), dann die Ausgabe des Skripts nennen. „b“: dem Verfasser per Nachricht die genannten Punkte geben, neue Fassung über `--probe`, erneut fragen. „c“: verwerfen (`{ "schritte": ["verwerfen:<pfad>"] }`, alle Pfade aus `zusammen:` im selben Aufruf); Probe und Änderungsliste sind weg, die echte Datei bleibt.
7. Ob committet wird, entscheidet der Nutzer; frage einmal.

## Frage
**Übernehmen?**
> Die Probe liegt in `<Pfad der Probe>`, die Änderungen stehen oben. Übernehmen?
> a) Empfehlung: ganz übernehmen; die alte Fassung kommt in die Sicherung.
> b) Dagegen spricht: Nicht jede Änderung passt; dann nenne die Punkte, die bleiben sollen, ich lasse die Fassung nur mit ihnen neu schreiben.
> c) nicht übernehmen; die echte Datei bleibt, wie sie ist.
