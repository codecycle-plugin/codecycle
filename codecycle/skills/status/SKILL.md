---
description: "Zeigt alle codecycle-Aufgaben mit Zustand, Haltepunkt, Budget und Git-Abgleich in einer Übersicht (ohne Agenten)."
argument-hint: ""
disable-model-invocation: true
---

# /codecycle:status

## Zweck
Eine Übersicht aller Aufgaben, ohne Agenten und ohne Code zu lesen. Du änderst nichts, außer beim Merge auf ausdrückliches Ja (Punkt 3).

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Das Projekt-Werkzeug `codecycle` ist eingerichtet (`/codecycle:setup`).
- Schalter `conflict-check` (Standard an) steuert Punkt 4.

## Schritte
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/SKILL.md`.
2. Führe `codecycle tasks` aus.
3. **Merge-Frage zuerst:** Gibt es Aufgaben mit `zustand: geprueft`, deren Aufgaben-Branch noch nicht im Hauptbranch ist (`git merge-base --is-ancestor`), frage als Erstes je Aufgabe: „Aufgabe X ist geprüft und noch nicht in <Hauptbranch>: jetzt mergen und die Branches löschen?“ (Standard Ja). Wortlaut, Antworten und Ablauf bei Ja: `${CLAUDE_PLUGIN_ROOT}/skills/workflow/merge.md`; sonst nichts ändern. Die Frage steht als Block „Entscheidungen für dich“ ganz unten in der Nachricht, als einfache Frage in einer Zeile mit Standard (Format nach „Fragen an den Nutzer“ im Workflow-Skill). Das ist die einzige Änderung, die `status` macht, nur auf ausdrückliches Ja.
4. Zeige eine knappe Tabelle (`geprueft` als „geprüft, noch nicht in <Hauptbranch>“, nicht „fertig“): Aufgabe, Zustand, Haltepunkt (bei großen Aufgaben mit den Teilen), Budget, zuletzt, nächster Schritt; dazu die Hinweise des Git-Abgleichs (fertig vergessen, Branch fehlt, Abbruch, blockiert, ruht).
5. **Konfliktcheck** (Schalter `conflict-check`): Ändern zwei offene Aufgaben laut ihrem Plan dieselben Dateien, gib eine Warnung aus.

## Ergebnis
Tabelle der Aufgaben mit Hinweisen und Warnungen im Chat. Es wurde nichts geändert (außer einem Merge auf ausdrückliches Ja).

## Nächster Schritt
Schlage höchstens einen vor, meist `/codecycle:continue`.
