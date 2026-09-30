"""Flag each workspace's seeded "Example Project" as the sample (docs/tdr/0053).

Run from backend: python -m scripts.migrate_mark_sample_projects [--apply]

Dry-run by default: it reports the projects it would flag and changes nothing.

Projects seeded before `is_sample` existed count against the plan's project limit, so
those workspaces get one real project fewer than their plan says. A project is taken to
be the seeded one only if all of these hold:
- it is named "Example Project";
- it still points at the sample site;
- it was created within a minute of its workspace.
A sample renamed or pointed at a real site is left alone, as the live code would count
it anyway.
"""

import argparse
import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.db import close_client, get_db
from app.core.mongo_utils import to_object_id
from app.modules.projects.repository import SAMPLE_PROJECT_ORIGIN
from app.modules.workspaces.onboarding import SAMPLE_PROJECT_NAME

_SEED_WINDOW = timedelta(minutes=1)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def run(*, apply: bool) -> dict[str, Any]:
    db = get_db()
    try:
        flagged: list[dict[str, str]] = []
        async for project in db.projects.find(
            {
                "name": SAMPLE_PROJECT_NAME,
                "target_origin": SAMPLE_PROJECT_ORIGIN,
                "is_sample": {"$exists": False},
            },
            projection={"workspace_id": 1, "created_at": 1},
        ):
            workspace = await db.workspaces.find_one(
                {"_id": to_object_id(project["workspace_id"])}, projection={"created_at": 1}
            )
            created = project.get("created_at")
            seeded_at = workspace.get("created_at") if workspace else None
            if not isinstance(created, datetime) or not isinstance(seeded_at, datetime):
                continue
            if abs(_aware(created) - _aware(seeded_at)) > _SEED_WINDOW:
                continue
            flagged.append(
                {"project_id": str(project["_id"]), "workspace_id": project["workspace_id"]}
            )
            if apply:
                await db.projects.update_one(
                    {"_id": project["_id"], "workspace_id": project["workspace_id"]},
                    {"$set": {"is_sample": True}},
                )
    finally:
        await close_client()
    return {"mode": "apply" if apply else "dry-run", "flagged" if apply else "would_flag": flagged}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="flag the seeded projects")
    args = parser.parse_args()
    report = asyncio.run(run(apply=args.apply))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
