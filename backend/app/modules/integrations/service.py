from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.encryption import encrypt_secret
from app.core.errors import NotFoundError, ValidationError
from app.core.events import append_event
from app.modules.comments.repository import CommentRepository
from app.modules.comments.schemas import CommentOut
from app.modules.comments.service import get_comment_out_for_workspace
from app.modules.integrations import asana as asana_module
from app.modules.integrations import clickup as clickup_module
from app.modules.integrations import jira as jira_module
from app.modules.integrations import trello as trello_module
from app.modules.integrations.base import IntegrationDeliveryError
from app.modules.integrations.factory import get_integration
from app.modules.integrations.repository import IntegrationRepository
from app.modules.integrations.schemas import (
    AsanaIntegrationCreate,
    ClickUpIntegrationCreate,
    CreateAsanaTaskResult,
    CreateClickUpTaskResult,
    CreateJiraIssueResult,
    CreateTrelloCardResult,
    IntegrationCreate,
    IntegrationOut,
    JiraIntegrationCreate,
    SlackIntegrationCreate,
    TrelloIntegrationCreate,
)
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository

# Automatic dispatch (comment.created/comment.status_changed, §17.1's
# on_comment_created/on_status_changed) only applies to integrations that actually do
# something with those hooks - ClickUp/Trello/Jira/Asana are manual-create-only in MVP
# (§17.3/§17.4), so there's no reason to enqueue a job that's guaranteed to no-op.
AUTOMATIC_DISPATCH_TYPES = ("slack",)

_NON_SECRET_CONFIG_KEYS = {
    "slack": ("notify_status_changes", "notify_team_layer"),
    "trello": ("list_id",),
    "clickup": ("list_id",),
    "jira": ("project_key", "site_url"),
    "asana": ("project_gid",),
}


def _integration_out(doc: dict[str, Any]) -> IntegrationOut:
    keys = _NON_SECRET_CONFIG_KEYS.get(doc["type"], ())
    summary = {k: doc["config_json"][k] for k in keys if k in doc["config_json"]}
    return IntegrationOut(
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        type=doc["type"],
        config_summary=summary,
        connected_by=doc["connected_by"],
        created_at=doc["created_at"],
    )


async def create_integration(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    actor_user_id: str,
    body: IntegrationCreate,
) -> IntegrationOut:
    if isinstance(body, SlackIntegrationCreate):
        config_json: dict[str, Any] = {
            "webhook_url": body.webhook_url,
            "notify_status_changes": body.notify_status_changes,
            "notify_team_layer": body.notify_team_layer,
        }
    elif isinstance(body, TrelloIntegrationCreate):
        config_json = {
            "api_key_encrypted": encrypt_secret(body.api_key),
            "token_encrypted": encrypt_secret(body.token),
            "list_id": body.list_id,
        }
    elif isinstance(body, ClickUpIntegrationCreate):
        token = await clickup_module.exchange_code_for_token(body.oauth_code)
        config_json = {
            "oauth_token_encrypted": encrypt_secret(token),
            "list_id": body.list_id,
        }
    elif isinstance(body, JiraIntegrationCreate):
        access_token, refresh_token = await jira_module.exchange_code_for_tokens(body.oauth_code)
        cloud_id, site_url = await jira_module.fetch_accessible_site(access_token)
        config_json = {
            "refresh_token_encrypted": encrypt_secret(refresh_token),
            "cloud_id": cloud_id,
            "site_url": site_url,
            "project_key": body.project_key,
        }
    elif isinstance(body, AsanaIntegrationCreate):
        refresh_token = await asana_module.exchange_code_for_refresh_token(body.oauth_code)
        config_json = {
            "refresh_token_encrypted": encrypt_secret(refresh_token),
            "project_gid": body.project_gid,
        }
    else:  # pragma: no cover - the discriminated union covers every case above
        raise ValidationError("Unknown integration type.")

    integration = get_integration(body.type)
    if not await integration.test_connection(config_json):
        raise ValidationError(
            "Could not verify this connection - check the credentials and try again."
        )

    doc = await IntegrationRepository(db).create(
        workspace_id=workspace_id,
        type=body.type,
        config_json=config_json,
        connected_by=actor_user_id,
    )
    return _integration_out(doc)


