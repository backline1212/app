"""Validated, non-secret Railway deployment identifiers."""

import os
import re
from uuid import UUID


def release_sha() -> str | None:
    raw = os.getenv("RAILWAY_GIT_COMMIT_SHA", "").strip().lower()
    return raw if re.fullmatch(r"[0-9a-f]{40}", raw) else None


def deployment_id() -> str | None:
    try:
        return str(UUID(os.getenv("RAILWAY_DEPLOYMENT_ID", "")))
    except ValueError:
        return None
