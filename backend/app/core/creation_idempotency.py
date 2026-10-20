"""Actor-bound replay validation for newly created tenant records."""

import hashlib
import json
from typing import Any

from app.core.errors import ConflictError

__all__ = ["request_fingerprint", "require_creation_replay"]


def request_fingerprint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


def require_creation_replay(doc: dict[str, Any], *, actor_id: str, fingerprint: str) -> None:
    if (
        doc.get("created_by") != actor_id
        or doc.get("request_fingerprint") != fingerprint
        or doc.get("archived_at") is not None
        or doc.get("hard_delete_status")
    ):
        raise ConflictError("This request ID is already in use. Start a new submission.")
