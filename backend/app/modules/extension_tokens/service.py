from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import NotFoundError
from app.core.events import append_event
from app.core.security import generate_opaque_token, hash_secret
from app.modules.extension_tokens.repository import ExtensionTokenRepository
from app.modules.extension_tokens.schemas import (
    ExtensionTokenIssued,
    ExtensionTokenOut,
    ExtensionWhoAmIOut,
)
from app.modules.workspaces.repository import WorkspaceRepository
from app.modules.workspaces.schemas import WorkspaceOut


def _token_out(doc: dict[str, Any]) -> ExtensionTokenOut:
    return ExtensionTokenOut(
        id=str(doc["_id"]),
        name=doc["name"],
        workspace_id=doc["workspace_id"],
        created_at=doc["created_at"],
        last_used_at=doc["last_used_at"],
        revoked_at=doc["revoked_at"],
    )


async def issue_token(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    user_id: str,
    workspace_id: str,
    role: str,
    name: str,
) -> ExtensionTokenIssued:
    raw_token = generate_opaque_token()
    doc = await ExtensionTokenRepository(db).create(
        user_id=ObjectId(user_id),
        workspace_id=workspace_id,
        name=name,
        token_hash=hash_secret(raw_token),
        role=role,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type="extension_token.issued",
        actor_type="member",
        actor_id=user_id,
        payload={"extension_token_id": str(doc["_id"]), "name": name},
    )
    return ExtensionTokenIssued(
        id=str(doc["_id"]), token=raw_token, name=name, created_at=doc["created_at"]
    )


async def list_tokens(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, user_id: str
) -> list[ExtensionTokenOut]:
    docs = await ExtensionTokenRepository(db).list_for_workspace_member(
        workspace_id=workspace_id, user_id=ObjectId(user_id)
    )
    return [_token_out(doc) for doc in docs]


async def whoami(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, user_id: str, workspace_id: str, role: str
) -> ExtensionWhoAmIOut:
    from app.modules.auth.repository import UserRepository

    user = await UserRepository(db).find_by_id(user_id)
    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    if user is None or workspace is None:
        raise NotFoundError("Workspace not found.")
    return ExtensionWhoAmIOut(
        user_id=str(user["_id"]),
        user_email=user["email"],
        workspace=WorkspaceOut(
            id=str(workspace["_id"]),
            name=workspace["name"],
            slug=workspace["slug"],
            plan=workspace["plan"],
            created_at=workspace["created_at"],
            role=role,
        ),
    )


async def revoke_token(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, token_id: str, actor_user_id: str
) -> None:
    repo = ExtensionTokenRepository(db)
    doc = await repo.find_by_id(token_id)
    # A token is personal, not shared team state - ownership (not workspace membership)
    # is the check, same reasoning as refresh_tokens' family_belongs_to_user.
    if doc is None or str(doc["user_id"]) != actor_user_id:
        raise NotFoundError("Extension token not found.")
    await repo.revoke(doc["_id"])
    await append_event(
        db,
        workspace_id=doc["workspace_id"],
        type="extension_token.revoked",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"extension_token_id": str(doc["_id"])},
    )
