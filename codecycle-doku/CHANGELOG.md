# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

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
