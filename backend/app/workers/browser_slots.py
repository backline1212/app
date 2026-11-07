"""At most BROWSER_SLOTS headless-browser jobs run at once (TDR-0231).

Renders and preview captures each launch Chromium and use far more memory than any
other job. They used to be limited by the worker's `max_jobs = 3`, which also capped
emails, digests, integration posts and the heartbeat - three slow renders held all of
them up. Now the worker takes more jobs and only browser jobs share these slots; a
browser job that finds none free is deferred instead of holding a worker slot.

Each slot is a Redis key that expires on its own, so a worker killed mid-render frees
its slot after BROWSER_SLOT_TTL seconds."""

import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from arq import Retry

from app.core.redis_client import get_redis

BROWSER_SLOTS = 2
BROWSER_SLOT_TTL = 330  # a little over the 300 s arq job timeout
RETRY_DEFER_SECONDS = 15


@asynccontextmanager
async def browser_slot() -> AsyncIterator[None]:
    redis = get_redis()
    token = secrets.token_hex(8)
    held: str | None = None
    for index in range(BROWSER_SLOTS):
        key = f"worker:browser-slot:{index}"
        if await redis.set(key, token, nx=True, ex=BROWSER_SLOT_TTL):
            held = key
            break
    if held is None:
        raise Retry(defer=RETRY_DEFER_SECONDS)
    try:
        yield
    finally:
        # Only release the slot if it is still ours (it may have expired and been taken).
        current = await redis.get(held)
        if current in (token, token.encode()):
            await redis.delete(held)
