import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
HOSTNAME = re.compile(r"^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$")


class PublicBrandingOut(BaseModel):
    """What a client sees on a review link: never anything private to the workspace."""

    display_name: str | None = None
    accent_color: str | None = None
    logo_url: str | None = None
    # White-label: hide "Backline" from the client-facing review portal.
    hide_backline_branding: bool = False
    support_email: str | None = None


class BrandingOut(PublicBrandingOut):
    # What the workspace's plan allows; the settings page shows locked controls.
    can_customize: bool = False
    can_white_label: bool = False
    can_use_custom_domain: bool = False
    # The verified domain review links are shared on, when there is one.
    review_domain: str | None = None


class BrandingUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    accent_color: str | None = None
    hide_backline_branding: bool | None = None
    support_email: str | None = Field(default=None, max_length=254)
    remove_logo: bool | None = None

    @field_validator("accent_color")
    @classmethod
    def valid_color(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if not HEX_COLOR.match(value):
            raise ValueError("Use a hex colour like #0A6B4B.")
        return value.upper()

    @field_validator("support_email")
    @classmethod
    def valid_email(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return value
        value = value.strip()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Use a valid support email address.")
        return value


DomainStatus = Literal["pending", "verified", "failed"]


class CustomDomainOut(BaseModel):
    id: str
    host: str
    status: DomainStatus
    # TXT record name/value the workspace adds at its DNS provider.
    txt_name: str
    txt_value: str
    # CNAME target that routes the domain to the review portal.
    cname_target: str
    connected: bool
    last_error: str | None = None
    verified_at: datetime | None = None
    created_at: datetime


class CustomDomainCreate(BaseModel):
    host: str = Field(max_length=253)

    @field_validator("host")
    @classmethod
    def clean_host(cls, value: str) -> str:
        host = value.strip().lower().removeprefix("https://").removeprefix("http://")
        host = host.split("/", 1)[0].rstrip(".")
        if not HOSTNAME.match(host):
            raise ValueError("Use a domain name like review.youragency.com.")
        return host
