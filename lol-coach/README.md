# 🐉 LoL Coach IA — coaching League of Legends en temps réel

Un agent qui **surveille tes parties de League of Legends en direct** et te donne, dans une **appli web locale (HTML + Node.js)** :

- 💬 des **conseils de jeu en temps réel** (macro, objectifs, timings, recall, survie…) pendant la partie, à cadence régulière **et immédiatement sur les moments clés** (mort, chute de PV brutale, kill/objectif) ;
- 🧩 des **suggestions de pick et de build** adaptées à **toute la composition adverse ET à ta propre équipe** (synergie de duo, équilibre des dégâts, **probabilité de win estimée**) pendant le **champ select** ;
- 📊 un **tableau de bord** live (timers d’objectifs, scoreboard, tes stats) + un **build conseillé en jeu** (3 prochains achats avec mini-items, build complet évolutif, runes vs la compo) ;
- ⏲️ des **timers Flash/ultimes** des ennemis et des **alertes de fenêtre de force** (tempo vs ton adversaire de lane) ;
- 🚫 des **bans conseillés** et une **probabilité de win** par pick (ancrée sur les vrais winrates de matchup si tu lances `fetch-counters`) ;
- 🗨️ un **chat** (avec **dictée vocale**) pour poser une question à Claude pendant la partie (mort, alt-tab) ;
- 📈 un **historique** avec **critique IA** par game, **courbes de progression**, **suivi d’objectif**, et une **analyse de tes faiblesses récurrentes** ;
- 🛰️ des **données live avancées** : **dragon soul**, **counter-build** sur les objets réels adverses, **sorts d’invoc & keystones** ennemis, tes résistances, vision — le tout nourrissant l’IA pour de la **stratégie** ;
- 🎮 (optionnel) **rang/LP & historique réel** via la **Riot API**, un **coach personnalisé** (tes faiblesses récurrentes), la **voix mains-libres**, et un **lancement 1-clic** (`start.command` / `start.bat`) ;
- 🛠️ des **builds high-elo réels** via `npm run fetch-builds`, un **mode compact** (2e écran), un **indicateur d’usage IA**, la **détection du patch**, une **voix HD** optionnelle (serveur Piper) et des **tests** (`npm test`).

Le moteur de conseils fonctionne **sans aucune clé API** grâce à des règles locales, et devient encore plus intelligent si tu fournis une clé **Claude (Anthropic)**.

---

## ⚠️ À lire en premier

Cette appli s’appuie sur les **API locales du client Riot**, qui ne sont accessibles **que sur la machine où tourne League of Legends** (`127.0.0.1`). 

➡️ **Tu dois donc lancer ce coach sur ton PC de jeu, à côté de League.** Il ne peut pas surveiller une partie à distance.

Aucune donnée n’est envoyée ailleurs : tout reste en local, sauf — si tu actives l’option — les instantanés d’état de jeu envoyés à l’API Claude pour générer des conseils.

C’est conforme à l’esprit des outils tiers de Riot : on **lit** uniquement les API officielles locales (`Live Client Data API`, `LCU`), on n’**automatise aucune action** et on n’injecte aucune entrée dans le jeu.

---

## ✨ Fonctionnalités

### En champ select
- Détecte ton **rôle** et ton **adversaire de lane**.
- Suggère des **picks** qui counterent la team adverse (dataset de matchups embarqué).
- Analyse le **profil de dégâts adverse** (AD / AP / mixte), le **CC** et le **burst**.
- Propose un **build défensif** et des **runes/sorts** adaptés (plaques d’acier vs AD, Mercure vs AP, Zhonya vs burst, anti-CC…).

### En partie
- **Timers d’objectifs** : Dragon (5:00, respawn 5:00), Voidgrubs (6:00), Héraut (15:00), Baron (20:00, respawn 6:00) — valeurs patch 26.13.
- **Conseils contextuels** : objectif imminent/disponible, PV bas, recall sur spike d’or, CS/min, mortalité, niveau 6, réponse à un objectif adverse, build défensif.
- **Tableau de bord** : ton KDA / CS / or / PV, et le **scoreboard** des deux équipes.
- Optionnel : **conseils générés par Claude** en complément, priorisés et concis.
- 🔊 **Lecture vocale** : les conseils peuvent être **lus à voix haute** pour ne pas quitter le jeu des yeux. Bouton « Voix », **choix de la voix** (les françaises en tête), et filtre *Important / Tout / IA*.

