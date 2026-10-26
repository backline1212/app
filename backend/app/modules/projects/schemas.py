import re
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.review_url import review_origin
from app.core.ssrf_guard import is_public_hostname_literal
from app.core.text import Trimmed
from app.modules.clients.schemas import ClientCreate

ProjectType = Literal["website", "image", "pdf"]
# A review flavour on top of a project type: a Web App is a website project reviewed
# with reproduction steps and console/network capture; a Mobile App is an image project
# of build/device screenshots. Keeps every website/file review path unchanged.
ProjectVariant = Literal["webapp", "mobile"]
PreviewStatus = Literal["queued", "ready", "failed"]
Environment = Literal["live", "staging"]
# TDR-0056 project-level access. Order matters: each role includes the ones before it.
ProjectRoleName = Literal["viewer", "commenter", "editor", "manager"]
ProjectVisibility = Literal["workspace", "private"]


class ProjectAccessMemberIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    role: ProjectRoleName


class ProjectAccessMemberOut(BaseModel):
    user_id: str
    role: ProjectRoleName


class ProjectAccessOut(BaseModel):
    visibility: ProjectVisibility
    default_role: ProjectRoleName
    members: list[ProjectAccessMemberOut]


class ProjectAccessUpdate(BaseModel):
    """Partial: only the fields sent change."""

    visibility: ProjectVisibility | None = None
    default_role: ProjectRoleName | None = None


class ProjectMemberRoleUpdate(BaseModel):
    role: ProjectRoleName


ProjectRoleSource = Literal["workspace_admin", "explicit", "creator", "default", "none"]


class ProjectPersonOut(BaseModel):
    """One workspace member as this project sees them. `project_role` None means no
    access; `source` says where the role comes from, so the UI can explain it."""

    user_id: str
    member_id: str
    name: str
    email: str
    avatar_url: str | None = None
    workspace_role: str
    title: str | None = None
    project_role: ProjectRoleName | None
    source: ProjectRoleSource


class ProjectAccessDetailOut(BaseModel):
    project_id: str
    visibility: ProjectVisibility
    default_role: ProjectRoleName
    my_role: ProjectRoleName
    people: list[ProjectPersonOut]


