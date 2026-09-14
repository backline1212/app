from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


class WorkspaceRepository:
    """`workspaces` - 11-Database.md §11.1. Global collection (not workspace-scoped -
    it *is* the tenant), per 03-System-Architecture.md §3.5."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(self, *, name: str, slug: str) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "name": name,
            "slug": slug,
            "plan": "free",
            "branding_json": {},
            # None until the first daily digest run touches it (17.6,
            # modules/notifications/digest.py) - a fresh workspace's first run just
            # establishes this checkpoint rather than emailing its entire history.
            "last_digest_sent_at": None,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.workspaces.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_slug(self, slug: str) -> dict[str, Any] | None:
        return await self.db.workspaces.find_one({"slug": slug})

    async def find_by_id(self, workspace_id: str) -> dict[str, Any] | None:
        oid = to_object_id(workspace_id)
        if oid is None:
            return None
        return await self.db.workspaces.find_one({"_id": oid})

    async def update(self, workspace_id: str, *, name: str | None) -> None:
        patch: dict[str, Any] = {"updated_at": datetime.now(UTC)}
        if name is not None:
            patch["name"] = name
        await self.db.workspaces.update_one({"_id": ObjectId(workspace_id)}, {"$set": patch})

    async def list_all(self) -> list[dict[str, Any]]:
        """M-08: notifications/digest.py's run_daily_digests previously iterated
        `db.workspaces.find({})` directly (rule 2.1 violation) - moved here unchanged
        in shape. Every workspace, no pagination: this only ever runs from the daily
        cron job, not a request path."""
        return [doc async for doc in self.db.workspaces.find({})]

    async def set_last_digest_sent_at(self, workspace_id: str, when: datetime) -> None:
        await self.db.workspaces.update_one(
            {"_id": to_object_id(workspace_id)}, {"$set": {"last_digest_sent_at": when}}
        )

    async def claim_digest_window(
        self,
        workspace_id: str,
        *,
        expected_last_sent_at: datetime | None,
        new_last_sent_at: datetime,
    ) -> bool:
        """Atomic compare-and-swap on `last_digest_sent_at`: only one caller can
        successfully advance it past `expected_last_sent_at` at a time. Used to claim
        the digest window BEFORE sending any email (notifications/digest.py), so a
        crashed/retried run or two overlapping schedule fires for the same workspace
        can't both send the same batch of comments twice."""
        result = await self.db.workspaces.update_one(
            {"_id": to_object_id(workspace_id), "last_digest_sent_at": expected_last_sent_at},
            {"$set": {"last_digest_sent_at": new_last_sent_at}},
        )
        return result.modified_count == 1


class MembershipRepository:
    """`memberships` - 11-Database.md §11.3. `workspace_id`/`user_id` are stored as
    strings (matching the JWT's `workspace_id`/`sub` claims, 13-Authentication.md §13.3)
    rather than ObjectId, so session comparisons never need a conversion step."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self, *, workspace_id: str, user_id: str, role: str, invited_by: str | None
    ) -> dict[str, Any]:
        doc = {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "role": role,
            "invited_by": invited_by,
            "created_at": datetime.now(UTC),
        }
        result = await self.db.memberships.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find(self, *, workspace_id: str, user_id: str) -> dict[str, Any] | None:
        return await self.db.memberships.find_one(
            {"workspace_id": workspace_id, "user_id": user_id}
        )

    async def find_by_id(self, *, workspace_id: str, membership_id: str) -> dict[str, Any] | None:
        oid = to_object_id(membership_id)
        if oid is None:
            return None
        return await self.db.memberships.find_one({"workspace_id": workspace_id, "_id": oid})

    async def list_for_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        cursor = self.db.memberships.find({"workspace_id": workspace_id})
        return [doc async for doc in cursor]

    async def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        # workspace-scope-exempt: intentionally cross-workspace - "list every workspace
        # this user belongs to" (the workspace picker) is the whole point of this query,
        # not a leak. user_id itself comes from the caller's own verified session.
        cursor = self.db.memberships.find({"user_id": user_id})
        return [doc async for doc in cursor]

    async def update_role(self, *, workspace_id: str, membership_id: str, role: str) -> None:
        await self.db.memberships.update_one(
            {"workspace_id": workspace_id, "_id": ObjectId(membership_id)},
            {"$set": {"role": role}},
        )

    async def delete(self, *, workspace_id: str, membership_id: str) -> None:
        await self.db.memberships.delete_one(
            {"workspace_id": workspace_id, "_id": ObjectId(membership_id)}
        )

    async def count_by_role(self, *, workspace_id: str, role: str) -> int:
        return await self.db.memberships.count_documents(
            {"workspace_id": workspace_id, "role": role}
        )
