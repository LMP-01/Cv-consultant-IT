# Suivi de tokens Claude

Petite application **Python sans dépendance** qui analyse en direct la
consommation de tokens de tes conversations **Claude Code**, identifie les
**tâches les plus coûteuses** et propose des **conseils d'optimisation**
(reformuler la demande, changer de modèle quand Opus 4.8 n'est pas nécessaire,
mieux exploiter le cache).

## Ce que ça suit (et ce que ça ne peut pas suivre)

Le « temps réel » n'est possible que là où la consommation est mesurable :

| Source | Suivi | Détail |
|---|---|---|
| **Claude Code** (sessions locales) | ✅ | Chaque session est un fichier JSONL dans `~/.claude/projects/…` contenant l'`usage` (tokens in/out, cache) et le modèle. C'est ce que lit l'app. |
| **API Anthropic** (clé perso) | ➕ | Mesurable de la même façon via le champ `usage` renvoyé par l'API (non implémenté ici, mais l'architecture s'y prête). |
| **claude.ai** (web/desktop) | ❌ | **Aucune API publique** n'expose la consommation de tokens des conversations claude.ai. Impossible de les suivre en direct. |

> En clair : l'app couvre tes propres sessions Claude Code. Elle ne peut pas
> lire tes discussions sur l'app web claude.ai — Anthropic ne fournit pas cette
> donnée.

## Utilisation

Aucune installation, aucune dépendance (Python 3.9+ de la lib standard).

```bash
cd token-tracker

# Rapport texte : totaux, top des tâches, conseils
python3 -m token_tracker report

# Dashboard web temps réel (se met à jour pendant que tu travailles)
python3 -m token_tracker serve
# puis ouvrir http://127.0.0.1:8787
```

Le dashboard relit les logs à chaque rafraîchissement (toutes les 4 s) : il
évolue donc en direct au fil de tes conversations.

## Ce que ça affiche

- **Coût total** estimé (USD) et tokens entrée / sortie / cache.
- **Coût par modèle** : voir d'un coup d'œil ce que coûte Opus vs Sonnet vs Haiku.
- **Top des tâches** : chaque tâche = le premier prompt humain qui l'a lancée,
  avec son coût et le(s) modèle(s) utilisé(s).
- **Conseils d'optimisation**, généraux et par tâche coûteuse :
  - *changer de modèle* quand la tâche est simple (classification, résumé,
    reformulation, traduction…) ;
  - *reformuler / cadrer* pour réduire une sortie trop longue ;
  - *mieux exploiter le cache* (sessions plus longues et continues) ;
  - *spécifier la tâche en amont* pour éviter les longues boucles d'agent.

## Comment le coût est calculé

Prix par million de tokens (USD), tarification Anthropic :

| Modèle | Entrée | Sortie |
|---|---|---|
| Fable 5 | 10 | 50 |
| Opus 4.8 / 4.7 / 4.6 | 5 | 25 |
| Sonnet 4.6 | 3 | 15 |
| Haiku 4.5 | 1 | 5 |

Le coût du cache se déduit du prix d'entrée : lecture = 0,10×, écriture 5 min =
1,25×, écriture 1 h = 2×. Les prix évoluent : tu peux les surcharger en créant
un fichier `pricing.json` à la racine du dossier `token-tracker/` :

```json
{ "claude-opus-4-8": { "input": 5.0, "output": 25.0 } }
```

## Architecture

```
token_tracker/
  pricing.py    Tarifs des modèles + calcul du coût d'un appel
  parser.py     Lecture des logs Claude Code, rattachement aux tâches
  aggregate.py  Agrégations (tâche, modèle, projet, session, jour)
  advisor.py    Conseils d'optimisation
  cli.py        Rapport en ligne de commande
  server.py     Dashboard web temps réel (http.server de la lib standard)
```

Une « tâche » correspond à un vrai prompt utilisateur : les résultats d'outils,
messages méta et commandes internes (slash-commands) sont écartés. Toute la
consommation des messages assistant qui suivent est rattachée à cette tâche.

## Pistes d'extension

- Connecteur **API Anthropic** : logger l'`usage` de chaque appel dans le même
  format pour unifier API + Claude Code.
- Conversion **USD → EUR** et budget mensuel avec alerte de seuil.
- Export CSV / persistance (SQLite) pour des tendances sur la durée.