def normalize_origin(value: str) -> str:
    """Validate the request's full review URL; services persist its origin separately."""
    value = value.strip()
    if "\\" in value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("Use a review URL without backslashes or control characters.")
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value):
        value = "https://" + value
    parsed = urlsplit(value)
    if (
        parsed.scheme not in ("https", "http")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Use a valid HTTP or HTTPS review URL without credentials.")
    if not is_public_hostname_literal(parsed.hostname):
        raise ValueError("This URL points to a private or internal address, which isn't allowed.")
    # Reject invalid port syntax/ranges on new writes; legacy reads remain possible.
    _ = parsed.port
    if any(char.isspace() for char in parsed.hostname):
        raise ValueError("Use a website hostname without spaces.")
    try:
        parsed.hostname.encode("idna")
    except UnicodeError as exc:
        raise ValueError("Use a valid website hostname.") from exc
    origin = review_origin(value)
    suffix = parsed.path
    if suffix == "/" and not parsed.query and not parsed.fragment:
        suffix = ""
    return (
        origin
        + suffix
        + (f"?{parsed.query}" if parsed.query else "")
        + (f"#{parsed.fragment}" if parsed.fragment else "")
    )


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    target_origin: str = Field(default="", max_length=500)
    project_type: ProjectType = "website"
    variant: ProjectVariant | None = None
    environment: Environment = "live"
    client_id: str | None = None
    new_client: ClientCreate | None = None
    client_request_id: str | None = Field(default=None, min_length=1, max_length=64)
    hero_url: str | None = None
    # Who gets in (TDR-0056). The creator is always added as a manager.
    visibility: ProjectVisibility = "workspace"
    default_role: ProjectRoleName = "editor"
    members: list[ProjectAccessMemberIn] = Field(default_factory=list, max_length=500)

    @field_validator("target_origin")
    @classmethod
    def clean_origin(cls, value: str) -> str:
        return normalize_origin(value) if value.strip() else ""

    @model_validator(mode="after")
    def website_requires_origin(self) -> "ProjectCreate":
        if self.client_id and self.new_client:
            raise ValueError("Choose an existing client or create a new one.")
        if self.project_type == "website" and not self.target_origin:
            raise ValueError("A website project requires a review URL.")
        if self.variant == "webapp" and self.project_type != "website":
            raise ValueError("A Web App project reviews a website URL.")
        if self.variant == "mobile" and self.project_type != "image":
            raise ValueError("A Mobile App project reviews screenshots.")
        if self.project_type != "website":
            self.target_origin = ""
        return self

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Project name is required.")
        return value.strip()


class ProjectResolve(BaseModel):
    """Used by the browser extension's "auto-detect current site" flow: finds an
    existing website project for this origin, or creates one, instead of the caller
    having to know whether a project already exists."""

    target_origin: str = Field(min_length=1, max_length=500)
    name: str | None = Field(default=None, max_length=200)

    @field_validator("target_origin")
    @classmethod
    def clean_origin(cls, value: str) -> str:
        return normalize_origin(value)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None


class ProjectUpdate(BaseModel):
    expected_metadata_version: int | None = Field(default=None, ge=0)
    client_request_id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    target_origin: str | None = Field(default=None, min_length=1, max_length=500)
    environment: Environment | None = None
    client_id: str | None = None
    new_client: ClientCreate | None = None
    hero_url: str | None = None
    settings: "ProjectSettingsUpdate | None" = None

    @field_validator("target_origin")
    @classmethod
    def clean_origin(cls, value: str | None) -> str | None:
        return normalize_origin(value) if value is not None else None

    @model_validator(mode="after")
    def exclusive_client(self) -> "ProjectUpdate":
        if (self.expected_metadata_version is None) != (self.client_request_id is None):
            raise ValueError("Versioned updates require both a metadata version and request ID.")
        if self.client_id and self.new_client:
            raise ValueError("Choose an existing client or create a new one.")
        return self


class ProjectSettingsOut(BaseModel):
    proxy_mode: bool
    snippet_installed: bool
    # FD-AUD-018 — persisted review settings (2026-09-07)
    # All five flags default to False so existing documents without these fields
    # remain readable without a migration (additive backfill strategy per AGENTS.md).
    capture_device_details: bool = False
    reanchor_on_deploy: bool = False
    reviewer_can_resolve: bool = False
    show_board_to_client: bool = False
    client_digest_enabled: bool = False
    # Gates modules/browser_render: real per-engine (Chromium/WebKit/Firefox) headless
    # screenshots are real compute cost per render, so this stays an explicit opt-in
    # like the flags above rather than on by default.
    enable_cross_browser_render: bool = False
    # docs/implementation/slack-ai-mcp-architecture.md §1's project_notification_prefs,
    # folded into the existing settings_json blob instead of a new collection - unlike
    # the flags above, this defaults True (every project's Slack notifications are on
    # unless explicitly muted, matching the pre-existing always-on behavior this flag
    # is retrofitted in front of).
    slack_notifications_enabled: bool = True


class ProjectSettingsUpdate(BaseModel):
    """Partial update for project review settings — omitted fields are unchanged."""

    capture_device_details: bool | None = None
    reanchor_on_deploy: bool | None = None
    reviewer_can_resolve: bool | None = None
    show_board_to_client: bool | None = None
    client_digest_enabled: bool | None = None
    enable_cross_browser_render: bool | None = None
    slack_notifications_enabled: bool | None = None


class FileApprovalSummary(BaseModel):
    """Image/PDF projects: how many current files (latest versions) are signed off."""

    approved: int
    total: int


class ProjectOut(BaseModel):
    metadata_version: int = 0
    id: str
    workspace_id: str
    name: str
    target_origin: str
    # Full initial URL, including a path/query/hash. Legacy rows derive it on read.
    start_url: str | None = None
    created_by: str | None
    settings: ProjectSettingsOut
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    project_type: ProjectType = "website"
    variant: ProjectVariant | None = None
    environment: Environment = "live"
    client_id: str | None = None
    hero_url: str | None = None
    duplicated_from_project_id: str | None = None
    access: ProjectAccessOut
    # The caller's own role on this project. None only where a project is built
    # without a viewer (internal callers); every API response sets it.
    my_role: ProjectRoleName | None = None
    # TDR-0058: a screenshot of the top of a website project's site for its card,
    # captured by the worker. The URL is signed and short-lived, so it changes on every
    # read; `preview_captured_at` is what tells a client the picture itself changed.
    preview_url: str | None = None
    preview_status: PreviewStatus | None = None
    preview_captured_at: datetime | None = None
    # When the capture now queued (or last attempted) was asked for, so a client can
    # stop waiting on one that never ran.
    preview_requested_at: datetime | None = None
    # Project lists only, for file projects with files (TDR-0185).
    file_approval: FileApprovalSummary | None = None


class ProjectDeletionCounts(BaseModel):
    uploads: int = 0
    pages: int = 0
    project_assets: int = 0
    comments: int = 0
    revisions: int = 0
    revision_diffs: int = 0
    recovery_logs: int = 0
    share_links: int = 0
    guest_sessions: int = 0
    notifications: int = 0
    project_integrations: int = 0
    browser_renders: int = 0
    object_keys: int = 0
    retained_audit_events: int = 0
    unsafe_object_references: int = 0


class ProjectHardDeletePreviewOut(BaseModel):
    correlation_id: str
    project_id: str
    project_name: str
    archived: bool
    expires_at: datetime
    counts: ProjectDeletionCounts
    retention_notice: str


class ProjectHardDeleteConfirm(BaseModel):
    correlation_id: str = Field(min_length=36, max_length=36)
    project_name: Trimmed = Field(min_length=1, max_length=200)
    acknowledge_permanent_deletion: Literal[True]


class ProjectHardDeleteResult(BaseModel):
    correlation_id: str
    status: Literal["deleted"]
    counts: ProjectDeletionCounts


class PreviewImageIn(BaseModel):
    """A member's own screenshot of the site's start page, offered as the card picture
    (TDR-0197) - the Backline extension sends it when it opens the site for review."""

    data_url: str = Field(min_length=32, max_length=8_000_000)


class PreviewImageOut(BaseModel):
    used: bool
