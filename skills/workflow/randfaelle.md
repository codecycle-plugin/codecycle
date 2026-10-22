# Randfälle am Anfang klären

Gilt beim Klären (voller Ablauf) und im Kurzplan (Solo-Weg). Ziel: Sonderfälle entscheiden, bevor gebaut wird, nicht erst beim Prüfen.

## Stufe 1: aus der Aufgabe herleiten (immer)

- **Grenzen:** Jede Grenze im Wortlaut („ab“, „bis“, „höchstens“, „nur wenn“) und jede Bedingung an den Fundstellen im Code (`if`, Schwellen, Konstanten, Fallunterscheidungen): genau auf der Grenze, knapp darunter, knapp darüber.
- **Umwandlungen:** Jede Umwandlung (Einheit, Format, Typ, Sprache, Zeitzone): Was geht dabei verloren (Runden auf 0, Runden über eine Grenze, Reihenfolge von Runden und Wechsel)? Gilt sie in beide Richtungen?
- **Zustände:** Jeder Zustand, den die Aufgabe anfasst (Datei, Datensatz, Sitzung, Auftrag): gibt es nicht, leer, schon vorhanden.
- **Bestand:** Bestehende Meldungen, Formate, Schnittstellen und Seiten, die die Aufgabe berührt, bleiben wörtlich gleich. Jede Änderung daran, die der Wortlaut nicht ausdrücklich verlangt, ist eine Abweichung und kommt als Frage zum Nutzer.

## Stufe 2: Liste nach Bereichen (nur was zur Aufgabe passt)

| Bereich | Randfälle |
|---|---|
| Zahlen und Mengen | Schwellen; Runden auf 0 oder über eine Grenze; negativ; sehr groß |
| Text und Eingaben | leer, nur Leerzeichen; sehr lang; Schreibweisen; Sonderzeichen, Umlaute, Emoji; Zeilenenden; ungültig: melden, übergehen oder unverändert lassen? |
| Zeit und Datum | Monatsende, Schaltjahr, Jahreswechsel; Zeitzone, Sommerzeit; kurz nach Mitternacht; Datum in der Vergangenheit |
| Abläufe und Zustand | doppelt ausgelöst; Abbruch mittendrin; zwei gleichzeitig; Wiederholung nach einem Fehler; falsche Reihenfolge; ein Aufruf blockiert Server oder Oberfläche (synchrone Krypto, große Datei, lange Schleife) |
| Zugriff und Daten | nicht angemeldet; fremde Daten; keine Rechte; alte Daten aus einer früheren Version |
| Umgebung | Datei oder Ordner fehlt; Netz weg; anderes Betriebssystem (Pfade, Zeilenenden); leere oder alte Konfiguration |
| Oberfläche | schmale Breite, lange Wörter; nur Tastatur; sehr viele Einträge; leere Liste |

## Ergebnis

- Je Randfall, den Wortlaut und Code nicht schon eindeutig regeln, ein Standard mit Grund in einem Satz. Was eindeutig geregelt ist oder nicht passt, entfällt ohne Erwähnung.
- **Voller Ablauf:** Der Bauleiter fragt höchstens **eine** gebündelte Frage mit bis zu drei Randfällen (die, an denen am meisten hängt); die übrigen stehen als übernommene Standards unter „Entscheidungen“ in `TASK.md`. Ein Randfall mit Markierung `Wortlaut:` wird einzeln gefragt (mit Zitat und Standard) und zählt nicht zu den drei.
- Jeder entschiedene Randfall wird ein Abnahmekriterium mit passendem Prüfweg: meist `Test`, bei Oberfläche (Breite, Tastatur, Darstellung) `Browser`.
- **Solo-Weg:** Jeder Randfall wird eine Zeile unter „Annahmen“ (`- <Randfall>: <Standard> (Grund)`); keine Frage, außer der Wortlaut lässt eine Lücke, an der viel hängt (dann gebündelt mit den übrigen Fragen).
