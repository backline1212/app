import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlencode, urlsplit

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.config import get_settings
from app.core.encryption import encrypt_secret
from app.core.errors import (
    BacklineError,
    ConflictError,
    ExternalServiceError,
    NotFoundError,
    ValidationError,
)
from app.core.events import append_event
from app.modules.comments.repository import CommentRepository
from app.modules.comments.schemas import CommentOut
from app.modules.comments.service import get_comment_out_for_workspace
from app.modules.integrations import asana as asana_module
from app.modules.integrations import clickup as clickup_module
from app.modules.integrations import jira as jira_module
from app.modules.integrations.base import (
    EventContext,
    IntegrationContext,
    IntegrationDeliveryError,
)
from app.modules.integrations.factory import (
    NOTIFIER_TYPES,
    TRACKER_TYPES,
    get_notifier,
    get_tracker,
    test_connection,
)
from app.modules.integrations.repository import IntegrationLinkRepository, IntegrationRepository
from app.modules.integrations.schemas import (
    AsanaIntegrationCreate,
    AuthMode,
    ClickUpIntegrationCreate,
    CreateAsanaTaskResult,
    CreateClickUpTaskResult,
    CreateJiraIssueResult,
    CreateTrelloCardResult,
    DestinationOut,
    DiscordIntegrationCreate,
    ExternalLinkOut,
    GitHubIntegrationCreate,
    GitLabIntegrationCreate,
    IntegrationCreate,
    IntegrationOut,
    IntegrationTestResult,
    IntegrationUpdate,
    JiraIntegrationCreate,
    LinearIntegrationCreate,
    OAuthAppOut,
    SlackIntegrationCreate,
    TeamsIntegrationCreate,
    TrelloIntegrationCreate,
    WebhookIntegrationCreate,
)
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.workspaces.repository import WorkspaceRepository

_NOTIFY_KEYS = ("notify_status_changes", "notify_team_layer", "notify_project_updates")

_NON_SECRET_CONFIG_KEYS: dict[str, tuple[str, ...]] = {
    "slack": _NOTIFY_KEYS,
    "discord": _NOTIFY_KEYS,
    "teams": _NOTIFY_KEYS,
    "webhook": (*_NOTIFY_KEYS, "url_host"),
    "trello": ("list_id",),
    "clickup": ("list_id",),
    "jira": ("project_key", "site_url"),
    "asana": ("project_gid",),
    "github": ("repository",),
    "gitlab": ("project_id", "base_url"),
    "linear": ("team_id",),
}

_DISPLAY_NAME = {
    "slack": "Slack",
    "discord": "Discord",
    "teams": "Microsoft Teams",
    "webhook": "webhook",
    "clickup": "ClickUp",
    "trello": "Trello",
    "jira": "Jira",
    "asana": "Asana",
    "github": "GitHub",
    "gitlab": "GitLab",
    "linear": "Linear",
}


@asynccontextmanager
async def _provider_call(integration_type: str) -> AsyncIterator[None]:
    """A provider answering with something other than what its API documents - an HTML
    error page, an empty body, a field missing - becomes a readable 502 naming the
    provider, instead of a JSON/KeyError 500 (which also skips the CORS headers, so
    the browser only ever saw "Failed to fetch")."""
    try:
        yield
    except BacklineError:
        raise
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise ExternalServiceError(
            f"{_DISPLAY_NAME[integration_type]} sent a response Backline couldn't read. "
            "Try again, or reconnect it."
        ) from exc


async def _passes_test(integration_type: str, ctx: IntegrationContext) -> bool:
    try:
        async with _provider_call(integration_type):
            return await test_connection(integration_type, ctx)
    except ExternalServiceError:
        return False


def _auth_mode(doc: dict[str, Any]) -> AuthMode:
    config = doc["config_json"]
    kind = doc["type"]
    if kind in NOTIFIER_TYPES:
        return "webhook"
    if kind == "clickup":
        return "oauth" if config.get("oauth_token_encrypted") else "api_token"
    if kind == "jira":
        return "api_token" if config.get("api_token_encrypted") else "oauth"
    if kind == "asana":
        return "api_token" if config.get("access_token_encrypted") else "oauth"
    return "api_token"