> 💡 La synthèse vocale utilise la **Web Speech API du navigateur** (locale, sans clé, sans réseau). La qualité dépend des voix installées sur ton OS : pour des voix françaises plus naturelles, **Microsoft Edge** (voix « Natural », ex. *Denise/Henri*) ou l’ajout de voix dans Windows/macOS donne le meilleur rendu. Clique « Voix » une fois (interaction requise par les navigateurs) puis « Test » pour l’essayer.

---

## 🛠️ Prérequis

- **Node.js ≥ 18** (testé sur Node 22).
- **League of Legends** installé (pour le mode réel).
- Une connexion Internet au premier lancement (pour récupérer les données Data Dragon des champions/objets ; ensuite mises en cache). Un **fallback embarqué** prend le relais si Data Dragon est injoignable.

---

## 🚀 Installation

```bash
cd lol-coach
npm install
cp .env.example .env   # optionnel : pour configurer la clé Claude, la langue, etc.
```

## ▶️ Utilisation

### Démo (sans League, pour découvrir l’interface)

```bash
npm run mock
```

Puis ouvre **http://localhost:3000**. La démo joue ~30 s de champ select puis bascule sur une partie simulée avec des timers qui défilent.

### Mode réel (sur ton PC de jeu)

```bash
npm start
```

