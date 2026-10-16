# Schritt 6: Abnahme

## Zweck
Den Gesamtstand gegen alle Kriterien prüfen: volle Suite, Browser-Prüfer, Abnahme.

## Voraussetzungen
- Alle Pakete `fertig`, alles im Aufgaben-Branch.
- Schalter: `half-blind` (Punkt 3), `reuse-agents` (Punkt 4), `graph` (vergessene Aufrufer).
- Für den Browser-Prüfer laut `.claude/codecycle.md`: Oberfläche, Start (`codecycle server`), Test-Zugang; dazu ein Browser-Werkzeug (unbestätigt). Server und Wegwerf-Datei: Der Browser-Prüfer startet und beendet den Server selbst über `codecycle server --temp`; das setzt `serverTemp` in `.codecycle/tool.config.json` voraus (Umgebungsvariable der Datendatei des Projekts) und einen Serverbefehl (`commands.server`). **Rückfall A:** fehlt `serverTemp` oder der Serverbefehl, startest du (Bauleiter) den Server vor dem Lauf selbst mit einer Wegwerf-Datei, nennst Adresse und Datei in der Startnachricht des Browser-Prüfers und beendest den Server danach; Schritte „Server aus/an“ macht er dann auf Zuruf.

## Schritte
1. **Volle Suite** auf dem Aufgaben-Branch: `codecycle check --full`. Rot: Fund an den zuständigen Handwerker (falls erreichbar) oder neues kleines Korrekturpaket (`steps/plan-change.md`, Fall „Erledigtes Paket betroffen“).
2. **Browser-Prüfer:** Gibt es Kriterien mit Prüfweg `Browser` (in älteren Aufgaben `TÜV`), startet ein `codecycle:browser-reviewer` **einen** Durchlauf über alle (Berichtspfad `reports/<nr>-browser-reviewer.md`). Klein: nur wenn die Oberfläche betroffen ist; sonst entfällt er. Er prüft nur und ändert keinen Code. **Port:** Er läuft erst nach `codecycle check --full` und nach Abnahme bzw. Abschlussprüfung (Punkt 3), nie gleichzeitig mit Testläufen: ein laufender Server kann einen Port belegen, den Tests brauchen, und die Zahl der übersprungenen Tests ändern. Danach `codecycle server --stop` (er beendet ihn selbst; prüfe es, im Rückfall A ist es deine Aufgabe). Meldet er `blockiert: Zaun – <was fehlt>`, schreibe in `STATE.md` unter Verlauf den Hinweis „Zaun“ mit dem, was fehlte, und löse es (`serverTemp` eintragen lassen, Rückfall A) statt den Server gegen echte Daten zu starten. Du liest die Funde; Reparatur per Nachricht an den Handwerker (Punkt 4), danach Nachprüfung per Nachricht an denselben Browser-Prüfer.
3. **Abschlussprüfung statt Abnahme** (steht `acceptance` nicht im Rollen-Set, nicht klein): `codecycle:reviewer` im Aufgabenmodus, Startnachricht mit `Paket: alle`, Berichtspfad `reports/<nr>-reviewer.md`. Der Mod hängt den Gesamtdiff (Hauptbranch bis Aufgaben-Branch) an; ohne Mod gibst du ihn mit (`git diff <Hauptbranch>...codecycle/<thema>`). Der Prüfer hakt alle Kriterien aus `TASK.md` mit Beleg ab und macht dazu die Prüfungen je Paket (Prüfhinweise, geänderte Tests, vergessene Aufrufer) sowie Aufräumen und die Liste „Bitte gezielt ansehen“ wie die Abnahme. Hat der Plan **ein Paket mit Risiko oder Schnittstelle** (auch neben einfachen Paketen, `risikoPakete` = 1), ist dieser eine Lauf Paketprüfung und Abnahme zugleich (`5-review.md` entfiel): er prüft alle Pakete wie der Prüfer je Paket und alle Kriterien; bei Risiko enthält die Startnachricht die Zeile `Sicherheitsprüfung: ja` (Sicherheitsprüfliste im Prüfer, eigener Sicherheitsprüfer nur bei Meldung oder `unumkehrbar`; `5-review.md` Punkt 3). Er ist dann die Schutzrolle. Bei `dokuImPaket=ja` gleicht er README und Doku mit dem Verhalten ab. Bei `rot` wie Punkt 4.
   **Abnahme** (steht `acceptance` im Rollen-Set: mindestens 2 Pakete mit Risiko oder Schnittstelle): `codecycle:acceptance` bekommt Gesamtdiff, `TASK.md` und alle Kriterien, halbblind wie der Prüfer (Schalter `half-blind`; aus: auch die Begründungen). Zusätzlich: **vergessene Aufrufer** (geänderte Signaturen gegen alle Aufrufer über den Graphen) und **Aufräumen** (Debug-Ausgaben, auskommentierter Code, TODOs aus der Umsetzung). Klein: entfällt, Tests und Quittung genügen. Du liest die Funde. Die Abnahme liefert außerdem unter „Offene Punkte“ die Liste **„Bitte gezielt ansehen“** (Pakete in Risikobereichen, ihre Dateien, Tests zu den Negativ-Kriterien); du übernimmst sie für Schritt 7.
4. Funde: per Nachricht an den zuständigen Handwerker (falls noch erreichbar, Schalter `reuse-agents`), sonst neues kleines Paket (Korrekturpaket, `plan-change.md`); danach betroffene Prüfungen wiederholen.
5. Sind alle Kriterien erfüllt (oder ausdrücklich „nicht prüfbar“ mit manueller Anleitung): `STATE.md` auf `geprueft`, Commit.

## Ergebnis
Alle Kriterien belegt; `STATE.md` auf `geprueft`.

## Nächster Schritt
Neue Sitzung empfehlen (`/codecycle:continue`), danach `steps/7-finish.md`.
