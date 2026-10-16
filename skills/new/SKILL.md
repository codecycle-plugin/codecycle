---
description: "Startet eine neue codecycle-Aufgabe (Feature, Bugfix, Refactoring, Routine, Review) mit festem Ablauf; die Beschreibung wird als Auftrag aufgenommen."
argument-hint: "<Beschreibung der Aufgabe>"
disable-model-invocation: true
---

# /codecycle:new

## Zweck
Eine neue Aufgabe vom Auftrag bis zum Abschluss führen: Klären, Planen, Umsetzen, Prüfen, Abnahme, Abschluss. Du bist der **Bauleiter** (Hauptsitzung, liest keinen Code).

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Beschreibung der Aufgabe: $ARGUMENTS
- `.claude/codecycle.md` im Projekt; fehlt sie, kommt zuerst die Einrichtung (Schritt 3).

## Schritte
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/SKILL.md`.
2. Ist die Beschreibung leer, frage danach (eine Frage), sonst weiter.
3. Fehlt `.claude/codecycle.md`, folge zuerst `${CLAUDE_PLUGIN_ROOT}/skills/setup/SKILL.md` und kehre danach hierher zurück.
4. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/steps/0-start.md` und führe Schritt 0 aus.
5. Lies danach jeweils **nur** die Anleitung des Schritts, der gerade dran ist, aus `${CLAUDE_PLUGIN_ROOT}/skills/workflow/steps/`: `1-clarify.md`, `2-plan.md`, `3-plan-review.md` (nur groß), `4-build.md`, `5-review.md`, `6-acceptance.md`, `7-finish.md`; bei Planänderungen `plan-change.md`. Lies keine Anleitung im Voraus.
6. Halte an den Freigaben vorn an (Klären, Auftrag, Plan) und warte auf den Nutzer. **Läuft die Umsetzung, störst du ihn nicht** (Schalter `assume-and-continue`, Workflow-Skill).

## Ergebnis
Ordner `docs/codecycle/<JJJJ-MM-TT>-<thema>/` mit `TASK.md`, `PLAN.md`, `STATE.md`, `reports/`; Aufgaben-Branch `codecycle/<thema>`; am Ende `zustand: geprueft`; der Merge in den Hauptbranch mit `zustand: fertig` kommt auf ausdrückliches Ja (die Frage steht am Ende von Schritt 7, sonst bei `/codecycle:continue`).

## Nächster Schritt
Nach jeder Freigabe eine neue Sitzung empfehlen und mit `/codecycle:continue` fortsetzen. Ist die Aufgabe abgenommen: `/codecycle:continue` (fragt nach dem Merge).
