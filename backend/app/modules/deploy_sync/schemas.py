from datetime import UTC, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.modules.projects.schemas import normalize_origin

DeployUnavailableReason = Literal["inactive_project", "fragment_route", "issuer_access"]


class DeployCredentialRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=0)
    client_request_id: str = Field(min_length=1, max_length=64)


class DeployCredentialRevoke(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)


class DeploySyncOut(BaseModel):
    enabled: bool
    credential_usable: bool
    unavailable_reason: DeployUnavailableReason | None = None
    version: int
    hook_url: str
    start_url: str
    environment: str
    rotated_at: datetime | None = None


class DeployCredentialOut(BaseModel):
    version: int
    signing_secret: str


class DeploymentNotify(BaseModel):
    model_config = ConfigDict(extra="forbid")
    delivery_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
    url: str = Field(min_length=1, max_length=500)
    environment: Literal["live", "staging"]
    deployed_at: AwareDatetime
    commit_ref: str | None = Field(
        default=None, min_length=1, max_length=120, pattern=r"^[A-Za-z0-9._/-]+$"
    )

    @field_validator("url")
    @classmethod
    def clean_url(cls, value: str) -> str:
        return normalize_origin(value)

    @field_validator("deployed_at")
    @classmethod
    def mongo_precision(cls, value: datetime) -> datetime:
        # BSON persists milliseconds. Compare event order at that precision rather
        # than allowing a redelivery within one millisecond to appear newer.
        value = value.astimezone(UTC)
        return value.replace(microsecond=(value.microsecond // 1000) * 1000)


class DeploymentOut(BaseModel):
    id: str
    delivery_id: str
    url: str
    environment: str
    deployed_at: datetime
    received_at: datetime
    commit_ref: str | None = None
    status: Literal["awaiting_review", "captured", "superseded", "cancelled"]
    cancel_reason: Literal["credential_changed", "project_changed"] | None = None
    page_id: str | None = None
    revision_id: str | None = None
    captured_at: datetime | None = None
    recovery_delivery_state: str | None = None


class DeploymentListOut(BaseModel):
    items: list[DeploymentOut]
    next_cursor: str | None = None
