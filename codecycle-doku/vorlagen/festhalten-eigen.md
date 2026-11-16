---
paths: ["{{ordner}}/**"]
---

{{erzeugt}}
# {{titel}} festhalten

Ein Eintrag je Datei in `{{ordner}}/`, mit Kopf zwischen zwei Zeilen `---`. {{uebersicht}}

## Vor einem neuen Eintrag

Lies die Übersicht und such in den vorhandenen Einträgen nach Stichworten. Passt einer, ergänze ihn mit einem Abschnitt `## Ergänzung JJJJ-MM-TT`. Löst ein neuer Eintrag einen alten ab, schließ den alten ab und verweis auf den neuen. Eine neue Datei nur für wirklich Neues. Grund: Ähnliche Einträge doppeln sich, widersprechen sich und machen den Ordner unübersichtlich.

## Gerüst

Kopf so übernehmen; jedes Pflichtfeld steht von Anfang an im Kopf.

```markdown
---
{{kopf}}
---
{{abschnitte}}
```

## Felder

{{felder}}

## Abschluss

{{abschluss}}
