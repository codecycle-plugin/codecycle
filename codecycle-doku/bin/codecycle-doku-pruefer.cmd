@echo off
rem Starter fuer den Pruefer unter Windows (cmd), gleiche Logik wie bin/codecycle-doku-pruefer (sh):
rem gibt alle Argumente an skripte/pruefer.mjs weiter. Fehlt Node: Exit 2 mit Meldung.
where node >nul 2>nul
if errorlevel 1 goto nonode
node "%~dp0..\skripte\pruefer.mjs" %*
exit /b %errorlevel%
:nonode
echo Pruefer nicht gestartet: node fehlt
exit /b 2
