"""Server browser execution requires an operator-provisioned isolated network."""

from app.core.config import get_settings
from app.core.errors import ValidationError

UNAVAILABLE_MESSAGE = (
    "Server screenshots are unavailable in this environment. "
    "Review the website in your browser; an isolated capture worker must be configured first."
)


def require_server_browser() -> None:
    if not get_settings().server_browser_enabled:
        raise ValidationError(UNAVAILABLE_MESSAGE)
