from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.ssrf_guard import is_public_hostname_literal

ProjectType = Literal["website", "image", "pdf"]
Environment = Literal["live", "staging"]


def normalize_origin(value: str) -> str:
    value = value.strip()
    if "://" not in value:
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
    return value.rstrip("/")


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    target_origin: str = Field(default="", max_length=500)
    project_type: ProjectType = "website"
    environment: Environment = "live"
    client_id: str | None = None
    hero_url: str | None = None

    @field_validator("target_origin")
    @classmethod
    def clean_origin(cls, value: str) -> str:
        return normalize_origin(value) if value.strip() else ""

    @model_validator(mode="after")
    def website_requires_origin(self) -> "ProjectCreate":
        if self.project_type == "website" and not self.target_origin:
            raise ValueError("A website project requires a review URL.")
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
    name: str | None = Field(default=None, min_length=1, max_length=200)
    target_origin: str | None = Field(default=None, min_length=1, max_length=500)
    environment: Environment | None = None
    client_id: str | None = None
    hero_url: str | None = None

    @field_validator("target_origin")
    @classmethod
    def clean_origin(cls, value: str | None) -> str | None:
        return normalize_origin(value) if value is not None else None


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


class ProjectSettingsUpdate(BaseModel):
    """Partial update for project review settings — omitted fields are unchanged."""

    capture_device_details: bool | None = None
    reanchor_on_deploy: bool | None = None
    reviewer_can_resolve: bool | None = None
    show_board_to_client: bool | None = None
    client_digest_enabled: bool | None = None
    enable_cross_browser_render: bool | None = None


class ProjectOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    target_origin: str
    created_by: str | None
    settings: ProjectSettingsOut
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    project_type: ProjectType = "website"
    environment: Environment = "live"
    client_id: str | None = None
    hero_url: str | None = None
    duplicated_from_project_id: str | None = None


class ProjectDeletionCounts(BaseModel):
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
    project_name: str = Field(min_length=1, max_length=200)
    acknowledge_permanent_deletion: Literal[True]


class ProjectHardDeleteResult(BaseModel):
    correlation_id: str
    status: Literal["deleted"]
    counts: ProjectDeletionCounts
