# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Plugin und Projekt-Werkzeug haben getrennte Versionen („Plugin x / Werkzeug y“).

## [0.25.1 / Werkzeug 0.10.0] – unveröffentlicht

### Geändert

- Abschluss einer Aufgabe und gemerkte Nebenfunde schreiben Felder und Werte nach der Anleitung des Festhalten-Ordners; in einem Projekt mit eigenem, angedocktem Schema (`codecycle-doku` 0.2.0) also dessen Werte, etwa `status: gebaut`. Fehlen dort Abschluss-Werte, bleibt der Eintrag unverändert und die Sitzung nennt ihn.
- Die Anleitung eines Festhalten-Ordners findet die Sitzung über die Karte der Doku (bei einer angedockten Sammlung eine Regeldatei unter `.claude/rules/`); den Changelog schreibt sie nur, wenn `.claude/doku.json` einen nennt.
- Bauende und Schlussprüfer ziehen die Architektur-Doku mit, die die Karte nennt, wenn eine Änderung den Aufbau des Codes ändert.

## [0.25.0 / Werkzeug 0.10.0] – 2026-10-25

**Bestehende Installationen:** codecycle setzt jetzt das Plugin `codecycle-doku` voraus. `/codecycle:update` holt es nach; wer über `/plugin` oder von Hand aktualisiert, ruft einmal `claude plugin install codecycle-doku@codecycle` auf, sonst lädt codecycle nicht.

### Neu

- codecycle setzt das Doku-Plugin `codecycle-doku` voraus (feste Orte und Arten der Doku, Festhalten von Ideen, Bugs und To-dos, Prüfer und Hook); eine neue Installation von codecycle installiert es mit.
- `/codecycle:setup` richtet die Doku mit `/codecycle-doku:einrichten` ein, wenn `.claude/doku.json` fehlt.
- Geht eine Aufgabe von einer Idee, einem Bug oder To-do aus (Zeile `Eintrag:` in `TASK.md`), setzt der Abschluss den Eintrag beim Merge auf erledigt, mit Ergebnis und Verweis auf die Aufgabe bzw. den Merge-Commit.
- Der Schlussprüfer lässt den Prüfer des Doku-Plugins über die geänderten Markdown-Dateien laufen.
- Der Marktplatz `codecycle` enthält beide Plugins, je in einem eigenen Ordner (`codecycle/`, `codecycle-doku/`); Kennungen und Installationsbefehle bleiben gleich.

### Geändert

- Bauende, Schlussprüfer und Abschluss richten sich nach `.claude/doku.json` und der Karte `.claude/rules/codecycle-doku.md`; der Abschnitt „Doku-Aufbau“ in `.claude/codecycle.md` verweist nur noch darauf. Changelog und Chronik kommen an die dort genannten Orte, ein erzeugter Changelog bleibt unberührt.
- Ablage „lokal“ schließt unter `.claude/` nur noch die Dateien von codecycle aus (`.claude/codecycle.md`, `.claude/settings.local.json`), nicht den ganzen Ordner; die Dateien des Doku-Plugins folgen dessen eigener Ablage-Wahl. Ein pauschaler Eintrag `.claude/` in `.git/info/exclude` aus einer früheren Einrichtung wird beim nächsten `/codecycle:setup` durch die einzelnen Dateien ersetzt.
- Nebenfunde, die du merken lässt, werden Bugs im Bug-Ordner des Doku-Plugins. Fehlt der Bug-Ordner, legt die Sitzung ihn ohne Fragen an und meldet es; ohne eingerichtete Doku bleibt der Nebenfund ein offener Punkt mit Hinweis auf `/codecycle-doku:einrichten`.
- `/codecycle:update` ruft nach dem Plugin-Update `claude plugin install codecycle@codecycle` auf, holt so neue Abhängigkeiten nach und aktualisiert danach auch `codecycle-doku`. Das gilt auch, wenn eine ältere Version von codecycle das Update gestartet hat; ab dieser Version läuft das nur einmal je Update. Einträge für ein Projekt (`--scope local` oder `project`) aktualisiert es im Projektordner des Eintrags, auch wenn du `/codecycle:update` aus einem Unterordner aufrufst.
- Eine Tabelle Rolle → Modell statt Profilen: `models.json` ersetzt `profiles.json`. Die Modelle bleiben gleich (Opus für Bauende, Planprüfer und Schlussprüfer; Sonnet für Einrichter, Werkzeugmeister und den Prüfer je Teil).
- Die Bautafel zeigt keine Profil-Zeile mehr; im Terminal stehen „Details“ und Einklappen in der Zeile der Aufgabe.

