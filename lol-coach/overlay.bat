@echo off
REM Overlay 1-clic (Windows) — fenetre transparente always-on-top sur le jeu.
REM /!\ League doit etre en mode "Sans bordure / Borderless" (Options > Video)
REM     pour que l'overlay s'affiche par-dessus.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 ( echo Node.js requis : https://nodejs.org ^(LTS^). & pause & exit /b 1 )

if not exist node_modules ( call npm install )
if not exist node_modules\electron (
  echo Installation d'Electron ^(1re fois, ~1-2 min^)...
  call npm install -D electron
  if errorlevel 1 ( echo Echec d'installation d'Electron. & pause & exit /b 1 )
)

REM Demarre le serveur en arriere-plan (fenetre minimisee).
start "coach-server" /min cmd /c "npm start"
timeout /t 3 /nobreak >nul

echo Overlay PLEIN ECRAN transparent (clic-traversant). League en mode Sans bordure.
echo   - Survole un panneau = interactif ; zones vides = clics vers le jeu.
echo   - Glisse un panneau par son titre pour le placer ou tu veux (memorise).
echo   - Ctrl+Shift+X = mode arrangement, Ctrl+Shift+H = masquer, Fleches = cible du Duel.
call npm run overlay
pause
