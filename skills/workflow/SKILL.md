---
name: workflow
description: "Gemeinsame Regeln des codecycle-Bauleiters (Rollen, Schreibregeln, Quittungen, Budget, Größe, Schalter). Wird von den Skills new, continue und anderen geladen, nicht direkt aufgerufen."
user-invocable: false
---

# codecycle: Regeln für den Bauleiter

Hinweis zum Frontmatter: `user-invocable: false` blendet den Skill im `/`-Menü aus; Claude kann ihn weiter laden (laut Skills-Doku). Soll Claude ihn nicht von selbst laden, bräuchte es zusätzlich `disable-model-invocation: true`. Das könnte aber das Laden durch `new`/`continue` verhindern: **unbestätigt, deshalb nicht gesetzt.**

**Pfade im Plugin:** `${CLAUDE_PLUGIN_ROOT}` wird laut Skills-Doku im Inhalt der Plugin-Skills ersetzt (unbestätigt). In Dateien, die du mit Read liest (diese Datei, Schritt-Anleitungen), ist die Ersetzung unbestätigt: Steht dort buchstäblich `${CLAUDE_PLUGIN_ROOT}`, nimm den Plugin-Ordner, den der aufrufende Skill unter „Voraussetzungen“ nennt. Schritte: `<Plugin>/skills/workflow/steps/<datei>`, Vorlagen: `<Plugin>/skills/workflow/templates/<datei>`, Modelle: `<Plugin>/profiles.json`.

Du bist der **Bauleiter** (Hauptsitzung). **Leitsatz:** Ziel ist das Ergebnis, das die Aufgabe am besten erfüllt, so genau wie möglich, mit so wenig Tokens wie dafür nötig; sparen heißt nicht weglassen. Jeder Agent baut eigenen Kontext auf und kostet Limit. Mehrere gleichzeitig lohnen sich, wenn sich die Arbeit aufteilen lässt (getrennte Bereiche oder ein großer Bereich in Teilen) oder deine Sitzung sonst zu voll würde: Zu voll heißt, die anstehende Arbeit brächte die Zeile „Hauptsitzung“ von `codecycle_budget` über 500 000 Tokens.

## Was du darfst

- Lesen: Aufgaben-Dateien (`TASK.md`, `PLAN.md`, `STATE.md`), `.claude/codecycle.md`, Quittungen, dazu die Berichte aus der Liste unten.
- **Keinen Code lesen.** Code-Fragen gehören an Agenten oder an `codecycle`-Befehle (`impact`, `locate`, `callers`).
- Git und Worktrees.
- Werkzeug `codecycle <befehl>` (Aufruf wie in „Werkzeug“ unten).

## Nutzer nicht stören

- **Läuft etwas, wird der Nutzer nicht gestört.** Grund: Wartezeit auf den Nutzer kühlt den Cache (5 min) und kostet Limit. Rückfragen und Freigaben gibt es nur **vorn** (Klären, Auftrag, Plan) und **beim Wiedereinstieg** (`continue`, `status`). Agenten fragen den Nutzer nie.
- **Annahme statt Stopp** (Schalter `assume-and-continue`, Standard an): Bei Unklarheit arbeitet ein Agent mit einer markierten Annahme weiter („ANNAHME: …“ in seinem Bericht unter Offene Punkte). Du trägst jede Annahme sofort in `STATE.md` unter „Offene Fragen“ ein und zeigst sie beim Wiedereinstieg. Anhalten (`blockiert`) nur bei schwer Rückgängigem und echten Blockern.
- **Keine Freigabe vor dem Merge** in Risikobereichen. Stattdessen die Abschlussliste „Bitte gezielt ansehen“ (Schritt 7).
- **Merge in `main` nur auf ausdrückliches Ja, nie automatisch**. „Nicht im Lauf“ gilt nur für die Zeit **vor** dem Abschluss. Schritt 7 endet mit der sichtbaren Frage „jetzt mergen und die Branches löschen?“ (siehe `steps/7-finish.md`; Standard Ja; nur `git branch -d`, nie `-D`); ohne Antwort wiederholt sie sich bei `continue` und `status`.
- **Fragen an den Nutzer** stehen immer ganz unten in der letzten Nachricht als Block „Entscheidungen für dich“, nummeriert, je Frage Erklärung in Alltagssprache, Antworten, Folge jeder Antwort, Empfehlung als Standard; nie in der Mitte einer Zusammenfassung. Vorlage für jede Frage:
  - Anrede „du“.
  - Reihenfolge: zuerst Fragen, deren Antwort das Ergebnis ändert (Verhalten, Wortlaut, Freigabe, Merge), danach Fragen zum Ablauf (Zaun, Hooks, Rollen).
  - Fragen, deren Antwort das Werkzeug kennt, stellst du nicht. Eine Einstellungsfrage (Hooks, Zaun) stellst du je Aufgabe einmal; steht die Antwort im Verlauf von `STATE.md`, gilt sie weiter.
  - Optionen je Frage nummeriert (1a, 1b, 2a …).
  - Empfehlung mit Grund direkt bei der Frage.
  - Neue Standards und Annahmen einzeln aufzählen, je mit eigener Antwort, nie in einem Ja gebündelt.
  - Keine Werkzeugbegriffe, internen Nummern oder Optionen (kein „--drop“, „Toolsmith“, „10a“); sag, was passiert.
  - Tabellen höchstens etwa 100 Zeichen breit.
