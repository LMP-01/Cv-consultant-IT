@echo off
REM Lancement 1-clic (Windows) — double-clique ce fichier.
cd /d "%~dp0"

echo LoL Coach IA - demarrage...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installe-le depuis https://nodejs.org ^(LTS^) puis relance.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances ^(1re fois^)...
  call npm install
  if errorlevel 1 ( echo npm install a echoue. & pause & exit /b 1 )
)

if "%PORT%"=="" set PORT=3000
start "" "http://localhost:%PORT%"
echo Interface : http://localhost:%PORT%   (Ctrl+C pour quitter)
call npm start
pause
