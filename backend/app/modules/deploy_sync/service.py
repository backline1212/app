import hashlib
import hmac
import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.encryption import decrypt_secret, encrypt_secret
from app.core.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.core.events import append_event
from app.core.permissions import project_role_allows
from app.core.project_access import check_project_action, effective_project_role
from app.core.rate_limit import check_rate_limit
from app.core.redis_client import get_redis
from app.core.review_url import project_start_url
from app.core.session import Session, require_workspace_context
from app.modules.billing.limits import run_plan_change
from app.modules.deploy_sync.repository import DeploySyncRepository
from app.modules.deploy_sync.schemas import (
    DeployCredentialOut,
    DeployCredentialRequest,
    DeploymentListOut,
    DeploymentNotify,
    DeploymentOut,
    DeploySyncOut,
    DeployUnavailableReason,
)
from app.modules.pages.url_normalize import has_routing_fragment, normalize_url
from app.modules.workspaces.repository import MembershipRepository


def _active(project: dict[str, Any]) -> bool:
    return not project.get("archived_at") and not project.get("hard_delete_status")


def _address(url: str) -> str:
    return normalize_url(url)


def _unsupported_fragment(url: str) -> bool:
    return bool(urlsplit(url).fragment) and not has_routing_fragment(url)


async def _issuer_allowed(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    project: dict[str, Any],
    issuer: str,
    *,
    session: AsyncIOMotorClientSession | None = None,
) -> bool:
    member = await MembershipRepository(db).find(
        workspace_id=project["workspace_id"], user_id=issuer, session=session
    )
    role = effective_project_role(
        project, user_id=issuer, workspace_role=member["role"] if member else None
    )
    return project_role_allows("project:update", role)


async def _member_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    actor: Session,
    project_id: str,
    action: str,
    *,
    session: AsyncIOMotorClientSession | None = None,
) -> dict[str, Any]:
    workspace_id = require_workspace_context(actor)
    project = await DeploySyncRepository(db).project(workspace_id, project_id, session=session)
    if project is None:
        raise NotFoundError("Project not found.")
    member = await MembershipRepository(db).find(
        workspace_id=workspace_id, user_id=actor.user_id, session=session
    )
    if member is None or member["role"] != actor.role:
        raise PermissionDeniedError("Workspace access changed. Reopen the workspace.")
    check_project_action(project, actor, action)
    return project


async def settings(
    db: AsyncIOMotorDatabase[dict[str, Any]], actor: Session, project_id: str
) -> DeploySyncOut:
    project = await _member_project(db, actor, project_id, "project:view")
    config = project.get("deploy_sync") or {}
    enabled = bool(config.get("enabled"))
    unavailable_reason: DeployUnavailableReason | None = None
    if enabled:
        if not _active(project) or project.get("project_type", "website") != "website":
            unavailable_reason = "inactive_project"
        elif _unsupported_fragment(project_start_url(project)):
            unavailable_reason = "fragment_route"
        elif not await _issuer_allowed(db, project, config["issued_by"]):
            unavailable_reason = "issuer_access"
    return DeploySyncOut(
        enabled=enabled,
        credential_usable=enabled and unavailable_reason is None,
        unavailable_reason=unavailable_reason,
        version=int(config.get("version", 0)),
        hook_url=f"{get_settings().public_api_base_url.rstrip('/')}/api/v1/deploy-hooks/{project['workspace_id']}/{project_id}",
        start_url=project_start_url(project),
        environment=project.get("environment", "live"),
        rotated_at=config.get("rotated_at"),
        hash_routes_supported=True,
    )


async def create_credential(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    actor: Session,
    project_id: str,
    body: DeployCredentialRequest,
) -> DeployCredentialOut:
    workspace_id = require_workspace_context(actor)
    secret = secrets.token_urlsafe(48)
    encrypted = encrypt_secret(secret)
    repo = DeploySyncRepository(db)

    async def commit(session: AsyncIOMotorClientSession) -> DeployCredentialOut:
        project = await _member_project(db, actor, project_id, "project:update", session=session)
        if not _active(project) or project.get("project_type", "website") != "website":
            raise ValidationError("Deploy sync requires an active website project.")
        if _unsupported_fragment(project_start_url(project)):
            raise ValidationError(
                "Deploy capture supports path routes and #/ or #!/ routes. "
                "Website review remains available."
            )
        config = project.get("deploy_sync") or {}
        if config.get("request_id") == body.client_request_id:
            if (
                config.get("issued_by") != actor.user_id
                or config.get("previous_version") != body.expected_version
                or not config.get("enabled")
            ):
                raise ConflictError(
                    "This credential request was replaced. Refresh Deploy sync before continuing."
                )
            return DeployCredentialOut(
                version=config["version"], signing_secret=decrypt_secret(config["secret_encrypted"])
            )
        if config.get("version", 0) != body.expected_version:
            raise ConflictError("Deploy sync changed. Refresh its settings before continuing.")
        config = {
            "version": body.expected_version + 1,
            "previous_version": body.expected_version,
            "enabled": True,
            "issued_by": actor.user_id,
            "secret_encrypted": encrypted,
            "request_id": body.client_request_id,
            "rotated_at": datetime.now(UTC),
        }
        await repo.cancel_waiting(workspace_id, project_id, session=session)
        await repo.set_config(workspace_id, project_id, config, session=session)
        await append_event(
            db,
            workspace_id=workspace_id,
            type="deploy_sync.credential_rotated",
            actor_type="member",
            actor_id=actor.user_id,
            payload={"project_id": project_id, "credential_version": config["version"]},
            session=session,
        )
        return DeployCredentialOut(version=config["version"], signing_secret=secret)

    return await run_plan_change(db, workspace_id, commit)


