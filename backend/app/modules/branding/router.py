from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_match
from app.modules.branding import service
from app.modules.branding.schemas import (
    BrandingOut,
    BrandingUpdate,
    CustomDomainCreate,
    CustomDomainOut,
    PublicBrandingOut,
)

router = APIRouter(tags=["branding"])


@router.get("/workspaces/{workspace_id}/branding", response_model=BrandingOut)
async def get_branding(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> BrandingOut:
    require_workspace_match(session, workspace_id)
    return await service.get_branding(get_db(), workspace_id)


@router.put("/workspaces/{workspace_id}/branding", response_model=BrandingOut)
async def update_branding(
    workspace_id: str,
    body: BrandingUpdate,
    session: Session = Depends(require_permission("workspace:update_settings")),
) -> BrandingOut:
    require_workspace_match(session, workspace_id)
    return await service.update_branding(get_db(), workspace_id, body)


@router.post("/workspaces/{workspace_id}/branding/logo", response_model=BrandingOut)
async def upload_logo(
    workspace_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(require_permission("workspace:update_settings")),
) -> BrandingOut:
    require_workspace_match(session, workspace_id)
    data = await file.read(service.MAX_LOGO_BYTES + 1)
    return await service.upload_logo(get_db(), workspace_id, file.content_type or "", data)


@router.get("/workspaces/{workspace_id}/domains", response_model=list[CustomDomainOut])
async def list_domains(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> list[CustomDomainOut]:
    require_workspace_match(session, workspace_id)
    return await service.list_domains(get_db(), workspace_id)


@router.post("/workspaces/{workspace_id}/domains", response_model=CustomDomainOut, status_code=201)
async def add_domain(
    workspace_id: str,
    body: CustomDomainCreate,
    session: Session = Depends(require_permission("workspace:update_settings")),
) -> CustomDomainOut:
    require_workspace_match(session, workspace_id)
    return await service.add_domain(get_db(), workspace_id, body.host, session.user_id)


@router.post(
    "/workspaces/{workspace_id}/domains/{domain_id}/verify", response_model=CustomDomainOut
)
async def verify_domain(
    workspace_id: str,
    domain_id: str,
    session: Session = Depends(require_permission("workspace:update_settings")),
) -> CustomDomainOut:
    require_workspace_match(session, workspace_id)
    return await service.verify_domain(get_db(), workspace_id, domain_id)


@router.delete("/workspaces/{workspace_id}/domains/{domain_id}", status_code=204)
async def remove_domain(
    workspace_id: str,
    domain_id: str,
    session: Session = Depends(require_permission("workspace:update_settings")),
) -> None:
    require_workspace_match(session, workspace_id)
    await service.remove_domain(get_db(), workspace_id, domain_id)


@router.get("/branding/by-host", response_model=PublicBrandingOut | None)
async def branding_by_host(
    host: str = Query(min_length=4, max_length=253),
) -> PublicBrandingOut | None:
    """Public: the client-facing branding for a verified custom review domain."""
    return await service.branding_for_host(get_db(), host)
