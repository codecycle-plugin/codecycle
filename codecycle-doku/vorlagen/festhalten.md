{{erzeugt}}
# {{titel}} festhalten

Ein Eintrag je Datei in diesem Ordner, Name `JJJJ-MM-TT-<kurzer-titel>.md`. Die `README.md` ist die erzeugte Übersicht; nie von Hand ändern.

## Vor einem neuen Eintrag

Lies die Übersicht und such in den vorhandenen Einträgen nach Stichworten. Passt einer, ergänze ihn mit einem Abschnitt `## Ergänzung JJJJ-MM-TT`. Löst ein neuer Eintrag einen alten ab, schließ den alten ab und verweis auf den neuen. Eine neue Datei nur für wirklich Neues. Grund: Ähnliche Einträge doppeln sich, widersprechen sich und machen den Ordner unübersichtlich.

## Gerüst

Kopf und Abschnitte so übernehmen; jedes Feld steht von Anfang an im Kopf.

```markdown
---
{{kopf}}
---

{{abschnitte}}
```

## Felder

- `titel`: kurz, sagt, worum es geht.
- `datum`: Tag des Eintrags, JJJJ-MM-TT.
- `bezug`: Liste verknüpfter Einträge als Dateinamen ohne `.md` aus einem Festhalten-Ordner, etwa `[anderer-eintrag]`; ohne Bezug `[]`.
- `status`: {{status}}.
- `wichtigkeit`: {{wichtigkeit}}; im Zweifel `normal`.
{{ergebnis}}
