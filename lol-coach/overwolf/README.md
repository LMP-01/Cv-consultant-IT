# LoL Coach IA — app Overwolf (prototype)

Overlay **Overwolf** du coach. Overwolf est **sanctionné par Riot** et s'affiche **par-dessus le plein écran exclusif** (contrairement à l'overlay Electron qui exige le mode « Sans bordure »).

## 🧭 Principe : une seule source de vérité

Cette app Overwolf **ne réimplémente pas** le HUD. Sa fenêtre in-game charge, dans une iframe, **l'UI web locale du coach** :

```
overwolf/windows/ingame.html  ──(iframe)──►  http://localhost:3000/?overlay=1
```

Conséquence : **toute mise à jour de `public/` (le HUD, les panneaux, la proba de duel, etc.) met à jour Overwolf automatiquement.** Le dossier `overwolf/` ne contient qu'une coquille fine (manifest + gestion de fenêtre + hotkeys).

## ✅ Prérequis

1. **Windows** (Overwolf est Windows uniquement).
2. **Overwolf** installé : <https://www.overwolf.com/>.
3. Le **serveur du coach** doit tourner : dans `lol-coach/`, lance `npm start` (ou `overlay.bat`, qui démarre aussi le serveur). L'app Overwolf affiche un rappel si le serveur ne répond pas.

## ▶️ Charger l'app (mode développeur)

1. Ouvre Overwolf → **Paramètres** → **À propos** → **Options de développement** (Support → Development options).
2. **« Load unpacked extension »** → sélectionne le dossier **`lol-coach/overwolf/`**.
3. Lance **League of Legends** : la fenêtre du coach s'ouvre automatiquement par-dessus le jeu (in-game only).

## ⌨️ Raccourcis (configurables dans Overwolf → Paramètres → Raccourcis)

- **Ctrl+Shift+H** — afficher / masquer le coach.
- **Ctrl+Shift+X** — clic-traversant (la souris passe à travers l'overlay).
- **Flèche gauche / droite** — cycle la **cible** du panneau Duel (proba trade/all-in).
- Déplace la fenêtre en glissant la **barre du haut**.

## 🔁 Mettre à jour

- **HUD / logique** : édite `lol-coach/public/…` comme d'habitude → l'app Overwolf reflète le changement au prochain rechargement (l'iframe recharge le serveur local).
- **Coquille Overwolf** (rare) : si tu changes `manifest.json` ou les fichiers `windows/`, recharge l'app dans Overwolf (bouton **Reload** de l'extension non-packagée).
- La **version** est synchronisée avec `package.json` via `npm run sync-overwolf-version`.

## ⚠️ Notes

- C'est un **prototype** : la structure (manifest v1, fenêtres background/in-game, game id LoL `5426`, hotkeys) suit la doc Overwolf, mais il doit être testé/chargé dans le client Overwolf (impossible à exécuter hors Windows+Overwolf).
- Si l'iframe `http://localhost:3000` est bloquée par la politique de sécurité d'Overwolf sur ta version, dis-le : on bascule vers une variante qui **sert les fichiers `public/` directement dans l'app** (même code, empaqueté).
- Icônes (`icons/`) : placeholders unis — remplace-les par de vraies icônes 256×256 quand tu veux.
