# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Plugin und Projekt-Werkzeug haben getrennte Versionen („Plugin x / Werkzeug y“).

## [0.20.2] – 2026-10-21

### Geändert

- `/codecycle:new` schlägt zuerst den Weg vor: Solo-Weg für kleine und mittlere Aufgaben, voller Ablauf bei Unumkehrbarem, mehreren Risikobereichen oder sehr großen Aufgaben. Eine Frage mit Empfehlung; bei Solo geht es direkt im Solo-Weg weiter.
- README: Abschnitt „Welcher Weg?“ (Solo-Weg für kleine und mittlere Aufgaben, voller Ablauf für große oder riskante); neue Sitzung nur, wenn die Hauptsitzung groß wird.

## [0.20.1 / Werkzeug 0.7.1] – 2026-10-21

### Geändert

- Nach `codecycle paket start` und `paket fertig` hängt der Mod den Stand von `codecycle_budget` (Limit und Größe der Hauptsitzung) an die Ausgabe; der Bauleiter fragt das Budget zusätzlich vor jedem Agentenstart und nach jeder Freigabe.
- Eine neue Sitzung empfiehlt der Bauleiter nur, wenn `codecycle_budget` es sagt, auch am Ende einer Aufgabe. Die Empfehlung nennt zuerst `/clear` und `/codecycle:continue`, den Knopf auf der Bautafel nur als Zusatz, damit sie auch ohne Bautafel (z. B. über Remote Control) genügt.
- Der Bauleiter wiederholt nicht mehr, was `codecycle paket` in `STATE.md` schreibt.
- README: keine „getestet mit“-Version mehr; 2.1.299 nur als Grenze für das volle Aussehen der Seitenleiste.

### Behoben

- Ein Agent bekam als Schreibziel den ersten Berichtspfad seiner Startnachricht, auch wenn dieser nur ein Lesehinweis auf einen fremden Bericht war; sein eigener Bericht wurde dann verweigert.
- `codecycle paket` schrieb das Datum in UTC; zwischen Mitternacht und dem Ende der Zeitverschiebung stand der Vortag.

## [0.20.0 / Werkzeug 0.7.0] – 2026-10-20

### Neu

- `codecycle paket start|pruefen|fertig P<n>`: Worktree, Testzahl, Prüfung gegen den Aufgaben-Branch, Merge und `STATE.md` eines Pakets in je einem Aufruf. `paket fertig` mergt nur nach einer grünen Prüfung auf genau diesem Stand; bei einem Merge-Konflikt steht das Paket auf „blockiert“.
- Knopf „Neue Sitzung“ auf der Bautafel, sobald die Hauptsitzung groß ist: `/clear`, danach `/codecycle:continue`.

### Geändert

- Eine neue Sitzung empfiehlt der Bauleiter nach dem Füllstand der Hauptsitzung (ab 400 000 Tokens an der nächsten Pause, ab 600 000 an der nächsten möglichen Stelle), nicht mehr nach jeder Phase. `codecycle_budget` nennt den Füllstand; die Bautafel warnt in denselben Stufen.
- `/codecycle:continue` setzt eine einzelne offene Aufgabe ohne Rückfrage fort; Einstellungsfragen wie die nach den Git-Hooks kommen je Aufgabe nur einmal; Fragen zum Ergebnis stehen vor Fragen zum Ablauf.
- Der Paketleiter prüft mit `codecycle paket pruefen`, bevor er den Prüfer startet. `paket start` und `paket fertig` ruft nur der Bauleiter auf.
- `codecycle commit-tests` versieht den Commit mit der Zeile `Codecycle-Tests: rot`.

## [0.19.2 / Werkzeug 0.6.6] – 2026-10-20

### Geändert

- Solo-Weg: Die Liste der Eingabeformate nennt Tausendertrenner mit Leerzeichen (`1 000`) immer; Punkt oder Komma als Tausendertrenner nur, wo die Aufgabe sie nicht als Dezimalzeichen erlaubt.

## [0.19.1 / Werkzeug 0.6.6] – 2026-10-20

### Geändert

- Solo-Weg: Der Abschnitt „Eingabeformate“ nennt nur Schreibweisen. Was eine Schreibweise bedeutet, steht unter „Annahmen“ und richtet sich nach dem Wortlaut der Aufgabe; der Solo-Prüfer misst jedes Ergebnis am Wortlaut, nicht an der Liste.
- `codecycle solo funde` setzt den Haltepunkt selbst: 4, sobald der Prüfbericht da ist, 5, sobald jeder Fund einen Status hat.

## [0.19.0 / Werkzeug 0.6.5] – 2026-10-20

### Geändert

