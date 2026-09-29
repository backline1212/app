"""MongoDB repository for billing events, invoices and workspace subscription records."""

from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


class BillingRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create_billing_event(
        self,
        *,
        workspace_id: str,
        event_type: str,
        provider: str,
        amount: float,
        currency: str,
        plan_id: str,
        interval: str,
        provider_event_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "workspace_id": workspace_id,
            "event_type": event_type,
            "provider": provider,
            "provider_event_id": provider_event_id,
            "amount": amount,
            "currency": currency,
            "plan_id": plan_id,
            "interval": interval,
            "metadata": metadata or {},
            "created_at": now,
        }
        result = await self.db.billing_events.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def list_billing_events(
        self, workspace_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        cursor = (
            self.db.billing_events.find({"workspace_id": workspace_id})
            .sort("created_at", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def create_invoice(
        self,
        *,
        workspace_id: str,
        invoice_number: str,
        amount_paid: float,
        currency: str,
        plan_id: str,
        plan_name: str,
        interval: str,
        provider: str,
        period_start: datetime,
        period_end: datetime,
        provider_invoice_id: str | None = None,
        hosted_invoice_url: str | None = None,
        pdf_url: str | None = None,
        status: str = "paid",
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "workspace_id": workspace_id,
            "invoice_number": invoice_number,
            "amount_paid": amount_paid,
            "currency": currency,
            "plan_id": plan_id,
            "plan_name": plan_name,
            "interval": interval,
            "status": status,
            "provider": provider,
            "provider_invoice_id": provider_invoice_id,
            "hosted_invoice_url": hosted_invoice_url,
            "pdf_url": pdf_url,
            "period_start": period_start,
            "period_end": period_end,
            "paid_at": now,
            "created_at": now,
        }
        result = await self.db.invoices.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def list_invoices(
        self, workspace_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        cursor = (
            self.db.invoices.find({"workspace_id": workspace_id})
            .sort("created_at", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def find_invoice_by_id(self, invoice_id: str) -> dict[str, Any] | None:
        try:
            query: dict[str, Any] = {"_id": ObjectId(invoice_id)}
        except Exception:
            query = {"invoice_number": invoice_id}
        return await self.db.invoices.find_one(query)

    async def generate_next_invoice_number(self, workspace_id: str) -> str:
        count = await self.db.invoices.count_documents({"workspace_id": workspace_id})
        year = datetime.now(UTC).year
        return f"INV-{year}-{(count + 1):04d}"

    async def update_workspace_billing(
        self,
        workspace_id: str,
        *,
        plan: str,
        plan_limits_json: dict[str, Any],
        subscription_status: str = "active",
        billing_interval: str = "monthly",
        billing_currency: str = "usd",
        provider: str = "stripe",
        stripe_customer_id: str | None = None,
        stripe_subscription_id: str | None = None,
        razorpay_customer_id: str | None = None,
        razorpay_subscription_id: str | None = None,
        current_period_start: datetime | None = None,
        current_period_end: datetime | None = None,
        cancel_at_period_end: bool = False,
    ) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        updates: dict[str, Any] = {
            "plan": plan,
            "plan_limits_json": plan_limits_json,
            "subscription_status": subscription_status,
            "billing_interval": billing_interval,
            "billing_currency": billing_currency,
            "provider": provider,
            "cancel_at_period_end": cancel_at_period_end,
            "updated_at": now,
        }
        if stripe_customer_id is not None:
            updates["stripe_customer_id"] = stripe_customer_id
        if stripe_subscription_id is not None:
            updates["stripe_subscription_id"] = stripe_subscription_id
        if razorpay_customer_id is not None:
            updates["razorpay_customer_id"] = razorpay_customer_id
        if razorpay_subscription_id is not None:
            updates["razorpay_subscription_id"] = razorpay_subscription_id
        if current_period_start is not None:
            updates["current_period_start"] = current_period_start
        if current_period_end is not None:
            updates["current_period_end"] = current_period_end

        try:
            ws_oid = ObjectId(workspace_id)
            query: dict[str, Any] = {"_id": ws_oid}
        except Exception:
            query = {"_id": workspace_id}

        await self.db.workspaces.update_one(query, {"$set": updates})
        return await self.db.workspaces.find_one(query)
