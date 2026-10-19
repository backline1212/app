"""Additive indexes only; default read-only inspection. Never changes review data."""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db
from app.core.indexes import REVIEW_PERSISTENCE_INDEXES, ensure_additive_indexes


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    missing: list[str] = []
    present: list[str] = []
    conflicts: list[str] = []
    try:
        for spec in REVIEW_PERSISTENCE_INDEXES:
            actual = (await db[spec.collection].index_information()).get(spec.name)
            if actual is None:
                missing.append(spec.name)
            elif actual.get("key") != list(spec.keys) or actual.get("unique", False):
                conflicts.append(spec.name)
            else:
                present.append(spec.name)
        if apply and conflicts:
            raise RuntimeError("Existing index definitions conflict; no indexes changed.")
        if apply:
            await ensure_additive_indexes(db, REVIEW_PERSISTENCE_INDEXES)
        return {
            "mode": "apply" if apply else "dry-run",
            "present": present,
            "would_create": missing,
            "conflicts": conflicts,
            "created": missing if apply else [],
            "review_data_modified": False,
        }
    finally:
        await close_client()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        print(json.dumps(asyncio.run(run(apply=parser.parse_args().apply)), indent=2))
    except Exception as exc:
        print(f"Persistence index inspection/apply unavailable ({type(exc).__name__}).")
        raise SystemExit(1) from None