### Entfernt

- Profile `sparsam`, `großzügig`, `extrem`, die Profil-Knöpfe auf der Bautafel, der Befehl `/profile` und die Profil-Sperre nach dem ersten Agenten.
- Die Frage nach dem Profil in `/codecycle:setup` und die Datei `~/.claude/codecycle/profile.json` (eine vorhandene Datei wird nicht mehr gelesen und kann gelöscht werden).
- Der Hinweis, bei Opus in der Hauptsitzung auf Sonnet umzuschalten, und die Zeile „Profil“ in der Antwort von `codecycle_budget`.
- `/codecycle:notiz`, `codecycle notiz` und der Schalter `notizen`; Ideen, Bugs und To-dos hält das Doku-Plugin fest. Eine vorhandene `notizen.md` bleibt liegen und wird nicht mehr gelesen.

## [0.24.1 / Werkzeug 0.9.1] – 2026-10-25

### Behoben

- Ein Teil-Branch großer Aufgaben lässt sich nicht mehr mit `git merge` an der Prüfung vorbei mergen; Teile übernimmt `codecycle solo teil fertig`.

## [0.24.0 / Werkzeug 0.9.1] – 2026-10-25

### Neu

- Große Aufgaben werden in Teilen gebaut: Je Teil baut nacheinander ein frischer Bauender auf einem eigenen Branch im selben Ordner; jedes fertige Teil ist grün, übernommen und in `STATE.md` festgehalten. Geht das Limit mitten in einem Teil aus, baut `/codecycle:continue` in einer neuen Sitzung dort weiter.
- Prüfer je Teil (Schalter `part-review`, Standard an, Modell Sonnet): Teile, die der Plan als groß markiert, prüft nach dem Bau ein frischer Prüfer gegen ihre Planzeile, mit einer Fixrunde; erst dann gilt der Teil als fertig. Sein Modell steht im Profil unter `part-reviewer`. Andere Teile brauchen keinen Teil-Bericht.

### Geändert

- Fünf Rollen: Planprüfer, Bauender, Schlussprüfer, Einrichter, Werkzeugmeister. Bauende arbeiten in allen Profilen mit Opus, der Prüfer je Teil mit Sonnet; die drei Profile haben damit dieselben Modelle.
- Kosten pro Rolle zeigen alte Rollennamen älterer Aufgaben unter der heutigen Rolle, eine Zeile je Rolle.
- Fußzeile der Desktop-App: Das Limit erscheint ab 75 % im Orange des Kreises der App.
- `codecycle guard` meldet „guard rot: …“.

### Entfernt

- Der volle Ablauf mit seinen Rollen, Schritten, Werkzeug-Befehlen (`paket`, `commit-tests`, `package-info`, `plan-html`, `rework`, `tests-for`, `impact`, `solo zwischenstand`) und Schaltern (`context-package`, `sections`, `reuse-agents`, `half-blind`, `test-author`, `multi-planner`, `security-reviewer`, `refuter`, `escalation`, `haiku-simple`, `register-forwarding`, `package-lead`, `read-budget`, `plan-html`, `cache-ttl-builder`). Stehen diese Schalter noch in `.claude/codecycle.md`, wirken sie nicht. `codecycle effort` misst nur noch mit `--record`. <!-- doku-ok -->
- Angefangene Aufgaben des vollen Ablaufs setzt `/codecycle:continue` nicht fort; Branch und Dateien bleiben, `/codecycle:new` beginnt sie neu.
- Der Effort eines Agenten steigt bei Risikobereichen nicht mehr; er steht in der Agenten-Datei. <!-- doku-ok -->

