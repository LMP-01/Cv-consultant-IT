"""Rapport en ligne de commande : totaux, top des tâches et conseils."""

from __future__ import annotations

import os
from typing import Any

from . import advisor, aggregate, parser


def _money(value: float) -> str:
    return f"${value:,.4f}"


def _tokens(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def build_report(roots: list[str] | None = None,
                 project_root: str | None = None, top_n: int = 10) -> str:
    records = parser.parse_logs(roots, project_root)
    summary = aggregate.summarize(records)
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

    add("")
    add(f"  Coût total estimé : {_money(totals['total'])}")
    add(f"  Messages assistant : {totals['messages']:,}".replace(",", " "))
    add(f"  Tokens entrée : {_tokens(totals['input_tokens'])}"
        f"  |  sortie : {_tokens(totals['output_tokens'])}")
    add(f"  Cache lu : {_tokens(totals['cache_read_tokens'])}"
        f"  |  écrit : {_tokens(totals['cache_write_tokens'])}")

    add("")
    add("-" * 70)
    add("  COÛT PAR MODÈLE")
    add("-" * 70)
    for row in summary["by_model"]:
        add(f"  {row['model']:<28} {_money(row['total']):>14}"
            f"   ({row['messages']} msg)")

    add("")
    add("-" * 70)
    add(f"  TOP {top_n} DES TÂCHES LES PLUS COÛTEUSES")
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
