"""Separate a website's security origin from its initial review address."""

from typing import Any
from urllib.parse import urlsplit


def review_origin(url: str) -> str:
    if not url:
        return ""
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError:
        # Bad legacy DNS labels can still be shown and corrected in settings.
        pass
    if ":" in host:
        host = f"[{host}]"
    try:
        port = parsed.port
    except ValueError:
        # Older validation did not access .port. Keep those records readable so
        # their URL can be corrected; new writes reject them in the schema.
        return f"{parsed.scheme.lower()}://{parsed.netloc}"
    if port is not None and (parsed.scheme, port) not in (("https", 443), ("http", 80)):
        host = f"{host}:{port}"
    return f"{parsed.scheme.lower()}://{host}"


def project_start_url(project: dict[str, Any]) -> str:
    """Legacy target_origin may contain the full URL; read it without a backfill."""
    return str(project.get("start_url") or project.get("target_origin") or "")
