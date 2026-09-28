"""Merge pages that were registered with the dashboard canvas's own URL parameters.

Run from backend: python -m scripts.migrate_canvas_param_pages [--apply] [--workspace ID]

Dry-run by default: it reports exactly what it would move, rename and delete, and
changes nothing.

Before docs/tdr/0035 the Review SDK registered a page with the canvas's `blBrowser`
parameter (and, earlier still, `blMode`) left in its URL, so one real page became
several: one per capture-browser choice, plus the one guests register (their URL never
carries either). Registration now strips both (apps/widget/src/page-registration.ts);
this folds the pages created before that into the page the same URL registers as today.

Pages are grouped by project and stripped URL. When a page with the stripped URL
already exists, each duplicate's comments, revisions, revision diffs and browser renders
move onto it and the emptied duplicate is deleted. Otherwise the oldest duplicate is
renamed to the stripped URL and the others merge into it. Each duplicate moves in its
own transaction, which re-checks that nothing still references it before deleting it
(the same guard as pages/service.py's delete_page). A page may have only one current
revision, so a duplicate's current revision is demoted when the surviving page already
has one. A duplicate with an uploaded asset, or with a browser render the surviving page
already has for the same browser and viewport, is left untouched and reported. Events,
stored objects and indexes are never changed, and the script is safe to re-run.
"""

import argparse
import asyncio
import json
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.db import close_client, get_db
from app.modules.pages.url_normalize import normalize_url

CANVAS_PARAMS = frozenset({"blBrowser", "blMode"})
_CANDIDATE_PATTERN = r"[?&](?:blBrowser|blMode)(?:=|&|$)"
# Everything that points at a page by its id. project_assets is only ever checked, never
# moved: an asset is its page's uploaded file, so a page that has one is not a duplicate.
_MOVED_COLLECTIONS = ("comments", "revisions", "revision_diffs", "browser_renders")

Db = AsyncIOMotorDatabase[dict[str, Any]]


class _Skip(Exception):
    """Aborts one duplicate's transaction; the reason is reported, nothing is written."""


@dataclass
class _Group:
    workspace_id: str
    project_id: str
    stripped_url: str
    duplicates: list[dict[str, Any]] = field(default_factory=list)


def strip_canvas_params(url_normalized: str) -> str | None:
    """The URL registration produces today for a page stored with canvas parameters, or
    None when it carries none. Only the canvas's own segments are removed; the rest of
    the query string is kept byte-for-byte, since registration serialized it the same
    way (URLSearchParams) before and after the fix."""
    parts = urlsplit(url_normalized)
    if not parts.query:
        return None
    segments = parts.query.split("&")
    kept = [segment for segment in segments if segment.split("=", 1)[0] not in CANVAS_PARAMS]
    if len(kept) == len(segments):
        return None
    return normalize_url(urlunsplit((parts.scheme, parts.netloc, parts.path, "&".join(kept), "")))


def _render_key(doc: dict[str, Any]) -> tuple[Any, ...]:
    viewport = doc.get("viewport") or {}
    return (
        doc.get("browser"),
        viewport.get("width"),
        viewport.get("height"),
        doc.get("orientation"),
    )


async def _render_keys(
    db: Db, page_id: str, session: AsyncIOMotorClientSession | None = None
) -> set[tuple[Any, ...]]:
    cursor = db.browser_renders.find({"page_id": page_id}, session=session)
    return {_render_key(doc) async for doc in cursor}


async def _find_groups(db: Db, workspace_id: str | None) -> list[_Group]:
    query: dict[str, Any] = {"url_normalized": {"$regex": _CANDIDATE_PATTERN}}
    if workspace_id is not None:
        query["workspace_id"] = workspace_id
    groups: dict[tuple[str, str, str], _Group] = {}
    cursor = db.pages.find(query, sort=[("first_seen_at", 1), ("_id", 1)])
    async for page in cursor:
        stripped = strip_canvas_params(page["url_normalized"])
        if stripped is None:
            continue
        key = (page["workspace_id"], page["project_id"], stripped)
        group = groups.get(key)
        if group is None:
            group = groups[key] = _Group(page["workspace_id"], page["project_id"], stripped)
        group.duplicates.append(page)
    return list(groups.values())


