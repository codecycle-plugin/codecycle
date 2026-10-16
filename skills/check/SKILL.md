---
description: "Prüft das Projekt mit dem codecycle-Werkzeug: Lint, Format und Tests zusammen."
argument-hint: "[--full]"
disable-model-invocation: true
---

# /codecycle:check

## Zweck
Lint, Format und Tests des Projekts über das Projekt-Werkzeug prüfen. Keine rohen Test- oder Lint-Befehle. Auf Wunsch zeigt `selftest` außerdem Graph, Git-Hooks und Werkzeug-Kopie.

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Optionales Argument: $ARGUMENTS (`--full` = ganze Suite)
- Das Projekt-Werkzeug `codecycle` ist eingerichtet (`/codecycle:setup`).

## Schritte
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/SKILL.md`.
2. Führe aus: `codecycle check $ARGUMENTS`.
3. Gib die knappe Zusammenfassung des Werkzeugs wieder (grün / rot / übersprungen; bei Fehlschlägen die ersten, dazu der Pfad der vollen Ausgabe).
4. Optional (Zustand des Werkzeugs): `codecycle selftest` zeigt Node, Konfiguration, Graph-Anbieter, Hooks und Werkzeug-Kopie; Hinweise (`!`) wie veraltete Kopie oder fehlender Graph nennst du, behebst sie aber nur auf Wunsch (alles in einem Lauf: `/codecycle:update`; einzeln `codecycle install-tool`, `codecycle hooks install`).
5. Exit-Code 0 = grün, 1 = rot, 2 = Werkzeug kaputt. Bei 2: nicht selbst herumsuchen, melde „Werkzeug kaputt“.

## Ergebnis
Zusammenfassung grün / rot / übersprungen, bei Rot die ersten Fehlschläge.

## Nächster Schritt
Bei Exit 2: `/codecycle:setup` bzw. den Werkzeugmeister (`codecycle:toolsmith`) vorschlagen. Sonst keiner.
