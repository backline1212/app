from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.mongo_utils import to_object_id


class UserRepository:
    """`users` is a global collection (not workspace-scoped) - 11-Database.md §11.2,
    03-System-Architecture.md §3.5. Agency members only; guests never appear here."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def find_by_email(self, email: str) -> dict[str, Any] | None:
        return await self.db.users.find_one({"email": email})

    async def find_by_id(self, user_id: str) -> dict[str, Any] | None:
        oid = to_object_id(user_id)
        if oid is None:
            return None
        return await self.db.users.find_one({"_id": oid})

    async def find_many_by_ids(self, user_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Batched form of find_by_id, keyed by the original string id - avoids an N+1
        round-trip per member in callers that resolve a whole workspace's membership
        list at once (e.g. notifications/digest.py)."""
        oids = {uid: oid for uid in user_ids if (oid := to_object_id(uid)) is not None}
        if not oids:
            return {}
        cursor = self.db.users.find({"_id": {"$in": list(oids.values())}})
        by_oid = {doc["_id"]: doc async for doc in cursor}
        return {uid: by_oid[oid] for uid, oid in oids.items() if oid in by_oid}

    async def create(
        self,
        *,
        email: str,
        name: str,
        avatar_url: str | None,
        auth_provider: str,
        password_hash: str | None = None,
    ) -> dict[str, Any]:
        """password_hash stays None for every provider but "password" - members created
        by Google or an OTP sign-in have no password at all, which is what
        login_with_password checks for rather than assuming the field exists."""
        doc = {
            "email": email,
            "name": name,
            "avatar_url": avatar_url,
            "auth_providers": [auth_provider],
            "password_hash": password_hash,
            "created_at": datetime.now(UTC),
            "last_login_at": datetime.now(UTC),
            "preferences": {
                "notify_on_assignment": True,
                "notify_on_mention": True,
                "notify_on_reply": True,
                "notify_on_status_change": True,
                "daily_digest": True,
            },
        }
        result = await self.db.users.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def get_or_create(
        self, *, email: str, name: str, avatar_url: str | None, auth_provider: str
    ) -> dict[str, Any]:
        """Check-then-act against the unique `email` index (core/indexes.py:194) is
        racy - two concurrent first-time logins (double-tab OAuth/OTP completion) or
        two concurrent invites for the same address can both pass find_by_email before
        either insert lands. Retry as a lookup on DuplicateKeyError instead of letting
        it surface as an unhandled 500, same pattern as workspaces/service.py's
        slug/membership races."""
        existing = await self.find_by_email(email)
        if existing is not None:
            return existing
        try:
            return await self.create(
                email=email, name=name, avatar_url=avatar_url, auth_provider=auth_provider
            )
        except DuplicateKeyError:
            existing = await self.find_by_email(email)
            if existing is None:
                raise
            return existing

    async def update_profile(self, user_id: str, patch: dict[str, Any]) -> None:
        await self.db.users.update_one({"_id": ObjectId(user_id)}, {"$set": patch})

    async def update(self, user_id: ObjectId, patch: dict[str, Any]) -> None:
        if not patch:
            return
        await self.db.users.update_one({"_id": user_id}, {"$set": patch})

    async def touch_login(self, user_id: ObjectId, auth_provider: str) -> None:
        await self.db.users.update_one(
            {"_id": user_id},
            {
                "$set": {"last_login_at": datetime.now(UTC)},
                "$addToSet": {"auth_providers": auth_provider},
            },
        )


