from datetime import UTC, datetime
from typing import Any, Literal

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

ActorType = Literal["member", "guest", "system"]


async def append_event(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    type: str,
    actor_type: ActorType,
    actor_id: str | None,
    payload: dict[str, Any],
    session: AsyncIOMotorClientSession | None = None,
) -> None:
    """Append-only audit log (06-Backend-Architecture.md §6.6, 11-Database.md §11.13).
    Called once per state-changing service method, alongside the state change itself."""
    await db.events.insert_one(
        {
            "workspace_id": workspace_id,
            "type": type,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "payload_json": payload,
            "created_at": datetime.now(UTC),
        },
        session=session,
    )


async def append_event_once(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    correlation_id: str,
    workspace_id: str,
    type: str,
    actor_type: ActorType,
    actor_id: str | None,
    payload: dict[str, Any],
) -> None:
    """Append one retry-safe summary event for a destructive operation."""
    try:
        await db.events.insert_one(
            {
                "correlation_id": correlation_id,
                "workspace_id": workspace_id,
                "type": type,
                "actor_type": actor_type,
                "actor_id": actor_id,
                "payload_json": payload,
                "created_at": datetime.now(UTC),
            }
        )
    except DuplicateKeyError:
        # Retrying a partially completed hard-delete must not produce a second audit
        # summary. The unique sparse correlation index applies only to such events.
        return
