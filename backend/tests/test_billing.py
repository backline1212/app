"""Unit tests for billing, pricing plans, limits and gateways."""

from datetime import UTC, datetime, timedelta

from app.modules.billing.plans import PLANS, effective_plan_id, plan_price
from app.modules.billing.schemas import CheckoutRequest, VerifyPaymentRequest


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
        assert len(plan["features"]) > 0


def test_plan_price_monthly_and_annual() -> None:
    assert plan_price("free", "monthly", "usd") == 0
    assert plan_price("free", "annual", "usd") == 0

    assert plan_price("solo", "monthly", "usd") == 24
    assert plan_price("solo", "annual", "usd") == 19 * 12
    assert plan_price("team", "monthly", "usd") == 59
    assert plan_price("team", "annual", "usd") == 49 * 12

    assert plan_price("solo", "monthly", "inr") == 1899
    assert plan_price("solo", "annual", "inr") == 1499 * 12
    assert plan_price("team", "monthly", "inr") == 4699
    assert plan_price("team", "annual", "inr") == 3899 * 12


def test_plan_limits() -> None:
    assert (PLANS["free"]["project_limit"], PLANS["free"]["member_limit"]) == (2, 2)
    assert PLANS["free"]["ai_credits_monthly"] == 20
    assert (PLANS["solo"]["project_limit"], PLANS["solo"]["member_limit"]) == (5, 5)
    assert PLANS["solo"]["ai_credits_monthly"] == 200
    assert (PLANS["team"]["project_limit"], PLANS["team"]["member_limit"]) == (20, 15)
    assert PLANS["team"]["ai_credits_monthly"] == 1000
    assert PLANS["enterprise"]["project_limit"] is None
    assert PLANS["enterprise"]["member_limit"] == 100


def test_effective_plan_lapses_after_period_end() -> None:
    now = datetime.now(UTC)
    assert (
        effective_plan_id({"plan": "team", "current_period_end": now + timedelta(days=1)}) == "team"
    )
    assert (
        effective_plan_id({"plan": "team", "current_period_end": now - timedelta(days=1)}) == "free"
    )
    assert effective_plan_id({"plan": "pro"}) == "free"
    assert effective_plan_id({}) == "free"


def test_checkout_and_verify_schemas() -> None:
    req = CheckoutRequest(plan_id="team", interval="annual", currency="usd", provider="stripe")
    assert (req.plan_id, req.interval, req.currency, req.provider) == (
        "team",
        "annual",
        "usd",
        "stripe",
    )

    verify_req = VerifyPaymentRequest(
        checkout_id="665f1c2b9d3e4a0012345678",
        razorpay_payment_id="pay_123456",
        razorpay_signature="sig_123456",
    )
    assert verify_req.razorpay_payment_id == "pay_123456"
