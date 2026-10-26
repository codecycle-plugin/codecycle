---
description: "Richtet die Doku eines Projekts ein oder ergänzt sie: erkundet Vorhandenes, fragt nach Bausteinen, Ablage, Verschieben und Überarbeiten und legt nur an, was der Nutzer zugestimmt hat."
argument-hint: ""
---

# /codecycle-doku:einrichten

## Zweck
Die Doku des Projekts einrichten: feste Orte und Arten, Festhalten von Ideen, Bugs und To-dos, Prüfer und Hook. Du fragst, das Skript führt aus.

## Grundsätze
- **Erst einfinden.** In einem Projekt mit Doku änderst, verschiebst oder legst du nichts an, ohne dass der Nutzer zugestimmt hat.
- **Du schreibst keine Doku-Datei selbst** (kein Write, kein Edit). Alles Anlegen, Anhängen, Verschieben und Überarbeiten macht das Skript mit der Liste der zugestimmten Schritte.
- **Fragen stellst du wortgleich wie unten**, eine je Nachricht, im Format „a) Empfehlung / b) Dagegen spricht“. Der Nutzer antwortet mit einem Buchstaben; setze in `<…>` nur die Angaben aus dem Projekt ein.

## Skript
- Skript: `${CLAUDE_PLUGIN_ROOT}/skripte/einrichten.mjs`, Prüfer: `${CLAUDE_PLUGIN_ROOT}/skripte/pruefer.mjs`, Erkunder: Agent `codecycle-doku:erkunder`, Verfasser: Agent `codecycle-doku:verfasser`.
- `node "<Skript>" --root "<Projekt>" --stand`: JSON mit `eingerichtet`, `leer`, `repo`, `bausteine`, `changelog` und je Schritt `zustand` (`fehlt`, `vorhanden`, `veraltet`, `eigener Inhalt`).
- `node "<Skript>" --root "<Projekt>" --antworten - --dry-run`: zeigt jeden Schritt mit Inhalt, schreibt nichts. Ohne `--dry-run` führt es aus.
- Antworten als JSON über stdin, in Bash mit Heredoc (`<<'JSON'` … `JSON`), in PowerShell mit Pipe. Felder:
  - `schritte` (Pflicht): zugestimmte Schritte; eine leere Liste schreibt nichts.
  - `bausteine`, `ablage` (`teilen` oder `lokal`), `zuordnung` (`[{ "pfad", "art" }]`), `changelog` (`{ "datei", "schema", "beschreibung" }`), `festhalten`, `orte`: nur, wo das Projekt vom Standard abweicht.
  - `verschieben`: `[{ "von", "nach" }]`, dazu je Datei der Schritt `verschieben:<von>`. Nur einzelne Dateien; einen Ordner lehnt das Skript ab.
  - `inhalte`: `{ "<pfad>": "<neuer Text>" }`, dazu je Datei der Schritt `ueberarbeiten:<pfad>`.
  - `schemata`: `{ "<art>": { "pflicht", "status", "abschluss", "abschnitte", "uebersicht" } }` für eine angedockte Sammlung, aus dem Bericht des Erkunders; dazu `festhalten` mit ihrem Ordner.
- Schritt `architektur`: im Projekt ohne Code das Gerüst; im Projekt mit Code (`code: true` in `--stand`) keine Datei, sondern `Verfasser` im Bericht: dann den Verfasser mit Ziel `architektur` starten, die Erstfassung kommt als Probe. Eine vorhandene `ARCHITECTURE.md` bleibt.
- Schritte, die immer dazugehören: `doku-json`, `privat` (der private Ordner `.codecycle-doku/` in `.gitignore`), `karte`, `verweis`.
- Schritte je Baustein: `readme`, `claude-md`, `changelog`, `schreibregeln`, `festhalten:idee`, `festhalten:bug`, `festhalten:todo`, `chronik`, `entscheidungen`, `architektur`, `wegweiser`, `berichte`, `prompts`; `gitignore` bei Ablage „lokal“ und im leeren Projekt; `git-init` nur nach der Git-Frage.
- `ueberfuehren:<art>`: schreibt alle Einträge einer angedockten Sammlung mit Kopf im Schema des Plugins nach `.codecycle-doku/probe/<ordner>/`, dazu `UEBERFUEHREN.md` mit Zählung und Beispielen; der echte Ordner bleibt unverändert.
- `node "<Skript>" --root "<Projekt>" --probe`: legt die Blöcke des Verfassers (stdin) als Probe nach `.codecycle-doku/probe/<pfad>` und die Änderungsliste nach `.codecycle-doku/probe/<pfad ohne .md>.aenderungen.md`.
- `uebernehmen:<pfad>` (Datei oder überführter Ordner): sichert die alte Fassung nach `.codecycle-doku/sicherung/`, setzt die Probe an ihren Ort, entfernt Probe und Änderungsliste. Nennt die Änderungsliste in der ersten Zeile `zusammen:`, gehören alle genannten Pfade in denselben Aufruf.
- `verwerfen:<pfad>` (Datei oder überführter Ordner): entfernt Probe und Änderungsliste, die echte Datei bleibt; für `zusammen:` gilt dasselbe wie beim Übernehmen.
- Karte, Schreibregeln und Anleitungen je Ordner sind erzeugt; weicht eine davon ab (von Hand geändert oder älteres Plugin), legt ihr Schritt eine Probe mit Änderungsliste an, statt sie zu ersetzen.
- `node "<Skript>" --root "<Projekt>" --erkundung -`: legt den Bericht des Erkunders (stdin) als `.codecycle-doku/erkundung.md` ab; nur mit `.claude/doku.json`.
- Eine vorhandene Datei ersetzt das Skript nur mit `ueberarbeiten:<pfad>`. Ein erzeugter Changelog wird nie geändert.

