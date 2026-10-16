---
description: "Brainstorming ohne Code, wenn noch unklar ist, was gebaut werden soll; endet mit einem Auftrags-Entwurf für /codecycle:new."
argument-hint: "[Stichwort oder Problem]"
disable-model-invocation: true
---

# /codecycle:ideas

## Zweck
Freies Brainstorming in der Hauptsitzung, **ohne Code zu lesen und ohne Agenten**, wenn der Nutzer noch nicht weiß, was er will. Das Ergebnis ist ein Auftrags-Entwurf. Den Befehl selbst startet nur der Nutzer; das automatische Brainstorming bei vager Beschreibung (Schalter `ideas-auto`) startest du als Bauleiter in Schritt 1a.

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Ausgangspunkt: $ARGUMENTS
- Sprache der Ausgaben aus `.claude/codecycle.md`, falls vorhanden (sonst Deutsch).

## Schritte
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/SKILL.md`.
2. **Eine Frage nach der anderen**, möglichst mit Auswahlmöglichkeiten. Kläre Zweck, Erfolgskriterium („fertig, wenn …“), Nicht-Ziele; biete Alternativen an, eigene Vorschläge als Möglichkeit kennzeichnen.
3. Am Ende: ein **Auftrags-Entwurf** (Ziel, Erfolgskriterium, Nicht-Ziele, offene Fragen) im Chat. Frage, ob er mit `/codecycle:new` aufgegriffen werden soll. Noch nichts anlegen oder bauen.
4. Wurde das Brainstorming von `/codecycle:new` gestartet (Schalter `ideas-auto`), gib den Entwurf dorthin zurück.

## Ergebnis
Ein Auftrags-Entwurf im Chat. Es wurden keine Dateien angelegt.

## Nächster Schritt
`/codecycle:new` mit dem Entwurf, oder zurück zu Schritt 1a der laufenden Aufgabe.