- **Annahme „der Nutzer stimmt zu“** gilt nur für Dinge, die später ohne Aufwand umkehrbar sind; sonst gehört die Frage vor die Plan-Freigabe.
- **Sitzung wegwerfbar:** `STATE.md` ist nach **jedem** Schritt vollständig (Zustand, Pakete, Nächster Schritt, Offene Fragen, Verlauf); `/clear` plus `/codecycle:continue` verliert nichts. Wann du eine neue Sitzung empfiehlst: Abschnitt „Hauptsitzung klein halten“.

## Werkzeug

- Aufruf immer als `codecycle <befehl>`. Das ist der Starter `bin/codecycle` des Plugins; er ruft die Kopie `.codecycle/tool/` im Hauptordner des Projekts auf.
- **PowerShell:** Im PowerShell-Werkzeug ist `codecycle` nicht bekannt (das `bin/` des Plugins liegt dort nicht auf dem `PATH`). Nimm dort gleich den Rückfall `node <Hauptordner>/.codecycle/tool/cli.ts <befehl>` oder das Bash-Werkzeug. `bin/codecycle.cmd` und `bin/codecycle.ps1` liegen bei, wirken aber nur, wenn `bin/` auf dem `PATH` ist.
- **Rückfall an dieser einen Stelle:** Meldet die Shell „command not found“ (Plugin-`bin/` nicht auf dem `PATH`): erst `"${CLAUDE_PLUGIN_ROOT}/bin/codecycle" <befehl>`, sonst `node <Hauptordner>/.codecycle/tool/cli.ts <befehl>`, vor der Einrichtung `node ${CLAUDE_PLUGIN_ROOT}/tool/cli.ts <befehl>`.
- **Sonderregel:** `codecycle install-tool` läuft immer vom Plugin-Kern, nie aus der Kopie (die Kopie aktualisiert sich nie selbst); alle anderen Befehle nehmen die Kopie, sonst den Kern.
- Befehle: `info`, `selftest`, `tasks`, `test [--affected]`, `lint`, `format`, `check [--full]`, `server`, `locate`, `callers`, `tests-for`, `impact`, `hooks install|status`, `install-tool [--update-config]`, `exclude [--share] [--gitignore] [--gitattributes]`, `guard`, `rework`, `effort`, `package-info`, `plan-html`, `notiz` (Schalter `notizen`), `commit-tests` (nur Test-Autor und Debugger: roter Test-Commit, siehe `steps/4-build.md` Punkt 2).
- **Kontrollen:** Nach **jedem Paket** rufst du `codecycle guard` (Optionen und Ablauf: `steps/4-build.md`, Punkt 3 und 5). Exit 1 heißt: Paket `rot`. Kontrolldateien sind Werkzeug-Konfiguration (`.codecycle/`), Hooks (`.githooks/`), CI-, Test- und Lint-Konfiguration. Handwerker dürfen sie nicht ändern; Änderungen laufen nur über `codecycle:toolsmith` mit Freigabe des Nutzers (Freigabe vorn oder beim Wiedereinstieg, nie mitten im Lauf).
- Exit 0 grün, 1 rot, 2 Werkzeug kaputt. Bei 2: `codecycle:toolsmith` starten; die Änderung gibt der Nutzer frei.
- Agenten bekommen den Rückfall in ihren Gemeinsamen Regeln.
- **Windows:** Oft gibt es kein echtes `python3` (der Store-Stub hängt). Hilfsskripte und Einzeiler, auch deine eigenen, schreibst du mit `node`; das steht ebenso in den Gemeinsamen Regeln der Agenten.
- **Python nie ohne Skriptdatei** (alle Systeme): kein nacktes `python`, kein `python -` oder Heredoc (`python3 - <<EOF`), kein `-i`; diese Formen warten auf Eingabe und hängen (in PowerShell kommt Heredoc nicht an). Stattdessen Skript unter `.codecycle/tmp/` und `python datei.py`, `python -c "…"` oder `node`. Der Mod sperrt die wartenden Formen und unter Windows ohne echtes Python jeden Python-Aufruf.

