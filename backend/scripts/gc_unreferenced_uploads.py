"""Remove review uploads that no comment, reply or ticket ever used (BUG-07).

Run from backend: python -m scripts.gc_unreferenced_uploads [--apply]
    [--workspace ID] [--min-age-days 7]

A reviewer's screenshot or attachment is uploaded before the comment is posted. When the
draft is cancelled or the post never completes, the file stays in storage and keeps
counting against the workspace's storage quota.

Dry-run by default: it lists what it would remove and changes nothing. An upload is a
candidate only when it is older than --min-age-days (default 7, at least 2) and no
comment in its workspace - including replies, standalone tickets and soft-deleted
comments, whose history is kept - names it as `screenshot_key` or an attachment key.
With --apply each candidate's object is deleted, its storage-accounting entry is
released and its upload record removed, in that order, so a failure leaves the rest
for the next run. Safe to re-run.
"""

import argparse
import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.db import close_client, get_db
from app.modules.storage.quota_repository import StorageQuotaRepository
from app.modules.storage.r2_client import delete_object

BATCH = 500


async def referenced_keys(db: Any, workspace_id: str, keys: list[str]) -> set[str]:
    found: set[str] = set()
    cursor = db.comments.find(
        {
            "workspace_id": workspace_id,
            "$or": [{"screenshot_key": {"$in": keys}}, {"attachments.key": {"$in": keys}}],
        },
        {"screenshot_key": 1, "attachments.key": 1},
    )
    async for doc in cursor:
        if doc.get("screenshot_key"):
            found.add(doc["screenshot_key"])
        found.update(a.get("key") for a in doc.get("attachments") or [] if a.get("key"))
    return found


async def collect(*, apply: bool, workspace_id: str | None, min_age_days: int) -> dict[str, Any]:
    db = get_db()
    cutoff = datetime.now(UTC) - timedelta(days=max(2, min_age_days))
    query: dict[str, Any] = {"created_at": {"$lt": cutoff}}
    if workspace_id is not None:
        query["workspace_id"] = workspace_id

    by_workspace: dict[str, list[dict[str, Any]]] = {}
    async for doc in db.uploads.find(query, {"workspace_id": 1, "content_length": 1}):
        by_workspace.setdefault(doc["workspace_id"], []).append(doc)

    scanned = orphaned = removed = failed = 0
    orphaned_bytes = 0
    sample: list[str] = []
    errors: list[str] = []
    quota = StorageQuotaRepository(db)
    for ws, uploads in by_workspace.items():
        for start in range(0, len(uploads), BATCH):
            batch = uploads[start : start + BATCH]
            scanned += len(batch)
            used = await referenced_keys(db, ws, [u["_id"] for u in batch])
            for upload in batch:
                key = upload["_id"]
                if key in used:
                    continue
                orphaned += 1
                orphaned_bytes += int(upload.get("content_length") or 0)
                if len(sample) < 10:
                    sample.append(key)
                if not apply:
                    continue
                try:
                    await delete_object(key)
                    await quota.release_deleted(ws, key)
                    await db.uploads.delete_one({"_id": key, "workspace_id": ws})
                    removed += 1
                except Exception as exc:  # keep going; the next run retries
                    failed += 1
                    if len(errors) < 10:
                        errors.append(f"{key}: {type(exc).__name__}: {exc}")

    return {
        "mode": "apply" if apply else "dry-run",
        "older_than": cutoff.isoformat(),
        "workspaces": len(by_workspace),
        "uploads_checked": scanned,
        "unreferenced": orphaned,
        "unreferenced_bytes": orphaned_bytes,
        "removed": removed,
        "failed": failed,
        "sample": sample,
        "errors": errors,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Delete (default: dry-run).")
    parser.add_argument("--workspace", default=None, help="Limit to one workspace id.")
    parser.add_argument("--min-age-days", type=int, default=7, help="At least 2.")
    args = parser.parse_args()
    try:
        result = await collect(
            apply=args.apply, workspace_id=args.workspace, min_age_days=args.min_age_days
        )
        print(json.dumps(result, indent=2))
    finally:
        await close_client()


if __name__ == "__main__":
    asyncio.run(main())
