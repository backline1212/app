"""The Backline-hosted MCP server (docs/implementation/slack-ai-mcp-architecture.md
§2) - mounted at /mcp in app/main.py as its own Starlette app, separate from the
FastAPI REST surface. A user pastes a personal access token (modules/mcp/router.py)
into their own tool's MCP client config as an `Authorization: Bearer <token>` header;
this server verifies it via BacklineTokenVerifier on every request.

Tools act as the token's owner, inside the token's workspace, bounded by both the
token's scopes (read, or read & write) and the member's current role. The logic lives
in modules/mcp/tools.py; this file only registers it.
"""

from collections.abc import Awaitable
from typing import Annotated, Literal, TypeVar

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl, Field
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import BacklineError
from app.core.rate_limit import check_rate_limit
from app.core.redis_client import get_redis
from app.modules.comments.schemas import Priority, Status
from app.modules.mcp import tools
from app.modules.mcp.service import BacklineTokenVerifier, McpActor, unpack_actor

_INSTRUCTIONS = """\
Backline is where an agency's clients and team leave visual feedback on websites, \
images and PDFs. Each piece of feedback is a ticket with a number like #12.

Typical flow for fixing feedback in this codebase:
1. list_tickets (open tickets, highest priority first) or list_projects to find the project.
2. get_ticket "#12" for the full thread, page URL, pinned element and screenshot.
3. Make the change in code (generate_implementation_prompt gives a ready-made brief).
4. reply_to_ticket with what changed (visibility "team" by default; "client" is seen by \
the client), then update_ticket status "in_review" - or "resolved" if the team asked.

Tickets can also be filed in a connected tracker (Jira, Linear, GitHub...) with \
send_ticket_to_tracker. Write tools need a read & write token."""


def _build_mcp() -> FastMCP:
    settings = get_settings()
    return FastMCP(
        name="Backline",
        instructions=_INSTRUCTIONS,
        token_verifier=BacklineTokenVerifier(),
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(settings.public_api_base_url),
            resource_server_url=None,
        ),
        # Each HTTP request is independent - there's no multi-call session state this
        # server needs to remember between a client's tool calls.
        stateless_http=True,
        # "/" here, not the SDK's own "/mcp" default: main.py mounts the returned
        # Starlette app *at* "/mcp" (app.mount("/mcp", ...)), so the sub-app's own
        # internal route must be root-relative or the reachable path becomes the
        # doubled-up "/mcp/mcp".
        streamable_http_path="/",
    )


mcp = _build_mcp()

_READ = ToolAnnotations(readOnlyHint=True, openWorldHint=False)
T = TypeVar("T")


async def _actor() -> McpActor:
    access_token = get_access_token()
    if access_token is None:
        # RequireAuthMiddleware (mcp.server.auth) already rejects unauthenticated
        # requests before a tool runs - this is unreachable in practice, not the gate.
        raise ToolError("Not authenticated.")
    actor = unpack_actor(access_token.client_id, access_token.scopes)
    settings = get_settings()
    try:
        await check_rate_limit(
            get_redis(),
            key=f"rate-limit:mcp:token:{actor.token_id}",
            limit=settings.mcp_tool_rate_limit_per_minute,
            window_seconds=60,
        )
    except BacklineError as exc:
        raise ToolError(exc.message) from exc
    return actor


async def _run(call: Awaitable[T]) -> T:
    try:
        return await call
    except BacklineError as exc:
        # NotFound/PermissionDenied/Validation/Conflict/ExternalService messages are
        # written for people; the agent gets exactly that text as the tool error.
        raise ToolError(exc.message) from exc


TicketRef = Annotated[
    str,
    Field(
        description='A ticket number like "#12" or "12", a comment id, or a Backline link '
        "containing ?comment=<id>."
    ),
]


@mcp.tool(
    title="List projects",
    annotations=_READ,
)
async def list_projects() -> str:
    """List the workspace's active projects with their ids, URLs and open ticket
    counts."""
    actor = await _actor()
    return await _run(tools.list_projects(get_db(), actor))


@mcp.tool(title="List tickets", annotations=_READ)
async def list_tickets(
    project_id: Annotated[
        str | None, Field(description="Only this project's tickets (see list_projects).")
    ] = None,
    status: Annotated[
        tools.StatusFilter,
        Field(
            description='"open" (default: everything not resolved/won\'t fix), "all", '
            "or one exact status."
        ),
    ] = "open",
    priority: Annotated[Priority | None, Field(description="Only this priority.")] = None,
    assigned_to_me: Annotated[
        bool, Field(description="Only tickets assigned to the token's owner.")
    ] = False,
    search: Annotated[str, Field(description="Text to find in the ticket, project or page.")] = "",
    limit: Annotated[int, Field(ge=1, le=50)] = 20,
    offset: Annotated[int, Field(ge=0)] = 0,
) -> str:
    """List feedback tickets across the workspace - open ones, highest priority first,
    by default. Each line has the ticket number to pass to get_ticket."""
    actor = await _actor()
    return await _run(
        tools.list_tickets(
            get_db(),
            actor,
            project_id=project_id,
            status=status,
            priority=priority,
            assigned_to_me=assigned_to_me,
            search=search,
            limit=limit,
            offset=offset,
        )
    )


