"""A moved project's activity history (TDR-0245).

The old workspace always keeps its record. The destination gets a copy only when asked."""

from __future__ import annotations

import re
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import UpdateOne

from app.core.mongo_utils import to_object_id
from app.core.project_access import VISIBILITY_PRIVATE, access_settings
from app.modules.auth.repository import UserRepository

# What happened to the project's own content. Connections, credentials and who had
# access belong to the old workspace and are never copied.
_COPIED = (
    "comment",
    "anchor",
    "recovery",
    "page",
    "pages",
    "project",
    "share_link",
    "guest_session",
    "revision",
    "asset",
    "deployment",
)
_ISSUE_FILED = "integration.ticket_created"
# The destination records the arrival itself; "moved elsewhere" would read as nonsense.
_NEVER_COPIED = (
    "project.transferred_in",
    "project.transferred_out",
    "project.hard_deleted",
    "project.member_role_set",
    "project.member_removed",
    "project.access_updated",
    "project.access_changed",
    "project.duplicated",
)


def restricted_audience(project: dict[str, Any]) -> list[str] | None:
    """Who may still read a leaving project's history: for a private project, the people
    on its access list (owners and admins always can). None when it was open to all."""
    visibility, _, listed = access_settings(project)
    if visibility != VISIBILITY_PRIVATE:
        return None
    return [str(member["user_id"]) for member in listed]


class TransferActivityRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    @staticmethod
    def _about(
        workspace_id: str,
        project_id: str,
        page_ids: list[str],
        comment_ids: list[str],
        share_link_ids: list[str],
    ) -> dict[str, Any]:
        """Older events name only a comment, page or review link, not the project."""
        return {
            "workspace_id": workspace_id,
            "$or": [
                {"payload_json.project_id": project_id},
                {"payload_json.comment_id": {"$in": comment_ids}},
                {"payload_json.page_id": {"$in": page_ids}},
                {"payload_json.share_link_id": {"$in": share_link_ids}},
            ],
        }

    @staticmethod
    def _copyable(include_issues: bool) -> dict[str, Any]:
        prefixes = "|".join(re.escape(name) for name in _COPIED)
        kinds: list[dict[str, Any]] = [{"type": {"$regex": f"^({prefixes})\\."}}]
        if include_issues:
            kinds.append({"type": _ISSUE_FILED})
        return {"$and": [{"$or": kinds}, {"type": {"$nin": list(_NEVER_COPIED)}}]}

    async def count(
        self,
        workspace_id: str,
        project_id: str,
        page_ids: list[str],
        comment_ids: list[str],
        share_link_ids: list[str],
    ) -> int:
        query = self._about(workspace_id, project_id, page_ids, comment_ids, share_link_ids)
        return await self.db.events.count_documents({**query, **self._copyable(True)})

    async def carry(
        self,
        *,
        source_id: str,
        target_id: str,
        project_id: str,
        page_ids: list[str],
        comment_ids: list[str],
        share_link_ids: list[str],
        old_numbers: dict[str, int],
        copy: bool,
        include_issues: bool,
        restricted_to: list[str] | None,
        session: AsyncIOMotorClientSession,
    ) -> int:
        """Keeps the old workspace's entries readable (and, for a private project, still
        private) after the project leaves, and copies them to the destination when `copy`.
        Returns how many were copied. Must run before the project's records change
        workspace."""
        # A project coming back is covered by its own access list again.
        await self.db.events.update_many(
            {"workspace_id": target_id, "payload_json.project_id": project_id},
            {"$unset": {"payload_json.restricted_to": ""}},
            session=session,
        )
        query = self._about(source_id, project_id, page_ids, comment_ids, share_link_ids)
        events = await self.db.events.find(query, session=session).to_list(length=None)
        if not events:
            return 0
        guest_ids = [
            oid
            for doc in events
            if doc["actor_type"] == "guest" and (oid := to_object_id(doc.get("actor_id") or ""))
        ]
        guests = {
            str(doc["_id"]): doc.get("display_name")
            async for doc in self.db.guest_sessions.find(
                {"workspace_id": source_id, "_id": {"$in": guest_ids}},
                {"display_name": 1},
                session=session,
            )
        }

        copied = 0
        if copy:
            copied = await self._copy(
                source_id=source_id,
                target_id=target_id,
                project_id=project_id,
                events=await self.db.events.find(
                    {**query, **self._copyable(include_issues)}, session=session
                ).to_list(length=None),
                guests=guests,
                session=session,
            )

        # Guest sessions and tickets are about to leave, taking names and numbers with them.
        notes: list[UpdateOne] = []
        for doc in events:
            payload = doc["payload_json"]
            changes: dict[str, Any] = {"payload_json.project_id": project_id}
            guest = guests.get(str(doc.get("actor_id")))
            if guest:
                changes["payload_json.actor_name"] = guest
            ticket = payload.get("parent_id") or payload.get("comment_id")
            if isinstance(ticket, str) and ticket in old_numbers:
                changes["payload_json.ticket_number"] = old_numbers[ticket]
            update: dict[str, Any] = {"$set": changes}
            if restricted_to is None:
                update["$unset"] = {"payload_json.restricted_to": ""}
            else:
                changes["payload_json.restricted_to"] = restricted_to
            notes.append(UpdateOne({"_id": doc["_id"], "workspace_id": source_id}, update))
        await self.db.events.bulk_write(notes, session=session)
        return copied

    async def _copy(
        self,
        *,
        source_id: str,
        target_id: str,
        project_id: str,
        events: list[dict[str, Any]],
        guests: dict[str, Any],
        session: AsyncIOMotorClientSession,
    ) -> int:
        # A project that moves back and forth must not collect the same entry twice.
        origins = {str(doc["_id"]): str(doc.get("copied_from") or doc["_id"]) for doc in events}
        wanted = list(origins.values())
        present: set[str] = set()
        async for doc in self.db.events.find(
            {
                "workspace_id": target_id,
                "$or": [
                    {"_id": {"$in": [oid for oid in map(to_object_id, wanted) if oid]}},
                    {"copied_from": {"$in": wanted}},
                ],
            },
            {"copied_from": 1},
            session=session,
        ):
            present.add(str(doc["_id"]))
            if doc.get("copied_from"):
                present.add(str(doc["copied_from"]))

        member_ids = list(
            {
                str(doc["actor_id"])
                for doc in events
                if doc["actor_type"] == "member" and doc.get("actor_id")
            }
        )
        users = await UserRepository(self.db).find_many_by_ids(member_ids)
        copies = []
        for doc in events:
            origin = origins[str(doc["_id"])]
            if origin in present:
                continue
            actor = str(doc.get("actor_id"))
            name = (
                guests.get(actor)
                if doc["actor_type"] == "guest"
                else (users.get(actor) or {}).get("name")
            )
            payload = {**doc["payload_json"], "project_id": project_id}
            payload.pop("restricted_to", None)
            if name:
                payload["actor_name"] = name
            # No correlation_id: it is unique across the whole collection.
            copies.append(
                {
                    "workspace_id": target_id,
                    "type": doc["type"],
                    "actor_type": doc["actor_type"],
                    "actor_id": doc.get("actor_id"),
                    "payload_json": payload,
                    "created_at": doc["created_at"],
                    "copied_from": origin,
                }
            )
        if copies:
            await self.db.events.insert_many(copies, session=session)
        return len(copies)
