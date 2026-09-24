"""Backfill human-readable ticket numbers (#1, #2, ...) on existing comments.

Run from backend: python -m scripts.migrate_ticket_numbers [--apply] [--workspace ID]

Dry-run by default: it reports exactly what it would write and changes nothing.

Numbering is per workspace and follows creation order, so the oldest ticket in a
workspace becomes #1. Only top-level records are numbered - a reply belongs to its
thread's number - and anything already numbered is left exactly as it is, so the
script is safe to re-run. Each workspace's counter document is then set to the highest
number handed out, which is what new tickets increment from
(CommentRepository.next_ticket_number).
"""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db
from app.core.indexes import TICKET_NUMBER_INDEXES, ensure_additive_indexes


async def backfill(*, apply: bool, workspace_id: str | None) -> dict[str, Any]:
    db = get_db()
    query: dict[str, Any] = {"parent_id": None}
    if workspace_id is not None:
        query["workspace_id"] = workspace_id

    per_workspace: dict[str, dict[str, Any]] = {}
    assignments: list[dict[str, Any]] = []

    cursor = db.comments.find(query, sort=[("workspace_id", 1), ("created_at", 1), ("_id", 1)])
    async for doc in cursor:
        ws = doc["workspace_id"]
        state = per_workspace.setdefault(ws, {"highest": 0, "already_numbered": 0, "to_number": 0})
        existing = doc.get("ticket_number")
        if isinstance(existing, int):
            state["already_numbered"] += 1
            state["highest"] = max(state["highest"], existing)
            continue
        state["highest"] += 1
        state["to_number"] += 1
        assignments.append(
            {"_id": doc["_id"], "workspace_id": ws, "ticket_number": state["highest"]}
        )

    if apply:
        await ensure_additive_indexes(db, TICKET_NUMBER_INDEXES)
        for assignment in assignments:
            await db.comments.update_one(
                # Only if it is *still* unnumbered: a ticket created while this script
                # was running already took a number from the counter, and that number
                # wins over anything computed from the snapshot above.
                {"_id": assignment["_id"], "ticket_number": {"$exists": False}},
                {"$set": {"ticket_number": assignment["ticket_number"]}},
            )
        for ws, state in per_workspace.items():
            await db.counters.update_one(
                {"_id": f"tickets:{ws}"},
                # max, never a blind set: a counter ahead of the backfill (new tickets
                # numbered while this ran) must not be wound back.
                {"$max": {"seq": state["highest"]}},
                upsert=True,
            )

    return {
        "mode": "apply" if apply else "dry-run",
        "workspaces": len(per_workspace),
        "already_numbered": sum(s["already_numbered"] for s in per_workspace.values()),
        "to_number": len(assignments),
        "counters": {ws: state["highest"] for ws, state in per_workspace.items()},
        "sample": [
            {"comment_id": str(a["_id"]), "ticket_number": a["ticket_number"]}
            for a in assignments[:10]
        ],
        "documents_deleted": 0,
        "indexes_dropped": 0,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Write the numbers (default: dry-run)."
    )
    parser.add_argument("--workspace", default=None, help="Limit to one workspace id.")
    args = parser.parse_args()
    try:
        print(json.dumps(await backfill(apply=args.apply, workspace_id=args.workspace), indent=2))
    finally:
        await close_client()


if __name__ == "__main__":
    asyncio.run(main())
