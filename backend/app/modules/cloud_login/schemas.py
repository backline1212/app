from pydantic import BaseModel


class CloudLoginSessionOut(BaseModel):
    # The cloud-login-browser service's own websocket URL, ticket embedded - the browser
    # connects to it directly, never through the main API (docs/tdr/0042).
    ws_url: str
    # How long the ticket stays valid for opening that connection - shown in the modal so
    # a member who hesitates sees why it stopped working rather than a bare error.
    ticket_ttl_seconds: int
    # How long the browser session itself runs once started, hard cap regardless of
    # activity - shown as a countdown in the modal.
    session_ttl_seconds: int
