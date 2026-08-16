"""Tarifs des modèles Claude et calcul du coût d'un appel.

Les prix sont exprimés en USD par million de tokens (MTok).
Source : tarification officielle Anthropic (cf. README pour les détails).
Les prix changent : ils peuvent être surchargés via un fichier ``pricing.json``
placé à la racine du projet (voir ``load_prices``).
"""

from __future__ import annotations

import json
import os
from typing import Any

# Prix par million de tokens : (input, output) en USD.
# Le coût des tokens de cache se déduit du prix d'input :
#   - lecture de cache   : 0.10 x input
#   - écriture cache 5min : 1.25 x input
#   - écriture cache 1h   : 2.00 x input
DEFAULT_PRICES: dict[str, dict[str, float]] = {
    "claude-fable-5": {"input": 10.0, "output": 50.0},
    "claude-mythos-5": {"input": 10.0, "output": 50.0},
    "claude-opus-4-8": {"input": 5.0, "output": 25.0},
    "claude-opus-4-7": {"input": 5.0, "output": 25.0},
    "claude-opus-4-6": {"input": 5.0, "output": 25.0},
    "claude-opus-4-5": {"input": 5.0, "output": 25.0},
    "claude-opus-4-1": {"input": 15.0, "output": 75.0},
    "claude-opus-4-0": {"input": 15.0, "output": 75.0},
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
    "claude-sonnet-4-5": {"input": 3.0, "output": 15.0},
    "claude-sonnet-4-0": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5": {"input": 1.0, "output": 5.0},
    "claude-3-5-haiku": {"input": 0.80, "output": 4.0},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
}

CACHE_READ_MULTIPLIER = 0.10
CACHE_WRITE_5M_MULTIPLIER = 1.25
CACHE_WRITE_1H_MULTIPLIER = 2.0

# Catégorie d'un modèle, utilisée par le conseiller d'optimisation.
MODEL_TIER = {
    "fable": 4,
    "mythos": 4,
    "opus": 3,
    "sonnet": 2,
    "haiku": 1,
}


def tier_of(model: str) -> int:
    """Renvoie le « niveau » d'un modèle (4 = le plus cher, 1 = le moins cher)."""
    m = (model or "").lower()
    for key, value in MODEL_TIER.items():
        if key in m:
            return value
    return 3  # défaut prudent : on suppose un modèle haut de gamme


def load_prices(project_root: str | None = None) -> dict[str, dict[str, float]]:
    """Charge les prix, en fusionnant un éventuel ``pricing.json`` local."""
    prices = {k: dict(v) for k, v in DEFAULT_PRICES.items()}
    if project_root:
        path = os.path.join(project_root, "pricing.json")
        if os.path.isfile(path):
            try:
                with open(path, encoding="utf-8") as fh:
                    override = json.load(fh)
                for model, rates in override.items():
                    prices[model] = {
                        "input": float(rates["input"]),
                        "output": float(rates["output"]),
                    }
            except (json.JSONDecodeError, KeyError, ValueError, OSError):
                # On ignore un fichier de prix invalide plutôt que de planter.
                pass
    return prices


def _resolve_rate(model: str, prices: dict[str, dict[str, float]]) -> dict[str, float]:
    """Trouve le tarif d'un modèle, avec correspondance souple sur le préfixe."""
    if model in prices:
        return prices[model]
    m = (model or "").lower()
    # Correspondance par préfixe (ex. "claude-opus-4-8-20260101").
    for key, rate in prices.items():
        if m.startswith(key) or key in m:
            return rate
    # Modèle inconnu : on retombe sur un tarif Opus par prudence.
    return {"input": 5.0, "output": 25.0}


def compute_cost(usage: dict[str, Any], model: str,
                 prices: dict[str, dict[str, float]]) -> dict[str, float]:
    """Calcule le coût détaillé d'un appel à partir de son objet ``usage``.

    Renvoie un dictionnaire avec le coût de chaque composante et le total,
    le tout en USD.
    """
    rate = _resolve_rate(model, prices)
    in_rate = rate["input"] / 1_000_000
    out_rate = rate["output"] / 1_000_000

    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    cache_read = int(usage.get("cache_read_input_tokens", 0) or 0)

    # Détail de l'écriture de cache (5 min vs 1 h) si disponible.
    creation = usage.get("cache_creation") or {}
    write_5m = int(creation.get("ephemeral_5m_input_tokens", 0) or 0)
    write_1h = int(creation.get("ephemeral_1h_input_tokens", 0) or 0)
    if not creation:
        # Pas de détail : on traite tout comme de l'écriture 5 min.
        write_5m = int(usage.get("cache_creation_input_tokens", 0) or 0)

    cost_input = input_tokens * in_rate
    cost_output = output_tokens * out_rate
    cost_cache_read = cache_read * in_rate * CACHE_READ_MULTIPLIER
    cost_cache_write = (
        write_5m * in_rate * CACHE_WRITE_5M_MULTIPLIER
        + write_1h * in_rate * CACHE_WRITE_1H_MULTIPLIER
    )
    total = cost_input + cost_output + cost_cache_read + cost_cache_write

    return {
        "input": cost_input,
        "output": cost_output,
        "cache_read": cost_cache_read,
        "cache_write": cost_cache_write,
        "total": total,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read,
        "cache_write_tokens": write_5m + write_1h,
    }
