# Waza — second cerveau martial

Un **graphe de connaissances** pour construire et faire évoluer un style de combat
personnel. Pas un carnet d'entraînement : chaque technique, combinaison, contre,
tactique, situation, sparring, hypothèse et principe est une fiche, et les fiches
sont reliées entre elles. Saisir un sparring enrichit automatiquement toutes les
fiches qu'il mentionne.

Application web installable (PWA), utilisable **hors-ligne**, sur téléphone comme
sur ordinateur. Implémente le cahier des charges *Système de Gestion des
Connaissances Martial*.

---

## Démarrer

```bash
npm install
npm run dev
```

Ouvre l'URL affichée. La base est créée et pré-remplie au premier lancement avec
les exemples du cahier des charges (K001 Jab, K003 Mae Geri, K007 O Soto Gari…).

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Sert le build de production |
| `npm test` | Tests unitaires (91) |
| `npm run e2e` | Parcours navigateur (16, desktop + mobile) |
| `npm run check` | Typage de l'app |
| `npm run server` | Serveur local (app + synchro) sur :8787 — nécessite Deno |

**Installer sur téléphone** : ouvrir le site, puis « Ajouter à l'écran d'accueil ».
Après le premier chargement, tout fonctionne sans réseau.

---

## Ce que fait l'application

### Les 15 modules (§4)

| | Module | Préfixe |
|---|---|---|
| **Bibliothèque de combat** | Techniques · Combinaisons · Contres · Biomécanique | `K` `A` `C` `B` |
| **Stratégie** | Tactiques · Situations · Lecture adverse · Principes | `T` `S` `L` `PR` |
| **Journal** | Sparrings · Combats officiels · Hypothèses · Erreurs | `R` `F` `H` `ER` |
| **Progression** | Objectifs · Exercices | `O` `E` |
| **Ressources** | Bibliothèque | `AR` `BK` `V` `ST` `PD` `JV` |

### Le graphe

Vue force-directed interactive : pan, zoom, pincement sur mobile, filtrage par
section, et mode voisinage à 1–3 sauts autour d'une fiche.

### Recherche

- **Plein texte** avec repli des accents — « desequilibre » trouve « déséquilibre ».
- **Par identifiant** — taper `K003` ouvre directement la fiche.
- **Multicritères** — modules, discipline, distance, garde, tags.
- **Langage naturel** (avec une clé IA) — voir plus bas.

### Analytics

Armes principales, techniques oubliées, taux de réussite des combinaisons et des
contres, situations récurrentes, fréquence des erreurs, temps par discipline,
répartition par garde et par distance.

---

## Trois décisions de conception

**1. La bidirectionnalité est structurelle, pas une règle.**
Une relation est stockée **une seule fois**, en ordre canonique, et toute lecture
demande `from_id = ? OR to_id = ?`. Il n'existe aucune façon d'écrire un lien qui
n'existerait que dans un sens. Le §2.3 n'est pas une consigne à respecter : c'est
une propriété du stockage.

**2. L'« Historique » n'est pas un champ.**
L'historique d'une technique, ce sont les sparrings et combats qui la
mentionnent — le graphe le sait déjà. Il est dérivé à l'affichage plutôt que
ressaisi à la main.

**3. Le modèle traduit, SQL exécute.**
Une question en langage naturel n'est jamais envoyée à la base. Le modèle la
convertit en un **filtre JSON**, ce filtre est validé champ par champ, puis
exécuté en SQL. Un module inventé, un champ inexistant ou un identifiant
halluciné sont écartés avant la requête : le filtre devient plus large, jamais
faux. L'interface affiche le filtre réellement appliqué.

> Corollaire : **aucun chiffre n'est produit par un modèle.** Taux de réussite,
> techniques oubliées, fréquence des erreurs, volume d'entraînement — tout est
> calculé en SQL. Un modèle donnerait un nombre vraisemblable ; on veut un
> nombre juste.

---

## Intelligence artificielle — optionnelle, BYOK

Sans clé, **tout fonctionne** : fiches, relations, graphe, recherche plein texte,
filtres, analytics. Une clé ajoute : recherche en langage naturel, résumé de
séance, suggestions de liens, plans d'entraînement.

