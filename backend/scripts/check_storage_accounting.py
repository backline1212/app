"""Read-only rollout totals; never print tenant IDs, object keys or credentials."""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import get_settings
from app.core.db import close_client, get_db
from app.modules.storage.quota_repository import object_id


async def run() -> dict[str, Any]:
    db = get_db()
    settings = get_settings()
    try:
        # workspace-scope-exempt: internal rollout report returns aggregate counts
        # only. Every object lookup is scoped to the upload's workspace.
        workspaces = await db.workspaces.count_documents({})
        ready = await db.workspaces.count_documents(
            {
                "storage_inventory_ready": True,
                "storage_inventory_bucket": settings.r2_bucket_name,
            }
        )
        ledger = await db.storage_objects.aggregate(
            [
                {
                    "$match": {
                        "bucket": settings.r2_bucket_name,
                        "state": {"$in": ["reserved", "stored"]},
                    }
                },
                {
                    "$group": {
                        "_id": "$state",
                        "objects": {"$sum": 1},
                        "bytes": {"$sum": "$byte_size"},
                    }
                },
            ]
        ).to_list(2)
        recent_untracked = 0
        recent = db.uploads.find(
            {"created_at": {"$gte": datetime.now(UTC) - timedelta(hours=1)}},
            {"workspace_id": 1},
        ).limit(10_001)
        examined = 0
        async for upload in recent:
            examined += 1
            if examined > 10_000:
                raise RuntimeError("Recent upload report exceeds its bounded size.")
            tracked = await db.storage_objects.find_one(
                {"_id": object_id(upload["_id"]), "workspace_id": upload["workspace_id"]},
                {"_id": 1},
            )
            if tracked is None:
                recent_untracked += 1
        return {
            "mode": "read-only",
            "enforcement_enabled": settings.storage_quota_enforcement_enabled,
            "workspaces": workspaces,
            "ready_workspaces": ready,
            "active_objects": sum(row["objects"] for row in ledger),
            "held_bytes": sum(row["bytes"] for row in ledger),
            "recent_uploads_examined": examined,
            "recent_untracked_uploads": recent_untracked,
            "ready_for_enforcement": ready == workspaces and recent_untracked == 0,
        }
    finally:
        await close_client()


if __name__ == "__main__":
    try:
        print(json.dumps(asyncio.run(run()), indent=2))
    except Exception as exc:
        print(f"Storage accounting report unavailable ({type(exc).__name__}).")
        raise SystemExit(1) from None
