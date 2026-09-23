import re
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlparse

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import ValidationError
from app.core.events import append_event
from app.core.session import Session
from app.modules.auth.repository import UserRepository
from app.modules.comments import events as comment_events
from app.modules.comments.repository import CommentRepository
from app.modules.comments.service import _broadcast_comment_event, _comment_out
from app.modules.dashboard.repository import DashboardRepository, root_pipeline
from app.modules.dashboard.schemas import (
    ActivityListOut,
    ActivityOut,
    DashboardOut,
    ProjectStatsOut,
    SearchResultOut,
    SearchResultsOut,
    TicketCreate,
    TicketFilters,
    TicketListOut,
    TicketOut,
)
from app.modules.projects.service import get_project
from app.modules.workspaces.repository import MembershipRepository


def _page_path(url_normalized: str | None) -> str | None:
    """The path a ticket's page lives at ("/pricing"), for the board and list cards.

    Falls back to the stored URL when it isn't parseable, and never raises: this is a
    label, and a malformed row should not take a whole ticket list down with it.
    """
    if not url_normalized:
        return None
    try:
        return urlparse(url_normalized).path or "/"
    except ValueError:
        return None


async def search(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, query: str, limit: int
) -> SearchResultsOut:
    """Search only documents already constrained to the caller's active workspace.

    Regex search is intentionally bounded until a Mongo/Atlas text-search service is
    selected.  This makes the data exposure rule explicit and keeps the shell useful
    for small workspaces without depending on a provider-specific index.
    """
    needle = re.escape(query.strip())
    if not needle:
        return SearchResultsOut(items=[])
    matcher = {"$regex": needle, "$options": "i"}
    each_limit = min(limit, 20)
    items: list[SearchResultOut] = []
    repo = DashboardRepository(db)

    projects = await repo.search_projects(workspace_id, matcher, each_limit)
    items.extend(
        SearchResultOut(
            kind="project",
            id=str(project["_id"]),
            title=project["name"],
            subtitle=f"{project.get('project_type', 'website').title()} project",
            project_id=str(project["_id"]),
        )
        for project in projects
    )

    pipeline = root_pipeline(workspace_id)
    pipeline.extend(
        [
            {
                "$match": {
                    "$or": [
                        {"body": matcher},
                        {"_project.name": matcher},
                        {"_page.title": matcher},
                    ]
                }
            },
            {"$sort": {"created_at": -1, "_id": -1}},
            {"$limit": each_limit},
        ]
    )
    comments = await repo.search_comments(pipeline, each_limit)
    for comment in comments:
        kind: Literal["ticket", "comment"] = "ticket" if comment.get("is_standalone") else "comment"
        title = comment["body"].strip().replace("\n", " ")[:140] or "Untitled comment"
        items.append(
            SearchResultOut(
                kind=kind,
                id=str(comment["_id"]),
                title=title,
                subtitle=(
                    f"{comment['_project']['name']} · "
                    f"{comment['_page'].get('title') or 'Untitled page'}"
                ),
                project_id=comment["_page"]["project_id"],
                page_id=comment["page_id"],
            )
        )

    users = await repo.search_members(workspace_id, matcher, each_limit)
    items.extend(
        SearchResultOut(
            kind="member",
            id=str(user["_id"]),
            title=user.get("name") or user["email"],
            subtitle=user["email"],
        )
        for user in users
    )
    return SearchResultsOut(items=items[:limit])


async def list_tickets(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    user_id: str,
    filters: TicketFilters,
) -> TicketListOut:
    result = await DashboardRepository(db).tickets(workspace_id, user_id, filters)

    # Batch-resolve author names instead of one UserRepository lookup per ticket
    # (_comment_out's default behavior) - a ticket page can be up to `filters.limit`
    # rows, and this was previously a sequential DB round-trip per row.
    member_ids = list(
        {doc["author_member_id"] for doc in result["items"] if doc["author_type"] == "member"}
    )
    member_docs = await UserRepository(db).find_many_by_ids(member_ids)
    member_name_cache = {
        uid: (member_docs[uid]["name"] if uid in member_docs else "Unknown") for uid in member_ids
    }

    items = []
    for doc in result["items"]:
        comment = await _comment_out(db, doc, member_name_cache=member_name_cache)
        items.append(
            TicketOut(
                **comment.model_dump(),
                project_id=doc["_page"]["project_id"],
                project_name=doc["_project"]["name"],
                page_title=doc["_page"].get("title") or doc["_page"]["url_normalized"],
                page_path=_page_path(doc["_page"].get("url_normalized")),
            )
        )
    return TicketListOut(
        items=items,
        total=result["count"][0]["total"] if result["count"] else 0,
        offset=filters.offset,
        limit=filters.limit,
    )


