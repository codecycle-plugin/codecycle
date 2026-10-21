# Schritt 1: Klären

## Zweck
`TASK.md` mit Ziel, Erfolgskriterium, Nicht-Zielen, gewähltem Lösungsweg, Entscheidungen und Abnahmekriterien füllen. Danach **Freigabe**.

## Voraussetzungen
- **Hier ist der Ort für Fragen:** Klären, Auftrag und Plan sind die einzigen Stellen vor dem Lauf, an denen der Nutzer gefragt wird. Danach läuft alles ohne Rückfragen (Schalter `assume-and-continue`, siehe Workflow-Skill).
- Zustand `erfasst`; `TASK.md` enthält die Beschreibung des Nutzers unter „Wortlaut“.
- **Wortlaut bleibt unverändert:** Nie umformulieren, kürzen oder korrigieren. Ergänzt der Nutzer beim Klären etwas Wesentliches zur Aufgabe, hängst du es dort als Zitat mit Datum an (`> <JJJJ-MM-TT>: …`). „Ziel“ ist deine Zusammenfassung in 1–3 Sätzen. Ältere Aufgaben ohne „Wortlaut“: Die Rohfassung unter „Ziel“ gilt als Wortlaut.
- Größe und Art stehen in `STATE.md`, Merkmale und Rollen-Set in `aufwand.json` (`codecycle effort`, Schritt 0).
- Schalter: `ideas-auto` (1a), `reuse-agents` (1c, Architekt per Nachricht), `assume-and-continue` (entscheidet, wie viele Unklarheiten du jetzt klären musst: lieber hier fragen als später mit Annahmen arbeiten).

## Schritte

### 1a Verstehen (Bauleiter mit dem Nutzer, kein Agent, kein Code)
- Zweck, Erfolgskriterium („fertig, wenn …“), Nicht-Ziele. **Eine Frage nach der anderen**, möglichst mit Auswahlmöglichkeiten.
- Anzahl: klein 0–2, mittel 3–5, groß so viele wie nötig.
- Ist die Beschreibung so vage, dass kein Ziel erkennbar ist: mit Schalter `ideas-auto` (Standard an) das Brainstorming nach `${CLAUDE_PLUGIN_ROOT}/skills/ideas/SKILL.md` starten, am Ende kommt ein Auftrags-Entwurf zurück, dann hier weitermachen. Unter „Wortlaut“ hängst du die Worte des Nutzers aus dem Gespräch an (als Zitat mit Datum) und darunter den freigegebenen Entwurf, gekennzeichnet als `> Entwurf, freigegeben am <JJJJ-MM-TT>: …`. Mit `ideas-auto` aus: weiter fragen und auf `/codecycle:ideas` hinweisen.

### klein: abkürzen
Keine Schritte 1b/1c. 0–2 Fragen; Randfälle nach `${CLAUDE_PLUGIN_ROOT}/skills/workflow/randfaelle.md` gehst du selbst durch (die Frage dazu zählt mit), dann (gilt Risikobereich: Negativ-Kriterium nicht vergessen) `TASK.md` und **ein** Paket in `PLAN.md` schreiben (Format siehe Vorlage), beides in 5–10 Zeilen zeigen, dazu die Ausgabe von `codecycle effort`. **Eine Freigabe**, dann `STATE.md` auf `geplant` und weiter mit `steps/4-build.md`. Bugfix klein: der Handwerker reproduziert selbst.

### 1b Erkunden (nur wenn `surveyor` oder `debugger` im Rollen-Set steht)
- `codecycle:surveyor` starten (Bugfix: `codecycle:debugger`, bei Bedarf zusätzlich). Startnachricht: Aufgabenordner, Beschreibung, Antworten aus 1a, Berichtspfad `reports/01-surveyor.md`.
- Der Bericht liefert: (a) Bereiche und Fundstellen als **Datei :: Symbol**, (b) offene Entscheidungen mit Standard und Ein-Satz-Begründung, Standards mit Bezug zum Wortlaut markiert `Wortlaut: „<Zitat>“`, (c) Risiken, (d) seine Größe (`klein` / `mittel` / `gross`) mit Grund, (e) bei groß: Anzahl getrennter Bereiche. Du liest den Bericht **nur** für (b) und (d).
- Debugger: Hypothese in einem Satz, roter Reproduktionstest; er wird **Abnahmekriterium K1**. Du liest Hypothese und Test.
- **Merkmale nachtragen und neu rechnen:** `codecycle effort <aufgabenordner> --set alternativen=ja|nein --set bereiche=<n> --set pakete=<n> --set risikoPakete=<n> --set ungetestet=ja|nein --set gutachterGroesse=<klein|mittel|gross>` (aus dem Bericht; Gutachter-Korrekturen an früheren Merkmalen ebenso mit `--set`). Ändert sich die Größe in der Ausgabe: in `STATE.md` übernehmen und vermerken. Nach oben immer; nach unten nur, wenn das Werkzeug sie senkt (Gutachter sagt kleiner, kein Risiko, keine Schnittstelle, ein Paket; mit Risiko nie unter mittel). Wird die Aufgabe dadurch klein: weiter wie „klein: abkürzen“ (eine Freigabe, kein Prüfer).

