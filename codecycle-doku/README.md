# codecycle-doku

Doku-Baukasten für Claude Code: feste Orte und Arten für die Doku eines Projekts, Festhalten von Ideen, Bugs und To-dos mit erzeugter Übersicht, dazu ein Prüfer und ein Hook, der Verstöße nach jedem Schreiben meldet.

**Inhalt:** [Voraussetzungen](#voraussetzungen) · [Installation](#installation) · [Einrichten](#einrichten) · [Arten und Orte](#arten-und-orte) · [Festhalten](#festhalten) · [Prüfer](#prüfer) · [Hook](#hook) · [Starter](#starter) · [Abschalten und entfernen](#abschalten-und-entfernen) · [Lizenz](#lizenz)

## Voraussetzungen

- Claude Code, **Node.js** (die Skripte nutzen nur Module von Node selbst, kein `npm install`).
- Git ist empfohlen: Der Prüfer kennt damit Commit-Kennungen in `erledigt-durch`; ohne Git prüft er nur deren Form.

## Installation

Im Terminal, nachdem der Marktplatz einmal eingetragen ist (`claude plugin marketplace add <owner>/<repo>`, die README in der Wurzel des Marktplatz-Repos nennt den Befehl):

```bash
claude plugin install codecycle-doku@codecycle
```

Ein Plugin, das `codecycle-doku` voraussetzt, installiert es mit; dann reicht dessen Installationsbefehl. Danach Claude Code neu starten; `claude plugin list` zeigt `codecycle-doku@codecycle` mit Status `enabled`.

## Einrichten

In einer Sitzung im Projekt:

```
/codecycle-doku:einrichten
```

- **Projekt mit Doku:** Ein Erkunder (Agent `erkunder`, liest nur) findet die vorhandene Doku, ordnet sie den Bausteinen zu, erkennt das Schema des Changelogs und meldet Unübersichtliches. Danach fragt die Sitzung nach Bausteinen, Ablage, Verschieben (nur einzelne Dateien, keine Ordner) und Überarbeiten, je Datei einzeln. Angelegt, verschoben oder geändert wird nur, was du zugestimmt hast; ein Probelauf zeigt jede Datei, bevor etwas geschrieben wird.
- **Leeres Projekt** (außer `.git`, `.gitignore`, `.gitattributes` und `.claude/settings.local.json` keine Datei; jede andere Datei, auch `README.rst` oder Code, gilt als vorhandene Doku und wird erst erkundet): zwei Fragen (Bausteine, Ablage), dann die Grundausstattung; `git init` nur nach Frage, wenn es kein Repo gibt.
- **Erneuter Aufruf:** zeigt, was fehlt, und bietet es an.

Bausteine der Grundausstattung: README, `CLAUDE.md`, Changelog, Schreibregeln, Festhalten, Chronik, Entscheidungen. Dazu wählbar: Wegweiser, Berichte, Prompts, Mermaid-Diagramm in der Übersicht.

Ablage der Arbeits-Doku (Festhalten-Orte, Chronik, Entscheidungen, Berichte, Prompts): **teilen** (versioniert) oder **lokal** (Einträge in `.gitignore`). Persönliche Dateien (`CLAUDE.local.md`, `.claude/settings.local.json`) kommen immer in `.gitignore`.

Was die Einrichtung schreibt:

| Datei | Inhalt |
|---|---|
| `.claude/doku.json` | Doku-Beschreibung: Bausteine, Ablage, Orte, Zuordnung von Pfaden zu Arten, Festhalten-Orte, Changelog mit Schema |
| `.claude/rules/codecycle-doku.md` | Karte „was wohin“, lädt in jeder Sitzung; verlangt, vor einem neuen Eintrag die Übersicht des Ordners zu lesen |
| `.claude/rules/codecycle-doku-schreiben.md` | Arten und Schreibregeln; lädt nur beim Arbeiten an Markdown |
| eine Zeile in `CLAUDE.md` | Verweis auf die Karte (nur angehängt, nie doppelt) |
| je Festhalten-Ordner `CLAUDE.md` und `README.md` | Anleitung mit Kopf und Abschnitten; erzeugte Übersicht |
| Gerüste | README, Changelog, Chronik, Entscheidungen, Wegweiser, Berichte, Prompts, je nach Bausteinen |

Das Skript lässt sich auch direkt aufrufen: `node skripte/einrichten.mjs --stand` (was eingerichtet ist und was fehlt, als JSON), `--antworten <datei>` mit `--dry-run` (Probelauf), `--nachtragen <art>` (siehe [Starter](#starter)).

## Arten und Orte

Jede Doku-Datei hat eine Art; die Art bestimmt, was hinein darf. Die Zuordnung von Pfaden zu Arten steht in `.claude/doku.json`.

| Art | Darf rein |
|---|---|
| Anweisung (`CLAUDE.md`, `.claude/rules/`) | Regeln, die immer gelten, im Befehlston |
| Nachschlagen (READMEs, Wegweiser) | Ist-Zustand, Fundstellen |
| Entscheidung | Frage, Alternativen, Antwort im Wortlaut, Datum |
| Chronik (Changelog, Verlauf) | wer, wann, was; nur anhängen |
| Idee, Bug, To-do | Einträge zum Festhalten (siehe unten) |
| Bericht | einmaliger Befund, danach eingefroren |
| Prompt | Auftrag für eine Sitzung oder einen Agenten |

Changelog-Schemata: `keep-a-changelog`, `erzeugt` (aus Commits, wird nie angefasst und nicht geprüft) und `eigenes` (mit einer Zeile Beschreibung; geprüft werden nur Links und Länge).

## Festhalten

„Halt das als Bug fest“ legt eine Datei im Bug-Ordner an; ebenso Ideen und To-dos. Standard-Orte: `docs/ideen/`, `docs/bugs/`, `docs/todos/`. Je Ordner sagt die Anleitung `CLAUDE.md`, welche Felder und Abschnitte ein Eintrag hat; die `README.md` des Ordners ist die erzeugte Übersicht.

Kopf eines Eintrags:

| Feld | Werte |
|---|---|
| `titel` | kurzer Titel |
| `datum` | `JJJJ-MM-TT` |
| `bezug` | Liste verwandter Einträge (Dateinamen ohne `.md` aus einem der Festhalten-Ordner), etwa `[export-als-csv]` |
| `status` | `offen`, `erledigt` |
| `wichtigkeit` | `wichtig`, `normal` |
| `ergebnis` | nur Idee und Bug, leer solange offen. Idee: `umgesetzt`, `verworfen`, `ersetzt`. Bug: `behoben`, `kein Fehler`, `wird nicht behoben` |
| `erledigt-durch` | nur Idee und Bug, leer solange offen: relativer Link auf eine Datei im Projekt (optional mit Sprungmarke), Commit-Kennung (7 bis 40 Hex-Zeichen) oder `text` (dann Pflicht: Abschnitt `## Ergebnis`). `ersetzt` verlangt einen Link auf eine andere Idee |

Abschnitte: Idee „Möglichkeiten“, „Grund dafür“, „Grund dagegen“; Bug „So stellt man ihn nach“, „Erwartet“, „Tatsächlich“; To-do „Was“, „Warum“, „Fertig, wenn“. Ein To-do hat kein `ergebnis`.

Übersicht: offen vor erledigt, wichtig vor normal, neueste zuerst; darunter Gruppen verknüpfter Einträge (über `bezug`), als Mermaid-Diagramm nur mit dem Baustein `mermaid`. Erneuern von Hand: `node skripte/uebersicht.mjs`, prüfen ohne zu schreiben: `--check`.

## Prüfer

```
codecycle-doku-pruefer [Datei …] [--root <ordner>]
```

- Ohne Dateien prüft er alle Markdown-Dateien des Projekts (außer `.git` und `node_modules`). Ausgabe `Datei:Zeile: [Art] Regel «Treffer»`, am Ende die Summe.
- **Scharf (Exit 1):** Fehler in den Feldern der Einträge, tote Links und Sprungmarken, Lücken im Inhaltsverzeichnis einer langen README.
- **Hinweise (Exit 0):** Textregeln je Art (Herkunft, Datum, Zeitwörter, die veralten, Versionsnummern in Anweisungen, Länge) und fehlende Abschnitte eines Eintrags. `doku-ok` in der Zeile (als `<!-- doku-ok -->`) nimmt einen Hinweis aus.
- Ohne `.claude/doku.json` gilt eine Standard-Zuordnung (`CLAUDE.md`, `README.md`, `CHANGELOG.md`, `**/CLAUDE.md`, `.claude/rules/**`).

## Hook

Nach jedem `Write` und `Edit` prüft der Hook nur die geschriebene Datei und meldet die Treffer im selben Zug (höchstens 20, dann „+n weitere“). Liegt die Datei in einem Festhalten-Ordner, erneuert er dessen Übersicht. Ohne `.claude/doku.json` bleibt er still. Er blockiert nie.

## Starter

Solange das Plugin aktiv ist, liegen zwei Starter auf dem PATH des Bash-Werkzeugs, auch für andere Plugins und Agenten (unter Windows zusätzlich als `.cmd`). Beide brauchen Node; fehlt es, Exit 2 mit Meldung.

| Starter | Wirkung |
|---|---|
| `codecycle-doku-pruefer` | der Prüfer, Argumente, Ausgabe und Exit-Code unverändert |
| `codecycle-doku-einrichten` | die Einrichtung; `codecycle-doku-einrichten --nachtragen <idee\|bug\|todo>` legt einen fehlenden Festhalten-Ort ohne Fragen an (Anleitung und Übersicht, mit der vorhandenen `.claude/doku.json` als Ausgangswert; fehlt der Baustein Festhalten, kommt er dazu). Exit 3 ohne `.claude/doku.json`, dann wird nichts geschrieben |

## Abschalten und entfernen

```bash
claude plugin disable codecycle-doku@codecycle
claude plugin uninstall codecycle-doku@codecycle
```

Setzt ein anderes aktives Plugin `codecycle-doku` voraus, lässt Claude Code es nicht abschalten, bis jenes aus ist; Deinstallieren geht mit Warnung, das andere Plugin lädt danach nicht. Die Dateien im Projekt (`.claude/doku.json`, Regeldateien, Festhalten-Ordner) bleiben stehen.

## Lizenz

[MIT](LICENSE).