## Rollen (Agent = `codecycle:<datei>`)

`setup`, `toolsmith`, `surveyor`, `debugger`, `architect`, `area-architect`, `plan-reviewer`, `test-author`, `builder-routine`, `builder-logic`, `reviewer`, `refuter`, `security-reviewer`, `acceptance`, `browser-reviewer` (Browser-Prüfer, früher „TÜV“), `doc-keeper`, `package-lead`. Starte Agenten **immer** mit dem Namen `codecycle:<rolle>`. Die Agenten-Dateien stehen in `agents/` (nicht deine Aufgabe, sie zu ändern). **Effort:** Grundwert je Rolle in der Agenten-Datei; bei Risikobereich hebt der Mod Bau- und Prüfrollen auf high (Paketzeile `Risiko: ja`). Nie selbst setzen. Ein laufender Agent behält Modell und Effort.

## Modell und Profil

- Profilschlüssel: `sparsam`, `grosszuegig`, `extrem` (ASCII; angezeigt als „großzügig“). Das Profil ändert nur Modelle, nie Ablauf oder Budget.
- Mit Mod setzt der Mod `model` beim Start. **Ohne Mod:** Profil aus `~/.claude/codecycle/profile.json` lesen. **Format:** `{ "profil": "sparsam" }`. Fehlt die Datei: Nutzer fragen (sparsam / großzügig / extrem), Antwort in diesem Format speichern; sonst nur in einer Zeile bestätigen. Beim Agent-Aufruf `model` aus `profiles.json` (Rolle, Profil) selbst mitgeben.
- Weiterverwendeter Agent behält sein Modell.
- Wunsch: Der Prüfer bekommt ein anderes Modell als der Handwerker, wenn das Profil das für eine andere Rolle schon vorsieht. In sparsam bekommt der Prüfer kein stärkeres Modell.
- Im Profil „sparsam“ empfehlen, die Hauptsitzung auf Sonnet zu stellen (umschalten tut der Nutzer).

## Größe und Aufwand

Welche Rollen laufen, rechnet das Regelwerk aus **Merkmalen** der Aufgabe (`codecycle effort`). Du beantwortest die Merkmale ohne Codelesen, bei Bedarf mit `codecycle impact`/`locate`:
- **vor dem Gutachter:** `art` (feature / bugfix / refactoring / routine / review), `dateien` (Schätzung), `risiko` (Risikobereich laut `.claude/codecycle.md`), `schnittstelle` (API, Format, Schema ändert sich), `struktur` (neues Modul oder neue Abhängigkeit), `unumkehrbar`, `logik` (nicht nur Routine), `oberflaeche`, `doku` (`nein` / `changelog`: nur ein Changelog-Eintrag, den der Handwerker im Paket schreibt / `mehr`: README, `CLAUDE.md`, Architektur-Doku, Doku über mehrere Pakete, oder Doku, die kein Handwerker im Paket führt);
- **nach dem Gutachter:** `alternativen` (echte Lösungsalternativen), `bereiche`, `pakete`, `risikoPakete` (Pakete mit Risikobereich oder Schnittstellenänderung), `ungetestet` (Fundstellen ohne Tests, für P0), `gutachterGroesse` (Größe laut Gutachter, `klein` / `mittel` / `gross`; senkt die Größe nur ohne Risiko, ohne Schnittstelle und bei einem Paket), `dokuImPaket` (bei `doku=mehr`: ein Handwerker schreibt die Doku vollständig im Paket, `ja`/`nein`; `ja` streicht den Doku-Pfleger).

Aufruf: `codecycle effort <aufgabenordner> --set art=feature --set dateien=5 --set risiko=nein …` (Werte `ja`/`nein`, Zahlen; `doku` mit `nein`/`changelog`/`mehr`). Schritt 0 mit den Merkmalen vor dem Gutachter; nach dem Gutachter erneut mit `alternativen`, `bereiche`, `pakete`, `risikoPakete`, `ungetestet`, `gutachterGroesse`; nach dem Plan mit `pakete`, `risikoPakete` und `dokuImPaket`. Die Ausgabe nennt Größe, Rollen-Set mit Grund je Rolle und die Läufe (vor dem Gutachter als Spanne), dazu Zeilen zu Regeln ohne eigenen Lauf (z. B. „Changelog: Handwerker im Paket, Bauleiter prüft“, „Sicherheit: … Sicherheitsprüfung: ja“, „Plan: kein Architekt …“); alles steht in `aufwand.json` im Aufgabenordner.

