@echo off
rem Starter fuer die Einrichtung unter Windows (cmd), gleiche Logik wie bin/codecycle-doku-einrichten (sh):
rem gibt alle Argumente an skripte/einrichten.mjs weiter. Fehlt Node: Exit 2 mit Meldung.
where node >nul 2>nul
if errorlevel 1 goto nonode
node "%~dp0..\skripte\einrichten.mjs" %*
exit /b %errorlevel%
:nonode
echo Einrichtung nicht gestartet: node fehlt
exit /b 2
