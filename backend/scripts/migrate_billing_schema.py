"""Create the billing indexes (docs/tdr/0052).

Run from backend: python -m scripts.migrate_billing_schema [--apply]

Dry-run by default: it reports which BILLING_INDEXES are missing and changes nothing.
No workspace documents need a backfill - a workspace without billing fields reads as
Free (billing/plans.py's effective_plan_id), which is what every existing workspace is.
The API also creates these indexes at startup; this script is for applying them ahead
of a deploy and for checking a database.
"""

import argparse
import asyncio
import json

from app.core.db import close_client, get_db
from app.core.indexes import BILLING_INDEXES, ensure_additive_indexes


async def run(*, apply: bool) -> dict[str, object]:
    db = get_db()
    try:
        missing: list[str] = []
        for spec in BILLING_INDEXES:
            existing = await db[spec.collection].index_information()
            if spec.name not in existing:
                missing.append(f"{spec.collection}.{spec.name}")
        if apply and missing:
            await ensure_additive_indexes(db, BILLING_INDEXES)
    finally:
        await close_client()
    return {"mode": "apply" if apply else "dry-run", "missing_indexes": missing}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="create the missing indexes")
    args = parser.parse_args()
    report = asyncio.run(run(apply=args.apply))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
