"""Regroupement de la consommation par fenêtres glissantes de 5 heures.

Modèle d'Anthropic pour les abonnements (Pro / Max) : ton premier message
ouvre une « session » de 5 h ; toute la consommation des 5 h suivantes compte
dans cette fenêtre ; au-delà, la fenêtre se réinitialise au message suivant.
Il existe aussi un plafond hebdomadaire (fenêtre glissante de 7 jours).

L'unité de consommation utilisée ici est l'**équivalent-$ d'API** déjà calculé
par ``pricing`` : il pondère correctement le modèle, l'entrée/sortie et le
cache, et suit de près la façon dont un quota d'abonnement se vide.
Les budgets par fenêtre sont des **estimations** (cf. ``config.json``) car
Anthropic ne publie pas les plafonds exacts ; l'auto-calibrage complète
l'estimation avec la fenêtre la plus chargée réellement observée.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

_COST_KEYS = ("total", "input", "output", "cache_read", "cache_write")
_TOKEN_KEYS = ("input_tokens", "output_tokens", "cache_read_tokens",
               "cache_write_tokens")


def parse_ts(value: str | None) -> datetime | None:
    """Interprète un timestamp ISO 8601 (avec ou sans ``Z``)."""
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        # Repli : on tronque les fractions de seconde problématiques.
        try:
            dt = datetime.fromisoformat(text[:19] + "+00:00")
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _blank_window(start: datetime) -> dict[str, Any]:
    w = {k: 0.0 for k in _COST_KEYS}
    w.update({k: 0 for k in _TOKEN_KEYS})
    w["messages"] = 0
    w["start"] = start
    w["models"] = {}
    w["tasks"] = {}
    return w


def _accumulate(window: dict[str, Any], rec: dict[str, Any]) -> None:
    for k in _COST_KEYS:
        window[k] += rec.get(k, 0.0)
    for k in _TOKEN_KEYS:
        window[k] += rec.get(k, 0)
    window["messages"] += 1
    model = rec.get("model", "inconnu")
    window["models"][model] = window["models"].get(model, 0.0) + rec.get("total", 0.0)
    label = rec.get("task_label", "")
    window["tasks"][label] = window["tasks"].get(label, 0.0) + rec.get("total", 0.0)


def build_windows(records: list[dict[str, Any]], hours: float = 5.0) -> list[dict[str, Any]]:
    """Découpe les enregistrements en fenêtres glissantes de ``hours`` heures."""
    timed = [(parse_ts(r.get("timestamp")), r) for r in records]
    timed = [(t, r) for t, r in timed if t is not None]
    timed.sort(key=lambda x: x[0])

    windows: list[dict[str, Any]] = []
    span = timedelta(hours=hours)
    current: dict[str, Any] | None = None

    for ts, rec in timed:
        if current is None or ts >= current["start"] + span:
            current = _blank_window(ts)
            windows.append(current)
        _accumulate(current, rec)
        current["end_seen"] = ts

    # Finalisation : on transforme les dicts modèles/tâches en listes triées.
    for w in windows:
        w["reset_at"] = w["start"] + span
        w["top_tasks"] = sorted(
            ({"label": k, "total": v} for k, v in w["tasks"].items()),
            key=lambda x: x["total"], reverse=True,
        )[:5]
        w["top_models"] = sorted(
            ({"model": k, "total": v} for k, v in w["models"].items()),
            key=lambda x: x["total"], reverse=True,
        )
        w["start_iso"] = w["start"].isoformat()
        w["reset_iso"] = w["reset_at"].isoformat()
        for key in ("tasks", "models", "start", "reset_at", "end_seen"):
            w.pop(key, None)

    return windows


def _now() -> datetime:
    return datetime.now(timezone.utc)


def window_status(records: list[dict[str, Any]], plan: dict[str, Any],
                  now: datetime | None = None) -> dict[str, Any]:
    """État de la fenêtre de 5 h en cours + repère de budget auto-calibré."""
    now = now or _now()
    hours = plan["window_hours"]
    windows = build_windows(records, hours)

    estimate = plan["window_budget"]
    # Auto-calibrage : on prend la fenêtre TERMINÉE la plus chargée comme repère.
    active_start = None
    if windows:
        last = windows[-1]
        last_reset = parse_ts(last["reset_iso"])
        if last_reset and now < last_reset:
            active_start = last["start_iso"]
    completed_peak = max(
        (w["total"] for w in windows if w["start_iso"] != active_start),
        default=0.0,
    )
    reference = max(estimate, completed_peak)

    # Fenêtre courante : la dernière, si encore active.
    current: dict[str, Any] | None = None
    if windows:
        last = windows[-1]
        reset_at = parse_ts(last["reset_iso"])
        if reset_at and now < reset_at:
            remaining = (reset_at - now).total_seconds()
            consumed = last["total"]
            current = {
                "consumed": consumed,
                "reference": reference,
                "pct": consumed / reference if reference else 0.0,
                "reset_in_seconds": max(0.0, remaining),
                "reset_iso": last["reset_iso"],
                "messages": last["messages"],
                "top_tasks": last["top_tasks"],
                "top_models": last["top_models"],
                "input_tokens": last["input_tokens"],
                "output_tokens": last["output_tokens"],
            }

    # Plafond hebdomadaire : consommation glissante sur 7 jours.
    week_ago = now - timedelta(days=7)
    weekly_consumed = sum(
        r.get("total", 0.0) for r in records
        if (t := parse_ts(r.get("timestamp"))) and t >= week_ago
    )

    return {
        "plan_label": plan["label"],
        "window_hours": hours,
        "estimate": estimate,
        "reference": reference,
        "completed_peak": completed_peak,
        "auto_calibrated": plan["auto_calibrate"] and completed_peak > estimate,
        "current": current,
        "weekly": {
            "consumed": weekly_consumed,
            "budget": plan["weekly_budget"],
            "pct": weekly_consumed / plan["weekly_budget"]
            if plan["weekly_budget"] else 0.0,
        },
        "windows": windows,
    }
