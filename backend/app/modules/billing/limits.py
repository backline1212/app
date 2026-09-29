"""Plan limits and quota validation logic."""

from typing import Any, Literal

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import NotFoundError, PlanLimitExceededError
from app.modules.billing.plans import get_plan_definition

ResourceType = Literal["projects", "members", "ai_actions", "integrations"]


async def get_workspace_limits_and_usage(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> tuple[dict[str, Any], dict[str, int]]:
    try:
        ws_oid = ObjectId(workspace_id)
        ws_doc = await db.workspaces.find_one({"_id": ws_oid})
    except Exception:
        ws_doc = await db.workspaces.find_one({"_id": workspace_id})

    if ws_doc is None:
        raise NotFoundError("Workspace not found.")

    plan_id = ws_doc.get("plan", "free")
    default_plan = get_plan_definition(plan_id)
    
    # Use denormalized snapshot if present, otherwise default plan definition
    limits = ws_doc.get("plan_limits_json") or {
        "plan_id": default_plan["id"],
        "plan_name": default_plan["name"],
        "project_limit": default_plan["project_limit"],
        "member_limit": default_plan["member_limit"],
        "ai_credits_monthly": default_plan["ai_credits_monthly"],
        "storage_gb": default_plan["storage_gb"],
        "integrations_allowed": default_plan["integrations_allowed"],
    }

    # Count actual usage
    projects_count = await db.projects.count_documents(
        {"workspace_id": workspace_id, "archived_at": None}
    )
    members_count = await db.memberships.count_documents({"workspace_id": workspace_id})
    ai_actions_count = await db.billing_events.count_documents(
        {"workspace_id": workspace_id, "event_type": "ai_action_used"}
    )

    usage = {
        "projects": projects_count,
        "members": members_count,
        "ai_actions": ai_actions_count,
    }

    return limits, usage


async def require_within_plan_limit(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    resource: ResourceType,
) -> None:
    limits, usage = await get_workspace_limits_and_usage(db, workspace_id)
    plan_name = limits.get("plan_name", "Free")
    plan_id = limits.get("plan_id", "free")

    if resource == "projects":
        max_projects = limits.get("project_limit", 1)
        current = usage["projects"]
        if max_projects < 999 and current >= max_projects:
            msg = (
                f"You have reached your limit of {max_projects} active project(s) "
                f"on the {plan_name} plan. Upgrade to add more projects."
            )
            raise PlanLimitExceededError(
                msg,
                details={
                    "resource": "projects",
                    "current": current,
                    "limit": max_projects,
                    "plan_id": plan_id,
                    "plan_name": plan_name,
                    "upgrade_recommended": "solo" if plan_id == "free" else "team",
                },
            )

    elif resource == "members":
        max_members = limits.get("member_limit", 2)
        current = usage["members"]
        if max_members < 999 and current >= max_members:
            msg = (
                f"You have reached your limit of {max_members} team member(s) "
                f"on the {plan_name} plan. Upgrade to invite additional teammates."
            )
            raise PlanLimitExceededError(
                msg,
                details={
                    "resource": "members",
                    "current": current,
                    "limit": max_members,
                    "plan_id": plan_id,
                    "plan_name": plan_name,
                    "upgrade_recommended": "solo" if plan_id == "free" else "team",
                },
            )

    elif resource == "ai_actions":
        max_ai = limits.get("ai_credits_monthly", 25)
        current = usage["ai_actions"]
        if max_ai < 9999 and current >= max_ai:
            raise PlanLimitExceededError(
                f"You have used all {max_ai} monthly AI credits on your {plan_name} plan. "
                "Upgrade for higher AI quota.",
                details={
                    "resource": "ai_actions",
                    "current": current,
                    "limit": max_ai,
                    "plan_id": plan_id,
                    "plan_name": plan_name,
                    "upgrade_recommended": "team",
                },
            )
