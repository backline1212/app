import asyncio

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from pydantic import ValidationError as PydanticValidationError

from app.core.db import get_db
from app.core.errors import ValidationError
from app.core.permissions import require_project_permission
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.redis_client import get_redis
from app.core.session import Session
from app.modules.deploy_sync import service
from app.modules.deploy_sync.schemas import (
    DeployCredentialOut,
    DeployCredentialRequest,
    DeployCredentialRevoke,
    DeploymentListOut,
    DeploymentNotify,
    DeploymentOut,
    DeploySyncOut,
)

router = APIRouter(tags=["deploy-sync"])


@router.get("/projects/{project_id}/deploy-sync", response_model=DeploySyncOut)
async def settings(
    project_id: str,
    response: Response,
    actor: Session = Depends(require_project_permission("project:view")),
) -> DeploySyncOut:
    response.headers["Cache-Control"] = "no-store"
    return await service.settings(get_db(), actor, project_id)


@router.post("/projects/{project_id}/deploy-sync/credential", response_model=DeployCredentialOut)
async def create_credential(
    project_id: str,
    body: DeployCredentialRequest,
    response: Response,
    actor: Session = Depends(require_project_permission("project:update")),
) -> DeployCredentialOut:
    response.headers["Cache-Control"] = "no-store"
    return await service.create_credential(get_db(), actor, project_id, body)


@router.delete("/projects/{project_id}/deploy-sync/credential", status_code=204)
async def revoke_credential(
    project_id: str,
    body: DeployCredentialRevoke,
    actor: Session = Depends(require_project_permission("project:update")),
) -> Response:
    await service.revoke_credential(get_db(), actor, project_id, body.expected_version)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get("/projects/{project_id}/deploy-sync/deployments", response_model=DeploymentListOut)
async def history(
    project_id: str,
    response: Response,
    cursor: str | None = Query(default=None, min_length=64, max_length=64, pattern=r"^[a-f0-9]+$"),
    actor: Session = Depends(require_project_permission("project:view")),
) -> DeploymentListOut:
    response.headers["Cache-Control"] = "no-store"
    return await service.history(get_db(), actor, project_id, cursor)


@router.post("/deploy-hooks/{workspace_id}/{project_id}", response_model=DeploymentOut)
async def notify(
    workspace_id: str,
    project_id: str,
    request: Request,
    response: Response,
    timestamp: str = Header(default="", alias="X-Backline-Timestamp", max_length=11),
    signature: str = Header(default="", alias="X-Backline-Signature", max_length=64),
) -> DeploymentOut:
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:deploy-hook:ip:{get_client_ip(request)}",
        limit=60,
        window_seconds=60,
    )
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise ValidationError("Send a JSON deployment payload.")
    raw = bytearray()
    try:
        async with asyncio.timeout(10):
            async for chunk in request.stream():
                if len(raw) + len(chunk) > 16_384:
                    raise ValidationError("Deployment payloads must be at most 16 KB.")
                raw.extend(chunk)
    except TimeoutError as exc:
        raise ValidationError("Deployment payload took too long to arrive.") from exc
    try:
        body = DeploymentNotify.model_validate_json(raw)
    except PydanticValidationError as exc:
        raise ValidationError(
            "Use a valid deployment ID, URL, environment, deployment time "
            "and optional commit reference."
        ) from exc
    response.headers["Cache-Control"] = "no-store"
    return await service.notify(
        get_db(),
        workspace_id=workspace_id,
        project_id=project_id,
        body=body,
        raw=bytes(raw),
        timestamp=timestamp,
        signature=signature,
    )