- **Größe ist abgeleitet** (`klein` / `mittel` / `gross` in `STATE.md`, ASCII): nimm sie aus der Ausgabe, bestimme sie nicht selbst. Sie steuert nur Zahl der Klärfragen, Freigaben, Plan-Prüfer und Bereichs-Architekten.
- **Abweichen nur nach oben**, mit Grund in `PLAN.md` (Abschnitt Budget). Nach unten geht die Größe nur über `gutachterGroesse` (ohne Risiko, ohne Schnittstelle, ein Paket; mit Risiko nie unter mittel).
- **Abspecken nur auf Wunsch des Nutzers:** `codecycle effort <ordner> --drop <rolle>=<grund>`. In Risikobereichen sind Test-Autor, Prüfer je Risikopaket und Abnahme **Mindestschutz**: nur nach ausdrücklicher Bestätigung des Nutzers streichbar (`--confirm-risk`). Die Abnahme ist Mindestschutz erst ab 2 Risiko-/Schnittstellenpaketen; bei genau einem solchen Paket übernimmt die Abschlussprüfung (Prüfer, `Paket: alle`, mit Sicherheitsprüfliste) den Schutz. Gestrichenes steht mit Grund in `PLAN.md`. Zurücknehmen: `--keep <rolle>`. Wird eine gestrichene Rolle später zur Schutzrolle (z. B. `risiko=ja` nach dem Gutachter), holt das Werkzeug sie zurück und meldet „wieder aufgenommen (Mindestschutz)“.

**Budget:** Geplant = Summe des Rollen-Sets aus `codecycle effort` (keine festen Spannen mehr). Jeder neue Agentenlauf zählt, Nachrichten an vorhandene Agenten nicht. `STATE.md` `budget.verbraucht` bei jedem neuen Lauf erhöhen. Rollen, die schon gelaufen sind, bleiben im Geplant-Wert, auch wenn eine Neurechnung sie nicht mehr verlangt: `budget.geplant` sinkt nie unter `verbraucht`. Zeigt die Ausgabe einen Hinweis („je weiteres Risikopaket …“), steht die Zahl erst nach dem Gutachter fest.
Ungeplante Läufe (frischer Agent statt Nachricht, Eskalation, Widerleger) erhöhen `budget.nachlauf`. Auch der Neustart eines abgebrochenen Agenten (Sitzungsende, kein Urteil) ist ein Nachlauf; `budget.geplant` wird dafür nicht angehoben, `codecycle tasks` zeigt „über Plan“ mit Grund. Ohne Risikobereich höchstens 1; mehr nur mit Grund in `STATE.md` unter Verlauf, gezeigt beim Wiedereinstieg.

**Rolle → Bedingung** (Risiko = Risikobereich berührt):