def _integration_out(doc: dict[str, Any], *, signing_secret: str | None = None) -> IntegrationOut:
    config = doc["config_json"]
    keys = _NON_SECRET_CONFIG_KEYS.get(doc["type"], ())
    summary = {k: config[k] for k in keys if k in config}
    is_tracker = doc["type"] in TRACKER_TYPES
    destination_id: str | None = None
    if is_tracker:
        value = config.get(get_tracker(doc["type"]).destination_key)
        destination_id = str(value) if value else None
    return IntegrationOut(
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        type=doc["type"],
        config_summary=summary,
        connected_by=doc["connected_by"],
        created_at=doc["created_at"],
        kind="tracker" if is_tracker else "notifier",
        auth_mode=_auth_mode(doc),
        destination_id=destination_id,
        destination_label=config.get("destination_label") or destination_id,
        needs_destination=is_tracker and destination_id is None,
        signing_secret=signing_secret,
    )


def _toggles(body: Any) -> dict[str, Any]:
    return {key: getattr(body, key) for key in _NOTIFY_KEYS}


async def _config_for(body: IntegrationCreate) -> tuple[dict[str, Any], str | None]:
    """(config_json, one-time signing secret). Every credential is Fernet-encrypted
    before it reaches Mongo; the destination is optional (picked after connecting)."""
    if isinstance(body, SlackIntegrationCreate | DiscordIntegrationCreate | TeamsIntegrationCreate):
        return {"webhook_url": body.webhook_url, **_toggles(body)}, None
    if isinstance(body, WebhookIntegrationCreate):
        secret = body.secret or f"blwh_{secrets.token_urlsafe(32)}"
        return (
            {
                "url": body.url,
                "url_host": urlsplit(body.url).hostname,
                "signing_secret_encrypted": encrypt_secret(secret),
                **_toggles(body),
            },
            # Returned once when generated here; a caller-supplied secret is theirs
            # already and never echoed back.
            None if body.secret else secret,
        )
    if isinstance(body, TrelloIntegrationCreate):
        config: dict[str, Any] = {
            "api_key_encrypted": encrypt_secret(body.api_key),
            "token_encrypted": encrypt_secret(body.token),
        }
        if body.list_id:
            config["list_id"] = body.list_id
        return config, None
    if isinstance(body, ClickUpIntegrationCreate):
        if body.oauth_code:
            token = await clickup_module.exchange_code_for_token(body.oauth_code)
            config = {"oauth_token_encrypted": encrypt_secret(token)}
        else:
            assert body.api_token is not None
            config = {"api_token_encrypted": encrypt_secret(body.api_token.strip())}
        if body.list_id:
            config["list_id"] = body.list_id
        return config, None
    if isinstance(body, JiraIntegrationCreate):
        if body.oauth_code:
            access_token, refresh_token = await jira_module.exchange_code_for_tokens(
                body.oauth_code
            )
            cloud_id, site_url = await jira_module.fetch_accessible_site(access_token)
            config = {
                "refresh_token_encrypted": encrypt_secret(refresh_token),
                "cloud_id": cloud_id,
                "site_url": site_url,
            }
        else:
            assert body.api_token and body.email and body.site_url
            config = {
                "api_token_encrypted": encrypt_secret(body.api_token.strip()),
                "email": body.email.strip(),
                "site_url": body.site_url,
            }
        if body.project_key:
            config["project_key"] = body.project_key
        return config, None
    if isinstance(body, AsanaIntegrationCreate):
        if body.oauth_code:
            refresh_token = await asana_module.exchange_code_for_refresh_token(body.oauth_code)
            config = {"refresh_token_encrypted": encrypt_secret(refresh_token)}
        else:
            assert body.access_token is not None
            config = {"access_token_encrypted": encrypt_secret(body.access_token.strip())}
        if body.project_gid:
            config["project_gid"] = body.project_gid
        return config, None
    if isinstance(body, GitHubIntegrationCreate):
        config = {"token_encrypted": encrypt_secret(body.token.strip())}
        if body.repository:
            config["repository"] = body.repository
        return config, None
    if isinstance(body, GitLabIntegrationCreate):
        config = {"token_encrypted": encrypt_secret(body.token.strip()), "base_url": body.base_url}
        if body.project_id:
            config["project_id"] = body.project_id
        return config, None
    if isinstance(body, LinearIntegrationCreate):
        config = {"api_key_encrypted": encrypt_secret(body.api_key.strip())}
        if body.team_id:
            config["team_id"] = body.team_id
        return config, None
    raise ValidationError("Unknown integration type.")  # pragma: no cover