## Bausteine
| Baustein | Grundausstattung | Wozu |
|---|---|---|
| `readme` | ja | Einstieg für Menschen: was, Installation, Benutzung |
| `claude-md` | ja | Regeln, die jede Sitzung braucht, mit Verweis auf die Karte der Doku |
| `changelog` | ja | Änderungen je Version; ein vorhandenes Schema wird erkannt und beschrieben |
| `schreibregeln` | ja | Regeldatei mit Arten und Schreibregeln; lädt nur beim Arbeiten an Markdown |
| `festhalten` | ja | feste Orte für Ideen, Bugs und To-dos mit Gerüst, Feldern und erzeugter Übersicht |
| `chronik` | ja | was geschah: Datum, was, ein Halbsatz Warum, Verweis |
| `entscheidungen` | ja | Entscheidungen mit allen Alternativen und der Antwort im Wortlaut |
| `architektur` | ja, nur mit Code | Aufbau des Codes in `ARCHITECTURE.md`: Überblick, Einstiegspunkte, Codemap, Grenzen |
| `wegweiser` | Erweiterung | Wegweiser durch die Doku-Dateien; lohnt ab etwa zehn Dateien |
| `berichte` | Erweiterung | Ordner für einmalige Befunde |
| `prompts` | Erweiterung | Ordner für Aufträge an Sitzungen oder Agenten |
| `mermaid` | Erweiterung | verknüpfte Einträge in der Übersicht zusätzlich als Diagramm |

Prüfer und Hook gehören zur Grundausstattung; sie laufen, sobald `.claude/doku.json` da ist. Zu jedem Baustein, den du anbietest, nennst du die Zeile „Wozu“.

## Ablauf
1. Führe `--stand` aus. `eingerichtet: true` → „Erneuter Aufruf“. `leer: true` (außer `.git`, `.gitignore`, `.gitattributes` und `.claude/settings.local.json` keine Datei und kein Ordner) → „Leeres Projekt“. Sonst → „Projekt mit Doku“.

### Leeres Projekt
2. Stelle Frage 1, dann Frage 13, dann Frage 2. Nur bei `repo: false` zusätzlich Frage 3.
3. Bei Frage 13 „a“ kommt `architektur` zu den Bausteinen; der Schritt legt das Gerüst an. Schritte: die der gewählten Bausteine (Liste unter „Skript“) mit `gitignore`, dazu `git-init`, wenn Frage 3 mit „a“ beantwortet ist. Führe ohne weitere Einzelfragen aus.
4. Weiter mit „Abschluss“.

### Projekt mit Doku
2. Starte den Erkunder. Startnachricht: Projektwurzel, Pfad des Prüfers, Ausgabe von `--stand`; gibt es `.codecycle-doku/erkundung.md`, dazu deren Inhalt als Bericht der letzten Erkundung.
3. Bericht an den Nutzer, „So sieht deine Doku aus“: Zahlen des Prüfers, Zuordnung des Vorhandenen zu den Bausteinen, Changelog mit Schema, was fehlt. Kurze Punkte, keine Wertung.
4. Stelle Frage 4, dann Frage 2.
5. Für jede Sammlung mit eigenem Schema aus dem Bericht: Frage 10. Bei beiden Antworten kommt das vorgeschlagene Schema nach `schemata.<art>` und der Ordner nach `festhalten.<art>`; bei „b“ zusätzlich der Schritt `ueberfuehren:<art>`, nach dem Ausführen zeigst du Zählung und Beispiele aus `UEBERFUEHREN.md`.
6. Nur wenn der Erkunder Unübersichtliches meldet: Frage 5 je vorgeschlagener Datei.
7. Probe-Fassungen für `README.md`, `CLAUDE.md` und `ARCHITECTURE.md` (im Monorepo je Paket-README): Frage 12.
   - Bei „a“ je Datei: Verfasser starten (Startnachricht: Ziel `readme`, `claude-md` oder `architektur`, Projektwurzel, Pfad, Projektart aus dem Bericht), seine Antwort an `--probe`, Änderungsliste kurz zeigen, Frage 11.
   - Frage 11: „a“ `uebernehmen:<pfad>`; „b“ dem Verfasser per Nachricht die genannten Punkte geben, neue Fassung über `--probe`, erneut fragen; „c“ `verwerfen:<pfad>`.
   - Diese drei Dateien überarbeitest du nicht selbst.