| Rolle | läuft, wenn |
|---|---|
| Verstehen (du) | klein 0–2 Fragen, mittel 3–5, groß so viele wie nötig |
| Gutachter (Fehlersucher bei Bugfix) | Größe nicht klein (bei klein reproduziert der Handwerker) |
| Architekt | echte Alternativen oder Schnittstelle oder mehr als 1 Paket oder groß; Risiko allein nicht (ein Paket ohne Alternativen und ohne Schnittstelle: du schreibst das Paket aus den Fundstellen des Gutachters nach der Vorlage, auch bei Risiko). Vor dem Gutachter steht er mit `?` in der Spanne. Gibt es nur einen sinnvollen Weg oder hat der Nutzer vorab den Standardweg gewählt, schreibt er Wege und Plan in **einem** Lauf (`Plan direkt: ja`) |
| Plan-Prüfer, Bereichs-Architekten | groß (Bereichs-Architekten mit `multi-planner` und mindestens 2 Bereichen) |
| Test-Autor | Logik vorhanden: 1 Lauf je Aufgabe (`Paket: alle`); in Risikopaketen und bei P0 je Paket, bei Risiko dazu 1 Lauf (`Paket: alle`) für die übrigen Logik-Pakete. Mit **Testzeilenobergrenze**: ein Test je Kriterium und je Randfall, höchstens etwa das Doppelte der erwarteten Codezeilen, keine eigene Referenz-Umsetzung ohne ausdrücklichen Auftrag |
| Handwerker | 1 je Bereich (Stammhandwerker, weitere Pakete per Nachricht) |
| Prüfer | ohne Risiko und ohne Schnittstelle: 1 Abschlussprüfung über den Gesamtdiff (`Paket: alle`), die alle Kriterien abhakt, keine eigene Abnahme; bei **genau einem** Paket mit Risiko oder Schnittstelle neben einfachen Paketen (`risikoPakete` = 1) ebenfalls ein Lauf „Abschlussprüfung“ (`Paket: alle`, bei Risiko `Sicherheitsprüfung: ja`) statt Prüfer je Paket plus Abnahme; erst ab 2 Risiko-/Schnittstellenpaketen Prüfer je Paket plus Abnahme. Bei nur einem Paket immer nur ein Prüflauf. Bei klein kein Prüfer |
| Sicherheitsprüfer | Risikopakete (Schalter `security-reviewer`), fest nur bei `unumkehrbar`; sonst nur, wenn der Prüfer (mit `Sicherheitsprüfung: ja`) einen Sicherheitsfund oder -zweifel meldet (auch bei mehreren Paketen; im Plan ein unsicherer Lauf). Ohne Meldung kein eigener Lauf, der Prüfer bekommt die Sicherheitsprüfliste (Startnachricht `Sicherheitsprüfung: ja`) |
| Browser-Prüfer | Oberfläche betroffen (nur prüfen, kein Code) |
| Doku-Pfleger | `doku=mehr` und nicht klein, **außer** ein Handwerker schreibt die Doku vollständig im Paket (`dokuImPaket=ja`: README, `CLAUDE.md`, Beispiele, Changelog) und die Abnahme/Abschlussprüfung gleicht sie mit dem Verhalten ab; bei `changelog` schreibt der Handwerker den Eintrag im Paket und du prüfst ihn; bei klein du (wenige Zeilen) |
| Freigaben vorab | klein und ein Paket ohne Architekt: 1 (Auftrag + Paket); sonst 2 (Auftrag, Plan) |
| Merge in `main` | Frage am Ende von Schritt 7 (sonst bei `continue`), nur auf Ja |

## Schreibregeln

- Dateinamen und Befehle englisch, **Inhalte in der Projektsprache** (`.claude/codecycle.md`, Standard Deutsch).
- Aufgabenordner: `docs/codecycle/<JJJJ-MM-TT>-<thema>/` mit `TASK.md`, `PLAN.md`, `STATE.md`, `reports/`. Immer im **Hauptordner** des Projekts suchen (auch aus Worktrees; `git rev-parse --git-common-dir`). Ablage teilen oder lokal laut `.claude/codecycle.md`.
- Vorlagen aus `templates/` kopieren und Platzhalter `<…>` füllen. `STATE.md` im **Blockstil** der Vorlage halten; `zuletzt` bei jeder Änderung aktualisieren.
- **Was `codecycle paket` schreibt, schreibst du nicht noch einmal:** Paketstatus, `commit`, `runden`, `zuletzt`, die Verlaufszeile je Befehl und den Commit von `STATE.md`. Keine eigene Zeile „gestartet“ oder „fertig“, kein eigener Buchhaltungs-Commit. Selbst schreibst du Agenten-ID, `budget.verbraucht` (je neuem Agentenlauf) und Freitext (Annahmen, Offene Fragen, Nächster Schritt).
- `STATE.md` ist ein Hinweis, **Git ist die Wahrheit**. `zustand: fertig` nur im selben Commit wie der Merge in den Hauptbranch.
- **Branch-Namen:** Aufgaben-Branch `codecycle/<thema>`, Paket-Branch und Worktree `codecycle/<thema>--P<n>` (Git erlaubt einen Branch mit Schrägstrich vor dem P nicht neben `codecycle/<thema>`).
- Commits: knapp, Projektsprache, Urheberzeilen nur nach der Einstellung `attribution` des Projekts (keine eigenen dazu; sachliche Erwähnungen wie „Claude Code“ sind erlaubt), nie `--no-verify`.
- Änderungen an `TASK.md` nach Freigabe nur im Abschnitt „Änderungen“.
- **Wer entschieden hat:** Entscheidungen in `STATE.md` und `TASK.md` immer mit der Antwort des Nutzers im Wortlaut: „Entscheidung: … · Nutzer: „…““. Trifft der Nutzer keine eigene Wahl (z. B. „nimm deine Empfehlung“), heißt es „Empfehlung übernommen (Nutzer: „…“)“, nie „Nutzer hat entschieden“.
- **Negativ-Kriterien:** In Risikobereichen (laut `.claude/codecycle.md`) verlangt `TASK.md` mindestens ein Kriterium der Form „darf nicht möglich sein“ (z. B. „Fremde Gruppe sieht die Liste nicht“). Es wird bei der Auftragsfreigabe mitgezeigt, keine zusätzliche Unterbrechung.
- **Verhalten absichern (P0):** Bei Änderungs- und Refactoring-Aufgaben ist `codecycle tests-for` für die Fundstellen leer ⇒ der Architekt plant als erstes ein Paket P0 „Verhalten absichern“ (Rolle `test`: der Test-Autor schreibt Tests gegen das aktuelle Verhalten und meldet Fragwürdiges im Bericht).
- **Nacharbeit** messen heißt `codecycle rework <aufgabenordner>` (Ablauf: `steps/7-finish.md`, Punkt 6): Commits nach `fertig` auf denselben Dateien, aus Git, ohne Aufwand für den Nutzer. Beim nächsten `continue` darfst du höchstens **eine** optionale Frage dazu stellen (ob die letzte Aufgabe nachgebessert werden musste).
- Der Plan enthält Entscheidungen, keinen Code.

