"""Lecture et interprétation des logs de session Claude Code.

Claude Code écrit chaque session sous forme d'un fichier JSONL :
    ~/.claude/projects/<projet-encodé>/<session-id>.jsonl

Chaque ligne est un objet JSON. Les messages de l'assistant contiennent
``message.usage`` (tokens in/out, cache) et ``message.model``. Ce module :

  1. découvre les fichiers de logs,
  2. les parcourt dans l'ordre,
  3. associe chaque consommation de tokens à la « tâche » courante,
     c'est-à-dire au dernier vrai prompt tapé par l'utilisateur.

Le résultat est une liste plate d'« enregistrements » (un par message
assistant), facile à agréger et sérialisable en JSON.
"""

from __future__ import annotations

import json
import os
from typing import Any, Iterator

from . import pricing

DEFAULT_LOG_ROOTS = [
    os.path.expanduser("~/.claude/projects"),
    os.path.expanduser("~/.config/claude/projects"),
]

# Balises de commandes internes (slash-commands, hooks…) : ce ne sont pas
# de vrais prompts utilisateur, on ne démarre pas de tâche dessus.
_COMMAND_PREFIXES = ("<command-name>", "<command-message>", "<local-command",
                     "<bash-", "caveat:", "<user-")


def find_log_files(roots: list[str] | None = None) -> list[str]:
    """Renvoie tous les fichiers ``.jsonl`` de logs Claude Code trouvés."""
    roots = roots or DEFAULT_LOG_ROOTS
    files: list[str] = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for name in filenames:
                if name.endswith(".jsonl"):
                    files.append(os.path.join(dirpath, name))
    return sorted(files)


def _iter_lines(path: str) -> Iterator[dict[str, Any]]:
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except OSError:
        return


def _user_prompt_text(event: dict[str, Any]) -> str | None:
    """Renvoie le texte d'un vrai prompt utilisateur, ou ``None``.

    On écarte les résultats d'outils, les messages méta et les commandes
    internes, qui ne correspondent pas à une demande humaine.
    """
    if event.get("type") != "user" or event.get("isMeta"):
        return None
    message = event.get("message") or {}
    content = message.get("content")

    text: str | None = None
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        # Un message qui contient un tool_result n'est pas un prompt humain.
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                return None
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                break

    if not text or not text.strip():
        return None
    lowered = text.lstrip().lower()
    if lowered.startswith(_COMMAND_PREFIXES):
        return None
    return text.strip()


def _label(text: str, max_len: int = 90) -> str:
    """Transforme un prompt en libellé court et lisible pour une tâche."""
    flat = " ".join(text.split())
    return flat[:max_len] + ("…" if len(flat) > max_len else "")


def parse_logs(roots: list[str] | None = None,
               project_root: str | None = None) -> list[dict[str, Any]]:
    """Parcourt tous les logs et renvoie la liste des enregistrements.

    Un enregistrement = un message assistant, enrichi de son coût et rattaché
    à la tâche (prompt utilisateur) qui l'a déclenché.
    """
    prices = pricing.load_prices(project_root)
    files = find_log_files(roots)
    records: list[dict[str, Any]] = []

    for path in files:
        session_id = os.path.splitext(os.path.basename(path))[0]
        task_index = 0
        task_label = "(début de session)"
        task_started_at: str | None = None

        for event in _iter_lines(path):
            prompt = _user_prompt_text(event)
            if prompt is not None:
                task_index += 1
                task_label = _label(prompt)
                task_started_at = event.get("timestamp")
                continue

            if event.get("type") != "assistant":
                continue
            message = event.get("message") or {}
            usage = message.get("usage")
            if not usage:
                continue

            model = message.get("model") or "inconnu"
            cost = pricing.compute_cost(usage, model, prices)
            cwd = event.get("cwd") or ""
            project = os.path.basename(cwd) if cwd else session_id

            records.append({
                "session_id": session_id,
                "project": project,
                "timestamp": event.get("timestamp"),
                "model": model,
                "task_index": task_index,
                "task_id": f"{session_id}#{task_index}",
                "task_label": task_label,
                "task_started_at": task_started_at,
                **cost,
            })

    return records
