"""Explicit authority boundary for isolated browser-extension credentials."""

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.errors import PermissionDeniedError

_ID = r"[a-fA-F0-9]{24}"
_ROUTES = (
    ("GET", r"/api/v1/extension-tokens/whoami"),
    ("GET", rf"/api/v1/workspaces/{_ID}/projects"),
    ("POST", rf"/api/v1/workspaces/{_ID}/projects/resolve"),
    ("GET", rf"/api/v1/projects/{_ID}(?:/comments|/pages)?"),
    ("POST", r"/api/v1/pages"),
    ("POST", r"/api/v1/uploads(?:/direct)?"),
    ("GET", rf"/api/v1/pages/{_ID}/comments"),
    ("POST", rf"/api/v1/pages/{_ID}/(?:comments|snapshots)"),
    ("POST", rf"/api/v1/comments/{_ID}/replies"),
    ("PATCH", rf"/api/v1/comments/{_ID}(?:/body|/resolve|/reanchor|/layer)?"),
    ("DELETE", rf"/api/v1/comments/{_ID}(?:/thread)?"),
)


def token_expiry(doc: dict[str, Any]) -> datetime:
    expiry: datetime = doc.get("expires_at") or doc["created_at"] + timedelta(days=30)
    return expiry.replace(tzinfo=UTC) if expiry.tzinfo is None else expiry


def require_extension_route(method: str, path: str, *, project_id: str | None) -> None:
    # Project sessions may not discover/create other projects. Every resource-level
    # page/comment/upload call additionally resolves its project via the normal guard.
    if project_id and path.startswith("/api/v1/workspaces/"):
        raise PermissionDeniedError("This browser session is limited to one project.")
    if not any(method == verb and re.fullmatch(pattern, path) for verb, pattern in _ROUTES):
        raise PermissionDeniedError("Open Backline to manage your account or workspace.")
