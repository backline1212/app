from typing import Any

from bson import ObjectId
from mcp.server.auth.provider import AccessToken, TokenVerifier
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import NotFoundError
from app.core.events import append_event
from app.core.security import generate_opaque_token, hash_secret
from app.modules.ai.service import _get_thread_context
from app.modules.comments.service import get_comment_out_for_workspace
from app.modules.mcp.repository import McpTokenRepository
from app.modules.mcp.schemas import (
    AgentHint,
    GeneratePromptResult,
    McpTokenIssued,
    McpTokenOut,
)

# Prefixed like a real PAT (GitHub's ghp_/gho_ convention) so a token is recognizable
# (and greppable-for-and-revocable) if it ever leaks into a log or a committed config file.
TOKEN_PREFIX = "bl_mcp_"

# AccessToken (mcp.server.auth.provider) has no free-form metadata field - user_id and
# workspace_id are packed into client_id with this separator (neither is ever a Mongo
# ObjectId hex string containing it) so the MCP tool handler can recover both from
# mcp.server.auth.middleware.auth_context.get_access_token() without a second DB round
# trip keyed on the token itself.
_ACTOR_SEPARATOR = "|"


def pack_actor(user_id: str, workspace_id: str) -> str:
    return f"{user_id}{_ACTOR_SEPARATOR}{workspace_id}"


def unpack_actor(client_id: str) -> tuple[str, str]:
    user_id, workspace_id = client_id.split(_ACTOR_SEPARATOR, 1)
    return user_id, workspace_id


def _token_out(doc: dict[str, Any]) -> McpTokenOut:
    return McpTokenOut(
        id=str(doc["_id"]),
        label=doc["label"],
        agent_hint=doc["agent_hint"],
        workspace_id=doc["workspace_id"],
        created_at=doc["created_at"],
        last_used_at=doc["last_used_at"],
        revoked_at=doc["revoked_at"],
    )


async def issue_token(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    user_id: str,
    workspace_id: str,
    label: str,
    agent_hint: str | None,
) -> McpTokenIssued:
    raw_token = TOKEN_PREFIX + generate_opaque_token()
    doc = await McpTokenRepository(db).create(
        user_id=ObjectId(user_id),
        workspace_id=workspace_id,
        label=label,
        agent_hint=agent_hint,
        token_hash=hash_secret(raw_token),
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type="mcp_token.issued",
        actor_type="member",
        actor_id=user_id,
        payload={"mcp_token_id": str(doc["_id"]), "label": label},
    )
    return McpTokenIssued(
        id=str(doc["_id"]),
        token=raw_token,
        label=label,
        agent_hint=doc["agent_hint"],
        created_at=doc["created_at"],
    )


async def list_tokens(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, user_id: str
) -> list[McpTokenOut]:
    docs = await McpTokenRepository(db).list_for_workspace_member(
        workspace_id=workspace_id, user_id=ObjectId(user_id)
    )
    return [_token_out(doc) for doc in docs]


async def revoke_token(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, token_id: str, actor_user_id: str
) -> None:
    repo = McpTokenRepository(db)
    doc = await repo.find_by_id(token_id)
    # A token is personal, not shared team state - ownership (not workspace membership)
    # is the check, same reasoning as extension_tokens.revoke_token.
    if doc is None or str(doc["user_id"]) != actor_user_id:
        raise NotFoundError("MCP token not found.")
    await repo.revoke(doc["_id"])
    await append_event(
        db,
        workspace_id=doc["workspace_id"],
        type="mcp_token.revoked",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"mcp_token_id": str(doc["_id"])},
    )


async def verify_bearer_token(
    db: AsyncIOMotorDatabase[dict[str, Any]], raw_token: str
) -> dict[str, Any] | None:
    """Shared by BacklineTokenVerifier (MCP transport) - looked up by hash so a DB leak
    never exposes usable tokens, same pattern as refresh_tokens/extension_tokens (an
    exact-match hash lookup, not a second application-layer comparison - there's
    nothing to time-attack in an indexed equality query against an unforgeable HMAC
    digest, unlike OTP's short-code compare)."""
    doc = await McpTokenRepository(db).find_by_hash(hash_secret(raw_token))
    if doc is None or doc["revoked_at"] is not None:
        return None
    await McpTokenRepository(db).touch_last_used(doc["_id"])
    return doc


class BacklineTokenVerifier(TokenVerifier):
    """Wires the mcp SDK's Bearer-auth middleware (mcp.server.auth) to this app's own
    token store - `db` is the app-wide Motor singleton (app.core.db.get_db()), not a
    FastAPI Depends() value, since the MCP transport is a separate mounted Starlette
    app outside FastAPI's own request/dependency lifecycle."""

    async def verify_token(self, token: str) -> AccessToken | None:
        from app.core.db import get_db

        doc = await verify_bearer_token(get_db(), token)
        if doc is None:
            return None
        return AccessToken(
            token=token,
            client_id=pack_actor(str(doc["user_id"]), doc["workspace_id"]),
            scopes=["mcp:generate_prompt"],
        )


async def generate_implementation_prompt(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    comment_id: str,
    agent: AgentHint,
) -> GeneratePromptResult:
    """Builds the same round-trip prompt shape as the ClickUp/Trello/Jira/Asana
    integrations' description block (body + structured context + backlink), plus the
    full thread via ai/service.py's existing _get_thread_context - this is deliberately
    not an LLM call: the receiving agent (Claude/Cursor/Codex/Antigravity) does its own
    reasoning over the prompt, this endpoint's job is only to assemble real data."""
    comment = await get_comment_out_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    if comment is None:
        raise NotFoundError("Comment not found.")

    thread = await _get_thread_context(db, workspace_id, comment_id)
    context = comment.context or {}
    lines = [
        "Fix the following feedback reported in Backline:",
        "",
        thread,
        "",
        "---",
        f"Page: {context.get('url', 'unknown')}",
        f"Browser/OS: {context.get('browser', 'unknown')} / {context.get('os', 'unknown')}",
        f"Device: {context.get('device_type', 'unknown')}",
    ]
    if comment.screenshot_url:
        lines.append(f"Screenshot: {comment.screenshot_url}")
    prompt = "\n".join(lines)

    return GeneratePromptResult(agent=agent, implementation_prompt=prompt)
