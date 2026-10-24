from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.config import get_settings
from app.core.mongo_utils import to_object_id


class WorkspaceRepository:
    """`workspaces` - 11-Database.md §11.1. Global collection (not workspace-scoped -
    it *is* the tenant), per 03-System-Architecture.md §3.5."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def due_digest_workspaces(self, limit: int = 50) -> list[dict[str, Any]]:
        now = datetime.now(UTC)
        due: list[dict[str, Any]] = [{"digest_window.after": {"$lte": now}}]
        if now.hour >= 9:
            due.append(
                {
                    "digest_window": None,
                    "digest_last_scheduled_day": {"$ne": now.date().isoformat()},
                }
            )
        cursor = self.db.workspaces.find({"$or": due}, {"_id": 1})
        return await cursor.sort("_id", 1).limit(limit).to_list(length=limit)

    async def claim_digest_preparation(self, workspace_id: str) -> dict[str, Any] | None:
        workspace = await self.find_by_id(workspace_id)
        if workspace is None:
            return None
        now = datetime.now(UTC)
        lease = uuid4().hex
        window = workspace.get("digest_window")
        if window:
            return await self.db.workspaces.find_one_and_update(
                {
                    "_id": to_object_id(workspace_id),
                    "digest_window.id": window["id"],
                    "digest_window.after": {"$lte": now},
                },
                {
                    "$set": {
                        "digest_window.lease": lease,
                        "digest_window.after": now + timedelta(minutes=2),
                    }
                },
                return_document=ReturnDocument.AFTER,
            )
        day = now.date().isoformat()
        if now.hour < 9 or workspace.get("digest_last_scheduled_day") == day:
            return None
        since = workspace.get("last_digest_sent_at")
        if since is None:
            # Preserve the legacy first-run no-history behavior; no email is due.
            await self.db.workspaces.update_one(
                {
                    "_id": to_object_id(workspace_id),
                    "last_digest_sent_at": None,
                    "digest_window": None,
                },
                {"$set": {"last_digest_sent_at": now, "digest_last_scheduled_day": day}},
            )
            return None
        if since.tzinfo is None:
            since = since.replace(tzinfo=UTC)
        if workspace.get("digest_last_scheduled_day") is None and since.date() == now.date():
            # A legacy worker already checkpointed today's digest. Adopt its day
            # without sending an extra rollout digest; retain the existing cursor.
            await self.db.workspaces.update_one(
                {
                    "_id": to_object_id(workspace_id),
                    "last_digest_sent_at": since,
                    "digest_window": None,
                    "digest_last_scheduled_day": None,
                },
                {"$set": {"digest_last_scheduled_day": day}},
            )
            return None
        if since >= now:
            return None
        window = {
            "id": uuid4().hex,
            "since": since,
            "until": now,
            "day": day,
            "lease": lease,
            "after": now + timedelta(minutes=2),
        }
        return await self.db.workspaces.find_one_and_update(
            {
                "_id": to_object_id(workspace_id),
                "last_digest_sent_at": since,
                "digest_window": None,
                "digest_last_scheduled_day": {"$ne": day},
            },
            {"$set": {"digest_window": window}},
            return_document=ReturnDocument.AFTER,
        )

    async def advance_digest_preparation(
        self,
        workspace_id: str,
        window: dict[str, Any],
        member_cursor: str | None,
        *,
        complete: bool = False,
    ) -> bool:
        update: dict[str, Any]
        if complete:
            update = {
                "$set": {
                    "digest_last_scheduled_day": window["day"],
                },
                "$max": {"last_digest_sent_at": window["until"]},
                "$unset": {"digest_window": ""},
            }
        else:
            update = {"$set": {"digest_window.member_cursor": member_cursor}}
        result = await self.db.workspaces.update_one(
            {
                "_id": to_object_id(workspace_id),
                "digest_window.id": window["id"],
                "digest_window.lease": window["lease"],
                "digest_window.after": {"$gt": datetime.now(UTC)},
            },
            update,
        )
        return result.matched_count == 1

    async def create(self, *, name: str, slug: str) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "name": name,
            "slug": slug,
            "plan": "free",
            "branding_json": {},
            "storage_inventory_ready": True,
            "storage_inventory_bucket": get_settings().r2_bucket_name,
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

    async def set_fields(self, workspace_id: str, patch: dict[str, Any]) -> None:
        """A plain $set on the workspace document (dotted paths allowed)."""
        oid = to_object_id(workspace_id)
        if oid is None:
            return
        await self.db.workspaces.update_one(
            {"_id": oid}, {"$set": {**patch, "updated_at": datetime.now(UTC)}}
        )

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
        session: AsyncIOMotorClientSession | None = None,
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
        result = await self.db.memberships.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return doc

    async def find(
        self,
        *,
        workspace_id: str,
        user_id: str,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any] | None:
        return await self.db.memberships.find_one(
            {"workspace_id": workspace_id, "user_id": user_id}, session=session
        )

    async def find_by_id(self, *, workspace_id: str, membership_id: str) -> dict[str, Any] | None:
        oid = to_object_id(membership_id)
        if oid is None:
            return None
        return await self.db.memberships.find_one({"workspace_id": workspace_id, "_id": oid})

    async def list_for_workspace(
        self, workspace_id: str, *, session: AsyncIOMotorClientSession | None = None
    ) -> list[dict[str, Any]]:
        cursor = self.db.memberships.find({"workspace_id": workspace_id}, session=session)
        return [doc async for doc in cursor]

    async def digest_page(
        self, workspace_id: str, until: datetime, after: str | None, limit: int = 100
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "$or": [{"created_at": {"$lte": until}}, {"created_at": {"$exists": False}}],
        }
        if after:
            query["_id"] = {"$gt": to_object_id(after)}
        return (
            await self.db.memberships.find(query, {"user_id": 1})
            .sort("_id", 1)
            .limit(limit)
            .to_list(length=limit)
        )

    async def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        # workspace-scope-exempt: intentionally cross-workspace - "list every workspace
        # this user belongs to" (the workspace picker) is the whole point of this query,
        # not a leak. user_id itself comes from the caller's own verified session.
        cursor = self.db.memberships.find({"user_id": user_id})
        return [doc async for doc in cursor]

    async def update_role(
        self,
        *,
        workspace_id: str,
        membership_id: str,
        role: str,
        expected_role: dict[str, Any] | str | None = None,
        session: AsyncIOMotorClientSession | None = None,
    ) -> bool:
        """`expected_role` turns the write into a compare-and-set (a role, or a query
        such as {"$ne": "owner"}), so a concurrent ownership change can't be undone by
        a decision made on a stale read. Returns whether a membership matched."""
        oid = to_object_id(membership_id)
        if oid is None:
            return False
        query: dict[str, Any] = {"workspace_id": workspace_id, "_id": oid}
        if expected_role is not None:
            query["role"] = expected_role
        result = await self.db.memberships.update_one(
            query, {"$set": {"role": role}}, session=session
        )
        return result.matched_count == 1

    async def delete(
        self, *, workspace_id: str, membership_id: str, protect_owner: bool = False
    ) -> bool:
        oid = to_object_id(membership_id)
        if oid is None:
            return False
        query: dict[str, Any] = {"workspace_id": workspace_id, "_id": oid}
        if protect_owner:
            query["role"] = {"$ne": "owner"}
        result = await self.db.memberships.delete_one(query)
        return result.deleted_count == 1

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
        session: AsyncIOMotorClientSession | None = None,
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
            session=session,
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