## [0.23.0 / Werkzeug 0.8.5] – 2026-10-24

### Neu

- Ein Weg für jede Aufgabe: `/codecycle:new` beginnt mit einem Brainstorming, legt einen Entwurf mit deinen Worten und Erfolgssätzen zur Freigabe vor, schreibt den Plan selbst, lässt ihn von einem Planprüfer gegen den Entwurf abgleichen und legt ihn zur Freigabe vor; danach baut die Sitzung selbst und ein frischer Prüfer prüft. Bei einer klaren Aufgabe sagt Claude in einem Satz, was es verstanden hat, und legt los.
- `/codecycle:brainstorming`: Brainstorming, das Claude auch von selbst startet, mit einer Frage je Nachricht, eigenen Ideen und Kritik.

### Geändert

- Fragen an dich: „a) Empfehlung“ und „b) Dagegen spricht“ (das stärkste Gegenargument) statt Antwortlisten, du antwortest mit einem Buchstaben; einfache Fragen wie die Merge-Frage in einer Zeile mit Standard.
- Eine neue Sitzung schlägt Claude nur vor, wenn die Sitzung voll wird; sonst geht es nach einer Freigabe ohne Frage weiter.
- Im leeren Projekt legt die Einrichtung einen ersten, leeren Commit an.
- `codecycle tasks` nennt die Haltepunkte „Entwurf“ und „Plan“.
- `/codecycle:setup` richtet Mechanisches ohne Rückfrage ein und zeigt die Standards gesammelt; bei einem bestehenden Projekt fasst es zusammen, wie es das Projekt verstanden hat.
- Planprüfer und Prüfer am Ende nutzen Opus in allen Profilen; der Prüfer am Ende prüft auch die Erfolgssätze.

### Entfernt

- `/codecycle:solo`, `/codecycle:ideas` und der Schalter `ideas-auto`; die Wegfrage. Angefangene Aufgaben im vollen Ablauf und im Solo-Weg laufen mit `/codecycle:continue` weiter. <!-- doku-ok -->

## [0.22.7 / Werkzeug 0.8.4] – 2026-10-24

### Geändert

- Urheberzeilen in Commits sind nicht mehr verboten: Agenten schreiben sie nur, wenn Claude Code sie nach der Einstellung `attribution` des Projekts vorgibt, und erfinden keine eigenen.
- `/codecycle:setup` fragt nach der Kennzeichnung durch Claude ohne Empfehlung und zeigt je Antwort ein kurzes Beispiel; die Wahl lässt sich später unter `attribution` in `.claude/settings.json` ändern.

### Behoben

- Solo-Weg: Der Prüf-Worktree hat die Abhängigkeiten des Hauptordners, der Prüfer kann dort Lint und Tests ausführen. Neu `codecycle solo pruefung start|ende <aufgabenordner>`; das Entfernen löst erst die Verweise und nutzt nie `--force`.
- Die Sperre gegen das Umgehen der Git-Hooks nennt beim Schreiben in die Git-Konfiguration von Benutzer oder System diesen Ort statt `.git/config`.

## [0.22.6 / Werkzeug 0.8.3] – 2026-10-24

### Geändert

- Solo-Prüfer: Ein Fehler, den die Änderung nicht verursacht hat, kommt als „Nebenfund:“ in den Bericht. Die Sitzung bessert ihn nicht nach, sondern fragt im Abschluss: jetzt beheben, als eigene Aufgabe merken oder verwerfen. Gemerkte Nebenfunde stehen an der Stelle für offene Aufgaben aus dem Doku-Aufbau, sonst in `docs/codecycle/nebenfunde.md`; `codecycle solo funde` kennt dafür den Status `gemerkt: <Ort>`.
- Solo-Prüfer: Eine Wortlaut-Frage gibt es nur, wenn das Verhalten vom Wortlaut abweicht. Abweichungen ohne Wirkung (Namen, Aufbau, Kommentare, Doku-Formulierungen) stehen gesammelt unter „Offene Punkte“.

