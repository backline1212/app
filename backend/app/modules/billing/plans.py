"""Plans and pricing single source of truth.
Defines 4 standard SaaS tiers (Free, Solo, Team, Enterprise) benchmarked against
competitors (Linear, BugHerd, Marker.io, Userback, Jam.dev).
"""

from typing import Any, Literal

BillingInterval = Literal["monthly", "annual"]
BillingCurrency = Literal["usd", "inr"]
BillingProvider = Literal["stripe", "razorpay", "sandbox", "free"]
PlanTierId = Literal["free", "solo", "team", "enterprise"]

PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "id": "free",
        "name": "Free",
        "badge": "Starter",
        "description": (
            "For individual developers and freelancers getting started with visual reviews."
        ),
        "popular": False,
        "price_monthly_usd": 0,
        "price_annual_usd": 0,
        "price_monthly_inr": 0,
        "price_annual_inr": 0,
        "project_limit": 1,
        "member_limit": 2,
        "guest_limit_label": "Unlimited",
        "ai_credits_monthly": 25,
        "storage_gb": 1,
        "integrations_allowed": ["community"],
        "features": [
            "1 Active Project",
            "Up to 2 Team Members",
            "Unlimited Guest & Client Reviewers",
            "25 AI actions/month (Summaries & Replies)",
            "Standard Pin & Area Comments",
            "1 GB Fast Cloud Storage",
            "Community Support",
        ],
        "highlights": [
            "1 project",
            "2 seats",
            "25 AI/mo",
        ],
    },
    "solo": {
        "id": "solo",
        "name": "Solo",
        "badge": "Pro Freelancer",
        "description": (
            "For independent contractors, UI/UX designers, and freelance QA engineers."
        ),
        "popular": False,
        "price_monthly_usd": 24,
        "price_annual_usd": 19,  # $228/year
        "price_monthly_inr": 1899,
        "price_annual_inr": 1499,  # ₹17,988/year
        "project_limit": 5,
        "member_limit": 3,
        "guest_limit_label": "Unlimited",
        "ai_credits_monthly": 250,
        "storage_gb": 15,
        "integrations_allowed": ["slack", "clickup"],
        "features": [
            "5 Active Projects",
            "Up to 3 Team Members",
            "Unlimited Guest & Client Reviewers",
            "250 AI actions/month",
            "Slack & ClickUp Two-Way Sync",
            "Passcode Protected Share Links",
            "15 GB Fast CDN Asset Storage",
            "Priority Email Support",
        ],
        "highlights": [
            "5 projects",
            "3 seats",
            "250 AI/mo",
            "Slack & ClickUp",
        ],
    },
    "team": {
        "id": "team",
        "name": "Team",
        "badge": "Most Popular",
        "description": (
            "For fast-shipping digital agencies, product squads, and QA consulting teams."
        ),
        "popular": True,
        "price_monthly_usd": 59,
        "price_annual_usd": 49,  # $588/year
        "price_monthly_inr": 4699,
        "price_annual_inr": 3899,  # ₹46,788/year
        "project_limit": 20,
        "member_limit": 10,
        "guest_limit_label": "Unlimited",
        "ai_credits_monthly": 1000,
        "storage_gb": 100,
        "integrations_allowed": ["slack", "clickup", "jira", "asana", "mcp"],
        "features": [
            "20 Active Projects",
            "Up to 10 Team Members",
            "Unlimited Guest & Client Reviewers",
            "1,000 AI actions/month (BugHunt AI included)",
            "All Integrations (Jira, Asana, ClickUp, Slack)",
            "Live Cloud Login Browser Sessions",
            "Multi-Browser Headless Renders",
            "Custom Link Expiry & Watermarks",
            "100 GB Fast CDN Storage",
            "Priority Support (4-hour SLA)",
        ],
        "highlights": [
            "20 projects",
            "10 seats",
            "1,000 AI/mo",
            "Jira & Asana",
            "Cloud Login",
        ],
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "badge": "Agency Scale",
        "description": (
            "For large agency networks, enterprise QA departments, and mission-critical scale."
        ),
        "popular": False,
        "price_monthly_usd": 179,
        "price_annual_usd": 149,  # $1,788/year
        "price_monthly_inr": 14299,
        "price_annual_inr": 11999,  # ₹143,988/year
        "project_limit": 999,
        "member_limit": 999,
        "guest_limit_label": "Unlimited",
        "ai_credits_monthly": 5000,
        "storage_gb": 1000,
        "integrations_allowed": ["all"],
        "features": [
            "Unlimited Projects & Workspaces",
            "Unlimited Team Members",
            "Unlimited Guest & Client Reviewers",
            "5,000 AI actions/month & Dedicated Model",
            "Custom Outbound Webhooks & MCP Server",
            "White-label Branding & Custom Domain",
            "1 TB Private Encrypted Storage",
            "Dedicated Customer Success Manager & 99.9% SLA",
        ],
        "highlights": [
            "Unlimited projects",
            "Unlimited seats",
            "5,000 AI/mo",
            "White-label",
            "Dedicated SLA",
        ],
    },
}

