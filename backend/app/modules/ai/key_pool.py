import uuid
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Any, cast

import redis.asyncio as redis
from fastapi import status

from app.core.errors import BacklineError

_LOCK_PREFIX = "ai:groq:lock"
_KEY_COOLDOWN_PREFIX = "ai:groq:key-cooldown"
_GLOBAL_COOLDOWN_KEY = "ai:groq:cooldown"
# Concurrent requests one key may carry. One key per request made a single-key
# deployment (the usual setup) serve one AI request at a time for every workspace;
# Groq's own rate limits still apply through the 429 cool-down (TDR-0235).
REQUESTS_PER_KEY = 4

_RELEASE_IF_OWNER = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
"""


@dataclass(frozen=True)
class KeyLease:
    index: int
    key: str
    owner: str
    slot: int = 0

    @property
    def lock_name(self) -> str:
        return f"{_LOCK_PREFIX}:{self.index}:{self.slot}"


class AIServiceBusyError(BacklineError):
    """Every configured Groq key is currently mid-request or cooling down from a real
    rate-limit rejection - the feature is genuinely configured, there's just no spare
    capacity for this request right now. Distinct from ExternalServiceError (a call
    that was actually attempted and failed): no request reaches Groq in this case."""

    code = "AI_SERVICE_BUSY"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


async def acquire_key(
    client: redis.Redis,
    keys: list[str],
    *,
    lock_ttl_seconds: float,
    exclude: set[int],
) -> KeyLease | None:
    """Claims the first configured key that is neither mid-request nor cooling down,
    atomically per key (`SET NX`) so two concurrent requests can never claim the same
    one - this is what gives each concurrent caller "its own key" out of the pool.
    `lock_ttl_seconds` is a safety net only: the normal path calls `release_key` the
    moment the Groq call returns, so a key is actually unavailable only for the
    duration of one real request, not the full TTL, unless the process dies mid-call."""
    if await client.exists(_GLOBAL_COOLDOWN_KEY):
        return None
    for index, key in enumerate(keys):
        if index in exclude or await client.exists(f"{_KEY_COOLDOWN_PREFIX}:{index}"):
            continue
        for slot in range(REQUESTS_PER_KEY):
            owner = uuid.uuid4().hex
            claimed = await client.set(
                f"{_LOCK_PREFIX}:{index}:{slot}", owner, nx=True, ex=max(1, int(lock_ttl_seconds))
            )
            if claimed:
                return KeyLease(index=index, key=key, owner=owner, slot=slot)
    return None


async def release_key(client: redis.Redis, lease: KeyLease) -> None:
    """Returns a key to the pool immediately after a call completes normally, instead
    of leaving it locked out for the rest of the safety-net TTL."""
    await cast(
        Awaitable[Any],
        client.eval(_RELEASE_IF_OWNER, 1, lease.lock_name, lease.owner),
    )


async def cool_down_key(client: redis.Redis, lease: KeyLease, seconds: float) -> None:
    """Keep a rejected credential out of rotation (all of its slots) for `seconds`."""
    ttl = max(1, int(seconds))
    await client.set(f"{_KEY_COOLDOWN_PREFIX}:{lease.index}", "1", ex=ttl)
    await release_key(client, lease)


async def cool_down_pool(client: redis.Redis, lease: KeyLease, seconds: float) -> None:
    """Honor an organization-wide Groq 429 without hopping to another API key."""
    ttl = max(1, int(seconds))
    await cool_down_key(client, lease, ttl)
    await client.set(_GLOBAL_COOLDOWN_KEY, "1", ex=ttl)