8. Überarbeiten: Für jede andere Datei mit Treffern des Prüfers bereitest du den überarbeiteten Text vor (nur die Treffer beheben, Inhalt und Ton des Nutzers behalten), zeigst die Änderung als Gegenüberstellung und stellst Frage 6. Bei mehr als fünf Dateien zuerst Frage 7.
9. Stelle die Antworten zusammen (Zuordnung, Changelog und Schemata aus dem Bericht des Erkunders), führe `--dry-run` aus, zeige die Ausgabe und stelle Frage 8. Erst nach „a“ ausführen.
10. Gib den Bericht des Erkunders an `--erkundung -`.
11. Weiter mit „Abschluss“.

### Erneuter Aufruf
2. Zeige aus `--stand` die Schritte mit `fehlt` (gewählte und nicht gewählte Bausteine getrennt, je mit „Wozu“) und die mit `veraltet` (Karte, Schreibregeln oder Übersicht weichen vom Stand des Plugins ab).
3. Nichts fehlt und nichts veraltet: sag das und ende.
4. Stelle Frage 9, dann `--dry-run`, Frage 8, ausführen. `architektur` bietest du nur bei `code: true` an.
5. Hat ein Schritt eine Probe angelegt (veraltete Karte, Schreibregeln oder Anleitung): je Probe die Änderungsliste kurz zeigen und Frage 11 stellen; bei „a“ `uebernehmen:<pfad>`, bei „c“ `verwerfen:<pfad>`. Sag bei „c“: Die Datei bleibt auf dem alten Stand, darum meldet die Status-Seite weiter ein Update, und der nächste Aufruf legt die Probe neu an.

### Abschluss
- Lass den Prüfer über das Projekt laufen und nenne die Schlusszeile; er baut dabei die Status-Seite `.codecycle-doku/status.html` neu (auf Befehl: `codecycle-doku-pruefer --status`). Nenne ihren Pfad und was unter „Wartet auf dich“ steht.
- Nenne angelegte, geänderte, verschobene und übersprungene Dateien aus der Ausgabe des Skripts.
- Ob committet wird, entscheidet der Nutzer; frage einmal.

## Fragen

**Frage 1: Bausteine im leeren Projekt**
> Welche Bausteine lege ich an?
> a) Empfehlung: die Grundausstattung: README, CLAUDE.md, CHANGELOG, Regeldatei, Festhalten (Ideen, Bugs, To-dos), Chronik, Entscheidungen; Prüfer und Hook laufen damit.
> b) Dagegen spricht: Wächst das Projekt, fehlen Wegweiser, Berichte, Prompts und das Diagramm der Übersicht; dann die Grundausstattung mit allen Erweiterungen.
> Einzelne Erweiterungen kannst du auch beim Namen nennen.

**Frage 13: Code im leeren Projekt**
> Entsteht hier Code?
> a) Empfehlung: ja; dann lege ich das Gerüst `ARCHITECTURE.md` mit leeren Abschnitten an (Überblick, Einstiegspunkte, Codemap, Grenzen), das mit dem Code wächst.
> b) Dagegen spricht: Reine Texte, Notizen oder Daten brauchen keine Architektur; dann ohne.

**Frage 2: Ablage der Arbeits-Doku**
> Wo liegt die Arbeits-Doku (Festhalten, Chronik, Entscheidungen, Berichte, Prompts)?
> a) Empfehlung: teilen; sie liegt im Repo, geht auf jedes Gerät mit, und eine neue Sitzung findet sie dort.
> b) Dagegen spricht: In einem öffentlichen Repo wären Notizen, Wortlaut und offene Bugs lesbar; dann lokal, sie kommt in die `.gitignore` und bleibt auf diesem Gerät.

**Frage 3: Git**
> Hier gibt es kein Git-Repo. Soll ich eins anlegen (`git init -b main`)?
> a) Empfehlung: ja; Doku und Code haben dann eine Geschichte, und die Ablage „teilen“ wirkt erst damit.
> b) Dagegen spricht: Gehört der Ordner in ein anderes Repo oder soll er nicht versioniert werden, bleibt es ohne Repo.

