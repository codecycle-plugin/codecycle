# <Thema>

## Ziel
<Zweck in 1–3 Sätzen. Bei Neuanlage: Beschreibung des Nutzers wörtlich.>

## Erfolgskriterium
Fertig, wenn <…>.

## Nicht-Ziele
- <was ausdrücklich nicht dazugehört>

## Gewählter Lösungsweg
<Weg, gewählt am <JJJJ-MM-TT>. Begründung in 1–2 Sätzen. Bei klein: entfällt.>

## Entscheidungen
| Frage | Entscheidung | Datum |
|---|---|---|
| <Frage> | <Entscheidung> | <JJJJ-MM-TT> |

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
