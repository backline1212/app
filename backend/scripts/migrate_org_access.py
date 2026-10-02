"""Tidy data for project access, room codes and the org chart (docs/tdr/0056).

Run from backend: python -m scripts.migrate_org_access [--apply]

Dry-run by default: it reports what it would change and changes nothing. Nothing here
is needed for the feature to work - projects without an `access` block already read as
open to the whole workspace - it only fills in data so older rows behave like new ones:

1. Comment events written before TDR-0056 carry a comment_id but no project_id, so the
   activity feed has to look each one up to hide private projects. This adds the
   project_id, found through the comment's page.
2. Room codes saved by the first version of this branch were stored as typed. Codes
   are now matched upper-cased with spaces removed, so this normalizes them, and lists
   any two workspaces that would end up sharing one (those are left for a person to
   resolve - the unique index can't be built until they are).
3. That version also wrote an `assigned_member_ids` list on projects, which nothing
   reads any more. This removes it. Access lives in `access` now.
"""

import argparse
import asyncio
import json
import re
from collections import defaultdict
from typing import Any

from app.core.db import close_client, get_db
from app.core.mongo_utils import to_object_id

_COMMENT_EVENT_PREFIX = "^comment\\."


def _normalize_code(value: str) -> str:
    return re.sub(r"\s+", "", value).upper()


async def _backfill_event_projects(db: Any, *, apply: bool) -> dict[str, int]:
    page_projects: dict[str, str | None] = {}
    comment_pages: dict[str, str | None] = {}
    updated = unresolved = 0
    async for event in db.events.find(
        {
            "type": {"$regex": _COMMENT_EVENT_PREFIX},
            "payload_json.project_id": {"$exists": False},
        },
        projection={"workspace_id": 1, "payload_json": 1},
    ):
        payload = event.get("payload_json") or {}
        page_id = payload.get("page_id")
        comment_id = payload.get("comment_id")
        if not page_id and isinstance(comment_id, str):
            if comment_id not in comment_pages:
                comment = await db.comments.find_one(
                    {"_id": to_object_id(comment_id), "workspace_id": event["workspace_id"]},
                    projection={"page_id": 1},
                )
                comment_pages[comment_id] = comment["page_id"] if comment else None
            page_id = comment_pages[comment_id]
        if not isinstance(page_id, str):
            unresolved += 1
            continue
        if page_id not in page_projects:
            page = await db.pages.find_one(
                {"_id": to_object_id(page_id), "workspace_id": event["workspace_id"]},
                projection={"project_id": 1},
            )
            page_projects[page_id] = page["project_id"] if page else None
        project_id = page_projects[page_id]
        if project_id is None:
            unresolved += 1
            continue
        updated += 1
        if apply:
            await db.events.update_one(
                {"_id": event["_id"], "workspace_id": event["workspace_id"]},
                {"$set": {"payload_json.project_id": project_id}},
            )
    return {"events_with_project_added": updated, "events_unresolvable": unresolved}


async def _normalize_room_codes(db: Any, *, apply: bool) -> dict[str, Any]:
    by_code: dict[str, list[str]] = defaultdict(list)
    changes: list[dict[str, str]] = []
    async for workspace in db.workspaces.find(
        {"room_code": {"$type": "string"}}, projection={"room_code": 1}
    ):
        stored = workspace["room_code"]
        normalized = _normalize_code(stored) or None
        workspace_id = str(workspace["_id"])
        if normalized:
            by_code[normalized].append(workspace_id)
        if normalized != stored:
            changes.append({"workspace_id": workspace_id, "from": stored, "to": normalized or ""})
    collisions = {code: ids for code, ids in by_code.items() if len(ids) > 1}
    colliding = {workspace_id for ids in collisions.values() for workspace_id in ids}
    applied = 0
    if apply:
        for change in changes:
            if change["workspace_id"] in colliding:
                continue
            await db.workspaces.update_one(
                {"_id": to_object_id(change["workspace_id"])},
                {"$set": {"room_code": change["to"] or None}},
            )
            applied += 1
    return {
        "room_codes_to_normalize": len(changes),
        "room_codes_normalized": applied,
        "room_code_collisions": collisions,
    }


async def _drop_assigned_member_ids(db: Any, *, apply: bool) -> dict[str, int]:
    query = {"assigned_member_ids": {"$exists": True}}
    count = 0
    async for project in db.projects.find(query, projection={"workspace_id": 1}):
        count += 1
        if apply:
            await db.projects.update_one(
                {"_id": project["_id"], "workspace_id": project["workspace_id"]},
                {"$unset": {"assigned_member_ids": ""}},
            )
    return {"projects_with_assigned_member_ids": count}


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    try:
        report: dict[str, Any] = {"mode": "apply" if apply else "dry-run"}
        report.update(await _backfill_event_projects(db, apply=apply))
        report.update(await _normalize_room_codes(db, apply=apply))
        report.update(await _drop_assigned_member_ids(db, apply=apply))
    finally:
        await close_client()
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the changes")
    args = parser.parse_args()
    report = asyncio.run(run(apply=args.apply))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
