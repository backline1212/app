import asyncio
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlsplit

from bson import ObjectId
from mcp.server.auth.provider import AccessToken, TokenVerifier
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import NotFoundError
from app.core.events import append_event
from app.core.permissions import Role, role_allows
from app.core.security import generate_opaque_token, hash_secret
from app.core.session import Session
from app.modules.comments.repository import CommentRepository
from app.modules.comments.schemas import CommentOut
from app.modules.comments.service import _comment_out
from app.modules.mcp.repository import McpTokenRepository
from app.modules.mcp.schemas import (
    SCOPE_READ,
    SCOPE_WRITE,
    AgentHint,
    GeneratePromptResult,
    McpAccess,
    McpTokenIssued,
    McpTokenOut,
)
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.workspaces.repository import MembershipRepository

# Prefixed like a real PAT (GitHub's ghp_/gho_ convention) so a token is recognizable
# (and greppable-for-and-revocable) if it ever leaks into a log or a committed config file.
TOKEN_PREFIX = "bl_mcp_"

# AccessToken (mcp.server.auth.provider) has no free-form metadata field - the actor is
# packed into client_id with this separator (never part of an ObjectId hex string or a
# role name) so a tool handler can recover it from get_access_token() without a second
# DB round trip keyed on the token itself.
_ACTOR_SEPARATOR = "|"

_LEGACY_SCOPES = [SCOPE_READ]


@dataclass(frozen=True)
class McpActor:
    """Who an MCP request acts as: the token's owner, in the token's workspace, with
    the role their membership has *now* (checked on every request) and the token's
    scopes."""

    token_id: str
    user_id: str
    workspace_id: str
    role: str
    scopes: tuple[str, ...]

    @property
    def session(self) -> Session:
        return Session(user_id=self.user_id, workspace_id=self.workspace_id, role=self.role)

    @property
    def can_write(self) -> bool:
        return SCOPE_WRITE in self.scopes

    def allows(self, action: str) -> bool:
        return role_allows(action, Role(self.role))


def pack_actor(*, token_id: str, user_id: str, workspace_id: str, role: str) -> str:
    return _ACTOR_SEPARATOR.join((token_id, user_id, workspace_id, role))


def unpack_actor(client_id: str, scopes: list[str]) -> McpActor:
    token_id, user_id, workspace_id, role = client_id.split(_ACTOR_SEPARATOR, 3)
    return McpActor(
        token_id=token_id,
        user_id=user_id,
        workspace_id=workspace_id,
        role=role,
        scopes=tuple(scopes),
    )


def _scopes_for(access: McpAccess) -> list[str]:
    return [SCOPE_READ, SCOPE_WRITE] if access == "read_write" else [SCOPE_READ]


def _token_out(doc: dict[str, Any]) -> McpTokenOut:
    return McpTokenOut(
        id=str(doc["_id"]),
        label=doc["label"],
        agent_hint=doc["agent_hint"],
        workspace_id=doc["workspace_id"],
        scopes=doc.get("scopes") or _LEGACY_SCOPES,
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
    access: McpAccess = "read_write",
) -> McpTokenIssued:
    raw_token = TOKEN_PREFIX + generate_opaque_token()
    scopes = _scopes_for(access)
    doc = await McpTokenRepository(db).create(
        user_id=ObjectId(user_id),
        workspace_id=workspace_id,
        label=label,
        agent_hint=agent_hint,
        token_hash=hash_secret(raw_token),
        scopes=scopes,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type="mcp_token.issued",
        actor_type="member",
        actor_id=user_id,
        payload={"mcp_token_id": str(doc["_id"]), "label": label, "scopes": scopes},
    )
    return McpTokenIssued(
        id=str(doc["_id"]),
        token=raw_token,
        label=label,
        agent_hint=doc["agent_hint"],
        scopes=scopes,
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
) -> McpActor | None:
    """Looked up by hash so a DB leak never exposes usable tokens, same pattern as
    refresh_tokens/extension_tokens.

    The owner's membership is re-read on every request, like the extension token's
    role-drift guard (core/session.py): someone removed from the workspace, or moved to
    a role that can't see team comments, loses MCP access immediately rather than when
    they remember to revoke the token."""
    repo = McpTokenRepository(db)
    doc = await repo.find_by_hash(hash_secret(raw_token))
    if doc is None or doc["revoked_at"] is not None:
        return None
    user_id = str(doc["user_id"])
    member = await MembershipRepository(db).find(workspace_id=doc["workspace_id"], user_id=user_id)
    if member is None or not role_allows("comment:view_team", Role(member["role"])):
        return None
    await repo.touch_last_used(doc["_id"])
    return McpActor(
        token_id=str(doc["_id"]),
        user_id=user_id,
        workspace_id=doc["workspace_id"],
        role=member["role"],
        scopes=tuple(doc.get("scopes") or _LEGACY_SCOPES),
    )


