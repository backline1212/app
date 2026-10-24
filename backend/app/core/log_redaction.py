"""Keeps credentials out of the server's access log.

The realtime socket authenticates with `?token=<access JWT>` (browsers can't set
headers on a WebSocket handshake), and uvicorn's access log prints the full request
line - so every connection wrote a live access token into the logs."""

import logging
import re

_SECRET_QUERY = re.compile(
    r"([?&](?:token|access_token|refresh_token|code|key|sig|signature|passcode)=)[^&\s\"']+",
    re.IGNORECASE,
)


def redact_query_secrets(text: str) -> str:
    return _SECRET_QUERY.sub(r"\1[redacted]", text)


class RedactQuerySecretsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = tuple(
                redact_query_secrets(arg) if isinstance(arg, str) else arg
                for arg in (record.args if isinstance(record.args, tuple) else (record.args,))
            )
        if isinstance(record.msg, str):
            record.msg = redact_query_secrets(record.msg)
        return True


def install() -> None:
    for name in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).addFilter(RedactQuerySecretsFilter())