async def create_integration(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    actor_user_id: str,
    body: IntegrationCreate,
) -> IntegrationOut:
    config_json, signing_secret = await _config_for(body)

    # Jira OAuth rotates its refresh token during this test - ctx.config (the same dict
    # as config_json) then holds the new one, which is what gets stored below.
    if not await _passes_test(body.type, IntegrationContext(config=config_json)):
        raise ValidationError(
            f"Could not verify this {_DISPLAY_NAME[body.type]} connection - check the "
            "credentials and try again."
        )

    doc = await IntegrationRepository(db).create(
        workspace_id=workspace_id,
        type=body.type,
        config_json=config_json,
        connected_by=actor_user_id,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type="integration.connected",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"integration_id": str(doc["_id"]), "integration_type": body.type},
    )
    return _integration_out(doc, signing_secret=signing_secret)


async def list_integrations(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[IntegrationOut]:
    docs = await IntegrationRepository(db).list_for_workspace(workspace_id)
    return [_integration_out(doc) for doc in docs]


async def _load_integration(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, integration_id: str, workspace_id: str
) -> dict[str, Any]:
    doc = await IntegrationRepository(db).find_by_id(integration_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Integration not found.")
    return doc


def _context_for(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any]
) -> IntegrationContext:
    """A handle whose `persist` writes config_json back (Jira OAuth's rotated refresh
    token) and whose `refetch` re-reads it after a concurrent rotation."""
    repo = IntegrationRepository(db)
    integration_id = str(doc["_id"])
    workspace_id = doc["workspace_id"]

    async def persist(config: dict[str, Any]) -> None:
        await repo.update_config(integration_id, config)

    async def refetch() -> dict[str, Any] | None:
        fresh = await repo.find_by_id(integration_id)
        if fresh is None or fresh["workspace_id"] != workspace_id:
            return None
        return dict(fresh["config_json"])

    return IntegrationContext(config=dict(doc["config_json"]), persist=persist, refetch=refetch)


async def list_destinations(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, integration_id: str, workspace_id: str
) -> list[DestinationOut]:
    doc = await _load_integration(db, integration_id=integration_id, workspace_id=workspace_id)
    if doc["type"] not in TRACKER_TYPES:
        raise ValidationError(f"{_DISPLAY_NAME[doc['type']]} has nothing to choose.")
    async with _provider_call(doc["type"]):
        destinations = await get_tracker(doc["type"]).list_destinations(_context_for(db, doc))
    return [DestinationOut(id=d.id, name=d.name, group=d.group) for d in destinations]


async def update_integration(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    integration_id: str,
    workspace_id: str,
    actor_user_id: str,
    body: IntegrationUpdate,
) -> IntegrationOut:
    doc = await _load_integration(db, integration_id=integration_id, workspace_id=workspace_id)
    ctx = _context_for(db, doc)
    changes = body.model_dump(exclude_none=True)

    toggles = {k: v for k, v in changes.items() if k in _NOTIFY_KEYS}
    if toggles and doc["type"] not in NOTIFIER_TYPES:
        raise ValidationError(
            "Notification settings only apply to Slack, Discord, Teams and webhooks."
        )
    ctx.config.update(toggles)

    if body.destination_id is not None:
        if doc["type"] not in TRACKER_TYPES:
            raise ValidationError(f"{_DISPLAY_NAME[doc['type']]} has no destination to choose.")
        tracker = get_tracker(doc["type"])
        # Only an id this connection can actually reach - the same list the picker
        # showed, so a typo or a revoked board fails here instead of on first send.
        async with _provider_call(doc["type"]):
            destinations = await tracker.list_destinations(ctx)
        chosen = next((d for d in destinations if d.id == body.destination_id), None)
        if chosen is None:
            raise ValidationError(
                f"That destination isn't reachable with this {_DISPLAY_NAME[doc['type']]} "
                "connection."
            )
        ctx.config[tracker.destination_key] = chosen.id
        ctx.config["destination_label"] = (
            f"{chosen.group} › {chosen.name}" if chosen.group else chosen.name
        )
        # Provider extras (Jira's issue type for the project) are replaced, not merged,
        # so a previous project's issue type never sticks to the new one.
        ctx.config.pop("issue_type_id", None)
        ctx.config.update(chosen.extra)

    await ctx.save()
    doc["config_json"] = ctx.config
    await append_event(
        db,
        workspace_id=workspace_id,
        type="integration.updated",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"integration_id": integration_id, "fields": sorted(changes)},
    )
    return _integration_out(doc)


