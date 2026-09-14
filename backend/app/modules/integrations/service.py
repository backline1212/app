from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.encryption import encrypt_secret
from app.core.errors import NotFoundError, ValidationError
from app.core.events import append_event
from app.modules.comments.service import get_comment_out
from app.modules.integrations import clickup as clickup_module
from app.modules.integrations.factory import get_integration
from app.modules.integrations.repository import IntegrationRepository
from app.modules.integrations.schemas import (
    ClickUpIntegrationCreate,
    CreateClickUpTaskResult,
    CreateTrelloCardResult,
    IntegrationCreate,
    IntegrationOut,
    SlackIntegrationCreate,
    TrelloIntegrationCreate,
)
from app.modules.pages.repository import PageRepository

# Automatic dispatch (comment.created/comment.status_changed, §17.1's
# on_comment_created/on_status_changed) only applies to integrations that actually do
# something with those hooks - ClickUp/Trello are manual-create-only in MVP (§17.3/§17.4),
# so there's no reason to enqueue a job that's guaranteed to no-op.
AUTOMATIC_DISPATCH_TYPES = ("slack",)

_NON_SECRET_CONFIG_KEYS = {
    "slack": ("notify_status_changes", "notify_team_layer"),
    "trello": ("list_id",),
    "clickup": ("list_id",),
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
        for integration_doc in integrations:
            await pool.enqueue_job(
                "dispatch_integration_event_job",
                integration_id=str(integration_doc["_id"]),
                event_type=event_type,
                comment_id=comment_id,
            )


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


async def create_clickup_task(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    integration_id: str,
    dashboard_base_url: str,
) -> CreateClickUpTaskResult:
    comment = await get_comment_out(db, comment_id)
    if comment is None:
        raise NotFoundError("Comment not found.")

    from app.modules.comments.repository import CommentRepository

    comment_doc = await CommentRepository(db).find_by_id(comment_id)
    if comment_doc is None or comment_doc["workspace_id"] != workspace_id:
        raise NotFoundError("Comment not found.")

    integration_doc = await IntegrationRepository(db).find_by_id(integration_id)
    if integration_doc is None or integration_doc["workspace_id"] != workspace_id:
        raise NotFoundError("Integration not found.")
    if integration_doc["type"] != "clickup":
        raise ValidationError("That integration isn't a ClickUp connection.")

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
    from app.modules.integrations.trello import TrelloIntegration

    comment = await get_comment_out(db, comment_id)
    if comment is None:
        raise NotFoundError("Comment not found.")

    from app.modules.comments.repository import CommentRepository

    comment_doc = await CommentRepository(db).find_by_id(comment_id)
    if comment_doc is None or comment_doc["workspace_id"] != workspace_id:
        raise NotFoundError("Comment not found.")

    integration_doc = await IntegrationRepository(db).find_by_id(integration_id)
    if integration_doc is None or integration_doc["workspace_id"] != workspace_id:
        raise NotFoundError("Integration not found.")
    if integration_doc["type"] != "trello":
        raise ValidationError("That integration isn't a Trello connection.")

    backlink = await _backlink_url(db, base_url=dashboard_base_url, page_id=comment.page_id)
    card_id, card_url = await TrelloIntegration().create_card(
        comment, integration_doc["config_json"], backlink_url=backlink
    )
    return CreateTrelloCardResult(card_id=card_id, card_url=card_url)