class BacklineTokenVerifier(TokenVerifier):
    """Wires the mcp SDK's Bearer-auth middleware (mcp.server.auth) to this app's own
    token store - `db` is the app-wide Motor singleton (app.core.db.get_db()), not a
    FastAPI Depends() value, since the MCP transport is a separate mounted Starlette
    app outside FastAPI's own request/dependency lifecycle."""

    async def verify_token(self, token: str) -> AccessToken | None:
        from app.core.db import get_db

        actor = await verify_bearer_token(get_db(), token)
        if actor is None:
            return None
        return AccessToken(
            token=token,
            client_id=pack_actor(
                token_id=actor.token_id,
                user_id=actor.user_id,
                workspace_id=actor.workspace_id,
                role=actor.role,
            ),
            scopes=list(actor.scopes),
        )


def parse_ticket_ref(ref: str) -> tuple[int | None, str | None]:
    """(ticket number, comment id) from what an agent or a person is likely to paste:
    "#12", "12", a raw id, or a dashboard link carrying ?comment=<id>."""
    value = ref.strip()
    if "comment=" in value:
        query = urlsplit(value).query or value.split("?", 1)[-1]
        found = parse_qs(query).get("comment")
        if found:
            value = found[0]
    value = value.removeprefix("#").strip()
    if value.isdigit():
        return int(value), None
    return None, value


async def resolve_ticket_doc(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, ref: str
) -> dict[str, Any]:
    """The thread's top-level comment doc for a ticket reference, scoped to the
    workspace. A reply's id resolves to its thread."""
    repo = CommentRepository(db)
    number, comment_id = parse_ticket_ref(ref)
    doc: dict[str, Any] | None
    if number is not None:
        doc = await repo.find_by_ticket_number(workspace_id, number)
    else:
        doc = await repo.find_by_id(comment_id or "")
    if doc is None or doc["workspace_id"] != workspace_id or doc.get("deleted_at"):
        raise NotFoundError(f"No ticket {ref!r} in this workspace.")
    if doc.get("parent_id"):
        parent = await repo.find_by_id(doc["parent_id"])
        if parent is None or parent["workspace_id"] != workspace_id or parent.get("deleted_at"):
            raise NotFoundError(f"No ticket {ref!r} in this workspace.")
        doc = parent
    return doc


@dataclass(frozen=True)
class TicketThread:
    comment: CommentOut
    replies: list[CommentOut]
    project_id: str | None
    project_name: str


async def load_thread(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, ref: str
) -> TicketThread:
    doc = await resolve_ticket_doc(db, workspace_id=workspace_id, ref=ref)
    reply_docs = sorted(
        await CommentRepository(db).list_replies(str(doc["_id"])),
        key=lambda reply: reply["created_at"],
    )
    comment = await _comment_out(db, doc)
    replies = list(await asyncio.gather(*(_comment_out(db, reply) for reply in reply_docs)))
    page = await PageRepository(db).find_by_id(doc["page_id"])
    project = await ProjectRepository(db).find_by_id(page["project_id"]) if page else None
    if project is not None and project["workspace_id"] != workspace_id:
        project = None
    return TicketThread(
        comment=comment,
        replies=replies,
        project_id=str(project["_id"]) if project else None,
        project_name=str(project.get("name", "Untitled project")) if project else "Unknown project",
    )


