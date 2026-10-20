"""Inspect additive creation/upload request indexes; writes require --apply."""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db
from app.core.indexes import CREATION_REQUEST_INDEXES, ensure_additive_indexes


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    missing: list[str] = []
    present: list[str] = []
    conflicts: list[str] = []
    try:
        for spec in CREATION_REQUEST_INDEXES:
            actual = (await db[spec.collection].index_information()).get(spec.name)
            if actual is None:
                missing.append(spec.name)
            elif (
                actual.get("key") != list(spec.keys)
                or not actual.get("unique")
                or actual.get("partialFilterExpression") != spec.options["partialFilterExpression"]
            ):
                conflicts.append(spec.name)
            else:
                present.append(spec.name)
            # workspace-scope-exempt: read-only, internal cross-tenant index preflight;
            # report only whether duplicates exist, never tenant/contact/request values.
            duplicates = (
                await db[spec.collection]
                .aggregate(
                    [
                        {"$match": {"client_request_id": {"$type": "string"}}},
                        {
                            "$group": {
                                "_id": {
                                    "workspace": "$workspace_id",
                                    "request": "$client_request_id",
                                },
                                "n": {"$sum": 1},
                            }
                        },
                        {"$match": {"n": {"$gt": 1}}},
                        {"$limit": 1},
                    ]
                )
                .to_list(1)
            )
            if duplicates:
                conflicts.append(f"{spec.name}:duplicate-requests")
        if apply and conflicts:
            raise RuntimeError("Conflicts found; no indexes changed.")
        if apply:
            await ensure_additive_indexes(db, CREATION_REQUEST_INDEXES)
        return {
            "mode": "apply" if apply else "dry-run",
            "present": present,
            "would_create": missing,
            "conflicts": conflicts,
            "created": missing if apply else [],
            "business_data_modified": False,
        }
    finally:
        await close_client()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        print(json.dumps(asyncio.run(run(apply=parser.parse_args().apply)), indent=2))
    except Exception as exc:
        print(f"Creation index inspection/apply unavailable ({type(exc).__name__}).")
        raise SystemExit(1) from None
