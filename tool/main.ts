import { callers } from './commands/callers.ts'
import { check } from './commands/check.ts'
import { exclude } from './commands/exclude.ts'
import { guard } from './commands/guard.ts'
import { hooks } from './commands/hooks.ts'
import { info } from './commands/info.ts'
import { installTool } from './commands/install-tool.ts'
import { format, lint } from './commands/lint.ts'
import { locate } from './commands/locate.ts'
import { notiz } from './commands/notiz.ts'
import { effort } from './commands/effort.ts'
import { selftest } from './commands/selftest.ts'
import { server } from './commands/server.ts'
import { solo } from './commands/solo.ts'
import { tasks } from './commands/tasks.ts'
import { update } from './commands/update.ts'
import { test } from './commands/test.ts'
import { ToolBroken } from './errors.ts'
import { TOOL_VERSION } from './version.ts'

export type Ctx = { cwd: string; out: (line: string) => void }
export type Command = (args: string[], ctx: Ctx) => number | Promise<number>

/** Befehle des Werkzeugs; jede Task trägt ihren Befehl hier ein. */
export const COMMANDS: Record<string, Command> = {}

COMMANDS.info = info
COMMANDS.selftest = selftest
COMMANDS.tasks = tasks
COMMANDS.test = test
COMMANDS.check = check
COMMANDS.lint = lint
COMMANDS.format = format
COMMANDS.server = server
COMMANDS.locate = locate
COMMANDS.callers = callers
COMMANDS.hooks = hooks
COMMANDS['install-tool'] = installTool
COMMANDS.exclude = exclude
COMMANDS.guard = guard
COMMANDS.effort = effort
COMMANDS.update = (args, ctx) => update(args, ctx)
COMMANDS.notiz = notiz
COMMANDS.solo = solo

const HELP = [
  'codecycle <befehl> [optionen]',
  '  info              System, Versionen, Projekt',
  '  selftest          funktioniert das Werkzeug in diesem Projekt?',
  '  tasks             alle Aufgaben aus docs/codecycle/*/STATE.md mit Git-Abgleich',
  '  test [filter]     Tests (alle oder gefiltert); test --affected [--staged]: nur zum Diff',
  '  lint, format      Lint bzw. Format laut Konfiguration',
  '  check [--full]    Lint, Format, Tests; --affected [--staged]: Tests nur zum Diff',
  '  server [--stop | --temp [--same]]   Dev-Server im Hintergrund (Log unter .codecycle/tmp/); --temp mit Wegwerf-Datendatei oder ohne Daten (serverTemp), --same behält sie',
  '  locate "Datei :: Symbol"   datei:start-ende signatur',
  '  callers "Symbol"            Aufrufer, eine Zeile pro Treffer',
  '  hooks install|status        Git-Hooks (.githooks/) einrichten bzw. prüfen',
  '  update            Plugin aktualisieren, Werkzeug-Kopie, Hooks, guard-Grundlage, Selbsttest (ohne KI; Exit 3: Entscheidung nötig)',
  "  notiz '<Text>'    Beobachtung mit Datum und Uhrzeit an notizen.md der offenen Aufgabe anhängen (Schalter notizen; ohne Aufgabe .codecycle/setup/)",
  '  install-tool [--update-config]   Werkzeug-Kopie nach .codecycle/tool/ anlegen oder erneuern; --update-config ergänzt fehlende Felder (junit, mainBranch, graph)',
  '  exclude [--share] [--gitignore] [--gitattributes]   .claude/, .codecycle/, .githooks/ lokal halten (--share: nur .claude/settings.local.json); optional auch .gitignore bzw. .gitattributes ergänzen',
  '  guard [--base <ref>]        Kontrolldateien, Abhängigkeitsdateien, Testzahl (--record vorher)',
  '  solo check <ordner>         vor dem Prüfer (/codecycle:new): check grün, alles committet; nennt berührte Risikobereiche für den Prüfauftrag',
  '  solo funde <ordner>         vor dem Merge (/codecycle:new): jeder Fund aus reports/pruefung.md (und pruefung-sicherheit.md) mit Status in TASK.md',
  '  solo plan <ordner> <teil> … große Aufgabe: Teile des Plans in STATE.md',
  '  solo teil start|fertig <ordner> <name>   ein Teil nach dem anderen auf eigenem Branch im Hauptordner (fertig: grün, Fast-Forward, Branch weg)',
  '  solo teil fertig <ordner> <name> --uebernommen   Teil-Branch fehlt, Teil von Hand übernommen: nur den Stand fertig setzen',
  '  solo pruefung start|ende <ordner> [--teil <name>]   Wegwerf-Worktree für den Prüfer',
  '  effort <ordner> --record   Messung der Aufgabe (Läufe, Diff-Zeilen, gewichtete Tokens) in aufwand.json',
  'Exit-Codes: 0 grün, 1 rot, 2 Werkzeug kaputt',
]

export async function main(argv: string[], ctx: Ctx): Promise<number> {
  const [name = 'help', ...args] = argv
  if (name === 'help' || name === '--help') {
    HELP.forEach(line => ctx.out(line))
    return 0
  }
  if (name === '--version') {
    ctx.out(TOOL_VERSION)
    return 0
  }
  const command = COMMANDS[name]
  if (!command) {
    ctx.out(`Werkzeug kaputt: unbekannter Befehl „${name}“ (codecycle help)`)
    return 2
  }
  try {
    return await command(args, ctx)
  } catch (err) {
    if (err instanceof ToolBroken) {
      ctx.out(`Werkzeug kaputt: ${err.message}`)
    } else {
      ctx.out(`Werkzeug kaputt (unerwartet): ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
    }
    return 2
  }
}
