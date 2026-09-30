import csv
import io
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import NotFoundError, ValidationError
from app.core.events import append_event
from app.modules.clients.repository import ClientRepository
from app.modules.clients.schemas import ClientCreate, ClientOut, ClientUpdate

# Spreadsheet formula leads (OWASP CSV injection); a quote keeps the cell inert.
_CSV_FORMULA_LEAD_CHARS = ("=", "+", "-", "@", "\t", "\r")


def client_out(doc: dict[str, Any]) -> ClientOut:
    return ClientOut(**{**doc, "id": str(doc["_id"])})


async def list_clients(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, include_archived: bool = False
) -> list[ClientOut]:
    return [
        client_out(doc)
        for doc in await ClientRepository(db).list(workspace_id, include_archived=include_archived)
    ]


async def create_client(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, actor_id: str, body: ClientCreate
) -> ClientOut:
    if not body.name.strip():
        raise ValidationError("Client name is required.")
    fields = body.model_dump()
    fields.update(name=body.name.strip(), created_by=actor_id)
    doc = await ClientRepository(db).create(workspace_id, fields)
    await append_event(
        db,
        workspace_id=workspace_id,
        type="client.created",
        actor_type="member",
        actor_id=actor_id,
        payload={"client_id": str(doc["_id"]), "name": doc["name"]},
    )
    return client_out(doc)


async def update_client(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    client_id: str,
    actor_id: str,
    body: ClientUpdate | None,
) -> ClientOut:
    repo = ClientRepository(db)
    doc = await repo.find(workspace_id, client_id)
    if doc is None:
        raise NotFoundError("Client not found.")
    fields = body.model_dump(exclude_unset=True) if body else {"archived_at": datetime.now(UTC)}
    if "name" in fields:
        if not fields["name"] or not fields["name"].strip():
            raise ValidationError("Client name is required.")
        fields["name"] = fields["name"].strip()
    if "contact_name" in fields and fields["contact_name"] is None:
        raise ValidationError("Contact name cannot be null.")
    await repo.update(workspace_id, client_id, fields)
    await append_event(
        db,
        workspace_id=workspace_id,
        type="client.updated" if body else "client.archived",
        actor_type="member",
        actor_id=actor_id,
        payload={"client_id": client_id, "name": doc["name"]},
    )
    return client_out({**doc, **fields, "updated_at": datetime.now(UTC)})


async def restore_client(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    client_id: str,
    actor_id: str,
) -> ClientOut:
    repo = ClientRepository(db)
    doc = await repo.find_archived(workspace_id, client_id)
    if doc is None:
        raise NotFoundError("Archived client not found.")
    now = datetime.now(UTC)
    await repo.restore(workspace_id, client_id)
    await append_event(
        db,
        workspace_id=workspace_id,
        type="client.restored",
        actor_type="member",
        actor_id=actor_id,
        payload={"client_id": client_id, "name": doc["name"]},
    )
    doc["archived_at"] = None
    doc["updated_at"] = now
    return client_out(doc)


async def export_clients(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
) -> str:
    clients = await list_clients(db, workspace_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Name",
            "Contact Name",
            "Email",
            "Active Projects",
            "Open Tickets",
            "Resolved Tickets",
            "Reviewers",
            "Last Activity",
            "Added",
        ]
    )
    for c in clients:
        row = [
            c.name,
            c.contact_name,
            c.email or "",
            str(c.stats.active_projects_count) if c.stats else "0",
            str(c.stats.open_tickets_count) if c.stats else "0",
            str(c.stats.resolved_tickets_count) if c.stats else "0",
            str(c.stats.reviewers_count) if c.stats else "0",
            c.stats.last_activity_at.isoformat() if c.stats and c.stats.last_activity_at else "",
            c.created_at.isoformat(),
        ]
        writer.writerow(
            [f"'{cell}" if cell.startswith(_CSV_FORMULA_LEAD_CHARS) else cell for cell in row]
        )
    return output.getvalue()
