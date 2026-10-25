---
paths: ["**/*.md"]
---

# Doku schreiben

Jede Doku-Datei hat eine Art; die Art bestimmt, was hinein darf. Gegenwart und Geschichte trennen: Anweisung und Nachschlagen sagen, was gilt; woher es kommt, steht in Entscheidung oder Chronik.

| Art | Pfade in diesem Projekt | Was gilt |
|---|---|---|
{{arten}}

## Schreibregeln

1. **Zeitlos schreiben.** In Anweisung und Nachschlagen keine Wörter wie „jetzt“, „bisher“, „noch nicht“, „inzwischen“ und kein „seit“ mit Version oder Datum. <!-- doku-ok -->
2. **Herkunft nicht erzählen.** Woher eine Regel stammt, steht in Entscheidung oder Chronik, nicht in der Regel.
3. **Ändern statt anhängen.** Veraltete Sätze in Anweisung und Nachschlagen ersetzen oder löschen.
4. **Kurze Punkte.** Ein Punkt, eine Aussage; Anweisungsdateien unter 200 Zeilen.
5. **Keine Versionsnummern in Anweisungen.** Die Version steht nur in der Datei, die sie festlegt.
6. **Kein Zustand in Anweisungen.** Offenes, nächste Schritte und Halbfertiges werden ein Eintrag zum Festhalten.
7. **Entscheidungen im Wortlaut nur in der Art Entscheidung.** Anderswo steht die Regel.
8. **Links lösen auf.** Relative Links und Sprungmarken zeigen auf Vorhandenes; eine `README.md` über 100 Zeilen hat oben eine Zeile „Inhalt:“ mit Links auf alle Überschriften `##`.
9. **Art einer neuen Datei klären.** Passt der Pfad zu keiner Zeile der Tabelle, in die ersten fünf Zeilen einen HTML-Kommentar `doku: <art>` schreiben.
10. **Fehlalarm** eines Hinweises: `doku-ok` als HTML-Kommentar in die Zeile.

## Prüfen

Nach jedem Schreiben meldet ein Hook die Treffer der geschriebenen Datei. Scharfe Treffer (Felder eines Eintrags, tote Links, Lücken im Inhaltsverzeichnis) immer beheben, Hinweise nach Prüfung.
