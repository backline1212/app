"""Billing and Plan Limit Schema Migration Script for MongoDB.
Ensures all additive indexes and backfills default plan limits on existing workspaces.
"""

import asyncio
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.db import close_client, get_db
from app.core.indexes import ensure_indexes


async def run_migration() -> None:
    settings = get_settings()
    print(f"Connecting to MongoDB at {settings.mongo_uri} (db: {settings.mongo_db_name})...")
    db = get_db()
    
    # 1. Ensure all indexes including additive BILLING_INDEXES
    print("Ensuring database indexes...")
    await ensure_indexes(db)
    print("✓ Database indexes up to date.")
    
    # 2. Backfill workspaces without plan_limits_json or default plan
    cursor = db.workspaces.find({})
    updated_count = 0
    async for ws in cursor:
        updates: dict[str, object] = {}
        
        if "plan" not in ws:
            updates["plan"] = "free"
            
        if "subscription_status" not in ws:
            updates["subscription_status"] = "active"
            
        if "billing_interval" not in ws:
            updates["billing_interval"] = "monthly"
            
        if "billing_currency" not in ws:
            updates["billing_currency"] = "usd"
            
        if "provider" not in ws:
            updates["provider"] = "free"
            
        if updates:
            updates["updated_at"] = datetime.now(UTC)
            await db.workspaces.update_one({"_id": ws["_id"]}, {"$set": updates})
            updated_count += 1
            
    print(f"✓ Workspaces checked. Backfilled {updated_count} workspace records.")
    await close_client()
    print("✓ Billing migration completed successfully.")


if __name__ == "__main__":
    asyncio.run(run_migration())