async def _find_canonical(
    db: Db, group: _Group, session: AsyncIOMotorClientSession | None = None
) -> dict[str, Any] | None:
    return await db.pages.find_one(
        {
            "workspace_id": group.workspace_id,
            "project_id": group.project_id,
            "url_normalized": group.stripped_url,
        },
        session=session,
    )


async def _plan_group(db: Db, group: _Group) -> dict[str, Any]:
    """What apply would do for this group, computed from a read-only pass."""
    canonical = await _find_canonical(db, group)
    duplicates = list(group.duplicates)
    renamed: dict[str, Any] | None = None
    if canonical is None:
        renamed = duplicates.pop(0)
        survivor = renamed
    else:
        survivor = canonical
    survivor_id = str(survivor["_id"])
    survivor_keys = await _render_keys(db, survivor_id)
    survivor_has_current = (
        await db.revisions.count_documents({"page_id": survivor_id, "is_current": True}) > 0
    )

    merges: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for dup in duplicates:
        dup_id = str(dup["_id"])
        if await db.project_assets.count_documents({"page_id": dup_id}):
            skipped.append({"page_id": dup_id, "reason": "has_asset"})
            continue
        dup_keys = await _render_keys(db, dup_id)
        if dup_keys & survivor_keys:
            skipped.append({"page_id": dup_id, "reason": "browser_render_conflict"})
            continue
        survivor_keys |= dup_keys
        moves = {
            name: await db[name].count_documents({"page_id": dup_id}) for name in _MOVED_COLLECTIONS
        }
        dup_has_current = (
            await db.revisions.count_documents({"page_id": dup_id, "is_current": True}) > 0
        )
        merges.append(
            {
                "page_id": dup_id,
                "url_normalized": dup["url_normalized"],
                "moves": moves,
                "demotes_current_revision": dup_has_current and survivor_has_current,
            }
        )
        survivor_has_current = survivor_has_current or dup_has_current

    return {
        "workspace_id": group.workspace_id,
        "project_id": group.project_id,
        "url_normalized": group.stripped_url,
        "survivor_page_id": survivor_id,
        "renamed_from": renamed["url_normalized"] if renamed is not None else None,
        "merges": merges,
        "skipped": skipped,
    }


async def _merge_one(db: Db, *, workspace_id: str, dup_id: str, survivor_id: str) -> dict[str, int]:
    """Moves one duplicate onto the survivor and deletes it, all or nothing."""
    moved: dict[str, int] = {}

    async def _run(session: AsyncIOMotorClientSession) -> None:
        moved.clear()
        if await db.project_assets.count_documents({"page_id": dup_id}, session=session):
            raise _Skip("has_asset")
        if await _render_keys(db, dup_id, session) & await _render_keys(db, survivor_id, session):
            raise _Skip("browser_render_conflict")

        survivor_current = await db.revisions.find_one(
            {"page_id": survivor_id, "is_current": True}, session=session
        )
        if survivor_current is not None:
            # Must happen before the move: revisions_page_current_unique allows one
            # current revision per page.
            await db.revisions.update_many(
                {"workspace_id": workspace_id, "page_id": dup_id, "is_current": True},
                {"$set": {"is_current": False}},
                session=session,
            )
        adopted_current = None
        if survivor_current is None:
            adopted_current = await db.revisions.find_one(
                {"workspace_id": workspace_id, "page_id": dup_id, "is_current": True},
                session=session,
            )

        for name in _MOVED_COLLECTIONS:
            result = await db[name].update_many(
                {"workspace_id": workspace_id, "page_id": dup_id},
                {"$set": {"page_id": survivor_id}},
                session=session,
            )
            moved[name] = result.modified_count

        # Unscoped on purpose: a legacy record missing workspace_id would not have moved
        # above, and deleting the page would orphan it.
        for name in (*_MOVED_COLLECTIONS, "project_assets"):
            if await db[name].count_documents({"page_id": dup_id}, session=session):
                raise _Skip(f"still_referenced_by_{name}")

        if adopted_current is not None:
            await db.pages.update_one(
                {
                    "_id": ObjectId(survivor_id),
                    "workspace_id": workspace_id,
                    "latest_revision_id": None,
                },
                {"$set": {"latest_revision_id": str(adopted_current["_id"])}},
                session=session,
            )
        await db.pages.delete_one(
            {"_id": ObjectId(dup_id), "workspace_id": workspace_id}, session=session
        )

    async with await db.client.start_session() as session:
        await session.with_transaction(_run)
    return dict(moved)


