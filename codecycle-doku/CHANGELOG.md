# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [0.2.0] – unveröffentlicht

### Neu

- Privater Ordner `.codecycle-doku/` für Erzeugtes und Vorläufiges: jede Einrichtung trägt ihn in `.gitignore` ein, er hat eine eigene `.gitignore` mit `*` und entsteht nur mit `.claude/doku.json`; der Prüfer lässt ihn aus und meldet Links aus der Doku dorthin scharf.
- Anpassungen in `.claude/doku.json`: `pruefung` schaltet Regeln ab (`aus`) oder schwächt sie zum Hinweis (`hinweis`); `version` nennt den Stand der erzeugten Dateien. Jeder erneute Aufruf und `--nachtragen` übernehmen Anpassungen und unbekannte Schlüssel unverändert.
- Andocken: Eine Sammlung mit eigenem Schema bleibt, wie sie ist (ihre Anleitung kommt als Regeldatei `.claude/rules/codecycle-doku-<art>.md` mit `paths`, nicht in den Ordner); `schemata.<art>` in `.claude/doku.json` beschreibt Pflichtfelder, Statuswerte (je `offen` oder `erledigt`), Abschluss-Werte, Abschnitte und ob die Übersicht eigen ist. Prüfer, Übersicht und Anleitung je Ordner richten sich danach.
- Überführen als Angebot: `ueberfuehren:<art>` schreibt die Einträge mit Kopf im Schema des Plugins als Probe nach `.codecycle-doku/probe/`, mit Zählung und Beispielen in `UEBERFUEHREN.md`.
- Der Erkunder erkennt Sammlungen mit eigenem Schema und schlägt ein Schema vor; sein Bericht bleibt als `.codecycle-doku/erkundung.md` (`--erkundung -`) und geht beim nächsten Erkunden mit.
- Probe-Fassungen: `/codecycle-doku:probe` und die Einrichtung lassen den Agenten `verfasser` eine Fassung von README, `CLAUDE.md` oder `ARCHITECTURE.md` mit Änderungsliste schreiben; `--probe` legt sie nach `.codecycle-doku/probe/`, `uebernehmen:<pfad>` übernimmt sie und sichert die alte Fassung nach `.codecycle-doku/sicherung/`.
- Veraltete Karte, Schreibregeln und Anleitungen kommen beim erneuten Aufruf als Probe mit Änderungsliste, statt ersetzt zu werden; `version` folgt, wenn keine mehr veraltet ist.
- Baustein Architektur: in Projekten mit Code (Manifest oder Quelldateien) Teil der Grundausstattung, `ARCHITECTURE.md` mit Überblick, Einstiegspunkten, Codemap, Grenzen und Invarianten, Querschnitt und Entscheidungen; im leeren Projekt nach Frage als Gerüst, sonst als Probe des Verfassers. Der Prüfer meldet Pfade der Codemap, die es nicht gibt; die Karte erinnert ans Nachziehen.
- Status-Seite `.codecycle-doku/status.html` (mit `status.json`): auf einen Blick, Aufbau der Doku, was wartet, wichtige offene Einträge; ohne Netz und Skripte. Gebaut nach jedem schreibenden Lauf, jedem vollen Prüferlauf, am Ende einer Antwort mit geändertem Markdown und mit `codecycle-doku-pruefer --status`.
- Start-Hook: gibt Claude genau eine Zeile, wenn etwas wartet (gebrochener Verweis, Probe, Update, toter Link, Codemap, Wegweiser), sonst nichts; nur Dateizugriffe. Stop-Hook baut die Status-Seite nur nach geschriebenem Markdown.
- Der erzeugte Wegweiser verlinkt seine Orte.
- Wegweiser: Dateien und Ordner direkt in seinem Ordner, die er nicht verlinkt, ergeben einen Hinweis.
- Karte, Schreibregeln und Anleitungen je Ordner tragen eine Kopfzeile „Erzeugt aus .claude/doku.json“. Nach dem Update gelten sie in eingerichteten Projekten als veraltet.

### Geändert

- Scharf sind nur tote Links und Sprungmarken, Links nach `.codecycle-doku/` und Kopf-Fehler in neuen oder geänderten Einträgen (Hook: die geschriebene Datei; genannte Dateien; voller Lauf: was `git status` nennt). Kopf-Fehler im Altbestand, Lücken im Inhaltsverzeichnis und unbekannte Arten sind Hinweise.

### Behoben

