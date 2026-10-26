"""Purge workspaces closed by their only member's account deletion (TDR-0214).

Run from backend: python -m scripts.purge_closed_workspaces [--apply]

Dry-run by default: lists closed workspaces whose 30-day grace period has passed, with
their project counts, and changes nothing. The worker runs the same purge daily
(app/modules/workspaces/purge.py); --apply runs it now. Review the dry run first.
"""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db
from app.modules.workspaces.purge import purge_due_workspaces


async def run(*, apply: bool) -> dict[str, Any]:
    try:
        report = await purge_due_workspaces(get_db(), apply=apply)
    finally:
        await close_client()
    return {"mode": "apply" if apply else "dry-run", "workspaces": report}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="purge the listed workspaces")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(run(apply=args.apply)), indent=2, default=str))


if __name__ == "__main__":
    main()
