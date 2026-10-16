# Beitragen

Rückmeldungen und Pull Requests sind willkommen.

- **Fehler und Ideen:** als Issue anlegen. Bei Fehlern helfen die Version (`claude plugin list`), das Betriebssystem und eine kurze Beschreibung, wie es dazu kam.
- **Pull Requests:** Sie werden geprüft und als Patch in die Entwicklung übernommen, nicht direkt gemergt. Auf GitHub steht der Pull Request danach als „Closed“, nicht als „Merged“: Sobald die Änderung in einer veröffentlichten Version steckt, wird der Pull Request mit einem Hinweis auf diese Version geschlossen. Wer beigetragen hat, steht im Versions-Commit als Mitautor.
- **Vor dem Pull Request** im Repo-Ordner prüfen:

  ```
  claude plugin validate .
  claude plugin test .
  ```

  `validate` prüft, ob das Plugin formal gültig ist (Manifest, Agenten, Skills, Mod). `test` führt die Mod-Tests in `tests/` aus; sie liegen im Plugin, weil `claude plugin test` nur dort sucht, und laufen bei Nutzern nie mit. Zum Ausprobieren das Plugin direkt aus dem Ordner laden: `claude --plugin-dir .` (eine installierte Fassung vorher mit `claude plugin disable codecycle@codecycle` abschalten).

- Die Texte (Skills, Agenten, README, Changelog) sind auf Deutsch.
- Mit einem Beitrag stimmst du zu, dass er unter der [MIT-Lizenz](LICENSE) des Projekts steht.

## Aufbau

| Ordner / Datei | Inhalt |
|---|---|
| `.claude-plugin/` | `plugin.json` (Name, Version) und `marketplace.json` (Katalog, damit das Repo als Marktplatz dient) |
| `skills/` | die Befehle `/codecycle:*` als Anleitungen für Claude; `workflow/` enthält die gemeinsamen Regeln und unter `steps/` die einzelnen Schritte des Ablaufs |
| `agents/` | eine Datei je Rolle (Gutachter, Architekt, Test-Autor, Handwerker, Prüfer, Abnahme …): Aufgabe, erlaubte Werkzeuge, Regeln; der Block „Gemeinsame Regeln“ ist in allen Agenten wortgleich |
| `profiles.json` | Modell und Effort je Rolle für die Profile sparsam, großzügig und extrem |
| `hooks/` | der Mod: `register.tsx` (Anmeldung, Ereignisse, Werkzeuge), `band.tsx` (Bautafel), `panel.tsx` und `desk.tsx` (Seitenleiste), `hooks.json`; in `hooks/lib/` Budget, Token-Buch, Agenten-Figuren und der Zaun für Befehle der Agenten |
| `tool/` | das Projekt-Werkzeug `codecycle` (TypeScript, läuft direkt mit Node); `/codecycle:setup` kopiert es ins Projekt nach `.codecycle/tool/` |
| `lib/` | Bausteine, die Mod und Werkzeug teilen (Aufgaben-Dateien lesen, Schalter, geschützte Pfade, Regeln für `guard`, Bash-Prüfung) |
| `bin/` | Starter für `codecycle` in sh, cmd und PowerShell |
| `githooks/` | Vorlagen für die Git-Hooks, die `codecycle hooks install` im Projekt nach `.githooks/` legt (Pre-Commit-Prüfung, Graph-Aktualisierung) |
| `tests/` | Mod-Tests für `claude plugin test .` |
| `types/` | Typen des Mod-Zustands (nur für TypeScript) |

Bei einer Änderung am Werkzeug (`tool/`, `lib/`, `githooks/`) steigt auch dessen Version in `tool/version.ts`, damit Projekte ihre Kopie mit `/codecycle:update` erneuern.

<!-- Probe-PR: Test der Übernahme, wird nicht veröffentlicht -->
