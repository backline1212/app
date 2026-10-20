"""Read-only bucket inventory by default. --apply adds accounting, never deletes objects."""

import argparse
import asyncio
import json
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession
from pymongo.errors import OperationFailure

from app.core.config import get_settings
from app.core.db import close_client, get_db
from app.core.mongo_utils import to_object_id
from app.modules.billing.limits import run_plan_change
from app.modules.storage.quota_repository import StorageQuotaRepository
from app.modules.storage.r2_client import _make_client


def inventory() -> list[tuple[str, int]]:
    result: list[tuple[str, int]] = []
    client = _make_client()
    for page in client.get_paginator("list_objects_v2").paginate(
        Bucket=get_settings().r2_bucket_name
    ):
        result.extend((item["Key"], item["Size"]) for item in page.get("Contents", []))
        if len(result) > 200_000:
            raise RuntimeError(
                "Inventory exceeds the bounded migration size; use a partitioned migration."
            )
    return result


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    try:
        # workspace-scope-exempt: internal inventory migration maps known tenant
        # namespaces. Reports contain totals only, never object keys/contact data.
        workspaces = {str(doc["_id"]) async for doc in db.workspaces.find({}, {"_id": 1})}
        projects = {
            str(doc["_id"]): doc["workspace_id"]
            async for doc in db.projects.find({}, {"workspace_id": 1})
        }
        # Hard-deleted projects may still have durable GC records for old snapshot keys.
        for row in await db.object_gc_tombstones.find(
            {}, {"project_id": 1, "workspace_id": 1}
        ).to_list(None):
            projects.setdefault(row["project_id"], row["workspace_id"])
        grouped: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
        unknown = 0
        unrelated = 0
        objects = await asyncio.to_thread(inventory)
        for key, size in objects:
            parts = key.split("/")
            workspace_id = project_id = ""
            if len(parts) >= 4 and parts[0] in (
                "assets",
                "uploads",
                "screenshots",
                "previews",
                "renders",
            ):
                workspace_id, project_id = parts[1:3]
            elif len(parts) >= 4 and parts[0] == "snapshots":
                project_id = parts[1]
                workspace_id = projects.get(project_id, "")
            else:
                unrelated += 1
                continue
            if workspace_id not in workspaces:
                unknown += 1
                continue
            grouped[workspace_id].append((project_id, key, size))
        if apply and unknown:
            raise RuntimeError(
                "Unattributed Backline objects found; refusing to mark the inventory ready."
            )
        if apply:
            for workspace_id in workspaces:

                async def commit(
                    session: AsyncIOMotorClientSession, target_workspace: str = workspace_id
                ) -> None:
                    await StorageQuotaRepository(db).import_existing_many(
                        target_workspace, grouped[target_workspace], session=session
                    )
                    await db.workspaces.update_one(
                        {"_id": to_object_id(target_workspace)},
                        {
                            "$set": {
                                "storage_inventory_ready": True,
                                "storage_inventory_bucket": get_settings().r2_bucket_name,
                                "storage_inventory_at": datetime.now(UTC),
                            }
                        },
                        session=session,
                    )

                await run_plan_change(db, workspace_id, commit)
        return {
            "mode": "apply" if apply else "dry-run",
            "workspaces": len(workspaces),
            "attributed_objects": sum(len(rows) for rows in grouped.values()),
            "attributed_bytes": sum(size for rows in grouped.values() for _, _, size in rows),
            "unattributed_backline_objects": unknown,
            "unrelated_objects": unrelated,
            "objects_deleted": 0,
            "business_records_modified": False,
            "accounting_imported": apply,
        }
    finally:
        await close_client()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        print(json.dumps(asyncio.run(run(apply=parser.parse_args().apply)), indent=2))
    except OperationFailure as exc:
        print(f"Storage inventory unavailable (database error code {exc.code}).")
        raise SystemExit(1) from None
    except Exception as exc:
        print(f"Storage inventory unavailable ({type(exc).__name__}).")
        raise SystemExit(1) from None
