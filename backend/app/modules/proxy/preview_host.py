"""Per-share-link preview origins (docs/tdr/0040).

The share token is mixed-case url-safe base64, and hostnames are case-insensitive, so the
token can't be the subdomain as-is. Its base32 encoding can: lowercase letters and digits
only, 26 characters for today's 16-character tokens, and reversible - so no stored field,
no migration, and every existing proxy-mode link gets a preview origin immediately."""

import base64
import binascii
import re

from app.core.config import get_settings

# A DNS label is at most 63 characters; 39 token characters encode to exactly that.
_MAX_TOKEN_LENGTH = 39
# What secrets.token_urlsafe produces; a crafted label decoding to anything else (a `/`
# especially) must never become part of a route path.
_TOKEN_CHARS = re.compile(r"[A-Za-z0-9_-]+")


def preview_domain() -> str:
    settings = get_settings()
    if settings.proxy_preview_domain is None:
        return "preview.localhost:8000" if settings.environment == "local" else ""
    return settings.proxy_preview_domain.strip().lower()


def label_for_token(token: str) -> str | None:
    if not token or len(token) > _MAX_TOKEN_LENGTH:
        return None
    return base64.b32encode(token.encode()).decode().rstrip("=").lower()


def token_for_label(label: str) -> str | None:
    padded = label.upper() + "=" * (-len(label) % 8)
    try:
        token = base64.b32decode(padded).decode()
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    return token if _TOKEN_CHARS.fullmatch(token) else None


def preview_origin_for_token(token: str) -> str | None:
    domain = preview_domain()
    label = label_for_token(token)
    if not domain or label is None:
        return None
    return f"{get_settings().proxy_preview_scheme}://{label}.{domain}"


def is_preview_host(host: str) -> bool:
    domain = preview_domain()
    return bool(domain) and host.strip().lower().endswith(f".{domain}")


def share_token_for_host(host: str) -> str | None:
    """The share token a request's Host header addresses, or None when it isn't a
    well-formed preview host."""
    if not is_preview_host(host):
        return None
    domain = preview_domain()
    label = host.strip().lower()[: -len(domain) - 1]
    if not label or "." in label:
        return None
    return token_for_label(label)


def preview_cookies_can_be_secure() -> bool:
    """`Secure` (and so `SameSite=None`/`Partitioned`, which the cross-site canvas iframe
    needs) only sticks on https - or on localhost, which browsers treat as secure."""
    host = preview_domain().split(":", 1)[0]
    return (
        get_settings().proxy_preview_scheme == "https"
        or host == "localhost"
        or host.endswith(".localhost")
    )
