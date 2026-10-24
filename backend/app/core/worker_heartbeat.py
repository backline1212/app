"""Short-lived worker observation shared by the Arq worker and API."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import redis.asyncio as redis
from pydantic import BaseModel, Field, ValidationError

from app.core.config import get_settings
from app.core.health_schema import WorkerHealthOut
from app.core.release_identity import deployment_id, release_sha

HEARTBEAT_TTL_SECONDS = 95


class WorkerHeartbeat(BaseModel):
    release_sha: str | None = Field(pattern=r"^[0-9a-f]{40}$")
    deployment_id: UUID | None
    reported_at: datetime


def worker_heartbeat_key() -> str:
    return f"backline:{get_settings().environment}:worker-heartbeat"


def worker_heartbeat_payload() -> str:
    raw_deployment_id = deployment_id()
    return WorkerHeartbeat(
        release_sha=release_sha(),
        deployment_id=UUID(raw_deployment_id) if raw_deployment_id else None,
        reported_at=datetime.now(UTC),
    ).model_dump_json()


async def read_worker_heartbeat(client: redis.Redis) -> WorkerHealthOut:
    unknown = WorkerHealthOut(
        status="unknown", release_sha=None, deployment_id=None, reported_at=None
    )
    try:
        raw = await client.get(worker_heartbeat_key())
        if raw is None:
            return unknown
        heartbeat = WorkerHeartbeat.model_validate_json(raw)
    except (ValidationError, ValueError, TypeError):
        return unknown

    now = datetime.now(UTC)
    recorded = heartbeat.reported_at
    if (
        recorded.tzinfo is None
        or recorded > now + timedelta(seconds=5)
        or now - recorded > timedelta(seconds=HEARTBEAT_TTL_SECONDS)
    ):
        return unknown
    return WorkerHealthOut(
        status="recent",
        release_sha=heartbeat.release_sha,
        deployment_id=str(heartbeat.deployment_id) if heartbeat.deployment_id else None,
        reported_at=recorded,
    )
