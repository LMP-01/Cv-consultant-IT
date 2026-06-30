"""Conseils d'optimisation des coûts en tokens.

Le conseiller analyse les tâches les plus coûteuses et propose des pistes
concrètes : reformuler la demande, changer de modèle (inutile d'utiliser
Opus 4.8 pour une tâche simple), mieux exploiter le cache, etc.

Les règles sont volontairement heuristiques et explicites : chaque conseil
indique *pourquoi* il s'applique et une estimation de l'économie possible.
"""

from __future__ import annotations

from typing import Any

from .pricing import tier_of

# Mots-clés suggérant une tâche « simple » qui ne justifie pas un modèle haut
# de gamme (classification, reformulation, extraction, traduction…).
_SIMPLE_HINTS = (
    "classe", "classifie", "catégorise", "trie", "résume", "resume",
    "reformule", "réécris", "reecris", "traduis", "traduit", "corrige",
    "renomme", "extrait", "extrais", "liste", "formate", "convertis",
    "orthographe", "synonyme", "titre", "tag", "étiquette", "lint",
)

# Mots-clés suggérant une tâche complexe (on ne recommandera pas de baisser
# de modèle dans ce cas).
_COMPLEX_HINTS = (
    "architecture", "refactor", "débogue", "debug", "conçois", "concois",
    "implémente", "implemente", "migration", "optimise", "raisonne",
    "démontre", "demontre", "analyse en profondeur", "stratégie",
)

# Tarifs indicatifs (USD / MTok output) pour estimer le gain d'un changement
# de modèle. Sert uniquement aux estimations affichées.
_OUTPUT_RATE = {4: 50.0, 3: 25.0, 2: 15.0, 1: 5.0}
_TIER_NAME = {4: "Fable 5", 3: "Opus 4.8", 2: "Sonnet 4.6", 1: "Haiku 4.5"}


def _looks_simple(label: str) -> bool:
    low = label.lower()
    if any(h in low for h in _COMPLEX_HINTS):
        return False
    return any(h in low for h in _SIMPLE_HINTS)


def _looks_complex(label: str) -> bool:
    low = label.lower()
    return any(h in low for h in _COMPLEX_HINTS)


def _suggest_cheaper(model: str, label: str) -> int | None:
    """Renvoie le niveau de modèle conseillé, ou ``None`` si pas de changement."""
    current = tier_of(model)
    if current <= 1:
        return None  # déjà Haiku, rien de moins cher
    if _looks_simple(label):
        return 1  # tâche simple → Haiku
    if not _looks_complex(label) and current >= 3:
        return 2  # tâche non complexe sur Opus/Fable → Sonnet
    return None


def advise_task(task: dict[str, Any]) -> list[dict[str, Any]]:
    """Conseils pour une tâche donnée. Liste de dicts {titre, détail, gain}."""
    tips: list[dict[str, Any]] = []
    label = task.get("task_label", "")
    models = task.get("models", [])
    main_model = models[0] if models else "inconnu"
    total = task.get("total", 0.0)

    # 1) Changement de modèle.
    target = _suggest_cheaper(main_model, label)
    if target is not None:
        cur_tier = tier_of(main_model)
        # Estimation grossière : on rapporte le coût output au tarif cible.
        ratio = _OUTPUT_RATE[target] / _OUTPUT_RATE.get(cur_tier, 25.0)
        est_saving = total * (1 - ratio)
        tips.append({
            "type": "modele",
            "titre": f"Passer à {_TIER_NAME[target]} pour cette tâche",
            "detail": (
                f"Tâche apparemment simple traitée avec un modèle haut de gamme "
                f"({main_model}). Un modèle plus léger suffit probablement."
            ),
            "gain_estime": max(est_saving, 0.0),
        })

    # 2) Cache mal exploité : beaucoup d'écriture, peu de relecture.
    write = task.get("cache_write_tokens", 0)
    read = task.get("cache_read_tokens", 0)
    if write > 50_000 and read < write * 0.5:
        tips.append({
            "type": "cache",
            "titre": "Réutiliser le contexte (cache peu exploité)",
            "detail": (
                "Beaucoup de tokens écrits en cache mais peu relus : enchaîne "
                "les questions dans la même session plutôt que d'en rouvrir une, "
                "et garde un contexte stable en tête de prompt."
            ),
            "gain_estime": 0.0,
        })

    # 3) Prompt très verbeux en sortie : reformuler / cadrer.
    out_tokens = task.get("output_tokens", 0)
    if out_tokens > 20_000:
        tips.append({
            "type": "reformulation",
            "titre": "Cadrer la demande pour réduire la sortie",
            "detail": (
                "Réponse très longue. Reformule en précisant le format attendu "
                "(« en 5 puces », « code seul, sans explication », « max 200 mots ») "
                "et découpe les grosses tâches en étapes ciblées."
            ),
            "gain_estime": 0.0,
        })

    # 4) Beaucoup de messages = boucle agent longue.
    if task.get("messages", 0) > 30:
        tips.append({
            "type": "reformulation",
            "titre": "Spécifier la tâche en amont (boucle longue)",
            "detail": (
                "Nombreux allers-retours sur cette tâche. Donne tout le contexte "
                "et les contraintes dès le premier message : ça réduit les tours "
                "de boucle et donc les tokens."
            ),
            "gain_estime": 0.0,
        })

    return tips


def global_advice(summary: dict[str, Any], top_n: int = 10) -> dict[str, Any]:
    """Construit l'ensemble des conseils : globaux + par tâche coûteuse."""
    tasks = summary.get("tasks", [])
    totals = summary.get("totals", {})
    by_model = summary.get("by_model", [])

    general: list[dict[str, Any]] = []

    # Part des coûts dûe aux modèles haut de gamme.
    high_tier_cost = sum(m["total"] for m in by_model if tier_of(m["model"]) >= 3)
    grand_total = totals.get("total", 0.0) or 1e-9
    if high_tier_cost / grand_total > 0.7:
        general.append({
            "titre": "Les modèles haut de gamme dominent ta facture",
            "detail": (
                f"{high_tier_cost / grand_total * 100:.0f}% du coût vient de modèles "
                "Opus/Fable. Réserve-les aux tâches vraiment complexes (architecture, "
                "debug difficile, raisonnement long) et bascule le reste sur Sonnet/Haiku."
            ),
        })

    # Cache global.
    cache_write = totals.get("cache_write", 0.0)
    cache_read = totals.get("cache_read", 0.0)
    if cache_write > cache_read * 1.5 and cache_write > 0:
        general.append({
            "titre": "Tu paies plus d'écriture de cache que de relecture",
            "detail": (
                "Travaille par sessions plus longues et continues : le cache se "
                "rentabilise au-delà de 2-3 requêtes partageant le même contexte."
            ),
        })

    # Concentration : peu de tâches = gros du coût ?
    if tasks:
        top_cost = sum(t["total"] for t in tasks[:max(1, len(tasks) // 5)])
        if top_cost / grand_total > 0.6:
            general.append({
                "titre": "Quelques tâches concentrent la majorité du coût",
                "detail": (
                    "Concentre tes efforts d'optimisation sur le top des tâches "
                    "ci-dessous : c'est là que se trouvent les économies."
                ),
            })

    per_task = []
    for task in tasks[:top_n]:
        tips = advise_task(task)
        if tips:
            per_task.append({
                "task_id": task["task_id"],
                "task_label": task["task_label"],
                "total": task["total"],
                "models": task.get("models", []),
                "tips": tips,
            })

    return {"general": general, "per_task": per_task}
