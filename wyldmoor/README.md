# Wyldmoor

Un RPG de créatures sauvages en monde ouvert, jouable sur mobile comme sur navigateur, inspiré du gameplay temps réel de *Pokémon Legends Z-A* mais entièrement rejoué avec un univers original : une région inédite (**Wyldmoor**), 151 créatures originales (les **Wyldes**), un nouveau scénario, et un design propre à ce projet. Aucun contenu de Pokémon/Nintendo n'est utilisé — tous les noms, créatures, cartes et graphismes sont générés spécifiquement pour ce jeu.

## Caractéristiques

- **Exploration 3D temps réel à la 3e personne** (Three.js) : caméra à l'épaule, monde bas-poly stylisé, aucun assets externe (tout est généré procéduralement en code).
- **Combats en temps réel superposés au monde** : pas d'écran de transition — le combat se déclenche directement là où le Wylde sauvage ou le dresseur se trouve, avec roue de capacités, barres de vie et journal de combat qui défile, comme dans Legends Z-A.
- **151 créatures 100% originales**, réparties en familles d'évolution, sur 15 types élémentaires, avec un modèle 3D bas-poly généré proceduralement pour chacune.
- **Une région complète** : ville de départ, routes, 8 arènes, un conseil d'élite, un champion, une équipe adverse et un Wylde légendaire.
- **Progressive Web App** : installable sur l'écran d'accueil (iOS/Android), fonctionne hors-ligne après le premier chargement.
- Sauvegarde locale automatique (`localStorage`).

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvrez l'URL affichée dans un navigateur (fonctionne aussi sur mobile via le réseau local). Utilisez `npm run build` pour générer la version de production (`dist/`), installable comme PWA.

## Commandes

- Déplacement : `ZQSD`/flèches sur clavier, joystick tactile sur mobile.
- Interagir / parler / attaquer : `Espace` ou le bouton rond **A** à l'écran.
- Menu (équipe, sac, Wyldex, sauvegarde) : le bouton `☰`.

## Structure du code

```
src/
  data/        Types élémentaires, capacités, objets, schéma des créatures/cartes, les 151 espèces, le contenu du monde (villes, routes, PNJ, arènes)
  systems/     Statistiques, instance de créature vivante, moteur de combat temps réel, état de la partie, sauvegarde
  gfx/         Générateurs 3D bas-poly procéduraux (créatures et humanoïdes)
  world/       Runtime de carte, contrôleur du joueur, caméra 3e personne, acteurs PNJ/Wyldes
  battle/      Vue 3D du combat et contrôleur reliant moteur de combat + interface
  ui/          HUD (DOM), menus
  core/        Entrées (clavier/tactile), orchestrateur principal de l'application
```

## Notes de conception

- Tous les modèles 3D (créatures, personnages, décor) sont **générés par code** à partir de primitives géométriques (Three.js), sans aucun asset externe : chaque espèce a un descripteur (silhouette, palette, motif) qui produit un modèle bas-poly distinct et déterministe.
- Le monde, le scénario, les noms de créatures et de lieux sont une création originale pour ce projet.
