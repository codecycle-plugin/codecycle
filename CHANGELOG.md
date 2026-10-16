# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Plugin und Projekt-Werkzeug haben getrennte Versionen („Plugin x / Werkzeug y“).

## [0.15.7 / Werkzeug 0.4.10] – 2026-10-16

### Geändert

- README: Hinweis, dass `/codecycle:setup` die Urheberzeilen von Claude in Commits und Pull Requests abschaltet, und wie man sie behält.

## [0.15.6 / Werkzeug 0.4.10] – 2026-10-16

### Geändert

- README: beim Entfernen der Hinweis, nach dem Löschen von `.githooks/` die Git-Einstellung `core.hooksPath` zurückzusetzen.
- README: was der Pre-Commit-Hook bei jedem Commit prüft, wie man die Hooks abschaltet, und dass die Mod-Tests in `tests/` in Projekten nie mitlaufen.
- CONTRIBUTING: was `validate` und `test` prüfen, wie man das Plugin aus dem Ordner lädt, und ein Abschnitt „Aufbau“ mit allen Ordnern.

## [0.15.5 / Werkzeug 0.4.10] – 2026-10-16

### Geändert

- README: Beschreibung korrigiert (ausgelegt auf Genauigkeit statt auf möglichst wenig Limit-Verbrauch, Rollen nach den Merkmalen der Aufgabe, keine Statuszeile mehr).

## [0.15.4 / Werkzeug 0.4.10] – 2026-10-15

### Geändert

- **Seitenleiste in der Desktop-App** (ab Claude Code 2.1.299): ruhigeres Aussehen mit mehr Abstand, einklappbaren Abschnitten mit fettem Titel, eingerücktem Inhalt, grauen Zustands-Etiketten der Pakete, dünnen Balken, getönten Hinweisen und Blockern, Branch und Quelle als Pfad in Festbreitenschrift; Kopfzeile lesbar („Feature · groß · in Arbeit“). Ältere Versionen von Claude Code bekommen das bisherige Aussehen.
- **Abschluss einer Aufgabe:** Schritt 7 endet mit einer sichtbaren Merge-Frage (Standard Ja) ganz unten, danach die offenen Fragen mit Erklärung und Empfehlung. Gemergt wird weiter nur auf ein ausdrückliches Ja.
- **Schlankeres Rollen-Set:** Bei genau einem Paket mit Risiko oder Schnittstelle prüft eine Abschlussprüfung mit Sicherheitsprüfliste statt Prüfer plus Abnahme; ein eigener Sicherheitsprüfer läuft nur bei `unumkehrbar` oder wenn der Prüfer ein Risiko meldet. Neues Merkmal `dokuImPaket`: schreibt ein Handwerker die Doku vollständig im Paket, entfällt der Doku-Pfleger. Der Test-Autor hat eine Obergrenze für Testzeilen.
- `/codecycle:continue`: Freitext hinter dem Befehl gilt als Zusatzauftrag, nicht als Aufgabenordner.
- Token-Buch: Agenten ohne codecycle-Rolle stehen in einer eigenen Zeile `fremd`.

### Hinzugefügt

- `codecycle server --temp [--same]`: startet den Server mit einer frischen Wegwerf-Datei (Feld `serverTemp` in `.codecycle/tool.config.json`); der Browser-Prüfer startet und beendet den Server damit selbst.

### Behoben

- Testzählung: Tests mit `>` im Namen fehlten, `guard` meldete deshalb fälschlich weniger Tests.
- `codecycle tasks` meldet lange stille Agenten ohne Urteil als „abgebrochen?“; Neustarts nach Abbruch zählen als Nachlauf.
- Offene Fragen und Blocker aus der `STATE.md`: Hat ein Abschnitt Listenpunkte, zählen nur diese (der Erklärsatz der Vorlage erschien vorher als offene Frage).

## [0.14.0 / Werkzeug 0.4.5] – 2026-10-14 – Erste öffentliche Version

### Hinzugefügt

- **Befehle** (starten nur auf Aufruf): `/codecycle:setup` (Projekt einrichten), `/codecycle:new` (neue Aufgabe), `/codecycle:continue` (Aufgabe fortsetzen, Git ist die Wahrheit), `/codecycle:status` (Übersicht mit Git-Abgleich), `/codecycle:ideas` (Brainstorming ohne Code), `/codecycle:check` (Lint, Format, Tests), `/codecycle:update` (Plugin, Werkzeug-Kopie, Konfiguration und Hooks in einem Durchgang aktualisieren).
- **Ablauf in Schritten** 0 bis 7: Klären, Auftrag, Plan zur Freigabe, Umsetzen in Paket-Worktrees, Prüfen, Abnahme, Abschluss. Fortschritt steht in Dateien im Repo (`docs/codecycle/<Aufgabe>/`: `TASK.md`, `PLAN.md`, `STATE.md`, Quittungen, Berichte), nicht im Gesprächsverlauf. Merge in den Hauptbranch nur auf Rückfrage.
- **17 Rollen-Agenten** (`codecycle:<rolle>`): Einrichter, Gutachter, Architekt, Bereichs-Architekt, Plan-Prüfer, Test-Autor, Handwerker (Logik, Routine), Fehlersucher, Prüfer, Sicherheitsprüfer, Browser-Prüfer, Widerleger, Abnahme, Paketleiter, Doku-Pfleger, Werkzeugmeister. Das Rollen-Set richtet sich nach Merkmalen der Aufgabe (Größe, Risiko, Art).
- **Profile** `sparsam`, `grosszuegig`, `extrem`: legen nur die Modelle je Rolle fest (`profiles.json`); Aufwand und Prüftiefe folgen der Größe der Aufgabe.
- **Schalter** in `.claude/codecycle.md` für Zusatzteile (Kontextpaket, Test-Autor, halbblinde Prüfung, Sicherheitsprüfer, Widerleger, Zaun, Paketleiter, Lese-Budget, Plan als HTML, Fortsetzen nach Limit-Reset u. a.); Standardwerte siehe README.
- **Projekt-Werkzeug** `codecycle` (Node.js ab 24, TypeScript läuft direkt, kein `npm install`): `info`, `selftest`, `tasks`, `test [--affected]`, `lint`, `format`, `check`, `server`, `locate`, `callers`, `tests-for`, `impact`, `guard`, `rework`, `package-info`, `plan-html`, `hooks install|status`, `install-tool`, `update`. Eine Kopie liegt im Projekt unter `.codecycle/tool/`; Git-Hooks (`.githooks/`) lassen vor dem Commit Lint, Format und die betroffenen Tests laufen. Optional: Code-Graph (code-review-graph oder CodeGraph) und ctags für Fundstellen; ohne beides greifen Outline und Suche.
- **Mod** (optional, braucht Claude Code mit Mod-Unterstützung, getestet mit 2.1.299): Bautafel über dem Eingabefeld, Statuszeile, Seitenleiste (`/codecycle-panel`) mit Agenten-Leiste und Kosten pro Rolle, `/profile`, Token-Buch je Aufgabe, Limit-Messung pro Rolle und Agent, technischer Zaun (Schalter `fence`), Sperre für `--no-verify` und das Umbiegen der Git-Hooks, Hinweis auf veraltete Werkzeug-Kopie. Erscheint im Terminal und in der Desktop-App.
