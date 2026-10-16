// Kontrolldateien: Dateien, an denen ein Paket
// nichts ändern darf, weil sie die Prüfung selbst steuern (Werkzeug-Konfiguration, Hooks, CI,
// Test- und Lint-Konfiguration). Reiner Code ohne Node und ohne Mod-API; eine Funktion für
// Werkzeug (`codecycle guard`) und Mod (Zaun, Schalter `fence`).
//
// Abhängigkeitsdateien (composer.json, package.json, Lockdateien) sind NICHT pauschal
// Kontrolldateien: Abhängigkeiten sind legitim, ändern sie sich, ist `toolsmith` nötig.
// Test- und Lint-Abschnitte in pyproject.toml/setup.cfg lassen sich nicht abschnittsweise
// prüfen; diese Dateien gelten deshalb als Ganzes als Kontrolldateien (Dateiebene).
//
// Muster: `*` (ohne `/`), `**` (mit `/`), `?`. Ein Muster passt auf den Pfad oder auf jedes
// Pfadende (ab einem `/`), also gleich für `src/phpunit.xml`, `phpunit.xml` und einen
// absoluten Pfad. Groß-/Kleinschreibung zählt nicht (Windows).

import { TOOL_CONFIG, normPath } from './paths.ts'

export const DEFAULT_CONTROL: readonly string[] = [
  TOOL_CONFIG,
  '.codecycle/tool/**',
  // Ablage von `codecycle guard` (Testzahlen, Grundlage der ignorierten Kontrolldateien). Nur genau diese Datei:
  // der Rest von .codecycle/tmp/ bleibt für Hilfsskripte und Berichte offen.
  '.codecycle/tmp/guard-records.json',
  '.githooks/**',
  // Git-Konfiguration und Git-Hooks: `core.hooksPath` ließe sich hier ohne `git config` umbiegen
  // (Edit/Write, `echo … >> .git/config`). Nur Schreiben ist betroffen (Zaun, guard sieht .git/ nie).
  '.git/config',
  '.git/config.worktree',
  '.git/worktrees/*/config*',
  '.git/hooks/**',
  '.husky/**',
  'lefthook.yml',
  'lefthook.yaml',
  '.pre-commit-config.yaml',
  '.github/workflows/**',
  '.gitlab-ci.yml',
  '.gitlab-ci.yaml',
  '.circleci/**',
  'azure-pipelines.yml',
  'bitbucket-pipelines.yml',
  '.travis.yml',
  'Jenkinsfile',
  // Tests
  'phpunit.xml*',
  'jest.config.*',
  'vitest.config.*',
  'vitest.workspace.*',
  'karma.conf.*',
  'playwright.config.*',
  'cypress.config.*',
  '.mocharc*',
  'pytest.ini',
  'tox.ini',
  'conftest.py',
  '.coveragerc',
  'pyproject.toml',
  'setup.cfg',
  // Lint und Format
  '.eslintrc*',
  'eslint.config.*',
  '.prettierrc*',
  'prettier.config.*',
  '.php-cs-fixer*',
  'phpcs.xml*',
  'phpstan.neon*',
  'psalm.xml*',
  '.stylelintrc*',
  'biome.json*',
  '.flake8',
  'ruff.toml',
  '.ruff.toml',
  'mypy.ini',
  '.editorconfig',
]

export const DEFAULT_DEPENDENCY: readonly string[] = [
  'composer.json',
  'composer.lock',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'requirements*.txt',
  'Pipfile',
  'Pipfile.lock',
  'poetry.lock',
  'go.mod',
  'go.sum',
  'Cargo.toml',
  'Cargo.lock',
  'Gemfile',
  'Gemfile.lock',
]

/** Abschnitt `protected` der Werkzeug-Konfiguration: Liste (= Kontrolldateien) oder Objekt. */
export type ProtectedConfig = {
  protected?: string[] | { control?: string[]; dependency?: string[] }
}

export type FileKind = 'control' | 'dependency' | 'normal'

export function normalizePath(path: string): string {
  return normPath(path).replace(/\/{2,}/g, '/')
}

const cache = new Map<string, RegExp>()

