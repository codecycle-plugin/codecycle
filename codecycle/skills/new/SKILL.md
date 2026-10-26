---
description: "Startet eine neue codecycle-Aufgabe: Brainstorming, Entwurf, Plan mit Planprüfer; danach baut die Sitzung (große Aufgaben je Teil ein frischer Bauender), ein frischer Prüfer prüft gegen die Worte des Nutzers, eine Runde Nachbesserung, Merge-Frage."
argument-hint: "<Beschreibung der Aufgabe>"
disable-model-invocation: true
---

# /codecycle:new

## Zweck
Eine Aufgabe vom Gespräch bis zum Merge: **Brainstorming**, **Entwurf** (Freigabe), **Plan** mit Planprüfer (Freigabe), dann **wird gebaut**: kleine und mittlere Aufgaben baust du selbst (Code, Tests, Doku, Commits), große baut je Teil ein frischer `codecycle:builder`, nacheinander. Am Ende prüft ein frischer Schlussprüfer (`codecycle:final-reviewer`) gegen die Worte des Nutzers, du besserst einmal nach, dann folgt die Merge-Frage.

**Leitsatz:** Ziel ist das Ergebnis, das die Aufgabe am besten erfüllt, so genau wie möglich, mit so wenig Tokens wie dafür nötig; sparen heißt nicht weglassen. Jeder Agent baut eigenen Kontext auf und kostet Limit. Große Aufgaben baut nacheinander je Teil ein frischer `builder`; kleine und mittlere baust du selbst, solange deine Sitzung nicht zu voll würde: Zu voll heißt, die anstehende Arbeit brächte die Zeile „Hauptsitzung“ von `codecycle_budget` über 500 000 Tokens; dann zuerst eine neue Sitzung (Workflow-Skill, „Hauptsitzung klein halten“).

**Maßstab:** Der Wortlaut und die freigegebenen Erfolgssätze sind der Maßstab, an dem Abweichungen sichtbar werden, keine Vorschrift ohne Fehler. Rangfolge: eine Antwort des Nutzers vor dem Wortlaut, der Wortlaut vor deinem Plan. Du darfst abweichen, wenn du es besser weißt, aber nie still: Jede Abweichung steht als Annahme mit Grund da und wird im Abschluss eine Frage an den Nutzer.

**Klare Aufgabe:** Ergibt das Brainstorming „klar“, schreibst du Entwurf und Plan still in die Dateien und baust: keine Freigaben, kein Planprüfer, kein Weiter-Vorschlag. Der Prüfer am Ende bleibt.

**Schwer Rückgängiges:** Vor Datenmigration, Löschen, Veröffentlichen oder Zahlungen hältst du an und fragst (echte Entscheidung, Format im Workflow-Skill).

Innen arbeitest du frei; fest sind sechs Haltepunkte. Drei davon sperrt der Mod: ohne grünen `codecycle solo check` kein Prüfer, ohne Prüfbericht und ohne Status je Fund kein Merge.

**Haltepunkte:** Jeder Haltepunkt steht als `haltepunkt: <n>` in `STATE.md`; `STATE.md` ist danach vollständig (Sitzung wegwerfbar).

| # | Haltepunkt | Fest |
|---|---|---|
| 1 | Entwurf | Ordner, Branch, `TASK.md` mit dem Entwurf, `STATE.md` mit `weg: solo`; Freigabe, `entwurf:` |
| 2 | Plan | Plan in `TASK.md` (groß: in Teilen, nacheinander je Teil ein `builder`, Stand je Teil in `STATE.md`), Planprüfer, Freigabe, `plan:` |
| 3 | Eigene Kontrolle | Doku nachgezogen, alles committet, `codecycle solo check` grün, Oberfläche selbst angesehen |
| 4 | Prüfung | frischer Prüfer gegen Wortlaut und Erfolgssätze, ab zwei Risikobereichen dazu ein zweiter für Sicherheit; nicht überspringbar |
| 5 | Nachbesserung | jeder Fund `behoben` oder `verworfen: <Grund>`; Abweichung vom Wortlaut und Nebenfund als Frage |
| 6 | Abschluss | festes Format, Merge-Frage |

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Beschreibung der Aufgabe: $ARGUMENTS
- `.claude/codecycle.md` im Projekt; fehlt sie, folgt die Einrichtung nach der Freigabe des Entwurfs (Abschnitt 1).
- Werkzeug: `codecycle <befehl>`; meldet die Shell „command not found“, `"${CLAUDE_PLUGIN_ROOT}/bin/codecycle" <befehl>`, sonst `node <Hauptordner>/.codecycle/tool/cli.ts <befehl>`. Exit 0 grün, 1 rot, 2 Werkzeug kaputt (dann `codecycle:toolsmith`, die Änderung gibt der Nutzer frei).

