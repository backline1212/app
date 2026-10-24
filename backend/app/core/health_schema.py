"""Public, non-secret health response contract."""

from typing import Literal

from pydantic import BaseModel


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    mongo: Literal["ok", "unreachable"]
    redis: Literal["ok", "unreachable"]
    # Railway sets this for GitHub-triggered deployments. A CLI/image deployment
    # may have no source commit, so callers must handle null.
    release_sha: str | None
    # Railway supplies this for every deployment; null outside that platform.
    deployment_id: str | None
