"""Server-side plan limits: active projects, team seats and monthly AI credits."""

from datetime import UTC, datetime
from typing import Any, Literal

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import NotFoundError, PlanLimitExceededError
from app.modules.billing.plans import effective_plan_id, get_plan_definition
from app.modules.billing.repository import BillingRepository

LimitedResource = Literal["projects", "members", "ai_credits"]

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
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, resource: LimitedResource
) -> int:
    repo = BillingRepository(db)
    if resource == "projects":
        return await repo.count_active_projects(workspace_id)
    if resource == "members":
        return await repo.count_members(workspace_id)
    return await repo.count_ai_credits_since(workspace_id, ai_credit_window()[0])


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
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, resource: LimitedResource
) -> None:
    """Raises 402 PLAN_LIMIT_EXCEEDED when adding one more `resource` would exceed the
    workspace's current plan. The count and the insert that follows are not atomic, so
    two simultaneous creates at the boundary can both pass - an accepted overshoot of
    one, not worth a transaction on every project/member/AI call."""
    workspace = await BillingRepository(db).find_workspace(workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")
    plan = get_plan_definition(effective_plan_id(workspace))
    limit = plan_limit(plan, resource)
    if limit is None:
        return
    current = await count_usage(db, workspace_id, resource)
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


async def record_ai_credit(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    *,
    action: str,
    user_id: str | None = None,
) -> None:
    """One credit per completed AI call, attributed to the member who asked for it (the
    AI Usage page breaks usage down by member). Placeholder answers given while AI is
    not configured never reach this, so they cost nothing."""
    await BillingRepository(db).record_ai_credit(workspace_id, action=action, user_id=user_id)
