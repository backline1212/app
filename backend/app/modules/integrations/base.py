from typing import Any, Protocol

import httpx

from app.modules.comments.schemas import CommentOut


def http_error_detail(exc: httpx.HTTPError) -> str:
    """`str(exc)` on an `httpx.HTTPStatusError` is just the status line - the
    provider's actual error reason (Atlassian's `invalid_grant`, Asana's validation
    message, ...) lives in the response body, and without this an admin staring at
    "Could not verify this connection" has no way to tell why a real, correctly-typed
    credential is failing."""
    response = getattr(exc, "response", None)
    if response is None:
        return str(exc)
    body = response.text.strip()
    return f"{exc} - {body[:300]}" if body else str(exc)


class IntegrationDeliveryError(Exception):
    """Raised by an Integration implementation when a delivery attempt fails in a way
    worth retrying (17-Notifications-Integrations.md §17.7) - the dispatch job catches
    this specifically and applies the exponential backoff schedule; any other exception
    is a bug, not a delivery failure, and should surface normally."""


class Integration(Protocol):
    """17.1's generic interface - one Protocol every concrete integration implements, so
    adding a new one (Asana, per §17.5) is a new class registered in factory.py, never a
    change to the dispatch path."""

    async def on_comment_created(self, comment: CommentOut, config: dict[str, Any]) -> None: ...

    async def on_status_changed(self, comment: CommentOut, config: dict[str, Any]) -> None: ...

    async def test_connection(self, config: dict[str, Any]) -> bool: ...
