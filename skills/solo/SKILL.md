---
description: "Solo-Weg: Die Sitzung baut die Aufgabe selbst, ein frischer Prüfer prüft gegen den Wortlaut, eine Runde Nachbesserung, dann die Merge-Frage."
argument-hint: "<Beschreibung der Aufgabe>"
disable-model-invocation: true
---

# /codecycle:solo

## Zweck
Eine Aufgabe auf dem Solo-Weg: **Du baust selbst** (Code, Tests, Doku, Commits). Am Ende prüft ein frischer Prüfer (`codecycle:solo-reviewer`) gegen den Wortlaut des Nutzers, du besserst einmal nach, dann folgt die Merge-Frage.

**Leitsatz:** Ziel ist das Ergebnis, das die Aufgabe am besten erfüllt, so genau wie möglich, mit so wenig Tokens wie dafür nötig; sparen heißt nicht weglassen. Jeder Agent baut eigenen Kontext auf und kostet Limit. Mehrere gleichzeitig lohnen sich, wenn sich die Arbeit aufteilen lässt (getrennte Bereiche oder ein großer Bereich in Teilen) oder deine Sitzung sonst zu voll würde: Zu voll heißt, die anstehende Arbeit brächte die Zeile „Hauptsitzung“ von `codecycle_budget` über 500 000 Tokens.

**Maßstab:** Der Wortlaut ist der Maßstab, an dem Abweichungen sichtbar werden, keine Vorschrift ohne Fehler. Rangfolge: eine Antwort des Nutzers vor dem Wortlaut, der Wortlaut vor deinem Plan. Du darfst abweichen, wenn du es besser weißt, aber nie still: Jede Abweichung steht als Annahme mit Grund da und wird im Abschluss eine Frage an den Nutzer.

Innen arbeitest du frei; fest sind sechs Haltepunkte. Drei davon sperrt der Mod: ohne grünen `codecycle solo check` kein Prüfer, ohne Prüfbericht und ohne Status je Fund kein Merge.

**Haltepunkte:** Jeder Haltepunkt steht als `haltepunkt: <n>` in `STATE.md`; `STATE.md` ist danach vollständig (Sitzung wegwerfbar).

| # | Haltepunkt | Fest |
|---|---|---|
| 1 | Start | Ordner, `TASK.md` mit Wortlaut, `STATE.md` mit `weg: solo`, Branch |
| 2 | Kurzplan | 3–10 Zeilen in `TASK.md` (groß: Plan in Teilen, nach jedem Teil Zwischen-Haltepunkt 2.n), Annahmen; ohne Freigabe |
| 3 | Eigene Kontrolle | Doku nachgezogen, alles committet, `codecycle solo check` grün, Oberfläche selbst angesehen |
| 4 | Prüfung | frischer Prüfer gegen den Wortlaut, ab zwei Risikobereichen dazu ein zweiter für Sicherheit; nicht überspringbar |
| 5 | Nachbesserung | jeder Fund `behoben` oder `verworfen: <Grund>`; Abweichung vom Wortlaut als Frage |
| 6 | Abschluss | festes Format, Merge-Frage |

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Beschreibung der Aufgabe: $ARGUMENTS
- `.claude/codecycle.md` im Projekt; fehlt sie, zuerst `${CLAUDE_PLUGIN_ROOT}/skills/setup/SKILL.md`, danach hierher zurück.
- Werkzeug: `codecycle <befehl>`; meldet die Shell „command not found“, `"${CLAUDE_PLUGIN_ROOT}/bin/codecycle" <befehl>`, sonst `node <Hauptordner>/.codecycle/tool/cli.ts <befehl>`. Exit 0 grün, 1 rot, 2 Werkzeug kaputt (dann `codecycle:toolsmith`, die Änderung gibt der Nutzer frei).

## Schritte

### 1. Start
1. Ist die Beschreibung leer, frage danach (eine Frage).
2. `codecycle selftest`. Fehlt etwas, frage, ob nachinstalliert werden soll (Kopie veraltet: `/codecycle:update` anbieten). Ein fehlender Graph ist nur ein Hinweis.
3. **Weg prüfen**, ohne Code zu lesen (kommst du aus `/codecycle:new`, ist der Weg geklärt; weiter bei Punkt 4):
   - Risikobereiche aus `.claude/codecycle.md` sind kein Grund zu fragen; sie prüft der Prüfer zusätzlich auf Sicherheit, ab zwei berührten ein zweiter Prüfer (Haltepunkt 4).
   - Fragen nur, wenn die Beschreibung etwas schwer Rückgängiges verlangt (Datenmigration, Löschen, Veröffentlichen, Zahlungen). Sonst keine Frage.
   - Die Frage steht ganz unten unter „Entscheidungen für dich“: „1a: Voller Ablauf (`/codecycle:new`)“ und „1b: Solo-Weg“, je mit Folge, dazu „Empfehlung: 1a“ oder „Empfehlung: 1b“ mit Grund. Die Empfehlung ist dein Urteil und passt zur Begründung. Vor der Antwort legst du nichts an.
   - Weg und Antwort im Wortlaut kommen in den Verlauf von `STATE.md`.
