"""Backfill `payload_json.project_id` on activity events that only name a comment, page
or share link (events written before TDR-0056, and review-link opens before TDR-0154).

Run from backend: python -m scripts.migrate_event_projects [--apply] [--workspace ID]

Dry-run by default: it reports what it would write and changes nothing. With the
project on every event, the Activity feed's per-reader project filter runs in the
database query, so pages are full and the total is exact for members who can't see
every project. Events whose comment/page/link no longer exists are left unchanged.
Only adds a field; nothing is deleted. Safe to re-run.
"""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db
from app.modules.dashboard.service import resolve_event_projects

BATCH = 500


async def backfill(*, apply: bool, workspace_id: str | None) -> dict[str, Any]:
    db = get_db()
    query: dict[str, Any] = {
        "payload_json.project_id": {"$in": [None, ""]},
        "$or": [
            {"payload_json.comment_id": {"$type": "string"}},
            {"payload_json.page_id": {"$type": "string"}},
            {"payload_json.share_link_id": {"$type": "string"}},
        ],
    }
    if workspace_id is not None:
        query["workspace_id"] = workspace_id

    scanned = resolved = 0
    sample: list[dict[str, str]] = []
    by_workspace: dict[str, list[dict[str, Any]]] = {}
    async for doc in db.events.find(query, {"workspace_id": 1, "payload_json": 1}):
        by_workspace.setdefault(doc["workspace_id"], []).append(doc)
    for ws, docs in by_workspace.items():
        for start in range(0, len(docs), BATCH):
            batch = docs[start : start + BATCH]
            scanned += len(batch)
            projects = await resolve_event_projects(db, ws, batch)
            for event_id, project_id in projects.items():
                resolved += 1
                if len(sample) < 10:
                    sample.append({"event_id": event_id, "project_id": project_id})
                if apply:
                    doc = next(d for d in batch if str(d["_id"]) == event_id)
                    await db.events.update_one(
                        {"_id": doc["_id"], "workspace_id": ws},
                        {"$set": {"payload_json.project_id": project_id}},
                    )

    return {
        "mode": "apply" if apply else "dry-run",
        "workspaces": len(by_workspace),
        "events_without_project": scanned,
        "resolved": resolved,
        "unresolvable": scanned - resolved,
        "sample": sample,
        "documents_deleted": 0,
        "indexes_dropped": 0,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write the field (default: dry-run).")
    parser.add_argument("--workspace", default=None, help="Limit to one workspace id.")
    args = parser.parse_args()
    try:
        print(json.dumps(await backfill(apply=args.apply, workspace_id=args.workspace), indent=2))
    finally:
        await close_client()


if __name__ == "__main__":
    asyncio.run(main())
