# Schritt 2: Planen

## Zweck
`PLAN.md` mit Entwurf, Paketen und Budget schreiben lassen (wenn `architect` im Rollen-Set steht). Klein hat diesen Schritt nicht; ohne Architekt schreibst du das eine Paket selbst vor der Auftragsfreigabe (`steps/1-clarify.md`, 1c, eine Freigabe) und machst hier nur Punkt 5.

## Voraussetzungen
- Zustand `geklaert`, `TASK.md` freigegeben.
- Bericht des Gutachters in `reports/`.
- Schalter: `multi-planner` (Punkt 3), `reuse-agents` (Punkt 1).

## Schritte
1. Hat der Architekt `PLAN.md` schon im selben Lauf geschrieben (`Plan direkt: ja`, 1c), weiter mit Punkt 4. Sonst Agenten-ID des Architekten aus Schritt 1c in `STATE.md`/Verlauf suchen. Erreichbar und Schalter `reuse-agents` an: per Nachricht „Weg X, jetzt `PLAN.md`“. Sonst frischer `codecycle:architect` mit `TASK.md` und Gutachter-Bericht (Berichtspfad nach der laufenden Nummer, z. B. `reports/03-architect.md`).
2. **Paketschnitt** (Regeln an den Architekten):
   0. **Ein Paket als Standard**, solange ein Bereich und höchstens etwa 8 Dateien; Routine und Logik dürfen zusammen. Teilen nur bei mehreren Bereichen, um einen Risikobereich getrennt zu halten oder bei sinnvoller Parallelarbeit.
   1. Was dieselben Dateien braucht, kommt in ein Paket.
   2. Kleinkram an ein benachbartes Paket anhängen.
   3. Höchstens etwa 8 Dateien pro Paket (Vorschlag), sonst nach Bereich teilen.
   4. Reihenfolge nach Abhängigkeit: Grundlagen, Aufrufer, Oberfläche.

   Jedes Paket: Rolle, Schwierigkeit, `Risiko: ja|nein` (berührt einen Risikobereich), Kriterien, getrennte Listen **Neu / Ändern / Tests** (Tests: auch bestehende Testdateien, die geändert werden; jede Testdatei steht in der Zeile „Tests:“ höchstens eines Logik-Pakets, sonst bekommt das zweite Paket eine eigene neue Testdatei), **Randfälle und Verbote** (aus dem Entwurf: Randfälle mit gewünschtem Verhalten, „darf nicht“-Vorgaben wie „kein Dateiinhalt in der Warnung“; gehen in den Testansatz), bei `doku=changelog` den Changelog-Eintrag in Ändern, **Fundstellen als Datei :: Symbol** (keine Zeilennummern), optional „Angeboten“, Testansatz, Abhängigkeit, „Parallel möglich mit“. Plan: Entscheidungen, kein Code. Budget einhalten oder begründen.

   **Verhalten absichern (P0):** Bei Art `refactoring` oder einer Änderung bestehenden Codes: Ist `codecycle tests-for` für Fundstellen leer (der Gutachter meldet die Testabdeckung), plant der Architekt als erstes ein Paket **P0 „Verhalten absichern“** (Rolle `test`, Test-Autor schreibt Tests gegen das **aktuelle** Verhalten, sie müssen grün sein; Fragwürdiges meldet er im Bericht, ändert es nicht). Alle anderen Pakete mit diesen Fundstellen hängen von P0 ab. **Negativ-Kriterien** aus `TASK.md` (Risikobereiche) bekommen ein Paket und einen Test.
3. **Mehrere Planer** (Schalter `multi-planner`, nur groß mit mindestens zwei getrennten Bereichen laut Gutachter; aus: der Architekt plant allein): Architekt schneidet Bereiche und legt Schnittstellen im Entwurf fest; pro Bereich ein `codecycle:area-architect` parallel (versetzt starten, Pfad des Bereichsteils nennst du in der Startnachricht) nur mit den Fundstellen seines Bereichs; der Architekt führt zusammen (Dateilisten ohne Überschneidung, Schnittstellen passen). Zählt mit im Budget.
4. Neue offene Entscheidungen stehen in `PLAN.md` unter „Offene Entscheidungen“: einzeln mit dem Nutzer klären, in `TASK.md` unter „Entscheidungen“ eintragen, mit der Antwort des Nutzers im Wortlaut (ohne eigene Wahl: „Empfehlung übernommen: …“).
5. Neu rechnen: `codecycle effort <aufgabenordner> --set pakete=<n> --set risikoPakete=<n> --set dokuImPaket=ja|nein` (Pakete mit `Risiko: ja` oder Schnittstellenänderung; `dokuImPaket=ja`, wenn ein Paket die Doku bei `doku=mehr` vollständig schreibt: README, `CLAUDE.md` nach Doku-Aufbau, Beispiele, Changelog; dann entfällt der Doku-Pfleger). `STATE.md`: `pakete` aus dem Plan eintragen (alle `offen`, `agent: null`, `commit: null`, `runden: 0`), `budget.geplant` = Läufe laut Ausgabe plus Rollen, die schon gelaufen sind und nicht mehr im Set stehen (nie unter `verbraucht`); gestrichene Rollen mit Grund in `PLAN.md` unter Budget.
6. **nicht groß:** Paketübersicht und Ausgabe von `codecycle effort` (Rollen mit Grund, Läufe) zeigen; der Nutzer darf streichen (`--drop`, Schutzrollen nur mit `--confirm-risk`), **Freigabe**, `STATE.md` auf `geplant`, Commit. **groß:** hier noch keine Freigabe, erst Schritt 3.

## Ergebnis
`PLAN.md` mit Paketen und Budget; `STATE.md` mit allen Paketen auf `offen` (nicht groß: Zustand `geplant` nach Freigabe).

## Nächster Schritt
Groß: `steps/3-plan-review.md`. Sonst: neue Sitzung empfehlen (`/codecycle:continue`), danach `steps/4-build.md`.
