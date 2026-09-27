import json
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
from app.modules.ai.schemas import (
    BugHuntFinding,
    DuplicatePair,
    ProjectAnalysisResult,
    Severity,
    SuggestReplyResult,
    SummarizeResult,
)
from app.modules.comments.repository import CommentRepository
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository

GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"

# Bounds prompt size/cost for a project-wide analysis - a project with more open
# top-level comments than this only has its newest MAX_ANALYZED_COMMENTS considered.
MAX_ANALYZED_COMMENTS = 40
_VALID_SEVERITIES: frozenset[str] = frozenset(("low", "medium", "high"))
_CLOSED_STATUSES = frozenset(("resolved", "wont_fix"))

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


async def _complete(prompt: str, *, json_mode: bool = False) -> str:
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

        payload: dict[str, Any] = {
            "model": settings.groq_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    GROQ_CHAT_COMPLETIONS_URL,
                    headers={"Authorization": f"Bearer {claim.key}"},
                    json=payload,
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


async def analyze_project(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, project_id: str
) -> ProjectAnalysisResult:
    """BugHunt AI (docs/tdr/0043): reads every open, top-level comment in a project,
    asks Groq to prioritize by severity and flag likely duplicate threads, and writes
    the resulting severity straight into each comment's existing `priority` field -
    the same field/vocabulary `comment:update_status` callers already write manually,
    so this needs no new schema, migration, or permission."""
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")

    pages = await PageRepository(db).list_for_project(workspace_id, project_id)
    page_ids = [str(page["_id"]) for page in pages]
    if not page_ids:
        return ProjectAnalysisResult(summary="No pages to analyze.", analyzed_comment_count=0)

    docs = await CommentRepository(db).list_for_project(workspace_id, page_ids)
    candidates = [
        doc
        for doc in docs
        if doc.get("parent_id") is None and doc.get("status") not in _CLOSED_STATUSES
    ]
    candidates.sort(key=lambda d: d["created_at"], reverse=True)
    candidates = candidates[:MAX_ANALYZED_COMMENTS]

    settings = get_settings()
    if not settings.groq_api_keys:
        return ProjectAnalysisResult(
            summary="[AI Disabled] Configure GROQ_API_KEYS to analyze this project.",
            analyzed_comment_count=0,
        )

    if not candidates:
        return ProjectAnalysisResult(summary="No open issues to analyze.", analyzed_comment_count=0)

    by_id = {str(doc["_id"]): doc for doc in candidates}
    lines = [
        f'id={cid} ticket=#{doc.get("ticket_number")} '
        f'current_priority={doc.get("priority", "medium")}: {doc["body"][:400]}'
        for cid, doc in by_id.items()
    ]
    prompt = (
        "You are triaging a website feedback board. Given these open comments, "
        "respond with ONLY a single JSON object of this exact shape:\n"
        '{"summary": "one short paragraph on overall page progress", '
        '"findings": [{"comment_id": "...", "severity": "low"|"medium"|"high", '
        '"reason": "one short sentence"}], '
        '"possible_duplicates": [{"comment_id_a": "...", "comment_id_b": "...", '
        '"reason": "one short sentence"}]}\n'
        "Only use comment_id values from the list below - never invent one. "
        "Include a finding for every comment listed.\n\n" + "\n".join(lines)
    )

    text = await _complete(prompt, json_mode=True)

    # A malformed or unexpectedly-shaped model response (not JSON, a JSON array/scalar
    # instead of an object, a `findings`/`possible_duplicates` entry that isn't an
    # object itself) must degrade to a summary-only result, never an unhandled 500 -
    # everything from json.loads through the two extraction loops runs inside this one
    # boundary so no partial/inconsistent state can leak out of it.
    findings: list[BugHuntFinding] = []
    duplicates: list[DuplicatePair] = []
    try:
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("Groq response was not a JSON object")

        for raw in parsed.get("findings") or []:
            if not isinstance(raw, dict):
                continue
            comment_id = raw.get("comment_id")
            severity = raw.get("severity")
            if comment_id not in by_id or severity not in _VALID_SEVERITIES:
                continue
            findings.append(
                BugHuntFinding(
                    comment_id=comment_id,
                    ticket_number=by_id[comment_id].get("ticket_number"),
                    severity=severity,
                    reason=str(raw.get("reason", "")).strip(),
                )
            )

        for raw in parsed.get("possible_duplicates") or []:
            if not isinstance(raw, dict):
                continue
            a, b = raw.get("comment_id_a"), raw.get("comment_id_b")
            if a not in by_id or b not in by_id or a == b:
                continue
            duplicates.append(
                DuplicatePair(
                    comment_id_a=a,
                    comment_id_b=b,
                    ticket_number_a=by_id[a].get("ticket_number"),
                    ticket_number_b=by_id[b].get("ticket_number"),
                    reason=str(raw.get("reason", "")).strip(),
                )
            )
        summary = str(parsed.get("summary", "")).strip() or "Analysis complete."
    except (ValueError, TypeError, AttributeError):
        logger.warning("BugHunt AI returned unexpected output shape; falling back to summary-only.")
        findings = []
        duplicates = []
        summary = text.strip()[:2000] or "Could not analyze this project."

    # Only ever writes what survived the block above - a parsing failure leaves
    # `findings` empty, so nothing gets written when the model's output was unusable.
    repo = CommentRepository(db)
    for finding in findings:
        current: Severity = by_id[finding.comment_id].get("priority", "medium")
        if finding.severity != current:
            await repo.update(finding.comment_id, {"priority": finding.severity})

    return ProjectAnalysisResult(
        summary=summary,
        findings=findings,
        possible_duplicates=duplicates,
        analyzed_comment_count=len(candidates),
    )
