from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


class ClientRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def list(
        self,
        workspace_id: str,
        include_archived: bool = False,
        hidden_project_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Clients with their project and ticket stats. Projects in
        `hidden_project_ids` (ones the reader can't open, TDR-0056) aren't counted."""
        hidden_oids = [oid for oid in map(to_object_id, hidden_project_ids or []) if oid]
        match: dict[str, Any] = {"workspace_id": workspace_id}
        if not include_archived:
            match["archived_at"] = None
        pipeline = [
            {"$match": match},
            {
                "$lookup": {
                    "from": "projects",
                    "let": {"client_id": {"$toString": "$_id"}},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {"$eq": ["$client_id", "$$client_id"]},
                                "workspace_id": workspace_id,
                                "archived_at": None,
                                "_id": {"$nin": hidden_oids},
                            }
                        },
                        {"$project": {"_id": 1}},
                    ],
                    "as": "_active_projects",
                }
            },
            {
                "$lookup": {
                    "from": "pages",
                    "let": {
                        "project_ids": {
                            "$map": {
                                "input": "$_active_projects",
                                "as": "p",
                                "in": {"$toString": "$$p._id"},
                            }
                        }
                    },
                    "pipeline": [
                        {"$match": {"$expr": {"$in": ["$project_id", "$$project_ids"]}}},
                        {"$project": {"_id": 1}},
                    ],
                    "as": "_pages",
                }
            },
            {
                "$lookup": {
                    "from": "comments",
                    "let": {
                        "page_ids": {
                            "$map": {"input": "$_pages", "as": "p", "in": {"$toString": "$$p._id"}}
                        }
                    },
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {"$in": ["$page_id", "$$page_ids"]},
                                "parent_id": None,
                                "deleted_at": None,
                            }
                        },
                        {
                            "$project": {
                                "status": 1,
                                "author_guest_id": 1,
                                "created_at": 1,
                                "edited_at": 1,
                            }
                        },
                    ],
                    "as": "_comments",
                }
            },
            {
                "$addFields": {
                    "stats": {
                        "active_projects_count": {"$size": "$_active_projects"},
                        "open_tickets_count": {
                            "$size": {
                                "$filter": {
                                    "input": "$_comments",
                                    "as": "c",
                                    "cond": {
                                        "$not": {"$in": ["$$c.status", ["resolved", "wont_fix"]]}
                                    },
                                }
                            }
                        },
                        "resolved_tickets_count": {
                            "$size": {
                                "$filter": {
                                    "input": "$_comments",
                                    "as": "c",
                                    "cond": {"$in": ["$$c.status", ["resolved", "wont_fix"]]},
                                }
                            }
                        },
                        "total_tickets_count": {"$size": "$_comments"},
                        "reviewers_count": {
                            "$size": {
                                "$setUnion": [
                                    {
                                        "$map": {
                                            "input": {
                                                "$filter": {
                                                    "input": "$_comments",
                                                    "as": "c",
                                                    "cond": {"$ne": ["$$c.author_guest_id", None]},
                                                }
                                            },
                                            "as": "c",
                                            "in": "$$c.author_guest_id",
                                        }
                                    },
                                    [],
                                ]
                            }
                        },
                        "last_activity_at": {
                            "$max": {
                                "$map": {
                                    "input": "$_comments",
                                    "as": "c",
                                    "in": {"$ifNull": ["$$c.edited_at", "$$c.created_at"]},
                                }
                            }
                        },
                    }
                }
            },
            {"$project": {"_active_projects": 0, "_pages": 0, "_comments": 0}},
            {"$sort": {"name": 1, "_id": 1}},
        ]
        return await self.db.clients.aggregate(pipeline).to_list(length=None)

    async def find(self, workspace_id: str, client_id: str) -> dict[str, Any] | None:
        return await self.db.clients.find_one(
            {"workspace_id": workspace_id, "_id": to_object_id(client_id), "archived_at": None}
        )

    async def find_archived(self, workspace_id: str, client_id: str) -> dict[str, Any] | None:
        return await self.db.clients.find_one(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(client_id),
                "archived_at": {"$ne": None},
            }
        )

    async def restore(self, workspace_id: str, client_id: str) -> None:
        await self.db.clients.update_one(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(client_id),
                "archived_at": {"$ne": None},
            },
            {"$set": {"archived_at": None, "updated_at": datetime.now(UTC)}},
        )

    async def create(self, workspace_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            **fields,
            "workspace_id": workspace_id,
            "created_at": now,
            "updated_at": now,
            "archived_at": None,
        }
        result = await self.db.clients.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def update(self, workspace_id: str, client_id: str, fields: dict[str, Any]) -> None:
        await self.db.clients.update_one(
            {"workspace_id": workspace_id, "_id": to_object_id(client_id), "archived_at": None},
            {"$set": {**fields, "updated_at": datetime.now(UTC)}},
        )
