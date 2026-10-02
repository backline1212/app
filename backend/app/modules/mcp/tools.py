"""What each Backline MCP tool does, as plain async functions over (db, actor).

server.py only registers these with FastMCP and resolves the actor from the bearer
token; keeping the logic here means it reads like any other service module and can be
called without an MCP transport. Every function returns Markdown - the agent reads it,
so ids are printed next to every name it may need to pass back."""

from typing import Any, Literal, cast, get_args

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import NotFoundError, PermissionDeniedError, ValidationError
from app.core.rate_limit import check_rate_limit
from app.core.redis_client import get_redis
from app.modules.auth.repository import UserRepository
from app.modules.comments import service as comment_service
from app.modules.comments.schemas import CommentOut, CommentUpdate, Priority, Status
from app.modules.dashboard import service as dashboard_service
from app.modules.dashboard.schemas import TicketFilters
from app.modules.integrations import service as integration_service
from app.modules.mcp.service import (
    McpActor,
    build_implementation_prompt,
    load_thread,
    ticket_label,
)
from app.modules.projects import service as projects_service
from app.modules.workspaces.repository import WorkspaceRepository

StatusFilter = Literal[
    "open", "all", "todo", "in_progress", "in_review", "blocked", "resolved", "wont_fix"
]
_STATUSES: tuple[str, ...] = get_args(Status)
_MAX_REPLY = 10_000


def _first_line(text: str, limit: int = 100) -> str:
    line = next((part.strip() for part in text.splitlines() if part.strip()), "")
    return line if len(line) <= limit else line[: limit - 3].rstrip() + "..."


def _require(actor: McpActor, action: str, what: str) -> None:
    """Writes need both the token's write scope and the member's own role."""
    if not actor.can_write:
        raise PermissionDeniedError(
            f"This token is read-only, so it can't {what}. Create a read & write token in "
            "Backline (Workspace → MCP Server) to allow it."
        )
    if not actor.allows(action):
        raise PermissionDeniedError(f"Your workspace role ({actor.role}) can't {what}.")


async def list_projects(db: AsyncIOMotorDatabase[dict[str, Any]], actor: McpActor) -> str:
    projects = await projects_service.list_projects(db, actor.workspace_id, viewer=actor.session)
    summary = await dashboard_service.summary(
        db, actor.workspace_id, actor.user_id, viewer=actor.session
    )
    stats = {row.project_id: row for row in summary.project_stats}
    workspace = await WorkspaceRepository(db).find_by_id(actor.workspace_id)
    name = workspace["name"] if workspace else "this workspace"
    if not projects:
        return f"No projects in {name} yet."
    lines = [f"# Projects in {name}", ""]
    for project in projects:
        row = stats.get(project.id)
        counts = f"{row.open} open / {row.total} total" if row else "no tickets"
        lines.append(
            f"- **{project.name}** (project_id: `{project.id}`) · {project.project_type} · "
            f"{project.target_origin or 'no URL'} · {counts}"
        )
    lines.extend(["", "Pass a project_id to list_tickets to see one project's tickets."])
    return "\n".join(lines)


async def list_tickets(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    actor: McpActor,
    *,
    project_id: str | None,
    status: StatusFilter,
    priority: Priority | None,
    assigned_to_me: bool,
    search: str,
    limit: int,
    offset: int,
) -> str:
    filters = TicketFilters(
        project_id=project_id or None,
        status=cast(Status, status) if status in _STATUSES else None,
        open_only=status == "open",
        priority=priority,
        view="mine" if assigned_to_me else "all",
        search=search.strip()[:200],
        sort="priority" if status == "open" else "newest",
        limit=max(1, min(limit, 50)),
        offset=max(0, offset),
    )
    result = await dashboard_service.list_tickets(
        db, actor.workspace_id, actor.user_id, filters, viewer=actor.session
    )
    if not result.items:
        return "No tickets match those filters."
    end = filters.offset + len(result.items)
    lines = [f"Tickets {filters.offset + 1}-{end} of {result.total}:", ""]
    for ticket in result.items:
        where = ticket.page_path or ticket.page_title
        lines.append(
            f"- **{ticket_label(ticket)}** [{ticket.status} · {ticket.priority}] "
            f"{ticket.project_name} › {where} — {_first_line(ticket.body)} "
            f"(by {ticket.author_name}; id `{ticket.id}`)"
        )
    if end < result.total:
        lines.extend(["", f"More available: call again with offset={end}."])
    lines.extend(["", 'Use get_ticket with a ticket number (e.g. "#12") for the full thread.'])
    return "\n".join(lines)


async def _member_names(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_ids: list[str]
) -> dict[str, str]:
    if not user_ids:
        return {}
    users = await UserRepository(db).find_many_by_ids(user_ids)
    return {uid: (users[uid].get("name") or users[uid]["email"]) for uid in users}


def _message(comment: CommentOut) -> str:
    visibility = "team only" if comment.layer == "team" else "client visible"
    stamp = comment.created_at.strftime("%Y-%m-%d %H:%M UTC")
    return f"**{comment.author_name}** ({visibility}, {stamp}):\n{comment.body.strip()}"