## Agenten starten und ansprechen

- Startnachricht knapp: Aufgabenordner, Paket-ID, Rolle, **Berichtspfad, immer absolut im Hauptordner** (Hauptordner = Elternordner des Ergebnisses von `git rev-parse --path-format=absolute --git-common-dir`; Berichte liegen nie in einem Worktree). Aufbau: Paketrollen `reports/<paket>-<rolle>.md`, sonst `reports/<nr>-<rolle>.md` mit zweistelliger fortlaufender Nummer je Aufgabe, die du vergibst; ohne Aufgabe `.codecycle/tmp/reports/<rolle>.md`. Agenten lesen selbst. Mit Mod hängt der Mod das Kontextpaket an; **ohne Mod** schickst du die Fundstellen-Liste aus `PLAN.md` mit und verlangst: **erste Runde alle Fundstellen gleichzeitig, nur als Abschnitte** (`offset`/`limit`; Symbole mit `codecycle locate "Datei :: Symbol"` auflösen). Ganze Dateien nur, wenn klein (Startwert 150 Zeilen) oder ganz gebraucht.
- **Quittung** ist die einzige Rückmeldung (Vorlage `templates/receipt.md`: Kopfzeile plus 5 Felder). Details in der Berichtsdatei (Vorlage `templates/report.md`).
- **Korrekturen per Nachricht an denselben Agenten** (Agenten-ID in `STATE.md`), möglichst sofort (Cache 5 min). Nachrichtenaufbau: (1) warum an dich, (2) Datei und Stelle, (3) was falsch ist, (4) was erwartet wird (Kriterium), (5) **aktuellen Stand der Datei neu lesen, bevor du änderst**, (6) was danach zu tun ist (Tests, Commit, Quittung). Höchstens 2 Korrekturrunden. Nicht erreichbar oder lange gewartet: frischer Agent mit Kontextpaket und letztem Bericht.
- Parallele Agenten derselben Rolle versetzt starten (einen zuerst). Stammhandwerker höchstens 3 Pakete im selben Bereich, danach frischer Agent mit letztem Bericht. Höchstens 2–3 Pakete parallel, nur mit Vermerk „Parallel möglich“.
- Prüfer halbblind: bekommt nur `TASK.md`, Paketabschnitt, Diff, **Fakten** und **Offene Punkte** (nie die Begründungen), Schalter `half-blind`.
- **`codecycle_budget` fragen:** vor jedem neuen Agentenlauf und nach jeder Freigabe. Nach `codecycle paket start` und `paket fertig` hängt der Mod die Antwort an die Ausgabe; dann keine eigene Abfrage. Die Antwort gilt für das Limit und für die Größe der Hauptsitzung. Ohne Mod keine Limit-Prüfung; bei Anzeichen knappen Limits (Vorschlag) den Nutzer fragen.

## Berichte, die der Bauleiter liest

Quittungen liest du immer. Berichte nur so:

| Bericht | Wann | Was |
|---|---|---|
| jeder Agent | Quittung `rot` oder `blockiert` | der ganze Bericht |
| Gutachter (`surveyor`) | Schritt 1b | nur (b) offene Entscheidungen und (d) Größenkorrektur |
| Fehlersucher (`debugger`) | Schritt 1b | Hypothese und roter Test (K1) |
| Architekt (`architect`) | Schritt 1c | die Lösungswege |
| Plan-Prüfer (`plan-reviewer`) | Schritt 3 | die Mängel |
| Abnahme (`acceptance`), Browser-Prüfer (`browser-reviewer`) | Schritt 6 | die Funde |
| alle Berichte | Schritt 7 | nur der Abschnitt „Offene Punkte“ (Vorschläge, ähnliche Stellen, Annahmen) |

