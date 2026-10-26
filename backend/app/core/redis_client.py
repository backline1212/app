import redis.asyncio as redis

from app.core.config import get_settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        settings = get_settings()
        # Bounded so an unreachable Redis fails a request in seconds instead of hanging
        # it (most endpoints check a Redis rate limit first). Pub/sub has its own client
        # without a read timeout (realtime/pubsub.py).
        _client = redis.from_url(  # type: ignore[no-untyped-call]
            settings.redis_url,
            socket_timeout=5,
            socket_connect_timeout=3,
            health_check_interval=30,
            retry_on_timeout=True,
        )
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
