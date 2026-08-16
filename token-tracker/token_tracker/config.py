"""Chargement de la configuration d'abonnement (palier, fenêtre, budgets)."""

from __future__ import annotations

import json
import os
from typing import Any

DEFAULT_CONFIG: dict[str, Any] = {
    "plan": "max_5x",
    "window_hours": 5,
    "auto_calibrate": True,
    "plans": {
        "pro": {"label": "Pro", "window_budget": 10, "weekly_budget": 120},
        "max_5x": {"label": "Max 5x", "window_budget": 50, "weekly_budget": 600},
        "max_20x": {"label": "Max 20x", "window_budget": 200, "weekly_budget": 2400},
    },
}


def load_config(project_root: str | None = None) -> dict[str, Any]:
    """Charge ``config.json`` (s'il existe) en complétant avec les défauts."""
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))  # copie profonde
    if project_root:
        path = os.path.join(project_root, "config.json")
        if os.path.isfile(path):
            try:
                with open(path, encoding="utf-8") as fh:
                    user = json.load(fh)
                for key in ("plan", "window_hours", "auto_calibrate"):
                    if key in user:
                        cfg[key] = user[key]
                if isinstance(user.get("plans"), dict):
                    cfg["plans"].update(user["plans"])
            except (json.JSONDecodeError, OSError):
                pass
    return cfg


def plan_settings(cfg: dict[str, Any]) -> dict[str, Any]:
    """Renvoie les réglages du palier actif (avec valeurs de repli)."""
    plans = cfg.get("plans", {})
    plan = cfg.get("plan", "max_5x")
    settings = plans.get(plan) or plans.get("max_5x") or {
        "label": plan, "window_budget": 50, "weekly_budget": 600,
    }
    return {
        "plan": plan,
        "label": settings.get("label", plan),
        "window_budget": float(settings.get("window_budget", 50)),
        "weekly_budget": float(settings.get("weekly_budget", 600)),
        "window_hours": float(cfg.get("window_hours", 5)),
        "auto_calibrate": bool(cfg.get("auto_calibrate", True)),
    }
