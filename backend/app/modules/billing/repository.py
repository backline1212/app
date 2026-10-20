"""MongoDB access for checkouts, invoices, billing events, AI usage and plan fields."""

from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.mongo_utils import to_object_id
from app.modules.projects.repository import EXCLUDE_UNTOUCHED_SAMPLE

MongoSession = AsyncIOMotorClientSession | None


class BillingRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    # -- checkouts -------------------------------------------------------------------
    # One document per checkout attempt. The plan, interval, currency and amount are
    # fixed here when the checkout is created, so confirming a payment never trusts a
    # plan named by the client, and the pending -> paid transition in claim_checkout is
    # what makes activation happen exactly once across the browser confirm and webhooks.

    async def create_checkout(
        self,
        *,
        checkout_id: ObjectId,
        workspace_id: str,
        user_id: str,
        provider: str,
        reference: str,
        plan_id: str,
        interval: str,
        currency: str,
        amount_minor: int,
    ) -> dict[str, Any]:
        doc = {
            "_id": checkout_id,
            "workspace_id": workspace_id,
            "created_by": user_id,
            "provider": provider,
            "reference": reference,
            "plan_id": plan_id,
            "interval": interval,
            "currency": currency,
            "amount_minor": amount_minor,
            "status": "pending",
            "created_at": datetime.now(UTC),
        }
        await self.db.billing_checkouts.insert_one(doc)
        return doc

    async def find_checkout(self, workspace_id: str, checkout_id: str) -> dict[str, Any] | None:
        oid = to_object_id(checkout_id)
        if oid is None:
            return None
        return await self.db.billing_checkouts.find_one({"workspace_id": workspace_id, "_id": oid})

    async def find_checkout_by_reference(
        self, provider: str, reference: str
    ) -> dict[str, Any] | None:
        # workspace-scope-exempt: webhooks carry no session, only the gateway's own
        # session/order id, which is unique per (provider, reference) and was minted
        # for exactly one workspace's checkout; the workspace comes from the match.
        return await self.db.billing_checkouts.find_one(
            {"provider": provider, "reference": reference}
        )

    async def claim_checkout(
        self,
        workspace_id: str,
        checkout_id: ObjectId,
        *,
        provider_payment_id: str | None,
        session: MongoSession = None,
    ) -> bool:
        """Atomically moves a checkout from pending to paid. Only the first caller gets
        True; a duplicate webhook or a second browser confirm gets False and must not
        activate or invoice again."""
        result = await self.db.billing_checkouts.update_one(
            {"workspace_id": workspace_id, "_id": checkout_id, "status": "pending"},
            {
                "$set": {
                    "status": "paid",
                    "provider_payment_id": provider_payment_id,
                    "paid_at": datetime.now(UTC),
                }
            },
            session=session,
        )
        return result.modified_count == 1

    # -- invoices --------------------------------------------------------------------

    async def next_invoice_number(self, year: int, *, session: MongoSession = None) -> str:
        """INV-YYYY-NNNN, sequential per calendar year across the whole service - the
        seller issues the invoices, so numbering is per seller rather than per customer.
        find_one_and_update keeps two concurrent payments from sharing a number."""
        doc = await self.db.counters.find_one_and_update(
            {"_id": f"invoices:{year}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
            session=session,
        )
        return f"INV-{year}-{int(doc['seq']):04d}"

    async def create_invoice(self, doc: dict[str, Any], *, session: MongoSession = None) -> None:
        await self.db.invoices.insert_one(
            {**doc, "status": "paid", "created_at": datetime.now(UTC)}, session=session
        )

    async def list_invoices(self, workspace_id: str, limit: int = 100) -> list[dict[str, Any]]:
        cursor = (
            self.db.invoices.find({"workspace_id": workspace_id})
            .sort("created_at", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    # -- billing audit trail ---------------------------------------------------------

    async def create_billing_event(
        self,
        *,
        workspace_id: str,
        event_type: str,
        provider: str | None,
        plan_id: str,
        amount_minor: int = 0,
        currency: str | None = None,
        interval: str | None = None,
        metadata: dict[str, Any] | None = None,
        session: MongoSession = None,
    ) -> None:
        await self.db.billing_events.insert_one(
            {
                "workspace_id": workspace_id,
                "event_type": event_type,
                "provider": provider,
                "plan_id": plan_id,
                "amount_minor": amount_minor,
                "currency": currency,
                "interval": interval,
                "metadata": metadata or {},
                "created_at": datetime.now(UTC),
            },
            session=session,
        )

    # -- usage -----------------------------------------------------------------------

    async def serialize_plan_changes(
        self, workspace_id: str, *, session: AsyncIOMotorClientSession
    ) -> bool:
        """All capacity-increasing writes contend on the same workspace document."""
        result = await self.db.workspaces.update_one(
            {"_id": to_object_id(workspace_id)},
            {"$inc": {"plan_write_version": 1}},
            session=session,
        )
        return result.matched_count == 1

    async def count_active_projects(
        self, workspace_id: str, *, session: MongoSession = None
    ) -> int:
        return await self.db.projects.count_documents(
            {"workspace_id": workspace_id, "archived_at": None, **EXCLUDE_UNTOUCHED_SAMPLE},
            session=session,
        )

    async def count_members(self, workspace_id: str, *, session: MongoSession = None) -> int:
        return await self.db.memberships.count_documents(
            {"workspace_id": workspace_id}, session=session
        )

    @staticmethod
    def active_ai_usage(workspace_id: str, since: datetime) -> dict[str, Any]:
        # Missing status is a completed legacy credit. Expired reservations release
        # capacity after a crashed process without deleting billing history.
        return {
            "workspace_id": workspace_id,
            "created_at": {"$gte": since},
            "$or": [
                {"status": None},
                {"status": "completed"},
                {"status": "reserved", "expires_at": {"$gt": datetime.now(UTC)}},
            ],
        }

    async def count_ai_credits_since(
        self, workspace_id: str, since: datetime, *, session: MongoSession = None
    ) -> int:
        return await self.db.ai_usage.count_documents(
            self.active_ai_usage(workspace_id, since), session=session
        )

    async def reserve_ai_credit(
        self,
        workspace_id: str,
        *,
        action: str,
        user_id: str | None,
        created_at: datetime,
        expires_at: datetime,
        session: AsyncIOMotorClientSession,
    ) -> str:
        result = await self.db.ai_usage.insert_one(
            {
                "workspace_id": workspace_id,
                "action": action,
                "user_id": user_id,
                "created_at": created_at,
                "expires_at": expires_at,
                "status": "reserved",
            },
            session=session,
        )
        return str(result.inserted_id)

    async def finish_ai_credit(
        self, workspace_id: str, reservation_id: str, *, completed: bool
    ) -> bool:
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "_id": to_object_id(reservation_id),
            "status": "reserved",
        }
        if completed:
            query["expires_at"] = {"$gt": datetime.now(UTC)}
        result = await self.db.ai_usage.update_one(
            query,
            {
                "$set": {
                    "status": "completed" if completed else "released",
                    "finished_at": datetime.now(UTC),
                },
                "$unset": {"expires_at": ""},
            },
        )
        return result.modified_count == 1

    async def ai_usage_breakdown(
        self, workspace_id: str, *, period_start: datetime
    ) -> dict[str, list[dict[str, Any]]]:
        """This period's credits grouped by feature, by member and by UTC day. Credits
        recorded before members were tracked group under a null user_id."""
        pipeline: list[dict[str, Any]] = [
            {"$match": self.active_ai_usage(workspace_id, period_start)},
            {
                "$facet": {
                    "by_action": [{"$group": {"_id": "$action", "count": {"$sum": 1}}}],
                    "by_member": [
                        {"$group": {"_id": {"$ifNull": ["$user_id", None]}, "count": {"$sum": 1}}}
                    ],
                    "by_day": [
                        {
                            "$group": {
                                "_id": {
                                    "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                                },
                                "count": {"$sum": 1},
                            }
                        }
                    ],
                }
            },
        ]
        rows = await self.db.ai_usage.aggregate(pipeline).to_list(1)
        return rows[0] if rows else {"by_action": [], "by_member": [], "by_day": []}

    async def ai_usage_by_month(self, workspace_id: str, *, since: datetime) -> dict[str, int]:
        """Credits per UTC calendar month ("YYYY-MM") from `since` on."""
        pipeline: list[dict[str, Any]] = [
            {"$match": self.active_ai_usage(workspace_id, since)},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m", "date": "$created_at"}},
                    "count": {"$sum": 1},
                }
            },
        ]
        return {row["_id"]: row["count"] async for row in self.db.ai_usage.aggregate(pipeline)}

    # -- workspace plan fields -------------------------------------------------------

    async def find_workspace(
        self, workspace_id: str, *, session: MongoSession = None
    ) -> dict[str, Any] | None:
        oid = to_object_id(workspace_id)
        if oid is None:
            return None
        return await self.db.workspaces.find_one({"_id": oid}, session=session)

    async def set_workspace_billing(
        self, workspace_id: str, fields: dict[str, Any], *, session: MongoSession = None
    ) -> None:
        oid = to_object_id(workspace_id)
        if oid is None:
            return
        await self.db.workspaces.update_one(
            {"_id": oid},
            {"$set": {**fields, "updated_at": datetime.now(UTC)}},
            session=session,
        )
