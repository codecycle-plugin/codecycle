# Schritt: Plan ändern

## Zweck
Den Plan mitten in der Umsetzung ändern, ohne erledigte Pakete umzuschreiben.

## Voraussetzungen
- Auslöser: Wunsch des Nutzers („Plan ändern: P5 soll zusätzlich …“), Abgleich nach einem Paket (`4-build.md`, Punkt 6), Prüfer- oder Abnahme-Fund, der den **Plan** betrifft, Meldung eines Handwerkers („Plan stimmt so nicht“).
- Schalter: `reuse-agents` (Architekt per Nachricht; aus: frischer `codecycle:architect`), `multi-planner` (bei neuen Bereichen).

## Schritte
1. **Laufendes Paket sauber beenden oder pausieren**, nie mitten in einer Änderung umplanen.
2. **Erledigte Pakete werden nie umgeschrieben.** Was an ihnen falsch ist, wird ein neues **Korrekturpaket** (neue ID, z. B. P7, Vermerk „Korrektur zu P2“).
3. **Folgenprüfung:** Berührt die Änderung andere offene Pakete? Braucht sie etwas, das ein früheres Paket liefern muss?

   | Fall | Vorgehen | Agent? |
   |---|---|---|
   | Späteres Paket ändert sich nur inhaltlich | Text des Pakets anpassen | nein |
   | Setzt etwas aus einem anderen offenen Paket voraus | beide Pakete anpassen, ggf. Reihenfolge/Abhängigkeit | Architekt per Nachricht, kurze Folgenprüfung |
   | Neue Anforderung, neue Codebereiche | neues Paket einfügen | Gutachter nur für diesen Bereich, dann Architekt |
   | Erledigtes Paket betroffen | Korrekturpaket anlegen | Architekt per Nachricht |
   | Ziel ändert sich grundlegend | offene Pakete neu planen, `TASK.md` ändern (Abschnitt „Änderungen“) | Architekt; erneute Freigabe |

4. **Protokoll:** Eintrag im „Änderungsprotokoll“ von `PLAN.md` und im Verlauf von `STATE.md` (Datum, was, warum, betroffene Pakete). Neue Pakete in `STATE.md` unter `pakete` eintragen (Blockstil der Vorlage), Budget prüfen.
5. **Erneute Prüfung** (groß: `codecycle:plan-reviewer`, sonst Architekt) erhöht `planrunden` in `STATE.md`. **Ab 2 Runden den Nutzer fragen**, bevor weiter umgeplant wird. Bei grundlegender Zieländerung: Freigabe des Nutzers.
6. Commit.

## Ergebnis
`PLAN.md` und `STATE.md` stimmen mit den Commits überein; Änderungsprotokoll und Verlauf sind ergänzt, `planrunden` ist aktuell.

## Nächster Schritt
Das nächste offene Paket (`steps/4-build.md`).
