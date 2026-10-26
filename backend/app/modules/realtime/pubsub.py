import asyncio
import contextlib
import json
import logging
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as redis

from app.core.config import get_settings
from app.core.redis_client import get_redis
from app.modules.realtime.manager import manager

logger = logging.getLogger("backline.realtime")

# Every WS channel is published through Redis, even though local dev only ever runs one
# backend process - there is no in-process-only shortcut, so this is already correct the
# day a second instance exists (Rule: build it so nothing breaks when made prod-ready).
CHANNEL_PREFIX = "ws:"


async def publish(
    channel: str, *, event_type: str, workspace_id: str, payload: dict[str, Any]
) -> None:
    """Envelope shape is exactly 12-API-WebSocket.md §12.6's:
    `{ "type": ..., "workspace_id": ..., "payload": ..., "ts": ... }`."""
    envelope = {
        "type": event_type,
        "workspace_id": workspace_id,
        "payload": payload,
        "ts": datetime.now(UTC).isoformat(),
    }
    await get_redis().publish(f"{CHANNEL_PREFIX}{channel}", json.dumps(envelope, default=str))


# Whether this process is currently subscribed; /health reports it (TDR-0200).
subscriber_connected = False


async def _relay(pubsub: Any) -> None:
    async for message in pubsub.listen():
        if message["type"] != "pmessage":
            continue
        raw_channel = message["channel"]
        channel = (
            raw_channel.decode() if isinstance(raw_channel, bytes) else raw_channel
        ).removeprefix(CHANNEL_PREFIX)
        try:
            envelope = json.loads(message["data"])
        except (json.JSONDecodeError, TypeError):
            logger.warning("Dropping malformed realtime message on channel %s", channel)
            continue
        await manager.broadcast_local(channel, envelope)


async def run_subscriber() -> None:
    """Long-running background task (started in main.py's lifespan): the single bridge
    between Redis pub/sub and this process's local WebSocket connections. One pattern
    subscription covers every channel shape (workspace:*, project:*) - a new channel
    never needs new subscriber wiring.

    A dropped Redis connection resubscribes with backoff (up to 30 s) instead of ending
    the task, which used to stop live updates until the next deploy. Its own client has
    no read timeout - an idle subscription is normal - and pings to notice a dead link."""
    global subscriber_connected
    redis_client = redis.from_url(  # type: ignore[no-untyped-call]
        get_settings().redis_url, socket_connect_timeout=5, health_check_interval=30
    )
    delay = 1.0
    try:
        while True:
            pubsub = redis_client.pubsub()
            try:
                await pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
                subscriber_connected = True
                delay = 1.0
                await _relay(pubsub)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Realtime subscription lost; retrying in %.0fs", delay)
            finally:
                subscriber_connected = False
                with contextlib.suppress(Exception):
                    await pubsub.aclose()
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30.0)
    except asyncio.CancelledError:
        pass
    finally:
        await redis_client.aclose()