### 1c Lösungswege (nur wenn `architect` im Rollen-Set steht)
- **Ohne Architekt** (Rollen-Set ohne `architect`, Ausgabe „Plan: kein Architekt …“; ein Paket, keine Alternativen, keine Schnittstelle, auch bei Risiko): kein 1c. Nach Abschluss Punkt 2 (`TASK.md` mit Kriterien), **vor** der Freigabe, schreibst du das eine Paket selbst aus den Fundstellen des Gutachters in `PLAN.md` (Format der Vorlage, mit Zeilen `Risiko:` und `Randfälle und Verbote`, Changelog-Eintrag bei `doku=changelog` im Paket) und zeigst Auftrag und Paket in **einer** Freigabe (wie bei klein). Danach Schritt 2 nur Punkt 5 (neu rechnen) und weiter mit `steps/4-build.md`.
- `codecycle:architect` starten (Berichtspfad `reports/02-architect.md`): mittel 1–2 Wege kurz, groß 2–3, mit Abwägung und Empfehlung. Du liest die Lösungswege aus dem Bericht; der Nutzer wählt.
- **Plan im selben Lauf:** Hat der Gutachter nur einen sinnvollen Weg gemeldet oder hat der Nutzer vorab den Standardweg gewählt, steht in der Startnachricht `Plan direkt: ja`; dann füllst du vorher `TASK.md` (Abschluss Punkt 1 und 2), damit der Plan die Kriterien kennt. Der Architekt nennt den Weg kurz und schreibt `PLAN.md` gleich mit (keine kalte Plan-Nachricht später). Du zeigst Auftrag und Plan dann gemeinsam; es bleiben zwei Freigaben (Auftrag, Plan), du darfst sie aber direkt nacheinander stellen.
- Ohne `Plan direkt`: **derselbe Architekt** schreibt später den Plan (Schalter `reuse-agents`: per Nachricht, Agenten-ID merken; zählt nicht als neuer Lauf). Mit `reuse-agents` aus kommt später ein frischer Architekt.

### Abschluss
1. **Randfälle** nach `${CLAUDE_PLUGIN_ROOT}/skills/workflow/randfaelle.md`: die mit `Randfall:` markierten Entscheidungen des Gutachters, ohne Gutachter gehst du die Liste selbst durch. Höchstens **eine** gebündelte Frage mit bis zu drei Randfällen, die übrigen als übernommene Standards; ein Randfall mit Markierung `Wortlaut:` wird wie unten einzeln gefragt.
   Offene Entscheidungen aus 1b abfragen (Standard annehmen oder anders). Echte Wahlfragen **einzeln**; Entscheidungen, bei denen der Gutachter einen klaren Standard nennt, darfst du **gesammelt** in der Auftragsfreigabe zeigen („Standards: … – alle übernehmen oder einzeln ändern?“) statt einzeln zu fragen (weniger Unterbrechung). **Ausnahme Wortlaut:** Standards mit der Markierung `Wortlaut: „<Zitat>“` fragst du immer **einzeln**, je mit dem Zitat aus dem Wortlaut und dem Standard daneben; nur die übrigen dürfen gesammelt bleiben. Der Plan-Prüfer prüft sie später gegen den Wortlaut.
2. `TASK.md` füllen: gewählter Lösungsweg mit Begründung, Entscheidungen (Frage, Entscheidung, Antwort des Nutzers im Wortlaut, Datum; ohne eigene Wahl des Nutzers „Empfehlung übernommen: …“), Abnahmekriterien als Tabelle (ID, Kriterium, Prüfweg: `Test`, `Befehl <…>`, `Browser` (Browser-Prüfer; früher `TÜV`), `Sichtprüfung`). **Randfälle:** Jeder entschiedene Randfall wird ein Kriterium mit passendem Prüfweg, meist `Test`, bei Oberfläche `Browser`. **Vorhanden, fehlt, leer:** Hängt ein Kriterium davon ab, ob etwas vorhanden ist oder fehlt (Datei, Feld, Liste, Eingabe), nennt es auch den Fall „leer“ mit gewünschtem Verhalten. Ist ein Prüfweg in `.claude/codecycle.md` „nicht vorhanden“: anderen wählen oder „nicht prüfbar“ markieren. **Risikobereich berührt** (laut `.claude/codecycle.md`): mindestens ein **Negativ-Kriterium** „darf nicht möglich sein“ (z. B. Zugriff auf fremde Daten) mit Prüfweg `Test` aufnehmen; das schlägst du vor und zeigst es mit den übrigen Kriterien (keine zusätzliche Unterbrechung).
3. Auftrag und Abnahmekriterien zeigen, dazu die Ausgabe von `codecycle effort` (Rollen mit Grund je Rolle, Zahl der Läufe; keine Kostenschätzung). Steht darin die Zeile `Zaun: …` (Risikobereich, aber Schalter `fence` aus), nennst du sie in der Freigabe und fragst, ob `fence` an soll; nicht selbst umschalten. Der Nutzer darf Rollen streichen: `codecycle effort <ordner> --drop <rolle>=<grund>` (zurück mit `--keep <rolle>`); Schutzrollen in Risikobereichen nur nach seiner ausdrücklichen Bestätigung (`--confirm-risk`). **Freigabe** (ohne Architekt mit dem Paket zusammen, siehe 1c). `STATE.md` auf `geklaert` (ohne Architekt: `geplant`, Pakete eingetragen wie `steps/2-plan.md` Punkt 5), `budget.geplant` = Läufe laut Ausgabe, Commit.

## Ergebnis
`TASK.md` vollständig und freigegeben, `STATE.md` auf `geklaert` (klein und ohne Architekt: `geplant`, mit Paket in `PLAN.md`); Bericht von Gutachter und Architekt in `reports/`.

## Nächster Schritt
Neue Sitzung nur nach „Hauptsitzung klein halten“ (Workflow-Skill). Danach `steps/2-plan.md` (mit Architekt) bzw. `steps/4-build.md` (klein oder ohne Architekt).
