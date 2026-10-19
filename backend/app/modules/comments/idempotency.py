"""Authorize a retry before returning a stored comment, including insert races."""

import hashlib
import json
from typing import Any

from app.core.errors import ConflictError


def request_fingerprint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


def require_matching_replay(existing: dict[str, Any], requested: dict[str, Any]) -> None:
    # Keep the existing workspace-wide unique index. Collisions outside this exact
    # actor/resource/operation fail without disclosing the other stored record.
    fields = (
        "workspace_id",
        "page_id",
        "parent_id",
        "author_type",
        "author_member_id",
        "author_guest_id",
        "layer",
        "request_fingerprint",
    )
    if (
        existing.get("deleted_at") is not None
        or not existing.get("request_fingerprint")
        or any(existing.get(field) != requested.get(field) for field in fields)
    ):
        raise ConflictError("This request ID has already been used. Start a new submission.")
