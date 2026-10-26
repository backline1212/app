from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.mongo_utils import to_object_id
from app.modules.comments.idempotency import require_matching_replay


class CommentRepository:
    """`comments` - 11-Database.md §11.10."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self, doc: dict[str, Any], *, session: AsyncIOMotorClientSession | None = None
    ) -> dict[str, Any]:
        try:
            result = await self.db.comments.insert_one(doc, session=session)
        except DuplicateKeyError:
            if session is not None:
                # A duplicate aborts this Mongo transaction. The caller must read
                # the winning request outside it before treating this as a replay.
                raise
            # comments_workspace_client_request_id_strings caught a race that slipped
            # past create_comment/create_reply's find_by_client_request_id
            # check-before-create in comments/service.py (two concurrent retries of the
            # same POST, e.g. a flaky mobile network firing the request twice) - fall
            # back to whatever the other writer just inserted, same pattern as
            # RevisionDiffRepository.create.
            client_request_id = doc.get("client_request_id")
            if client_request_id is None:
                raise
            existing = await self.find_by_client_request_id(doc["workspace_id"], client_request_id)
            if existing is None:
                raise
            require_matching_replay(existing, doc)
            return existing
        doc["_id"] = result.inserted_id
        return doc

    async def next_ticket_number(self, workspace_id: str) -> int:
        """The next human-readable ticket number for this workspace (#1, #2, ...).

        One counter document per workspace, bumped with a single atomic
        find_one_and_update - two comments created at the same moment can never be
        handed the same number, which a max()+1 read-then-write could. Numbers are
        per workspace, not per project: the tickets list spans every project, and two
        different projects both owning a "#3" would make the number useless there.
        """
        doc = await self.db.counters.find_one_and_update(
            {"_id": f"tickets:{workspace_id}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(doc["seq"])

    async def find_by_id(self, comment_id: str) -> dict[str, Any] | None:
        oid = to_object_id(comment_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id; every
        # caller checks doc["workspace_id"] against the caller's workspace immediately
        # after (e.g. comments/service.py's update_comment) before acting on it.
        return await self.db.comments.find_one({"_id": oid})

    async def find_in_workspace(
        self,
        workspace_id: str,
        comment_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any] | None:
        oid = to_object_id(comment_id)
        if oid is None:
            return None
        return await self.db.comments.find_one(
            {"_id": oid, "workspace_id": workspace_id, "deleted_at": None}, session=session
        )

    async def carry_open_threads(
        self,
        workspace_id: str,
        *,
        from_page_id: str,
        to_page_id: str,
        to_asset_id: str,
        page_count: int,
        carried_from: dict[str, Any],
        session: AsyncIOMotorClientSession,
    ) -> int:
        """Moves a file's open threads (and their replies) onto its new version, keeping
        each pin's relative position, number and history; resolved threads stay where
        they were given (TDR-0171). Returns how many threads moved."""
        roots = [
            str(doc["_id"])
            async for doc in self.db.comments.find(
                {
                    "workspace_id": workspace_id,
                    "page_id": from_page_id,
                    "parent_id": None,
                    "deleted_at": None,
                    "status": {"$nin": ["resolved", "wont_fix"]},
                    "anchor.kind": "asset",
                },
                {"_id": 1},
                session=session,
            )
        ]
        if not roots:
            return 0
        await self.db.comments.update_many(
            {"workspace_id": workspace_id, "_id": {"$in": [to_object_id(i) for i in roots]}},
            [
                {
                    "$set": {
                        "page_id": to_page_id,
                        "anchor.asset_id": to_asset_id,
                        # A PDF version with fewer pages keeps the pin on its last page.
                        "anchor.region.page_number": {
                            "$min": [{"$ifNull": ["$anchor.region.page_number", 1]}, page_count]
                        },
                        "carried_from": {"$literal": carried_from},
                        "revision": {"$add": [{"$ifNull": ["$revision", 0]}, 1]},
                    }
                }
            ],
            session=session,
        )
        await self.db.comments.update_many(
            {"workspace_id": workspace_id, "parent_id": {"$in": roots}},
            {"$set": {"page_id": to_page_id}},
            session=session,
        )
        return len(roots)

    async def find_many_in_workspace(
        self,
        workspace_id: str,
        comment_ids: list[str],
        fields: dict[str, int] | None = None,
    ) -> list[dict[str, Any]]:
        """Several comments at once, for labelling another listing (the activity feed).
        Deleted ones are included, since an event about one still happened; callers
        decide what of a deleted comment to show."""
        oids = [oid for oid in map(to_object_id, comment_ids) if oid is not None]
        if not oids:
            return []
        cursor = self.db.comments.find(
            {"workspace_id": workspace_id, "_id": {"$in": oids}},
            fields or {"ticket_number": 1, "body": 1, "deleted_at": 1},
        )
        return [doc async for doc in cursor]

    async def find_by_ticket_number(
        self, workspace_id: str, ticket_number: int
    ) -> dict[str, Any] | None:
        """The live comment or ticket numbered "#N" in this workspace (MCP tools accept
        ticket numbers as well as ids)."""
        return await self.db.comments.find_one(
            {"workspace_id": workspace_id, "ticket_number": ticket_number, "deleted_at": None}
        )

    async def list_for_member(
        self,
        workspace_id: str,
        page_id: str,
        *,
        since: datetime | None = None,
        projection: dict[str, int] | None = None,
    ) -> list[dict[str, Any]]:
        """A member sees every layer - the layer filter here is a no-op, present only
        so both list methods have the same shape and a reviewer of this file sees the
        asymmetry explicitly rather than having to infer it."""
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "page_id": page_id,
            "deleted_at": None,
        }
        if since is not None:
            query["created_at"] = {"$gt": since}
        cursor = self.db.comments.find(query, projection).sort("created_at", 1)
        return [doc async for doc in cursor]

    async def list_for_guest_session(
        self,
        workspace_id: str,
        page_id: str,
        *,
        since: datetime | None = None,
        projection: dict[str, int] | None = None,
    ) -> list[dict[str, Any]]:
        """`layer: "client"` is hard-coded into the query filter - there is no parameter
        that lets a caller ask for `team` layer comments on behalf of a guest session
        (11-Database.md §11.10's server-side enforcement note). This is the concrete
        implementation of "a client session can never render, fetch, or receive
        team-only content" - not a UI-level hide."""
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "page_id": page_id,
            "layer": "client",
            "deleted_at": None,
        }
        if since is not None:
            query["created_at"] = {"$gt": since}
        cursor = self.db.comments.find(query, projection).sort("created_at", 1)
        docs = [doc async for doc in cursor]

        # A client-layer reply is only visible while its thread is: a thread moved to
        # team-only (toggle_layer), or a legacy client reply left on a team thread before
        # create_reply made replies inherit it, would otherwise still hand its
        # discussion to the guest.
        visible_tops = {str(doc["_id"]) for doc in docs if doc.get("parent_id") is None}
        unknown_parents = {
            doc["parent_id"]
            for doc in docs
            if doc.get("parent_id") is not None and doc["parent_id"] not in visible_tops
        }
        if unknown_parents:
            parent_oids = [oid for pid in unknown_parents if (oid := to_object_id(pid))]
            parents = self.db.comments.find(
                {
                    "_id": {"$in": parent_oids},
                    "workspace_id": workspace_id,
                    "layer": "client",
                    "deleted_at": None,
                },
                {"_id": 1},
            )
            visible_tops.update([str(parent["_id"]) async for parent in parents])
        return [
            doc for doc in docs if doc.get("parent_id") is None or doc["parent_id"] in visible_tops
        ]

    async def list_for_project(
        self, workspace_id: str, page_ids: list[str]
    ) -> list[dict[str, Any]]:
        """Member-only (12-API-WebSocket.md §12.4's `/projects/{id}/comments` - the
        Board's data source, 16-Dashboard.md §16.1). Every layer, across every page in
        the project - matches the `page_id: {"$in": page_ids}` query 11-Database.md
        §11.14's kanban-counts aggregation already assumes."""
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "page_id": {"$in": page_ids},
            "deleted_at": None,
        }
        cursor = self.db.comments.find(query).sort("created_at", 1)
        return [doc async for doc in cursor]

    async def list_client_layer_for_project(
        self, workspace_id: str, page_ids: list[str]
    ) -> list[dict[str, Any]]:
        """FD-AUD-042/M-04 guest board data source - same shape as list_for_project but
        restricted to layer == "client", the same hard-coded filter
        list_for_guest_session already uses per page. The caller (comment_service's
        list_guest_board) is responsible for checking show_board_to_client before
        calling this - this method only enforces the layer boundary, not the project
        setting."""
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "page_id": {"$in": page_ids},
            "layer": "client",
            # Threads only: the board's items are tickets, and a reply's own layer
            # says nothing about whether its thread is still client-visible.
            "parent_id": None,
            "deleted_at": None,
        }
        cursor = self.db.comments.find(query).sort("created_at", 1)
        return [doc async for doc in cursor]

    async def list_since_for_workspace(
        self, workspace_id: str, since: datetime
    ) -> list[dict[str, Any]]:
        """M-08: notifications/digest.py's run_digest_for_workspace previously queried
        `db.comments.find(...)` directly (rule 2.1 violation) - moved here unchanged in
        shape. Includes both layers for current workspace members only; the digest
        service must positively resolve workspace-scoped page/project references
        and recheck each recipient's project access. Never reuse for a client-facing
        digest without adding a layer filter first."""
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "deleted_at": None,
            "created_at": {"$gt": since},
        }
        return [doc async for doc in self.db.comments.find(query)]

    async def digest_page(
        self,
        workspace_id: str,
        since: datetime,
        until: datetime,
        after: str | None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "deleted_at": None,
            "created_at": {"$gt": since, "$lte": until},
        }
        if after:
            query["_id"] = {"$gt": to_object_id(after)}
        return (
            await self.db.comments.find(query, {"page_id": 1, "project_id": 1})
            .sort("_id", 1)
            .limit(limit)
            .to_list(length=limit)
        )

    async def count_created_by_page(
        self, workspace_id: str, since: datetime, until: datetime, limit: int = 2000
    ) -> list[dict[str, Any]]:
        """Daily digest counts: comments and replies created in the window, per page."""
        pipeline: list[dict[str, Any]] = [
            {
                "$match": {
                    "workspace_id": workspace_id,
                    "deleted_at": None,
                    "created_at": {"$gt": since, "$lte": until},
                }
            },
            {"$group": {"_id": "$page_id", "count": {"$sum": 1}}},
            {"$limit": limit},
        ]
        return await self.db.comments.aggregate(pipeline).to_list(length=limit)

    async def open_assigned_due_before(
        self, workspace_id: str, user_id: str, before: datetime, limit: int = 500
    ) -> list[dict[str, Any]]:
        """Daily digest reminders: open tickets assigned to the member, due before `before`."""
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "deleted_at": None,
            "parent_id": None,
            "status": {"$nin": ["resolved", "wont_fix"]},
            "due_at": {"$ne": None, "$lt": before},
            "$or": [{"assignee_id": user_id}, {"assignee_ids": user_id}],
        }
        return (
            await self.db.comments.find(query, {"page_id": 1, "project_id": 1, "due_at": 1})
            .limit(limit)
            .to_list(length=limit)
        )

    async def find_by_client_request_id(
        self, workspace_id: str, client_request_id: str
    ) -> dict[str, Any] | None:
        """M-08 idempotency lookup - mirrors pages/repository.py's
        find_by_normalized_url check-before-create pattern rather than relying on
        catching a duplicate-key error as the primary path."""
        return await self.db.comments.find_one(
            {"workspace_id": workspace_id, "client_request_id": client_request_id}
        )

    async def list_replies(self, parent_id: str) -> list[dict[str, Any]]:
        """Every non-deleted reply to one comment - used by delete_thread
        (comments/service.py) to find what a "delete this whole thread" cascades to."""
        # workspace-scope-exempt: parent_id was already found-and-ownership-checked by
        # the caller before this runs; replies are looked up via that already-scoped
        # parent, not independently.
        cursor = self.db.comments.find({"parent_id": parent_id, "deleted_at": None})
        return [doc async for doc in cursor]

    async def soft_delete(self, comment_id: str) -> None:
        # workspace-scope-exempt: delete_comment (comments/service.py) already verified
        # both workspace ownership and authorship via find_by_id before calling this.
        await self.db.comments.update_one(
            {"_id": to_object_id(comment_id)}, {"$set": {"deleted_at": datetime.now(UTC)}}
        )

    async def soft_delete_many(self, comment_ids: list[str]) -> None:
        oids = [to_object_id(cid) for cid in comment_ids]
        # workspace-scope-exempt: delete_thread (comments/service.py) already verified
        # ownership of the top-level comment; every id here came from that comment's own
        # id or list_replies(parent_id=that comment), not from caller-supplied input.
        await self.db.comments.update_many(
            {"_id": {"$in": oids}}, {"$set": {"deleted_at": datetime.now(UTC)}}
        )

    async def update(
        self,
        workspace_id: str,
        comment_id: str,
        patch: dict[str, Any],
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> bool:
        patch["edited_at"] = datetime.now(UTC)
        result = await self.db.comments.update_one(
            {"workspace_id": workspace_id, "_id": to_object_id(comment_id), "deleted_at": None},
            {"$set": patch, "$inc": {"revision": 1}},
            session=session,
        )
        return result.matched_count == 1

    async def update_if_revision(
        self,
        workspace_id: str,
        comment_id: str,
        patch: dict[str, Any],
        expected_revision: int,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any] | None:
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "_id": to_object_id(comment_id),
            "deleted_at": None,
        }
        if expected_revision == 0:
            query["$or"] = [{"revision": 0}, {"revision": {"$exists": False}}]
        else:
            query["revision"] = expected_revision
        return await self.db.comments.find_one_and_update(
            query,
            {"$set": {**patch, "edited_at": datetime.now(UTC)}, "$inc": {"revision": 1}},
            return_document=ReturnDocument.AFTER,
            session=session,
        )

    async def apply_ai_priority(
        self,
        workspace_id: str,
        page_id: str,
        comment_id: str,
        expected: dict[str, Any],
        priority: str,
    ) -> dict[str, Any] | None:
        previous = expected.get("priority", "medium")
        return await self.db.comments.find_one_and_update(
            {
                "workspace_id": workspace_id,
                "page_id": page_id,
                "_id": to_object_id(comment_id),
                "parent_id": None,
                "deleted_at": None,
                "status": {"$nin": ["resolved", "wont_fix"]},
                "body": expected["body"],
                "edited_at": expected.get("edited_at"),
                "priority": {"$in": [None, "medium"]} if previous == "medium" else previous,
            },
            {
                "$set": {"priority": priority, "edited_at": datetime.now(UTC)},
                "$inc": {"revision": 1},
            },
            return_document=ReturnDocument.AFTER,
        )

    async def list_recoverable_for_page(
        self, workspace_id: str, page_id: str
    ) -> list[dict[str, Any]]:
        """Every comment the recovery pipeline should re-attempt on a new revision
        (10-Revision-Recovery.md §10.4/§10.5) - everything except `permanently_orphaned`,
        which means the system has explicitly given up (two consecutive misses) until a
        human manually reanchors it (`PATCH /comments/{id}/reanchor`).

        DB-02: top-level comments only. A reply is the same visual pin as its parent
        (comments/service.py::create_reply no longer copies the parent's anchor onto
        it), so re-anchoring it independently would be redundant work against a stale
        or absent anchor - it inherits recovery_status from the parent at read time
        instead (comments/service.py::_comment_out)."""
        query = {
            "workspace_id": workspace_id,
            "page_id": page_id,
            "parent_id": None,
            "recovery_status": {"$ne": "permanently_orphaned"},
            "is_standalone": {"$ne": True},
            "anchor.kind": {"$ne": "asset"},
            "deleted_at": None,
        }
        cursor = self.db.comments.find(query)
        return [doc async for doc in cursor]

    async def update_recovery(
        self,
        comment_id: str,
        *,
        anchor: dict[str, Any] | None,
        recovery_status: str,
        consecutive_orphaned_revisions: int,
    ) -> None:
        """Deliberately doesn't touch `edited_at` - unlike `update()`, this is a
        system-driven recovery outcome, not a human edit to the comment's own content
        (10-Revision-Recovery.md §10.4 step 5: "do not delete or move the comment's
        stored anchor" when no match is found, so `anchor` is None on that path and
        left untouched)."""
        patch: dict[str, Any] = {
            "recovery_status": recovery_status,
            "consecutive_orphaned_revisions": consecutive_orphaned_revisions,
        }
        if anchor is not None:
            patch["anchor"] = anchor
        # workspace-scope-exempt: comment_id came from list_recoverable_for_page, which
        # is itself workspace_id-filtered - already scoped before this mutation runs.
        await self.db.comments.update_one({"_id": to_object_id(comment_id)}, {"$set": patch})
