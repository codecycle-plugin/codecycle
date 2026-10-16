# Schritt 7: Abschluss

## Zweck
Doku und Changelog nachziehen und dem Nutzer zusammenfassen. **Der Schritt merged nie von selbst:** Er endet mit der sichtbaren Merge-Frage, gemergt wird nur auf ausdrückliches Ja. Bleibt die Antwort aus, wiederholt sich die Frage bei `/codecycle:continue` und `/codecycle:status`. Bauleiter.

## Voraussetzungen
- Zustand `geprueft`.
- Doku-Aufbau in `.claude/codecycle.md`.
- Schalter: keiner berührt diesen Schritt. Kosten aus dem Token-Buch gibt es nur mit Mod.
- Keine Freigabe vor dem Merge in Risikobereichen: statt eines Stopps im Lauf gibt es die Liste „Bitte gezielt ansehen“.

## Schritte
1. **Doku und Changelog** nach dem „Doku-Aufbau“ in `.claude/codecycle.md` nachziehen. `codecycle:doc-keeper` nur, wenn er im Rollen-Set steht (`doku=mehr`, nicht klein, und `dokuImPaket` nicht `ja`). Bei `dokuImPaket=ja` hat ein Handwerker die Doku vollständig im Paket geschrieben und Abnahme bzw. Abschlussprüfung hat sie abgeglichen: kein Doku-Pfleger, du prüfst nur (fehlt etwas, gibt es ein kleines Korrekturpaket oder eine Nachricht an den Handwerker). Ohne Doku-Pfleger (`doku=changelog` oder klein): Den Changelog-Eintrag hat der Handwerker im Paket geschrieben; du prüfst ihn und ziehst die wenigen fehlenden Zeilen selbst nach. Commit.
2. **Messung:** `codecycle effort <aufgabenordner> --record` (Läufe und Nachläufe aus `STATE.md`, Diff-Zeilen ohne `docs/codecycle/`, Läufe je 100 Zeilen; schreibt `aufwand.json`). **Zusammenfassung** an den Nutzer: Pakete, Korrekturpakete, Diff-Umfang, Tests neu/grün, eine Zeile Aufwand „<n> Läufe (Nachlauf <k>) · Agenten x % · Bauleiter (<Modell>) y % · <z> Läufe je 100 Zeilen“ (Läufe aus `aufwand.json`, Prozente aus dem Panel bzw. `costs.json`, nur gemessen, keine Schätzung; ohne Mod nur die Läufe), Kosten (mit Mod aus dem Token-Buch `costs.json`, ohne Mod nicht verfügbar), Offenes. Für „Offenes“ liest du aus allen Berichten nur den Abschnitt „Offene Punkte“ (Vorschläge, ähnliche Stellen, Annahmen); die Annahmen stehen auch in `STATE.md` unter „Offene Fragen“.
3. **Bitte gezielt ansehen:** die Liste aus dem Abnahme-Bericht (Pakete in Risikobereichen, ihre Dateien, Tests zu „darf nicht möglich sein“-Kriterien), kurz am Ende der Zusammenfassung. Gibt es keinen Risikobereich: „keine“.
4. **Ende des Schritts.** `STATE.md` bleibt auf `zustand: geprueft`; im Verlauf steht „Abschluss erledigt (Doku, Zusammenfassung)“, `Nächster Schritt` lautet „Merge in main auf Ja“. Commit. **Nicht von selbst mergen.** Der Schritt endet mit der letzten Nachricht an den Nutzer, in dieser Reihenfolge:
   - Zuerst die kurze Zusammenfassung in einfachen Worten (Punkte 2 und 3). Bis zum Merge heißt die Aufgabe „abgenommen, noch nicht in <Hauptbranch>“, nicht „fertig“.
   - **Ganz unten** ein eigener Block „Entscheidungen für dich“, nummeriert: (1) die Merge-Frage zuerst (Wortlaut und Antworten in Punkt 5), dann (2…) die offenen Fragen aus `STATE.md`. Je Frage: was das ist in Alltagssprache, die Antworten, die Folge jeder Antwort, die Empfehlung als Standard. Nie als Stichwort, nie in der Mitte der Zusammenfassung.
   - Hat die Oberfläche Knöpfe für eine Frage (Wrap-up oder Rückfrage-Werkzeug der App), kommt die Merge-Frage dorthin, mit genau diesen Antworten.
   - Eine Zusammenfassung ohne diese Frage ist **unvollständig**, solange `zustand: geprueft` und der Branch nicht im Hauptbranch ist.
   - Kommt im selben Gespräch ein Ja, läuft der Merge-Ablauf aus Punkt 5 sofort. Ohne Antwort bleibt alles wie oben (`geprueft`) und die Frage wiederholt sich bei `continue` und `status`.
