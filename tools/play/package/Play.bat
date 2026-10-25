@echo off
rem Re-Union X: start the game. Double-click this file.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0data\launcher\Play.ps1" %*
if errorlevel 1 (pause) else (timeout /t 30)
