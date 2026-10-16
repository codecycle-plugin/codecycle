# codecycle

Claude-Code-Plugin für einen festen, wiederholbaren Arbeitsablauf: Modellwahl nach Abo-Profil (sparsam, großzügig, extrem), Rollen nach den Merkmalen der Aufgabe, Fortschritt in Dateien im Repo. Ausgelegt auf Genauigkeit statt auf möglichst wenig Limit-Verbrauch. Dazu ein optionaler Mod mit Bautafel und Seitenleiste.

## Voraussetzungen

- Claude Code (Terminal oder Desktop-App; gebaut und getestet mit 2.1.299), **Git**, **Node.js ab Version 24** (das Projekt-Werkzeug ist TypeScript und läuft direkt mit Node; Claude Code bringt kein Node mit; kein `npm install` nötig).
- Python ist **nicht** nötig.
- Optional: ctags (Universal Ctags) für die Outline der Dateien; ohne ctags ist die Outline leer.
- Optional: ein Code-Graph, **entweder** code-review-graph (über uv: `uv tool install code-review-graph`) **oder** CodeGraph (`@colbymchenry/codegraph` über npm). Installiert wird nur nach Rückfrage. Ohne Graph gilt der Rückfall Outline und Suche. Der Anbieter steht in `.codecycle/tool.config.json` (`graph.provider`: `auto`, `code-review-graph`, `codegraph`, `none`; `auto` nimmt den Anbieter, dessen Index im Projekt liegt).
- Für den Browser-Prüfer (Agent `browser-reviewer`; klickt sich durch die Oberfläche, prüft nur, ändert keinen Code): ein Browser-Werkzeug, z. B. in der Desktop-App oder über das Playwright-Plugin. Ohne Browser entfällt der Browser-Prüfer.

## Installation

Im **Terminal** (nicht in einer Claude-Sitzung), nacheinander:

```
claude plugin marketplace add codecycle-plugin/codecycle
claude plugin install codecycle@codecycle
```

Der erste Befehl trägt das Repo als Marktplatz ein (ein Katalog, aus dem Claude Code Plugins installiert); der zweite installiert das Plugin für deinen Benutzer und schaltet es ein. Danach Claude Code neu starten und prüfen:

```
claude plugin list
```

Erwartet: `codecycle@codecycle`, Status `enabled`. Das Plugin ist dann in jeder Sitzung auf dem Gerät geladen; in Projekten ohne codecycle zeigt die Bautafel „Projekt noch nicht eingerichtet: /codecycle:setup“.

## Erste Schritte

In einer Sitzung im Zielprojekt:

```
/codecycle:setup
/codecycle:new <Beschreibung der Aufgabe>
```

`/codecycle:setup` legt `.claude/codecycle.md` an, ruft `codecycle install-tool` (Werkzeug-Kopie `.codecycle/tool/`) und `codecycle hooks install` (`.githooks/`) auf und fragt nach Sprache, Ablage, Profil und Schaltern. Danach führt `/codecycle:new` durch den Ablauf; nach jeder Freigabe setzt `/codecycle:continue` in einer neuen Sitzung fort. **Gefragt wird nur vorn (Klären, Auftrag, Plan) und beim Wiedereinstieg;** läuft die Umsetzung, wird der Nutzer nicht gestört. Der Merge in `main` kommt nie automatisch, sondern als Frage beim nächsten `/codecycle:continue` oder `/codecycle:status` („jetzt mergen und die Branches löschen?“, Standard Ja; gelöscht wird nur mit `git branch -d`). Setup fragt außerdem nach dem Hauptbranch (Vorgabe `main`, `master` nur auf Frage umbenennen), nach `.gitignore`-Einträgen (bei Ablage „teilen“ wird `.claude/codecycle.md` committet) und nach einer `.gitattributes` gegen CRLF-Warnungen.

Das Werkzeug `codecycle` (Starter `bin/codecycle`) gibt es auch im Terminal: `info`, `selftest`, `tasks`, `test [--affected]`, `lint`, `format`, `check [--full]`, `server`, `locate`, `callers`, `tests-for`, `impact`, `hooks install|status`, `install-tool`, `guard`, `rework`, `package-info`, `plan-html`, `update`.

## Befehle

| Befehl | Zweck |
|---|---|
| `/codecycle:setup` | Projekt einrichten: `.claude/codecycle.md`, Doku-Aufbau, Werkzeug-Kopie (`install-tool`), Hooks (`hooks install`), Graph-Anbieter, Ablage, Profil |
| `/codecycle:new <Beschreibung>` | neue Aufgabe: Klären, Planen, Umsetzen, Prüfen, Abnahme, Abschluss |
| `/codecycle:continue [Ordner]` | Aufgabe fortsetzen; Git ist die Wahrheit, fragt zuerst nach ausstehenden Merges, schlägt die zuletzt bearbeitete vor |
| `/codecycle:status` | Übersicht aller Aufgaben mit Git-Abgleich; fragt zuerst nach ausstehenden Merges |
| `/codecycle:ideas [Stichwort]` | Brainstorming ohne Code, Ergebnis ist ein Auftrags-Entwurf |
| `/codecycle:check [--full]` | Lint, Format und Tests über das Projekt-Werkzeug |
| `/codecycle:update` | Neueste Version in einem Durchgang: Plugin aktualisieren, Werkzeug-Kopie, Konfiguration, Hooks und guard-Grundlage aus der neuen Version, danach Plugin neu laden; die Bautafel weist auf eine veraltete Kopie hin |

