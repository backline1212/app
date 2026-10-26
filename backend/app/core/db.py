from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings

_client: AsyncIOMotorClient[dict[str, Any]] | None = None


def get_client() -> AsyncIOMotorClient[dict[str, Any]]:
    global _client
    if _client is None:
        settings = get_settings()
        # tz_aware=True: BSON datetimes carry no timezone, so pymongo returns naive
        # ones by default even though everything is written as tz-aware UTC
        # (datetime.now(UTC)) - without this, comparing a value read back from Mongo
        # against datetime.now(UTC) raises TypeError, naive vs. aware.
        # Fail in seconds, not pymongo's 30 s default, when no server can be reached.
        _client = AsyncIOMotorClient(
            settings.mongo_uri,
            tz_aware=True,
            serverSelectionTimeoutMS=5_000,
            connectTimeoutMS=5_000,
        )
    return _client


def get_db() -> AsyncIOMotorDatabase[dict[str, Any]]:
    settings = get_settings()
    return get_client()[settings.mongo_db_name]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
