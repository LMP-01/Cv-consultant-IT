"""Agrégations à partir des enregistrements produits par ``parser``."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from . import windows


def _blank() -> dict[str, Any]:
    return {
        "total": 0.0,
        "input": 0.0,
        "output": 0.0,
        "cache_read": 0.0,
        "cache_write": 0.0,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "messages": 0,
    }


_COST_KEYS = ("total", "input", "output", "cache_read", "cache_write")
_TOKEN_KEYS = ("input_tokens", "output_tokens", "cache_read_tokens",
               "cache_write_tokens")


def _add(acc: dict[str, Any], rec: dict[str, Any]) -> None:
    for key in _COST_KEYS:
        acc[key] += rec.get(key, 0.0)
    for key in _TOKEN_KEYS:
        acc[key] += rec.get(key, 0)
    acc["messages"] += 1


def _group_by(records: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = defaultdict(_blank)
    for rec in records:
        _add(groups[rec.get(key) or "inconnu"], rec)
    return groups


def summarize(records: list[dict[str, Any]],
              plan: dict[str, Any] | None = None) -> dict[str, Any]:
    """Construit un résumé complet, prêt à afficher ou à servir en JSON.

    Si ``plan`` (réglages d'abonnement) est fourni, ajoute l'état de la
    fenêtre glissante de 5 h sous la clé ``window_status``.
    """
    totals = _blank()
    for rec in records:
        _add(totals, rec)

    # Par tâche : on conserve le libellé et le(s) modèle(s) utilisé(s).
    by_task: dict[str, dict[str, Any]] = {}
    for rec in records:
        tid = rec["task_id"]
        if tid not in by_task:
            by_task[tid] = _blank()
            by_task[tid]["task_label"] = rec["task_label"]
            by_task[tid]["session_id"] = rec["session_id"]
            by_task[tid]["project"] = rec["project"]
            by_task[tid]["started_at"] = rec.get("task_started_at")
            by_task[tid]["models"] = set()
        _add(by_task[tid], rec)
        by_task[tid]["models"].add(rec["model"])

    tasks = []
    for tid, agg in by_task.items():
        agg = dict(agg)
        agg["task_id"] = tid
        agg["models"] = sorted(agg["models"])
        tasks.append(agg)
    tasks.sort(key=lambda t: t["total"], reverse=True)

    def _listify(groups: dict[str, dict[str, Any]], name: str) -> list[dict[str, Any]]:
        out = []
        for key, agg in groups.items():
            row = dict(agg)
            row[name] = key
            out.append(row)
        out.sort(key=lambda r: r["total"], reverse=True)
        return out

    by_day = _day_groups(records)

    result = {
        "totals": totals,
        "tasks": tasks,
        "by_model": _listify(_group_by(records, "model"), "model"),
        "by_project": _listify(_group_by(records, "project"), "project"),
        "by_session": _listify(_group_by(records, "session_id"), "session_id"),
        "by_day": by_day,
        "record_count": len(records),
    }
    if plan is not None:
        result["window_status"] = windows.window_status(records, plan)
    return result


def _day_groups(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = defaultdict(_blank)
    for rec in records:
        ts = rec.get("timestamp") or ""
        day = ts[:10] if ts else "inconnu"
        _add(groups[day], rec)
    out = []
    for day, agg in groups.items():
        row = dict(agg)
        row["day"] = day
        out.append(row)
    out.sort(key=lambda r: r["day"])
    return out