async def cancel_for_project_change(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    current: dict[str, Any],
    next_state: dict[str, Any],
    *,
    session: AsyncIOMotorClientSession,
) -> None:
    if not current.get("deploy_sync"):
        return
    if project_start_url(current) == project_start_url(next_state) and current.get(
        "environment", "live"
    ) == next_state.get("environment", "live"):
        return
    repo = DeploySyncRepository(db)
    workspace_id, project_id = current["workspace_id"], str(current["_id"])
    await repo.cancel_waiting(workspace_id, project_id, reason="project_changed", session=session)
    config = {
        key: value
        for key, value in current["deploy_sync"].items()
        if key not in ("latest_id", "latest_deployed_at")
    }
    await repo.set_config(workspace_id, project_id, config, session=session)


async def revoke_credential(
    db: AsyncIOMotorDatabase[dict[str, Any]], actor: Session, project_id: str, expected_version: int
) -> None:
    workspace_id = require_workspace_context(actor)
    repo = DeploySyncRepository(db)

    async def commit(session: AsyncIOMotorClientSession) -> None:
        project = await _member_project(db, actor, project_id, "project:update", session=session)
        config = project.get("deploy_sync") or {}
        if not config.get("enabled") and config.get("version") == expected_version + 1:
            return
        if config.get("version", 0) != expected_version:
            raise ConflictError("Deploy sync changed. Refresh its settings before continuing.")
        await repo.cancel_waiting(workspace_id, project_id, session=session)
        await repo.set_config(
            workspace_id,
            project_id,
            {"enabled": False, "version": expected_version + 1, "rotated_at": datetime.now(UTC)},
            session=session,
        )
        await append_event(
            db,
            workspace_id=workspace_id,
            type="deploy_sync.credential_revoked",
            actor_type="member",
            actor_id=actor.user_id,
            payload={"project_id": project_id},
            session=session,
        )

    await run_plan_change(db, workspace_id, commit)


