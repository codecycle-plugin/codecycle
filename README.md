# codecycle

Marktplatz für Claude Code mit zwei Plugins:

| Plugin | Ordner | Was es tut |
|---|---|---|
| `codecycle` | [codecycle/](codecycle/README.md) | Fester, wiederholbarer Arbeitsablauf: Modelle je Rolle, große Aufgaben in Teilen, frische Prüfer, Fortschritt in Dateien im Repo, optionaler Mod |
| `codecycle-doku` | [codecycle-doku/](codecycle-doku/README.md) | Doku-Baukasten: feste Orte und Arten für die Doku, Festhalten von Ideen, Bugs und To-dos mit erzeugter Übersicht, Prüfer und Hook |

`codecycle` setzt `codecycle-doku` voraus; `codecycle-doku` läuft auch allein.

## Installation

Im Terminal (nicht in einer Claude-Sitzung):

```
claude plugin marketplace add codecycle-plugin/codecycle
claude plugin install codecycle@codecycle
```

Der zweite Befehl installiert `codecycle` zusammen mit `codecycle-doku`. Nur den Doku-Baukasten: `claude plugin install codecycle-doku@codecycle`.

Aktualisieren und alles Weitere steht in der README des jeweiligen Plugins.

## Beitragen und Lizenz

Hinweise für Issues und Pull Requests: [codecycle/CONTRIBUTING.md](codecycle/CONTRIBUTING.md). Lizenz: [MIT](LICENSE).
