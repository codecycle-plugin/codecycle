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
3. **Check am Anfang:** `codecycle selftest` (Werkzeug, Konfiguration, Graph, Git-Hooks, Werkzeug-Kopie). Meldet er „node fehlt“ oder „Node … ist zu alt“ (Exit 2), halte an und führe den Nutzer durch Schritt 2 („Voraussetzungen prüfen“) von `/codecycle:setup` (Node installieren, danach Claude Code neu starten); ohne Node läuft das Werkzeug nicht. Fehlt etwas, frage, ob nachinstalliert werden soll (Kopie veraltet oder fehlt: `/codecycle:update` anbieten, holt das neueste Plugin und erneuert Kopie, Konfiguration, Hooks und guard-Grundlage; einzeln: `codecycle install-tool`, `junit` fehlt in der Konfiguration: `codecycle install-tool --update-config` ergänzt fehlende Felder, ohne Vorhandenes zu überschreiben; Hooks: `codecycle hooks install`; ein fehlender Graph ist nur ein Hinweis). Die Frage nach den Hooks stellst du je Aufgabe einmal: Steht die Antwort im Verlauf von `STATE.md`, nicht erneut; ohne offene Aufgabe nur nennen, nicht fragen.
4. **Abgleich Status gegen Git:** führe `codecycle tasks` aus und beachte:
   - Aufgaben-Branch schon im Hauptbranch, Zustand nicht `fertig`: fragen, ob als fertig markiert werden soll.
   - Branch existiert nicht mehr: fragen, ob fertig oder verworfen.
   - Meldet `tasks` einen Agenten „ohne Urteil, still seit …“, gilt er als abgebrochen: nicht seinen Bericht lesen, sondern seinen Auftrag mit einem frischen Agenten neu starten.
   - Lange keine Änderung (Vorschlag 14 Tage): als „ruht“ zeigen.
