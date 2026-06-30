---
description: Consommation de tokens Claude (fenêtres de 5 h) à partir des logs locaux
allowed-tools: Bash(python3 -m token_tracker report:*), Bash(cd:*)
---

Lance le rapport de consommation de tokens (il lit automatiquement les logs
Claude Code dans `~/.claude/projects`, sans aucun glisser-déposer) et affiche
la sortie **telle quelle**, sans la reformuler ni la commenter.

Exécute, depuis la racine du dépôt :

!`cd token-tracker && python3 -m token_tracker report`