async def test_integration(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, integration_id: str, workspace_id: str
) -> IntegrationTestResult:
    doc = await _load_integration(db, integration_id=integration_id, workspace_id=workspace_id)
    ok = await _passes_test(doc["type"], _context_for(db, doc))
    name = _DISPLAY_NAME[doc["type"]]
    if not ok:
        return IntegrationTestResult(
            ok=False,
            message=f"{name} rejected the connection. Reconnect it with fresh credentials.",
        )
    if doc["type"] in NOTIFIER_TYPES:
        return IntegrationTestResult(ok=True, message=f"Sent a test message to {name}.")
    return IntegrationTestResult(ok=True, message=f"{name} accepted the credentials.")


async def disconnect_integration(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    integration_id: str,
    workspace_id: str,
    actor_id: str,
) -> None:
    repo = IntegrationRepository(db)
    doc = await repo.find_by_id(integration_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Integration not found.")
    await repo.delete(integration_id)
    await append_event(
        db,
        workspace_id=workspace_id,
        type="integration.disconnected",
        actor_type="member",
        actor_id=actor_id,
        payload={"integration_type": doc["type"]},
    )


def oauth_apps() -> list[OAuthAppOut]:
    """The OAuth connect buttons worth showing: only providers whose client id AND
    secret are both configured, with the authorize URL built from the same redirect
    URI the server's code exchange sends (the two must match exactly)."""
    settings = get_settings()
    apps: list[OAuthAppOut] = []
    if settings.clickup_oauth_client_id and settings.clickup_oauth_client_secret:
        query = urlencode(
            {
                "client_id": settings.clickup_oauth_client_id,
                "redirect_uri": settings.clickup_oauth_redirect_uri,
            }
        )
        apps.append(
            OAuthAppOut(type="clickup", authorize_url=f"https://app.clickup.com/api?{query}")
        )
    if settings.jira_oauth_client_id and settings.jira_oauth_client_secret:
        query = urlencode(
            {
                "audience": "api.atlassian.com",
                "client_id": settings.jira_oauth_client_id,
                "scope": "read:jira-work write:jira-work offline_access",
                "redirect_uri": settings.jira_oauth_redirect_uri,
                "response_type": "code",
                "prompt": "consent",
            }
        )
        apps.append(
            OAuthAppOut(type="jira", authorize_url=f"https://auth.atlassian.com/authorize?{query}")
        )
    if settings.asana_oauth_client_id and settings.asana_oauth_client_secret:
        query = urlencode(
            {
                "client_id": settings.asana_oauth_client_id,
                "redirect_uri": settings.asana_oauth_redirect_uri,
                "response_type": "code",
            }
        )
        apps.append(
            OAuthAppOut(
                type="asana", authorize_url=f"https://app.asana.com/-/oauth_authorize?{query}"
            )
        )
    return apps


def _project_notifications_enabled(project_doc: dict[str, Any]) -> bool:
    # docs/implementation/slack-ai-mcp-architecture.md §1's project_notification_prefs,
    # folded into the project's existing settings_json blob - defaults True (on unless
    # explicitly muted). The key predates Discord/Teams/webhooks; it mutes all of them.
    settings_json = project_doc.get("settings_json", {})
    return bool(settings_json.get("slack_notifications_enabled", True))


async def _comment_project_doc(
    db: AsyncIOMotorDatabase[dict[str, Any]], comment_id: str
) -> dict[str, Any] | None:
    comment_doc = await CommentRepository(db).find_by_id(comment_id)
    if comment_doc is None:
        return None
    page = await PageRepository(db).find_by_id(comment_doc["page_id"])
    if page is None:
        return None
    return await ProjectRepository(db).find_by_id(page["project_id"])


async def dispatch_comment_event(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, event_type: str, comment_id: str
) -> None:
    """Called from comments/service.py right after a state change - always enqueues via
    Arq (06-Backend-Architecture.md §6.5), never inline, so a slow/flaky webhook never
    adds latency to the comment-creation/status-change request itself."""
    repo = IntegrationRepository(db)
    targets = [
        doc for doc in await repo.list_for_workspace(workspace_id) if doc["type"] in NOTIFIER_TYPES
    ]
    if not targets:
        return
    # A muted project's comment activity reaches no channel - checked once per event,
    # and only when there's something to dispatch to, so an unconnected workspace
    # never pays this lookup.
    project_doc = await _comment_project_doc(db, comment_id)
    if project_doc is not None and not _project_notifications_enabled(project_doc):
        return
    pool = await get_arq_pool()
    for integration_doc in targets:
        await pool.enqueue_job(
            "dispatch_integration_event_job",
            integration_id=str(integration_doc["_id"]),
            event_type=event_type,
            comment_id=comment_id,
        )


async def dispatch_project_updated_event(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, project_id: str
) -> None:
    """Called from projects/service.py right after a project update commits - always
    enqueues via Arq, never inline, same rule as dispatch_comment_event above: a
    slow/unreachable webhook must never add latency to the PATCH /projects/{id}
    response."""
    pool = await get_arq_pool()
    await pool.enqueue_job(
        "dispatch_project_updated_event_job", workspace_id=workspace_id, project_id=project_id
    )


async def _workspace_slug(db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str) -> str:
    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    return str(workspace["slug"]) if workspace else workspace_id


async def comment_backlink(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, comment_id: str
) -> str:
    """The dashboard URL that opens this ticket: the Tickets page's `?comment=` drawer,
    which works for pinned comments and standalone tickets alike. (Links built before
    this pointed at /p/{project}/board, a route that no longer exists.)"""
    base = get_settings().public_dashboard_base_url.rstrip("/")
    slug = await _workspace_slug(db, workspace_id)
    return f"{base}/w/{slug}/tickets?comment={comment_id}"


async def build_event_context(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, comment: CommentOut
) -> EventContext:
    page = await PageRepository(db).find_by_id(comment.page_id)
    project = await ProjectRepository(db).find_by_id(page["project_id"]) if page else None
    return EventContext(
        project_name=str(project.get("name", "Untitled project")) if project else "Backline",
        # A reply's backlink is its thread: replies have no drawer of their own.
        backlink_url=await comment_backlink(
            db, workspace_id=workspace_id, comment_id=comment.parent_id or comment.id
        ),
    )


async def run_project_updated_dispatch(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, project_id: str
) -> None:
    """The actual "project updated" notification work. Runs from
    dispatch_project_updated_event_job (app/workers/integrations.py), never inline in
    the request path."""
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or not _project_notifications_enabled(project):
        return
    targets = [
        doc
        for doc in await IntegrationRepository(db).list_for_workspace(workspace_id)
        if doc["type"] in NOTIFIER_TYPES
    ]
    if not targets:
        return
    base = get_settings().public_dashboard_base_url.rstrip("/")
    backlink = f"{base}/w/{await _workspace_slug(db, workspace_id)}/p/{project_id}"
    for integration_doc in targets:
        try:
            await get_notifier(integration_doc["type"]).on_project_updated(
                project, integration_doc["config_json"], backlink
            )
        except IntegrationDeliveryError:
            # Best-effort: a failed post here doesn't block the project update itself,
            # which has already committed by the time this runs.
            pass


def _link_out(doc: dict[str, Any]) -> ExternalLinkOut:
    return ExternalLinkOut(
        id=str(doc["_id"]),
        comment_id=doc["comment_id"],
        integration_id=doc["integration_id"],
        type=doc["type"],
        external_id=doc["external_id"],
        url=doc["url"],
        created_by=doc["created_by"],
        created_at=doc["created_at"],
    )


async def _load_comment_for_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, workspace_id: str
) -> CommentOut:
    comment = await get_comment_out_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    if comment is None:
        raise NotFoundError("Comment not found.")
    return comment