## Schritte
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/workflow/SKILL.md`.
2. **Brainstorming:** Kommst du aus `${CLAUDE_PLUGIN_ROOT}/skills/brainstorming/SKILL.md`, ist es erledigt. Sonst führe es danach (Abschnitte 1 bis 3); Abschnitt 4 führt hierher zurück. Ist die Beschreibung leer, ist das die erste Frage.

### 1. Entwurf
Kommst du aus dem Brainstorming, führe zuerst Schritt 1 oben aus (Workflow-Skill lesen), falls er in dieser Sitzung noch nicht gelesen ist.
Im eingerichteten Projekt legst du Punkte 1 bis 6 an, sobald der Entwurf steht, und zeigst ihn erst dann. Ohne `.claude/codecycle.md` zeigst du ihn zuerst nur im Chat (Punkt 7); nach der Freigabe folgt die Einrichtung nach `${CLAUDE_PLUGIN_ROOT}/skills/setup/SKILL.md`, dann Punkte 1 bis 6 und 8. **Klare Aufgabe ohne `.claude/codecycle.md`:** zuerst die Einrichtung (ihre eine gesammelte Frage bleibt), dann Punkte 1 bis 6 und 8 still.
1. `codecycle selftest`. Fehlt etwas, frage, ob nachinstalliert werden soll (Kopie veraltet: `/codecycle:update` anbieten). Ein fehlender Graph ist nur ein Hinweis.
2. **Konfliktcheck** (Schalter `conflict-check`): `codecycle tasks`; ändert eine offene Aufgabe laut ihrem Plan dieselben Dateien, nenne sie als Warnung.
3. Hat der Hauptbranch noch keinen Commit (`git rev-parse --verify <Hauptbranch>` scheitert, etwa nach `git init`), zuerst auf ihm `git commit --allow-empty -m "<Projektstart>"`; sonst kann `codecycle solo check` den Branch nicht gegen den Hauptbranch prüfen.
   Thema als kurzer Name (Kleinbuchstaben, Bindestriche); Ordner `docs/codecycle/<JJJJ-MM-TT>-<thema>/` mit `reports/.gitkeep`; Branch `codecycle/<thema>` vom Hauptbranch (`git switch -c codecycle/<thema>`).
4. `TASK.md` aus `${CLAUDE_PLUGIN_ROOT}/skills/workflow/templates/TASK.md`, Abschnitte für `/codecycle:new` in dieser Reihenfolge:
   - „Wortlaut“: die Worte des Nutzers aus Auftrag und Gespräch als Zitat, unverändert (`> ` vor jeder Zeile, auch Tippfehler bleiben); danach nie mehr bearbeiten.
   - „Vermutungen“: was du aus dem Brainstorming vermutest und der Nutzer nicht bestätigt hat.
   - „Ziel“ (1–3 Sätze), „Nicht-Ziele“, „Anti-Ziele“, „Erfolgssätze“ (nachprüfbar, je Satz eine Zeile), „Entscheidungen“ (Frage, Antwort im Wortlaut). Geht die Aufgabe von einem Eintrag aus (Idee, Bug oder To-do in einem Ordner aus `festhalten` in `.claude/doku.json`), steht unter „Ziel“ die Zeile `Eintrag: [<titel>](<Pfad relativ zu TASK.md>)`; beim Merge setzt `merge.md` ihn auf erledigt.
   - „Plan“ (leer bis Haltepunkt 2), „Eingabeformate“, „Annahmen“, „Funde“.
5. `STATE.md` aus `${CLAUDE_PLUGIN_ROOT}/skills/workflow/templates/STATE.md`: `weg: solo`, `haltepunkt: 1`, `zustand: erfasst`, `art`, `groesse: klein` (`gross` bei mehr als 10 Dateien oder mehreren Bereichen), `branch`, `zuletzt` heute, `budget` mit Nullen; Verlauf „<Datum> erfasst“.
6. Commit.
7. Entwurf im Chat nach `${CLAUDE_PLUGIN_ROOT}/skills/brainstorming/SKILL.md`, „4. Entwurf“, Punkte 2 bis 4, mit Link auf `TASK.md`; Freigabe. Klare Aufgabe: nicht zeigen, nicht fragen.
8. Nach der Freigabe: Änderungswünsche vorher einarbeiten; Antwort im Wortlaut in den Verlauf von `STATE.md`, Kopfzeile `entwurf: freigegeben <JJJJ-MM-TT>` (klare Aufgabe: `entwurf: klar`); Commit. Dann „Weiter oder neue Sitzung“ (klare Aufgabe: entfällt).

### 2. Plan
1. `haltepunkt: 2`, `zustand: in-arbeit`.
2. Plan in `TASK.md` unter „Plan“. Du liest den Code selbst; in großen Repos sucht der mitgelieferte Such-Helfer `Explore` die Stellen, nur mit der Auftragsvorlage für Lese-Helfer: „Nur lesen, nichts ändern. Gesucht: <was und wofür>. Breite: <quick | medium | very thorough>. Antwort: Liste `Datei :: Symbol`, je Eintrag eine Zeile „was ändert sich“; höchstens eine Bildschirmseite, keine Dateiinhalte.“
   Inhalt des Plans: was sich wo und warum ändert, was bleibt, Reihenfolge, je Erfolgssatz Testfälle in Worten (der Bau macht daraus echte Tests). Kein Code. Klare Aufgabe: 3–10 Zeilen.
   - **Leeres Projekt:** Grundgerüst und Testbefehl gehören in den Plan, samt dem Eintrag des Testbefehls unter „Befehle“ in `.claude/codecycle.md` und als `commands.test` in `.codecycle/tool.config.json`. Die Konfiguration ist eine Kontrolldatei: Der Eintrag gilt mit der Plan-Freigabe als freigegeben, nicht committen, danach `codecycle guard --record`.
   - **Groß** (`groesse: gross`): Plan in Teilen. Je Teil eine Zeile `- Teil <name>: <was> · Dateien · Schnittstelle zu anderen Teilen · Prüfweg`, in der Reihenfolge des Bauens, darunter die Testfälle in Worten des Teils. Jeder Teil passt in einen Bauenden.
     - Merkmal großer Teile: Ein Teil mit viel Logik oder Risiko bekommt am Ende seiner Zeile ` · groß`; nur dort prüft mit Schalter `part-review` ein Prüfer je Teil.
     - Dann `codecycle solo plan <ordner> <teil> …` (Namen wie im Plan, in dieser Reihenfolge) und Commit.
   - Teile werden nacheinander gebaut, je Teil ein `builder` (Abschnitt „Bauen“). Getrennte Bereiche mit fester Schnittstelle (z. B. Frontend und Backend) werden getrennte Teile; die Schnittstelle steht in beiden Teilzeilen.
   - Bestehende Meldungen, Formate, Schnittstellen und Seiten bleiben wörtlich gleich, außer der Wortlaut verlangt eine Änderung. Weichst du bewusst vom Wortlaut oder vom Bestand ab, auch mit einer besseren Idee, steht das unter „Annahmen“ als `- Abweichung: <was> statt „<Zitat oder Bestand>“ (Grund)`.
3. Unter „Eingabeformate“ je Eingabe die Schreibweisen, die Nutzer dieser Aufgabe realistisch tippen oder einfügen: Komma oder Punkt, Tausendertrenner mit Leerzeichen (`1 000`), Punkt oder Komma als Tausendertrenner nur, wo der Wortlaut sie nicht als Dezimalzeichen erlaubt, Brüche (`½`, `1/2`), Abkürzungen mit und ohne Punkt, Einheit mit und ohne Leerzeichen, groß/klein, Umlaute. Nur was zu dieser Aufgabe passt; ohne Eingaben „keine“.
   - Nur Schreibweisen, keine Deutung: Was eine Schreibweise bedeutet, steht unter „Annahmen“, denn der Prüfer bekommt diesen Abschnitt.
   - Die Deutung folgt dem Wortlaut. Erlaubt er eine Schreibweise schon (z. B. „Dezimalzahlen mit Punkt“), bekommt sie keine zweite Bedeutung (`1.250` bleibt 1,25). Lässt er sie offen und hängt viel daran, ist das eine offene Frage (Punkt 5).
4. Randfälle nach `${CLAUDE_PLUGIN_ROOT}/skills/workflow/randfaelle.md` (aus Wortlaut und Code hergeleitet, dazu die Liste nach Bereichen): jeden offenen als Zeile unter „Annahmen“, `- <Randfall>: <Standard> (Grund)`; beim Bauen setzt du sie um und probierst sie aus.
5. Offene Punkte entscheidest du still und schreibst jeden als eine Zeile unter „Annahmen“: `- <Annahme> (Grund)`. Was sich nicht still festlegen lässt (Widerspruch oder Lücke im Wortlaut), wird eine Frage bei der Plan-Freigabe. Commit.
6. **Planprüfer** (klare Aufgabe: entfällt, weiter mit „Bauen“): `codecycle:plan-reviewer` mit dieser Startnachricht:
   ```
   Aufgabenordner: <ordner>
   Auftrag: Abgleich
   Bericht: <absoluter Pfad im Hauptordner>/reports/plan-pruefung.md
   ```
7. Funde nachbessern: je Fund den Plan ändern oder mit Grund lassen; Commit.
8. Plan kurz im Chat: je Schritt oder Teil eine Zeile, was nach der Prüfung geändert wurde, was offen bleibt (als Frage), Link auf `TASK.md`. Freigabe als einfache Frage „Gibst du den Plan frei?“ (freigeben / ändern).
9. Nach der Freigabe: Antwort im Wortlaut in den Verlauf, Kopfzeile `plan: freigegeben <JJJJ-MM-TT>`, Commit. Dann „Weiter oder neue Sitzung“.

### Bauen (frei)
- Reihenfolge, Tests zuerst oder danach, Zahl der Commits: frei. Nie `git commit --no-verify`; die Git-Hooks sind die Prüfung.
- **Hilfsagenten nur lesend:** Recherche und Erkunden mit Agenten ist frei (Zahl und Modell nach deinem Urteil); jeder Lauf erscheint mit Modell in den Kosten. Schreiben dürfen in der Aufgabe nur du und `codecycle:builder`; den Rest sperrt der Mod.
- **Klein und mittel** baust du selbst. **Groß** (`teile:` in `STATE.md`): je Teil ein frischer `codecycle:builder`, nacheinander in der Reihenfolge des Plans; er schreibt seine Tests selbst und zieht die Doku seines Teils mit. Du baust nicht selbst, außer kleinen Nacharbeiten beim Übernehmen; den Changelog-Eintrag schreibst du am Ende (3, Punkt 3), nie die Bauenden. Je Teil:
  1. `codecycle solo teil start <ordner> <name>`: Teil-Branch im Hauptordner (kein eigener Ordner), Teil `in-arbeit` mit Branch in `STATE.md`; die Ausgabe nennt die ersten Zeilen der Startnachricht.
  2. `codecycle:builder` starten, frisch, mit dieser Startnachricht:
     ```
     Aufgabenordner: <aus der Ausgabe>
     Branch: <aus der Ausgabe>
     Teil: <name> · <Zeile des Teils aus dem Plan>
     Stand: <aus der Ausgabe>
     Bericht: <aus der Ausgabe; je Teil eine eigene Datei>
     Testfälle:
     <Testfälle in Worten zu diesem Teil aus dem Plan>
     Doku: .claude/doku.json und Karte .claude/rules/codecycle-doku.md; Orte: <je Eintrag aus „orte“ und „festhalten“ in .claude/doku.json `name: pfad`>; Changelog: <changelog.datei> (<changelog.schema>), falls genannt
     ```
     Solange ein `builder` läuft, committest du nichts.
  3. **Übernehmen, schlank:** Quittung und Kurzbericht lesen, `git diff --stat <aufgaben-branch>`, `codecycle check`; Code nur gezielt, wenn etwas auffällt (die gründliche Prüfung macht der Prüfer am Ende). Korrekturen per Nachricht an denselben `builder`.
  4. **Prüfer je Teil**, nur mit Schalter `part-review` an und nur für Teile mit Merkmal ` · groß`:
     - `codecycle solo pruefung start <ordner> --teil <name>` (Wegwerf-Worktree am Stand des Teil-Branchs), dann `codecycle:final-reviewer` mit `Aufgabenordner: <ordner>`, `Auftrag: Teil`, `Teil: <name> · <Zeile des Teils>`, `Worktree:` und `Commit:` aus der Ausgabe, `Diff: git diff <aufgaben-branch> <Commit>`, `Testfälle:` des Teils.
     - Bei Funden (`TF1` …) genau eine Fixrunde per Nachricht an denselben `builder`; dann `codecycle solo pruefung ende <ordner>`, erneut `codecycle solo pruefung start <ordner> --teil <name>` (derselbe Ordner am neuen Stand) und Nachprüfung per Nachricht an denselben Prüfer: er markiert jeden Fund `behoben` oder `offen`.
     - Zuletzt `codecycle solo pruefung ende <ordner>`. Bleibt ein Fund `offen`, ist das ein Blocker (`zustand: blockiert`, Frage beim Wiedereinstieg).
  5. `codecycle solo teil fertig <ordner> <name>`: verlangt grün und alles committet (ohne Aufgabenordner), setzt den Teil `fertig`, zieht den Aufgaben-Branch nach und wechselt auf ihn. Bricht es ab (Uncommittetes, rote Tests, bewegter Aufgaben-Branch, fremder Branch, mit `part-review` bei einem Teil ` · groß` fehlender Teil-Bericht oder offener Fund), bleibt alles, wie es war; beheben, dann erneut.
  6. Verlauf in `STATE.md` (Teil, Agenten-ID, Ergebnis), Commit. Das ist der Rastplatz: Hier darf die Sitzung wechseln. Sind alle Teile fertig, weiter mit „3. Eigene Kontrolle“.
- **Füllstand:** Der Mod hängt ihn selbst an: nach `codecycle check` die Zeile „Hauptsitzung“, nach `codecycle solo check` und `solo teil start|fertig` die ganze Antwort von `codecycle_budget`. Eigene Abfrage nur, wenn noch keine Angabe vorliegt. Ohne Mod nach eigenem Urteil.

### 3. Eigene Kontrolle
1. Berührt die Aufgabe eine Oberfläche: selbst im Browser ansehen, Desktop und Handybreite 375 px, danach Browser schließen.
   - Server: `codecycle server --temp`, beenden mit `codecycle server --stop`.
   - Meldet es „--temp nicht eingerichtet“: am Code nachsehen, ob der Server Daten speichert. Dann dem Nutzer eine Frage mit Empfehlung und Gegenargument zum Eintrag in `.codecycle/tool.config.json`: `"serverTemp": { "ohneDaten": true }` (speichert nichts) oder `"serverTemp": { "env": "<Variable der Datendatei>" }`.
   - Steht `"ohneDaten": true` in `.codecycle/tool.config.json`, der Server speichert nach deiner Änderung aber Daten (Datei, Ordner, Datenbank): dieselbe Frage mit Empfehlung `"serverTemp": { "env": "<Variable der Datendatei oder des Datenordners>" }`; sonst landen Prüfdaten im Projekt.
   - Eintragen erst nach der Antwort (Kontrolldatei, nicht committen), danach `codecycle guard --record` (neue Grundlage; sonst wertet ein späteres `codecycle guard` die Änderung als Eingriff).
   - Ohne Eintrag keinen Server gegen echte Daten starten: Die Oberfläche bleibt ungeprüft, das kommt in den Verlauf von `STATE.md` und in die Startnachricht des Prüfers.
   - Nie `pkill -f`, `killall` oder `kill` mit Suchmuster: Das Muster trifft auch die eigene Shell, der Rest des Befehls läuft dann nicht.
2. Jede Schreibweise unter „Eingabeformate“ und jeden Erfolgssatz selbst ausprobieren (Kommandozeile, Schnittstelle oder Seite); was nicht stimmt, beheben.
3. **Doku** nach `.claude/doku.json` und der Karte `.claude/rules/codecycle-doku.md` nachziehen, auch wenn der Wortlaut sie nicht erwähnt: README, betroffene `CLAUDE.md`, Changelog in `changelog.datei` nach seinem Schema (Schema `erzeugt`: nicht anfassen), falls dort genannt, Chronik in `orte.chronik`, falls dort genannt (eine Zeile: Datum, was, Halbsatz Warum, Name der Aufgabe). Große Aufgabe: die Doku ihrer Teile haben die Bauenden mitgezogen; du prüfst sie und schreibst Changelog und Chronik. Braucht eine Datei keinen Eintrag (z. B. Bugfix ohne sichtbare Änderung), steht der Grund im Verlauf von `STATE.md`.
4. Alles committen.
5. `codecycle solo check <ordner>`:
   - Exit 0: grün, `geprueftAuf` und `haltepunkt: 3` stehen in `STATE.md`. Weiter.
   - Exit 1: beheben, committen, erneut.
   - **Risikobereiche:** Die Ausgabe nennt berührte Bereiche in einer Zeile `Risikobereiche: …`. Bereiche ohne Pfadmuster („selbst beurteilen“) beurteilst du am Diff; berührt er sie, ergänze sie in dieser Zeile mit den Dateien. Die Zeile kommt in den Verlauf von `STATE.md` und in die Startnachricht des Prüfers. Keine Frage an den Nutzer.
6. Verlauf in `STATE.md` ergänzen, Commit von `STATE.md` (Änderungen im Aufgabenordner zählen für die Sperre nicht).

### 4. Prüfung
1. Wegwerf-Worktree am geprüften Commit, neben dem Projekt, mit den Abhängigkeiten des Hauptordners: `codecycle solo pruefung start <ordner>` (nennt Worktree und Commit für die Startnachricht).
2. `codecycle:final-reviewer` starten, **nur** mit dieser Nachricht (keine Vermutungen, keine Annahmen, kein Plan, keine Meinung von dir; die Eingabeformate sind eine Mindestliste, er ergänzt eigene; die Erfolgssätze hat der Nutzer freigegeben, sie zählen wie seine Worte):
   ```
   Aufgabenordner: <ordner>
   Worktree: <absoluter Pfad des Worktrees>
   Commit: <geprueftAuf>
   Diff: git diff <basis> <geprueftAuf>
   Risikobereiche: <Zeile aus `codecycle solo check`, ergänzt nach Haltepunkt 3> | keine
   Eingabeformate:
   <Abschnitt „Eingabeformate“ aus TASK.md, unverändert>
   Erfolgssätze:
   <Abschnitt „Erfolgssätze“ aus TASK.md, unverändert; fehlt er: keine>
   Wortlaut:
   <Abschnitt „Wortlaut“ aus TASK.md, unverändert>
   ```
   `<basis>` nennt die Ausgabe von `codecycle solo check`. Verweigert der Mod den Start, nennt die Meldung den fehlenden Schritt.
3. **Zweiter Prüfer:** Nennt `codecycle solo check` die Zeile „Zweiter Prüfer: ja“, startest du nach der Quittung des ersten `codecycle:final-reviewer` ein zweites Mal, frisch (kein Folgeauftrag), im selben Worktree, mit derselben Nachricht und direkt unter `Aufgabenordner:` der Zeile `Auftrag: Sicherheit`. Nacheinander, nicht gleichzeitig: Beide starten Server. Er schreibt `reports/pruefung-sicherheit.md` mit Funden `Z1`, `Z2` …
4. Nach der letzten Quittung: `codecycle solo pruefung ende <ordner>` (entfernt erst die Verweise, nie `git worktree remove --force` auf diesen Worktree); `codecycle solo funde <ordner>` setzt `haltepunkt: 4` (Exit 1 heißt hier nur: Funde noch ohne Status); Bericht und `STATE.md` committen, erst dann nachbessern.

### 5. Nachbesserung (eine Runde)
1. Lies den Bericht (mit zweitem Prüfer beide). Je Fund (`M1`, `M2` …, `Z1` …) unter „Funde“ in `TASK.md` genau eine Zeile:
   - `- M1: behoben (<commit>)`: zutreffend und behoben;
   - `- M2: verworfen: <Grund>`: nicht zutreffend, mit nachprüfbarem Grund;
   - `- M3: offen: Frage an den Nutzer`: nur für Abweichungen vom Wortlaut;
   - `- M4: offen: Nebenfund`: für Funde „Nebenfund:“ (Fehler, die vor der Aufgabe bestanden).
2. **Abweichung vom Wortlaut nie still verwerfen:** Sie wird eine Frage an den Nutzer im Abschluss; Empfehlung: den Wortlaut einhalten.
3. **Nebenfunde nicht nachbessern:** Die Aufgabe bleibt so groß wie bestellt; jeder Nebenfund wird eine Frage im Abschluss. Hat der Diff den Fehler doch verursacht oder verlangt der Wortlaut die Stelle, ist er kein Nebenfund: Status wie bei jedem Fund, dahinter `· kein Nebenfund: <Grund>` (z. B. `- M4: behoben (<commit>) · kein Nebenfund: <Grund>`).
4. Nach den Korrekturen `codecycle check` grün, Commit. Keine erneute Prüfung.
5. `codecycle solo funde <ordner>`: setzt `haltepunkt: 5`, sobald jeder Fund einen Status hat; Exit 1 ist nur mit offenen Wortlaut-Fragen und Nebenfunden in Ordnung. Commit.

### 6. Abschluss
1. Hat die Nachbesserung Sichtbares geändert, Doku und Changelog dazu nachziehen; Commit.
2. `codecycle effort <ordner> --record` für die Kosten (gewichtete Tokens von Sitzung mit Modell, codecycle-Agenten und fremden Agenten). Modell je Agentenlauf: `agents.json` im Aufgabenordner.
3. `STATE.md`: `zustand: geprueft`, `haltepunkt: 6`, Nächster Schritt „Merge auf Ja“; Commit.
4. Letzte Nachricht, in dieser Reihenfolge, kurze Punkte:
   - **Gebaut:** 2–4 Sätze in einfachen Worten.
   - **Funde:** je Fund Titel und Status, verworfene mit Grund; ohne Nebenfunde.
   - **Nebenfunde:** je Nebenfund Titel, Beleg in einem Satz und was er für Nutzer bedeutet (oder „keine“).
   - **Annahmen:** die Zeilen aus `TASK.md`.
   - **Bauende:** je Teil Rolle und Ergebnis (oder „keine“).
   - **Kosten:** die Zeile aus `effort --record`, Modelle je Agentenlauf.
   - Ganz unten **„Entscheidungen für dich“**, Fragen nummeriert, Format nach „Fragen an den Nutzer“ im Workflow-Skill: zuerst offene Wortlaut-Fragen, dann je Annahme `Abweichung:` eine Frage (behalten oder wie im Wortlaut; Empfehlung und Gegenargument nach deinem Urteil), dann je Nebenfund eine Frage (jetzt beheben, als eigene Aufgabe merken oder verwerfen; Empfehlung und Gegenargument nach deinem Urteil), dann die Merge-Frage nach `${CLAUDE_PLUGIN_ROOT}/skills/workflow/merge.md`, Abschnitt „Merge-Frage“. <!-- doku-ok -->
5. **Antwort auf eine Wortlaut-Frage:** ändern → beheben, Commit, Status `behoben`; so lassen → `verworfen: Nutzer: „<Antwort>“`. Dann `codecycle solo funde <ordner>` erneut.
   - **Antwort auf einen Nebenfund:** jetzt beheben → beheben, Commit, Status `behoben (<commit>)`; merken → ein neuer Bug im Bug-Ordner aus `.claude/doku.json` (`festhalten.bug`): vorher dessen `README.md` (Übersicht) lesen, Kopf und Abschnitte nach der Anleitung des Ordners (`CLAUDE.md` im Ordner; bei einer angedockten Sammlung die Regeldatei, die die Karte nennt), nicht fest: deren Pflichtfelder, offener Statuswert und Abschnitte (ohne eigenes Schema `status: offen`, `wichtigkeit: normal`, `ergebnis` und `erledigt-durch` leer); Inhalt aus dem Beleg (nachstellen, erwartet, tatsächlich), dazu der Name der Aufgabe; Commit, Status `gemerkt: <Pfad>`. Fehlt der Bug-Ordner, lege ihn ohne Fragen an: `codecycle-doku-einrichten --nachtragen bug` im Hauptordner (Grundausstattung des Ordners), dann merken und in der Antwort melden „Bug-Ordner <Pfad> angelegt“. Exit 3 (keine `.claude/doku.json`): kein Bug; der Nebenfund mit Beleg kommt in `STATE.md` unter „Offene Fragen“, Status `gemerkt: STATE.md`, und die Antwort nennt ihn unter „Offene Punkte“ mit dem Hinweis auf `/codecycle-doku:einrichten`; verwerfen → `verworfen: Nutzer: „<Antwort>“`. <!-- doku-ok -->
   - **Antwort auf eine Abweichung:** behalten → hinter die Annahme `· Nutzer: „<Antwort>“`; wie im Wortlaut → zurückbauen, Commit, Annahme mit `· zurückgebaut (<commit>)`.
6. **Merge nur auf ausdrückliches Ja**, Ablauf nach `${CLAUDE_PLUGIN_ROOT}/skills/workflow/merge.md`, Abschnitt „Ja“: `zustand: fertig`, Abschluss-Commit im Aufgaben-Branch, auf den Hauptbranch wechseln, `git merge codecycle/<thema>`, bei „Ja, mergen und Branches löschen“ `git branch -d codecycle/<thema>`. Verweigert der Mod den Merge, nennt die Meldung, was fehlt.

### Weiter oder neue Sitzung
- **Nach der Freigabe von Entwurf und Plan** fragst du nach der Zeile „Hauptsitzung“ von `codecycle_budget`: „keine“ → ohne Frage hier weiter. Sonst schlägst du eine ganz neue Sitzung vor (keine Untersitzung), als Frage mit „a) Empfehlung: neue Sitzung …“ und „b) Dagegen spricht: …“ (was hier weiterzumachen für sich hat), und wartest die Antwort ab. Ohne Mod nach eigenem Urteil.
- **An anderen Haltepunkten** wechselst du nur, wenn die Zeile „Hauptsitzung“ es empfiehlt, an einem Haltepunkt (1–6) oder nach einem fertigen Teil (`solo teil fertig`, Verlauf committet).
- Vor jedem Wechsel `STATE.md` vollständig und committet; nie, während ein Agent läuft (erst seine Quittung); nie mit offener Frage an den Nutzer (erst die Antwort, im Wortlaut festgehalten); Abwägungen, die nur im Verlauf stehen, vorher in `TASK.md` („Annahmen“) oder `STATE.md` („Nächster Schritt“, „Offene Fragen“).
- Dann eine Zeile zum Einfügen: „Neue Sitzung: `/clear`, dann `/codecycle:continue`.“

### Nächster Schritt je Stand
Gilt hier und für `/codecycle:continue`. Dafür liest du `STATE.md`, die Überschriften von `TASK.md` („Aufgabe alter Art“: kein Abschnitt „Erfolgssätze“) und ob `reports/plan-pruefung.md` existiert.

| Stand in `STATE.md` | nächster Schritt |
|---|---|
| kein Ordner, Gespräch läuft | Brainstorming fortsetzen |
| `haltepunkt: 1`, `entwurf:` fehlt, nicht alter Art | Entwurf vorlegen und freigeben lassen (1, Punkt 7) |
| `haltepunkt: 1`, `entwurf: freigegeben` oder `entwurf: klar` | Plan schreiben (2) |
| `haltepunkt: 2`, `plan:` fehlt, nicht `entwurf: klar`, kein `reports/plan-pruefung.md` | Plan fertigschreiben, Planprüfer starten (2, Punkt 6) |
| `haltepunkt: 2`, `plan:` fehlt, nicht `entwurf: klar`, Bericht liegt vor | Funde nachbessern, Plan vorlegen (2, Punkt 7) |
| `haltepunkt: 2`, `plan: freigegeben` oder `entwurf: klar` | bauen; mit `teile:` ein Teil `in-arbeit` → weiterbauen nach `/codecycle:continue`, sonst der erste Teil, der nicht `fertig` ist; alle fertig → Eigene Kontrolle |
| `haltepunkt` 1 oder 2, alter Art | Plan als Kurzplan (3–10 Zeilen unter „Kurzplan“), ohne Planprüfer und Freigabe, dann bauen |
| `haltepunkt: 3` / `4` / `5` / `6` | Prüfung / Nachbesserung / Abschluss / Merge-Frage |

## Ergebnis
Aufgabenordner mit `TASK.md` (Wortlaut, Entwurf, Plan, Annahmen, Funde), `STATE.md` (`weg: solo`), `reports/plan-pruefung.md`, `reports/pruefung.md`; Branch `codecycle/<thema>`; nach dem Ja im Hauptbranch gemergt, `zustand: fertig`.

## Nächster Schritt
Ohne Antwort auf die Merge-Frage: neue Sitzung, `/codecycle:continue` setzt am Haltepunkt fort und wiederholt die Frage.
