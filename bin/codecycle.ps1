# Starter für das Projekt-Werkzeug in PowerShell, gleiche Logik wie bin/codecycle (sh):
# nimmt die Kopie im Hauptordner des Projekts (auch aus Worktrees), sonst den Kern im Plugin.
# Sonderregel: install-tool und update nehmen immer den Kern im Plugin.
# Fehlt Node oder ist es zu alt: Exit 2 (Werkzeug kaputt), nicht Nodes Exit 1.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Output 'Werkzeug kaputt: node fehlt, mindestens Version 24'
  exit 2
}
$major = 0
[void][int]::TryParse(((& node -p "process.versions.node.split('.')[0]") | Out-String).Trim(), [ref]$major)
if ($major -lt 24) {
  Write-Output "Werkzeug kaputt: Node $major ist zu alt, mindestens Version 24"
  exit 2
}
$here = Split-Path -Parent $PSScriptRoot
# install-tool und update laufen immer vom Plugin-Kern: die Kopie aktualisiert sich nie selbst.
if ($args.Count -gt 0 -and ($args[0] -eq 'install-tool' -or $args[0] -eq 'update')) {
  & node (Join-Path $here 'tool/cli.ts') @args
  exit $LASTEXITCODE
}
$common = ''
if (Get-Command git -ErrorAction SilentlyContinue) {
  $common = ((& git rev-parse --path-format=absolute --git-common-dir 2>$null) | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { $common = '' }
}
if ($common -ne '') {
  $root = Split-Path -Parent $common
  $copy = Join-Path $root '.codecycle/tool/cli.ts'
  if (Test-Path -LiteralPath $copy) {
    & node $copy @args
    exit $LASTEXITCODE
  }
}
& node (Join-Path $here 'tool/cli.ts') @args
exit $LASTEXITCODE