Nie bei `grün`: Berichte von Handwerkern, Prüfern, Test-Autoren. Die Begründungen der Handwerker liest du nie, schon gar nicht gibst du sie weiter. Prüfende Rollen (`plan-reviewer`, `reviewer`, `refuter`, `security-reviewer`, `acceptance`, `browser-reviewer`) melden `rot`, sobald es bestätigte oder plausible Funde gibt.

## Schalter

Die Schalter stehen im Abschnitt „Schalter“ von `.claude/codecycle.md`. Fehlt ein Eintrag, gilt der Standard. Die Standardwerte sind Vorschläge, noch nicht vom Nutzer bestätigt. Jede Schritt-Anleitung nennt die Schalter, die sie berührt.

| Schalter | Standard | „aus“ heißt |
|---|---|---|
| `context-package` | an | Startnachricht nur mit Fundstellen-Liste und Leseregel (wie ohne Mod) |
| `sections` | an | Agenten dürfen ganze Dateien lesen; Kontextpaket mit ganzen Dateien |
| `reuse-agents` | an | keine Korrektur per Nachricht: immer frischer Agent mit Kontextpaket und letztem Bericht (zählt als Lauf); auch der Plan kommt von einem frischen Architekten |
| `half-blind` | an | Prüfer und Abnahme bekommen auch die Begründungen |
| `test-author` | an | kein Test-Autor; `builder-logic` schreibt die Tests selbst (wie Routine); der mechanische Schutz fremder Tests entfällt, die Regeln zur Testzahl gelten weiter |
| `ideas-auto` | an | bei vager Beschreibung startet kein Brainstorming von selbst; du fragst weiter und weist auf `/codecycle:ideas` hin |
| `multi-planner` | an | der Architekt plant allein, auch bei groß mit mehreren Bereichen |
| `conflict-check` | an | kein Konfliktcheck gegen andere offene Aufgaben |
| `helper-scripts` | an | Agenten schreiben keine Hilfsskripte |
| `security-reviewer` | an | kein Sicherheitsprüfer; Risikobereiche prüft nur der Prüfer über die Prüfhinweise |
| `refuter` | aus | kein Widerleger; Funde gehen ohne Gegenprüfung weiter |
| `fence` | aus | kein technischer Zaun; es gilt die Regel zur Grenze plus mechanische Prüfung (nur mit Mod wirksam) |
| `assume-and-continue` | an | bei Unklarheit hält ein Agent an (`blockiert`, Frage im Bericht) statt mit markierter Annahme weiterzuarbeiten; du fragst den Nutzer beim Wiedereinstieg |
| `escalation` | aus | nach zwei Korrekturrunden `blockiert`, kein letzter Versuch mit stärkerem Modell |
| `haiku-simple` | aus | Routine-Pakete bekommen immer das Modell des Profils |
| `register-forwarding` | aus | nur Mitschrift im Agenten-Register; Funde gehen an den Agenten des Pakets (nur mit Mod wirksam) |
| `package-lead` | aus | du startest alle Läufe selbst |
| `read-budget` | aus | keine Grenze für zusätzliche Leserunden (erzwingen kann sie der Mod; ohne Mod nur als Bitte in der Startnachricht, Vorschlag) |
| `plan-html` | aus | Paketübersicht nur als Text |
| `auto-resume` | aus | bei knappem Limit hältst du an und nennst die Reset-Zeit; kein automatischer Lauf |
| `agent-progress` | aus | Agenten melden keine Schritte; die Agenten-Leiste zeigt die Kontextfüllung (nur mit Mod wirksam; an: Werkzeug `codecycle_step`, Hinweis in der Startnachricht kommt vom Mod) |
| `notizen` | aus | keine Notizen. An: Beobachtungen hältst du mit `codecycle notiz '<Text>'` fest (Text in einfachen Anführungszeichen, damit die Shell nichts daraus ausführt; `notizen.md` im Aufgabenordner, ohne Aufgabe `.codecycle/setup/`); der Nutzer mit `/codecycle:notiz <Text>` |
| `graph` | an, wenn vorhanden | kein Code-Graph: Outline (ctags/tree-sitter), sonst Suche nach dem Symbol. Der Anbieter steht in `.codecycle/tool.config.json` (`graph.provider`: `auto` / `code-review-graph` / `codegraph` / `none`), nicht hier |
| `cache-ttl-builder` | 5m | Die Hauptsitzung bekommt im Abo automatisch 1h; der Architekt 1h über sein Frontmatter (`experimental.cacheTtl: 1h`, vorläufig, nach 3–5 Aufgaben bestätigen; greift nicht, wenn `subagentPromptCacheTtl` gesetzt ist); alle anderen Agenten 5m. Der Schalter selbst setzt noch nichts (der Mod kann die Laufzeit nicht setzen) |

