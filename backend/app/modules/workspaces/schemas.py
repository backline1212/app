import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.email_address import NormalizedEmail
from app.core.text import Trimmed
from app.modules.projects.schemas import ProjectRoleName, ProjectRoleSource, ProjectVisibility

MemberRole = Literal["admin", "member"]

# Room codes (TDR-0056): letters, digits and single hyphens between groups, compared
# case-insensitively. Generated codes look like "K7QM-2XRD-P4WN".
ROOM_CODE_PATTERN = re.compile(r"^[A-Z0-9]+(?:-[A-Z0-9]+)*$")


def normalize_room_code(value: str) -> str:
    """Uppercase, with spaces dropped - so "k7qm 2xrd p4wn" and "K7QM-2XRD-P4WN" pasted
    from a chat both work. Hyphens are kept because a custom code may use them."""
    return re.sub(r"\s+", "", value).upper()


class WorkspaceCreate(BaseModel):
    name: Trimmed = Field(min_length=1, max_length=200)


class WorkspaceUpdate(BaseModel):
    name: Trimmed | None = Field(default=None, min_length=1, max_length=200)
    join_requires_approval: bool | None = None
    members_can_create_projects: bool | None = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    created_at: datetime
    role: str | None = None
    # Only owners and admins see the code itself; it's what lets people in.
    room_code: str | None = None
    room_code_enabled: bool = False
    join_requires_approval: bool = True
    members_can_create_projects: bool = True


class RoomCodeSet(BaseModel):
    """No code generates a random one."""

    code: str | None = Field(default=None, max_length=40)

    @field_validator("code")
    @classmethod
    def clean_code(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        code = normalize_room_code(value)
        if not 6 <= len(code) <= 32 or not ROOM_CODE_PATTERN.fullmatch(code):
            raise ValueError(
                "Use 6-32 letters or numbers. Hyphens can separate groups, like TEAM-2026."
            )
        return code


class MemberOut(BaseModel):
    id: str
    user_id: str
    email: str
    name: str
    avatar_url: str | None = None
    role: str
    created_at: datetime
    # Org chart (TDR-0056).
    title: str | None = None
    team: str | None = None
    manager_user_id: str | None = None
    # Invited by email and hasn't signed in yet.
    invite_pending: bool = False
    joined_via: Literal["created", "invite", "room_code", "join_request"] | None = None


class InviteMemberRequest(BaseModel):
    email: NormalizedEmail
    role: MemberRole = "member"


class MemberRoleUpdateRequest(BaseModel):
    role: MemberRole


class MemberProfileUpdate(BaseModel):
    """Partial. Send `manager_user_id: null` to clear a reporting line; leave a field
    out to keep it."""

    title: Trimmed | None = Field(default=None, max_length=80)
    team: Trimmed | None = Field(default=None, max_length=60)
    manager_user_id: str | None = Field(default=None, max_length=64)


class TransferOwnershipRequest(BaseModel):
    member_id: str = Field(min_length=1, max_length=64)


class JoinRequestOut(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    user_email: str
    user_name: str
    user_avatar_url: str | None = None
    message: str | None = None
    status: Literal["pending", "approved", "rejected", "cancelled"]
    created_at: datetime


class JoinRequestCreate(BaseModel):
    room_code: str = Field(min_length=1, max_length=40)
    message: Trimmed | None = Field(default=None, max_length=280)

    @field_validator("room_code")
    @classmethod
    def clean_code(cls, value: str) -> str:
        return normalize_room_code(value)


class JoinPreviewRequest(BaseModel):
    room_code: str = Field(min_length=1, max_length=40)

    @field_validator("room_code")
    @classmethod
    def clean_code(cls, value: str) -> str:
        return normalize_room_code(value)


JoinStatus = Literal["joined", "pending", "already_member"]


class JoinPreviewOut(BaseModel):
    workspace_id: str
    workspace_name: str
    member_count: int
    requires_approval: bool
    # What submitting the code would do for this person right now.
    status: Literal["can_join", "pending", "already_member"]
    workspace_slug: str | None = None


class JoinRequestResponse(BaseModel):
    status: JoinStatus
    workspace_id: str
    workspace_name: str
    # Set when the caller is (now) a member and can open the workspace.
    workspace_slug: str | None = None


class JoinRequestApprove(BaseModel):
    role: MemberRole = "member"


class MyJoinRequestOut(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str
    status: Literal["pending", "rejected"]
    created_at: datetime
    decided_at: datetime | None = None


class AccessMatrixProjectOut(BaseModel):
    id: str
    name: str
    project_type: str
    visibility: ProjectVisibility
    default_role: ProjectRoleName
    archived: bool
    # user_id -> that person's role on this project (absent = no access).
    roles: dict[str, ProjectRoleName]
    sources: dict[str, ProjectRoleSource]


class AccessMatrixOut(BaseModel):
    """Every project the caller can see, and every member's role on each - the
    Members page's Access tab and the org chart's project lens."""

    projects: list[AccessMatrixProjectOut]