async def summary(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, user_id: str
) -> DashboardOut:
    result = await DashboardRepository(db).summary(workspace_id, user_id)
    statuses = {row["_id"]: row["count"] for row in result["statuses"]}
    personal = result["personal"][0] if result["personal"] else {}
    project_statuses: dict[str, dict[str, int]] = {}
    for row in result.get("project_statuses", []):
        pid = row["_id"]["project_id"]
        status = row["_id"]["status"]
        if pid not in project_statuses:
            project_statuses[pid] = {}
        project_statuses[pid][status] = row["count"]

    return DashboardOut(
        projects=result["active_projects"],
        archived_projects=result["archived_projects"],
        tickets=sum(statuses.values()),
        statuses=statuses,
        assigned_to_me=personal.get("assigned_to_me", 0),
        needs_reply=personal.get("needs_reply", 0),
        waiting_on_client=personal.get("waiting_on_client", 0),
        overdue=personal.get("overdue", 0),
        project_stats=[
            ProjectStatsOut(
                project_id=row["_id"],
                status_counts=project_statuses.get(row["_id"], {}),
                **{k: v for k, v in row.items() if k != "_id"},
            )
            for row in result["projects"]
        ],
    )


async def activity(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    user_id: str,
    offset: int,
    limit: int,
    event_type: str,
) -> ActivityListOut:
    docs, total = await DashboardRepository(db).activity(
        workspace_id, user_id, offset, limit, event_type
    )
    return ActivityListOut(
        total=total,
        items=[
            ActivityOut(
                id=str(doc["_id"]),
                type=doc["type"],
                actor_type=doc["actor_type"],
                actor_id=doc.get("actor_id"),
                created_at=doc["created_at"],
                project_id=doc["payload_json"].get("project_id"),
                comment_id=doc["payload_json"].get("comment_id"),
                name=doc["payload_json"].get("name"),
            )
            for doc in docs
        ],
    )


async def create_ticket(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    project_id: str,
    actor: Session,
    body: TicketCreate,
) -> TicketOut:
    project = await get_project(db, project_id=project_id, workspace_id=workspace_id)
    if project.archived_at:
        raise ValidationError("Restore this project before adding tickets.")
    if not body.body.strip():
        raise ValidationError("Ticket text is required.")
    assignees = list(dict.fromkeys(body.assignee_ids))
    for user_id in assignees:
        if not await MembershipRepository(db).find(workspace_id=workspace_id, user_id=user_id):
            raise ValidationError("Assignees must belong to this workspace.")
    page = await DashboardRepository(db).standalone_page(workspace_id, project_id)
    doc = await CommentRepository(db).create(
        {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "page_id": str(page["_id"]),
            "parent_id": None,
            "author_type": "member",
            "author_member_id": actor.user_id,
            "author_guest_id": None,
            "layer": "team",
            "body": body.body.strip(),
            "status": body.status,
            "priority": body.priority,
            "tags": list(dict.fromkeys(body.tags)),
            "due_at": body.due_at,
            "assignee_ids": assignees,
            "assignee_id": next(iter(assignees), None),
            "waiting_on_ids": [],
            "waiting_on_client": False,
            "is_standalone": True,
            "anchor": {},
            "recovery_status": "ok",
            "context_json": {},
            "screenshot_key": None,
            "capture_status": "ok",
            "attachments": [],
            "created_at": datetime.now(UTC),
            "edited_at": None,
            "deleted_at": None,
            "ticket_number": await CommentRepository(db).next_ticket_number(workspace_id),
        }
    )
    comment = await _comment_out(db, doc)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=comment_events.COMMENT_CREATED,
        actor_type="member",
        actor_id=actor.user_id,
        payload={"comment_id": comment.id, "project_id": project_id},
    )
    await _broadcast_comment_event(
        event_type="comment.created",
        workspace_id=workspace_id,
        project_id=project_id,
        comment=comment,
    )
    from app.modules.notifications.service import notify_comment_assigned

    for assignee in assignees:
        await notify_comment_assigned(
            db,
            workspace_id=workspace_id,
            project_id=project_id,
            comment_id=comment.id,
            assignee_user_id=assignee,
            actor_user_id=actor.user_id,
        )
    return TicketOut(
        **comment.model_dump(),
        project_id=project_id,
        project_name=project.name,
        page_title="Project tickets",
        page_path=None,
    )