Trois fournisseurs à palier gratuit, configurés dans **Réglages** :

| Fournisseur | Obtenir une clé |
|---|---|
| Google Gemini | <https://aistudio.google.com/apikey> |
| Groq | <https://console.groq.com/keys> |
| Mistral | <https://console.mistral.ai/api-keys> |

- Les clés restent dans le `localStorage` de l'appareil et ne partent que vers le
  fournisseur choisi. Aucun compte, aucun stockage serveur.
- **Pas de liste de modèles en dur** : l'app interroge chaque fournisseur et
  propose ce à quoi ta clé donne réellement droit.
- **Chaîne de repli** : sur quota atteint (429), Waza passe au fournisseur
  suivant dans l'ordre que tu as défini, et le dit dans l'interface.
- Les suggestions de liens ne sont **jamais appliquées automatiquement** : elles
  arrivent sous forme de boutons.

### Tester tes clés

Réglages → Intelligence artificielle → coller une clé → **Vérifier la clé et
lister les modèles**. Si la liste apparaît, le fournisseur est prêt. Puis :
Recherche → poser une question en français ; le filtre obtenu s'affiche
au-dessus des résultats.

> **Non vérifié de mon côté** : les adaptateurs sont testés contre des réponses
> simulées aux formats réels de chaque API (`tests/ai.test.ts`), mais aucune clé
> réelle n'a été utilisée. La validation contre les APIs en production reste à
> faire.

---

## Synchronisation entre appareils — optionnelle

Sans serveur, l'export `.sqlite3` (Réglages → Sauvegarde) suffit à transporter le
graphe d'un appareil à l'autre. Avec un déploiement, les appareils convergent
**automatiquement** : à l'ouverture, au retour sur l'app, au retour du réseau,
après chaque enregistrement, et toutes les cinq minutes. Aucun bouton à presser.

> Limite honnête : une PWA ne peut pas se synchroniser **en arrière-plan**.
> L'API existe mais n'est pas supportée sur iOS, donc rien ne se passe tant que
> l'application est fermée. Ce n'est pas une limite de Waza, c'est le navigateur.

### Un seul déploiement pour tout

`server/` sert **l'application et l'API de synchronisation** depuis la même
origine. Une seule URL gratuite `*.deno.dev`, pas de domaine à acheter, pas de
second fournisseur, et le champ « adresse du serveur » reste vide côté client.

```bash
npm run build                      # produit dist/
deno install -gArf jsr:@deno/deployctl
deployctl deploy --project=<ton-projet> \
  --include=dist,server,deno.json --entrypoint=server/main.ts
```

Puis, dans le tableau de bord Deno Deploy, définis la variable d'environnement
`SYNC_SECRET` (une phrase que toi seul connais). Sur chaque appareil : Réglages
→ Synchronisation → coller la phrase. Elle est échangée une fois contre un jeton
signé ; la phrase elle-même n'est pas conservée.

Pour essayer en local d'abord :

```bash
npm run build
SYNC_SECRET="ce-que-tu-veux" npm run server   # http://localhost:8787
```

### Comment les conflits sont tranchés

Dernière écriture gagnante par enregistrement, avec un numéro de séquence
serveur. Pas de CRDT : le graphe a un seul auteur, le conflit réaliste est
« modifié sur le téléphone au dojo, puis sur le portable le soir ».

- Une suppression concourt comme n'importe quelle modification : éditer une fiche
  **après** l'avoir supprimée ailleurs la ressuscite. Perdre le travail le plus
  récent serait le pire résultat possible.
- Deux appareils hors-ligne peuvent créer `K042` chacun. Les deux fiches
  survivent — l'identité est un uuid, pas le code — et le doublon est
  renuméroté de façon déterministe à la fusion.
- Les relations ont un identifiant **dérivé de leurs extrémités**, donc deux
  appareils qui créent le même lien produisent la même ligne : rien à réconcilier.
- Hors-ligne, les modifications s'empilent et repartent à la reconnexion. Une
  synchronisation interrompue reprend à son curseur.