4. Thema als kurzer Name (Kleinbuchstaben, Bindestriche); Ordner `docs/codecycle/<JJJJ-MM-TT>-<thema>/` mit `reports/.gitkeep`; Branch `codecycle/<thema>` vom Hauptbranch (`git switch -c codecycle/<thema>`).
5. `TASK.md` aus `${CLAUDE_PLUGIN_ROOT}/skills/workflow/templates/TASK.md` mit nur diesen Abschnitten: „Wortlaut“ (Beschreibung unverändert als Zitat, `> ` vor jeder Zeile, auch Tippfehler bleiben; danach nie mehr bearbeiten), „Ziel“ (1–3 Sätze), „Kurzplan“, „Eingabeformate“, „Annahmen“, „Funde“.
6. `STATE.md` aus `${CLAUDE_PLUGIN_ROOT}/skills/workflow/templates/STATE.md`: `weg: solo`, `haltepunkt: 1`, `zustand: erfasst`, `art`, `groesse: klein` (`gross` bei mehr als 10 Dateien oder mehreren Bereichen), `branch`, `zuletzt` heute, `budget` mit Nullen, **keine** Zeile `pakete:`; Verlauf „<Datum> erfasst (solo)“.
7. Commit.

### 2. Kurzplan
1. `haltepunkt: 2`, `zustand: in-arbeit`.
2. In `TASK.md` unter „Kurzplan“ 3–10 Zeilen: Dateien, Vorgehen, wie du es prüfst. Keine Freigabe abwarten.
   - **Groß** (`groesse: gross`): Plan in Teilen statt Kurzplan, etwa 10–40 Zeilen. Je Teil eine Zeile `- Teil <name>: <was> · Dateien · Schnittstelle zu anderen Teilen · Prüfweg`, in der Reihenfolge des Bauens. Jeder Teil passt in eine Sitzung. Dann `codecycle solo plan <ordner> <teil> …` (Namen wie im Plan, in dieser Reihenfolge) und Commit. Dem Nutzer zeigst du den Plan in einer Zeile (Zahl und Namen der Teile), ohne auf Freigabe zu warten.
   - Getrennte Bereiche mit fester Schnittstelle (z. B. Frontend und Backend) baust du in der Regel gleichzeitig als Teile mit `codecycle solo teil` (Abschnitt „Bauen“); bleibst du nacheinander, steht der Grund im Verlauf von `STATE.md`.
   - Bestehende Meldungen, Formate, Schnittstellen und Seiten bleiben wörtlich gleich, außer der Wortlaut verlangt eine Änderung. Weichst du bewusst vom Wortlaut oder vom Bestand ab, auch mit einer besseren Idee, steht das unter „Annahmen“ als `- Abweichung: <was> statt „<Zitat oder Bestand>“ (Grund)`.
3. Unter „Eingabeformate“ je Eingabe die Schreibweisen, die Nutzer dieser Aufgabe realistisch tippen oder einfügen: Komma oder Punkt, Tausendertrenner mit Leerzeichen (`1 000`), Punkt oder Komma als Tausendertrenner nur, wo der Wortlaut sie nicht als Dezimalzeichen erlaubt, Brüche (`½`, `1/2`), Abkürzungen mit und ohne Punkt, Einheit mit und ohne Leerzeichen, groß/klein, Umlaute. Nur was zu dieser Aufgabe passt; ohne Eingaben „keine“.
   - Nur Schreibweisen, keine Deutung: Was eine Schreibweise bedeutet, steht unter „Annahmen“, denn der Prüfer bekommt diesen Abschnitt.
   - Die Deutung folgt dem Wortlaut. Erlaubt er eine Schreibweise schon (z. B. „Dezimalzahlen mit Punkt“), bekommt sie keine zweite Bedeutung (`1.250` bleibt 1,25). Lässt er sie offen und hängt viel daran, ist das eine Lücke im Wortlaut (Punkt 5).