## [0.22.5 / Werkzeug 0.8.2] – 2026-10-24

### Behoben

- Ein per Folgenachricht fortgesetzter Agent darf seinen Bericht auch nach einem Neuladen des Mods oder in einer mit `--resume` fortgesetzten Sitzung schreiben. Der Solo-Prüfer wurde dort bisher auch beim eigenen Bericht abgewiesen. Das Agenten-Register (`agents.json`) führt dafür den Berichtspfad.

## [0.22.4 / Werkzeug 0.8.2] – 2026-10-24

### Behoben

- `/codecycle:update` bei mehreren Installationen (für alle Projekte und für einzelne Projekte): Es zählt die Installation des aktuellen Ordners, beide werden angehoben, eine ältere Version wird nie mehr als Update gemeldet. Haben die Installationen verschiedene Versionen, sagt der Befehl welche. Klappt das Neuladen nicht, rät er zum Neustart.

## [0.22.3 / Werkzeug 0.8.1] – 2026-10-24

### Geändert

- Desktop-App: Die Fußzeile zeigt je Limit (5 Stunden, Woche) knapp Prozent und Rücksetzzeit des 5-Stunden-Fensters („5h 42 % (↻18:40) │ W 84 %“). Die Prozentzahl ist blau, ab 75 % gelb und ab 90 % rot.

## [0.22.2 / Werkzeug 0.8.1] – 2026-10-23

### Geändert

- Solo-Prüfer: schreibt drei bis fünf stille Annahmen des Diffs auf und versucht jede mit einem echten Aufruf zu brechen. Einen Verdacht verwirft er nur, wenn ein Versuch genau den beobachteten Fall nachstellt; hält er ein Verhalten für gewollt, nennt er die Stelle im Wortlaut, sonst wird es ein Fund „Wortlaut:“.

## [0.22.1 / Werkzeug 0.8.1] – 2026-10-22

### Behoben

- Solo-Weg: Ein Fund zählt erst als behoben, wenn in `TASK.md` ein Commit in Klammern steht (`- M1: behoben (abc1234)`). Ohne Commit, etwa `behoben (undefined)`, melden `codecycle solo funde` und die Merge-Sperre den Fund als offen.

## [0.22.0 / Werkzeug 0.8.0] – 2026-10-22

### Neu

- Solo-Weg für große Aufgaben: Statt des Kurzplans schreibt die Sitzung einen Plan in Teilen (je Teil Dateien, Schnittstelle, Prüfweg). `codecycle solo plan <ordner> <teil> …` hält die Teile in `STATE.md` fest, `codecycle solo zwischenstand <ordner> <teil>` setzt nach einem fertigen Teil einen Zwischen-Haltepunkt (Check grün, alles committet). Dort darf die Sitzung wechseln; `/codecycle:continue` setzt beim nächsten offenen Teil fort, `codecycle tasks` zeigt den Stand der Teile. Getrennte Bereiche mit fester Schnittstelle baut die Sitzung in der Regel gleichzeitig mit `codecycle solo teil`.
- Zweiter Prüfer im Solo-Weg: Berührt die Änderung mindestens zwei Risikobereiche, prüft nach dem ersten Prüfer ein zweiter Lauf nur die Sicherheit dieser Bereiche (Startnachricht mit `Auftrag: Sicherheit`, Bericht `reports/pruefung-sicherheit.md`, Funde `Z1` …). Der Merge braucht dann beide Berichte und einen Status je Fund.

### Geändert

