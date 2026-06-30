"""Rapport en ligne de commande : totaux, top des tâches et conseils."""

from __future__ import annotations

import os
from typing import Any

from . import advisor, aggregate, config, parser


def _money(value: float) -> str:
    return f"${value:,.4f}"


def _tokens(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def _gauge(pct: float, width: int = 20) -> str:
    filled = min(width, int(round(pct * width)))
    return "[" + "█" * filled + "·" * (width - filled) + "]"


def _fmt_duration(seconds: float) -> str:
    seconds = int(max(0, seconds))
    h, m = seconds // 3600, (seconds % 3600) // 60
    return f"{h} h {m:02d} min" if h else f"{m} min"


def build_report(roots: list[str] | None = None,
                 project_root: str | None = None, top_n: int = 10) -> str:
    cfg = config.load_config(project_root)
    plan = config.plan_settings(cfg)
    records = parser.parse_logs(roots, project_root)
    summary = aggregate.summarize(records, plan=plan)
    advice = advisor.global_advice(summary, top_n=top_n)
    totals = summary["totals"]

    lines: list[str] = []
    add = lines.append

    add("=" * 70)
    add("  SUIVI DE CONSOMMATION DE TOKENS CLAUDE")
    add("=" * 70)
    if not records:
        add("")
        add("  Aucun log Claude Code trouvé.")
        add("  Cherché dans : " + ", ".join(parser.DEFAULT_LOG_ROOTS))
        return "\n".join(lines)

    status = summary.get("window_status") or {}
    current = status.get("current")
    add("")
    add(f"  Abonnement : {plan['label']}  ·  fenêtre glissante de "
        f"{int(plan['window_hours'])} h")
    if current:
        bar = _gauge(current["pct"])
        cal = " (auto-calibré)" if status.get("auto_calibrated") else ""
        add("")
        add(f"  FENÊTRE DE 5 H EN COURS  {bar}  {current['pct'] * 100:.0f}%")
        add(f"    Consommé : {_money(current['consumed'])} éq. API"
            f"  /  repère ~{_money(current['reference'])}{cal}")
        add(f"    Réinitialisation dans {_fmt_duration(current['reset_in_seconds'])}"
            f"  ·  {current['messages']} messages")
    weekly = status.get("weekly") or {}
    if weekly:
        add(f"  Sur 7 jours glissants : {_money(weekly['consumed'])}"
            f" / ~{_money(weekly['budget'])} ({weekly.get('pct', 0) * 100:.0f}%)")

    add("")
    add(f"  Consommation totale (éq. $ API) : {_money(totals['total'])}")
    add(f"  Messages assistant : {totals['messages']:,}".replace(",", " "))
    add(f"  Tokens entrée : {_tokens(totals['input_tokens'])}"
        f"  |  sortie : {_tokens(totals['output_tokens'])}")
    add(f"  Cache lu : {_tokens(totals['cache_read_tokens'])}"
        f"  |  écrit : {_tokens(totals['cache_write_tokens'])}")

    add("")
    add("-" * 70)
    add("  CONSOMMATION PAR MODÈLE")
    add("-" * 70)
    for row in summary["by_model"]:
        add(f"  {row['model']:<28} {_money(row['total']):>14}"
            f"   ({row['messages']} msg)")

    add("")
    add("-" * 70)
    add(f"  TOP {top_n} DES TÂCHES QUI CONSOMMENT LE PLUS DE QUOTA")
    add("-" * 70)
    for i, task in enumerate(summary["tasks"][:top_n], 1):
        models = ", ".join(task["models"])
        add(f"  {i:>2}. {_money(task['total']):>12}  [{models}]")
        add(f"      {task['task_label']}")

    add("")
    add("-" * 70)
    add("  CONSEILS D'OPTIMISATION")
    add("-" * 70)
    for tip in advice["general"]:
        add(f"  • {tip['titre']}")
        add(f"    {tip['detail']}")
    if advice["per_task"]:
        add("")
        add("  Par tâche coûteuse :")
        for item in advice["per_task"]:
            add("")
            add(f"  ▸ {item['task_label']}  ({_money(item['total'])})")
            for tip in item["tips"]:
                gain = tip.get("gain_estime", 0.0)
                suffix = f"  → ~{_money(gain)} économisables" if gain > 0 else ""
                add(f"      - {tip['titre']}{suffix}")
                add(f"        {tip['detail']}")
    if not advice["general"] and not advice["per_task"]:
        add("  Rien à signaler : ta consommation paraît déjà bien optimisée.")

    add("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(build_report(project_root=project_root))
    return 0
