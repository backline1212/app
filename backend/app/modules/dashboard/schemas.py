from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.comments.schemas import (
    AttachmentIn,
    CommentOut,
    CommentUpdate,
    Priority,
    Status,
    Tag,
)


class TicketFilters(BaseModel):
    comment_id: str | None = None
    search: str = Field(default="", max_length=200)
    status: Status | None = None
    project_id: str | None = None
    priority: Priority | None = None
    tag: Tag | None = None
    assignee: str | None = None
    # "Show work for": any of these people (user ids, or "unassigned"). Takes over from
    # the single `assignee` when given; that one stays for older clients.
    assignees: list[str] = Field(default_factory=list, max_length=50)
    view: Literal["all", "mine", "reply", "client", "overdue"] = "all"
    sort: Literal["newest", "oldest", "due", "priority", "status", "project", "assignee", "tag"] = (
        "newest"
    )
    offset: int = Field(default=0, ge=0, le=100000)
    limit: int = Field(default=50, ge=1, le=100)


class TicketOut(CommentOut):
    project_id: str
    project_name: str
    page_title: str
    # The page's path ("/pricing"), for the compact "Project · /pricing" line the board
    # and list cards show. None for a standalone team ticket, which belongs to no page.
    page_path: str | None = None


class TicketListOut(BaseModel):
    items: list[TicketOut]
    total: int
    # Tickets per assignee (user id, or "unassigned") across the current filters minus
    # the people filter itself - the counts the "Show work for" picker shows.
    assignee_counts: dict[str, int] = Field(default_factory=dict)
    # Same filters, without the people filter: the picker's "All" count.
    total_any_assignee: int = 0
    offset: int
    limit: int


class TicketCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    status: Status = "todo"
    priority: Priority = "medium"
    tags: list[Tag] = Field(default_factory=list, max_length=6)
    assignee_ids: list[str] = Field(default_factory=list, max_length=20)
    due_at: datetime | None = None
    # Optional page/file the ticket is about. The ticket still isn't pinned (no anchor),
    # it's only filed under that page; omitted → the project's hidden "Project tickets"
    # page, same as before.
    page_id: str | None = None
    # Screenshots uploaded beforehand via POST /uploads for this same project.
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=10)


class ProjectStatsOut(BaseModel):
    project_id: str
    total: int
    open: int
    resolved: int
    last_activity_at: datetime | None
    status_counts: dict[str, int] = Field(default_factory=dict)


class DashboardOut(BaseModel):
    projects: int
    archived_projects: int
    tickets: int
    assigned_to_me: int
    needs_reply: int
    waiting_on_client: int
    overdue: int
    statuses: dict[str, int]
    project_stats: list[ProjectStatsOut]


class SearchResultOut(BaseModel):
    """A deliberately small, route-safe projection for the shell search palette."""

    kind: Literal["project", "ticket", "comment", "member"]
    id: str
    title: str
    subtitle: str
    project_id: str | None = None
    page_id: str | None = None


class SearchResultsOut(BaseModel):
    items: list[SearchResultOut]


class ActivityOut(BaseModel):
    id: str
    type: str
    actor_type: str
    actor_id: str | None
    created_at: datetime
    project_id: str | None = None
    comment_id: str | None = None
    name: str | None = None


class ActivityListOut(BaseModel):
    items: list[ActivityOut]
    total: int


# Re-exporting the canonical moderation contract avoids a parallel ticket-update model.
TicketUpdate = CommentUpdate