- Git-Hooks (`.githooks/`), Werkzeug (`.codecycle/tool/`), seine Konfiguration und die Grundlage von `codecycle guard` ändert nur noch `codecycle:toolsmith` oder die Hauptsitzung, auch wenn der Schalter `fence` aus ist. Das gilt auch für Agenten ohne codecycle-Rolle.
- Der Zaun erkennt mehr Schreibziele: Quellen von `mv`, `chmod` und Verwandte, `git rm`, `git mv`, `git checkout <stand> <datei>` sowie PowerShell-Befehle wie `Set-Content`, `Remove-Item`, `Move-Item` und `[IO.File]::WriteAllText`.
- Die Hook-Sperre verweigert `PATH=…` ohne den bisherigen Pfad vor einem Git-Befehl (der Pre-Commit-Hook fände Node nicht) und prüft Schreibziele in PowerShell auf `.git/config` und `.git/hooks`.

## [0.18.4 / Werkzeug 0.6.4] – 2026-10-20

### Geändert

- Python-Sperre: `python3 - <<'EOF' … EOF` ist außerhalb von Windows erlaubt; unter Windows bleibt es gesperrt.
- `/codecycle:solo`: Die Sitzung hält im Kurzplan die Eingabeformate fest (realistische Schreibweisen der Eingaben), probiert sie selbst aus und gibt sie dem Solo-Prüfer mit; er prüft jede einzeln und ergänzt eigene.

## [0.18.3 / Werkzeug 0.6.3] – 2026-10-20

### Hinzugefügt

- `serverTemp: { "ohneDaten": true }` in `.codecycle/tool.config.json` für Server, die nichts speichern: `codecycle server --temp` startet den Server dann ohne Umgebungsvariable, statt mit „nicht eingerichtet“ abzubrechen.

### Geändert

- Setup: Die Zeile „Wegwerf-Daten“ in `.claude/codecycle.md` kennt drei Werte (Umgebungsvariable, ohne Daten, keine Wegwerf-Möglichkeit); der Setup-Agent beurteilt sie am Code.
- `/codecycle:solo`: Fehlt `serverTemp`, schlägt die Sitzung den Eintrag vor und fragt einmal. Der Solo-Prüfer startet ohne `serverTemp` keinen Server mehr und meldet die Oberfläche als ungeprüft.

## [0.18.2 / Werkzeug 0.6.2] – 2026-10-20

### Geändert

- `codecycle solo check` setzt bei Grün neben `geprueftAuf` auch `haltepunkt: 3` in `STATE.md`.
- `/codecycle:solo` und der Solo-Prüfer: Ist `codecycle server --temp` nicht eingerichtet, starten sie den Server mit `codecycle server` und beenden ihn nur mit `codecycle server --stop`, nie mit `pkill -f` oder `killall` (das Suchmuster trifft die eigene Shell). Der Prüfer startet so nur, wenn keine echten Daten berührt werden.

## [0.18.1 / Werkzeug 0.6.1] – 2026-10-20

### Geändert

- `/codecycle:solo`: Ein Risikobereich aus `.claude/codecycle.md` ist kein Grund mehr für eine Frage vorab. `codecycle solo check` nennt berührte Bereiche in einer Zeile `Risikobereiche: …`, und der Solo-Prüfer prüft diese Dateien zusätzlich auf Sicherheit (ungeprüfte Eingaben, Abstürze, Einschleusen, Interna in Antworten). Gefragt wird vorab nur bei schwer Rückgängigem, im Format „Entscheidungen für dich“.
- `codecycle solo check` kennt die Option `--risiko-bestaetigt` und den Exit-Code 3 nicht mehr.

## [0.18.0 / Werkzeug 0.6.0] – 2026-10-19

### Neu

- `/codecycle:solo <Beschreibung>`: Die Sitzung baut die Aufgabe selbst; ein frischer Prüfer (Rolle `solo-reviewer`, Opus) bekommt nur den Wortlaut und den Diff, probiert Seite, Schnittstelle und Kommandozeile in einem Wegwerf-Worktree aus und geht eine feste Grenzfall-Liste durch; danach eine Runde Nachbesserung und die Merge-Frage. Sechs Haltepunkte; Abgaben einzelner Teile an `builder-logic` oder `builder-routine` sind möglich.
- `codecycle solo check <ordner>`: `check` grün, alles committet, Risikobereiche der geänderten Dateien (Exit 3: Frage an den Nutzer); hält den geprüften Commit fest. `codecycle solo funde <ordner>`: jeder Fund des Prüfberichts hat einen Status.
- Risikobereiche in `.claude/codecycle.md` können Pfadmuster tragen: `- Auth: Grund (Pfade: src/auth/**)`.
- Mod: Der Solo-Prüfer startet nur nach grünem `codecycle solo check`; ein Solo-Branch wird nur mit Prüfbericht und Status je Fund gemergt; in Solo-Aufgaben schreiben nur die Sitzung, die Handwerker und der Prüfer (nur seinen Bericht).

## [0.17.0 / Werkzeug 0.5.4] – 2026-10-19

### Neu