5. **Merge-Frage zuerst:** Gibt es Aufgaben mit `zustand: geprueft`, deren Aufgaben-Branch noch nicht im Hauptbranch ist, frage als Erstes, je Aufgabe: „Aufgabe X ist geprüft und noch nicht in <Hauptbranch>: jetzt mergen und die Branches löschen?“ (Standard Ja). Wortlaut, Antworten und Ablauf bei Ja: `${CLAUDE_PLUGIN_ROOT}/skills/workflow/merge.md`; Branches nur bei „Ja, mergen und Branches löschen“ mit `git branch -d`. Schau beim Wiedereinstieg einmal nach liegen gebliebenen leeren Worktree-Ordnern (`<projekt>--wt-*` neben dem Projekt, etwa vom Prüf-Worktree) und melde sie (nicht leere nur nennen, nur leere entfernen). Auch hier stehen Fragen als Block „Entscheidungen für dich“ ganz unten in der Nachricht (Format nach „Fragen an den Nutzer“ im Workflow-Skill; die Merge-Frage als einfache Frage in einer Zeile mit Standard). Nie automatisch, ohne klares Ja nichts ändern. Zeige danach die „Offenen Fragen“ (Annahmen der Agenten) der gewählten Aufgabe.
6. **Ordner und Zusatzauftrag:** Zerlege die Eingabe von oben (Freitext wie „… und wir müssen noch Bericht schreiben“ wurde sonst als Ordnername genommen). Ist das **erste Wort** ein vorhandener Aufgabenordner (genau ein Ordner unter `docs/codecycle/`, dessen Name es ist oder es als Teil enthält), gilt es als Ordner und der Rest als **Zusatzauftrag**; sonst ist die ganze Eingabe Zusatzauftrag (Ordner wie unten wählen). Mehrdeutig (mehrere Ordner passen): frage, welcher gemeint ist. Ein Zusatzauftrag wird **nie still ausgeführt**: Nenne ihn in der Vorschlagszeile, und trage ihn in `STATE.md` unter „Offene Fragen“ (mit Datum) und im Verlauf ein, sobald der Nutzer die Aufgabe bestätigt hat; ändert er den Ablauf (Schritt auslassen, zusätzliche Rolle, anderer Ablauf), führe ihn erst nach dem Ja des Nutzers aus. Ohne angegebenen Ordner und mit **genau einer** offenen Aufgabe setzt du sie ohne Frage fort und nennst sie in einer Zeile („Weiter mit **<aufgabe>**: Haltepunkt <n>, nächster Schritt: <…>“); ein Zusatzauftrag, der den Ablauf ändert, braucht trotzdem das Ja. Bei mehreren offenen Aufgaben schlage die mit dem neuesten `zuletzt` in **einer Zeile** vor, z. B. „Weiter mit **<aufgabe>**? (zuletzt <Datum>, Haltepunkt <n>, nächster Schritt: <…>; Zusatzauftrag: <…>) – ja / andere Aufgabe“, und warte auf die Antwort.
7. Lies **nur** die `STATE.md` dieser Aufgabe, die Überschriften von `TASK.md` und ob `reports/plan-pruefung.md` existiert, und mache dort weiter:
   - **`weg: solo`** → `${CLAUDE_PLUGIN_ROOT}/skills/new/SKILL.md`, nächster Schritt nach der Tabelle „Nächster Schritt je Stand“ dort (`haltepunkt`, `entwurf:`, `plan:`, `reports/plan-pruefung.md`; Haltepunkt 1 mit `entwurf:` und ohne `plan:` → weiter beim Plan, kein neues Brainstorming; mit `teile:` beim ersten Teil, der nicht `fertig` ist, alle fertig → Eigene Kontrolle). Fehlende Felder `entwurf:` und `plan:` sind kein Fehler (Aufgabe alter Art). Kleine und mittlere Aufgaben baust du selbst, große je Teil ein frischer `codecycle:builder` (Abschnitt „Bauen“ dort).
   - **Teil `in-arbeit`** (`teile:` nennt ihn mit seinem Branch; Limit-Ende oder Abbruch mitten im Teil):
     - Teil-Branch vorhanden: Steht der Hauptordner nicht darauf, `git switch <branch>`. `codecycle solo teil start <ordner> <name>` nennt die Zeilen der Startnachricht samt `Stand:`; dann ein neuer `codecycle:builder` mit derselben Startnachricht wie in `new`. Er schließt an Committetes und Uncommittetes an, lässt zuerst die Tests laufen, der Stand gilt als ungeprüft.
     - Teil-Branch vorhanden, Teil schon grün und committet (Quittung des letzten Bauenden oder `codecycle check`): Mit Schalter `part-review` an und Merkmal ` · groß` und ohne Teil-Bericht zuerst der Prüfer je Teil wie in `new`; sonst reicht `codecycle solo teil fertig <ordner> <name>`.
     - Teil-Branch fehlt: `codecycle solo teil fertig <ordner> <name>` meldet „Teil <name> wird auf einem anderen Gerät gebaut; dort weitermachen oder den Branch dort pushen“ und nennt `--uebernommen` für einen von Hand übernommenen oder gelöschten Teil. Gib die Meldung dem Nutzer weiter und baue nichts; `--uebernommen` nur auf seine ausdrückliche Antwort.
   - **`weg: voll` oder ohne `weg:`**: Sag in einem Satz, dass diese Aufgabe zum vollen Ablauf gehört, den das Plugin nicht fortsetzt, dass Branch und Dateien bleiben und dass `/codecycle:new` sie neu beginnt; sonst nichts tun.
   - `zustand: blockiert` → Blocker aus `STATE.md` melden, Nutzer fragen.
8. Halte nur an den Freigaben vorn an (Entwurf, Plan) und bei echten Blockern; **läuft ein Schritt, störst du den Nutzer nicht**. `STATE.md` ist nach jedem Haltepunkt vollständig (Sitzung wegwerfbar).
9. **Disziplin des Bauleiters**, in jedem Schritt:
   - **Zeiten nur messen:** Uhrzeiten und Dauern stammen aus `agents.json` oder aus `date`, nie aus dem Gedächtnis oder geschätzt.
   - **Nicht nachprüfen, was `codecycle tasks` meldet:** Git-Stand, Worktrees, abgebrochene und tote Agenten (auch ohne Urteil) stehen schon in der Ausgabe von Punkt 4; prüfe sie nicht noch einmal von Hand. Nur was `tasks` nicht zeigt, prüfst du selbst.
   - **Nie einen Agenten starten, nur um zu warten:** Läuft ein Agent im Hintergrund, kommt seine Benachrichtigung von selbst; beende den Zug einfach.
   - **Keine Quelldateien des Werkzeugs lesen** (`.codecycle/tool/`, `plugin/tool/`): Ein Fehler am Werkzeug ist ein Fall für `codecycle:toolsmith`. Lies außerdem nur, was Punkt 7 nennt, keine Berichte grüner Agenten und nicht den ganzen Plan.

## Ergebnis
Die Aufgabe läuft im Schritt weiter, der laut Zustand dran ist (bei `geprueft` zuerst die Merge-Frage); `STATE.md` stimmt wieder mit Git überein.

## Nächster Schritt
Der Schritt, den die Zuordnung in Punkt 7 nennt. Gibt es keine offene Aufgabe: `/codecycle:new <Beschreibung>`.