`tests/sync.test.ts` fait converger deux bases réelles sur chacun de ces cas, et
le round-trip a été rejoué dans deux navigateurs contre le vrai serveur.

### Les fiches d'exemple, si tu appaires un second appareil

Chaque appareil sème son propre jeu d'exemples avant d'avoir rencontré les
autres, donc appairer un second appareil fusionne deux jeux. Réglages →
**Supprimer les fiches d'exemple** les retire d'un coup, sur tous les appareils.

## Limites assumées

- **Les médias ne synchronisent pas.** Le graphe — texte, relations, historique,
  statistiques — synchronise intégralement. Les photos et vidéos restent locales
  à l'appareil : les vidéos de sparring pèsent lourd et les faire transiter
  demande du stockage d'objets, des URLs signées et une gestion de quota.
  C'est un chantier propre, pas un bout de celui-ci.
- **L'analyse automatisée de flux vidéo (§5.2) n'est pas implémentée.** Extraction
  de frames, coût, latence : c'est un projet en soi. Les vidéos sont stockées et
  lisibles, pas analysées.
- **Le stockage local passe par IndexedDB**, pas OPFS. Les deux VFS OPFS de SQLite
  exigent `FileSystemFileHandle.createSyncAccessHandle()`, qui n'existe **que**
  dans un Worker. Déplacer SQLite dans un Worker rendrait toutes les lectures
  asynchrones — et c'est leur caractère synchrone qui permet à l'interface de
  n'avoir aucun état de chargement. À l'échelle d'un carnet personnel (quelques
  Mo), réécrire l'image à chaque enregistrement coûte quelques millisecondes.

---

## Architecture

```
martial-brain/
  src/
    domain/schema.ts     Les 15 descripteurs — la pièce maîtresse
    domain/links.ts      Relations bidirectionnelles, identifiants dérivés
    domain/ids.ts        Codes K001/PR003, désambiguïsation E/ER, A/AR…
    db/                  SQLite WASM, migrations, CRUD générique, analytics
    sync/                Fusion LWW (pure, testable), curseur, transport, auto-sync
    ai/                  Adaptateurs fournisseurs, routeur, filtre validé
    ui/                  Liste / fiche / formulaire génériques, graphe, écrans
  server/                Serveur Deno : sert l'app + l'API de synchro (Deno KV)
  tests/                 89 tests unitaires
  e2e/                   16 parcours navigateur
```

**Le moteur générique.** Les 15 modules partagent la même forme : des champs, des
relations, des médias. Un descripteur par module dans `domain/schema.ts`, et
`EntityList` / `EntityDetail` / `EntityForm` se rendent seuls à partir de lui.
Ajouter un module futur du §6 — préparation physique, nutrition, blessures — est
un descripteur, pas des écrans.

**Le stockage est un graphe de propriétés.** Deux tables : `entities` et `links`.
Les champs typés vivent en JSON et restent requêtables via `json_extract()`, ce
dont les analytics se servent.

**La palette est calculée, pas choisie.** Un graphe est une forme « all-pairs » :
n'importe quels deux nœuds peuvent se toucher. Le validateur de palette a été
exécuté sur toutes les combinaisons de 5, 4 et 3 teintes dans les deux thèmes :
**aucun quintuplet ne passe** (magenta↔orange tombe à ΔE 12.9, sous le plancher
de 15), **deux quadruplets passent**. D'où : couleur par **section** (4 teintes +
un neutre pour les ressources), **forme** distincte par section, et le **code**
en étiquette sur chaque nœud. L'identité est encodée trois fois — c'est ce qui
rend la palette accessible, pas une décoration.

---

## Correctifs apportés au cahier des charges

Sans changer le fond : `agnostic` → agnostique · `Erreurs frecuentes` →
fréquentes · `Decisions arbitrales` → Décisions · `Graph de connaissances` →
Graphe. Les `\downarrow` des exemples `A001` et `C001` sont des artefacts de
copier-coller, lus comme des flèches `→`. L'arborescence du §3, absente du
document, a été définie : cinq sections, reprises dans la navigation.
