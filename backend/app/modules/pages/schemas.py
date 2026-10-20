from datetime import datetime

from pydantic import BaseModel, Field


class PageRegister(BaseModel):
    project_id: str
    url: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=500)


class PageCreate(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=500)


class PageUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    sort_order: int | None = Field(default=None, ge=0, le=10000)


class PageReorder(BaseModel):
    page_ids: list[str] = Field(min_length=1, max_length=500)


class PageOut(BaseModel):
    id: str
    project_id: str
    url_normalized: str
    title: str | None
    sort_order: int = 0
    comment_count: int = 0
    first_seen_at: datetime
    latest_revision_id: str | None


class PageApprovalUpdate(BaseModel):
    approved: bool
    revision_id: str | None = Field(default=None, max_length=64)
    expected_updated_at: datetime | None = None


class PageApprovalOut(BaseModel):
    page_id: str
    approved: bool
    stale: bool
    latest_revision_id: str | None
    approved_revision_id: str | None = None
    updated_at: datetime | None = None
    updated_by_name: str | None = None