def verify_signature(
    project: dict[str, Any] | None, raw: bytes, timestamp: str, signature: str
) -> None:
    config = (project or {}).get("deploy_sync") or {}
    valid_timestamp = timestamp.isascii() and timestamp.isdigit() and len(timestamp) <= 11
    valid_signature = len(signature) == 64 and all(char in "0123456789abcdef" for char in signature)
    if (
        not project
        or not _active(project)
        or not config.get("enabled")
        or not valid_timestamp
        or not valid_signature
        or abs(time.time() - int(timestamp)) > 300
    ):
        raise AuthenticationError("Invalid or expired deployment signature.")
    expected = hmac.new(
        decrypt_secret(config["secret_encrypted"]).encode(),
        timestamp.encode() + b"." + raw,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise AuthenticationError("Invalid or expired deployment signature.")


def _out(doc: dict[str, Any], recovery: dict[str, str] | None = None) -> DeploymentOut:
    return DeploymentOut(
        id=doc["_id"],
        **{
            key: value
            for key, value in doc.items()
            if key in DeploymentOut.model_fields and key not in ("id", "recovery_delivery_state")
        },
        recovery_delivery_state=(recovery or {}).get(doc.get("revision_id", "")),
    )


async def notify(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    body: DeploymentNotify,
    raw: bytes,
    timestamp: str,
    signature: str,
) -> DeploymentOut:
    repo = DeploySyncRepository(db)
    # Authenticate before the transaction so an invalid caller cannot contend on a
    # tenant's workspace write lock. Recheck inside to serialize rotation/revocation.
    project = await repo.project(workspace_id, project_id)
    verify_signature(project, raw, timestamp, signature)
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:deploy-hook:workspace:{workspace_id}",
        limit=60,
        window_seconds=60,
    )
    deployment_id = hashlib.sha256(
        f"{workspace_id}:{project_id}:{body.delivery_id}".encode()
    ).hexdigest()
    fingerprint = hashlib.sha256(raw).hexdigest()
    received_at = datetime.now(UTC)
    if body.deployed_at > received_at + timedelta(
        minutes=5
    ) or body.deployed_at < received_at - timedelta(days=7):
        raise ValidationError("Use the actual deployment time within the last seven days.")

    async def commit(session: AsyncIOMotorClientSession) -> DeploymentOut:
        project = await repo.project(workspace_id, project_id, session=session)
        verify_signature(project, raw, timestamp, signature)
        assert project is not None
        config = project["deploy_sync"]
        if not await _issuer_allowed(db, project, config["issued_by"], session=session):
            raise AuthenticationError(
                "A current project manager must replace the deployment credential."
            )
        if (
            body.environment != project.get("environment", "live")
            or _address(body.url) != _address(project_start_url(project))
            or _unsupported_fragment(body.url)
        ):
            raise ValidationError(
                "The deployment must name this project's configured starting URL and environment."
            )
        previous = await repo.find(workspace_id, project_id, deployment_id, session=session)
        if previous:
            if previous["request_fingerprint"] != fingerprint:
                raise ConflictError(
                    "This deployment delivery ID already names different content. "
                    "Reuse the original body for retries."
                )
            return _out(previous)
        newest_at = config.get("latest_deployed_at")
        is_latest = newest_at is None or body.deployed_at > newest_at
        doc = {
            "_id": deployment_id,
            "workspace_id": workspace_id,
            "project_id": project_id,
            **body.model_dump(),
            "request_fingerprint": fingerprint,
            "credential_version": config["version"],
            "received_at": received_at,
            "status": "awaiting_review" if is_latest else "superseded",
        }
        if is_latest:
            await repo.cancel_waiting(
                workspace_id, project_id, status="superseded", session=session
            )
            await repo.set_config(
                workspace_id,
                project_id,
                {**config, "latest_id": deployment_id, "latest_deployed_at": body.deployed_at},
                session=session,
            )
        await repo.create(doc, session=session)
        await append_event(
            db,
            workspace_id=workspace_id,
            type="deployment.received",
            actor_type="system",
            actor_id=None,
            payload={"project_id": project_id, "deployment_id": deployment_id},
            session=session,
        )
        return _out(doc)

    return await run_plan_change(db, workspace_id, commit)


async def history(
    db: AsyncIOMotorDatabase[dict[str, Any]], actor: Session, project_id: str, cursor: str | None
) -> DeploymentListOut:
    await _member_project(db, actor, project_id, "project:view")
    workspace_id = require_workspace_context(actor)
    repo = DeploySyncRepository(db)
    rows = await repo.list_history(workspace_id, project_id, cursor)
    recovery = await repo.recovery_states(
        workspace_id, [row["revision_id"] for row in rows[:25] if row.get("revision_id")]
    )
    return DeploymentListOut(
        items=[_out(row, recovery) for row in rows[:25]],
        next_cursor=rows[24]["_id"] if len(rows) > 25 else None,
    )


async def attach_snapshot(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    page: dict[str, Any],
    revision_id: str,
    started_at: datetime,
    session: AsyncIOMotorClientSession,
) -> None:
    repo = DeploySyncRepository(db)
    workspace_id, project_id = page["workspace_id"], page["project_id"]
    project = await repo.project(workspace_id, project_id, session=session)
    config = (project or {}).get("deploy_sync") or {}
    if (
        not project
        or not _active(project)
        or not config.get("enabled")
        or not config.get("latest_id")
    ):
        return
    deployment = await repo.find(workspace_id, project_id, config["latest_id"], session=session)
    if (
        not deployment
        or deployment["status"] != "awaiting_review"
        or deployment["received_at"] > started_at
    ):
        return
    if (
        _address(deployment["url"]) != _address(project_start_url(project))
        or _address(page["url_normalized"]) != _address(deployment["url"])
        or deployment["environment"] != project.get("environment", "live")
    ):
        return
    if not await _issuer_allowed(db, project, config["issued_by"], session=session):
        return
    await repo.capture(
        workspace_id,
        project_id,
        deployment["_id"],
        page_id=str(page["_id"]),
        revision_id=revision_id,
        session=session,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type="deployment.review_captured",
        actor_type="system",
        actor_id=None,
        payload={
            "project_id": project_id,
            "deployment_id": deployment["_id"],
            "page_id": str(page["_id"]),
            "revision_id": revision_id,
        },
        session=session,
    )