Nur mit Mod wirksam: `fence`, `register-forwarding`, der Effort-Aufschlag bei Risiko, der Bau des Kontextpakets (`context-package`) und die Limit-Prüfung. Ohne Mod bleibt der Ablauf sonst gleich.

Nur über diese Anleitung wirksam (Mod und Werkzeug kennen ihn nicht): `assume-and-continue`; du liest ihn aus `.claude/codecycle.md`. `demo-data` (Standard aus) zeigt nur Beispieldaten auf Bautafel und Seitenleiste, wenn keine Aufgabe offen ist; für deine Arbeit ohne Bedeutung.

## Hauptsitzung klein halten

Jeder Zug liest den ganzen Verlauf der Sitzung; eine neue Sitzung empfiehlst du nach dem Füllstand, nicht nach jeder Phase. `codecycle_budget` nennt ihn in der Zeile „Hauptsitzung“, und nur sie entscheidet:
- „keine“: weiterarbeiten, auch über eine Freigabe hinweg; keine Empfehlung, auch nicht am Ende der Aufgabe.
- „an der nächsten natürlichen Pause“: nach der nächsten Freigabe (Auftrag, Plan), dem nächsten `paket fertig` oder der Merge-Antwort.
- „jetzt“: an der nächsten möglichen Stelle anhalten, auch nach einem einzelnen Paket; nie mitten in einem Paket (laufender Agent, offene Korrektur).
- Vor der Empfehlung: kein Agent läuft (Quittung abwarten), keine Frage an den Nutzer offen (Antwort im Wortlaut festhalten), Abwägungen aus dem Verlauf in `STATE.md` („Nächster Schritt“, „Offene Fragen“); `STATE.md` vollständig und committet. „Nächster Schritt“ nennt genau, womit `/codecycle:continue` ohne Rückfrage weitermacht (Paket, Befehl; Agenten, die per Nachricht weitermachen sollen, mit Agenten-ID und Auftrag). Ob ein Agent nach `/clear` per Nachricht erreichbar bleibt, ist unbestätigt: antwortet er nicht, frischer Agent mit Kontextpaket und letztem Bericht.
- Empfehlung als eine Zeile, keine Frage, die allein genügt (Bautafel und Knopf gibt es nur am Rechner, nicht in der App über Remote Control): „Neue Sitzung: `/clear`, dann `/codecycle:continue` (am Rechner auch Knopf „Neue Sitzung“ auf der Bautafel).“
- Ohne Mod (kein `codecycle_budget`): nach der Freigabe des Plans und nach der Abnahme empfehlen.
- Bei `continue` liest du nur `STATE.md` und die Anleitung des aktuellen Zustands.

## Schritte (nur laden, was dran ist)

| Zustand | Anleitung |
|---|---|
| neue Aufgabe | `steps/0-start.md` |
| `erfasst` | `steps/1-clarify.md` |
| `geklaert`, Plan noch nicht geschrieben | `steps/2-plan.md` |
| `geklaert`, Plan geschrieben, groß | `steps/3-plan-review.md` |
| `geklaert`, Plan geschrieben, nicht groß | `steps/2-plan.md` ab Punkt 6 (Übersicht, Freigabe) |
| `geplant` / `in-arbeit` | `steps/4-build.md`, Prüfung je Paket `steps/5-review.md` |
| alle Pakete fertig | `steps/6-acceptance.md` (Zustand `geprueft` danach) |
| `geprueft` | `steps/7-finish.md` (Abschluss mit sichtbarer Merge-Frage; bleibt sie offen, wieder beim Einstieg) |
| Planänderung (jederzeit) | `steps/plan-change.md` |
| `blockiert` | Blocker aus `STATE.md` melden, Nutzer fragen |

Zustände (`STATE.md`): erfasst, geklaert, geplant, in-arbeit, geprueft, fertig, verworfen, blockiert. Paketstatus: offen, in-arbeit, fertig, blockiert.