- `/codecycle:new` schlägt den vollen Ablauf nur noch bei schwer Rückgängigem vor (Datenmigration, Löschen, Veröffentlichen, Zahlungen); große Aufgaben und mehrere Risikobereiche gehen in den Solo-Weg. <!-- doku-ok -->
- Der Wortlaut der Aufgabe ist Maßstab, keine unfehlbare Vorschrift: Deine Antwort gilt vor dem Wortlaut, der Wortlaut vor dem Plan. Weicht die Sitzung bewusst ab, auch mit einer besseren Idee, steht das als Annahme mit Grund in `TASK.md` und kommt im Abschluss als Frage zu dir.
- Bestehende Meldungen, Formate, Schnittstellen und Seiten bleiben wörtlich gleich, außer die Aufgabe verlangt eine Änderung; sonst wird die Änderung eine Frage. Das gilt im Solo-Weg und im vollen Ablauf (Architekt, Plan-Prüfer, Abschlussprüfung, Abnahme messen am Wortlaut, nicht am Plan).
- Lässt der Wortlaut mehr als eine Lesart zu und folgt das Ergebnis nicht eindeutig der naheliegenden, melden Plan-Prüfer, Abschlussprüfung und Abnahme das als Frage an dich und nicht nur als Grenzfall.
- Solo-Prüfer und Randfall-Liste prüfen zusätzlich: Änderungen am Bestand, Aufrufe, die Server oder Oberfläche blockieren, und ob README, Changelog und betroffene `CLAUDE.md` zur Änderung passen.
- Solo-Weg: Doku wird vor der eigenen Kontrolle nachgezogen, damit der Prüfer sie sieht, auch wenn die Aufgabe sie nicht erwähnt. Speichert der Server nach der Änderung Daten, obwohl `serverTemp` auf „ohne Daten“ steht, schlägt die Sitzung eine Variable für Wegwerf-Daten vor.

## [0.21.0 / Werkzeug 0.7.6] – 2026-10-22

### Geändert

- Gewichtete Tokens folgen den API-Preisen: Cache-Lesen zählt bei Sonnet 5.5 und Opus 5.5 0,05 statt 0,1, Cache-Schreiben mit 1 Stunde Laufzeit 2 statt 1,25. Die Laufzeit kommt je Agent aus seiner Agenten-Datei (Standard 5 Minuten) und für die Hauptsitzung aus der Meldung von Claude Code (ohne Meldung 1 Stunde, wie im Abo). Rollen rechnen aus ihren Agenten, je mit eigenem Modell. Ältere `costs.json` bleiben lesbar.
- README: Abschnitt „Was ‚gew.‘ bedeutet“ erklärt die gewichteten Tokens mit Faktoren und Beispiel.

## [0.20.5 / Werkzeug 0.7.5] – 2026-10-21

### Neu

- Solo-Weg: Die Sitzung darf Teile auch gleichzeitig an Handwerker abgeben, je in einem eigenen Worktree (`codecycle solo teil start <ordner> <name>`), und übernimmt sie nach kurzer Sichtung per Merge (`codecycle solo teil fertig <ordner> <name>`). Bei einem Merge-Konflikt bricht der Befehl ab, der Teil bleibt erhalten.

### Geändert

- Bauleiter und Solo-Sitzung arbeiten nach einem Leitsatz: das Ergebnis, das die Aufgabe am besten erfüllt, mit so wenig Tokens wie dafür nötig; sparen heißt nicht weglassen. Ob Agenten gleichzeitig arbeiten, entscheiden sie danach; als zu voll gilt die Sitzung, wenn die anstehende Arbeit sie über 500 000 Tokens brächte. Den Füllstand hängt der Mod an: nach `codecycle solo check` die Antwort von `codecycle_budget`, nach `codecycle check` in einer Sitzung mit Aufgabe die Zeile „Hauptsitzung“; eine eigene Abfrage ist nicht nötig.
- Neue Sitzung im Solo-Weg nur an einem Haltepunkt, nie mit laufendem Agenten oder offener Frage; im vollen Ablauf ebenso keine laufenden Agenten beim Wechsel.
- Entschiedene Randfälle bekommen den passenden Prüfweg (Oberfläche: Browser); Randfälle mit Bezug zum Wortlaut werden einzeln gefragt.

### Behoben