async def send_to_tracker(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    actor_user_id: str,
    expected_type: str | None = None,
) -> ExternalLinkOut:
    """File one comment as a ticket in one connected tracker, once. A comment already
    sent to this connection returns the ticket filed the first time."""
    comment = await _load_comment_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    if comment.parent_id:
        raise ValidationError("Send the thread's first comment, not a reply.")
    doc = await _load_integration(db, integration_id=integration_id, workspace_id=workspace_id)
    if expected_type is not None and doc["type"] != expected_type:
        raise ValidationError(
            f"That integration isn't a {_DISPLAY_NAME[expected_type]} connection."
        )
    if doc["type"] not in TRACKER_TYPES:
        raise ValidationError(f"{_DISPLAY_NAME[doc['type']]} can't receive tickets.")
    tracker = get_tracker(doc["type"])
    ctx = _context_for(db, doc)
    if not ctx.config.get(tracker.destination_key):
        raise ValidationError(
            f"Choose where {_DISPLAY_NAME[doc['type']]} tickets go first "
            "(Integrations → Choose destination)."
        )

    links = IntegrationLinkRepository(db)
    link, claimed = await links.claim(
        workspace_id=workspace_id,
        comment_id=comment_id,
        integration_id=integration_id,
        type=doc["type"],
        created_by=actor_user_id,
    )
    if not claimed:
        if link.get("status") == "done":
            return _link_out(link)
        raise ConflictError("This comment is already being sent there. Try again in a moment.")

    try:
        backlink = await comment_backlink(db, workspace_id=workspace_id, comment_id=comment_id)
        async with _provider_call(doc["type"]):
            external_id, url = await tracker.create_item(comment, ctx, backlink_url=backlink)
    except BaseException:
        await links.release(workspace_id=workspace_id, link_id=link["_id"])
        raise

    done = await links.complete(
        workspace_id=workspace_id, link_id=link["_id"], external_id=external_id, url=url
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type="integration.ticket_created",
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "comment_id": comment_id,
            "integration_id": integration_id,
            "integration_type": doc["type"],
            "external_id": external_id,
        },
    )
    return _link_out(done or {**link, "status": "done", "external_id": external_id, "url": url})