4. Randfälle nach `${CLAUDE_PLUGIN_ROOT}/skills/workflow/randfaelle.md` (aus Wortlaut und Code hergeleitet, dazu die Liste nach Bereichen): jeden offenen als Zeile unter „Annahmen“, `- <Randfall>: <Standard> (Grund)`; beim Bauen setzt du sie um und probierst sie aus.
5. Offene Punkte entscheidest du still und schreibst jeden als eine Zeile unter „Annahmen“: `- <Annahme> (Grund)`. Fragen nur bei einem Widerspruch oder einer Lücke im Wortlaut, die sich nicht still festlegen lässt; dann eine gebündelte Frage.

### Bauen (frei)
- Reihenfolge, Tests zuerst oder danach, Zahl der Commits: frei. Nie `git commit --no-verify`; die Git-Hooks sind die Prüfung.
- **Hilfsagenten nur lesend:** Recherche und Erkunden mit Agenten ist frei (Zahl und Modell nach deinem Urteil); jeder Lauf erscheint mit Modell in den Kosten. Schreiben dürfen in einer Solo-Aufgabe nur du, `codecycle:builder-logic` und `codecycle:builder-routine`; den Rest sperrt der Mod.
- **Abgabe an Handwerker:** Teile (Logik mit Tests: `builder-logic`; gleichförmige Änderungen: `builder-routine`) darfst du abgeben, nach dem Leitsatz oben; ob, wie viele und ob gleichzeitig, entscheidest du.
  - **Eine Abgabe allein:** im Aufgaben-Branch im Hauptordner. Startnachricht: `Aufgabenordner: <ordner>`, `Solo: ja`, `Branch: codecycle/<thema> (Hauptordner, kein Worktree)`, `Teil: <was genau, Dateien, Prüfweg>`.
  - **Gleichzeitig:** je Teil `codecycle solo teil start <ordner> <name>` (Name aus Kleinbuchstaben, Ziffern, `-`); die Ausgabe nennt die Zeilen für die Startnachricht (mit `Worktree:`), dazu `Teil: <was genau, Dateien, Prüfweg>`. Teile, die dieselben Dateien ändern, führen eher zu Merge-Konflikten.
  - **Übernehmen, schlank:** Quittung und Kurzbericht lesen, `git -C <worktree> diff --stat <aufgaben-branch>`, `cd <worktree> && codecycle check`; Code nur gezielt, wenn etwas auffällt (die gründliche Prüfung macht der Solo-Prüfer). Dann `codecycle solo teil fertig <ordner> <name>`: Merge in den Aufgaben-Branch, Worktree und Branch weg. Bei Konflikt bricht es ab und der Teil bleibt; lösen oder den Handwerker per Nachricht nachziehen lassen, dann erneut.
  - **Füllstand:** Der Mod hängt ihn selbst an: nach `codecycle check` die Zeile „Hauptsitzung“, nach `codecycle solo check` und `solo teil start|fertig` die ganze Antwort von `codecycle_budget`. Danach richtest du Abgaben (Leitsatz oben); eigene Abfrage nur, wenn noch keine Angabe vorliegt. Ohne Mod nach eigenem Urteil.
  - Jede Abgabe kommt mit Rolle, Grund und gleichzeitig ja/nein in den Verlauf von `STATE.md`.
- **Zwischen-Haltepunkt (groß):** Ist ein Teil fertig, den du selbst gebaut hast: `codecycle solo zwischenstand <ordner> <teil>` (grün und alles committet, setzt den Teil auf `fertig`), Verlauf in `STATE.md`, Commit. Ein gleichzeitiger Teil wird mit `codecycle solo teil fertig` fertig. Sind alle Teile fertig, weiter mit „3. Eigene Kontrolle“.

