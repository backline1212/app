from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_name: str = Field(default="", max_length=200)
    email: EmailStr | None = None
    client_request_id: str | None = Field(default=None, min_length=1, max_length=64)


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None


class ClientStatsOut(BaseModel):
    active_projects_count: int = 0
    open_tickets_count: int = 0
    resolved_tickets_count: int = 0
    total_tickets_count: int = 0
    reviewers_count: int = 0
    last_activity_at: datetime | None = None


class ClientOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    contact_name: str
    email: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    stats: ClientStatsOut | None = None
