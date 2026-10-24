"""Server-side scrubbing for the console/network evidence a reviewer attaches to a
comment. The widget and extension already strip query strings and obvious secrets;
this repeats it so an older or third-party client can't store them either."""

import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from app.modules.comments.schemas import DiagnosticsIn

_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # JSON Web Tokens and similar dotted base64url credentials.
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "[token]"),
    # "Bearer abc…" / "Basic abc…" authorization values.
    (re.compile(r"\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE), r"\1 [redacted]"),
    # key=value / "key": "value" pairs whose key names a secret.
    (
        re.compile(
            r"""(["']?\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|apikey|secret|client[_-]?secret|password|passwd|pwd|session(?:[_-]?id)?|auth(?:orization)?|signature|sig|code)\b["']?\s*[:=]\s*["']?)([^"'\s&,;}]+)""",
            re.IGNORECASE,
        ),
        r"\1[redacted]",
    ),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "[email]"),
]


def scrub_text(text: str) -> str:
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def strip_url(url: str) -> str:
    """Keep scheme, host and path only - query strings and fragments routinely carry
    tokens, emails and personal search terms."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return scrub_text(url.split("?", 1)[0].split("#", 1)[0])
    if not parts.scheme and not parts.netloc:
        return scrub_text(parts.path)
    host = parts.netloc.rsplit("@", 1)[-1]
    return scrub_text(urlunsplit((parts.scheme, host, parts.path, "", "")))


def sanitize_diagnostics(diagnostics: DiagnosticsIn | None) -> dict[str, Any] | None:
    if diagnostics is None or (not diagnostics.console and not diagnostics.network):
        return None
    return {
        "console": [
            {"level": entry.level, "message": scrub_text(entry.message), "at": entry.at.isoformat()}
            for entry in diagnostics.console
        ],
        "network": [
            {
                "method": entry.method.upper(),
                "url": strip_url(entry.url),
                "status": entry.status,
                "duration_ms": entry.duration_ms,
                "at": entry.at.isoformat(),
            }
            for entry in diagnostics.network
        ],
    }