Alle sieben Befehle starten nur auf Aufruf des Nutzers (`disable-model-invocation: true`). Das automatische Brainstorming (`ideas-auto`) läuft über den Bauleiter in `/codecycle:new`.

## Profile

Das Profil ändert nur die Modelle (Tabelle in `profiles.json`, Schlüssel `sparsam`, `grosszuegig`, `extrem`); Ablauf und Agenten-Budget hängen nur von der Größe der Aufgabe ab (klein / mittel / groß).

- **sparsam:** überwiegend Sonnet, Opus für Architekt und Bereichs-Architekt, Haiku für den Gutachter
- **großzügig:** Opus auch für Fehlersucher, Logik-Handwerker, Prüfer und Abnahme
- **extrem:** Fable für Architekt und Abnahme, Opus für Plan-Prüfer und Test-Autor

Mit Mod kommt das Profil aus dem Mod-Speicher (`/profile`), ohne Mod aus `~/.claude/codecycle/profile.json` im Format `{ "profil": "sparsam" }`.

## Schalter

Zusatzteile sind einzeln schaltbar, im Abschnitt „Schalter“ von `.claude/codecycle.md`. Was „aus“ bedeutet, steht im Workflow-Skill.

| Schalter | Standard | Wirkung |
|---|---|---|
| `context-package` | an | Kontextpaket mitgeben (sonst nur Fundstellen-Liste) |
| `sections` | an | Abschnitte statt ganzer Dateien |
| `reuse-agents` | an | Korrekturen per Nachricht an denselben Agenten |
| `half-blind` | an | Prüfer sieht nur Fakten |
| `test-author` | an | eigener Test-Autor bei Logik-Paketen |
| `ideas-auto` | an | Brainstorming startet bei vager Beschreibung von selbst |
| `assume-and-continue` | an | bei Unklarheit mit markierter Annahme weiterarbeiten (Eintrag unter „Offene Fragen“ in `STATE.md`), statt den Nutzer zu stören; Anhalten nur bei schwer Rückgängigem oder echtem Blocker |
| `multi-planner` | an | Bereichs-Architekten bei großen Aufgaben mit mehreren Bereichen |
| `conflict-check` | an | Warnung bei Überschneidung offener Aufgaben |
| `helper-scripts` | an | Wegwerf-Skripte der Agenten erlaubt |
| `security-reviewer` | an | Sicherheitsprüfer bei Paketen in Risikobereichen |
| `refuter` | aus | Widerleger vor größeren Korrekturen |
| `fence` | aus | technischer Zaun über den Mod |
| `escalation` | aus | letzter Versuch mit stärkerem Modell |
| `haiku-simple` | aus | Haiku für einfache Routine-Pakete |
| `register-forwarding` | aus | Weiterleitung über das Agenten-Register |
| `package-lead` | aus | Paketleiter führt Pakete selbst durch |
| `read-budget` | aus | Grenze für zusätzliche Leserunden |
| `plan-html` | aus | Plan zur Freigabe als HTML |
| `auto-resume` | aus | nach Limit-Reset automatisch fortsetzen |
| `agent-progress` | aus | Agenten melden Schritte an die Agenten-Leiste (`codecycle_step`) |
| `graph` | an, wenn vorhanden | Code-Graph nutzen (sonst Outline/Suche); Anbieter über `graph.provider` in `.codecycle/tool.config.json` |
| `cache-ttl-builder` | 5m | Cache-Laufzeit der Agenten: Hauptsitzung im Abo automatisch 1h, Architekt 1h per Frontmatter (`experimental.cacheTtl`), alle anderen Agenten 5m |

## Mod (optional)

Bautafel über dem Eingabefeld, Seitenleiste (`/codecycle-panel`), `/profile`. Ohne Mod läuft der Ablauf gleich, nur ohne Bautafel, Limit-Prüfung, Token-Buch und technischen Zaun.

## Aktualisieren

In einer Sitzung genügt:

```
/codecycle:update
```

Der Befehl holt die neueste Version des Plugins, erneuert die Werkzeug-Kopie des Projekts samt Konfiguration und Hooks und lädt das Plugin neu. Die Bautafel zeigt an, wenn die Kopie veraltet ist oder fehlt. Von Hand im Terminal:

```
claude plugin marketplace update codecycle
claude plugin update codecycle@codecycle
```

Danach Claude Code neu starten (oder `/reload-plugins`).

## Abschalten und entfernen

```
claude plugin disable codecycle@codecycle
claude plugin uninstall codecycle@codecycle
```

Wieder einschalten: `claude plugin enable codecycle@codecycle`. Den Marktplatz-Eintrag entfernt `claude plugin marketplace remove codecycle`. Die Dateien in Projekten (`.claude/codecycle.md`, `.codecycle/`, `.githooks/`, `docs/codecycle/`) bleiben stehen und lassen sich von Hand löschen.

## Lizenz und Beiträge

MIT, siehe [LICENSE](LICENSE). Rückmeldungen und Pull Requests sind willkommen, Hinweise in [CONTRIBUTING.md](CONTRIBUTING.md). Änderungen je Version: [CHANGELOG.md](CHANGELOG.md).
