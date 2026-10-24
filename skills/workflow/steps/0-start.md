# Schritt 0: Start

## Zweck
Die Aufgabe anlegen: Check, Profil, Art und Merkmale, Weg, Konfliktcheck, Ordner, Dateien, Branch. Bauleiter, ohne Agent.

## Voraussetzungen
- Beschreibung des Nutzers (aus `/codecycle:new`).
- `.claude/codecycle.md` vorhanden; sonst zuerst `/codecycle:setup`.
- Schalter: `conflict-check` (Punkt 4), `graph` (Check in Punkt 1).

## Schritte
1. **Check am Anfang:** `codecycle selftest`. Prüft: Projekt eingerichtet (`.claude/codecycle.md`)? Git, Node, uv? Graph (code-review-graph oder CodeGraph, laut `graph.provider`) vorhanden und aktuell? Git-Hooks eingerichtet? Werkzeug-Kopie in der Version des Plugins (sonst `/codecycle:update` anbieten)? Fehlt `.claude/codecycle.md`: zuerst Einrichtung (`/codecycle:setup`). Fehlt etwas anderes: Nutzer fragen (vorn ist das erlaubt), ob nachinstalliert werden soll, dann Schritt für Schritt. Ein fehlender Graph ist nur ein Hinweis (Rückfall Outline und Suche). Exit 2: `codecycle:toolsmith` starten, Änderung vom Nutzer freigeben lassen.
2. **Profil** feststellen (Mod: Mod-Speicher; sonst `~/.claude/codecycle/profile.json`, Format `{ "profil": "sparsam" }`; beim ersten Mal fragen und speichern, sonst eine Zeile bestätigen).
3. **Art und Merkmale** bestimmen (ohne Code, Liste „Größe und Aufwand“ im Workflow-Skill): `art` (feature | bugfix | refactoring | routine | review), `dateien`, `risiko`, `schnittstelle`, `struktur`, `unumkehrbar`, `logik`, `oberflaeche`, `doku`. **`doku`** hat drei Werte: `nein` (keine Doku), `changelog` (nur ein Changelog-Eintrag; der Handwerker schreibt ihn im Paket, du prüfst ihn beim Abschluss), `mehr` (README, `CLAUDE.md`, Architektur-Doku, Doku über mehrere Pakete, oder Doku, die kein Handwerker im Paket führt; nur dann läuft der Doku-Pfleger). Die Größe bestimmst du nicht selbst; sie kommt in Punkt 7 aus `codecycle effort`.
3a. **Weg vorschlagen** (eine Frage, bevor du etwas anlegst; nennt die Beschreibung den Weg schon, keine Frage):
   - **Voller Ablauf** nur bei `unumkehrbar` (Datenmigration, Löschen, Veröffentlichen, Zahlungen).
   - **Sonst Solo-Weg**, auch bei Risikobereichen und großen Aufgaben: Risikobereiche prüft der Solo-Prüfer zusätzlich auf Sicherheit; eine große Aufgabe bekommt im Solo-Weg einen Plan in Teilen mit Haltepunkten je Teil.
   - Die Frage steht ganz unten unter „Entscheidungen für dich“ als „**1. Welcher Weg?**“: „1a: Solo-Weg“ (die Sitzung baut selbst, ein frischer Prüfer prüft, deutlich weniger Verbrauch) und „1b: Voller Ablauf“ (Agenten für Erkunden, Planen, Tests, Bauen und Prüfen, gründlicher, ein Vielfaches an Verbrauch), dazu „Empfehlung: 1a“ oder „Empfehlung: 1b“ mit dem Grund aus den Merkmalen.
   - **Solo-Weg:** Lies `${CLAUDE_PLUGIN_ROOT}/skills/solo/SKILL.md` und mach dort in „1. Start“ ab Punkt 4 weiter (Selbsttest und Weg sind erledigt). Weg und Antwort im Wortlaut kommen in den Verlauf von `STATE.md`. Die übrigen Punkte hier entfallen.
   - **Voller Ablauf:** weiter mit Punkt 4; Weg und Antwort im Wortlaut kommen in Punkt 7 in den Verlauf.
4. **Konfliktcheck** (Schalter `conflict-check`; aus: überspringen): `codecycle tasks`; ändern offene Aufgaben dieselben Dateien laut `PLAN.md`? Warnung an den Nutzer.
5. **Thema** als kurzer Name (`<thema>`, Kleinbuchstaben, Bindestriche), Ordner `docs/codecycle/<JJJJ-MM-TT>-<thema>/` anlegen (heutiges Datum).
6. Dateien aus `${CLAUDE_PLUGIN_ROOT}/skills/workflow/templates/` anlegen: `TASK.md`, `PLAN.md`, `STATE.md`, leerer Ordner `reports/` mit `.gitkeep` (Vorschlag). Beschreibung des Nutzers unverändert in `TASK.md` unter „Wortlaut“ (als Zitat, `> ` vor jeder Zeile, sonst nichts ändern, auch keine Tippfehler); „Ziel“ bleibt bis zum Klären leer. Kommt der Auftrag aus dem Brainstorming (`/codecycle:ideas`), stehen im Wortlaut die Worte des Nutzers aus dem Gespräch und darunter der freigegebene Entwurf, gekennzeichnet als `> Entwurf, freigegeben am <JJJJ-MM-TT>: …`. Den Abschnitt „Wortlaut“ bearbeitest du danach nie mehr.
7. Branch `codecycle/<thema>` anlegen. Merkmale an das Regelwerk geben: `codecycle effort <aufgabenordner> --set art=… --set dateien=… --set risiko=ja|nein …` (alle Merkmale aus Punkt 3; `doku=nein|changelog|mehr`). `STATE.md`: `zustand: erfasst`, `groesse` aus der Ausgabe, `art`, `budget.geplant` = Obergrenze der angezeigten Läufe, `budget.nachlauf: 0`, `zuletzt` heute, Verlauf-Eintrag.
8. Commit (Urheberzeile nur nach `attribution`).

## Ergebnis
Aufgabenordner mit `TASK.md`, `PLAN.md`, `STATE.md` (`erfasst`), `aufwand.json`, `reports/`; Aufgaben-Branch `codecycle/<thema>`; ein Commit.

## Nächster Schritt
`steps/1-clarify.md`.
