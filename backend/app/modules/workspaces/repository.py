from datetime import UTC, datetime
from typing import Any

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
            # TDR-0056 joining and project creation. room_code None = joining by code
            # is off; a workspace saved before then reads the same way.
            "room_code": None,
            "join_requires_approval": True,
            "members_can_create_projects": True,
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

    async def find_many_by_ids(self, workspace_ids: list[str]) -> dict[str, dict[str, Any]]:
        oids = [oid for oid in map(to_object_id, workspace_ids) if oid is not None]
        if not oids:
            return {}
        cursor = self.db.workspaces.find({"_id": {"$in": oids}})
        return {str(doc["_id"]): doc async for doc in cursor}

    async def find_by_room_code(self, room_code: str) -> dict[str, Any] | None:
        """`room_code` is stored normalized (workspaces/schemas.py's
        normalize_room_code) and unique among workspaces that have one."""
        return await self.db.workspaces.find_one({"room_code": room_code})

    async def update(
        self,
        workspace_id: str,
        *,
        name: str | None,
        join_requires_approval: bool | None = None,
        members_can_create_projects: bool | None = None,
    ) -> None:
        oid = to_object_id(workspace_id)
        if oid is None:
            return
        patch: dict[str, Any] = {"updated_at": datetime.now(UTC)}
        if name is not None:
            patch["name"] = name
        if join_requires_approval is not None:
            patch["join_requires_approval"] = join_requires_approval
        if members_can_create_projects is not None:
            patch["members_can_create_projects"] = members_can_create_projects
        if len(patch) == 1:  # only updated_at - nothing to do
            return
        await self.db.workspaces.update_one({"_id": oid}, {"$set": patch})

    async def set_room_code(self, workspace_id: str, room_code: str | None) -> None:
        """Raises DuplicateKeyError when another workspace already uses the code
        (workspaces_room_code_unique, core/indexes.py)."""
        await self.db.workspaces.update_one(
            {"_id": to_object_id(workspace_id)},
            {"$set": {"room_code": room_code, "updated_at": datetime.now(UTC)}},
        )

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
        self,
        *,
        workspace_id: str,
        user_id: str,
        role: str,
        invited_by: str | None,
        joined_via: str | None = None,
    ) -> dict[str, Any]:
        doc = {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "role": role,
            "invited_by": invited_by,
            "created_at": datetime.now(UTC),
        }
        if joined_via is not None:
            doc["joined_via"] = joined_via
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
        oid = to_object_id(membership_id)
        if oid is None:
            return
        await self.db.memberships.update_one(
            {"workspace_id": workspace_id, "_id": oid},
            {"$set": {"role": role}},
        )

    async def delete(self, *, workspace_id: str, membership_id: str) -> None:
        oid = to_object_id(membership_id)
        if oid is None:
            return
        await self.db.memberships.delete_one({"workspace_id": workspace_id, "_id": oid})

    async def count_by_role(self, *, workspace_id: str, role: str) -> int:
        return await self.db.memberships.count_documents(
            {"workspace_id": workspace_id, "role": role}
        )

    async def count(self, workspace_id: str) -> int:
        return await self.db.memberships.count_documents({"workspace_id": workspace_id})

    async def update_profile(
        self, *, workspace_id: str, membership_id: str, patch: dict[str, Any]
    ) -> None:
        """Org-chart fields on the membership (TDR-0056): `title`, `team` and
        `manager_user_id`. A None value removes the field."""
        set_ops = {key: value for key, value in patch.items() if value is not None}
        unset_ops = {key: "" for key, value in patch.items() if value is None}
        update: dict[str, Any] = {}
        if set_ops:
            update["$set"] = set_ops
        if unset_ops:
            update["$unset"] = unset_ops
        if not update:
            return
        await self.db.memberships.update_one(
            {"workspace_id": workspace_id, "_id": to_object_id(membership_id)}, update
        )

    async def reassign_reports(
        self, *, workspace_id: str, from_user_id: str, to_user_id: str | None
    ) -> None:
        """Moves everyone reporting to `from_user_id` up to `to_user_id` (or to no
        manager) - used when their manager leaves the workspace."""
        update: dict[str, Any] = (
            {"$set": {"manager_user_id": to_user_id}}
            if to_user_id
            else {"$unset": {"manager_user_id": ""}}
        )
        await self.db.memberships.update_many(
            {"workspace_id": workspace_id, "manager_user_id": from_user_id}, update
        )