async def _apply_group(db: Db, group: _Group) -> dict[str, Any]:
    canonical = await _find_canonical(db, group)
    duplicates = list(group.duplicates)
    renamed_from: str | None = None
    if canonical is None:
        first = duplicates[0]
        try:
            result = await db.pages.update_one(
                {
                    "_id": first["_id"],
                    "workspace_id": group.workspace_id,
                    "url_normalized": first["url_normalized"],
                },
                {"$set": {"url_normalized": group.stripped_url}},
            )
        except DuplicateKeyError:
            # The real URL was registered after the read above; merge into that instead.
            canonical = await _find_canonical(db, group)
        else:
            if result.modified_count:
                renamed_from = first["url_normalized"]
            duplicates.pop(0)
            canonical = await _find_canonical(db, group)
    if canonical is None:
        return {
            "url_normalized": group.stripped_url,
            "skipped": [
                {"page_id": str(d["_id"]), "reason": "survivor_missing"} for d in duplicates
            ],
        }

    survivor_id = str(canonical["_id"])
    merged: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for dup in duplicates:
        dup_id = str(dup["_id"])
        if dup_id == survivor_id:
            continue
        try:
            moves = await _merge_one(
                db, workspace_id=group.workspace_id, dup_id=dup_id, survivor_id=survivor_id
            )
        except _Skip as reason:
            skipped.append({"page_id": dup_id, "reason": str(reason)})
            continue
        merged.append({"page_id": dup_id, "moves": moves})
    return {
        "workspace_id": group.workspace_id,
        "project_id": group.project_id,
        "url_normalized": group.stripped_url,
        "survivor_page_id": survivor_id,
        "renamed_from": renamed_from,
        "merged": merged,
        "skipped": skipped,
    }


async def migrate(*, apply: bool, workspace_id: str | None) -> dict[str, Any]:
    db = get_db()
    groups = await _find_groups(db, workspace_id)
    results = [await (_apply_group(db, g) if apply else _plan_group(db, g)) for g in groups]

    merge_key = "merged" if apply else "merges"
    totals: dict[str, int] = defaultdict(int)
    for result in results:
        for merge in result.get(merge_key, []):
            for name, count in merge["moves"].items():
                totals[name] += count
    pages_merged = sum(len(r.get(merge_key, [])) for r in results)
    return {
        "mode": "apply" if apply else "dry-run",
        "groups": len(groups),
        "pages_renamed": sum(1 for r in results if r.get("renamed_from")),
        "pages_merged": pages_merged,
        "records_moved": dict(totals),
        "skipped": [
            {"url_normalized": r["url_normalized"], **skip}
            for r in results
            for skip in r.get("skipped", [])
        ],
        "sample": results[:20],
        "documents_deleted": pages_merged if apply else 0,
        "indexes_dropped": 0,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Merge and delete the pages (default: dry-run)."
    )
    parser.add_argument("--workspace", default=None, help="Limit to one workspace id.")
    args = parser.parse_args()
    try:
        result = await migrate(apply=args.apply, workspace_id=args.workspace)
        print(json.dumps(result, indent=2, default=str))
    finally:
        await close_client()


if __name__ == "__main__":
    asyncio.run(main())
