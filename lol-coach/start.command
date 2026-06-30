#!/bin/bash
# Lancement 1-clic (macOS) — double-clique ce fichier.
# (Si macOS refuse : clic droit > Ouvrir, ou : chmod +x start.command)
cd "$(dirname "$0")" || exit 1

echo "🐉 LoL Coach IA — démarrage…"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js n'est pas installé. Installe-le depuis https://nodejs.org (LTS) puis relance."
  read -r -p "Appuie sur Entrée pour fermer."
  exit 1
fi

# Installe les dépendances au premier lancement.
if [ ! -d node_modules ]; then
  echo "📦 Installation des dépendances (1re fois)…"
  npm install || { echo "❌ npm install a échoué."; read -r -p "Entrée pour fermer."; exit 1; }
fi

# Ouvre le navigateur après un court délai, puis lance le serveur.
( sleep 2; open "http://localhost:${PORT:-3000}" ) &
echo "🌐 Interface : http://localhost:${PORT:-3000}  (Ctrl+C pour quitter)"
npm start
