# codecycle

Claude-Code-Plugin für einen festen, wiederholbaren Arbeitsablauf: Modelle je Rolle aus einer Tabelle (`models.json`), große Aufgaben in Teilen mit je einem frischen Bauenden, frische Prüfer gegen die Worte des Nutzers, Fortschritt in Dateien im Repo. Ausgelegt auf Genauigkeit statt auf möglichst wenig Limit-Verbrauch. Dazu ein optionaler Mod mit Bautafel und Seitenleiste.

**Inhalt:** [Voraussetzungen](#voraussetzungen) · [Installation](#installation) · [Erste Schritte](#erste-schritte) · [Befehle](#befehle) · [Modelle](#modelle) · [Schalter](#schalter) · [Mod (optional)](#mod-optional) · [Aktualisieren](#aktualisieren) · [Abschalten und entfernen](#abschalten-und-entfernen) · [Lizenz und Beiträge](#lizenz-und-beiträge)

## Voraussetzungen

- Claude Code (Terminal oder Desktop-App; die Seitenleiste der Desktop-App zeigt ihr volles Aussehen ab 2.1.299, ältere Fassungen eine schlichtere), **Git**, **Node.js ab Version 24** (das Projekt-Werkzeug ist TypeScript und läuft direkt mit Node; Claude Code bringt kein Node mit; kein `npm install` nötig).
- Das Plugin **codecycle-doku** (Doku-Baukasten: Orte und Arten der Doku, Festhalten von Ideen, Bugs und To-dos, Prüfer und Hook). codecycle setzt es voraus; die Installation von codecycle installiert es mit.
- Python ist **nicht** nötig.
- Optional: ctags (Universal Ctags) für die Outline der Dateien; ohne ctags ist die Outline leer.
- Optional: ein Code-Graph, **entweder** code-review-graph (über uv: `uv tool install code-review-graph`) **oder** CodeGraph (`@colbymchenry/codegraph` über npm). Installiert wird nur nach Rückfrage. Ohne Graph gilt der Rückfall Outline und Suche. Der Anbieter steht in `.codecycle/tool.config.json` (`graph.provider`: `auto`, `code-review-graph`, `codegraph`, `none`; `auto` nimmt den Anbieter, dessen Index im Projekt liegt).
- Für die Prüfung von Oberflächen (Sitzung und Prüfer am Ende): ein Browser-Werkzeug, z. B. in der Desktop-App oder über das Playwright-Plugin. Ohne Browser bleibt die Oberfläche ungeprüft.

## Installation

Im **Terminal** (nicht in einer Claude-Sitzung), nacheinander:

```
claude plugin marketplace add codecycle-plugin/codecycle
claude plugin install codecycle@codecycle
```

Der erste Befehl trägt das Repo als Marktplatz ein (ein Katalog, aus dem Claude Code Plugins installiert); der zweite installiert das Plugin für deinen Benutzer und schaltet es ein, zusammen mit `codecycle-doku`. Danach Claude Code neu starten und prüfen:

```
claude plugin list
```

Erwartet: `codecycle@codecycle` und `codecycle-doku@codecycle`, beide Status `enabled`. Das Plugin ist dann in jeder Sitzung auf dem Gerät geladen; in Projekten ohne codecycle zeigt der Mod keine Bautafel, sondern schlägt beim Start `/codecycle:setup` grau im Eingabefeld vor (Tab übernimmt ihn).

## Erste Schritte

In einer Sitzung im Zielprojekt:

```
/codecycle:setup
/codecycle:new <Beschreibung der Aufgabe>
```

**Ein Weg für jede Aufgabe:**

- **Brainstorming:** Claude klärt im Gespräch, was du willst, eine Frage je Nachricht, mit eigenen Ideen und Kritik. Ist die Aufgabe klar, sagt Claude in einem Satz, was es verstanden hat, und legt los. Startet auch von selbst vor neuer, gestaltender Arbeit (`/codecycle:brainstorming`).
- **Entwurf:** kurz im Chat, mit deinen Worten, Zielen, Grenzen und Erfolgssätzen; du gibst ihn frei.
- **Plan:** schreibt die Sitzung selbst; ein Planprüfer gleicht ihn mit dem Entwurf ab, du gibst ihn frei. Danach schlägt Claude vor, ob es hier weitergeht oder in einer neuen Sitzung (`/clear`, dann `/codecycle:continue`).
- **Bauen und Prüfen:** Kleine und mittlere Aufgaben baut die Sitzung selbst. Große bekommen einen Plan in Teilen; je Teil baut nacheinander ein frischer Bauender auf eigenem Branch im selben Ordner, jedes Teilende ist ein guter Punkt zum Aufhören. Geht das Limit mitten im Teil aus, baut `/codecycle:continue` dort weiter. Am Ende prüft ein frischer Prüfer das Ergebnis gegen deine Worte und probiert es aus, eine Runde Nachbesserung, dann die Merge-Frage; ab zwei berührten Risikobereichen prüft ein zweiter Prüfer nur die Sicherheit. Vor schwer Rückgängigem (Datenmigration, Löschen, Veröffentlichen, Zahlungen) hält Claude an und fragt.
- Ältere angefangene Aufgaben ohne `weg: solo` in `STATE.md` setzt `/codecycle:continue` nicht fort; Branch und Dateien bleiben, `/codecycle:new` beginnt sie neu.

`/codecycle:setup` richtet die Doku mit `/codecycle-doku:einrichten` ein, falls `.claude/doku.json` fehlt, legt `.claude/codecycle.md` an, ruft `codecycle install-tool` (Werkzeug-Kopie `.codecycle/tool/`) und `codecycle hooks install` (`.githooks/`) auf und fragt nach Sprache, Ablage und Schaltern. Danach führt `/codecycle:new` durch den Ablauf. Eine neue Sitzung empfiehlt der Bauleiter erst, wenn die Hauptsitzung groß wird; dann setzt `/codecycle:continue` nach `/clear` fort.
**Gefragt wird nur vorn (Brainstorming, Entwurf, Plan), vor schwer Rückgängigem und beim Wiedereinstieg;** läuft die Umsetzung, wird der Nutzer nicht gestört.
Der Merge in `main` kommt nie automatisch, sondern als Frage beim nächsten `/codecycle:continue` oder `/codecycle:status` („jetzt mergen und die Branches löschen?“, Standard Ja; gelöscht wird nur mit `git branch -d`). Setup fragt außerdem nach dem Hauptbranch (Vorgabe `main`, `master` nur auf Frage umbenennen), nach `.gitignore`-Einträgen (bei Ablage „teilen“ wird `.claude/codecycle.md` committet) und nach einer `.gitattributes` gegen CRLF-Warnungen. Was codecycle selbst anlegt, bleibt unversioniert (`.git/info/exclude`): `.codecycle/`, `.githooks/`, `.claude/settings.local.json`, bei Ablage „lokal“ auch `.claude/codecycle.md`; nie der ganze Ordner `.claude/`, denn die Dateien des Doku-Plugins dort folgen dessen eigener Ablage-Wahl. <!-- doku-ok -->

**Kennzeichnung durch Claude in Commits:** Setup fragt einmal, was in Commits und Pull Requests stehen soll: Urheberzeile und Sitzungslink (Standard von Claude Code; der Link `Claude-Session: …` kommt nur in Cloud- und Remote-Control-Sitzungen und öffnet sich nur für das eigene Konto), nur der Sitzungslink, oder nichts. Die Antwort steht als `attribution` mit `commit`, `pr` und `sessionUrl` in `.claude/settings.json` des Projekts und lässt sich dort jederzeit ändern.

Der Pre-Commit-Hook aus `hooks install` prüft bei jedem Commit im Projekt Lint, Format und die Tests zur Änderung (nicht die ganze Suite) und stoppt den Commit, wenn etwas rot ist; ohne Node wird die Prüfung übersprungen. Die ganze Suite läuft mit `codecycle check --full`. Wer die Hooks nicht möchte, setzt `git config --unset core.hooksPath`; dann laufen keine codecycle-Hooks mehr, auch nicht die, die nach Commit, Checkout und Merge den Code-Graphen aktualisieren. Die Tests im Ordner `tests/` dieses Plugins prüfen nur den Mod selbst und laufen in Projekten nie mit.

Das Werkzeug `codecycle` (Starter `bin/codecycle`) gibt es auch im Terminal: `info`, `selftest`, `tasks`, `test [--affected]`, `lint`, `format`, `check [--full]`, `server`, `locate`, `callers`, `hooks install|status`, `install-tool`, `guard`, `effort --record`, `solo check|funde|plan|teil|pruefung`, `update`.

## Befehle

| Befehl | Zweck |
|---|---|
| `/codecycle:setup` | Projekt einrichten: Doku über `/codecycle-doku:einrichten` (falls `.claude/doku.json` fehlt), `.claude/codecycle.md`, Werkzeug-Kopie (`install-tool`), Hooks (`hooks install`), Graph-Anbieter, Ablage |
| `/codecycle:new <Beschreibung>` | neue Aufgabe: Brainstorming, Entwurf, Plan mit Planprüfer, dann baut die Sitzung selbst (große Aufgaben je Teil ein frischer Bauender), ein frischer Prüfer (Opus) prüft gegen deine Worte und probiert aus, berührte Risikobereiche zusätzlich auf Sicherheit (ab zwei ein zweiter Prüfer nur dafür), eine Runde Nachbesserung, Merge-Frage; ohne grünen `codecycle solo check` kein Prüfer, ohne Prüfberichte und Status je Fund kein Merge |
| `/codecycle:continue [Ordner]` | Aufgabe fortsetzen, auch mitten in einem Teil; Git ist die Wahrheit, fragt zuerst nach ausstehenden Merges, schlägt die zuletzt bearbeitete vor |
| `/codecycle:status` | Übersicht aller Aufgaben mit Git-Abgleich; fragt zuerst nach ausstehenden Merges |
| `/codecycle:brainstorming [Stichwort]` | Brainstorming ohne Code: klärt im Gespräch, was du willst, und endet in einem freigegebenen Entwurf; startet auch von selbst vor neuer, gestaltender Arbeit |
| `/codecycle:check [--full]` | Lint, Format und Tests über das Projekt-Werkzeug |
| `/codecycle:update` | Neueste Version in einem Durchgang: Plugin aktualisieren, Werkzeug-Kopie, Konfiguration, Hooks und guard-Grundlage aus der neuen Version, danach Plugin neu laden; die Bautafel weist auf eine veraltete Kopie hin |

Alle Befehle außer `/codecycle:brainstorming` starten nur auf Aufruf des Nutzers (`disable-model-invocation: true`); das Brainstorming darf Claude auch selbst starten.

## Modelle

Die Tabelle `models.json` legt das Modell je Rolle fest; Ablauf und Agenten-Budget hängen nur von der Größe der Aufgabe ab (klein / mittel / groß).

- Opus für Bauende, Schlussprüfer und Planprüfer
- Sonnet für Einrichter, Werkzeugmeister und den Prüfer je Teil (Eintrag `part-reviewer`, wirkt nur mit Schalter `part-review`)

Mit Mod setzt der Mod das Modell beim Start eines Agenten, ohne Mod gibt die Sitzung es aus `models.json` mit.

## Schalter

Zusatzteile sind einzeln schaltbar, im Abschnitt „Schalter“ von `.claude/codecycle.md`. Was „aus“ bedeutet, steht im Workflow-Skill.

| Schalter | Standard | Wirkung |
|---|---|---|
| `assume-and-continue` | an | bei Unklarheit mit markierter Annahme weiterarbeiten (Eintrag unter „Offene Fragen“ in `STATE.md`), statt den Nutzer zu stören; Anhalten nur bei schwer Rückgängigem oder echtem Blocker |
| `conflict-check` | an | Warnung bei Überschneidung offener Aufgaben |
| `helper-scripts` | an | Wegwerf-Skripte der Agenten erlaubt |
| `fence` | aus | technischer Zaun über den Mod |
| `auto-resume` | aus | nach Limit-Reset automatisch fortsetzen |
| `agent-progress` | aus | Agenten melden Schritte an die Agenten-Leiste (`codecycle_step`) |
| `part-review` | an | Prüfer je Teil großer Aufgaben: als groß markierte Teile prüft nach dem Bau ein frischer Prüfer je Teil (Modell `part-reviewer`), eine Fixrunde, Nachprüfung; erst dann gilt der Teil als fertig |
| `graph` | an, wenn vorhanden | Code-Graph nutzen (sonst Outline/Suche); Anbieter über `graph.provider` in `.codecycle/tool.config.json` |

## Mod (optional)

Bautafel über dem Eingabefeld (nur in eingerichteten Projekten), Seitenleiste (`/codecycle-panel`). Ohne Mod läuft der Ablauf gleich, nur ohne Bautafel, Limit-Prüfung, Token-Buch und technischen Zaun.

### Was „gew.“ bedeutet

Bautafel, Seitenleiste und Token-Buch (`costs.json` im Aufgabenordner) zeigen den Aufwand in **gewichteten Tokens**: jede Token-Art mal ihrem Faktor, im Verhältnis der API-Listenpreise. So zählt, was ein Lauf kostet, nicht nur wie viel Text er bewegt.

| Token-Art | Faktor |
|---|---|
| Eingabe (neuer Text) | 1 |
| Cache schreiben, Laufzeit 5 Minuten (Agenten) | 1,25 |
| Cache schreiben, Laufzeit 1 Stunde (Hauptsitzung im Abo, Agenten mit `cacheTtl: 1h`) | 2 |
| Cache lesen (bisheriger Verlauf, bei jedem Schritt erneut) | 0,05 bei Sonnet 5.5 und Opus 5.5, sonst 0,1 |
| Ausgabe (was das Modell schreibt) | 5 |

Beispiel: 4,4 Mio Tokens aus dem Cache gelesen, 190 000 geschrieben (davon 110 000 mit 1 Stunde), 76 000 ausgegeben ergeben rund 0,9 Mio gewichtet. Bei Sonnet 5.5 entspricht 1 Mio gewichtet etwa 2 $ Listenpreis. Wie stark ein Abo-Limit die Token-Arten anrechnet, ist nicht dokumentiert; deshalb steht der Anteil am 5-Stunden-Fenster nur als Näherung („Konto ≈“) daneben.

## Aktualisieren

In einer Sitzung genügt:

```
/codecycle:update
```

Der Befehl holt die neueste Version des Plugins samt neu hinzugekommener Abhängigkeiten wie `codecycle-doku`, aktualisiert auch diese, erneuert die Werkzeug-Kopie des Projekts samt Konfiguration und Hooks und lädt das Plugin neu. Die Bautafel zeigt an, wenn die Kopie veraltet ist oder fehlt. Von Hand im Terminal:

```
claude plugin marketplace update codecycle
claude plugin update codecycle@codecycle
claude plugin install codecycle@codecycle
claude plugin update codecycle-doku@codecycle
```

`plugin install` holt Abhängigkeiten nach, die eine neue Version mitbringt; `plugin update` allein installiert sie nicht, und ohne sie lädt codecycle nicht. Bestehende Installationen ohne `codecycle-doku` holen es einmal mit `claude plugin install codecycle-doku@codecycle` nach.

Danach Claude Code neu starten (oder `/reload-plugins`).

## Abschalten und entfernen

```
claude plugin disable codecycle@codecycle
claude plugin uninstall codecycle@codecycle
```

Wieder einschalten: `claude plugin enable codecycle@codecycle`. Ist codecycle abgeschaltet, läuft `codecycle-doku` allein weiter; abschalten lässt es sich erst, wenn codecycle aus ist (`claude plugin disable codecycle-doku@codecycle`, entfernen mit `claude plugin uninstall codecycle-doku@codecycle`). Den Marktplatz-Eintrag entfernt `claude plugin marketplace remove codecycle`. Die Dateien in Projekten (`.claude/codecycle.md`, `.codecycle/`, `.githooks/`, `docs/codecycle/`) bleiben stehen und lassen sich von Hand löschen. Wer `.githooks/` löscht, setzt danach im Projekt die Git-Einstellung zurück: `git config --unset core.hooksPath` (sonst laufen dort keine Git-Hooks mehr, auch keine eigenen).

## Lizenz und Beiträge

MIT, siehe [LICENSE](LICENSE). Rückmeldungen und Pull Requests sind willkommen, Hinweise in [CONTRIBUTING.md](CONTRIBUTING.md). Änderungen je Version: [CHANGELOG.md](CHANGELOG.md).