5. **Merge-Frage** (am Ende von Schritt 7 sichtbar, danach bei jedem Einstieg mit `continue` und `status` als Erstes, immer als Block „Entscheidungen für dich“ unten): Hat eine Aufgabe `zustand: geprueft` und ist ihr Aufgaben-Branch nicht im Hauptbranch (`git merge-base --is-ancestor codecycle/<thema> <Hauptbranch>` ist nicht wahr), frage: „Aufgabe X ist abgenommen und noch nicht in <Hauptbranch>: jetzt mergen und die Branches löschen?“ (Standard Ja). Antworten: „Ja, mergen und Branches löschen“ (Standard), „Nur mergen, Branches behalten“, „Später“. Gemergt wird **nur auf ausdrückliches Ja**, nie automatisch.
   - **Ja:** Ist „Abschluss erledigt“ im Verlauf nicht vermerkt, zuerst die Punkte 1 bis 4 nachholen. Dann in **dieser** Reihenfolge (solange die Aufgabe offen ist, schreibt der Mod die Buchdateien laufend, und `git checkout` scheitert an ihnen):
     1. Im Hauptordner, noch im Aufgaben-Branch: `STATE.md` auf `zustand: fertig` (`zuletzt`, Verlauf „in <Hauptbranch> gemergt“). Ab jetzt schreibt der Mod `agents.json`/`costs.json` dieser Aufgabe nicht mehr (er prüft `STATE.md` vor jedem Schreiben).
     2. **Abschluss-Commit im Aufgaben-Branch:** `STATE.md` und bei Ablage „teilen“ dazu `agents.json`, `costs.json`, `aufwand.json` des Aufgabenordners (Messdaten der Aufgabe, jetzt vollständig). Bei Ablage „lokal“ sind die Buchdateien ausgeschlossen, nur `STATE.md`. Dieser Commit ist „der Commit mit `zustand: fertig`“ für `codecycle rework` (Punkt 6).
     3. `git status --porcelain` prüfen: Bleibt eine geänderte Buchdatei einer **anderen** Aufgabe übrig, nicht mitnehmen, sondern dem Nutzer nennen (Altlast).
     4. Auf den Hauptbranch wechseln (`git checkout <Hauptbranch>`) und den Aufgaben-Branch mergen (`git merge codecycle/<thema>`). Fehlt dort bis zum Merge der Aufgabenordner, legt der Mod ihn nicht neu an (ohne `STATE.md` schreibt er keine Bücher).
     5. Liegen gebliebene Paket-Worktrees entfernen (Regeln in `5-review.md` Punkt 6).
     6. **Nur bei „Ja, mergen und Branches löschen“, als letzter Unterpunkt:** Paket-Branches `codecycle/<thema>--P<n>` und danach den Aufgaben-Branch `codecycle/<thema>` mit `git branch -d` löschen (nie `-D`, nie erzwingen). Verweigert Git das Löschen, die Meldung dem Nutzer nennen und den Branch stehen lassen. Dazu leere Worktree-Ordner neben dem Projekt (`<projekt>--wt-*`) melden: nur leere mit `rmdir` entfernen, nicht leere nur nennen (wie `5-review.md` Punkt 6). Bei „Nur mergen, Branches behalten“ entfällt dieser Unterpunkt.
   - **Später / Nein:** nichts ändern.
   - Verwirft der Nutzer die Aufgabe: `zustand: verworfen`, Grund im Verlauf.
6. **Nacharbeit** (nur beim Einstieg mit `continue` oder `status`, nach der Merge-Frage, für Aufgaben mit `zustand: fertig`): `codecycle rework <aufgabenordner>` zählt aus Git die Commits **nach** dem Commit, der `STATE.md` auf `fertig` gesetzt hat, auf denselben Dateien (Neu, Ändern, Tests aus `PLAN.md`). Die Ausgabe ist kurz (Zahl der Commits, betroffene Dateien); Exit 0 auch bei „kein Commit mit `zustand: fertig`“, Exit 2 bei Git- oder Aufruffehler. Ist die Zahl größer als 0, stelle höchstens **eine** optionale Frage („Musste die Aufgabe nachgebessert werden?“) und halte die Antwort im Verlauf der Aufgabe fest. Ist sie 0 oder fehlt die Messung, frage nichts. Nie mitten in einem Lauf, nie mehr als eine Frage.

## Ergebnis
Doku nachgezogen, Zusammenfassung und „Bitte gezielt ansehen“ gezeigt, Merge-Frage und offene Fragen unten als „Entscheidungen für dich“, `STATE.md` auf `geprueft`. Nach dem Ja (im selben Gespräch oder beim nächsten Einstieg): `STATE.md` auf `fertig` (oder `verworfen`) und Buchdateien im Abschluss-Commit, Aufgabe im Hauptbranch gemergt, Worktrees entfernt, Arbeitsbaum sauber.

## Nächster Schritt
Bei Ja sofort mergen; bei „Später“ oder ohne Antwort neue Sitzung empfehlen, `/codecycle:continue` wiederholt die Merge-Frage. Danach `/codecycle:status` oder `/codecycle:new`.
