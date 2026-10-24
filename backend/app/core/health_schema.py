"""Public, non-secret health response contract."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class WorkerHealthOut(BaseModel):
    # A recent heartbeat shows that Arq ran the reporting job; it does not
    # establish that other queued work or external providers succeeded.
    status: Literal["recent", "unknown"]
    release_sha: str | None
    deployment_id: str | None
    reported_at: datetime | None


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    mongo: Literal["ok", "unreachable"]
    redis: Literal["ok", "unreachable"]
    # Railway sets this for GitHub-triggered deployments. A CLI/image deployment
    # may have no source commit, so callers must handle null.
    release_sha: str | None
    # Railway supplies this for every deployment; null outside that platform.
    deployment_id: str | None
    worker: WorkerHealthOut