def ticket_label(comment: CommentOut) -> str:
    return f"#{comment.ticket_number}" if comment.ticket_number is not None else comment.id


def _selector(comment: CommentOut) -> str | None:
    fingerprint = (comment.anchor or {}).get("dom_fingerprint") or {}
    value = fingerprint.get("selector_path") if isinstance(fingerprint, dict) else None
    return str(value) if value else None


def build_implementation_prompt(thread: TicketThread, *, backlink_url: str | None) -> str:
    """A self-contained brief for a coding agent: what the reviewer asked for, the
    whole discussion, and exactly where on the page - only what Backline recorded,
    nothing inferred. Deliberately not an LLM call: the receiving agent does its own
    reasoning over the prompt; this only assembles real data."""
    comment = thread.comment
    context = comment.context or {}
    lines = [
        f"Fix the following feedback reported in Backline "
        f'(ticket {ticket_label(comment)}, project "{thread.project_name}").',
        "",
        "## What the reviewer asked for",
        f"{comment.author_name} ({comment.author_type}) wrote:",
        comment.body.strip(),
    ]
    if thread.replies:
        lines.extend(["", "## Discussion since"])
        for reply in thread.replies:
            visibility = "team only" if reply.layer == "team" else "client visible"
            lines.append(f"- {reply.author_name} ({visibility}): {reply.body.strip()}")

    lines.extend(["", "## Where"])
    lines.append(f"- Page: {context.get('url') or 'not recorded (standalone ticket)'}")
    selector = _selector(comment)
    if selector:
        kind = "region" if (comment.anchor or {}).get("type") == "region" else "element"
        lines.append(f"- Pinned {kind} (CSS path): {selector}")
    if context.get("browser") or context.get("os"):
        lines.append(f"- Browser/OS: {context.get('browser') or '?'} / {context.get('os') or '?'}")
    if context.get("device_type"):
        lines.append(f"- Device: {context['device_type']}")
    viewport = context.get("viewport") or {}
    if isinstance(viewport, dict) and viewport.get("width"):
        lines.append(f"- Viewport: {viewport.get('width')}x{viewport.get('height')}")

    lines.extend(["", "## Details"])
    lines.append(f"- Status: {comment.status.replace('_', ' ')} · Priority: {comment.priority}")
    if comment.tags:
        lines.append(f"- Tags: {', '.join(comment.tags)}")
    if comment.screenshot_url:
        lines.append(f"- Screenshot (link expires): {comment.screenshot_url}")
    for attachment in [*comment.attachments, *(a for r in thread.replies for a in r.attachments)]:
        lines.append(f"- Attachment {attachment.filename}: {attachment.url}")
    if backlink_url:
        lines.append(f"- In Backline: {backlink_url}")

    lines.extend(
        [
            "",
            "## Approach",
            "Find the code that renders this page and element, make the smallest change "
            "that does what the reviewer asked, and keep the rest of the page unchanged. "
            "If the request is ambiguous, say what you assumed.",
        ]
    )
    return "\n".join(lines)


async def generate_implementation_prompt(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    comment_id: str,
    agent: AgentHint,
) -> GeneratePromptResult:
    """The dashboard's copy-paste flow and the MCP tool share this."""
    from app.modules.integrations.service import comment_backlink

    thread = await load_thread(db, workspace_id=workspace_id, ref=comment_id)
    backlink = await comment_backlink(db, workspace_id=workspace_id, comment_id=thread.comment.id)
    prompt = build_implementation_prompt(thread, backlink_url=backlink)
    return GeneratePromptResult(agent=agent, implementation_prompt=prompt)
