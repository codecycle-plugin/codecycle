# <Thema>

## Wortlaut
> <Beschreibung des Nutzers unverändert, `> ` vor jeder Zeile.>

<!-- Nie bearbeiten. Nachträge des Nutzers beim Klären nur anhängen, als Zitat mit Datum (`> <JJJJ-MM-TT>: …`), nie umformulieren. Kommt der Auftrag aus dem Brainstorming: oben die Worte des Nutzers aus dem Gespräch, darunter der freigegebene Entwurf als `> Entwurf, freigegeben am <JJJJ-MM-TT>: …`. Maßstab für Plan-Prüfer und Abschlussprüfung. -->

## Ziel
<Zusammenfassung in 1–3 Sätzen.>

## Erfolgskriterium
Fertig, wenn <…>.

## Nicht-Ziele
- <was ausdrücklich nicht dazugehört>

## Gewählter Lösungsweg
<Weg, gewählt am <JJJJ-MM-TT>. Begründung in 1–2 Sätzen. Bei klein: entfällt.>

## Entscheidungen
| Frage | Entscheidung | Nutzer (Wortlaut) | Datum |
|---|---|---|---|
| <Frage> | <Entscheidung> | „<Antwort des Nutzers>“ | <JJJJ-MM-TT> |
| <Frage> | Empfehlung übernommen: <Standard> | „<z. B. nimm deine Empfehlung>“ | <JJJJ-MM-TT> |

## Abnahmekriterien
| ID | Kriterium | Prüfweg |
|---|---|---|
| K1 | <beobachtbares Ergebnis; bei „vorhanden/fehlt“ auch „leer“ nennen> | Test |
| K2 | <…> | Browser |

**Vorhanden, fehlt, leer:** Hängt ein Kriterium davon ab, ob etwas vorhanden ist oder fehlt (Datei, Feld, Liste, Eingabe), nennt es auch den Fall „leer“ (vorhanden, aber ohne Inhalt) mit gewünschtem Verhalten, z. B. `| K4 | Leere Datei: Warnung wie bei fehlender Datei, kein Absturz | Test |`.

**Risikobereich:** Berührt die Aufgabe einen Risikobereich aus `.claude/codecycle.md`, steht hier mindestens ein Kriterium „darf nicht möglich sein“ (Negativ-Kriterium), z. B. `| K3 | Fremde Gruppe erhält 404 (darf nicht möglich sein: Zugriff auf fremde Liste) | Test |`. Der Plan-Prüfer prüft das.

Prüfwege: `Test`, `Befehl <…>`, `Browser` (Browser-Prüfer; früher `TÜV`, wird weiter erkannt), `Sichtprüfung`, sonst „nicht prüfbar“ (dann liefert der Plan pro Paket eine manuelle Prüfanleitung). Bugfix: K1 ist der rote Reproduktionstest.

## Änderungen
Nach der Freigabe nur hier ergänzen (Datum, was, warum).
- keine

## Kurzplan
<Nur Solo-Weg: 3–10 Zeilen, Dateien, Vorgehen, Prüfweg.>

## Eingabeformate
<Nur Solo-Weg: je Eingabe die Schreibweisen, die Nutzer dieser Aufgabe realistisch eingeben, z. B. `- Menge: 1.000 g, 1 000 g, 1,5 kg, 1 ½ cups, 2 EL.`; ohne Eingaben „keine“.>
- keine

## Annahmen
<Nur Solo-Weg: je still entschiedenem Punkt eine Zeile `- <Annahme> (Grund)`.>
- keine

## Funde
<Nur Solo-Weg: je Fund aus `reports/pruefung.md` (und `reports/pruefung-sicherheit.md`, Funde `Z1` …) eine Zeile `- M1: behoben (<commit>)`, `- M2: verworfen: <Grund>` oder `- M3: offen: Frage an den Nutzer`.>
- keine
