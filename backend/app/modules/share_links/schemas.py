from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, EmailStr, Field

from app.modules.branding.schemas import PublicBrandingOut

ShareLinkMode = Literal["snippet", "proxy"]


class ShareLinkCreate(BaseModel):
    mode: ShareLinkMode = "snippet"
    passcode: str | None = Field(default=None, min_length=4, max_length=64)
    expires_at: AwareDatetime | None = None
    ask_reviewer_name: bool = True
    domain_restrictions: list[str] = Field(
        default_factory=list,
        max_length=0,
        description="Verified reviewer domains are not available.",
    )
    comment_export_permission: Literal[False] = False


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
    share_link_id: str
    project_type: str = "website"
    # "webapp" / "mobile" review flavour (projects/schemas.py ProjectVariant).
    variant: str | None = None
    # The workspace's client-facing branding (Team+), or null for Backline's own look.
    branding: PublicBrandingOut | None = None
    project_id: str
    project_name: str
    mode: ShareLinkMode
    requires_passcode: bool
    # Milestone 9: the dashboard's ReviewEntryPage redirects a guest to the real site
    # (snippet mode) or Backline's own proxy route (proxy mode) after creating their
    # guest session - it needs the target site's origin to build either destination.
    target_origin: str
    start_url: str | None = None
    # M-02: server-computed policy the entry form uses only for its own UX convenience
    # (show/hide + required attribute on the name field) - the actual requirement is
    # re-enforced server-side in create_guest_session regardless of what the client
    # sends (share_links/policy.py.resolve_guest_display_name).
    ask_reviewer_name: bool = True
    # M-04: lets ReviewEntryPage offer a "View board" option after session creation.
    # The guest-board endpoint independently re-checks this setting server-side
    # regardless of what the client does with this flag (comments/service.py::list_guest_board).
    show_board_to_client: bool = False
    # TDR-0207: how the entry page opens the website - "ask" keeps the sign-in question.
    client_review_mode: Literal["ask", "preview", "extension"] = "ask"
    # Same as ShareLinkOut.preview_origin - the proxy-mode handoff destination.
    preview_origin: str | None = None
    # TDR-0057: the dashboard canvas's own link. It opens only inside the dashboard, for
    # a signed-in member - the entry page says so instead of asking for a name.
    canvas_only: bool = False
    review_url: str


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


class GuestHandoffOut(BaseModel):
    """A one-time code that carries a guest's review session to the website under
    review, so the session token itself never appears in that site's URL (where the
    site's own analytics or logs could record it before the widget removes it)."""

    code: str
    expires_in: int


class GuestHandoffRedeem(BaseModel):
    code: str = Field(min_length=20, max_length=100)


class GuestSessionStatusOut(BaseModel):
    project_id: str
    share_link_id: str
    display_name: str
    member_bound: bool
    review_url: str
    # The author_id this reviewer's own comments carry, so a review surface can offer
    # edit/delete on them. The server still checks authorship on every change.
    guest_session_id: str = ""
    # Whether the project lets this reviewer resolve their own threads (never for a
    # member-bound session, which changes status through the member route).
    reviewer_can_resolve: bool = False


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
