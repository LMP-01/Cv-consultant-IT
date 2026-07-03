#!/bin/bash
# Overlay 1-clic (macOS) — fenêtre transparente always-on-top par-dessus le jeu.
# ⚠️ League of Legends doit être en mode "Sans bordure / Borderless" (Options >
#    Vidéo > Mode d'affichage) pour que l'overlay apparaisse au-dessus.
cd "$(dirname "$0")" || exit 1

echo "LoL Coach — Overlay…"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js requis : https://nodejs.org (LTS)."; read -r -p "Entrée pour fermer."; exit 1
fi
[ -d node_modules ] || npm install
if [ ! -d node_modules/electron ]; then
  echo "Installation d'Electron (1re fois, ~1-2 min)…"
  npm install -D electron || { echo "Échec d'installation d'Electron."; read -r -p "Entrée."; exit 1; }
fi
# Démarre le serveur en arrière-plan s'il ne tourne pas déjà.
if ! curl -s "http://localhost:${PORT:-3000}/api/health" >/dev/null 2>&1; then
  echo "Démarrage du serveur…"; ( npm start >/dev/null 2>&1 & ); sleep 3
fi
echo "Overlay PLEIN ECRAN transparent (clic-traversant). League en 'Sans bordure'."
echo "  - Survole un panneau = interactif ; zones vides = clics vers le jeu."
echo "  - Glisse un panneau par son titre pour le placer ou tu veux (positions memorisees)."
echo "  - Ctrl+Shift+X = mode arrangement (tout cliquable), Ctrl+Shift+H = masquer,"
echo "    Fleches gauche/droite = cible du panneau Duel."
echo "  - Petite fenetre flottante a la place ? relance avec : OVERLAY_FULLSCREEN=0 npm run overlay"
npm run overlay