**Frage 4: Bausteine im Projekt mit Doku**
> Was soll ich zu deiner Doku dazulegen? Fehlend: <Bausteine mit je einer Zeile Wozu>.
> a) Empfehlung: die fehlenden Teile der Grundausstattung; Vorhandenes bleibt, wo es ist, und wird in `.claude/doku.json` zugeordnet.
> b) Dagegen spricht: Jeder neue Ort ist eine Datei mehr; dann nur `.claude/doku.json` mit der Zuordnung, Prüfer und Hook laufen damit, sonst ändert sich nichts.
> Erweiterungen kannst du beim Namen dazunehmen, einzelne Bausteine abwählen.

**Frage 5: Verschieben (je Datei)**
> `<von>` liegt abseits der übrigen Doku. Soll ich sie nach `<nach>` verschieben und die Links darauf anpassen?
> a) Empfehlung: verschieben; die Doku liegt dann beisammen, Links bleiben heil.
> b) Dagegen spricht: Werkzeuge, Lesezeichen oder Verweise von außen kennen den alten Pfad; dann bleibt sie und wird nur zugeordnet.

**Frage 6: Überarbeiten (je Datei)**
> So würde ich `<Datei>` überarbeiten (Änderung oben). Übernehmen?
> a) Empfehlung: übernehmen; die Datei hält danach die Schreibregeln ein, und der Prüfer findet dort keine Treffer.
> b) Dagegen spricht: Es ist dein Text, und Hinweise sind keine Fehler; dann bleibt die Datei, wie sie ist.

**Frage 7: Viele Dateien zum Überarbeiten**
> <Anzahl> Dateien haben Treffer. Soll ich sie einzeln mit dir durchgehen?
> a) Empfehlung: nur die mit scharfen Treffern (tote Links, Kopf-Fehler neuer oder geänderter Einträge); die übrigen beheben sich, wenn die Datei sowieso angefasst wird.
> b) Dagegen spricht: Dann bleiben Hinweise stehen; dann alle einzeln.

**Frage 8: Ausführen**
> Das ist der Probelauf (oben). Soll ich genau das ausführen?
> a) Empfehlung: ja, ausführen.
> b) Dagegen spricht: Ein Schritt passt nicht; nenne ihn, ich nehme ihn heraus und zeige den Probelauf neu.

**Frage 9: Ergänzen**
> Es fehlen oder sind veraltet: <Schritte mit je einer Zeile Wozu>. Soll ich sie anlegen oder erneuern?
> a) Empfehlung: alle, die zu gewählten Bausteinen gehören; nicht gewählte nur, wenn du sie nennst.
> b) Dagegen spricht: Jeder Schritt ändert das Projekt; dann nenne die, die du willst.

**Frage 10: Sammlung mit eigenem Schema (je Sammlung)**
> `<Ordner>` hat ein eigenes Schema (<Felder, Statuswerte>, eigene Übersicht <ja oder nein>). Wie binde ich es an?
> a) Empfehlung: andocken; das Schema kommt in `.claude/doku.json`, die Anleitung als Regeldatei unter `.claude/rules/`, der Ordner mit Einträgen und Übersicht bleibt unberührt, und der Prüfer prüft gegen dein Schema.
> b) Dagegen spricht: Das Projekt weicht dann vom Standard ab; dann überführen: ich lege alle Einträge mit Kopf im Schema des Plugins als Probe in `.codecycle-doku/probe/` ab, du siehst je Eintrag den alten und den neuen Kopf, übernommen wird erst nach deinem Ja, die Originale kommen in die Sicherung.

**Frage 11: Übernehmen? (je Probe)**
> Die Probe liegt in `<Pfad der Probe>`, die Änderungen stehen oben. Übernehmen?
> a) Empfehlung: ganz übernehmen; die alte Fassung kommt in die Sicherung.
> b) Dagegen spricht: Nicht jede Änderung passt; dann nenne die Punkte, die bleiben sollen, ich lasse die Fassung nur mit ihnen neu schreiben.
> c) nicht übernehmen; die echte Datei bleibt, wie sie ist.

**Frage 12: Probe-Fassungen**
> Soll ein Agent für <Dateien> je eine Probe-Fassung schreiben (Inhalt gegen den Code geprüft, Fehlendes ergänzt, das Warum getrennt in einer Änderungsliste)?
> a) Empfehlung: ja; die echten Dateien bleiben, bis du eine Probe übernimmst.
> b) Dagegen spricht: Jede Probe kostet einen Agentenlauf; dann ohne, später mit `/codecycle-doku:probe`.

## Ergebnis
`.claude/doku.json`, Karte `.claude/rules/codecycle-doku.md`, dazu nur die zugestimmten Gerüste, Ordner und Einträge; Prüfer-Schlusszeile im Abschluss.