COMPARISON_CATEGORIES = [
    {
        "category": "Projects & Reviewing",
        "rows": [
            {
                "name": "Active projects",
                "free": "1",
                "solo": "5",
                "team": "20",
                "enterprise": "Unlimited",
            },
            {
                "name": "Team members",
                "free": "2",
                "solo": "3",
                "team": "10",
                "enterprise": "Unlimited",
            },
            {
                "name": "Guest & client reviewers",
                "free": "Unlimited",
                "solo": "Unlimited",
                "team": "Unlimited",
                "enterprise": "Unlimited",
            },
            {
                "name": "Live site & snippet review",
                "free": "Yes",
                "solo": "Yes",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Proxy mode (zero install)",
                "free": "Yes",
                "solo": "Yes",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Asset & PDF review",
                "free": "Yes",
                "solo": "Yes",
                "team": "Yes",
                "enterprise": "Yes",
            },
        ],
    },
    {
        "category": "AI & Advanced QA",
        "rows": [
            {
                "name": "Monthly AI actions",
                "free": "25",
                "solo": "250",
                "team": "1,000",
                "enterprise": "5,000",
            },
            {
                "name": "Thread summaries & suggested replies",
                "free": "Yes",
                "solo": "Yes",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "BugHunt AI autonomous scanner",
                "free": "No",
                "solo": "No",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Cloud login interactive browser",
                "free": "No",
                "solo": "No",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Cross-browser engine renders",
                "free": "No",
                "solo": "No",
                "team": "Yes",
                "enterprise": "Yes",
            },
        ],
    },
    {
        "category": "Integrations & Automation",
        "rows": [
            {
                "name": "Slack & ClickUp",
                "free": "No",
                "solo": "Yes",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Jira & Asana",
                "free": "No",
                "solo": "No",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Model Context Protocol (MCP) agents",
                "free": "No",
                "solo": "No",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Custom webhooks",
                "free": "No",
                "solo": "No",
                "team": "No",
                "enterprise": "Yes",
            },
        ],
    },
    {
        "category": "Security, Storage & Support",
        "rows": [
            {
                "name": "Cloud storage",
                "free": "1 GB",
                "solo": "15 GB",
                "team": "100 GB",
                "enterprise": "1 TB",
            },
            {
                "name": "Passcode protected share links",
                "free": "No",
                "solo": "Yes",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "Custom link expiration",
                "free": "No",
                "solo": "No",
                "team": "Yes",
                "enterprise": "Yes",
            },
            {
                "name": "White-label client portal",
                "free": "No",
                "solo": "No",
                "team": "No",
                "enterprise": "Yes",
            },
            {
                "name": "Support SLA",
                "free": "Community",
                "solo": "Standard Email",
                "team": "4-Hour Priority",
                "enterprise": "Dedicated / 99.9%",
            },
        ],
    },
]


def get_plan_definition(plan_id: str) -> dict[str, Any]:
    return PLANS.get(plan_id, PLANS["free"])


def get_plan_limits_snapshot(plan_id: str) -> dict[str, Any]:
    plan = get_plan_definition(plan_id)
    return {
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "project_limit": plan["project_limit"],
        "member_limit": plan["member_limit"],
        "ai_credits_monthly": plan["ai_credits_monthly"],
        "storage_gb": plan["storage_gb"],
        "integrations_allowed": plan["integrations_allowed"],
    }
