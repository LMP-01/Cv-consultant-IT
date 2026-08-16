"""Suivi de consommation de tokens des conversations Claude (Claude Code).

Modules :
  - pricing   : tarifs des modèles et calcul du coût d'un appel
  - parser    : lecture des logs Claude Code et rattachement aux tâches
  - aggregate : agrégations (par tâche, modèle, projet, session, jour)
  - advisor   : conseils d'optimisation (reformulation, changement de modèle)
  - cli       : rapport en ligne de commande
  - server    : dashboard web temps réel
"""

__version__ = "0.1.0"
