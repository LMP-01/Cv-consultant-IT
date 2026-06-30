# 🐉 LoL Coach IA — coaching League of Legends en temps réel

Un agent qui **surveille tes parties de League of Legends en direct** et te donne, dans une **appli web locale (HTML + Node.js)** :

- 💬 des **conseils de jeu en temps réel** (macro, objectifs, timings, recall, survie…) pendant la partie, à cadence régulière **et immédiatement sur les moments clés** (mort, chute de PV brutale, kill/objectif) ;
- 🧩 des **suggestions de pick et de build** adaptées à **toute la composition adverse ET à ta propre équipe** (synergie de duo, équilibre des dégâts, **probabilité de win estimée**) pendant le **champ select** ;
- 📊 un **tableau de bord** live (timers d’objectifs, scoreboard, tes stats) + un **build conseillé en jeu** (3 prochains achats avec mini-items, build complet évolutif, runes vs la compo) ;
- ⏲️ des **timers Flash/ultimes** des ennemis et des **alertes de fenêtre de force** (tempo vs ton adversaire de lane) ;
- 🗨️ un **chat** pour poser une question à Claude pendant la partie (mort, alt-tab) ;
- 📈 un **historique** de tes parties avec **critique IA** par game + une **analyse de tes faiblesses récurrentes** sur l’ensemble de tes parties.

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