@mcp.tool(title="Get ticket", annotations=_READ)
async def get_ticket(ticket: TicketRef) -> str:
    """Everything about one ticket: the full reply thread, page URL, status, priority,
    tags, assignees, screenshot, and any tracker issues it's filed as."""
    actor = await _actor()
    return await _run(tools.get_ticket(get_db(), actor, ticket))


@mcp.tool(title="Generate implementation prompt", annotations=_READ)
async def generate_implementation_prompt(comment_id: TicketRef) -> str:
    """A ready-to-work brief for fixing one ticket: what the reviewer asked for, the
    discussion, the page and pinned element (CSS path), browser/device, screenshot and
    attachments."""
    actor = await _actor()
    return await _run(tools.implementation_prompt(get_db(), actor, comment_id))


@mcp.tool(
    title="Reply to ticket",
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=False, openWorldHint=False),
)
async def reply_to_ticket(
    ticket: TicketRef,
    message: Annotated[str, Field(description="The reply, in plain text.")],
    visibility: Annotated[
        Literal["team", "client"],
        Field(
            description='"team" (default) is seen only by the agency; "client" is also '
            "seen by the client who reviews the site."
        ),
    ] = "team",
) -> str:
    """Post a reply on a ticket's thread as the token's owner - e.g. a summary of the
    fix. Needs a read & write token."""
    actor = await _actor()
    return await _run(
        tools.reply_to_ticket(
            get_db(), actor, ticket=ticket, message=message, visibility=visibility
        )
    )


@mcp.tool(
    title="Update ticket",
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False),
)
async def update_ticket(
    ticket: TicketRef,
    status: Annotated[
        Status | None,
        Field(
            description='New status. Use "in_review" once a fix is ready to check, '
            '"resolved" when done.'
        ),
    ] = None,
    priority: Annotated[Priority | None, Field(description="New priority.")] = None,
) -> str:
    """Change a ticket's status and/or priority. Needs a read & write token."""
    actor = await _actor()
    return await _run(
        tools.update_ticket(get_db(), actor, ticket=ticket, status=status, priority=priority)
    )


@mcp.tool(
    title="Send ticket to tracker",
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=True),
)
async def send_ticket_to_tracker(
    ticket: TicketRef,
    tracker: Annotated[
        str,
        Field(
            description='A connected tracker type ("jira", "linear", "github", "gitlab", '
            '"asana", "clickup", "trello") or an integration id.'
        ),
    ],
) -> str:
    """File a ticket as an issue/task in a tracker connected to the workspace. Sending
    the same ticket to the same tracker again returns the issue filed the first time.
    Needs a read & write token."""
    actor = await _actor()
    return await _run(tools.send_ticket_to_tracker(get_db(), actor, ticket=ticket, tracker=tracker))


@mcp.prompt(title="Fix a Backline ticket")
async def fix_ticket(ticket: TicketRef) -> str:
    """Load a ticket's implementation brief and work on it, reporting back when done."""
    actor = await _actor()
    brief = await _run(tools.implementation_prompt(get_db(), actor, ticket))
    if actor.can_write:
        closing = (
            "When the change is made, call reply_to_ticket on this ticket with a short "
            'summary of what changed (visibility "team"), then update_ticket with status '
            '"in_review".'
        )
    else:
        closing = (
            "When the change is made, summarize what changed so it can be posted on the "
            "ticket (this token is read-only, so you can't reply on it yourself)."
        )
    return f"{brief}\n\n{closing}"


class McpPathMiddleware:
    """Serves the bare `/mcp` - the URL the dashboard hands out - without a redirect.

    The MCP app is mounted at `/mcp`, so Starlette only routes `/mcp/...` to it; a bare
    `/mcp` would otherwise fall through to the proxy's catch-all route. A redirect
    wouldn't do either: behind a TLS-terminating proxy it can point at `http://`, and
    clients drop the Authorization header when following it."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"] == "/mcp":
            scope = {**scope, "path": "/mcp/", "raw_path": b"/mcp/"}
        await self.app(scope, receive, send)
