# {{titel}} festhalten

Ein Eintrag je Datei in diesem Ordner, Name `JJJJ-MM-TT-<kurzer-titel>.md`. Die `README.md` ist die erzeugte Übersicht: vor einem neuen Eintrag lesen, nie von Hand ändern.

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
