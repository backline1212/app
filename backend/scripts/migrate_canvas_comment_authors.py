"""Mark comments a member made through the dashboard canvas as the team's (TDR-0208).

Run from backend: python -m scripts.migrate_canvas_comment_authors [--apply]

Dry-run by default: it counts the comments it would mark and changes nothing.

The dashboard canvas posts through a member-backed review session, so those comments are
stored as guest-authored. New ones carry `by_team: true`; this backfills older ones so
"New from clients" on the dashboard doesn't list the team's own notes. A comment is
marked only when its review session has a `member_user_id`. Additive: it sets one field.
"""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    try:
        per_workspace: dict[str, int] = {}
        total = 0
        sessions = db.guest_sessions.find(
            {"member_user_id": {"$nin": [None, ""]}}, projection={"workspace_id": 1}
        )
        async for guest_session in sessions:
            query = {
                "workspace_id": guest_session["workspace_id"],
                "author_guest_id": str(guest_session["_id"]),
                "by_team": {"$ne": True},
            }
            count = await db.comments.count_documents(query)
            if not count:
                continue
            total += count
            per_workspace[guest_session["workspace_id"]] = (
                per_workspace.get(guest_session["workspace_id"], 0) + count
            )
            if apply:
                await db.comments.update_many(query, {"$set": {"by_team": True}})
    finally:
        await close_client()
    return {
        "mode": "apply" if apply else "dry-run",
        "marked" if apply else "would_mark": total,
        "per_workspace": per_workspace,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="mark the canvas comments")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(run(apply=args.apply)), indent=2))


if __name__ == "__main__":
    main()
