# codecycle-doku

Doku-Baukasten für Claude Code: feste Orte und Arten für die Doku eines Projekts, Festhalten von Ideen, Bugs und To-dos mit erzeugter Übersicht, dazu ein Prüfer und ein Hook, der Verstöße nach jedem Schreiben meldet.

**Inhalt:** [Voraussetzungen](#voraussetzungen) · [Installation](#installation) · [Einrichten](#einrichten) · [Arten und Orte](#arten-und-orte) · [Festhalten](#festhalten) · [Andocken](#andocken) · [Probe-Fassungen](#probe-fassungen) · [Architektur](#architektur) · [Prüfer](#prüfer) · [Anpassen](#anpassen) · [Privater Ordner](#privater-ordner) · [Status-Seite](#status-seite) · [Hooks](#hooks) · [Starter](#starter) · [Abschalten und entfernen](#abschalten-und-entfernen) · [Lizenz](#lizenz)

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

Bausteine der Grundausstattung: README, `CLAUDE.md`, Changelog, Schreibregeln, Festhalten, Chronik, Entscheidungen, in Projekten mit Code dazu Architektur. Dazu wählbar: Wegweiser, Berichte, Prompts, Mermaid-Diagramm in der Übersicht.

Ablage der Arbeits-Doku (Festhalten-Orte, Chronik, Entscheidungen, Berichte, Prompts): **teilen** (versioniert) oder **lokal** (Einträge in `.gitignore`). Persönliche Dateien (`CLAUDE.local.md`, `.claude/settings.local.json`) kommen im leeren Projekt und bei Ablage „lokal“ in `.gitignore`, der private Ordner `.codecycle-doku/` bei jeder Einrichtung.

Was die Einrichtung schreibt:

| Datei | Inhalt |
|---|---|
| `.codecycle-doku/erkundung.md` | Bericht des Erkunders, den ein erneuter Aufruf zum Vergleich mitgibt |
| `.claude/doku.json` | Doku-Beschreibung: Version der erzeugten Dateien, Bausteine, Ablage, Orte, Zuordnung von Pfaden zu Arten, Festhalten-Orte, Changelog mit Schema; nur Orte, die es gibt, die angelegt werden oder die du nennst; dazu deine Anpassungen (siehe [Anpassen](#anpassen)) |
| `.claude/rules/codecycle-doku.md` | Karte „was wohin“, lädt in jeder Sitzung; verlangt, vor einem neuen Eintrag die Übersicht des Ordners zu lesen |
| `.claude/rules/codecycle-doku-schreiben.md` | Arten und Schreibregeln; lädt nur beim Arbeiten an Markdown |
| eine Zeile `/.codecycle-doku/` in `.gitignore` | der private Ordner wird nie versioniert |
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

## Andocken

Hat ein Projekt schon eine Sammlung mit eigenem Schema (etwa Ideen mit eigenen Feldern und Statuswerten, eigener Übersicht), dockt die Einrichtung sie an, statt sie umzuschichten. Das Schema steht in `.claude/doku.json`:

```json
"schemata": { "idee": {
  "pflicht": ["titel", "status", "datum"],
  "status": { "offen": "offen", "in-arbeit": "offen", "gebaut": "erledigt" },
  "abschluss": { "umgesetzt": { "status": "gebaut" } },
  "abschnitte": [],
  "uebersicht": "eigen"
} }
```

| Schlüssel | Bedeutung |
|---|---|
| `pflicht` | Felder, die jeder Eintrag hat; ersetzt die Pflichtfelder des Plugins ganz. Übrige Felder prüft der Prüfer nur, wenn sie gesetzt sind |
| `status` | je eigener Wert `offen` oder `erledigt`; andere Werte sind ungültig |
| `abschluss` | je Ergebnis des Plugins die Felder, die ein Abschluss setzt; fehlt er, schließt niemand außer dir den Eintrag ab |
| `abschnitte` | Abschnitte eines Eintrags, leer erlaubt |
| `uebersicht` | `eigen`: die `README.md` des Ordners bleibt unberührt; `plugin`: erzeugte Übersicht |

Die Anleitung kommt dann nicht in den Ordner, sondern als Regeldatei `.claude/rules/codecycle-doku-<art>.md` mit `paths` auf den Ordner: Claude lädt sie beim Arbeiten dort, der Ordner mit Einträgen und Übersicht bleibt unberührt (auch für eigene Werkzeuge des Projekts). Die Karte nennt sie je Ort. Sie nennt die Felder und Werte des Projekts, damit der Ordner auch ohne Plugin verständlich ist. **Überführen** ins Schema des Plugins ist ein Angebot: Der Schritt `ueberfuehren:<art>` schreibt alle Einträge mit umgestelltem Kopf (Text unverändert) als Probe nach `.codecycle-doku/probe/<ordner>/`, dazu `UEBERFUEHREN.md` mit Zählung und fünf Beispielen (Kopf alt und neu); der echte Ordner bleibt, bis du übernimmst.

## Probe-Fassungen

```
/codecycle-doku:probe [readme|claude-md|architektur]
```

- Der Agent `verfasser` (liest nur) schreibt eine vollständige Fassung von `README.md`, `CLAUDE.md` oder `ARCHITECTURE.md` (im Monorepo auch einer Paket-README) und eine Änderungsliste mit dem Warum je Punkt. README: Inhalt gegen den Code geprüft, Fehlendes ergänzt, Ton und Aufbau bleiben. `CLAUDE.md`: nur kürzen, dateibezogene Regeln nach `.claude/rules/` verschieben, Verweis auf die Karte sicherstellen.
- Die Probe liegt unter `.codecycle-doku/probe/<pfad>`, die Änderungsliste daneben als `<name>.aenderungen.md`; die echte Datei bleibt unverändert.
- Übernommen wird mit dem Schritt `uebernehmen:<pfad>`: die alte Fassung kommt nach `.codecycle-doku/sicherung/<pfad>` (gibt es dort schon eine, mit Zeitstempel im Namen), dann die Probe an ihren Ort. Gehören Dateien zusammen (Zeile `zusammen:` in der Änderungsliste), nur gemeinsam.
- Abgelehnt wird mit dem Schritt `verwerfen:<pfad>`: Probe und Änderungsliste sind weg, die echte Datei bleibt. Bei einer veralteten Plugin-Datei bleibt dann der Update-Punkt.
- `.claude/doku.json` kommt nie als Probe. Ein verschriebener Blockkopf oder ein `<<<ENDE>>>` ohne Block bricht `--probe` ab, ohne etwas zu schreiben.
- Nach einem Update des Plugins kommen veraltete Karte, Schreibregeln und Anleitungen ebenso als Probe, mit einer Änderungsliste aus dem Skript. Erst wenn keine mehr veraltet ist, setzt die Übernahme `version` in `.claude/doku.json` neu; Anpassungen dort bleiben.
- Das Plugin führt keine Git-Befehle aus, die etwas ändern; committen tust du.

## Architektur

In Projekten mit Code gehört `ARCHITECTURE.md` im Projektordner zur Grundausstattung. Code erkennt die Einrichtung an einem Manifest in der Wurzel (etwa `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `*.csproj`) oder an Quelldateien gängiger Sprachen in den obersten zwei Ebenen; im leeren Projekt fragt sie.

- Abschnitte: Überblick, Einstiegspunkte, Codemap, Grenzen und Invarianten, Querschnitt, Entscheidungen (nur Verweise).
- Leeres Projekt: Gerüst mit leeren Abschnitten. Projekt mit Code: die Erstfassung schreibt der Verfasser aus dem Code, sie kommt als Probe. Eine vorhandene `ARCHITECTURE.md` bleibt, wie sie ist.
- Gegen Veralten: Pfade mit `/` in Backticks im Abschnitt „Codemap“ müssen existieren (Hinweis, Regel `codemap`); Ordner oberster Ebene, die die Codemap nicht nennt, erscheinen auf der Status-Seite, sobald die Codemap überhaupt einen Pfad nennt; die Karte sagt, die Datei nachzuziehen, wenn sich der Aufbau ändert.

## Prüfer

```
codecycle-doku-pruefer [Datei …] [--root <ordner>]
```

- Ohne Dateien prüft er alle Markdown-Dateien des Projekts (außer `.git`, `node_modules`, `.codecycle-doku/` in jeder Tiefe, `.claude/worktrees/` und Ordnern mit eigener `.git`). Eine unlesbare `.claude/doku.json` meldet er als eine Zeile mit Exit 1. Ausgabe `Datei:Zeile: [Art] Regel «Treffer»`, am Ende die Summe.
- **Scharf (Exit 1), nur was wirklich kaputt ist:** tote Links und Sprungmarken; Links aus der Doku nach `.codecycle-doku/`; Fehler im Kopf eines Eintrags, der neu oder geändert ist.
- **Neu oder geändert:** jede genannte Datei; im vollen Lauf ohne Dateien, was `git status` als geändert oder neu nennt (ohne Git keine). Unveränderter Altbestand bleibt Hinweis, bis er angefasst wird.
- **Hinweise (Exit 0):** alles andere: Textregeln je Art (Herkunft, Datum, Zeitwörter, die veralten, Versionsnummern in Anweisungen, Länge), Kopf-Fehler im Altbestand, fehlende Abschnitte eines Eintrags, Lücken im Inhaltsverzeichnis einer langen README, unbekannte Art, Dateien, die im Wegweiser fehlen (nur direkt in seinem Ordner). `doku-ok` in der Zeile (als `<!-- doku-ok -->`) nimmt einen Hinweis aus, ebenso einen toten Link oder eine fehlende Sprungmarke dieser Zeile; Links nach `.codecycle-doku/` bleiben scharf.
- Ohne `.claude/doku.json` gilt eine Standard-Zuordnung (`CLAUDE.md`, `README.md`, `CHANGELOG.md`, `**/CLAUDE.md`, `.claude/rules/**`).

## Anpassen

Alle Anpassungen eines Projekts stehen in `.claude/doku.json`; Karte, Schreibregeln und Anleitungen je Ordner werden daraus erzeugt (Kopfzeile „Erzeugt aus .claude/doku.json“) und nicht von Hand geändert. Jeder erneute Aufruf der Einrichtung übernimmt die Anpassungen unverändert.

```json
"pruefung": { "aus": ["zeitwort"], "hinweis": ["links"] }
```

- `aus`: diese Regeln melden nichts; `hinweis`: diese Regeln melden nur Hinweise.
- Regelnamen: `herkunft`, `datum`, `zeitwort`, `version`, `laenge-400`, `laenge-800`, `laenge-1000`, `max-zeilen`, `links`, `inhaltsverzeichnis`, `felder`, `abschnitte`, `wegweiser`, `codemap`, `art`.
- `version` nennt den Stand des Plugins, auf dem die erzeugten Dateien sind; sie setzt die Einrichtung.

## Privater Ordner

`.codecycle-doku/` im Projekt enthält nur Erzeugtes und Vorläufiges des Plugins und wird nie versioniert: die Einrichtung trägt ihn in `.gitignore` ein, und der Ordner hat eine eigene `.gitignore` mit `*`. Angelegt wird er nur, wenn es `.claude/doku.json` gibt. Nichts Versioniertes verlinkt auf ihn; der Prüfer meldet einen solchen Link scharf.

## Status-Seite

`.codecycle-doku/status.html` zeigt auf einen Blick, wie die Doku aufgebaut ist und was wartet; eine Datei ohne Netz und ohne Skripte, `status.json` daneben mit denselben Daten.

| Block | Inhalt |
|---|---|
| A · Auf einen Blick | Bausteine eingerichtet von gewählt, Schlusszeile des letzten vollen Prüferlaufs mit Zeitpunkt, offene Einträge je Art, Anzahl der wartenden Punkte, Versionen „aktiv · eingerichtet mit · im Marketplace“ (letztere laut lokaler Kopie des Marketplace, ohne Netz) |
| B · So ist die Doku aufgebaut | je Baustein Art und Ort mit Zustand: eingerichtet, veraltet, fehlt, angedockt, nicht gewählt |
| D · Wartet auf dich | gebrochene Verweise (Ort aus `.claude/doku.json` fehlt, `CLAUDE.md` ohne Verweis auf die Karte), eine fehlende Erstfassung von `ARCHITECTURE.md` im Projekt mit Code, tote Links des letzten vollen Laufs, Probe-Fassungen, Plugin neuer als die Einrichtung, neuere Version im Marketplace, Ordner ohne Eintrag in der Codemap, Dateien ohne Eintrag im Wegweiser |
| E · Wichtig | höchstens fünf offene Einträge mit `wichtigkeit: wichtig`, mit Link |

Gebaut wird sie nach jedem schreibenden Lauf der Einrichtung, nach jedem vollen Prüferlauf, am Ende jeder Antwort, in der Markdown geschrieben wurde, und auf Befehl: `codecycle-doku-pruefer --status`.

## Hooks

- **Nach jedem Schreiben** (`PostToolUse` für `Write` und `Edit`): prüft nur die geschriebene Datei und meldet die Treffer im selben Zug (höchstens 20, dann „+n weitere“). Liegt die Datei in einem Festhalten-Ordner, erneuert er dessen Übersicht; eine eigene Übersicht (eine `README.md` ohne die Zeile „Erzeugt aus den Köpfen der Einträge“) bleibt unverändert, der Hook meldet dann „eigene Übersicht, nicht erneuert“. Bei Markdown setzt er eine Marke für den Stop-Hook.
- **Am Ende einer Antwort** (`Stop`): baut die Status-Seite nur, wenn die Marke da ist, und löscht sie; sonst tut er nichts.
- **Beim Start einer Sitzung** (`SessionStart`): prüft nur mit Dateizugriffen, ob jeder Ort aus `.claude/doku.json` da ist, ob `CLAUDE.md` auf die Karte verweist, ob Probe-Fassungen warten und ob das Plugin neuer ist als die Einrichtung; dazu die übrigen Punkte aus `status.json`. Wartet etwas, gibt er Claude genau eine Zeile, etwa „codecycle-doku: 2 Punkte warten (Update, Probe)“; sonst nichts. Ist `.claude/doku.json` unlesbar, sagt er das in einer Zeile.
- Ohne `.claude/doku.json` sind alle drei still. Keiner blockiert.

## Starter

Solange das Plugin aktiv ist, liegen zwei Starter auf dem PATH des Bash-Werkzeugs, auch für andere Plugins und Agenten (unter Windows zusätzlich als `.cmd`). Beide brauchen Node; fehlt es, Exit 2 mit Meldung.

| Starter | Wirkung |
|---|---|
| `codecycle-doku-pruefer` | der Prüfer, Argumente, Ausgabe und Exit-Code unverändert; `--status` baut die Status-Seite (Exit 3 ohne `.claude/doku.json`) |
| `codecycle-doku-einrichten` | die Einrichtung; `codecycle-doku-einrichten --nachtragen <idee\|bug\|todo>` legt einen fehlenden Festhalten-Ort ohne Fragen an (Anleitung und Übersicht, mit der vorhandenen `.claude/doku.json` als Ausgangswert; fehlt der Baustein Festhalten, kommt er dazu). Exit 3 ohne `.claude/doku.json`, dann wird nichts geschrieben |

## Abschalten und entfernen

```bash
claude plugin disable codecycle-doku@codecycle
claude plugin uninstall codecycle-doku@codecycle
```

Setzt ein anderes aktives Plugin `codecycle-doku` voraus, lässt Claude Code es nicht abschalten, bis jenes aus ist; Deinstallieren geht mit Warnung, das andere Plugin lädt danach nicht. Die Dateien im Projekt (`.claude/doku.json`, Regeldateien, Festhalten-Ordner) bleiben stehen.

## Lizenz

[MIT](LICENSE).
