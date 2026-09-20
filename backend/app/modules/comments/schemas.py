from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Layer = Literal["client", "team"]
Status = Literal["todo", "in_progress", "in_review", "blocked", "resolved", "wont_fix"]
Priority = Literal["low", "medium", "high"]
Tag = Literal["Bug", "Copy", "Design", "Responsive", "Content", "Accessibility"]
RecoveryStatus = Literal["ok", "low_confidence", "orphaned", "permanently_orphaned"]


class ClickOffsetPct(BaseModel):
    """Where within the anchored element the reviewer clicked, as a 0-1 fraction of its
    box. A selector path resolves no finer than a whole element, so a comment left on
    one word partway through a paragraph anchors to that entire <p> - this is what lets
    the SDK put the pin back on the clicked word instead of the paragraph's corner."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class RegionBoxPct(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0, le=1)
    height: float = Field(ge=0, le=1)

class DomFingerprintIn(BaseModel):
    """node_hash/ancestor_path_hash use the same hash scheme as a snapshot's NodeRecord
    (09-Snapshot-Engine.md §9.6) - required for modules/anchor_engine to compare an
    anchor against a snapshot's nodes_index at all
    (docs/tdr/0004-anchor-snapshot-shared-hash-scheme.md)."""

    selector_path: str
    tag: str
    attributes: dict[str, str]
    node_hash: str
    ancestor_path_hash: str
    # Optional: comments created before this field existed simply have none, and the SDK
    # falls back to the element's corner. Declared here explicitly because Pydantic
    # drops unknown fields by default - without it the SDK's offset would be silently
    # discarded on the way into the database.
    click_offset_pct: ClickOffsetPct | None = None
    region_box_pct: RegionBoxPct | None = None


class TextFingerprintIn(BaseModel):
    normalized_text: str
    # 64-bit SimHash (hex), for approximate matching when text changes slightly between
    # revisions - exact-string equality can't satisfy the "text edited" recovery case by
    # definition (08-Anchor-Engine.md §8.1, modules/anchor_engine).
    text_similarity_hash: str


class AnchorIn(BaseModel):
    """Tier 1 only in Milestone 4/5 (08-Anchor-Engine.md §8.1/§8.2)."""

    tier: Literal[1]
    type: Literal["point", "region"] = "point"
    dom_fingerprint: DomFingerprintIn
    text_fingerprint: TextFingerprintIn


class ContextIn(BaseModel):
    browser: str
    os: str
    viewport: dict[str, int]
    device_type: str
    url: str


class AttachmentIn(BaseModel):
    """`key` must already exist in the bucket - uploaded client-side via the same
    presigned-PUT flow a screenshot uses (POST /uploads) before the comment/reply is
    created, same pattern as screenshot_key below. `content_type` is carried alongside
    the key rather than re-derived from it (e.g. by extension) since AttachmentOut needs
    it for client-side icon/preview decisions and re-deriving from a file extension is
    one more thing that could drift from what was actually uploaded."""

    key: str
    filename: str = Field(min_length=1, max_length=255)
    content_type: str


class AttachmentOut(BaseModel):
    filename: str
    url: str
    content_type: str


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)
    layer: Layer = "client"
    anchor: AnchorIn
    context: ContextIn
    screenshot_key: str | None = None
    capture_status: Literal["ok", "failed"] = "ok"
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=10)
    # The composer's "Tag this as" picker - same vocabulary and cap as CommentUpdate.tags,
    # just settable at creation time instead of only by a later edit.
    tags: list[Tag] = Field(default_factory=list, max_length=6)
    # M-08 idempotency: optional caller-generated key so a retried POST (flaky mobile
    # network, per 16-Dashboard.md §16.2's device concerns) replays the original
    # comment instead of creating a duplicate. Uniqueness is per-workspace
    # (core/indexes.py's comments_client_request_id), not global, so two different
    # workspaces' guests can't collide on the same client-generated UUID.
    client_request_id: str | None = Field(default=None, min_length=1, max_length=100)


class ReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)
    layer: Layer = "client"
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=10)
    client_request_id: str | None = Field(default=None, min_length=1, max_length=100)
    # M-06/M-15: the composer's mention picker (MentionsInput.tsx) already knows
    # exactly which members it inserted a token for - sent explicitly rather than
    # re-parsed out of `body` server-side, since display names aren't unique or
    # stable (a rename, or two members sharing a name, would misfire a text-match
    # extractor). Each id is validated as a real workspace member before any
    # notification fires; unknown/foreign ids are silently ignored, not an error.
    mentioned_user_ids: list[str] = Field(default_factory=list, max_length=20)


class CommentBodyEdit(BaseModel):
    """Distinct from CommentUpdate below: that's the member-only moderation PATCH (any
    comment, any field); this is just the comment's own author correcting their own
    text via the widget (docs/tdr's "only the comment's own author" scope decision)."""

    body: str = Field(min_length=1, max_length=10_000)


class CommentUpdate(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=10_000)
    status: Status | None = None
    assignee_id: str | None = None
    due_at: datetime | None = None
    priority: Priority | None = None
    tags: list[Tag] | None = Field(default=None, max_length=6)
    assignee_ids: list[str] | None = Field(default=None, max_length=20)
    waiting_on_ids: list[str] | None = Field(default=None, max_length=20)
    waiting_on_client: bool | None = None


class LayerToggleRequest(BaseModel):
    layer: Layer
    confirm: bool


class ReanchorRequest(BaseModel):
    anchor: AnchorIn


class CommentOut(BaseModel):
    id: str
    page_id: str
    parent_id: str | None
    author_type: Literal["member", "guest"]
    author_id: str
    author_name: str
    layer: Layer
    body: str
    status: Status
    assignee_id: str | None
    due_at: datetime | None
    anchor: dict[str, Any]
    recovery_status: RecoveryStatus
    context: dict[str, Any]
    screenshot_url: str | None
    capture_status: Literal["ok", "failed"]
    attachments: list[AttachmentOut]
    created_at: datetime
    edited_at: datetime | None
    priority: Priority = "medium"
    tags: list[Tag] = Field(default_factory=list)
    assignee_ids: list[str] = Field(default_factory=list)
    waiting_on_ids: list[str] = Field(default_factory=list)
    waiting_on_client: bool = False
    is_standalone: bool = False


class GuestBoardItemOut(BaseModel):
    """FD-AUD-042/M-04 'show ticket board to client' - a deliberately client-safe DTO,
    never the staff board payload (CommentOut) with fields hidden in React (M-02's
    explicit requirement). due_at/assignee_names are only ever populated by the service
    when the project's show_board_to_client setting is on; the endpoint itself is
    unreachable at all when it's off, per the prototype's own wording ("Off means
    clients see comments and statuses but not due dates, assignees or the board")."""

    id: str
    body: str
    status: Status
    layer: Literal["client"] = "client"
    created_at: datetime
    due_at: datetime | None = None
    assignee_names: list[str] = Field(default_factory=list)


class GuestBoardOut(BaseModel):
    project_id: str
    items: list[GuestBoardItemOut]
