---
description: "Richtet codecycle in einem Projekt ein (oder ändert die Einrichtung): Projektbeschreibung, Doku-Aufbau, Projekt-Werkzeug, Hooks, Ablage, Profil."
argument-hint: ""
disable-model-invocation: true
---

# /codecycle:setup

## Zweck
codecycle in diesem Projekt einrichten oder die Einrichtung ändern. Du bist der **Bauleiter**.

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Git-Projekt, Node.js ab Version 24. Optional: ein Code-Graph, entweder code-review-graph (uv) **oder** CodeGraph (`@colbymchenry/codegraph`); für den Browser-Prüfer das Playwright-Plugin (`playwright@claude-plugins-official`) mit Google Chrome; `codecycle selftest` prüft beides.

## Schritte
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/SKILL.md`.
2. **Voraussetzungen prüfen (vor allem anderen, ohne Agent; direkt nach dem Lesen der Workflow-Anleitung):** Führe `git --version`, `node --version` und `git rev-parse --is-inside-work-tree` aus.
   - **Node fehlt oder ist älter als Version 24:** Hier nicht weitermachen; ohne Node läuft das Projekt-Werkzeug `codecycle` nicht, und der Bau bliebe beim ersten Paket stehen (der Mod, die Bautafel und die Agenten-Leiste laufen auch ohne Node). Stelle das Betriebssystem fest und nenne genau einen Befehl:
     - Windows: `winget install OpenJS.NodeJS.LTS`
     - macOS: `brew install node` (ohne Homebrew: Installer von nodejs.org)
     - Linux: über die Paketverwaltung der Distribution oder `nvm install 24`
     Biete an, den Befehl auszuführen, und tu es **nur nach ausdrücklicher Zustimmung** (er installiert Software auf dem Gerät). Danach `node --version` erneut. Meldet die Shell trotz erfolgreicher Installation noch „not found“ oder die alte Version, kennt die laufende Sitzung den neuen Pfad nicht: Bitte den Nutzer, **Claude Code neu zu starten** und `/codecycle:setup` noch einmal aufzurufen, und halte hier an.
   - **Git fehlt:** genauso (Windows `winget install Git.Git`, macOS `xcode-select --install`, Linux Paketverwaltung).
   - **Kein Git-Repo:** frage, ob `git init -b main` ausgeführt werden soll; ohne Repo nicht weitermachen.
   - **Hauptbranch:** Vorgabe ist `main`. Ein Repo ohne Commit bekommt `main` (`git init -b main` bzw. `git symbolic-ref HEAD refs/heads/main`). Gibt es schon einen Hauptbranch `master`, biete mit Begründung das Umbenennen an („`main` ist heute der Standard, auch auf GitHub; die Umbenennung ändert nur den lokalen Branch“): `git branch -m master main`, nur lokal. Weise darauf hin, dass ein Remote (`git push -u origin main`, Standardbranch dort umstellen) sowie offene Branches und Worktrees angepasst werden müssen. Nie automatisch; bei Nein bleibt `master`, die Vorlage trägt dann `mainBranch: master` ein (`tool/config-template.ts` fragt Git nach dem tatsächlichen Hauptbranch). Danach prüfen, dass `mainBranch` in `.codecycle/tool.config.json` stimmt.
   - Erst wenn Git und Node ab 24 da sind, weiter mit Schritt 3.
3. **Projekt erkunden:** Starte `codecycle:setup`; er schreibt `.claude/codecycle.md` nach `${CLAUDE_PLUGIN_ROOT}/skills/workflow/templates/project.md` (Berichtspfad ohne Aufgabe: `.codecycle/tmp/reports/setup.md`). Gibt es die Datei schon, ist das eine Änderung: frage, was geändert werden soll.
4. **Doku-Aufbau:** Der Einrichter schlägt einen Aufbau vor (Wurzel-`CLAUDE.md` kurz, Verweise als Pfad in Backticks statt `@`-Import, Bereichs-`CLAUDE.md`, Architektur unter `docs/architecture/`); frage den Nutzer, das Ergebnis steht unter „Doku-Aufbau“.
5. **Projekt-Werkzeug** (du legst die Kopie selbst an, kein Agentenlauf):
   - Führe `codecycle install-tool` aus (der Starter nimmt dafür immer den Plugin-Kern). Es legt `.codecycle/tool/` mit `lib/` darin und `githooks/` an, ohne Tests; wiederholbar. Zum Aktualisieren nach einem Plugin-Update (oder nach einem frischen Klon ohne `.codecycle/`) gibt es `/codecycle:update`: Plugin, Kopie, Konfiguration, Hooks und guard-Grundlage in einem Lauf. Kein eigenes Kopieren. Scheitert der Selbsttest danach an den Importpfaden, starte `codecycle:toolsmith`.
   - **`.codecycle/tool.config.json`:** `codecycle install-tool` legt sie als Vorlage an, wenn sie fehlt (nie überschreibt es eine vorhandene; bei einer vorhandenen ergänzt `codecycle install-tool --update-config` nur fehlende Felder wie `junit`): Version des Werkzeugs, `mainBranch`, Befehle aus den `package.json`-Skripten (`test`, `lint`, `format`), `graph.provider` `none`, wenn kein Graph-Werkzeug erkannt wird. Bei `node --test` trägt die Vorlage zusätzlich die JUnit-Reporter und `junit` ein (Voraussetzung für die Testzahl-Regel von `codecycle guard`). **Prüfe die Vorlage und passe sie an**, bevor du weitermachst; `codecycle:toolsmith` kann das übernehmen. Format:
     ```json
     {
       "version": "0.1.0",
       "mainBranch": "main",
       "commands": { "test": "npm test", "lint": null, "format": null },
       "graph": { "provider": "none" },
       "junit": ".codecycle/tmp/junit.xml"
     }
     ```
     `version` (Pflicht, Text) und `commands` (Pflicht) müssen stehen; `junit` ist optional (relativer Pfad im Projekt, ohne `..`). Ein Befehl `null` heißt „im Projekt nicht vorhanden“, ein **fehlender** Eintrag „nicht eingerichtet“ (der Selbsttest meldet ihn als Fehler), ein leerer Text ist ungültig. Weitere Befehle: `testFilter` (mit `{filter}`), `testFull`, `testAffected` (mit `{files}`), `server` (übernimmt `install-tool` aus der Zeile `server:` unter „Befehle“ in `.claude/codecycle.md`; fehlt er in einer vorhandenen Konfiguration, ergänzt ihn `codecycle install-tool --update-config`). `serverTemp` (optional): `{ "env": "<Umgebungsvariable>", "file": "<Dateiname, Standard daten>" }` = Name der Umgebungsvariable, über die der Server seine Datendatei liest; damit startet `codecycle server --temp` den Server für die Prüfer mit einer Wegwerf-Datei. Oder `{ "ohneDaten": true }` = der Server speichert nichts; `--temp` startet ihn dann ohne Variable. Lies den Wert aus der Projektbeschreibung (Zeile `Wegwerf-Daten`, vom Nutzer bestätigt): Umgebungsvariable → `env`, „ohne Daten“ → `ohneDaten`, „keine Wegwerf-Möglichkeit“ → Eintrag bleibt weg (Rückfall im Schritt Abnahme). `graph.provider`: `auto` | `code-review-graph` | `codegraph` | `none`; `auto` nimmt den Anbieter, dessen Index im Projekt liegt. Frage, welcher Graph genutzt werden soll, falls beide oder keiner vorhanden sind; einen Graphen installieren nur nach Rückfrage.
   - **Lokal halten:** Führe `codecycle exclude` aus (idempotent): trägt `.claude/`, `.codecycle/` und `.githooks/` in `.git/info/exclude` des Hauptrepos ein. Bei Ablage „teilen“ (Schritt 8) führe stattdessen `codecycle exclude --share` aus: dann bleibt `.claude/codecycle.md` versionierbar, ausgeschlossen werden nur `.claude/settings.local.json`, `.codecycle/` und `.githooks/` (ein früherer pauschaler `.claude/`-Eintrag in `.git/info/exclude` muss dann entfernt werden; der Befehl weist darauf hin). Die Ablage kommt aus der Frage in Schritt 8; frage sie deshalb **vor** diesem Aufruf, sonst gilt vorläufig `exclude` ohne Option und wird nach der Antwort mit `--share` wiederholt. Danach setzt `hooks install` `core.hooksPath` **absolut** auf den `.githooks`-Ordner des Hauptordners, weil nicht versionierte Hooks in Paket-Worktrees sonst fehlen. Also `exclude` **vor** `hooks install`.
   - **Fehlt ein Prüfwerkzeug** (Test, Lint, Format): schlage ein minimales vor und frage den Nutzer. Wenn ja, wird es eine eigene kleine Aufgabe (`/codecycle:new`). Werkzeug-Änderungen gibt der Nutzer immer frei.
   - Führe danach `codecycle selftest` aus (prüft Werkzeug, Konfiguration, Graph, Hooks, Kopie; bei einer Oberfläche auch Playwright-Plugin, Google Chrome, zweiten Playwright-Server und Serverbefehl). Scheitert er, melde es und biete den Werkzeugmeister an. Bei einer Oberfläche: dem Nutzer das Ergebnis der Browser-Prüfung und die Abhilfe-Befehle nennen (Hinweise, kein Fehlschlag; installieren macht er). In `.claude/codecycle.md` trägst du es nicht ein; dort steht nur Dauerhaftes, kein Zustand und keine Umgebungsangaben.
6. **Hooks** (erst nach gültiger Konfiguration und nach `codecycle exclude`; ohne gültige `.codecycle/tool.config.json` bricht `hooks install` mit Meldung ab, weil der Graph-Anbieter aus ihr in die Hooks geschrieben wird): Führe `codecycle hooks install` aus (legt `.githooks/` mit Graph-Aktualisierung und gestuftem Pre-Commit an, setzt `core.hooksPath`, ergänzt vorhandene Hooks statt sie zu ersetzen; mit `--dry-run` zeigt es vorher, was passiert). Zeigt `core.hooksPath` schon auf etwas anderes (husky, lint-staged), ändert das Werkzeug nichts: frage den Nutzer. `codecycle hooks status` prüft den Stand. Meldet er (oder der Selbsttest) einen Hook als „veraltet“, etwa nach einer Änderung der Konfiguration oder des Plugins, führe `codecycle hooks install` erneut aus.
7. Leeres Projekt: Vorschlag „Grundgerüst plus Testbefehl“ als erste Aufgabe.
8. **Fragen an den Nutzer, einzeln:**
   - Sprache der Agenten-Ausgaben (Standard Deutsch).
   - **Ablage der Aufgaben-Doku** (`docs/codecycle/`): teilen (Standard, im Repo committet) oder lokal (Eintrag in `.git/info/exclude`). Wechsel von teilen auf lokal heißt `git rm --cached`; vorher nachfragen, weil andere Personen die Dateien beim nächsten `git pull` verlieren. Werkzeug und Konfiguration (`.codecycle/`, `.githooks/`, bei Ablage „lokal“ auch `.claude/`) bleiben lokal (`codecycle exclude`, Schritt 5); `.codecycle/tmp/` sowieso.
   - **`.gitignore`, je Option eine eigene Frage mit Begründung, danach `codecycle exclude [--share] --gitignore` nur für die bejahten Einträge bzw. von Hand ergänzen, nie überschreiben:**
     - `.codecycle/` ausschließen (Standard ja): enthält die Werkzeug-Kopie und lokale Ablagen, die jedes Gerät selbst erzeugt (`codecycle install-tool`).
     - `.claude/settings.local.json` ausschließen (Standard ja): persönliche Einstellungen gehören nicht ins Repo.
     - `.claude/codecycle.md` **committen**, wenn die Ablage „teilen“ ist (Standard ja): Risikobereiche und Schalter gehen so auf ein anderes Gerät mit; deshalb darf `.claude/` nicht pauschal ausgeschlossen sein. Bei Ablage „lokal“ bleibt alles ausgeschlossen wie bisher.
   - **`.gitattributes` (Angebot):** Frage mit Begründung („verhindert die Warnungen ‚LF will be replaced by CRLF‘ bei den Aufgabenordnern unter Windows“), Vorschlag `docs/codecycle/** text eol=lf` (nur die Aufgabenordner, nicht die übrigen Dateien des Projekts); bei Ja `codecycle exclude --gitattributes` (legt die Datei an oder ergänzt sie, überschreibt nie).
   - **Kennzeichnung durch Claude** (eine Frage): Was soll in Commits und Pull Requests stehen?
     - (a) Urheberzeile und Sitzungslink (Standard von Claude Code): `Co-Authored-By`, Hinweis in Pull Requests, Zeile `Claude-Session: <Link>` in Cloud- und Remote-Control-Sitzungen. Belegt, dass und in welcher Sitzung Claude mitgearbeitet hat; den Link öffnet nur das eigene Konto, solange die Sitzung nicht öffentlich gestellt ist. Empfehlung.
     - (b) Nur den Sitzungslink, keine Urheberzeile.
     - (c) Nichts.
     - Führe die Antwort in `.claude/settings.json` des Projekts **zusammen** (Datei lesen, bestehende Schlüssel erhalten, nur `attribution` setzen; fehlt die Datei, anlegen), immer mit allen drei Schlüsseln, weil eine globale Einstellung sonst durchschlagen kann: (a) `"attribution": { "commit": "Co-Authored-By: Claude <noreply@anthropic.com>", "pr": "🤖 Generated with [Claude Code](https://claude.com/claude-code)", "sessionUrl": true }`, (b) `{ "commit": "", "pr": "", "sessionUrl": true }`, (c) `{ "commit": "", "pr": "", "sessionUrl": false }`.
   - **Profil ohne Mod:** `sparsam` / `großzügig` / `extrem` (ändert nur die Modelle). Speichere die Wahl in `~/.claude/codecycle/profile.json` im Format `{ "profil": "sparsam" }` (Schlüssel `sparsam`, `grosszuegig`, `extrem`). Mit Mod stammt das Profil aus dem Mod-Speicher.
   - **Schalter** (Vorschlag; darunter `assume-and-continue`, Standard an: Agenten arbeiten bei Unklarheit mit markierter Annahme weiter, statt den Nutzer zu stören): Standardwerte aus der Schalter-Tabelle im Workflow-Skill übernehmen; Änderungen im Abschnitt „Schalter“ von `.claude/codecycle.md` eintragen.
9. Fasse das Ergebnis kurz zusammen (angelegte Dateien, Selbsttest) und committe nur nach Rückfrage (bei Ablage „teilen“).

## Ergebnis
`.claude/codecycle.md`, `.codecycle/tool/` (mit `lib/`), `.codecycle/tool.config.json`, `.githooks/`, ein gespeichertes Profil, Graph-Anbieter in der Konfiguration; Selbsttest grün.

## Nächster Schritt
`/codecycle:new <Beschreibung>`; bei leerem Projekt die Aufgabe „Grundgerüst plus Testbefehl“.
