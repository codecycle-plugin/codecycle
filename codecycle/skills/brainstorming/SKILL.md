---
description: "Brainstorming vor neuer, gestaltender Arbeit (Funktion, Umbau, neues Projekt): klärt im Gespräch, was der Nutzer will, und endet in einem freigegebenen Entwurf mit Erfolgssätzen; danach geht es mit /codecycle:new weiter. Nicht bei Fragen, Erklärungen, Fehlersuche oder klaren Kleinigkeiten."
argument-hint: "[Stichwort oder Aufgabe]"
---

# /codecycle:brainstorming

## Zweck
Im Gespräch klären, was der Nutzer will, bevor gebaut wird. Am Ende steht ein **Entwurf**, der klar und genau ausdrückt, was er wollte, mit deinen Vorschlägen, die ihm gefallen haben. Jeder spätere Prüfer misst an diesen Worten.

## Voraussetzungen
- Plugin-Ordner (für Pfade in gelesenen Dateien): `${CLAUDE_PLUGIN_ROOT}`
- Ausgangspunkt: $ARGUMENTS (leer: was der Nutzer zuletzt geschrieben hat)
- Läuft auch ohne Einrichtung: `.claude/codecycle.md` darf fehlen. Sprache aus `.claude/codecycle.md`, sonst die des Nutzers.
- Kein Code lesen, keine Agenten. Ausnahme: Der Nutzer will Fakten aus dem Projekt („wie ist das heute gelöst?“). Dann der mitgelieferte Such-Helfer `Explore`, nur mit der Auftragsvorlage für Lese-Helfer: „Nur lesen, nichts ändern. Gesucht: <was und wofür>. Breite: <quick | medium | very thorough>. Antwort: Liste `Datei :: Symbol`, je Eintrag eine Zeile „was ändert sich“; höchstens eine Bildschirmseite, keine Dateiinhalte.“ Seine Antwort gibst du in wenigen Punkten weiter.

## Schritte

### 1. Welches Brainstorming
- Hat der Nutzer diesen Befehl selbst aufgerufen: weiter.
- Startest du von selbst und ist ein anderer Brainstorming-Skill verfügbar (etwa aus einem anderen Plugin): frag einmal, welchen der Nutzer nehmen will, und merk dir die Antwort für diese Sitzung. Sonst nimmst du diesen.

### 2. Klar oder unklar
- **Klar** heißt: Der Auftrag nennt, was sich ändern soll, und woran man das Ergebnis erkennt; keine Stelle lässt zwei Lesarten mit verschiedenem Ergebnis zu. Kleine Änderungen mit genanntem Ort und Ergebnis sind klar („Knopf X blau“).
- Klar: ein Satz „Verstanden als: …“, dann ohne zu warten weiter nach `${CLAUDE_PLUGIN_ROOT}/skills/new/SKILL.md` als **klare Aufgabe** (Entwurf und Plan still in die Dateien, keine Freigaben, Prüfer am Ende bleibt; ohne Einrichtung kommt sie zuerst).
- Sonst Gespräch (Punkt 3). Kleine Aufgaben nicht mit Fragen bremsen: lieber eine Frage zu wenig und die Lücke als Vermutung aufschreiben.

### 3. Gespräch
- **Erste Nachricht:** kurz zurückspiegeln, die erste Frage, und das Angebot, die Fragen zu überspringen („Sag ‚leg los‘, dann entscheide ich den Rest und schreibe es als Vermutung auf.“).
- **Eine Frage je Nachricht**, zuerst offen, ohne Beispielantworten. Frag nach Erlebtem oder einem konkreten Bild („Wann hat dich das zuletzt gestört?“).
- **Wenig Text:** kurze Punkte, kein Fließtext, untechnisch. Fragt der Nutzer technisch nach, passt du dich für diese Sitzung an; in eine Memory kommt das nur auf seinen ausdrücklichen Wunsch.
- **Zurückspiegeln**, oft und kurz, getrennt nach „Du hast gesagt: …“ und „Ich vermute: …“; dann fragen, was falsch ist oder fehlt. Eingesprochenes kommt nicht immer richtig an.
- **Kritik ist erwünscht:** bessere Vorschläge, Hinweise auf falsche Annahmen des Nutzers. Die Richtung, die er will, lenkst du nicht um.
- **Eigene Ideen:** Nach der Antwort des Nutzers bietest du an, deine Ideen dazuzugeben; danach fragst du nach seinen.
- **Fragen ohne eine richtige Antwort:** „a) Empfehlung: …“ mit Grund und „b) Dagegen spricht: …“ mit dem stärksten Gegenargument, nicht dem bequemsten; der Nutzer antwortet mit einem Buchstaben oder eigenen Worten. Keine Liste von Möglichkeiten. Nur bei echten Entscheidungen.
- **Erfolgssätze** schlägst du vor, nachprüfbar („2 statt 4 Portionen → alle Mengen halbiert“); der Nutzer korrigiert oder streicht mit wenigen Worten.
- **Worte festhalten:** Die Antworten des Nutzers kommen im Wortlaut in den Entwurf, nicht nur zusammengefasst; eine neue Sitzung weiß nur, was in den Dateien steht.
- **Ton:** ernsthaft in der Sache, locker, mit etwas Humor.

### 4. Entwurf
Stehen Ziel, Grenzen und Erfolgssätze, oder sagt der Nutzer „leg los“:
1. Lies `${CLAUDE_PLUGIN_ROOT}/skills/new/SKILL.md`, führe dort Schritt 1 aus (Workflow-Skill lesen) und mach in „1. Entwurf“ weiter. Im eingerichteten Projekt legt der Abschnitt zuerst Ordner und `TASK.md` an, damit der Link funktioniert und ein Abbruch nichts verliert; ohne Einrichtung steht der Entwurf nur im Chat.
2. Inhalt des Entwurfs, kein Code:
   - Worte des Nutzers (Zitat, unverändert)
   - Vermutungen von dir, getrennt davon
   - Ziel, Nicht-Ziele, Anti-Ziele (was ein Fehlschlag wäre, auch wenn es technisch läuft)
   - Erfolgssätze
   - Entscheidungen mit der Antwort des Nutzers im Wortlaut
3. **Im Chat kurz:** jeder Punkt eine Zeile, klar erklärt, dazu die Phasen (Plan mit Prüfung, Bauen, frische Prüfung, Merge-Frage) und im eingerichteten Projekt der Link auf `TASK.md`. Der Nutzer muss keine Datei öffnen, um zu entscheiden.
4. Ganz unten die Freigabe als einfache Frage: „Gibst du den Entwurf frei?“ (freigeben / ändern).
5. Nach der Freigabe: Fehlt `.claude/codecycle.md`, zuerst die Einrichtung nach `${CLAUDE_PLUGIN_ROOT}/skills/setup/SKILL.md`, dann zurück in `new`, „1. Entwurf“.

## Ergebnis
Ein freigegebener Entwurf; im eingerichteten Projekt in `TASK.md` des Aufgabenordners, sonst im Chat bis zur Einrichtung.

## Nächster Schritt
Weiter in `/codecycle:new`: Weiter-Vorschlag (hier weiter oder neue Sitzung), dann der Plan.
