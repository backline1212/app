"""Encrypt the webhook URLs of existing Slack, Discord and Teams integrations (TDR-0231).

Run from backend: python -m scripts.migrate_encrypt_chat_webhooks [--apply]

Dry-run by default: it counts the integrations it would change and changes nothing.

A chat webhook URL is the integration's credential. New integrations store it as
`webhook_url_encrypted`; this moves older rows' plain `webhook_url` into that field and
removes the plain one. Readers accept either (core/encryption.py chat_webhook_url), so
the app works before, during and after this runs.
"""

import argparse
import asyncio
import json
from typing import Any

from app.core.db import close_client, get_db
from app.core.encryption import decrypt_secret, encrypt_secret


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    try:
        per_type: dict[str, int] = {}
        changed = 0
        # workspace-scope-exempt: operator migration over every workspace's integrations
        rows = db.integrations.find(
            {
                "type": {"$in": ["slack", "discord", "teams"]},
                "config_json.webhook_url": {"$type": "string"},
            },
            projection={"type": 1, "workspace_id": 1, "config_json.webhook_url": 1},
        )
        async for row in rows:
            per_type[row["type"]] = per_type.get(row["type"], 0) + 1
            if not apply:
                continue
            url = row["config_json"]["webhook_url"]
            encrypted = encrypt_secret(url)
            assert decrypt_secret(encrypted) == url
            result = await db.integrations.update_one(
                {
                    "_id": row["_id"],
                    "workspace_id": row["workspace_id"],
                    "config_json.webhook_url": url,
                },
                {
                    "$set": {"config_json.webhook_url_encrypted": encrypted},
                    "$unset": {"config_json.webhook_url": ""},
                },
            )
            changed += result.modified_count
        return {
            "apply": apply,
            "found": sum(per_type.values()),
            "by_type": per_type,
            "encrypted": changed,
        }
    finally:
        await close_client()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(run(apply=args.apply)), indent=2))


if __name__ == "__main__":
    main()
