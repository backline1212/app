"""Unit tests for billing, pricing plans, limits and gateways."""

from app.modules.billing.plans import (
    PLANS,
    get_plan_limits_snapshot,
)
from app.modules.billing.schemas import (
    CheckoutRequest,
    VerifyPaymentRequest,
)
from app.modules.billing.service import _compute_price


def test_plans_definitions_have_required_fields() -> None:
    expected_tiers = {"free", "solo", "team", "enterprise"}
    assert set(PLANS.keys()) == expected_tiers

    for tier_id, plan in PLANS.items():
        assert plan["id"] == tier_id
        assert "name" in plan
        assert "description" in plan
        assert "price_monthly_usd" in plan
        assert "price_annual_usd" in plan
        assert "price_monthly_inr" in plan
        assert "price_annual_inr" in plan
        assert "project_limit" in plan
        assert "member_limit" in plan
        assert "ai_credits_monthly" in plan
        assert "features" in plan
        assert len(plan["features"]) > 0


def test_compute_price_monthly_and_annual() -> None:
    # Free tier
    assert _compute_price("free", "monthly", "usd") == 0.0
    assert _compute_price("free", "annual", "usd") == 0.0

    # Solo USD
    assert _compute_price("solo", "monthly", "usd") == 24.0
    assert _compute_price("solo", "annual", "usd") == 19.0 * 12

    # Team USD
    assert _compute_price("team", "monthly", "usd") == 59.0
    assert _compute_price("team", "annual", "usd") == 49.0 * 12

    # Solo INR
    assert _compute_price("solo", "monthly", "inr") == 1899.0
    assert _compute_price("solo", "annual", "inr") == 1499.0 * 12

    # Team INR
    assert _compute_price("team", "monthly", "inr") == 4699.0
    assert _compute_price("team", "annual", "inr") == 3899.0 * 12


def test_plan_limits_snapshot() -> None:
    solo_snapshot = get_plan_limits_snapshot("solo")
    assert solo_snapshot["plan_id"] == "solo"
    assert solo_snapshot["project_limit"] == 5
    assert solo_snapshot["member_limit"] == 3
    assert solo_snapshot["ai_credits_monthly"] == 250
    assert "slack" in solo_snapshot["integrations_allowed"]

    team_snapshot = get_plan_limits_snapshot("team")
    assert team_snapshot["plan_id"] == "team"
    assert team_snapshot["project_limit"] == 20
    assert team_snapshot["member_limit"] == 10
    assert team_snapshot["ai_credits_monthly"] == 1000
    assert "jira" in team_snapshot["integrations_allowed"]


def test_checkout_and_verify_schemas() -> None:
    req = CheckoutRequest(
        plan_id="team",
        interval="annual",
        currency="usd",
        provider="stripe",
    )
    assert req.plan_id == "team"
    assert req.interval == "annual"
    assert req.currency == "usd"
    assert req.provider == "stripe"

    verify_req = VerifyPaymentRequest(
        plan_id="team",
        interval="annual",
        currency="inr",
        provider="razorpay",
        razorpay_payment_id="pay_123456",
        razorpay_order_id="order_123456",
        razorpay_signature="sig_123456",
        simulated=False,
    )
    assert verify_req.razorpay_payment_id == "pay_123456"