- `npm ci` oder `npm install` in einem Paket- oder Teil-Worktree konnte `node_modules` des Hauptordners leeren. Der Worktree bekommt jetzt einen eigenen Ordner `node_modules` mit einem Verweis je Paket und einem eigenen Ordner `.bin`; npm im Worktree (auch `npm uninstall`) löscht nur dort, Pakete und Programme des Hauptordners bleiben.
- Workspace-Pakete im Monorepo: Im Worktree zeigt der Verweis auf die Fassung im Worktree, nicht auf die im Hauptordner; Tests und Typen prüfen so den geänderten Stand.
- Hat npm im Worktree schon echt installiert, ergänzt ein erneuter Start fehlende Verweise und lässt Vorhandenes unverändert.
- `paket start` und `solo teil start` melden einen verschobenen oder gelöschten Worktree rot, statt grün zu melden oder mit einer irreführenden Git-Meldung abzubrechen; der Hinweis nennt `git worktree repair` bzw. `git worktree prune`.
- Die Zeile `Worktree:` der Startnachricht wird auch mit Markdown (`**Worktree:**`, Backticks) oder Text hinter dem Pfad richtig zugeordnet.
- `paket fertig` und `solo teil fertig` nennen uncommittete Dateien im Hauptordner, die der Merge ändern würde, statt einen Merge-Konflikt ohne Datei zu melden; ein Paket wird dabei nicht mehr auf „blockiert“ gesetzt. Ein verschobener Worktree-Ordner wird gemeldet statt übergangen.
- Pfade mit Leerzeichen in der Zeile `Worktree:` werden dem Agenten richtig zugeordnet.
- Die Hook-Sperre hält eine Projektdatei `git/config` nicht mehr für Git-Konfiguration und erkennt die Systemkonfiguration von Git für Windows und `XDG_CONFIG_HOME` auch in PowerShell- und cmd-Schreibweise; `git ls-files | xargs codecycle check` gilt nicht mehr als gesperrter Aufruf.

## [0.20.4 / Werkzeug 0.7.4] – 2026-10-21

### Geändert

- Randfälle werden am Anfang geklärt: Gutachter, Bauleiter und Solo-Sitzung leiten Sonderfälle aus Aufgabe und Code her (Grenzen, Umwandlungen, leere oder fehlende Zustände) und ergänzen sie aus einer Liste nach Bereichen. Im vollen Ablauf höchstens eine gebündelte Frage; entschiedene Randfälle werden Abnahmekriterien mit Test.
- Token-Buch: Die erste Antwort eines Agenten wird bei ihm gebucht, nicht mehr unter „fremd“.
- `codecycle effort --record` nennt die Rollen und ihre Läufe aus dem Token-Buch; die Zusammenfassung im Abschluss übernimmt nur diese.
- `codecycle commit-tests` committet rote Tests nur auf Paket-Branches; außerhalb davon nur mit `--ohne-paket` (nicht für den Test-Autor), auf dem Hauptbranch nie.
- Sperren gegen das Umgehen der Git-Hooks erkennen mehr Schreibweisen: unbekannte Git-Optionen vor `commit`, Schlüssel mit Anführungszeichen getarnt, Pfade mit `./` und `../`, `>|`, `--target-directory=`, die Git-Konfiguration von Benutzer und System. Agenten dürfen `git commit-tree` und `git update-ref` nicht aufrufen. Werkzeug-Befehle werden hinter jedem Starter erkannt (`npx`, `bun`, `deno`, `pnpm exec`, `xargs`).
- Paket-Worktrees bekommen einen Verweis auf `node_modules` des Hauptordners, damit Lint, Typprüfung und Tests dort wie im Hauptordner laufen. `codecycle paket fertig` entfernt nur den Verweis, nie den Inhalt.

## [0.20.3] – 2026-10-21

### Geändert

- `/codecycle:setup` fragt, was als Kennzeichnung durch Claude in Commits und PRs stehen soll: Urheberzeile und Sitzungslink (Standard von Claude Code), nur der Sitzungslink, oder nichts. Bisher schaltete Setup die Urheberzeilen ohne Frage ab.

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
