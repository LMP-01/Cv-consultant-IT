"""Point d'entrée : ``python -m token_tracker [report|serve]``."""

from __future__ import annotations

import argparse
import sys

from . import cli, server


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    p = argparse.ArgumentParser(
        prog="token_tracker",
        description="Suivi de la consommation de tokens des conversations Claude.",
    )
    sub = p.add_subparsers(dest="command")

    sub.add_parser("report", help="Affiche un rapport texte (défaut).")

    serve_p = sub.add_parser("serve", help="Lance le dashboard web temps réel.")
    serve_p.add_argument("--host", default="127.0.0.1")
    serve_p.add_argument("--port", type=int, default=8787)

    args = p.parse_args(argv)

    if args.command == "serve":
        server.serve(args.host, args.port)
        return 0
    # report par défaut
    return cli.main()


if __name__ == "__main__":
    raise SystemExit(main())
