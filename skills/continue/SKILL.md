---
description: "Setzt eine codecycle-Aufgabe fort, nach Neustart, neuer Sitzung oder Limit-Pause; gleicht STATE.md gegen Git ab."
argument-hint: "[Aufgaben-Ordner] [Zusatzauftrag]"
disable-model-invocation: true
---

# /codecycle:continue

## Zweck
Eine Aufgabe dort fortsetzen, wo sie stand. Alles Nötige steht in den Dateien, nicht in dieser Sitzung. Du bist der **Bauleiter**. **Git ist die Wahrheit, `STATE.md` nur ein Hinweis.**

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Eingabe des Nutzers (optional: Aufgaben-Ordner, danach Zusatzauftrag als Freitext): $ARGUMENTS
- Das Projekt ist eingerichtet (`.claude/codecycle.md`), mindestens eine Aufgabe unter `docs/codecycle/`.

## Schritte
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/SKILL.md`.
2. **Graph aktualisieren** (Schalter `graph`, ohne Git-Hooks): aktualisiere den Code-Graphen laut Abschnitt „Code-Graph“ in `.claude/codecycle.md`. Mit Hooks oder ohne Graph entfällt der Schritt.
3. **Check am Anfang:** `codecycle selftest` (Werkzeug, Konfiguration, Graph, Git-Hooks, Werkzeug-Kopie). Meldet er „node fehlt“ oder „Node … ist zu alt“ (Exit 2), halte an und führe den Nutzer durch Schritt 2 („Voraussetzungen prüfen“) von `/codecycle:setup` (Node installieren, danach Claude Code neu starten); ohne Node läuft kein Paket. Fehlt etwas, frage, ob nachinstalliert werden soll (Kopie veraltet oder fehlt: `/codecycle:update` anbieten, holt das neueste Plugin und erneuert Kopie, Konfiguration, Hooks und guard-Grundlage; einzeln: `codecycle install-tool`, `junit` fehlt in der Konfiguration: `codecycle install-tool --update-config` ergänzt fehlende Felder, ohne Vorhandenes zu überschreiben; Hooks: `codecycle hooks install`; ein fehlender Graph ist nur ein Hinweis).
4. **Abgleich Status gegen Git:** führe `codecycle tasks` aus und beachte:
   - Aufgaben-Branch schon im Hauptbranch, Zustand nicht `fertig`: fragen, ob als fertig markiert werden soll.
   - Branch existiert nicht mehr: fragen, ob fertig oder verworfen.
   - Paket `in-arbeit` ohne Commit: Abbruch; Worktree verwerfen, Paket neu starten. Hat der Worktree einen Test-Commit aus dem Aufgabenmodus (Verlauf „Tests P<n>: <hash>“), nicht verwerfen: `git -C <worktree> reset --hard <Test-Commit>` und neu ab `steps/4-build.md` Punkt 1 (Merge des Aufgaben-Branchs).
   - Meldet `tasks` einen Agenten „ohne Urteil, still seit …“, gilt er als abgebrochen: nicht seinen Bericht lesen, sondern das Paket neu starten (Nachlauf).
   - Kein Paket startbar, aber nicht alle fertig: Aufgabe blockiert, melden, nicht still aufhören.
   - Lange keine Änderung (Vorschlag 14 Tage): als „ruht“ zeigen.
5. **Merge-Frage zuerst:** Gibt es Aufgaben mit `zustand: geprueft`, deren Aufgaben-Branch noch nicht im Hauptbranch ist, frage als Erstes, je Aufgabe: „Aufgabe X ist abgenommen und noch nicht in <Hauptbranch>: jetzt mergen und die Branches löschen?“ (Standard Ja). Antworten: „Ja, mergen und Branches löschen“ (Standard), „Nur mergen, Branches behalten“, „Später“. Bei Ja (mit oder ohne Löschen): Merge und `zustand: fertig` im selben Commit, Branches nur bei „Ja, mergen und Branches löschen“ mit `git branch -d` (Ablauf in `steps/7-finish.md`, Punkt 5). Schau beim Wiedereinstieg einmal nach liegen gebliebenen leeren Worktree-Ordnern (`<projekt>--wt-*` neben dem Projekt) und melde sie (nicht leere nur nennen, nur leere entfernen). Auch hier stehen Fragen als Block „Entscheidungen für dich“ ganz unten in der Nachricht (je Frage Erklärung, Antworten, Folge, Empfehlung). Nie automatisch, ohne klares Ja nichts ändern. Zeige danach die „Offenen Fragen“ (Annahmen der Agenten) der gewählten Aufgabe und stelle höchstens **eine** optionale Frage zur Nacharbeit (ob die zuletzt fertige Aufgabe nachgebessert werden musste; Messung über `codecycle rework`, Ablauf in `steps/7-finish.md` Punkt 6).
6. **Ordner und Zusatzauftrag:** Zerlege die Eingabe von oben (Freitext wie „… und wir müssen noch Bericht schreiben“ wurde sonst als Ordnername genommen). Ist das **erste Wort** ein vorhandener Aufgabenordner (genau ein Ordner unter `docs/codecycle/`, dessen Name es ist oder es als Teil enthält), gilt es als Ordner und der Rest als **Zusatzauftrag**; sonst ist die ganze Eingabe Zusatzauftrag (Ordner wie unten wählen). Mehrdeutig (mehrere Ordner passen): frage, welcher gemeint ist. Ein Zusatzauftrag wird **nie still ausgeführt**: Nenne ihn in der Vorschlagszeile, und trage ihn in `STATE.md` unter „Offene Fragen“ (mit Datum) und im Verlauf ein, sobald der Nutzer die Aufgabe bestätigt hat; ändert er den Ablauf (Schritt auslassen, zusätzliche Rolle, anderer Ablauf), führe ihn erst nach dem Ja des Nutzers aus. Ohne angegebenen Ordner schlage die Aufgabe mit dem neuesten `zuletzt` in **einer Zeile** vor, z. B. „Weiter mit **<aufgabe>**? (zuletzt <Datum>, <Paket> in Arbeit, nächster Schritt: <…>; Zusatzauftrag: <…>) – ja / andere Aufgabe“. Warte auf die Antwort.
7. Lies **nur** die `STATE.md` dieser Aufgabe und die Anleitung aus `${CLAUDE_PLUGIN_ROOT}/skills/workflow/steps/` nach dieser Zuordnung, und mache dort weiter:
   - **`weg: solo`** → `${CLAUDE_PLUGIN_ROOT}/skills/solo/SKILL.md`, nächster Abschnitt nach `haltepunkt` (1 → Kurzplan, 2 → Bauen bzw. Eigene Kontrolle, 3 → Prüfung, 4 → Nachbesserung, 5 → Abschluss, 6 → Merge-Frage). Dort baust du selbst; die Regel „keinen Code lesen“ des Bauleiters gilt für Solo-Aufgaben nicht.
   - `erfasst` → `1-clarify.md`
   - `geklaert`, Plan noch nicht geschrieben → `2-plan.md`
   - `geklaert`, Plan geschrieben, groß → `3-plan-review.md`
   - `geklaert`, Plan geschrieben, nicht groß → `2-plan.md` ab Punkt 6 (Übersicht, Freigabe)
   - `geplant` / `in-arbeit` → `4-build.md`; hat ein Paket seinen Commit, aber keine Prüfung → `5-review.md`
   - alle Pakete `fertig`, Abnahme offen → `6-acceptance.md`
   - `geprueft` → `7-finish.md` (Abschluss noch nicht erledigt) oder Merge-Frage aus Punkt 5 (Abschluss erledigt)
   - Planänderung offen → `plan-change.md`
   - `blockiert` → Blocker aus `STATE.md` melden, Nutzer fragen
8. Halte nur an den Freigaben vorn an (Klären, Auftrag, Plan) und bei echten Blockern; **läuft ein Schritt, störst du den Nutzer nicht**. Prüfe vor jedem neuen Agentenlauf das Budget laut Workflow-Regeln. Steht in `STATE.md` `budget.nachlauf` über 0, nenne die Nachläufe mit ihrem Grund aus dem Verlauf in der Vorschlagszeile (Punkt 6). `STATE.md` ist nach jedem Schritt vollständig (Sitzung wegwerfbar).
9. **Disziplin des Bauleiters**, in jedem Schritt:
   - **Zeiten nur messen:** Uhrzeiten und Dauern stammen aus `agents.json` oder aus `date`, nie aus dem Gedächtnis oder geschätzt.
   - **Nicht nachprüfen, was `codecycle tasks` meldet:** Git-Stand, Worktrees, abgebrochene und tote Agenten (auch ohne Urteil) stehen schon in der Ausgabe von Punkt 4; prüfe sie nicht noch einmal von Hand. Nur was `tasks` nicht zeigt, prüfst du selbst.
   - **Nie einen Agenten starten, nur um zu warten:** Läuft ein Agent im Hintergrund, kommt seine Benachrichtigung von selbst; beende den Zug einfach.
   - **Keine Quelldateien des Werkzeugs lesen** (`.codecycle/tool/`, `plugin/tool/`): Ein Fehler am Werkzeug ist ein Fall für `codecycle:toolsmith`. Lies außerdem nur `STATE.md` und die Anleitung des Zustands, keine Berichte grüner Agenten und nicht den ganzen Plan.

## Ergebnis
Die Aufgabe läuft im Schritt weiter, der laut Zustand dran ist (bei `geprueft` zuerst die Merge-Frage); `STATE.md` stimmt wieder mit Git überein.

## Nächster Schritt
Der Schritt, den die Zuordnung in Punkt 7 nennt. Gibt es keine offene Aufgabe: `/codecycle:new <Beschreibung>`.
