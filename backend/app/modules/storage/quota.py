"""Reserve workspace bytes before granting or performing any object write."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import ConflictError, ExternalServiceError, PlanLimitExceededError
from app.modules.billing.limits import run_plan_change
from app.modules.billing.plans import effective_plan_id, get_plan_definition
from app.modules.billing.repository import BillingRepository
from app.modules.storage.quota_repository import StorageQuotaRepository
from app.modules.storage.r2_client import head_upload, upload_bytes


async def reserve_bytes(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    key: str,
    size: int,
    release_missing: bool = True,
) -> None:
    async def reserve(session: AsyncIOMotorClientSession) -> None:
        repo = StorageQuotaRepository(db)
        existing = await repo.find(workspace_id, key, session=session)
        if existing and existing["state"] in ("reserved", "stored"):
            if existing["byte_size"] != size or existing["project_id"] != project_id:
                raise ConflictError("This storage reservation already names different content.")
            if existing["state"] == "reserved":
                await repo.reserve(
                    workspace_id=workspace_id,
                    project_id=project_id,
                    key=key,
                    size=size,
                    verify_after=datetime.now(UTC) + timedelta(minutes=15),
                    session=session,
                    release_missing=bool(existing.get("release_missing", True)),
                )
            return
        workspace = await BillingRepository(db).find_workspace(workspace_id, session=session)
        assert workspace is not None
        if get_settings().storage_quota_enforcement_enabled:
            if (
                not workspace.get("storage_inventory_ready")
                or workspace.get("storage_inventory_bucket") != get_settings().r2_bucket_name
            ):
                raise ExternalServiceError(
                    "Storage accounting is being prepared. Try again shortly."
                )
            plan = get_plan_definition(effective_plan_id(workspace))
            limit = int(plan["storage_gb"]) * 1_000_000_000
            used = await repo.usage(workspace_id, session=session)
            if used + size > limit:
                raise PlanLimitExceededError(
                    "This workspace has reached its storage allowance. "
                    "Free storage or upgrade to upload more.",
                    details={
                        "resource": "storage",
                        "current": used,
                        "requested": size,
                        "limit": limit,
                        "plan_id": plan["id"],
                    },
                )
        await repo.reserve(
            workspace_id=workspace_id,
            project_id=project_id,
            key=key,
            size=size,
            verify_after=datetime.now(UTC) + timedelta(minutes=15),
            session=session,
            release_missing=release_missing,
        )

    await run_plan_change(db, workspace_id, reserve)


async def store_bytes(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    key: str,
    data: bytes,
    content_type: str,
) -> None:
    await reserve_bytes(
        db, workspace_id=workspace_id, project_id=project_id, key=key, size=len(data)
    )
    # Failed/ambiguous writes retain their hold until a later HEAD proves absence.
    async with asyncio.timeout(120):
        await upload_bytes(key, data, content_type)
    await StorageQuotaRepository(db).mark_stored(workspace_id, key, len(data))


# A presigned PUT is signed for five minutes and capped at the upload size limit, so a
# request that started in time has long finished by then. After this, a still-missing
# object means the grant was never used and its hold is released (BUG-06).
PRESIGNED_UPLOAD_GRACE = timedelta(hours=24)


async def reconcile_reservation(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, key: str
) -> None:
    repo = StorageQuotaRepository(db)
    doc = await repo.claim_check(workspace_id, key, datetime.now(UTC) + timedelta(minutes=15))
    if doc is None:
        return
    metadata = await head_upload(key)
    if metadata is None:
        # A presigned PUT may have started before its URL expired. An absent HEAD
        # cannot prove that in-flight request will not finish, so its bytes stay held
        # until the grace period has passed. `updated_at` is the reservation time: only
        # reserve() writes it while the row is reserved.
        reserved_at = doc.get("updated_at")
        abandoned = (
            reserved_at is not None and reserved_at <= datetime.now(UTC) - PRESIGNED_UPLOAD_GRACE
        )
        if doc.get("release_missing", True) or abandoned:
            await repo.release_deleted(workspace_id, key, token=doc["reservation_token"])
    else:
        await repo.mark_stored(workspace_id, key, metadata[1], token=doc["reservation_token"])