Lance ensuite League of Legends. L’appli détecte automatiquement le **champ select** puis la **partie**, et met à jour les conseils en direct dans le navigateur (**http://localhost:3000**).

---

## ⚙️ Configuration (`.env`)

Toutes les variables sont optionnelles (voir `.env.example`) :

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port de l’interface web | `3000` |
| `LANG` | Langue (`fr` / `en`) | `fr` |
| `AI_PROVIDER` | `auto` / `claude-code` / `api` / `rules` | `auto` |
| `CLAUDE_CODE_MODEL` | Modèle via l’abonnement (Claude Code) | `claude-sonnet-4-6` |
| `ANTHROPIC_API_KEY` | Clé API (backend `api`, facturation au token) | — |
| `CLAUDE_MODEL` | Modèle pour le backend API | `claude-opus-4-8` |
| `AI_MIN_INTERVAL_SECONDS` | Cadence normale des conseils IA en jeu (s) | `8` |
| `AI_REACTIVE_FLOOR_SECONDS` | Plancher des conseils **réactifs** (mort, prise de risque, objectif…) (s) | `4` |
| `RIOT_API_KEY` | (Optionnel) enrichissement Riot API | — |
| `DDRAGON_LOCALE` | Locale des noms (`fr_FR`, `en_US`…) | `fr_FR` |
| `LEAGUE_PATH` | Chemin d’install de League (sinon autodétection) | — |
| `POLL_CHAMPSELECT_MS` | Cadence de rafraîchissement du champ select (ms) | `1000` |
| `MOCK_CHAMPSELECT_SECONDS` | Durée du champ select en mode démo | `30` |

### 🤖 Activer les conseils IA avec ton abonnement Claude Max/Pro (sans clé API)

Le backend `claude-code` utilise ton **abonnement Claude** via la CLI **Claude Code** — aucune clé API ni facturation au token.

1. Installe Claude Code : `npm install -g @anthropic-ai/claude-code` (ou voir https://code.claude.com).
2. Connecte ton abonnement : lance `claude` puis tape `/login` (ou `claude setup-token` pour un token longue durée).
3. Vérifie que **`ANTHROPIC_API_KEY` n’est PAS définie** (elle aurait la priorité). Mets dans `.env` :
   ```
   AI_PROVIDER=claude-code
   CLAUDE_CODE_MODEL=claude-sonnet-4-6
   ```
4. Lance l’app : `npm start`. Le badge « IA » affiche **Max** quand l’abonnement est actif.

> 💡 **Sonnet 4.6** (`claude-sonnet-4-6`) est conseillé en temps réel : il préserve ton **quota Max** (limites par fenêtres de 5 h) et répond plus vite. Mets `CLAUDE_CODE_MODEL=opus` si tu préfères. L’app **limite la cadence** des appels (`AI_MIN_INTERVAL_SECONDS`) et **retombe sur le moteur de règles** si le quota est atteint.

> 🧠 **L’IA analyse aussi le champ select EN DIRECT** : dès que la CLI Claude est détectée, le coach commente la **draft** (quel pick privilégier dans ta pool, quel ajustement de build/runes contre la compo) et **rafraîchit son analyse à chaque nouveau pick/ban** adverse. Les conseils apparaissent dans le flux « Conseils en direct » (catégorie **Draft IA**) et sont lus à voix haute si la voix est activée.

---

## 🧠 Comment ça marche

```
        ┌──────────────── Ton PC de jeu ────────────────┐
        │                                               │
 League │  LCU API (port aléatoire) ──► champ select    │
 client │  Live Client Data API (:2999) ──► état en jeu │
        │                 │                             │
        │                 ▼                             │
        │   Node.js  ──►  Moteur de règles + Claude     │
        │     │            (heuristiques, pick/build)   │
        │     ▼                                         │
        │  Serveur web local ──WebSocket──► Navigateur  │
        └───────────────────────────────────────────────┘
```

- **LCU API** (`/lol-champ-select/v1/session`, `/lol-gameflow/v1/gameflow-phase`) : lue via le `lockfile` du client (ou la ligne de commande du process `LeagueClientUx`), authentification Basic `riot:<token>` en HTTPS auto-signé.
- **Live Client Data API** (`https://127.0.0.1:2999/liveclientdata/allgamedata`) : état de la partie en cours (joueurs, scores, or, événements, temps de jeu).
- **Data Dragon** : noms/tags/portraits des champions et objets (mis en cache dans `.cache/`).
- **Moteur de conseils** : règles locales (`src/advisor/heuristics.js`, `pickAdvisor.js`, `profile.js`) + couche **Claude** optionnelle (`src/advisor/ai.js`) avec sortie JSON structurée.

---

## 🧩 Personnaliser le dataset

Le fichier **`data/counters.json`** est entièrement éditable :

- `counters` : pour chaque champion, la liste de ceux qui le contrent (counter-picks) ;
- `rolePicks` : un pool de picks solides par rôle ;
- `damageOverride`, `ccHeavy`, `burstThreats` : pour affiner l’analyse de composition.

Le matching est **tolérant à la casse et à la ponctuation** (`Kha'Zix` ≡ `Khazix`). Ajoute tes propres champions/matchups pour des suggestions plus pointues.

`data/champions.fallback.json` est le référentiel hors-ligne utilisé **uniquement** si Data Dragon est injoignable.

### 🎯 Ta pool de champions

Renseigne tes champions par rôle dans **`data/champion-pool.json`** :

```json
{
  "pool": {
    "MIDDLE": [{ "champion": "Anivia", "mastery": 700000 }, { "champion": "Malzahar", "mastery": 100000 }],
    "BOTTOM": [{ "champion": "Ezreal", "mastery": 200000 }, { "champion": "Draven", "mastery": 100000 }]
  }
}
```

En champ select, **si ton rôle assigné a une pool**, le coach te suggère **en priorité tes propres champions** (titre « 🎯 Tes picks »), classés selon :
1. à quel point ils **counterent** l'adversaire de lane (+++) et le reste de la team adverse (+),
2. la **synergie d'équipe** : un bonus si le pick **équilibre les dégâts de TON équipe** (un pick AP quand tes alliés sont full AD, et inversement) — le panneau « Composition » affiche `Adverse :` **et** `Ton équipe :`,
3. ta **maîtrise** (départage à counter égal).

Les champions **bannis** ou **déjà pris** sont retirés ; un champion inconnu de Data Dragon (nouveau champion) est signalé. Sans pool pour ton rôle, le coach retombe sur ses suggestions de counters génériques.

### 📖 Pages « Pool » par poste (fiches champions)

Depuis l'interface, les boutons **« 📖 Mid »** (`/mid.html`) et **« 📖 ADC »** (`/adc.html`) ouvrent **une page par poste** avec une **fiche par champion** :
- **caractéristiques** (tags, type de dégâts, ressource, difficulté, description) via Data Dragon ;
- **build conseillé** (runes, sorts, objets core/situationnels) — **avec l'icône de chaque item** (résolue à la volée selon le patch depuis Data Dragon), éditable dans `data/builds.json` ;
- **winrate overall** + **winrate par match-up** (qui le counter / qui il counter) ;
- les listes de counters.

> Les objets de `data/builds.json` sont en **noms anglais Data Dragon** pour permettre la résolution de l'icône. Un item renommé/retiré s'affiche en texte sans icône. Les builds sont **les builds méta cohérents** (cœur d'objets + situationnels) — ajuste-les librement en éditant `data/builds.json`.

Les **winrates live** proviennent de `data/champion-data.json`, généré par `npm run fetch-counters` (sur ta machine). Sans ce fichier, la page affiche les caractéristiques, le build et les counters curés ; les winrates apparaissent dès que tu lances le scraper.

### 🛒 Build conseillé en jeu (sous le tableau de bord)

Pendant la partie, sous le tableau de bord, un panneau **« Build conseillé »** affiche :
- les **runes/sorts** conseillés pour ton champion + des **ajustements selon la compo adverse** (RM vs AP, armure vs AD, anti-CC, survie vs burst) ;
- les **3 prochains achats** (objets finis non encore possédés) avec, pour chacun, les **mini-items / composants** à acheter d'abord (avec icônes) ;
- le **build complet ordonné** (départ → bottes → core → situationnel), **évolutif** : l'ordre du situationnel s'adapte à la menace adverse dominante.

Le plan se base sur `data/builds.json` + tes objets actuels (lus via la Live Client Data API) + la composition adverse. Si tu joues un champion absent de `data/builds.json`, le panneau ne s'affiche pas (ajoute-y le champion pour l'activer).

### 🗨️ Chat avec Claude pendant la partie

Sous le flux de conseils, une zone **« Demande à Claude »** permet de poser une question (utile **quand tu es mort / en alt-tab**). La réponse s'appuie sur l'**état du jeu en cours** (temps, tes stats, objectifs imminents, compositions). Nécessite l'abonnement Claude actif (CLI `claude`) ; sinon un message t'invite à l'activer. Les réponses prennent quelques secondes (appel au modèle).

### 📈 Historique & bilan des parties (`/history.html`)

À la **fin de chaque partie**, le coach enregistre un récap dans `data/history.json` (local, jamais commité) : champion, rôle, KDA, CS/min, durée, résultat, compositions. Si l'abonnement Claude est actif, Claude génère une **critique** : un résumé, ce que tu as **bien joué**, les **axes d'amélioration**, et **un objectif prioritaire** pour la partie suivante. La page **« 📈 Historique »** liste toutes tes parties avec des **statistiques agrégées** (winrate, KDA moyen, par champion).

### ⏲️ Timers Flash & ultimes ennemis

Sous le tableau de bord, un panneau liste les **adversaires** avec un bouton **Flash** (300 s) et **Ulti** (cooldown approximatif par champion). **Clique quand l'ennemi utilise le sort** → compte à rebours en direct + **rappel vocal** « Flash de X bientôt disponible » quand c'est presque up (si la voix est activée). Clic droit pour annuler. Les cooldowns d'ultimes sont éditables dans **`data/cooldowns.json`**.

### ⚡ Fenêtres de force (tempo)

Le coach compare en continu ton **niveau** et ton **or d'objets** à ceux de ton **adversaire de lane** et te prévient quand le rapport de force bascule : *« ⚡ Fenêtre de force : tu es plus fort que X (+2 niveaux) — cherche un play »* ou *« 🛡️ Adversaire en avance — temporise »*. C'est là que se gagnent/perdent les games.

### 📊 Analyse de tes faiblesses récurrentes (page Historique)

Sur la page **Historique**, le bouton **« 🔍 Analyser mes faiblesses récurrentes »** envoie tout ton historique à Claude, qui en sort **les patterns récurrents** (pas une seule game : tendances de morts, farm, matchups, résultats par champion…) et **3 chantiers prioritaires** pour progresser. L'analyse prend quelques secondes (appel au modèle).

### 🚫 Bans conseillés & 🎯 probabilité de win

En champ select, le coach propose des **bans** (les champions qui menacent le plus **ta pool** pour ton rôle + les grosses menaces méta) et affiche une **probabilité de win estimée par pick**. Si tu as lancé `npm run fetch-counters`, cette probabilité est **ancrée sur le winrate réel** du matchup vs ton adversaire de lane (sinon c'est une estimation heuristique, clairement étiquetée).

### 🛠️ Builds high-elo réels (`npm run fetch-builds`)

Pour des builds calés sur la **vraie méta des meilleurs joueurs** (par patch) plutôt que les builds curés :

```bash
npm run fetch-builds                 # ta pool, région monde, emerald+
node scripts/fetch-builds.js --self-test           # teste le parsing (hors-ligne)
node scripts/fetch-builds.js --region kr --rank challenger --champions Zoe,Caitlyn
node scripts/fetch-builds.js --dry-run             # aperçu sans écriture
```

Le script écrit `data/builds-live.json` (jamais commité). L'app le **préfère automatiquement** s'il existe : il fournit les **objets** (départ/bottes/core/situationnel), tandis que les runes/sorts/profil restent ceux de `data/builds.json`. Le panneau de build affiche alors la **source** (ex. `u.gg world/emerald_plus`). Source tierce **non officielle** : à lancer **chez toi**, et le format peut évoluer (la logique est couverte par `--self-test`).

### 📈 Progression & objectif (page Historique)

En plus de la critique par partie, la page Historique trace des **courbes** (morts/partie, CS/min, winrate cumulé, du plus ancien au plus récent) et un **suivi d'objectif** : fixe un but (ex. « ≤ 5 morts ») et vois le **% de parties** qui le respectent.

### 🗣️ Dictée vocale & voix HD

Le chat a un bouton **🎤** pour **dicter** ta question (reconnaissance vocale du navigateur, Chrome/Edge). Pour une **voix de lecture de meilleure qualité**, le bouton **🎚️ Voix HD** permet de brancher un **serveur TTS local** (ex. [Piper](https://github.com/rhasspy/piper) derrière un petit serveur HTTP qui renvoie de l'audio pour `{"text":"…"}`) ; sinon l'app utilise les voix du navigateur (préférence aux voix neuronales).

### 🖥️ Mode compact, usage IA & patch

- Bouton **🗖/🗗** : bascule un **layout compact** pour un 2e écran (persistant).
- Badge **IA** : affiche le **nombre d'appels** IA de la session et passe au rouge si le dernier appel a échoué (indicatif — la CLI n'expose pas le quota Max exact).
- Badge **Patch** : le patch détecté via Data Dragon ; il avertit si les **timings d'objectifs** (vérifiés pour un patch donné) doivent être revus.

### ✅ Tests

```bash
npm test     # tests des advisors (profil, picks, bans, build, tempo, historique…)
```

### 🛰️ Données live enrichies & stratégie

Le coach exploite désormais **bien plus** de l'API Live Client locale :
- **Dragon soul** : suivi des drakes pris par chaque équipe (et leur type) → *« prochain dragon = SOUL, contest obligatoire »*.
- **Counter-build** sur les **objets réels** de l'adversaire : *« 3 objets d'armure en face → prends de la pénétration »*, *« Cuirasse épineuse → anti-soin sur toi »*.
- **Sorts d'invocateur** et **keystones** adverses (qui a Flash/TP/Ignite, Électrocution vs Aftershock…).
- **Tes résistances** (armure/RM/AP/AD/ability haste) et l'état des **tours**.
- **Vision** : alerte si tu es sous la moyenne de ton équipe.
Tout ça est aussi **transmis à l'IA**, qui donne des conseils stratégiques (setups d'objectifs, exécution de la win condition, tempo) ancrés dans les vrais chiffres.

> Limite honnête : l'API live **n'expose pas** la position des minions/ennemis ni les cooldowns adverses — ça reste du manuel-assisté (tracker jungler).

### 🧠 Coach personnalisé (« il te connaît »)

En partie, l'IA reçoit ton **profil de faiblesses récurrentes** (calculé depuis ton historique) et adapte ses rappels : *« tu meurs souvent en milieu de partie, repli maintenant »*.

### 🎮 Riot API : rang/LP & historique réel

Avec une **clé dev Riot** (gratuite, **expire toutes les 24 h**) dans `.env` (`RIOT_API_KEY` + `RIOT_ID="Pseudo#TAG"`), la page **Historique** affiche ton **rang/LP** et peut **charger tes vraies parties** (Match-V5 : KDA, CS/min, vision, durée). Régénère la clé chaque jour sur [developer.riotgames.com](https://developer.riotgames.com/). 🔒 La clé reste **dans ton `.env`** (jamais commitée).

### 🗣️ Voix mains-libres

Le bouton 🎤 du chat : tu **dictes** ta question, elle **part toute seule** à la fin, et la **réponse est lue à voix haute** si la voix est active → boucle quasi mains-libres (utile mort / en alt-tab).

### 🎚️ Sorts d'invoc & runes adaptés (matchup + équipe adverse)

En champ select, sous les picks, un bloc **« Sorts d'invoc & runes »** propose une reco **instantanée (règles, sans attendre l'IA)** calculée pour ton champion probable et adaptée à **trois niveaux** :

- ton **adversaire de lane direct** (assassin/burst → **Barrière** ; CC fiable → **Nettoyage**) ;
- **toute la composition adverse** (beaucoup de CC → Nettoyage/Ténacité ; fort burst → runes de survie ; profil AD → armure, AP → RM) ;
- les **sorts d'invocateur RÉELLEMENT pris par l'équipe adverse** (visibles via le LCU) : *ton adversaire a pris Embrasement → Barrière* ; *il a Fatigue → tes all-ins burst valent moins* ; *il a Nettoyage → ne compte pas sur ton Embrasement pour le kill* ; *plusieurs Embrasement en face → anticipe les all-ins*.

Le **plan de lane IA** (ci-dessous) reçoit les mêmes données et affine encore les runes/sorts.

### 🧭 Détection d'autofill

Si ton **rôle assigné n'est pas dans ta pool** (`data/champion-pool.json`), le coach affiche un **bandeau autofill** et **ajuste tous ses conseils** vers la sûreté : picks simples/défensifs, page de runes polyvalente (survie/sustain plutôt qu'all-in), rappel de jouer farm/freeze et d'éviter les plays risqués tôt. L'info est aussi transmise à l'IA pour son plan de lane.

### 🗺️ Plan de lane & win condition (IA, champ select)

Dès que ton adversaire de lane est connu, Claude génère un **plan spécifique au matchup** : comment jouer la lane (trades, gestion de vague, niveaux clés, recall), la **page de runes** conseillée pour ce duel, les **sorts d'invoc** adaptés, la **win condition** de ta compo, tes **power spikes**, et les **dangers** concrets de l'adversaire. (1 appel par matchup, mis en cache.)

### ⚠️ Alerte « move risqué » (ping ATTENTION)

En jeu, un **bandeau rouge + bip** apparaît en haut du HUD quand la situation devient dangereuse : **infériorité numérique** (plus d'ennemis vivants que d'alliés), **objectif contesté alors que des alliés sont morts**, ou **PV bas avec de l'or non dépensé sur toi**. Le ping ne se déclenche qu'à l'**apparition** d'un nouveau risque (pas à chaque tick).

> ℹ️ L'API live de Riot **n'expose pas les coordonnées** des joueurs : impossible de détecter un « overextend » sur la carte. L'alerte s'appuie donc sur des signaux fiables et réellement disponibles (morts, PV, or, objectif). C'est un garde-fou, pas un radar de position.

### 🎯 Suivi CS/min (objectif 10)

Le HUD affiche en continu tes **CS/minute** avec une **barre de progression vers 10 CS/min** (objectif configurable), le **retard/avance** par rapport à ce rythme, et un code couleur (vert ≥ objectif, jaune, rouge). Le jungle est traité à part (farm différent).

### 🏆 Rang, LP & climb vers Master (HUD)

En haut du HUD in-game, une **carte de rang** montre ton **palier avec son emblème** (Fer → Challenger — image officielle Community Dragon, avec blason SVG coloré en repli), tes **LP**, ton **winrate**, et surtout une **estimation du nombre de games à GAGNER pour atteindre Master** (`RANK_LP_PER_WIN`, ~22 LP/win par défaut). La carte apparaît aussi sur la page **Historique**. Nécessite `RIOT_ID` + `RIOT_API_KEY` dans `.env`.

### 💰 Avance économique & tempo d'équipe

Le tableau de bord affiche une **barre d'avance d'or estimée** (ton équipe vs l'adverse) + une **courbe du différentiel** et ton **avance de lane**. Des callouts apparaissent : *« avantage d'équipe → force les objectifs »* ou *« déficit → joue safe/scaling »*. L'or des autres joueurs n'étant pas exposé par l'API, c'est une **estimation** (valeur des objets + farm + kills).

### 🌳 Tracker de jungler & fenêtre d'engage

Clique **« Jungler vu »** pour suivre sa disparition (alerte si invisible trop longtemps). Et quand **Flash + Ulti** d'un ennemi sont **tous deux down** (selon tes timers), une **fenêtre d'engage** s'affiche : *« X sans Flash ni Ulti — go »*.

### 🔔 Alertes sonores & raccourcis externes (alt-tab)

Un **bip** + une **notification** se déclenchent quand Dragon/Baron/Héraut/Voidgrubs deviennent disponibles, **même en alt-tab** (active la voix une fois pour autoriser son + notifications). Un endpoint **`POST /api/cue`** permet à un script externe de déclencher un timer/bip sans alt-tab. Exemple **AutoHotkey** (Windows) — F1 lance le timer Flash de l'adversaire de mid :

```ahk
F1::
  RunWait, curl -s -X POST http://localhost:3000/api/cue -H "Content-Type: application/json" -d "{""kind"":""flash"",""champ"":""Zed""}", , Hide
return
```

### 🖥️ Overlay transparent (HUD par-dessus le jeu, 1 seul écran)

> ⚠️ **Condition indispensable** : mets League en **mode « Sans bordure / Borderless »** (Options → Vidéo → Mode d'affichage). Une fenêtre always-on-top **ne s'affiche PAS au-dessus du plein écran exclusif** — c'est une limite de Windows, pas un bug. En « Sans bordure », l'overlay apparaît correctement.

Le plus simple : **double-clique `overlay.command` (macOS) / `overlay.bat` (Windows)**. Le lanceur installe Electron au 1er lancement, démarre le serveur si besoin, puis ouvre la **fenêtre transparente flottante**. Raccourcis : `Ctrl+Shift+X` = clic-traversant (la souris passe à travers), `Ctrl+Shift+H` = masquer/afficher. Déplace la fenêtre en glissant un **titre de panneau**.

Alternatives :
- **Source navigateur OBS** (sans rien installer) vers `http://localhost:3000/?overlay=1` — pratique pour le stream.
- Manuel : `npm i -D electron` puis `npm run overlay`.

> Note : `start.command`/`start.bat` lancent seulement le **serveur + navigateur** (pas l'overlay). Pour le HUD par-dessus le jeu, utilise **`overlay.command`/`overlay.bat`**.

### 🎛️ Filtre, export & économie de quota

- **Filtre du flux** : Macro / Micro / Tout (persistant).
- **Export CSV** de l'historique (bouton sur la page Historique).
- Les conseils IA au **contenu identique** sont **dédoublonnés** (45 s) pour préserver le quota.

### 🧯 Anti-tilt & one-trick (historique)

Après **3 défaites d'affilée**, une bannière propose une **pause + checklist de warm-up**. Et depuis tes winrates, le coach te recommande **quel champion spammer** (et lequel éviter) pour grimper.

### ⚡ Latence : pourquoi c'est « vraiment live » maintenant

Le tableau de bord et les picks sont **diffusés immédiatement** à chaque tick ; les appels à l'IA (qui peuvent prendre plusieurs secondes) tournent **en arrière-plan** et n'attendent jamais l'affichage. Avant, l'attente de la réponse IA bloquait l'UI (d'où des retards de 30 s–1 min) — ce n'est plus le cas, en partie **comme en champ select**.

### 📥 Remplir `counters` avec des données réelles (winrate)

Plutôt que de tout saisir à la main, tu peux régénérer le bloc `counters` à
partir de données de matchups **réelles** (winrate) d'un agrégateur en ligne :

```bash
npm run fetch-counters                 # source par défaut : OP.GG
# options utiles :
node scripts/fetch-counters.js --self-test          # test du parsing (hors-ligne)
node scripts/fetch-counters.js --dry-run            # n'écrit rien, aperçu
node scripts/fetch-counters.js --champions Zed,Garen --top 5
node scripts/fetch-counters.js --tier diamond_plus --region kr
```

- Le script résout les champions via Data Dragon, interroge l'API counters
  d'OP.GG par champion et par rôle, classe les counters par **winrate**, et
  **fusionne** le résultat dans `data/counters.json` (une **sauvegarde
  horodatée** est créée avant écriture). Les champs éditoriaux
  (`damageOverride`, `ccHeavy`, `burstThreats`, `rolePicks`) sont **préservés**.
- ⚠️ **À lancer chez toi** : l'API est tierce et **non officielle** (elle peut
  changer entre patchs). Respecte les **CGU** du site (usage personnel/non
  commercial, faible volume — le script limite la cadence à ~1 req/s). Si tu
  préfères une autre source, l'adapter est isolé dans `scripts/fetch-counters.js`.
- Sources comparées : **OP.GG** (CGU les plus clémentes, JSON propre — défaut),
  **U.GG** (CDN très stable), **Lolalytics** (données les plus riches, mais CGU
  les plus restrictives).

---

## 🩺 Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Badge « Client ✗ » | League n’est pas lancé / lockfile introuvable | Lance League ; au besoin, renseigne `LEAGUE_PATH`. |
| Badge « Jeu ✗ » mais en partie | Live Client Data API pas encore prête | Patiente quelques secondes après le chargement de la partie. |
| Portraits de champions absents | Data Dragon injoignable (firewall/hors-ligne) | Vérifie l’accès à `ddragon.leagueoflegends.com` ; le fallback assure le reste. |
| « IA: règles » | Pas de clé Claude / SDK absent | Renseigne `ANTHROPIC_API_KEY` (et `npm install`). |
| Pas de conseils IA | Clé invalide ou quota | Le moteur de règles prend automatiquement le relais. |

---

## 📁 Structure du projet

```
lol-coach/
├── src/
│   ├── server.js          # serveur web + WebSocket
│   ├── coachLoop.js       # orchestrateur (détection de phase, flux de conseils)
│   ├── config.js          # configuration (.env)
│   ├── httpsClient.js     # client HTTPS local (cert auto-signé)
│   ├── lcu/               # accès au client League (champ select, phase)
│   ├── liveclient/        # accès à l'API in-game (:2999)
│   ├── data/ddragon.js    # données statiques Data Dragon + cache + fallback
│   ├── advisor/           # heuristiques, pick/build advisor, profil, Claude
│   └── mock/              # données simulées (mode démo)
├── public/                # interface web (HTML/CSS/JS)
├── data/                  # dataset de counters + fallback champions
└── .env.example
```

---

## ⚖️ Légalité

Cet outil n’utilise que des **API officielles en lecture seule** exposées localement par le client Riot, et **n’automatise aucune action en jeu** (pas de scripting, pas d’injection d’entrées). C’est la même catégorie d’outils que les overlays d’aide au build/au pick. Reste néanmoins responsable de l’usage que tu en fais au regard des conditions d’utilisation de Riot Games.

> Ce projet n’est pas endossé par Riot Games et ne reflète pas les opinions de Riot Games.
