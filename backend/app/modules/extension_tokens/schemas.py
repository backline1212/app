from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.workspaces.schemas import WorkspaceOut


class ExtensionTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ExtensionTokenIssued(BaseModel):
    """Returned exactly once, at creation time - the raw token is never retrievable
    again afterward (ExtensionTokenOut never includes it, matching how a refresh
    token's own opaque value is only ever returned in its issuing response)."""

    id: str
    token: str
    name: str
    created_at: datetime


class ExtensionTokenOut(BaseModel):
    id: str
    name: str
    workspace_id: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class ExtensionWhoAmIOut(BaseModel):
    """Lets the extension's popup learn which workspace a pasted token belongs to.

    Deliberately not under /auth (unlike PATCH /auth/me) - AuthOriginMiddleware only
    allows the dashboard's own origin there, which a chrome-extension:// origin isn't
    on that allowlist for. Works for either an extension token or an ordinary member
    JWT, since both resolve to the same Session shape via get_current_session."""

    user_id: str
    user_email: str
    workspace: WorkspaceOut
