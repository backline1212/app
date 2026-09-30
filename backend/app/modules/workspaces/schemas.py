from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.email_address import NormalizedEmail
from app.core.text import Trimmed

MemberRole = Literal["admin", "member"]


class WorkspaceCreate(BaseModel):
    name: Trimmed = Field(min_length=1, max_length=200)


class WorkspaceUpdate(BaseModel):
    name: Trimmed | None = Field(default=None, min_length=1, max_length=200)
    room_code: str | None = Field(default=None, min_length=3, max_length=50)
    join_requires_approval: bool | None = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    created_at: datetime
    role: str | None = None
    room_code: str | None = None
    join_requires_approval: bool = True


class MemberOut(BaseModel):
    id: str
    user_id: str
    email: str
    name: str
    avatar_url: str | None = None
    role: str
    created_at: datetime


class InviteMemberRequest(BaseModel):
    email: NormalizedEmail
    role: MemberRole = "member"


class MemberRoleUpdateRequest(BaseModel):
    role: MemberRole


class JoinRequestOut(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    user_email: str
    user_name: str
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime


class JoinRequestCreate(BaseModel):
    room_code: str


class JoinRequestResponse(BaseModel):
    status: Literal["joined", "pending"]
    workspace_id: str
