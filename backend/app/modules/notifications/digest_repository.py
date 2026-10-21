"""Workspace-scoped durable daily-digest recipients; no public response surface."""

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any, Literal
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument, UpdateOne
from pymongo.errors import BulkWriteError


class DigestDeliveryRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def materialize(
        self, workspace_id: str, window: dict[str, Any], user_ids: list[str]
    ) -> None:
        now = datetime.now(UTC)
        writes: list[UpdateOne] = []
        for user_id in user_ids:
            identity = sha256(f"{workspace_id}/{window['id']}/{user_id}".encode()).hexdigest()
            writes.append(
                UpdateOne(
                    {"workspace_id": workspace_id, "_id": identity},
                    {
                        "$setOnInsert": {
                            "workspace_id": workspace_id,
                            "user_id": user_id,
                            "window_id": window["id"],
                            "since": window["since"],
                            "until": window["until"],
                            "created_at": now,
                            "state": "pending",
                            "after": now,
                            "failures": 0,
                        }
                    },
                    upsert=True,
                )
            )
        if not writes:
            return
        try:
            await self.db.digest_deliveries.bulk_write(writes, ordered=False)
        except BulkWriteError as exc:
            # A late preparation worker can overlap an idempotent re-insert.
            errors = exc.details.get("writeErrors", [])
            if (
                not errors
                or exc.details.get("writeConcernErrors")
                or any(error.get("code") != 11000 for error in errors)
            ):
                raise
            expected = len(set(user_ids))
            count = await self.db.digest_deliveries.count_documents(
                {
                    "workspace_id": workspace_id,
                    "window_id": window["id"],
                    "user_id": {"$in": user_ids},
                }
            )
            if count != expected:
                raise

    async def due(self, limit: int = 50) -> list[dict[str, Any]]:
        # workspace-scope-exempt: internal outbox sweep; every claim/send is scoped
        # to this row's workspace and revalidates recipient/project access.
        cursor = self.db.digest_deliveries.find(
            {"state": "pending", "after": {"$lte": datetime.now(UTC)}},
            {"workspace_id": 1, "after": 1},
        )
        return await cursor.sort("after", 1).limit(limit).to_list(length=limit)

    async def claim(self, workspace_id: str, delivery_id: str) -> dict[str, Any] | None:
        return await self.db.digest_deliveries.find_one_and_update(
            {
                "workspace_id": workspace_id,
                "_id": delivery_id,
                "state": "pending",
                "after": {"$lte": datetime.now(UTC)},
            },
            {"$set": {"lease": uuid4().hex, "after": datetime.now(UTC) + timedelta(minutes=2)}},
            return_document=ReturnDocument.AFTER,
        )

    async def save_progress(
        self, workspace_id: str, delivery_id: str, lease: str, fields: dict[str, Any]
    ) -> bool:
        result = await self.db.digest_deliveries.update_one(
            {"workspace_id": workspace_id, "_id": delivery_id, "state": "pending", "lease": lease},
            {"$set": fields},
        )
        return result.matched_count == 1

    async def finish(
        self,
        workspace_id: str,
        delivery_id: str,
        *,
        lease: str,
        state: Literal["pending", "sent", "skipped", "failed"],
        after: datetime | None = None,
        failures: int | None = None,
    ) -> None:
        fields: dict[str, Any] = {"state": state}
        if after is not None:
            fields["after"] = after
        if failures is not None:
            fields["failures"] = failures
        if state != "pending":
            fields["finished_at"] = datetime.now(UTC)
        await self.db.digest_deliveries.update_one(
            {"workspace_id": workspace_id, "_id": delivery_id, "state": "pending", "lease": lease},
            {"$set": fields, "$unset": {"lease": ""}},
        )
