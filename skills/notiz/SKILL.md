---
description: "Hält eine Beobachtung mit Uhrzeit in notizen.md der offenen Aufgabe fest (Schalter notizen). Mit Mod ohne KI."
argument-hint: "<Text>"
disable-model-invocation: true
---

# /codecycle:notiz

## Zweck
Eine Beobachtung festhalten, ohne die Arbeit zu unterbrechen. Ist der Mod an, beantwortet er `/codecycle:notiz` selbst, ohne KI; diese Anleitung läuft nur, wenn er den Befehl nicht starten konnte. Du bist der **Bauleiter** und führst den Befehl selbst aus, ohne Agenten.

Text: $ARGUMENTS

## Voraussetzungen
- Plugin-Ordner: `${CLAUDE_PLUGIN_ROOT}`

## Schritte
Die Lade-Zeile der anderen Befehle (`workflow/SKILL.md`) entfällt hier: Ein Befehl genügt, das spart Tokens.

1. Text leer: frag nach dem Text, sonst nichts.
2. `codecycle notiz '<Text>'` im Hauptordner (Rückfall `node "${CLAUDE_PLUGIN_ROOT}/tool/cli.ts" notiz '<Text>'`). Den Text unverändert übergeben, immer in einfachen Anführungszeichen (ein `'` im Text als `'\''`): in doppelten würde die Shell Backticks und `$(…)` im Text ausführen.
3. Die Ausgabe in einer Zeile wiedergeben, nichts weiter tun. Meldet sie, dass der Schalter aus ist, nenne, wie er eingeschaltet wird (steht in der Ausgabe); schalte ihn nicht selbst ein.

## Ergebnis
Notiz in `notizen.md` des Aufgabenordners (ohne offene Aufgabe in `.codecycle/setup/notizen.md`) oder der Hinweis, dass der Schalter aus ist.

## Nächster Schritt
Weiterarbeiten wie vorher.
