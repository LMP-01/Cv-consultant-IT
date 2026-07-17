#!/bin/bash
# Overlay 1-clic (macOS) — HUD in-game compact (type Blitz) par-dessus le jeu.
# ⚠️ League of Legends doit être en mode "Sans bordure / Borderless" (Options >
#    Vidéo > Mode d'affichage) pour que le HUD apparaisse au-dessus.
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
echo "HUD in-game compact (colonne transparente a droite de l'ecran). League en 'Sans bordure'."
echo "  - Glisse la barre 'Coach' en haut pour deplacer le HUD ; bord = redimensionner."
echo "  - Cmd+Shift+X = la souris passe A TRAVERS le HUD (re-appuie pour reprendre la main)."
echo "  - Cmd+Shift+H = masquer/afficher. Fleches gauche/droite = cible du panneau Duel."
echo "  - Trop grand/petit ? OVERLAY_ZOOM=0.9 npm run overlay (ou 1.1)."
echo "  - Autres modes : OVERLAY_STYLE=solid (fenetre opaque) / transparent (plein ecran)."
npm run overlay
