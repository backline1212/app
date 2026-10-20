"""Server-side plan limits: active projects, team seats and monthly AI credits."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, TypeVar

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.errors import NotFoundError, PlanLimitExceededError
from app.modules.billing.plans import effective_plan_id, get_plan_definition
from app.modules.billing.repository import BillingRepository

LimitedResource = Literal["projects", "members", "ai_credits"]
T = TypeVar("T")

# Which plan an upgrade prompt points at from each tier.
_NEXT_PLAN = {"free": "solo", "solo": "team", "team": "enterprise", "enterprise": "enterprise"}


def ai_credit_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    """AI credits reset on the first of each calendar month, UTC."""
    now = now or datetime.now(UTC)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = (
        start.replace(year=start.year + 1, month=1)
        if start.month == 12
        else start.replace(month=start.month + 1)
    )
    return start, end


async def count_usage(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    resource: LimitedResource,
    *,
    session: AsyncIOMotorClientSession | None = None,
) -> int:
    repo = BillingRepository(db)
    if resource == "projects":
        return await repo.count_active_projects(workspace_id, session=session)
    if resource == "members":
        return await repo.count_members(workspace_id, session=session)
    return await repo.count_ai_credits_since(workspace_id, ai_credit_window()[0], session=session)


def plan_limit(plan: dict[str, Any], resource: LimitedResource) -> int | None:
    key = {
        "projects": "project_limit",
        "members": "member_limit",
        "ai_credits": "ai_credits_monthly",
    }[resource]
    limit: int | None = plan[key]
    return limit


_LIMIT_MESSAGES = {
    "projects": "{plan} includes {limit} active projects. Upgrade to add more, or archive one.",
    "members": "{plan} includes {limit} team members. Upgrade to invite more teammates.",
    "ai_credits": "{plan} includes {limit} AI credits a month, and they're used up. "
    "Upgrade for more, or wait for the reset on the 1st.",
}


async def require_within_plan_limit(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    resource: LimitedResource,
    *,
    session: AsyncIOMotorClientSession | None = None,
) -> None:
    """Check capacity. Mutations must call inside run_plan_change's transaction."""
    workspace = await BillingRepository(db).find_workspace(workspace_id, session=session)
    if workspace is None:
        raise NotFoundError("Workspace not found.")
    plan = get_plan_definition(effective_plan_id(workspace))
    limit = plan_limit(plan, resource)
    if limit is None:
        return
    current = await count_usage(db, workspace_id, resource, session=session)
    if current < limit:
        return
    raise PlanLimitExceededError(
        _LIMIT_MESSAGES[resource].format(plan=plan["name"], limit=f"{limit:,}"),
        details={
            "resource": resource,
            "current": current,
            "limit": limit,
            "plan_id": plan["id"],
            "upgrade_plan_id": _NEXT_PLAN[plan["id"]],
        },
    )


async def run_plan_change(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    operation: Callable[[AsyncIOMotorClientSession], Awaitable[T]],
) -> T:
    """Serialize count + write; callbacks contain database work only and may retry."""

    async def commit(session: AsyncIOMotorClientSession) -> T:
        if not await BillingRepository(db).serialize_plan_changes(workspace_id, session=session):
            raise NotFoundError("Workspace not found.")
        return await operation(session)

    async with await db.client.start_session() as session:
        result: T = await session.with_transaction(commit)
    return result


async def reserve_ai_credit(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    *,
    action: str,
    user_id: str | None = None,
) -> str:
    """Reserve before provider work. Active reservations count in the usage display."""

    async def reserve(session: AsyncIOMotorClientSession) -> str:
        await require_within_plan_limit(db, workspace_id, "ai_credits", session=session)
        now = datetime.now(UTC)
        return await BillingRepository(db).reserve_ai_credit(
            workspace_id,
            action=action,
            user_id=user_id,
            created_at=now,
            expires_at=now + timedelta(minutes=10),
            session=session,
        )

    return await run_plan_change(db, workspace_id, reserve)
