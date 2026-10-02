from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

ShareLinkMode = Literal["snippet", "proxy"]


class ShareLinkCreate(BaseModel):
    mode: ShareLinkMode = "snippet"
    passcode: str | None = Field(default=None, min_length=4, max_length=64)
    expires_at: datetime | None = None
    ask_reviewer_name: bool = True
    domain_restrictions: list[str] = Field(default_factory=list)
    comment_export_permission: bool = False


class ShareLinkOut(BaseModel):
    id: str
    project_id: str
    token: str
    mode: ShareLinkMode
    has_passcode: bool
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    ask_reviewer_name: bool = True
    domain_restrictions: list[str] = Field(default_factory=list)
    comment_export_permission: bool = False
    # docs/tdr/0040: where a proxy-mode link's site is served from (its own origin).
    # Null for snippet links, or when no preview domain is configured - then the legacy
    # `{api}/proxy/{token}/` address applies.
    preview_origin: str | None = None


class ReviewResolveOut(BaseModel):
    project_type: str = "website"
    project_id: str
    project_name: str
    mode: ShareLinkMode
    requires_passcode: bool
    # Milestone 9: the dashboard's ReviewEntryPage redirects a guest to the real site
    # (snippet mode) or Backline's own proxy route (proxy mode) after creating their
    # guest session - it needs the target site's origin to build either destination.
    target_origin: str
    # M-02: server-computed policy the entry form uses only for its own UX convenience
    # (show/hide + required attribute on the name field) - the actual requirement is
    # re-enforced server-side in create_guest_session regardless of what the client
    # sends (share_links/policy.py.resolve_guest_display_name).
    ask_reviewer_name: bool = True
    # M-04: lets ReviewEntryPage offer a "View board" option after session creation.
    # The guest-board endpoint independently re-checks this setting server-side
    # regardless of what the client does with this flag (comments/service.py::list_guest_board).
    show_board_to_client: bool = False
    # Same as ShareLinkOut.preview_origin - the proxy-mode handoff destination.
    preview_origin: str | None = None
    # TDR-0057: the dashboard canvas's own link. It opens only inside the dashboard, for
    # a signed-in member - the entry page says so instead of asking for a name.
    canvas_only: bool = False


class GuestSessionCreate(BaseModel):
    share_token: str
    # M-02: length is validated here; whether a name is *required at all* depends on
    # the share link's ask_reviewer_name policy, which schemas.py can't see (that's a
    # DB-resolved flag, not a request field) - service.create_guest_session enforces
    # "required" server-side against the link's actual policy, never trusting the
    # client to have honored the ask-name prompt.
    display_name: str = Field(default="", max_length=100)
    email: EmailStr | None = None
    passcode: str | None = None


class GuestSessionOut(BaseModel):
    guest_session_token: str
    display_name: str


class CanvasSessionOut(BaseModel):
    """TDR-0057: what the dashboard's review canvas loads with. `token` and
    `preview_origin` address the project's canvas link; `guest_session_token` is the
    widget's session on it, bound to the signed-in member, so every call the widget makes
    is checked against that member's project role."""

    token: str
    preview_origin: str | None = None
    guest_session_token: str
    display_name: str
    # Convenience for the UI only - the API re-checks the member's role on every call.
    can_comment: bool