class JoinRequestRepository:
    """`join_requests` (TDR-0056): someone with a workspace's room code asking to join
    a workspace that approves joiners. One pending request per person per workspace
    (join_requests_one_pending, core/indexes.py)."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self, *, workspace_id: str, user_id: str, message: str | None
    ) -> dict[str, Any]:
        """Raises DuplicateKeyError when this person already has a pending request."""
        doc = {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "message": message,
            "status": "pending",
            "created_at": datetime.now(UTC),
            "decided_at": None,
            "decided_by": None,
        }
        result = await self.db.join_requests.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id(self, workspace_id: str, request_id: str) -> dict[str, Any] | None:
        oid = to_object_id(request_id)
        if not oid:
            return None
        return await self.db.join_requests.find_one({"_id": oid, "workspace_id": workspace_id})

    async def find_pending(self, workspace_id: str, user_id: str) -> dict[str, Any] | None:
        return await self.db.join_requests.find_one(
            {"workspace_id": workspace_id, "user_id": user_id, "status": "pending"}
        )

    async def find_recent_rejection(
        self, workspace_id: str, user_id: str, since: datetime
    ) -> dict[str, Any] | None:
        return await self.db.join_requests.find_one(
            {
                "workspace_id": workspace_id,
                "user_id": user_id,
                "status": "rejected",
                "decided_at": {"$gte": since},
            }
        )

    async def claim(
        self,
        workspace_id: str,
        request_id: str,
        *,
        status: str,
        decided_by: str | None,
    ) -> bool:
        """Moves a pending request to `status`. False when it isn't pending any more,
        so two admins deciding at once can't both act on it."""
        oid = to_object_id(request_id)
        if not oid:
            return False
        result = await self.db.join_requests.update_one(
            {"_id": oid, "workspace_id": workspace_id, "status": "pending"},
            {
                "$set": {
                    "status": status,
                    "decided_at": datetime.now(UTC),
                    "decided_by": decided_by,
                }
            },
        )
        return result.modified_count == 1

    async def reopen(self, workspace_id: str, request_id: str) -> None:
        """Undoes a claim whose follow-up failed (e.g. the plan was full)."""
        await self.db.join_requests.update_one(
            {"_id": to_object_id(request_id), "workspace_id": workspace_id},
            {"$set": {"status": "pending", "decided_at": None, "decided_by": None}},
        )

    async def list_for_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        return [
            doc
            async for doc in self.db.join_requests.find(
                {"workspace_id": workspace_id, "status": "pending"}
            ).sort("created_at", -1)
        ]

    async def list_for_user(self, user_id: str, *, since: datetime) -> list[dict[str, Any]]:
        """The caller's own pending requests, and ones declined since `since`."""
        # workspace-scope-exempt: intentionally cross-workspace - "my requests to join
        # other workspaces" has no workspace yet; user_id is the caller's own session.
        cursor = self.db.join_requests.find(
            {
                "user_id": user_id,
                "$or": [
                    {"status": "pending"},
                    {"status": "rejected", "decided_at": {"$gte": since}},
                ],
            }
        ).sort("created_at", -1)
        return [doc async for doc in cursor]

    async def cancel_own(self, user_id: str, request_id: str) -> bool:
        oid = to_object_id(request_id)
        if not oid:
            return False
        # workspace-scope-exempt: scoped to the caller's own user_id instead - a person
        # withdraws their own request before they belong to that workspace.
        result = await self.db.join_requests.update_one(
            {"_id": oid, "user_id": user_id, "status": "pending"},
            {"$set": {"status": "cancelled", "decided_at": datetime.now(UTC)}},
        )
        return result.modified_count == 1