async def get_ticket(db: AsyncIOMotorDatabase[dict[str, Any]], actor: McpActor, ticket: str) -> str:
    thread = await load_thread(
        db, workspace_id=actor.workspace_id, ref=ticket, viewer=actor.session
    )
    comment = thread.comment
    context = comment.context or {}
    names = await _member_names(db, comment.assignee_ids)
    assignees = ", ".join(names.get(uid, uid) for uid in comment.assignee_ids) or "nobody"
    backlink = await integration_service.comment_backlink(
        db, workspace_id=actor.workspace_id, comment_id=comment.id
    )
    lines = [
        f"# Ticket {ticket_label(comment)}: {_first_line(comment.body, 80)}",
        "",
        f"- id: `{comment.id}`",
        f"- Project: {thread.project_name}"
        + (f" (project_id: `{thread.project_id}`)" if thread.project_id else ""),
        f"- Page: {context.get('url') or 'standalone ticket, no page'}",
        f"- Status: {comment.status} · Priority: {comment.priority}"
        + (f" · Tags: {', '.join(comment.tags)}" if comment.tags else ""),
        f"- Assigned to: {assignees}",
        f"- Waiting on client: {'yes' if comment.waiting_on_client else 'no'}",
        f"- In Backline: {backlink}",
        "",
        "## Thread",
        "",
        _message(comment),
    ]
    for reply in thread.replies:
        lines.extend(["", _message(reply)])
    if comment.screenshot_url:
        lines.extend(["", f"Screenshot (link expires): {comment.screenshot_url}"])

    links = await integration_service.list_comment_links(
        db, comment_id=comment.id, workspace_id=actor.workspace_id
    )
    if links:
        lines.extend(["", "## Filed in trackers"])
        lines.extend(f"- {link.type} {link.external_id}: {link.url}" for link in links)
    trackers = [
        i
        for i in await integration_service.list_integrations(db, actor.workspace_id)
        if i.kind == "tracker" and not i.needs_destination
    ]
    if trackers:
        options = ", ".join(f"{i.type} ({i.destination_label})" for i in trackers)
        lines.extend(["", f"Can be sent with send_ticket_to_tracker to: {options}."])
    return "\n".join(lines)


async def implementation_prompt(
    db: AsyncIOMotorDatabase[dict[str, Any]], actor: McpActor, ticket: str
) -> str:
    thread = await load_thread(
        db, workspace_id=actor.workspace_id, ref=ticket, viewer=actor.session
    )
    backlink = await integration_service.comment_backlink(
        db, workspace_id=actor.workspace_id, comment_id=thread.comment.id
    )
    return build_implementation_prompt(thread, backlink_url=backlink)


async def reply_to_ticket(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    actor: McpActor,
    *,
    ticket: str,
    message: str,
    visibility: Literal["team", "client"],
) -> str:
    _require(actor, "comment:reply", "reply to tickets")
    body = message.strip()
    if not body:
        raise ValidationError("The reply is empty.")
    if len(body) > _MAX_REPLY:
        raise ValidationError(f"Replies are limited to {_MAX_REPLY} characters.")
    # The same bucket the dashboard's reply endpoint uses for this workspace
    # (core/rate_limit.py's actor_rate_limit_key), so an agent can't out-post people.
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:comment-create:workspace:{actor.workspace_id}",
        limit=settings.comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    thread = await load_thread(
        db,
        workspace_id=actor.workspace_id,
        ref=ticket,
        viewer=actor.session,
        action="comment:reply",
    )
    reply = await comment_service.create_reply(
        db,
        parent_id=thread.comment.id,
        actor=actor.session,
        body=body,
        layer=visibility,
    )
    audience = "your team only" if reply.layer == "team" else "the client and your team"
    return f"Replied on {ticket_label(thread.comment)} (visible to {audience}; id `{reply.id}`)."


async def update_ticket(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    actor: McpActor,
    *,
    ticket: str,
    status: Status | None,
    priority: Priority | None,
) -> str:
    _require(actor, "comment:update_status", "change ticket status or priority")
    if status is None and priority is None:
        raise ValidationError("Pass a status, a priority, or both.")
    thread = await load_thread(
        db,
        workspace_id=actor.workspace_id,
        ref=ticket,
        viewer=actor.session,
        action="comment:update_status",
    )
    # Only the fields given: update_comment applies exactly the set fields.
    changes = CommentUpdate.model_validate(
        {key: value for key, value in (("status", status), ("priority", priority)) if value}
    )
    updated = await comment_service.update_comment(
        db,
        comment_id=thread.comment.id,
        workspace_id=actor.workspace_id,
        actor_user_id=actor.user_id,
        body=None,
        status=status,
        assignee_id=None,
        due_at=None,
        changes=changes,
    )
    return (
        f"{ticket_label(updated)} is now {updated.status.replace('_', ' ')} "
        f"with {updated.priority} priority."
    )


async def send_ticket_to_tracker(
    db: AsyncIOMotorDatabase[dict[str, Any]], actor: McpActor, *, ticket: str, tracker: str
) -> str:
    _require(actor, "comment:create_integration_task", "file tickets in trackers")
    wanted = tracker.strip().lower()
    trackers = [
        i
        for i in await integration_service.list_integrations(db, actor.workspace_id)
        if i.kind == "tracker"
    ]
    matches = [i for i in trackers if i.id == tracker.strip() or i.type == wanted]
    if not matches:
        available = ", ".join(f"{i.type} (id {i.id})" for i in trackers) or "none"
        raise NotFoundError(f"No connected tracker {tracker!r}. Connected trackers: {available}.")
    if len(matches) > 1:
        options = ", ".join(f"{i.id} ({i.destination_label or 'no destination'})" for i in matches)
        raise ValidationError(f"Several {wanted} connections - pass one of these ids: {options}.")
    thread = await load_thread(
        db,
        workspace_id=actor.workspace_id,
        ref=ticket,
        viewer=actor.session,
        action="comment:create_integration_task",
    )
    link = await integration_service.send_to_tracker(
        db,
        comment_id=thread.comment.id,
        workspace_id=actor.workspace_id,
        integration_id=matches[0].id,
        actor_user_id=actor.user_id,
    )
    label = ticket_label(thread.comment)
    return f"{label} is filed in {link.type} as {link.external_id}: {link.url}"
