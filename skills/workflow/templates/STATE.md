---
aufgabe: <thema>
art: feature            # feature | bugfix | refactoring | routine | review
groesse: mittel         # klein | mittel | gross
zustand: erfasst        # erfasst | geklaert | geplant | in-arbeit | geprueft | fertig | verworfen | blockiert
branch: codecycle/<thema>
weg: voll               # voll | solo; nur solo: haltepunkt (1–6), geprueftAuf (schreibt codecycle solo check)
budget: { geplant: 0, verbraucht: 0, nachlauf: 0 }
planrunden: 0           # Planänderungen mit erneuter Prüfung, Grenze 2
zuletzt: <JJJJ-MM-TT>
pakete:
  - id: P1
    rolle: logik        # logik | routine | test (P0 Verhalten absichern)
    status: offen       # offen | in-arbeit | fertig | blockiert
    agent: null
    commit: null
    runden: 0
---

## Nächster Schritt
Klären (Schritt 1).

## Offene Fragen
Annahmen der Agenten (Schalter `assume-and-continue`) stehen hier, markiert „ANNAHME“, mit Paket und Datum.
- keine

## Blocker
- keine

## Verlauf
Entscheidungen mit der Antwort des Nutzers im Wortlaut: „Entscheidung: … · Nutzer: „…““; ohne eigene Wahl „Empfehlung übernommen (Nutzer: „…“)“.
- <JJJJ-MM-TT> erfasst (<Größe>)