/** `*`, `**`, `?` in einen regulären Ausdruck (ganzer Pfad). */
export function globToRegExp(glob: string): RegExp {
  const hit = cache.get(glob)
  if (hit) return hit
  let out = ''
  const g = normalizePath(glob)
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 2
        } else {
          out += '.*'
          i += 1
        }
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  const re = new RegExp(`^${out}$`, 'i')
  cache.set(glob, re)
  return re
}

/** Passt ein Muster auf den Pfad oder auf ein Pfadende? */
export function matchesPattern(path: string, pattern: string): boolean {
  const p = normalizePath(path)
  const re = globToRegExp(pattern)
  if (re.test(p)) return true
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '/' && re.test(p.slice(i + 1))) return true
  }
  return false
}

function extra(config: ProtectedConfig | null | undefined): { control: string[]; dependency: string[] } {
  const raw = config?.protected
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
  if (Array.isArray(raw)) return { control: strings(raw), dependency: [] }
  if (raw && typeof raw === 'object') return { control: strings(raw.control), dependency: strings(raw.dependency) }
  return { control: [], dependency: [] }
}

/** Kontrolldatei, Abhängigkeitsdatei oder normal. Kontrolle geht vor Abhängigkeit. */
export function classifyFile(path: string, config?: ProtectedConfig | null): FileKind {
  const e = extra(config)
  if ([...DEFAULT_CONTROL, ...e.control].some(p => matchesPattern(path, p))) return 'control'
  if ([...DEFAULT_DEPENDENCY, ...e.dependency].some(p => matchesPattern(path, p))) return 'dependency'
  return 'normal'
}

export function isControlFile(path: string, config?: ProtectedConfig | null): boolean {
  return classifyFile(path, config) === 'control'
}

export type Classified = { control: string[]; dependency: string[] }

export function classifyAll(paths: readonly string[], config?: ProtectedConfig | null): Classified {
  const out: Classified = { control: [], dependency: [] }
  for (const p of paths) {
    const k = classifyFile(p, config)
    if (k === 'control') out.control.push(p)
    else if (k === 'dependency') out.dependency.push(p)
  }
  return out
}

/**
 * Doku-Pfad für den Doku-Pfleger: Er schreibt nur Doku und seinen Bericht.
 * Erlaubt: Markdown und andere Doku-Formate (`*.md`, `*.mdx`, `*.markdown`, `*.rst`, `*.adoc`) überall im Projekt,
 * also auch Wurzel- und Bereichs-`CLAUDE.md`; in den Ordnern `docs` und `doc` zusätzlich `*.txt` und Bilder (`png jpg jpeg
 * gif svg webp`), aber keine Code- oder Skriptdateien (sonst ließe sich dort etwa ein
 * `tool/cli.ts` oder Skript anlegen und starten); `README`, `CHANGELOG`, `CHANGES`, `HISTORY` ohne Endung oder mit
 * Doku-Endung; Berichte ohne Aufgabe unter `.codecycle/tmp/reports/`. Nicht erlaubt: Pfade außerhalb des Projekts
 * (absolut, `..`, `~/…`, `<plugin>/…`), `node_modules/`, `vendor/` und die Ordner `.claude/`, `.codecycle/` (außer
 * den Berichten), `.git/`, `.githooks/` (Konfiguration, auch wenn sie Markdown ist). `path` ist relativ zum Projekt.
 */
const DOC_EXT = /\.(md|mdx|markdown|rst|adoc)$/i
/** in den Ordnern docs und doc zusätzlich Text und Bilder */
const DOCS_DIR_EXT = /\.(md|mdx|markdown|rst|adoc|txt|png|jpe?g|gif|svg|webp)$/i

export function isDocPath(path: string): boolean {
  const p = normalizePath(path.trim())
  if (p === '' || /^([\/]|[A-Za-z]:|~|<)/.test(p) || p.split('/').includes('..')) return false
  if (/^\.codecycle\/tmp\/reports\/[^/]+\.md$/i.test(p)) return true
  if (/(^|\/)(node_modules|vendor)\//i.test(p) || /^\.(claude|codecycle|git|githooks)(\/|$)/i.test(p)) return false
  const name = p.split('/').at(-1)!
  if (DOC_EXT.test(name)) return true
  if (/^(readme|changelog|changes|history)(\.txt)?$/i.test(name)) return true
  return /^docs?\//i.test(p) && DOCS_DIR_EXT.test(name)
}
