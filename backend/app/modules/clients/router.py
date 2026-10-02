from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_match
from app.modules.clients import service
from app.modules.clients.schemas import ClientCreate, ClientOut, ClientUpdate

router = APIRouter(tags=["clients"])


@router.get("/workspaces/{workspace_id}/clients", response_model=list[ClientOut])
async def list_clients(
    workspace_id: str,
    include_archived: bool = False,
    session: Session = Depends(require_permission("project:manage")),
) -> list[ClientOut]:
    require_workspace_match(session, workspace_id)
    return await service.list_clients(
        get_db(), workspace_id, include_archived=include_archived, viewer=session
    )


@router.post("/workspaces/{workspace_id}/clients", response_model=ClientOut, status_code=201)
async def create_client(
    workspace_id: str,
    body: ClientCreate,
    session: Session = Depends(require_permission("project:manage")),
) -> ClientOut:
    require_workspace_match(session, workspace_id)
    return await service.create_client(get_db(), workspace_id, session.user_id, body)


@router.patch("/workspaces/{workspace_id}/clients/{client_id}", response_model=ClientOut)
async def update_client(
    workspace_id: str,
    client_id: str,
    body: ClientUpdate,
    session: Session = Depends(require_permission("project:manage")),
) -> ClientOut:
    require_workspace_match(session, workspace_id)
    return await service.update_client(get_db(), workspace_id, client_id, session.user_id, body)


@router.delete("/workspaces/{workspace_id}/clients/{client_id}", status_code=204)
async def archive_client(
    workspace_id: str,
    client_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> None:
    require_workspace_match(session, workspace_id)
    await service.update_client(get_db(), workspace_id, client_id, session.user_id, None)


@router.post("/workspaces/{workspace_id}/clients/{client_id}/restore", response_model=ClientOut)
async def restore_client(
    workspace_id: str,
    client_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> ClientOut:
    require_workspace_match(session, workspace_id)
    return await service.restore_client(get_db(), workspace_id, client_id, session.user_id)


@router.get("/workspaces/{workspace_id}/clients/export")
async def export_clients(
    workspace_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> PlainTextResponse:
    require_workspace_match(session, workspace_id)
    csv_content = await service.export_clients(get_db(), workspace_id, viewer=session)
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="workspace_{workspace_id}_clients.csv"'
        },
    )