class RefreshTokenRepository:
    """`refresh_tokens` - 11-Database.md §11.14."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        user_id: ObjectId,
        token_hash: str,
        family_id: str,
        ttl_days: int,
        browser: str | None = None,
        os: str | None = None,
        ip_address: str | None = None,
    ) -> None:
        now = datetime.now(UTC)
        await self.db.refresh_tokens.insert_one(
            {
                "user_id": user_id,
                "token_hash": token_hash,
                "family_id": family_id,
                "browser": browser,
                "os": os,
                "ip_address": ip_address,
                "issued_at": now,
                "expires_at": now + timedelta(days=ttl_days),
                "revoked_at": None,
                "replaced_by_token_hash": None,
            }
        )

    async def find_by_hash(self, token_hash: str) -> dict[str, Any] | None:
        return await self.db.refresh_tokens.find_one({"token_hash": token_hash})

    async def rotate(self, *, old_token_hash: str, new_token_hash: str) -> dict[str, Any] | None:
        """Atomically claims the old token for rotation - only succeeds if it was
        still unrevoked at the exact moment of this update. Without the `revoked_at:
        None` filter here, two concurrent /auth/refresh calls carrying the same
        still-valid cookie (double-tab, or a stolen token replayed at the same moment
        as the legitimate user) can both read revoked_at=None in the caller's earlier
        check-then-act read and both mint a child token from the same parent -
        silently defeating the sequential-reuse theft detection above, which only
        fires when a *second* read sees revoked_at already set. Returns the matched
        (pre-update) document, or None if someone else already claimed/revoked it
        first - the caller treats a None return exactly like reuse-of-a-revoked-token."""
        return await self.db.refresh_tokens.find_one_and_update(
            {"token_hash": old_token_hash, "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(UTC), "replaced_by_token_hash": new_token_hash}},
        )

    async def family_is_active(self, user_id: str, family_id: str) -> bool:
        user_object_id = to_object_id(user_id)
        if user_object_id is None:
            return False
        return (
            await self.db.refresh_tokens.find_one(
                {
                    "user_id": user_object_id,
                    "family_id": family_id,
                    "revoked_at": None,
                    "expires_at": {"$gt": datetime.now(UTC)},
                }
            )
            is not None
        )

    async def list_active(self, user_id: str) -> list[dict[str, Any]]:
        cursor = self.db.refresh_tokens.find(
            {
                "user_id": ObjectId(user_id),
                "revoked_at": None,
                "expires_at": {"$gt": datetime.now(UTC)},
            }
        ).sort("issued_at", -1)
        return [row async for row in cursor]

    async def revoke_other_sessions(self, user_id: str, current: str) -> None:
        await self.db.refresh_tokens.update_many(
            {
                "user_id": ObjectId(user_id),
                "family_id": {"$ne": current},
                "revoked_at": None,
            },
            {"$set": {"revoked_at": datetime.now(UTC)}},
        )

    async def revoke_family(self, family_id: str) -> None:
        """Theft detection (13-Authentication.md §13.6): reuse of an already-rotated
        token revokes every token descended from the same login."""
        await self.db.refresh_tokens.update_many(
            {"family_id": family_id, "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(UTC)}},
        )

    async def revoke_other_families(self, user_id: ObjectId, keep_family_id: str) -> None:
        """One active session per member: every login family except `keep_family_id`
        is revoked, which also invalidates its access tokens on their next request
        (core/session.py's validate_member_session checks the family)."""
        await self.db.refresh_tokens.update_many(
            {"user_id": user_id, "family_id": {"$ne": keep_family_id}, "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(UTC)}},
        )

    async def family_belongs_to_user(self, family_id: str, user_id: ObjectId) -> bool:
        """M-01 ownership check for DELETE /auth/sessions/{family_id}: a family_id is an
        opaque token, not derived from user_id, so without this a caller could revoke
        any other user's session family by guessing/observing its id. Matches on
        user_id + family_id regardless of revoked_at so an already-revoked family a
        user does own still 204s (idempotent), while a family that was never theirs
        404s either way - no leakage of whether a given family_id exists at all."""
        doc = await self.db.refresh_tokens.find_one(
            {"family_id": family_id, "user_id": user_id}, projection={"_id": 1}
        )
        return doc is not None

    async def revoke_by_hash(self, token_hash: str) -> None:
        await self.db.refresh_tokens.update_one(
            {"token_hash": token_hash}, {"$set": {"revoked_at": datetime.now(UTC)}}
        )

    async def list_active_families(self, user_id: ObjectId) -> list[dict[str, Any]]:
        """Returns the most recent refresh token document for each active family."""
        pipeline: list[dict[str, Any]] = [
            {
                "$match": {
                    "user_id": user_id,
                    "revoked_at": None,
                    "expires_at": {"$gt": datetime.now(UTC)},
                }
            },
            {"$sort": {"issued_at": -1}},
            {"$group": {"_id": "$family_id", "doc": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$doc"}},
            {"$sort": {"issued_at": -1}},
        ]
        return await self.db.refresh_tokens.aggregate(pipeline).to_list(100)


class OtpRepository:
    """`otp_codes` - 11-Database.md §11.15."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self, *, email: str, code_hash: str, ttl_minutes: int, purpose: str | None = None
    ) -> None:
        """`purpose` marks a code that is not a sign-in code (e.g. confirming an email
        change for one user); sign-in lookups only ever see codes without one."""
        now = datetime.now(UTC)
        await self.db.otp_codes.insert_one(
            {
                "email": email,
                "code_hash": code_hash,
                "purpose": purpose,
                "attempts": 0,
                "expires_at": now + timedelta(minutes=ttl_minutes),
                "consumed_at": None,
                "created_at": now,
            }
        )

    async def find_latest_active(
        self, email: str, purpose: str | None = None
    ) -> dict[str, Any] | None:
        # {"purpose": None} also matches legacy codes stored before the field existed.
        return await self.db.otp_codes.find_one(
            {
                "email": email,
                "purpose": purpose,
                "consumed_at": None,
                "expires_at": {"$gt": datetime.now(UTC)},
            },
            sort=[("created_at", -1)],
        )

    async def increment_attempts(self, otp_id: ObjectId) -> None:
        await self.db.otp_codes.update_one({"_id": otp_id}, {"$inc": {"attempts": 1}})

    async def mark_consumed(self, otp_id: ObjectId) -> None:
        await self.db.otp_codes.update_one(
            {"_id": otp_id}, {"$set": {"consumed_at": datetime.now(UTC)}}
        )
