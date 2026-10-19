"""Read-only, dry-run inventory for TDR-0064. Never marks an inbox verified.

Run from backend: python -m scripts.audit_email_verification_rollout
Reports aggregate counts only; no emails, passwords, token hashes or credentials.
"""

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

from app.core.db import close_client, get_db


async def run() -> dict[str, Any]:
    db = get_db()
    try:
        return {
            "mode": "dry-run",
            "accounts_needing_inbox_proof": await db.users.count_documents(
                {"email_verified_at": None}
            ),
            "passwords_retired_on_first_inbox_proof": await db.users.count_documents(
                {"email_verified_at": None, "password_hash": {"$type": "string"}}
            ),
            "currently_unrevoked_refresh_tokens": await db.refresh_tokens.count_documents(
                {"revoked_at": None, "expires_at": {"$gt": datetime.now(UTC)}}
            ),
            "currently_unrevoked_extension_tokens": await db.extension_tokens.count_documents(
                {"revoked_at": None}
            ),
            "currently_unrevoked_mcp_tokens": await db.mcp_personal_tokens.count_documents(
                {"revoked_at": None}
            ),
            "notice": "Legacy accounts must prove inbox ownership; credentials predating proof "
            "must sign in/reconnect. Counts of tokens are inventory, not affected-user counts.",
        }
    finally:
        await close_client()


if __name__ == "__main__":
    try:
        print(json.dumps(asyncio.run(run()), indent=2))
    except Exception as exc:
        # Driver exceptions can embed connection strings; the inventory reports no
        # secrets, including on network or authentication failures.
        print(f"Read-only audit unavailable ({type(exc).__name__}); no data changed.")
        raise SystemExit(1) from None
