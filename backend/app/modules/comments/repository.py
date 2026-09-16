from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.mongo_utils import to_object_id


class CommentRepository:
    """`comments` - 11-Database.md §11.10."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(self, doc: dict[str, Any]) -> dict[str, Any]:
        try:
            result = await self.db.comments.insert_one(doc)
        except DuplicateKeyError:
            # comments_workspace_client_request_id_strings caught a race that slipped
            # past create_comment/create_reply's find_by_client_request_id
            # check-before-create in comments/service.py (two concurrent retries of the
            # same POST, e.g. a flaky mobile network firing the request twice) - fall
            # back to whatever the other writer just inserted, same pattern as
            # RevisionDiffRepository.create.
            client_request_id = doc.get("client_request_id")
            if client_request_id is None:
                raise
            existing = await self.find_by_client_request_id(
                doc["workspace_id"], client_request_id
            )
            if existing is None:
                raise
            return existing
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id(self, comment_id: str) -> dict[str, Any] | None:
        oid = to_object_id(comment_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id; every
        # caller checks doc["workspace_id"] against the caller's workspace immediately
        # after (e.g. comments/service.py's update_comment) before acting on it.
        return await self.db.comments.find_one({"_id": oid})

    async def list_for_member(
        self, workspace_id: str, page_id: str, *, since: datetime | None = None
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
        cursor = self.db.comments.find(query).sort("created_at", 1)
        return [doc async for doc in cursor]

    async def list_for_guest_session(
        self, workspace_id: str, page_id: str, *, since: datetime | None = None
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
        cursor = self.db.comments.find(query).sort("created_at", 1)
        return [doc async for doc in cursor]

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
            "deleted_at": None,
        }
        cursor = self.db.comments.find(query).sort("created_at", 1)
        return [doc async for doc in cursor]

    async def list_since_for_workspace(
        self, workspace_id: str, since: datetime
    ) -> list[dict[str, Any]]:
        """M-08: notifications/digest.py's run_digest_for_workspace previously queried
        `db.comments.find(...)` directly (rule 2.1 violation) - moved here unchanged in
        shape. Deliberately includes both layers: every recipient is a workspace
        member (digest recipients come from MembershipRepository), and members are
        already entitled to see both layers under this workspace's access model
        (there is no project ACL - every member sees every project, per M-01's
        recorded decision). This must never be reused for a client-facing digest
        without adding a layer filter first."""
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "deleted_at": None,
            "created_at": {"$gt": since},
        }
        return [doc async for doc in self.db.comments.find(query)]

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

    async def update(self, comment_id: str, patch: dict[str, Any]) -> None:
        patch["edited_at"] = datetime.now(UTC)
        # workspace-scope-exempt: every caller (update_comment/toggle_layer/reanchor in
        # comments/service.py) already fetched and verified this comment's workspace_id
        # via find_by_id before calling update() - the mutation itself doesn't need to
        # re-filter by it.
        await self.db.comments.update_one({"_id": to_object_id(comment_id)}, {"$set": patch})

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