- `.claude/doku.json`, Karte und Start-Hook nennen nur Orte, die es gibt, die angelegt werden oder ausdrücklich genannt sind; ein nie angelegter Ort meldet keinen gebrochenen Verweis.
- Abgelehnte Probe-Fassungen lassen sich mit `verwerfen:<pfad>` entfernen.
- `doku-ok` in der Zeile nimmt auch einen toten Link aus (nicht Links nach `.codecycle-doku/`).
- Überführung und Probe der Anleitung im selben Ordner stören sich nicht; `.claude/doku.json` kommt nie als Probe; ein verschriebener Blockkopf bricht `--probe` ab.
- Der volle Prüferlauf lässt `.codecycle-doku/` in jeder Tiefe, `.claude/worktrees/` und verschachtelte Repos aus; eine unlesbare `.claude/doku.json` ergibt eine Meldung statt eines Absturzes, im Start-Hook eine Zeile.
- Eine leere Codemap (Gerüst) meldet keine fehlenden Ordner; die Karte beschreibt eine eigene Übersicht richtig; unter Windows erkennt der Prüfer Einträge auch bei anderer Groß- und Kleinschreibung des Ordners.
- Eine eigene `README.md` in einem Festhalten-Ordner (ohne Erkennungszeichen der erzeugten Übersicht) wird von Hook, `uebersicht.mjs` und Einrichtung nicht mehr überschrieben; der Hook meldet „eigene Übersicht, nicht erneuert“.

## [0.1.0] – unveröffentlicht

### Neu

- Gerüst des Plugins.
- Prüfer für die Doku eines Projekts: Arten je Pfad, Textregeln (Herkunft, Datum, Zeitwörter, Versionsnummern, Länge), tote Links, Inhaltsverzeichnis; prüft die Felder von Ideen, Bugs und To-dos (`status`, `wichtigkeit`, `ergebnis`, `erledigt-durch`, `bezug`).
- Erzeugte Übersicht je Festhalten-Ordner: offen vor erledigt, wichtig vor normal, Gruppen verknüpfter Einträge, auf Wunsch als Mermaid-Diagramm.
- Hook nach jedem Schreiben: meldet Treffer der geschriebenen Datei und erneuert die Übersicht; ohne `.claude/doku.json` still.
- `/codecycle-doku:einrichten`: erkundet vorhandene Doku, fragt nach Bausteinen, Ablage, Verschieben und Überarbeiten und legt nur an, was zugestimmt ist; im leeren Projekt zwei Fragen, dann die Grundausstattung; ein erneuter Aufruf zeigt, was fehlt.
- Gerüste für README, `CLAUDE.md`, Changelog, Chronik, Entscheidungen, Wegweiser, Berichte und Prompts; Karte „was wohin“ und Regeldatei mit Arten und Schreibregeln unter `.claude/rules/`; Anleitung mit Kopf und Abschnitten je Festhalten-Ordner.
- Erkennt das Schema eines vorhandenen Changelogs (Keep a Changelog, erzeugt, eigenes); ein erzeugter Changelog wird nie geändert.
- Starter `codecycle-doku-pruefer` in `bin/`: ruft den Prüfer ohne Pfad auf, solange das Plugin aktiv ist (etwa aus anderen Plugins oder Agenten); Argumente, Ausgabe und Exit-Code wie beim Prüfer.
- Starter `codecycle-doku-einrichten` in `bin/` und `--nachtragen <art>`: legt einen fehlenden Festhalten-Ort ohne Fragen an, mit der vorhandenen `.claude/doku.json` als Ausgangswert; ohne `.claude/doku.json` Exit 3, nichts geschrieben.
- Die Einrichtung verschiebt nur einzelne Dateien; ein Ordner wird abgelehnt, damit Links auf Dateien darin nicht brechen.
- Als leer gilt ein Projekt nur, wenn es außer `.git`, `.gitignore`, `.gitattributes` und `.claude/settings.local.json` nichts enthält; jede andere Datei (auch `README.rst` oder Code) führt erst durch das Erkunden.
- Hook und Übersicht schreiben nie in den Git-Ordner, auch wenn ein Festhalten-Ort dorthin zeigt.
- Der Prüfer bricht bei einer ungültig kodierten Sprungmarke (etwa `#100%`) nicht mehr ab.
- `bezug` darf auch als Blockliste (Zeilen `- name` darunter) stehen.
- Eigene Lizenzdatei (MIT).
- README für Nutzer: Einrichten, Arten, Felder und Ergebniswerte der Einträge, Prüfer, Hook, Starter, Abschalten.
