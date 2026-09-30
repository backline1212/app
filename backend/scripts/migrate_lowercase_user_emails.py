"""Lowercase stored sign-in emails (docs/tdr/0053).

Run from backend: python -m scripts.migrate_lowercase_user_emails [--apply]

Dry-run by default: it reports every user whose stored email has capitals, and changes
nothing. With --apply it lowercases those that don't collide with another account.

Nothing depends on this having run - UserRepository.find_by_email also matches a
mixed-case address case-insensitively. It only makes lookups hit the index directly.

Two accounts whose addresses differ only in case (e.g. an invite to "Bob@acme.com" and
a Google sign-in as "bob@acme.com") are reported as conflicts and left alone. Merging
them means moving memberships and authored content, which is a decision for a person.
"""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db
from app.core.email_address import normalize_email


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    try:
        to_lowercase: list[dict[str, str]] = []
        conflicts: list[dict[str, Any]] = []
        async for user in db.users.find({"email": {"$regex": "[A-Z]"}}, projection={"email": 1}):
            normalized = normalize_email(user["email"])
            clash = await db.users.find_one(
                {"email": normalized, "_id": {"$ne": user["_id"]}}, projection={"_id": 1}
            )
            if clash is not None:
                conflicts.append(
                    {
                        "user_id": str(user["_id"]),
                        "email": user["email"],
                        "conflicts_with_user_id": str(clash["_id"]),
                    }
                )
                continue
            to_lowercase.append({"user_id": str(user["_id"]), "email": user["email"]})
            if apply:
                await db.users.update_one({"_id": user["_id"]}, {"$set": {"email": normalized}})
    finally:
        await close_client()
    return {
        "mode": "apply" if apply else "dry-run",
        "lowercased" if apply else "would_lowercase": to_lowercase,
        "conflicts_left_alone": conflicts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="lowercase the stored emails")
    args = parser.parse_args()
    report = asyncio.run(run(apply=args.apply))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
