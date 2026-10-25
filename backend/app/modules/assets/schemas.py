from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.modules.comments.schemas import AttachmentIn, Layer, Tag


class AssetApprovalOut(BaseModel):
    """Sign-off on one file version (TDR-0184). A new version starts without one."""

    approved: bool
    by_type: Literal["member", "guest"]
    by_name: str
    at: datetime
    # Whether the person reading this gave the approval (so they may withdraw it).
    by_you: bool = False


class AssetApprovalUpdate(BaseModel):
    approved: bool


class AssetOut(BaseModel):
    id: str
    project_id: str
    page_id: str
    filename: str
    content_type: str
    size: int
    page_count: int
    width: int | None
    height: int | None
    url: str
    created_at: datetime
    archived_at: datetime | None = None
    revision: int = 0
    # Mobile App projects: which build and device a screenshot came from.
    build_label: str | None = None
    device: str | None = None
    platform: str | None = None
    # File versions (TDR-0165): every version is its own asset with its own pins.
    # `version_group` is the original file's id (None on the original), `version`
    # counts from 1, and `superseded_by` names the upload that replaced this one.
    version_group: str | None = None
    version: int = 1
    superseded_by: str | None = None
    # Only on an upload response: open threads moved onto this new version.
    carried_comments: int | None = None
    approval: AssetApprovalOut | None = None


class AssetUpdate(BaseModel):
    expected_revision: int | None = Field(default=None, ge=0)
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    archived: bool | None = None
    # Empty string clears a value.
    build_label: str | None = Field(default=None, max_length=80)
    device: str | None = Field(default=None, max_length=80)
    platform: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def valid_name(self) -> "AssetUpdate":
        if self.filename is not None:
            self.filename = self.filename.strip()
            if not self.filename or "/" in self.filename or "\\" in self.filename:
                raise ValueError("Use a file display name without folder separators.")
        return self


class Region(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(default=0, ge=0, le=1)
    height: float = Field(default=0, ge=0, le=1)
    page_number: int = Field(default=1, ge=1, le=200)

    @model_validator(mode="after")
    def fits_page(self) -> "Region":
        if self.x + self.width > 1.00001 or self.y + self.height > 1.00001:
            raise ValueError("Region must fit inside the page.")
        return self


class AssetCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    region: Region
    layer: Layer = "client"
    tags: list[Tag] = Field(default_factory=list, max_length=6)
    # Screenshots, files and screen/voice recordings uploaded first through POST /uploads.
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=10)
    client_request_id: str | None = Field(default=None, min_length=1, max_length=64)