async def list_integrations(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[IntegrationOut]:
    docs = await IntegrationRepository(db).list_for_workspace(workspace_id)
    return [_integration_out(doc) for doc in docs]


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


def _project_slack_enabled(project_doc: dict[str, Any]) -> bool:
    # docs/implementation/slack-ai-mcp-architecture.md §1's project_notification_prefs,
    # folded into the project's existing settings_json blob (ProjectSettingsOut/
    # ProjectSettingsUpdate) instead of a new collection - defaults True (on unless
    # explicitly muted), matching the pre-existing always-on behavior.
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
    Arq (06-Backend-Architecture.md §6.5), never inline, so a slow/flaky Slack webhook
    never adds latency to the comment-creation/status-change request itself."""
    pool = await get_arq_pool()
    for integration_type in AUTOMATIC_DISPATCH_TYPES:
        integrations = await IntegrationRepository(db).list_for_workspace_by_type(
            workspace_id, integration_type
        )
        if not integrations:
            continue
        # A muted project's comment activity never reaches Slack - checked once per
        # event rather than per-integration, and only when there's at least one
        # integration to dispatch to at all, so an unconnected workspace never pays
        # this lookup.
        if integration_type == "slack":
            project_doc = await _comment_project_doc(db, comment_id)
            if project_doc is not None and not _project_slack_enabled(project_doc):
                continue
        for integration_doc in integrations:
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
    slow/unreachable Slack webhook must never add latency to the PATCH /projects/{id}
    response it would otherwise block (this used to run inline and await the webhook
    POST directly in the request path - up to a 10s httpx timeout per connected Slack
    integration, sequentially, on every project save)."""
    pool = await get_arq_pool()
    await pool.enqueue_job(
        "dispatch_project_updated_event_job", workspace_id=workspace_id, project_id=project_id
    )


async def run_project_updated_dispatch(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, project_id: str
) -> None:
    """The actual "project updated" Slack notification work - the architecture doc
    flagged this event as unwired. Runs from dispatch_project_updated_event_job
    (app/workers/integrations.py), never inline in the request path (see
    dispatch_project_updated_event above)."""
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or not _project_slack_enabled(project):
        return
    integrations = await IntegrationRepository(db).list_for_workspace_by_type(workspace_id, "slack")
    if not integrations:
        return
    from app.modules.integrations.slack import SlackIntegration

    slack = SlackIntegration()
    for integration_doc in integrations:
        try:
            await slack.on_project_updated(project, integration_doc["config_json"])
        except IntegrationDeliveryError:
            # Best-effort, matching every other automatic (non-retry-job) notification
            # path in this module - a failed post here doesn't block the project update
            # itself, which has already committed by the time this runs.
            pass


async def _backlink_url(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, base_url: str, page_id: str
) -> str:
    """There's no per-comment deep-link view yet (the page-detail thread view in
    05-Frontend-Architecture.md §5.2 hasn't been built by any milestone) - this points
    at the comment's project Board, the real, existing surface closest to "the comment's
    pin in Backline" that §17.3 asks for, rather than linking somewhere that doesn't
    exist."""
    page = await PageRepository(db).find_by_id(page_id)
    project_id = page["project_id"] if page else "unknown"
    return f"{base_url}/p/{project_id}/board"


async def _load_comment_for_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, workspace_id: str
) -> CommentOut:
    comment = await get_comment_out_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    if comment is None:
        raise NotFoundError("Comment not found.")
    return comment


_TYPE_DISPLAY_NAME = {
    "clickup": "a ClickUp",
    "trello": "a Trello",
    "jira": "a Jira",
    "asana": "an Asana",
}


async def _load_integration_for_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    integration_id: str,
    workspace_id: str,
    expected_type: str,
) -> dict[str, Any]:
    integration_doc = await IntegrationRepository(db).find_by_id(integration_id)
    if integration_doc is None or integration_doc["workspace_id"] != workspace_id:
        raise NotFoundError("Integration not found.")
    if integration_doc["type"] != expected_type:
        display = _TYPE_DISPLAY_NAME[expected_type]
        raise ValidationError(f"That integration isn't {display} connection.")
    return integration_doc


async def create_clickup_task(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    dashboard_base_url: str,
) -> CreateClickUpTaskResult:
    comment = await _load_comment_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    integration_doc = await _load_integration_for_workspace(
        db, integration_id=integration_id, workspace_id=workspace_id, expected_type="clickup"
    )

    backlink = await _backlink_url(db, base_url=dashboard_base_url, page_id=comment.page_id)
    task_id, task_url = await clickup_module.ClickUpIntegration().create_task(
        comment, integration_doc["config_json"], backlink_url=backlink
    )
    return CreateClickUpTaskResult(task_id=task_id, task_url=task_url)


async def create_trello_card(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    dashboard_base_url: str,
) -> CreateTrelloCardResult:
    comment = await _load_comment_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    integration_doc = await _load_integration_for_workspace(
        db, integration_id=integration_id, workspace_id=workspace_id, expected_type="trello"
    )

    backlink = await _backlink_url(db, base_url=dashboard_base_url, page_id=comment.page_id)
    card_id, card_url = await trello_module.TrelloIntegration().create_card(
        comment, integration_doc["config_json"], backlink_url=backlink
    )
    return CreateTrelloCardResult(card_id=card_id, card_url=card_url)


async def create_jira_issue(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    dashboard_base_url: str,
) -> CreateJiraIssueResult:
    comment = await _load_comment_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    integration_doc = await _load_integration_for_workspace(
        db, integration_id=integration_id, workspace_id=workspace_id, expected_type="jira"
    )

    repo = IntegrationRepository(db)
    config = dict(integration_doc["config_json"])

    async def persist_rotated_token(new_refresh_token_encrypted: str) -> None:
        config["refresh_token_encrypted"] = new_refresh_token_encrypted
        await repo.update_config(integration_id, config)

    async def refetch_config() -> dict[str, Any] | None:
        fresh_doc = await repo.find_by_id(integration_id)
        if fresh_doc is None or fresh_doc["workspace_id"] != workspace_id:
            return None
        return dict(fresh_doc["config_json"])

    backlink = await _backlink_url(db, base_url=dashboard_base_url, page_id=comment.page_id)
    issue_key, issue_url = await jira_module.JiraIntegration().create_issue(
        comment,
        config,
        backlink_url=backlink,
        on_rotate=persist_rotated_token,
        refetch_config=refetch_config,
    )
    return CreateJiraIssueResult(issue_key=issue_key, issue_url=issue_url)


async def create_asana_task(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    dashboard_base_url: str,
) -> CreateAsanaTaskResult:
    comment = await _load_comment_for_workspace(
        db, comment_id=comment_id, workspace_id=workspace_id
    )
    integration_doc = await _load_integration_for_workspace(
        db, integration_id=integration_id, workspace_id=workspace_id, expected_type="asana"
    )

    backlink = await _backlink_url(db, base_url=dashboard_base_url, page_id=comment.page_id)
    task_id, task_url = await asana_module.AsanaIntegration().create_task(
        comment, integration_doc["config_json"], backlink_url=backlink
    )
    return CreateAsanaTaskResult(task_id=task_id, task_url=task_url)
