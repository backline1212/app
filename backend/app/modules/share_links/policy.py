"""M-02: centralized share-link policy enforcement.

`ask_reviewer_name`, `domain_restrictions`, and `comment_export_permission` are stored
on every share_links document (share_links/schemas.py, share_links/repository.py) but
were previously write-only - nothing ever read them back at the points that matter
(guest-session creation, export). This module is the single place those checks live,
per the audit's "centralize check_share_policy()... apply at every relevant operation"
instruction (07-html-parity-audit M-02) - callers must not hand-roll an equivalent
if-check inline (Rule 3, Single Source of Truth, same principle as core/permissions.py).

`reviewer_can_resolve` and `show_board_to_client` are intentionally NOT enforced here:
13-Authentication.md §13.5's permission matrix hardcodes "Change comment status/assignee:
No (never)" for guests, and there is no guest-facing board endpoint in this codebase to
gate at all. Wiring either up would be new product scope requiring its own TDR, not a
policy-enforcement bugfix - see docs/implementation/audit-batch-01-report.md.
"""

from typing import Any
from urllib.parse import urlsplit

from app.core.errors import PermissionDeniedError, ValidationError


def resolve_guest_display_name(link: dict[str, Any], supplied_name: str) -> str:
    """Server-side enforcement of `ask_reviewer_name` (never trust the client to have
    honored the prompt): if the link requires a name, a blank/whitespace-only value is
    rejected outright rather than silently accepted, closing the "guest-session creation
    reportedly accepts empty names even when name should be required" gap. If the link
    does *not* ask for a name, an empty submission is accepted and normalized to a
    stable default so author_name rendering (comments/service.py's
    _resolve_author_name) never shows a blank string."""
    stripped = supplied_name.strip()
    if link.get("ask_reviewer_name", True):
        if not stripped:
            raise ValidationError("A name is required to join this review.")
        return stripped
    return stripped or "Guest"


def check_domain_restriction(link: dict[str, Any], origin: str | None, referer: str | None) -> None:
    """Verifies the request's own Origin/Referer against `domain_restrictions` -
    exactly the "never trust a client-provided origin string alone" instruction: this
    reads the actual request headers the browser sets (not a value the guest-session
    payload could claim to be), the same trust boundary `Request` headers get
    everywhere else in this codebase (rate_limit.get_client_ip, etc.)."""
    restrictions = link.get("domain_restrictions") or []
    if not restrictions:
        return

    candidate = origin or referer
    if not candidate:
        raise PermissionDeniedError("This review link can only be opened from an approved domain.")

    hostname = urlsplit(candidate).hostname or candidate.strip().lower()
    hostname = hostname.lower()

    for allowed in restrictions:
        allowed_host = allowed.strip().lower()
        # str.lstrip("*.") strips any leading run of '*'/'.' characters, not the
        # literal prefix "*." - coincidentally correct for the common single-leading-
        # wildcard case but silently over-strips an operator-entered value that starts
        # with repeated '.'/'*' (e.g. "..foo.com"), weakening the allowlist beyond what
        # was actually configured. A real prefix check instead.
        if allowed_host.startswith("*."):
            allowed_host = allowed_host[2:]
        if not allowed_host:
            continue
        if hostname == allowed_host or hostname.endswith("." + allowed_host):
            return

    raise PermissionDeniedError("This review link can only be opened from an approved domain.")


def check_export_permission(link: dict[str, Any]) -> None:
    """Guarded for whenever a guest-facing export surface is built (none exists yet -
    the only /projects/{id}/export route is member-only, project_service.py). Kept
    here now so that feature lands with enforcement already in place instead of a
    second silent write-only field."""
    if not link.get("comment_export_permission", False):
        raise PermissionDeniedError("Export is not enabled for this review link.")
