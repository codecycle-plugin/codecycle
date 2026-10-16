---
description: "Holt die neueste Version: Plugin aktualisieren, Werkzeug-Kopie, Konfiguration, Git-Hooks, guard-Grundlage und Selbsttest aus der neuen Version, am Ende das Plugin neu laden. Mit Mod läuft das ohne KI; hier nur Sonderfälle."
argument-hint: ""
disable-model-invocation: true
---

# /codecycle:update

## Zweck
Plugin und Projekt-Werkzeug auf den neuesten Stand bringen. Die Arbeit macht das Werkzeug mit einem Befehl, `codecycle update`: Plugin aktualisieren, Werkzeug-Kopie aus der **neuen** Version, Hooks, guard-Grundlage, Selbsttest. Ist der Mod an, beantwortet er `/codecycle:update` selbst, ohne KI, und diese Anleitung läuft nur, wenn das Werkzeug eine Entscheidung braucht (Exit 3) oder kaputt ist (Exit 2). Du bist der **Bauleiter** und führst die Befehle selbst aus, ohne Agenten. Dass der Nutzer den Befehl aufruft, ist die Freigabe, auch für das Plugin-Update (gilt für alle Projekte auf dem Rechner).

Meldung des Mods (leer, wenn der Mod nicht lief): $ARGUMENTS

## Voraussetzungen
- Plugin-Ordner der laufenden Version: `${CLAUDE_PLUGIN_ROOT}`

## Schritte
Die Lade-Zeile der anderen Befehle (`workflow/SKILL.md`) entfällt hier: Der Ablauf braucht ihre Regeln nicht, und das spart Tokens.

### Teil A: Plugin aktualisieren
1. **Meldung des Mods da?** Dann hat das Werkzeug schon gearbeitet: Ihr Text steht oben unter „Meldung des Mods“. Weiter mit Teil B, Schritt 3, mit `<PLUGIN>` = `${CLAUDE_PLUGIN_ROOT}`.
2. **Sonst:** `node "${CLAUDE_PLUGIN_ROOT}/tool/cli.ts" update` im Hauptordner des Projekts (Elternordner von `git rev-parse --path-format=absolute --git-common-dir`; ohne Git-Projekt im aktuellen Ordner). Der Befehl macht Teil A und B in einem Lauf; liegt danach eine neuere Plugin-Version auf der Platte, ruft er deren Werkzeug selbst auf. Weiter mit Teil B, Schritt 3, mit `<PLUGIN>` = `${CLAUDE_PLUGIN_ROOT}`.

### Teil B: Werkzeug und Neuladen
`<PLUGIN>` ist ein Plugin-Ordner. Hierher kommt auch eine ältere Anleitung (0.11.x), die Teil B aus dieser Datei liest; Überschrift und Bedeutung von `<PLUGIN>` bleiben deshalb gleich.

1. **Von einer älteren Anleitung hierher geschickt** (sie hat das Plugin schon aktualisiert und `<PLUGIN>` aus `installPath` bestimmt): `node "<PLUGIN>/tool/cli.ts" update --nur-werkzeug --plugin-vorher <Version, die vorher lief>` im Hauptordner.
2. Sonst kommst du aus Teil A und hast die Ausgabe schon.
3. **Ausgabe lesen.** Die letzte Zeile `UPDATE_RESULT {…}` ist für den Mod; `status`, `neuLaden` und die Zeilen davor sagen dir, was passiert ist.
   - **Exit 0:** weiter mit Schritt 5.
   - **Exit 3, „tool.config.json fehlt (frisch geklont?)“:** `node "<PLUGIN>/tool/cli.ts" install-tool --update-config` legt Kopie und Vorlage an. Zeige die Vorlage `.codecycle/tool.config.json` und lass den Nutzer sie prüfen: Befehle `test`/`lint`/`format`, `mainBranch`, `graph.provider`; das Format beschreibt `/codecycle:setup`, Schritt 5. Passe sie erst nach seiner Antwort an. Dann `.codecycle/` aus Git nehmen: Ist `.claude/codecycle.md` versioniert (`git ls-files --error-unmatch .claude/codecycle.md` gelingt), `codecycle exclude --share`, sonst `codecycle exclude`. Danach `node "<PLUGIN>/tool/cli.ts" update --nur-werkzeug` und diese Ausgabe wieder lesen.
   - **Exit 3, „neuer als das Plugin“:** Halte an und melde es. Zurückstufen nur, wenn der Nutzer es ausdrücklich will.
   - **Exit 3, `core.hooksPath` zeigt auf etwas anderes** (husky, lint-staged): Frag den Nutzer, ob die Hooks dort von Hand ergänzt oder `core.hooksPath` umgestellt werden soll; danach `node "<PLUGIN>/tool/cli.ts" update --nur-werkzeug`.
4. **Exit 2: abbrechen.** Gib die Ausgabe wieder und erkläre sie in einem Satz. Bei „node fehlt“ oder „Node … ist zu alt“ führe den Nutzer durch Schritt 2 von `/codecycle:setup` (Node installieren, Claude Code neu starten). Bei einer kaputten Konfiguration oder Kopie biete `codecycle:toolsmith` an; was er ändert, gibt der Nutzer frei. Nicht selbst herumsuchen. Schritt 5 läuft trotzdem, wenn `neuLaden` wahr ist.
5. **Neuladen, nur wenn `neuLaden` wahr ist:** Rufe das Werkzeug `codecycle_reload` auf (verzögert geladen: vorher `ToolSearch` mit `select:mcp__codecycle__codecycle_reload`). Es stellt `/reload-plugins` in die Warteschlange; das läuft, sobald deine Antwort fertig ist. Gibt es das Werkzeug nicht (Mod aus), schreib: „Bitte `/reload-plugins` eingeben (oder Claude Code neu starten).“ Nie `/reload-plugins --force` von selbst: Warnt Claude Code beim Neuladen vor dem Cache, entscheidet der Nutzer.
6. **Ergebnis melden, kurz:** die Zusammenfassung des Werkzeugs (Plugin vorher → nachher mit dem Satz „gilt ab jetzt für alle Projekte auf diesem Rechner“, Kopie, Hooks, guard, Selbsttest-Hinweise) oder nur „alles aktuell“. Committen musst du nichts: `.codecycle/` und `.githooks/` sind lokal.

## Ergebnis
Plugin in der neuesten Version (oder Grund, warum nicht), Werkzeug-Kopie in der Version des Plugins, Hooks erneuert, guard-Grundlage neu festgehalten, Selbsttest ohne `✘`, Neuladen eingeplant.

## Nächster Schritt
Weiterarbeiten wie vorher (`/codecycle:continue` bzw. `/codecycle:new <Beschreibung>`). Bei Exit 2: `/codecycle:setup` (Node) bzw. den Werkzeugmeister (`codecycle:toolsmith`).
