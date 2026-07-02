# Attribution des assets

Tous les assets 3D et textures du jeu sont libres (CC0 ou MIT). Aucun contenu
provenant de jeux commerciaux ou de franchises (Pokémon/Nintendo inclus) n'est
utilisé. Détail des sources ci-dessous.

## Quaternius (licence CC0 — domaine public)

Modèles 3D bas-poly animés de Quaternius (https://quaternius.com), publiés en
CC0 ("free to use in any project, even commercially"). Fichiers GLB récupérés
via la plateforme de distribution Poly Pizza (https://poly.pizza), qui héberge
les packs officiels de l'auteur.

- **Ultimate Monsters Pack** (oct. 2022) → `public/assets/creatures/*.glb`
  (39 monstres animés : Idle/Walk/Run/Punch/Bite/HitReact/Death…). Utilisés
  comme base des 151 Wyldes : chaque famille d'espèces est mappée sur un
  monstre, puis re-teintée (palette par espèce) et re-dimensionnée.
  Source : https://quaternius.com/packs/ultimatemonsters.html —
  https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6
- **Animated Men Pack** + **Animated Women Pack** → `public/assets/characters/*.glb`
  (7 personnages animés : Idle/Walk/Run/Punch/SwordSlash/Death…). Utilisés pour
  le joueur et tous les PNJ, avec re-coloration des matériaux (peau, tenue,
  cheveux) selon les palettes du jeu.
  Sources : https://quaternius.com/packs/animatedmen.html —
  https://quaternius.com/packs/animatedwomen.html —
  https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT —
  https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY
- **Ultimate Stylized Nature Pack** (mai 2022) → `public/assets/nature/*.glb`
  (bouleaux, pins, érables, arbres morts, palmiers, buissons, fleurs, herbe,
  rochers — 5 variantes par fichier). Textures re-compressées en WebP 512px
  via gltf-transform pour le mobile.
  Source : https://quaternius.com/packs/ultimatestylizednature.html —
  https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr

## Kenney (licence CC0 — domaine public)

- **Fantasy Town Kit 2.0** (kenney.nl) → `public/assets/town/*.glb`
  (67 modules : murs pierre/bois, toits, lanternes, étals de marché, fontaines,
  charrettes, haies, bannières, moulin…). Utilisés pour assembler les maisons,
  boutiques et arènes des villes, et comme props de décor.
  Source : https://kenney.nl/assets/fantasy-town-kit — licence CC0
  (http://creativecommons.org/publicdomain/zero/1.0/), « Support by crediting
  'Kenney' or 'www.kenney.nl' (this is not a requirement) ».

## Poly Haven (licence CC0 — domaine public)

Textures PBR 1K (diffuse + normale, re-compressées en JPEG q72) →
`public/assets/textures/` ; HDRI 1K → `public/assets/env/sky_1k.hdr`.
Tous les assets Poly Haven sont CC0 (https://polyhaven.com/license).

- `grass_*` : « Aerial Grass Rock » — https://polyhaven.com/a/aerial_grass_rock
- `dirt_*_1k` : « Brown Mud Leaves 01 » — https://polyhaven.com/a/brown_mud_leaves_01
- `stone_*` : « Cobblestone 02 » — https://polyhaven.com/a/cobblestone_02
- `sand_*` : « Coast Sand 01 » — https://polyhaven.com/a/coast_sand_01
- `snow_*` : « Snow 02 » — https://polyhaven.com/a/snow_02
- `env/sky_1k.hdr` : « Kloofendal 48d Partly Cloudy (Pure Sky) » —
  https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky

## EZ-Tree — Daniel Greenheck (licence MIT)

- Génération procédurale d'arbres (bibliothèque `@dgreenheck/ez-tree`), encore
  utilisée en complément. Modèles copiés depuis le paquet npm dans
  `public/assets/models/` : `grass.glb`, `flower_blue.glb`, `flower_white.glb`,
  `flower_yellow.glb`, `rock1.glb`, `rock2.glb`, `rock3.glb`.
- Textures copiées dans `public/assets/textures/` : `grass.jpg`,
  `dirt_color.jpg`, `dirt_normal.jpg`.

Source : https://github.com/dgreenheck/ez-tree — © Daniel Greenheck, licence MIT.
Le texte de la licence est disponible dans `node_modules/@dgreenheck/ez-tree/LICENSE`
et reproduit ci-dessous comme l'exige la licence :

> MIT License
>
> Copyright (c) 2024 Dan Greenheck
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## @pmndrs/assets (licence CC0-1.0)

Assets du collectif Poimandres, domaine public (CC0), utilisés le cas échéant
pour l'éclairage d'environnement.

L'interface, le scénario, les noms (créatures, lieux, personnages) et le design
du jeu restent une création originale de ce projet.
