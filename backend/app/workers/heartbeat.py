"""Periodic worker revision observation, independent of domain jobs."""

from typing import Any

from app.core.worker_heartbeat import (
    HEARTBEAT_TTL_SECONDS,
    worker_heartbeat_key,
    worker_heartbeat_payload,
)


async def report_worker_heartbeat_job(ctx: dict[str, Any]) -> None:
    await ctx["redis"].set(
        worker_heartbeat_key(), worker_heartbeat_payload(), ex=HEARTBEAT_TTL_SECONDS
    )
