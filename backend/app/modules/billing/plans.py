"""Plans and pricing - the single source of truth for tiers, prices and limits.

Four tiers, priced against BugHerd, Marker.io, Jam.dev and Linear (docs/tdr/0051).
Limits are read from here at request time rather than from a per-workspace snapshot,
so a pricing change here is the only step needed to change what a plan allows.

A limit of `None` means unlimited. Features the product does not ship yet are flagged
`coming_soon` so the pricing page never sells something a customer cannot use.
"""

from datetime import UTC, datetime
from typing import Any, Literal

PlanId = Literal["free", "solo", "team", "enterprise"]
PaidPlanId = Literal["solo", "team", "enterprise"]
BillingInterval = Literal["monthly", "annual"]
BillingCurrency = Literal["usd", "inr"]

FREE_PLAN_ID: PlanId = "free"


def _feature(label: str, *, coming_soon: bool = False) -> dict[str, Any]:
    return {"label": label, "coming_soon": coming_soon}


PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "id": "free",
        "name": "Free Starter",
        "badge": "Starter",
        "description": "For solo developers and freelancers starting out with visual reviews.",
        "popular": False,
        "price_monthly_usd": 0,
        "price_annual_usd": 0,
        "price_monthly_inr": 0,
        "price_annual_inr": 0,
        "project_limit": 2,
        "member_limit": 2,
        "ai_credits_monthly": 20,
        "storage_gb": 5,
        "features": [
            _feature("2 active projects"),
            _feature("2 team members"),
            _feature("20 AI review credits / month"),
            _feature("Unlimited guest & client reviewers"),
            _feature("Live site, proxy & extension review"),
            _feature("5 GB storage"),
        ],
    },
    "solo": {
        "id": "solo",
        "name": "Solo Pro",
        "badge": "Pro",
        "description": "For independent contractors, UI/UX designers and freelance QA engineers.",
        "popular": False,
        "price_monthly_usd": 24,
        "price_annual_usd": 19,
        "price_monthly_inr": 1899,
        "price_annual_inr": 1499,
        "project_limit": 5,
        "member_limit": 5,
        "ai_credits_monthly": 200,
        "storage_gb": 20,
        "features": [
            _feature("5 active projects"),
            _feature("5 team members"),
            _feature("200 AI review credits / month"),
            _feature("Unlimited guest & client reviewers"),
            _feature("Video & audio screen recording", coming_soon=True),
            _feature("Browser console replay", coming_soon=True),
            _feature("20 GB storage"),
        ],
    },
    "team": {
        "id": "team",
        "name": "Team Standard",
        "badge": "Most Popular",
        "description": "For fast-shipping agencies, product squads and QA consulting teams.",
        "popular": True,
        "price_monthly_usd": 59,
        "price_annual_usd": 49,
        "price_monthly_inr": 4699,
        "price_annual_inr": 3899,
        "project_limit": 20,
        "member_limit": 15,
        "ai_credits_monthly": 1000,
        "storage_gb": 100,
        "features": [
            _feature("20 active projects"),
            _feature("15 team members"),
            _feature("1,000 AI review credits / month (BugHunt AI)"),
            _feature("Slack, Jira, ClickUp, Asana & Trello integrations"),
            _feature("Cloud login browser sessions"),
            _feature("Custom branding & domains", coming_soon=True),
            _feature("100 GB storage"),
        ],
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Agency Enterprise",
        "badge": "Agency Scale",
        "description": "For agency networks, enterprise QA departments and mission-critical scale.",
        "popular": False,
        "price_monthly_usd": 179,
        "price_annual_usd": 149,
        "price_monthly_inr": 14299,
        "price_annual_inr": 11999,
        "project_limit": None,
        "member_limit": 100,
        "ai_credits_monthly": 10000,
        "storage_gb": 1000,
        "features": [
            _feature("Unlimited projects"),
            _feature("100 team members"),
            _feature("10,000 AI review credits / month"),
            _feature("Dedicated 4-hour SLA support"),
            _feature("1,000 GB storage"),
            _feature("White-label client portals", coming_soon=True),
        ],
    },
}

_YES = "Yes"
_NO = "No"
_SOON = "Coming soon"


def _row(name: str, free: str, solo: str, team: str, enterprise: str) -> dict[str, str]:
    return {"name": name, "free": free, "solo": solo, "team": team, "enterprise": enterprise}


def _all(name: str, value: str = _YES) -> dict[str, str]:
    return _row(name, value, value, value, value)


COMPARISON_CATEGORIES: list[dict[str, Any]] = [
    {
        "category": "Core Feedback & Review",
        "rows": [
            _row("Active projects", "2", "5", "20", "Unlimited"),
            _all("Guest & client reviewers", "Unlimited"),
            _all("Live site, proxy & extension review"),
            _all("Image & PDF review"),
            _all("Passcode-protected share links"),
            _row("Storage", "5 GB", "20 GB", "100 GB", "1,000 GB"),
        ],
    },
    {
        "category": "Video & Replay Capture",
        "rows": [
            _all("Screenshot on every comment"),
            _all("Browser & device details"),
            _row("Video & audio screen recording", _NO, _SOON, _SOON, _SOON),
            _row("Browser console replay", _NO, _SOON, _SOON, _SOON),
        ],
    },
    {
        "category": "Integrations & Team",
        "rows": [
            _row("Team members", "2", "5", "15", "100"),
            _row("Slack, Jira, ClickUp, Asana & Trello", _NO, _NO, _YES, _YES),
            _row("MCP server for AI agents", _NO, _NO, _YES, _YES),
            _row("Cloud login browser sessions", _NO, _NO, _YES, _YES),
        ],
    },
    {
        "category": "AI & Security",
        "rows": [
            _row("AI review credits / month", "20", "200", "1,000", "10,000"),
            _all("Thread summaries & suggested replies"),
            _all("BugHunt AI project analysis"),
            _row("Custom branding & domains", _NO, _NO, _SOON, _SOON),
            _row("White-label client portals", _NO, _NO, _NO, _SOON),
            _row("Support", "Community", "Email", "Priority email", "Dedicated 4-hour SLA"),
        ],
    },
]


def get_plan_definition(plan_id: str) -> dict[str, Any]:
    """Unknown or legacy plan labels resolve to Free rather than raising, so a
    workspace document written before this module existed stays readable."""
    return PLANS.get(plan_id, PLANS[FREE_PLAN_ID])


def plan_price(plan_id: str, interval: BillingInterval, currency: BillingCurrency) -> int:
    """Total charged for one billing period, in whole currency units. Annual prices are
    quoted per month, so the annual charge is twelve times the monthly-equivalent rate."""
    plan = get_plan_definition(plan_id)
    if interval == "annual":
        return int(plan[f"price_annual_{currency}"]) * 12
    return int(plan[f"price_monthly_{currency}"])


def effective_plan_id(workspace: dict[str, Any], now: datetime | None = None) -> str:
    """The plan a workspace is entitled to right now. Paid plans are prepaid for one
    period (docs/tdr/0051), so a paid plan whose period has ended counts as Free until
    it is renewed, even before anything rewrites the stored `plan` field."""
    stored = str(workspace.get("plan") or FREE_PLAN_ID).lower()
    if stored not in PLANS:
        return FREE_PLAN_ID
    period_end = workspace.get("current_period_end")
    if stored != FREE_PLAN_ID and isinstance(period_end, datetime):
        if period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=UTC)
        if period_end <= (now or datetime.now(UTC)):
            return FREE_PLAN_ID
    return stored
