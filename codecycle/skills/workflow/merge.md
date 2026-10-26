# Merge in den Hauptbranch

Gilt für den Abschluss in `/codecycle:new` und für den Einstieg mit `/codecycle:continue` und `/codecycle:status`. Gemergt wird **nur auf ausdrückliches Ja**, nie automatisch.

## Merge-Frage

- **Wann:** Eine Aufgabe hat `zustand: geprueft`, und ihr Aufgaben-Branch ist nicht im Hauptbranch (`git merge-base --is-ancestor codecycle/<thema> <Hauptbranch>` ist nicht wahr).
- **Wo:** Die Merge-Frage steht ganz unten in der letzten Nachricht im Block „Entscheidungen für dich“, als einfache Frage in einer Zeile mit Standard (Format nach „Fragen an den Nutzer“ im Workflow-Skill). Hat die Oberfläche Knöpfe für eine Frage (Wrap-up oder Rückfrage-Werkzeug der App), kommt sie dorthin, mit genau diesen Antworten.
- **Wortlaut:** „Aufgabe X ist geprüft und noch nicht in <Hauptbranch>: jetzt mergen und die Branches löschen?“
- **Antworten:** „Ja, mergen und Branches löschen“ (Standard), „Nur mergen, Branches behalten“, „Später“. Bei offenen Wortlaut-Fragen oder Nebenfunden ist der Standard „Später“.
- Bis zum Merge heißt die Aufgabe „geprüft, noch nicht in <Hauptbranch>“, nicht „fertig“.
- Eine Abschlussnachricht ohne diese Frage ist **unvollständig**, solange `zustand: geprueft` gilt und der Branch nicht im Hauptbranch ist.
- Ohne Antwort bleibt alles, wie es ist; die Frage kommt bei `/codecycle:continue` und `/codecycle:status` als Erstes wieder.

## Ja

In **dieser** Reihenfolge: Solange die Aufgabe offen ist, schreibt der Mod die Buchdateien laufend, und `git checkout` scheitert an ihnen.

1. Im Hauptordner, noch im Aufgaben-Branch: `STATE.md` auf `zustand: fertig` (`zuletzt`, Verlauf „in <Hauptbranch> gemergt“). Ab dann lässt der Mod `agents.json` und `costs.json` dieser Aufgabe unverändert (er prüft `STATE.md` vor jedem Schreiben).
2. **Ausgangs-Eintrag** (nur wenn `TASK.md` unter „Ziel“ eine Zeile `Eintrag:` hat): Felder und Werte nach der Anleitung des Ordners (`CLAUDE.md` im Ordner des Eintrags; bei einer angedockten Sammlung die Regeldatei, die die Karte nennt), nicht fest. Nennt sie einen Abschnitt „Abschluss“ (angedockte Sammlung), setzt du die dort genannten Felder für das Ergebnis `umgesetzt` (Idee) bzw. `behoben` (Bug); fehlt das Ergebnis dort, änderst du den Eintrag nicht und nennst ihn dem Nutzer. Sonst: `status: erledigt`; bei einer Idee `ergebnis: umgesetzt`, bei einem Bug `ergebnis: behoben`, ein To-do hat kein `ergebnis`. Dazu bei Idee und Bug `erledigt-durch`, wenn die Anleitung das Feld nennt:
   - Ablage „teilen“ (`.claude/codecycle.md`): relativer Link vom Eintrag auf `TASK.md` der Aufgabe, vor dem Abschluss-Commit; ist der Eintrag versioniert, geht er in den Abschluss-Commit.
   - Ablage „lokal“ (`TASK.md` gibt es nur auf diesem Gerät): erst nach dem Merge (Schritt 5) der Hash aus `git rev-parse --short HEAD`; zeigt `git status` den Eintrag danach geändert, eigener Commit „<Titel des Eintrags>: erledigt“.
   - Danach `codecycle-doku-pruefer <Eintrag>`: keine scharfen Treffer, sonst den Kopf berichtigen.
3. **Abschluss-Commit im Aufgaben-Branch:** `STATE.md` und bei Ablage „teilen“ dazu `agents.json`, `costs.json`, `aufwand.json` des Aufgabenordners (Messdaten der Aufgabe, vollständig) und der Ausgangs-Eintrag aus Schritt 2. Bei Ablage „lokal“ sind die Buchdateien ausgeschlossen, nur `STATE.md`.
4. `git status --porcelain` prüfen: Bleibt eine geänderte Buchdatei einer **anderen** Aufgabe übrig, nicht mitnehmen, sondern dem Nutzer nennen.
5. Auf den Hauptbranch wechseln (`git checkout <Hauptbranch>`) und den Aufgaben-Branch mergen (`git merge codecycle/<thema>`). Verweigert der Mod den Merge, nennt die Meldung, was fehlt.
6. **Nur bei „Ja, mergen und Branches löschen“:** den Aufgaben-Branch mit `git branch -d codecycle/<thema>` löschen (nie `-D`, nie erzwingen). Verweigert Git das Löschen, die Meldung dem Nutzer nennen und den Branch stehen lassen. Dazu leere Worktree-Ordner neben dem Projekt (`<projekt>--wt-*`, etwa vom Prüf-Worktree) melden: nur leere mit `rmdir` entfernen, nicht leere nur nennen.

## Später oder verworfen

- **Später:** nichts ändern.
- Verwirft der Nutzer die Aufgabe: `zustand: verworfen`, Grund im Verlauf.
