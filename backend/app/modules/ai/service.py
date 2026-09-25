import logging
from typing import Any

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import ExternalServiceError, NotFoundError
from app.core.redis_client import get_redis
from app.modules.ai.key_pool import (
    AIServiceBusyError,
    acquire_key,
    cool_down_key,
    cool_down_pool,
    release_key,
)
from app.modules.ai.schemas import SuggestReplyResult, SummarizeResult
from app.modules.comments.repository import CommentRepository

GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"

logger = logging.getLogger("backline.ai")


async def _get_thread_context(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, comment_id: str
) -> str:
    repo = CommentRepository(db)
    comment = await repo.find_by_id(comment_id)
    if not comment or comment["workspace_id"] != workspace_id:
        raise NotFoundError("Comment not found")

    # If this is a reply, we want the whole thread.
    parent_id = comment.get("parent_id") or comment_id
    parent = await repo.find_by_id(parent_id)
    if not parent:
        raise NotFoundError("Thread parent not found")

    replies = await repo.list_replies(parent_id)

    thread_parts = [f"Original Request: {parent['body']}"]
    for r in replies:
        thread_parts.append(f"Reply: {r['body']}")

    return "\n".join(thread_parts)


def _parse_retry_after(response: httpx.Response, fallback_seconds: float) -> float:
    raw = response.headers.get("retry-after")
    if raw is None:
        return fallback_seconds
    try:
        return max(1.0, float(raw))
    except ValueError:
        return fallback_seconds


async def _complete(prompt: str) -> str:
    """Round-robins the request across every configured Groq key (ai/key_pool.py):
    each key is claimed for the duration of one in-flight call and released the
    instant it returns, so at most one request is ever outstanding per key at a time -
    the pool's own concurrency limit. A 401/403 credential rejection cools that key and
    tries the next configured key. A 429 cools the whole pool because Groq documents
    rate limits at the organization level; hopping keys would not create real capacity.

    Raises AIServiceBusyError (503) when no key is available at all, without ever
    reaching Groq - this covers both "every key is mid-request right now" and "every
    key is still cooling down from a recent rejection." Raises ExternalServiceError
    (502) for a network/upstream failure or when every configured credential is rejected.
    """
    settings = get_settings()
    redis_client = get_redis()
    tried: set[int] = set()
    saw_auth_error = False

    for _ in range(len(settings.groq_api_keys)):
        claim = await acquire_key(
            redis_client,
            settings.groq_api_keys,
            lock_ttl_seconds=settings.groq_key_lock_ttl_seconds,
            exclude=tried,
        )
        if claim is None:
            raise AIServiceBusyError("AI is busy right now - try again in a moment.")
        tried.add(claim.index)

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    GROQ_CHAT_COMPLETIONS_URL,
                    headers={"Authorization": f"Bearer {claim.key}"},
                    json={
                        "model": settings.groq_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.4,
                    },
                )
        except httpx.HTTPError as exc:
            await release_key(redis_client, claim)
            raise ExternalServiceError(f"Groq request failed: {exc}") from exc

        if response.status_code == 429:
            retry_after = _parse_retry_after(response, settings.groq_rate_limit_cooldown_seconds)
            await cool_down_pool(redis_client, claim, retry_after)
            raise AIServiceBusyError("AI is busy right now - try again in a moment.")

        if response.status_code in (401, 403):
            saw_auth_error = True
            logger.warning(
                "Groq key #%d rejected with status %d", claim.index, response.status_code
            )
            await cool_down_key(redis_client, claim, settings.groq_rate_limit_cooldown_seconds)
            continue

        await release_key(redis_client, claim)
        try:
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPStatusError, ValueError) as exc:
            raise ExternalServiceError(f"Groq request failed: {exc}") from exc

        choices = data.get("choices") or []
        if not choices:
            raise ExternalServiceError("Groq returned no completion choices.")
        content: str = choices[0].get("message", {}).get("content", "")
        return content

    if saw_auth_error:
        raise ExternalServiceError("Groq rejected every configured GROQ_API_KEYS entry.")
    raise AIServiceBusyError("AI is busy right now - try again in a moment.")


async def summarize_thread(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, comment_id: str
) -> SummarizeResult:
    context = await _get_thread_context(db, workspace_id, comment_id)

    settings = get_settings()
    if not settings.groq_api_keys:
        return SummarizeResult(
            summary="[AI Disabled] Configure GROQ_API_KEYS to see real summaries. "
            "The thread context is ready."
        )

    prompt = f"Summarize the following feedback thread in one concise paragraph:\n\n{context}"
    text = await _complete(prompt)
    return SummarizeResult(summary=text.strip() or "Could not generate summary.")


async def suggest_reply(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, comment_id: str
) -> SuggestReplyResult:
    context = await _get_thread_context(db, workspace_id, comment_id)

    settings = get_settings()
    if not settings.groq_api_keys:
        return SuggestReplyResult(
            suggestions=["[AI] I agree.", "[AI] Can you clarify?", "[AI] Will fix."]
        )

    prompt = (
        "Given the following feedback thread, suggest 3 short, helpful replies the "
        f"team could send. Format each reply on a new line starting with '- ':\n\n{context}"
    )
    text = await _complete(prompt)

    suggestions = [
        line.strip("- *").strip() for line in text.split("\n") if line.strip().startswith("-")
    ]
    if not suggestions:
        suggestions = ["I agree.", "Looking into it.", "Fixed!"]

    return SuggestReplyResult(suggestions=suggestions[:3])
