@echo off
rem MAKRO-RADAR starten: Kalender aktualisieren und Dashboard oeffnen
cd /d "%~dp0"
echo Hole neuestes Briefing von GitHub...
git pull --rebase --autostash
echo Hole aktuelle Kalenderdaten...
node scripts\fetch-kalender.mjs
start "" "%~dp0dashboard\index.html"
