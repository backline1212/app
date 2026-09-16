from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


class ExtensionTokenRepository:
    """`extension_tokens` - long-lived, revocable Bearer tokens a member mints from
    the "Connect Extension" settings page for the browser extension. Modeled on
    `refresh_tokens` (backend/app/modules/auth/repository.py): opaque secret, only
    ever stored/compared as a hash, with an explicit `revoked_at` checked on every
    request rather than relying on expiry alone."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        user_id: ObjectId,
        workspace_id: str,
        name: str,
        token_hash: str,
        role: str,
    ) -> dict[str, Any]:
        doc = {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "name": name,
            "token_hash": token_hash,
            "role": role,
            "created_at": datetime.now(UTC),
            "last_used_at": None,
            "revoked_at": None,
        }
        result = await self.db.extension_tokens.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_hash(self, token_hash: str) -> dict[str, Any] | None:
        # workspace-scope-exempt: this is the bearer-token verification lookup itself
        # (core/session.py's _resolve_extension_session) - token_hash is a globally
        # unique opaque secret, and the caller's workspace_id isn't known until this
        # succeeds and yields it from the doc, same reasoning as refresh_tokens'/
        # mcp_personal_tokens' own find_by_hash.
        return await self.db.extension_tokens.find_one({"token_hash": token_hash})

    async def find_by_id(self, token_id: str) -> dict[str, Any] | None:
        oid = to_object_id(token_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id;
        # revoke_token (service.py) checks doc["user_id"] before acting.
        return await self.db.extension_tokens.find_one({"_id": oid})

    async def list_for_workspace_member(
        self, *, workspace_id: str, user_id: ObjectId
    ) -> list[dict[str, Any]]:
        cursor = self.db.extension_tokens.find(
            {"workspace_id": workspace_id, "user_id": user_id}
        ).sort("created_at", -1)
        return [doc async for doc in cursor]

    async def touch_last_used(self, token_id: ObjectId) -> None:
        # workspace-scope-exempt: token_id comes from find_by_hash's own result
        # (core/session.py's _resolve_extension_session), already the verified token's
        # own _id - nothing to additionally scope by workspace_id here.
        await self.db.extension_tokens.update_one(
            {"_id": token_id}, {"$set": {"last_used_at": datetime.now(UTC)}}
        )

    async def revoke(self, token_id: ObjectId) -> None:
        # workspace-scope-exempt: token_id comes from revoke_token (service.py) after
        # it already checked doc["user_id"] == actor_user_id on the same document.
        await self.db.extension_tokens.update_one(
            {"_id": token_id}, {"$set": {"revoked_at": datetime.now(UTC)}}
        )
