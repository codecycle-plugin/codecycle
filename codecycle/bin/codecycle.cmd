@echo off
rem Starter fuer das Projekt-Werkzeug unter Windows (cmd), gleiche Logik wie bin/codecycle (sh):
rem nimmt die Kopie im Hauptordner des Projekts (auch aus Worktrees), sonst den Kern im Plugin.
rem Sonderregel: install-tool und update nehmen immer den Kern im Plugin.
rem Fehlt Node oder ist es zu alt: Exit 2 (Werkzeug kaputt), nicht Nodes Exit 1.
setlocal EnableDelayedExpansion
where node >nul 2>nul
if errorlevel 1 goto nonode
set "major="
for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set "major=%%v"
if not defined major goto nonode
if %major% LSS 24 goto tooold
for %%d in ("%~dp0..") do set "here=%%~fd"
if /i "%~1"=="install-tool" goto plugin
if /i "%~1"=="update" goto plugin
set "common="
for /f "delims=" %%c in ('git rev-parse "--path-format=absolute" --git-common-dir 2^>nul') do set "common=%%c"
if not defined common goto plugin
for %%d in ("!common!\..") do set "root=%%~fd"
if exist "!root!\.codecycle\tool\cli.ts" (
  node "!root!\.codecycle\tool\cli.ts" %*
  exit /b !errorlevel!
)
:plugin
node "%here%\tool\cli.ts" %*
exit /b %errorlevel%
:nonode
echo Werkzeug kaputt: node fehlt, mindestens Version 24
exit /b 2
:tooold
echo Werkzeug kaputt: Node %major% ist zu alt, mindestens Version 24
exit /b 2