- Die Aufgabe hält den Text des Nutzers unverändert im Abschnitt „Wortlaut“ fest. Plan-Prüfer und Abschlussprüfung prüfen Kriterien, Standards, Plan und Ergebnis dagegen; Standards, die den Wortlaut auslegen, fragt der Bauleiter einzeln.
- `codecycle effort --record` nennt, wie viele Hauptsitzungen erfasst sind und was nicht erfasst ist.

### Geändert

- Rote Abnahmetests liegen je Paket in dessen Worktree, nicht mehr im Aufgaben-Branch; ein fertiges Paket scheitert nicht mehr an roten Tests eines späteren Pakets.
- Entscheidungen stehen mit der Antwort des Nutzers im Wortlaut.
- `.claude/codecycle.md` enthält nur Dauerhaftes; die Browser-Bereitschaft prüft der Selbsttest vor jedem Browser-Prüfer.

### Behoben

- Hauptsitzungen im Kopfmodus und nach `--resume` werden in die Aufgabe gebucht.

## [0.16.1 / Werkzeug 0.5.3] – 2026-10-19

### Geändert

- Aufwandsplan, Ablauf-Skill und Schritte ohne interne Kennungen in Klammern; die Begründungen bleiben.
- README mit Inhaltsverzeichnis.
- Ablauf-Skill: unter der Tabelle „Schalter“ steht, dass `assume-and-continue` nur über die Anleitung wirkt und `demo-data` nur die Anzeige betrifft.

## [0.16.0 / Werkzeug 0.5.2] – 2026-10-18

### Neu

- `/codecycle:notiz <Text>` und `codecycle notiz '<Text>'`: Notiz ohne KI in `notizen.md` der offenen Aufgabe; nur mit Schalter `notizen: an`.
- Selbsttest und Einrichtung prüfen bei Projekten mit Oberfläche die Voraussetzungen des Browser-Prüfers (Playwright-Plugin, Google Chrome, kein zweiter Playwright-Server, Serverbefehl).
- Bleibt der Browser nach dem Browser-Prüfer offen, zeigt die Bautafel einen Hinweis, und der Bauleiter erfährt es.

### Geändert

- Suchen über Bash (`grep`, `rg`, `find`) zählen wie Grep und Glob; wichtig unter Linux und macOS, wo es diese Werkzeuge nicht gibt. Einige Optionen von ugrep und bfs, die Programme starten oder Dateien schreiben oder löschen, sind für prüfende Rollen gesperrt.
- Aufwand je Rolle und Bauleiter wird in gewichteten Tokens dieser Sitzung angezeigt; der Anteil am 5-Stunden-Fenster steht nur noch als Näherung daneben, weil dort andere Sitzungen mitzählen.
- Der Aufgabenordner eines neuen Agenten kommt aus der offenen Aufgabe; ein vertippter Ordner wird berichtigt oder der Start abgelehnt.
- `codecycle effort` weist darauf hin, wenn eine Aufgabe einen Risikobereich berührt und der Zaun aus ist.
- `codecycle install-tool` übernimmt den Serverbefehl aus der Projektbeschreibung.
- Die Bautafel erscheint nur in eingerichteten Projekten; sonst wird `/codecycle:setup` im Eingabefeld vorgeschlagen.
- Nach `/codecycle:update` steht in der Meldung, dass man `/reload-plugins` eingeben kann, falls nicht neu geladen wird.
- Feste Form für Fragen an den Nutzer.
- Seitenleiste im Terminal: In schmalen Ansichten fallen weniger wichtige Angaben weg (zuerst der Anteil am 5-Stunden-Fenster), statt mitten im Text abgeschnitten zu werden; die gewichteten Tokens stehen in der Agentenzeile gleich nach dem Kontext; „1 Lauf“ statt „1 Läufe“.
- Der Paketleiter (Schalter `package-lead`) kann über Bash suchen und Git lesen; schreiben darf er nur seinen Bericht.
- Beim Abschluss einer Aufgabe wird `notizen.md` mit committet.
- Die Meldung von `/codecycle:notiz` bei ausgeschaltetem Schalter nennt die Schreibweise des Schalterblocks (`notizen: an`).
- Auch prüfende Rollen und der Paketleiter dürfen `codecycle notiz` aufrufen (nur mit Schalter `notizen: an`).
- Der Selbsttest wartet höchstens 15 Sekunden auf `claude plugin list`; danach meldet er das Playwright-Plugin als „nicht prüfbar“.

### Behoben

- Eine Folgenachricht an einen fertigen Agenten zählte als neuer Start: Register und Lese-Budget begannen von vorn, ein zusätzlicher Lauf wurde gezählt, und Claude Code protokollierte einen Fehler, weil der Mod die Nachricht umschreiben wollte. Jetzt läuft der Agent unter seinem Eintrag weiter, auch nach einem Neuladen des Mods.
- In Projekten ohne `.claude/codecycle.md` blitzte die Bautafel beim Start kurz auf.
- Die Meldung beim abgelehnten Agentenstart zeigt den Ordner ohne angehängtes Satzzeichen.

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