### 3. Eigene Kontrolle
1. Berührt die Aufgabe eine Oberfläche: selbst im Browser ansehen, Desktop und Handybreite 375 px, danach Browser schließen.
   - Server: `codecycle server --temp`, beenden mit `codecycle server --stop`.
   - Meldet es „--temp nicht eingerichtet“: am Code nachsehen, ob der Server Daten speichert. Dann dem Nutzer in einer Frage den Eintrag in `.codecycle/tool.config.json` vorschlagen, Empfehlung zuerst: `"serverTemp": { "ohneDaten": true }` (speichert nichts) oder `"serverTemp": { "env": "<Variable der Datendatei>" }`.
   - Steht `"ohneDaten": true` in `.codecycle/tool.config.json`, der Server speichert nach deiner Änderung aber Daten (Datei, Ordner, Datenbank): dieselbe Frage mit Empfehlung `"serverTemp": { "env": "<Variable der Datendatei oder des Datenordners>" }`; sonst landen Prüfdaten im Projekt.
   - Eintragen erst nach der Antwort (Kontrolldatei, nicht committen), danach `codecycle guard --record` (neue Grundlage; sonst wertet ein späteres `codecycle guard` die Änderung als Eingriff).
   - Ohne Eintrag keinen Server gegen echte Daten starten: Die Oberfläche bleibt ungeprüft, das kommt in den Verlauf von `STATE.md` und in die Startnachricht des Prüfers.
   - Nie `pkill -f`, `killall` oder `kill` mit Suchmuster: Das Muster trifft auch die eigene Shell, der Rest des Befehls läuft dann nicht.
2. Jede Schreibweise unter „Eingabeformate“ selbst ausprobieren (Kommandozeile, Schnittstelle oder Seite); was nicht stimmt, beheben.
3. **Doku** nach dem „Doku-Aufbau“ in `.claude/codecycle.md` nachziehen, auch wenn der Wortlaut sie nicht erwähnt: README, Changelog, betroffene `CLAUDE.md`. Braucht eine Datei keinen Eintrag (z. B. Bugfix ohne sichtbare Änderung), steht der Grund im Verlauf von `STATE.md`.
4. Alles committen.
5. `codecycle solo check <ordner>`:
   - Exit 0: grün, `geprueftAuf` und `haltepunkt: 3` stehen in `STATE.md`. Weiter.
   - Exit 1: beheben, committen, erneut.
   - **Risikobereiche:** Die Ausgabe nennt berührte Bereiche in einer Zeile `Risikobereiche: …`. Bereiche ohne Pfadmuster („selbst beurteilen“) beurteilst du am Diff; berührt er sie, ergänze sie in dieser Zeile mit den Dateien. Die Zeile kommt in den Verlauf von `STATE.md` und in die Startnachricht des Prüfers. Keine Frage an den Nutzer.
6. Verlauf in `STATE.md` ergänzen, Commit von `STATE.md` (Änderungen im Aufgabenordner zählen für die Sperre nicht).

### 4. Prüfung
1. Wegwerf-Worktree am geprüften Commit, neben dem Projekt: `git worktree add --detach ../<projekt>--wt-solo-pruefung <geprueftAuf>`.
2. `codecycle:solo-reviewer` starten, **nur** mit dieser Nachricht (keine Annahmen, kein Kurzplan, keine Meinung von dir; die Eingabeformate sind eine Mindestliste, er ergänzt eigene):
   ```
   Aufgabenordner: <ordner>
   Worktree: <absoluter Pfad des Worktrees>
   Commit: <geprueftAuf>
   Diff: git diff <basis> <geprueftAuf>
   Risikobereiche: <Zeile aus `codecycle solo check`, ergänzt nach Haltepunkt 3> | keine
   Eingabeformate:
   <Abschnitt „Eingabeformate“ aus TASK.md, unverändert>
   Wortlaut:
   <Abschnitt „Wortlaut“ aus TASK.md, unverändert>
   ```
   `<basis>` nennt die Ausgabe von `codecycle solo check`. Verweigert der Mod den Start, nennt die Meldung den fehlenden Schritt.
3. **Zweiter Prüfer:** Nennt `codecycle solo check` die Zeile „Zweiter Prüfer: ja“, startest du nach der Quittung des ersten `codecycle:solo-reviewer` ein zweites Mal, frisch (kein Folgeauftrag), im selben Worktree, mit derselben Nachricht und direkt unter `Aufgabenordner:` der Zeile `Auftrag: Sicherheit`. Nacheinander, nicht gleichzeitig: Beide starten Server. Er schreibt `reports/pruefung-sicherheit.md` mit Funden `Z1`, `Z2` …
4. Nach der letzten Quittung: `git worktree remove --force <worktree>`; `codecycle solo funde <ordner>` setzt `haltepunkt: 4` (Exit 1 heißt hier nur: Funde noch ohne Status); Bericht und `STATE.md` committen, erst dann nachbessern.

### 5. Nachbesserung (eine Runde)
1. Lies den Bericht (mit zweitem Prüfer beide). Je Fund (`M1`, `M2` …, `Z1` …) unter „Funde“ in `TASK.md` genau eine Zeile:
   - `- M1: behoben (<commit>)`: zutreffend und behoben;
   - `- M2: verworfen: <Grund>`: nicht zutreffend, mit nachprüfbarem Grund;
   - `- M3: offen: Frage an den Nutzer`: nur für Abweichungen vom Wortlaut.
