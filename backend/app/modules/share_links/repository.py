from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id

# TDR-0057: the link the dashboard's review canvas loads through. One per project, made
# by the system, never listed with the client links, and its guest sessions are only
# ever issued to a signed-in member (share_links/service.py's create_canvas_session).
# Links without `purpose` (every link before TDR-0057) are client links.
CANVAS_LINK_PURPOSE = "canvas"


def is_canvas_link(link: dict[str, Any]) -> bool:
    return link.get("purpose") == CANVAS_LINK_PURPOSE


class ShareLinkRepository:
    """`share_links` - 11-Database.md §11.5."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        project_id: str,
        workspace_id: str,
        token: str,
        mode: str,
        passcode_hash: str | None,
        expires_at: datetime | None,
        created_by: str,
        ask_reviewer_name: bool = True,
        domain_restrictions: list[str] | None = None,
        comment_export_permission: bool = False,
        purpose: str | None = None,
    ) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "project_id": project_id,
            "workspace_id": workspace_id,
            "token": token,
            "mode": mode,
            "passcode_hash": passcode_hash,
            "expires_at": expires_at,
            "revoked_at": None,
            "created_by": created_by,
            "created_at": datetime.now(UTC),
            "ask_reviewer_name": ask_reviewer_name,
            "domain_restrictions": domain_restrictions or [],
            "comment_export_permission": comment_export_permission,
        }
        if purpose is not None:
            doc["purpose"] = purpose
        result = await self.db.share_links.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_token(self, token: str) -> dict[str, Any] | None:
        # workspace-scope-exempt: tokens are cryptographically random and globally
        # unique by design - this is the public, unauthenticated share-link resolution
        # path (GET /review/{token}); the workspace is *derived from* the token here,
        # not known in advance.
        return await self.db.share_links.find_one({"token": token})

    async def find_by_id(self, share_link_id: str) -> dict[str, Any] | None:
        oid = to_object_id(share_link_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id; every
        # caller checks doc["workspace_id"] against the caller's workspace immediately
        # after (e.g. revoke_share_link in share_links/service.py).
        return await self.db.share_links.find_one({"_id": oid})

    async def list_for_project(self, workspace_id: str, project_id: str) -> list[dict[str, Any]]:
        """The project's client links. The canvas link is left out (TDR-0057)."""
        cursor = self.db.share_links.find(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "purpose": {"$ne": CANVAS_LINK_PURPOSE},
            }
        ).sort("created_at", -1)
        return [doc async for doc in cursor]

    async def find_canvas_link(self, workspace_id: str, project_id: str) -> dict[str, Any] | None:
        return await self.db.share_links.find_one(
            {"workspace_id": workspace_id, "project_id": project_id, "purpose": CANVAS_LINK_PURPOSE}
        )

    async def revoke(self, share_link_id: str) -> None:
        # workspace-scope-exempt: revoke_share_link already verified
        # doc["workspace_id"] == workspace_id via find_by_id before calling this.
        await self.db.share_links.update_one(
            {"_id": to_object_id(share_link_id)}, {"$set": {"revoked_at": datetime.now(UTC)}}
        )


class GuestSessionRepository:
    """`guest_sessions` - 11-Database.md §11.6."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        share_link_id: str,
        workspace_id: str,
        display_name: str,
        email: str | None,
        ua_fingerprint: str,
        member_user_id: str | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc: dict[str, Any] = {
            "share_link_id": share_link_id,
            "workspace_id": workspace_id,
            "display_name": display_name,
            "email": email,
            "ua_fingerprint": ua_fingerprint,
            "created_at": now,
            "last_seen_at": now,
        }
        if member_user_id is not None:
            doc["member_user_id"] = member_user_id
        result = await self.db.guest_sessions.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id(self, guest_session_id: str) -> dict[str, Any] | None:
        oid = to_object_id(guest_session_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id, resolved
        # from a guest token whose claims are cryptographically verified before this is
        # ever called (get_guest_session in core/session.py).
        return await self.db.guest_sessions.find_one({"_id": oid})

    async def find_for_member(
        self, *, workspace_id: str, share_link_id: str, member_user_id: str
    ) -> dict[str, Any] | None:
        """A member's canvas session on this link, reused rather than minting one per
        visit (TDR-0057)."""
        return await self.db.guest_sessions.find_one(
            {
                "workspace_id": workspace_id,
                "share_link_id": share_link_id,
                "member_user_id": member_user_id,
            }
        )

    async def set_display_name(
        self, *, workspace_id: str, guest_session_id: str, display_name: str
    ) -> None:
        await self.db.guest_sessions.update_one(
            {"_id": to_object_id(guest_session_id), "workspace_id": workspace_id},
            {"$set": {"display_name": display_name}},
        )

    async def touch_last_seen(self, *, workspace_id: str, guest_session_id: str) -> None:
        """Extend the 180-day inactivity TTL only after access is re-authorized."""
        await self.db.guest_sessions.update_one(
            {"_id": to_object_id(guest_session_id), "workspace_id": workspace_id},
            {"$set": {"last_seen_at": datetime.now(UTC)}},
        )