async def list_comment_links(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, workspace_id: str
) -> list[ExternalLinkOut]:
    await _load_comment_for_workspace(db, comment_id=comment_id, workspace_id=workspace_id)
    docs = await IntegrationLinkRepository(db).list_for_comment(
        workspace_id=workspace_id, comment_id=comment_id
    )
    return [_link_out(doc) for doc in docs]


# The four original per-provider endpoints, kept for existing callers (the legacy
# Board page, API users). Each is now the unified send with its type pinned.


async def create_clickup_task(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    actor_user_id: str,
) -> CreateClickUpTaskResult:
    link = await send_to_tracker(
        db,
        comment_id=comment_id,
        workspace_id=workspace_id,
        integration_id=integration_id,
        actor_user_id=actor_user_id,
        expected_type="clickup",
    )
    return CreateClickUpTaskResult(task_id=link.external_id, task_url=link.url)


async def create_trello_card(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    actor_user_id: str,
) -> CreateTrelloCardResult:
    link = await send_to_tracker(
        db,
        comment_id=comment_id,
        workspace_id=workspace_id,
        integration_id=integration_id,
        actor_user_id=actor_user_id,
        expected_type="trello",
    )
    return CreateTrelloCardResult(card_id=link.external_id, card_url=link.url)


async def create_jira_issue(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    actor_user_id: str,
) -> CreateJiraIssueResult:
    link = await send_to_tracker(
        db,
        comment_id=comment_id,
        workspace_id=workspace_id,
        integration_id=integration_id,
        actor_user_id=actor_user_id,
        expected_type="jira",
    )
    return CreateJiraIssueResult(issue_key=link.external_id, issue_url=link.url)


async def create_asana_task(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    actor_user_id: str,
) -> CreateAsanaTaskResult:
    link = await send_to_tracker(
        db,
        comment_id=comment_id,
        workspace_id=workspace_id,
        integration_id=integration_id,
        actor_user_id=actor_user_id,
        expected_type="asana",
    )
    return CreateAsanaTaskResult(task_id=link.external_id, task_url=link.url)