2. **Abweichung vom Wortlaut nie still verwerfen:** Sie wird eine Frage an den Nutzer im Abschluss; Empfehlung: den Wortlaut einhalten.
3. Nach den Korrekturen `codecycle check` grün, Commit. Keine erneute Prüfung.
4. `codecycle solo funde <ordner>`: setzt `haltepunkt: 5`, sobald jeder Fund einen Status hat; Exit 1 ist nur mit offenen Wortlaut-Fragen in Ordnung. Commit.

### 6. Abschluss
1. Hat die Nachbesserung Sichtbares geändert, Doku und Changelog dazu nachziehen; Commit.
2. `codecycle effort <ordner> --record` für die Kosten (gewichtete Tokens von Sitzung mit Modell, codecycle-Agenten und fremden Agenten). Modell je Agentenlauf: `agents.json` im Aufgabenordner.
3. `STATE.md`: `zustand: geprueft`, `haltepunkt: 6`, Nächster Schritt „Merge auf Ja“; Commit.
4. Letzte Nachricht, in dieser Reihenfolge:
   - **Gebaut:** 2–4 Sätze in einfachen Worten.
   - **Funde:** je Fund Titel und Status, verworfene mit Grund.
   - **Annahmen:** die Zeilen aus `TASK.md`.
   - **Abgaben:** an welche Rolle, was, warum (oder „keine“).
   - **Kosten:** die Zeile aus `effort --record`, Modelle je Agentenlauf.
   - Ganz unten **„Entscheidungen für dich“**, nummeriert, je Frage Erklärung, Antworten, Folge, Empfehlung: zuerst offene Wortlaut-Fragen, dann je Annahme `Abweichung:` eine Frage (behalten oder wie im Wortlaut, Empfehlung nach deinem Urteil), dann die Merge-Frage „Aufgabe X ist geprüft und noch nicht in <Hauptbranch>: jetzt mergen und die Branches löschen?“ mit „Ja, mergen und Branches löschen“ (Standard; bei offenen Wortlaut-Fragen „Später“), „Nur mergen, Branches behalten“, „Später“. <!-- doku-ok -->
5. **Antwort auf eine Wortlaut-Frage:** ändern → beheben, Commit, Status `behoben`; so lassen → `verworfen: Nutzer: „<Antwort>“`. Dann `codecycle solo funde <ordner>` erneut.
   - **Antwort auf eine Abweichung:** behalten → hinter die Annahme `· Nutzer: „<Antwort>“`; wie im Wortlaut → zurückbauen, Commit, Annahme mit `· zurückgebaut (<commit>)`.
6. **Merge nur auf ausdrückliches Ja**, Ablauf wie `${CLAUDE_PLUGIN_ROOT}/skills/workflow/steps/7-finish.md` Punkt 5 („Ja“, Unterpunkte 1–4 und 6): `zustand: fertig`, Abschluss-Commit im Aufgaben-Branch, auf den Hauptbranch wechseln, `git merge codecycle/<thema>`, bei „Ja, mergen und Branches löschen“ `git branch -d codecycle/<thema>`. Verweigert der Mod den Merge, nennt die Meldung, was fehlt.

### Neue Sitzung (an jedem Haltepunkt)
Empfiehlt die Zeile „Hauptsitzung“ eine neue Sitzung, wechselst du nur an einem Haltepunkt (1–6) oder Zwischen-Haltepunkt (2.n), mit `STATE.md` vollständig und committet:
- Nie, während ein Agent läuft: erst seine Quittung.
- Nie mit offener Frage an den Nutzer: erst die Antwort, im Wortlaut festgehalten.
- Abwägungen, die nur im Verlauf stehen, vorher in `TASK.md` („Annahmen“) oder `STATE.md` („Nächster Schritt“, „Offene Fragen“).
- Dann eine Zeile: „Neue Sitzung: `/clear`, dann `/codecycle:continue`.“

## Ergebnis
Aufgabenordner mit `TASK.md` (Wortlaut, Ziel, Kurzplan, Annahmen, Funde), `STATE.md` (`weg: solo`), `reports/pruefung.md`; Branch `codecycle/<thema>`; nach dem Ja im Hauptbranch gemergt, `zustand: fertig`.

## Nächster Schritt
Ohne Antwort auf die Merge-Frage: neue Sitzung, `/codecycle:continue` setzt am Haltepunkt fort und wiederholt die Frage.
