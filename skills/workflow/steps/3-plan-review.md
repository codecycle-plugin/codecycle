# Schritt 3: Plan prüfen

## Zweck
Den Plan gegen die Prüfliste prüfen lassen (nur groß), dann die Freigabe einholen.

## Voraussetzungen
- Zustand `geklaert`, `PLAN.md` geschrieben (Schritt 2), Größe `gross`.
- Schalter: `plan-html` (Punkt 3), `multi-planner` (Prüfpunkt 10).

## Schritte
1. `codecycle:plan-reviewer` starten (nur lesen; Berichtspfad `reports/<nr>-plan-reviewer.md`). Prüfliste, die er abarbeitet:
   1. Jedes Kriterium durch mindestens ein Paket abgedeckt?
   2. Keine Platzhalter („TODO“, „später“, „etc.“)?
   3. Dateien parallel markierter Pakete getrennt?
   4. Jedes Paket mit Testansatz oder Prüfweg?
   5. Budget: Läufe laut `codecycle effort` (Rollen-Set); jede Rolle darüber begründet? (Nachrichten an vorhandene Agenten zählen nicht.)
   6. Plan passt zum Gutachter-Bericht (keine erfundenen Dateien oder Funktionen)?
   7. Paketschnitt nach Bereichen?
   8. Konkrete Fundstellen als Datei :: Symbol, auflösbar (`codecycle locate`)?
   9. Neu / Ändern / Tests pro Paket vollständig getrennt?
   10. Bei mehreren Planern: Schnittstellen zwischen Bereichen passen zusammen?
   11. Risikobereich berührt: gibt es in `TASK.md` mindestens ein Negativ-Kriterium („darf nicht möglich sein“), und ist es durch ein Paket und einen Test gedeckt? (Kein zusätzlicher Stopp: fehlt es, ist das ein Mangel für den Architekten.)
   12. Änderungs- oder Refactoring-Aufgabe mit Fundstellen ohne Tests (`codecycle tests-for` leer): gibt es ein Paket P0 „Verhalten absichern“?
2. Mängel (Bericht des Plan-Prüfers lesen): Funde per Nachricht an **denselben Architekten** (Schalter `reuse-agents`; aus: frischer Architekt), eine Runde. Danach nicht erneut prüfen lassen, außer der Nutzer will es.
3. Dem Nutzer Paketübersicht und Budget im Chat zeigen, dazu die Ausgabe von `codecycle effort` (Rollen mit Grund, Läufe; streichen mit `--drop`, Schutzrollen nur mit `--confirm-risk`). Wenn der Schalter `plan-html` an ist (Standard aus): `codecycle plan-html <aufgabenordner>` ausführen und dem Nutzer den Pfad zur `plan.html` nennen (zusätzlich zur Übersicht im Chat). Die Seite entsteht aus `PLAN.md`, `TASK.md` und `STATE.md` (die beiden letzten sind optional); Exit 1 heißt, `PLAN.md` fehlt oder ist nicht lesbar: dann nur die Übersicht im Chat zeigen und den Mangel melden.
4. **Freigabe.** `STATE.md` auf `geplant`, Commit.

## Ergebnis
Geprüfter und freigegebener Plan; `STATE.md` auf `geplant`.

## Nächster Schritt
Neue Sitzung empfehlen (`/codecycle:continue`), danach `steps/4-build.md`.
