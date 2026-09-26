import re
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id
from app.modules.dashboard.schemas import TicketFilters


def root_pipeline(workspace_id: str) -> list[dict[str, Any]]:
    """Legacy comments derive project_id through their real page; standalone uses the same join."""
    return [
        {"$match": {"workspace_id": workspace_id, "deleted_at": None, "parent_id": None}},
        {
            "$set": {
                "_page_oid": {
                    "$convert": {
                        "input": "$page_id",
                        "to": "objectId",
                        "onError": None,
                        "onNull": None,
                    }
                },
                "assignee_ids": {
                    "$ifNull": [
                        "$assignee_ids",
                        {"$cond": [{"$ifNull": ["$assignee_id", False]}, ["$assignee_id"], []]},
                    ]
                },
                "priority": {"$ifNull": ["$priority", "medium"]},
            }
        },
        {
            "$lookup": {
                "from": "pages",
                "localField": "_page_oid",
                "foreignField": "_id",
                "as": "_page",
            }
        },
        {"$unwind": "$_page"},
        {"$match": {"_page.workspace_id": workspace_id}},
        {
            "$set": {
                "_project_oid": {
                    "$convert": {
                        "input": "$_page.project_id",
                        "to": "objectId",
                        "onError": None,
                        "onNull": None,
                    }
                }
            }
        },
        {
            "$lookup": {
                "from": "projects",
                "localField": "_project_oid",
                "foreignField": "_id",
                "as": "_project",
            }
        },
        {"$unwind": "$_project"},
        {"$match": {"_project.workspace_id": workspace_id, "_project.archived_at": None}},
    ]


class DashboardRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def tickets(
        self, workspace_id: str, user_id: str, filters: TicketFilters
    ) -> dict[str, Any]:
        pipeline = root_pipeline(workspace_id)
        match: dict[str, Any] = {"workspace_id": workspace_id}
        if filters.comment_id:
            match["_id"] = to_object_id(filters.comment_id)
        for key in ("status", "priority"):
            value = getattr(filters, key)
            if value:
                match[key] = value
        if filters.project_id:
            match["_page.project_id"] = filters.project_id
        if filters.tag:
            match["tags"] = filters.tag
        if filters.search.strip():
            escaped = re.escape(filters.search.strip())
            match["$or"] = [
                {key: {"$regex": escaped, "$options": "i"}}
                for key in ("body", "_project.name", "_page.title")
            ]
        if filters.view == "mine":
            match.setdefault("$and", []).append({"assignee_ids": user_id})
        elif filters.view == "reply":
            match["waiting_on_ids"] = user_id
        elif filters.view == "client":
            match["waiting_on_client"] = True
        elif filters.view == "overdue":
            match["due_at"] = {
                "$lt": datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0),
                "$ne": None,
            }
        if filters.view in ("reply", "client", "overdue"):
            match.setdefault("$and", []).append({"status": {"$nin": ["resolved", "wont_fix"]}})
        pipeline.append({"$match": match})
        pipeline.append(
            {
                "$set": {
                    "_due": {"$ifNull": ["$due_at", datetime(9999, 1, 1, tzinfo=UTC)]},
                    "_priority": {"$indexOfArray": [["high", "medium", "low"], "$priority"]},
                    # Finished work sinks below open work whatever the chosen order.
                    "_closed": {"$in": ["$status", ["resolved", "wont_fix"]]},
                    # "\uffff" sorts after every real value, so untagged tickets go last.
                    "_tag": {"$ifNull": [{"$arrayElemAt": ["$tags", 0]}, "\uffff"]},
                    "_status": {
                        "$indexOfArray": [
                            ["todo", "in_progress", "in_review", "blocked", "resolved", "wont_fix"],
                            "$status",
                        ]
                    },
                }
            }
        )
        sort = {
            "newest": {"created_at": -1, "_id": -1},
            "oldest": {"created_at": 1, "_id": 1},
            "due": {"_due": 1, "_id": 1},
            "priority": {"_priority": 1, "_id": 1},
            "status": {"_status": 1, "_id": 1},
            "project": {"_project.name": 1, "_id": 1},
            "assignee": {"_assignee_name": 1, "_id": 1},
            "tag": {"_tag": 1, "_id": 1},
        }[filters.sort]
        sort = {"_closed": 1, **sort}

        people = filters.assignees or ([filters.assignee] if filters.assignee else [])
        person_stage: list[dict[str, Any]] = []
        if people:
            ids = [p for p in people if p != "unassigned"]
            either: list[dict[str, Any]] = []
            if ids:
                either.append({"assignee_ids": {"$in": ids}})
            if "unassigned" in people:
                either.append({"assignee_ids": {"$size": 0}})
            person_stage = [{"$match": {"$or": either}}]

        sort_stages: list[dict[str, Any]] = []
        if filters.sort == "assignee":
            # First assignee's name; unassigned tickets sort last.
            sort_stages = [
                {
                    "$lookup": {
                        "from": "users",
                        "let": {"uid": {"$arrayElemAt": ["$assignee_ids", 0]}},
                        "pipeline": [
                            {
                                "$match": {
                                    "$expr": {
                                        "$eq": [
                                            "$_id",
                                            {
                                                "$convert": {
                                                    "input": "$$uid",
                                                    "to": "objectId",
                                                    "onError": None,
                                                    "onNull": None,
                                                }
                                            },
                                        ]
                                    }
                                }
                            },
                            {"$project": {"name": 1}},
                        ],
                        "as": "_assignee",
                    }
                },
                {
                    "$set": {
                        "_assignee_name": {
                            "$ifNull": [{"$arrayElemAt": ["$_assignee.name", 0]}, "\uffff"]
                        }
                    }
                },
            ]

        pipeline.append(
            {
                "$facet": {
                    "items": [
                        *person_stage,
                        *sort_stages,
                        {"$sort": sort},
                        {"$skip": filters.offset},
                        {"$limit": filters.limit},
                    ],
                    "count": [*person_stage, {"$count": "total"}],
                    "count_any": [{"$count": "total"}],
                    "people": [
                        {"$unwind": {"path": "$assignee_ids", "preserveNullAndEmptyArrays": True}},
                        {"$group": {"_id": "$assignee_ids", "n": {"$sum": 1}}},
                    ],
                }
            }
        )
        result = await self.db.comments.aggregate(pipeline).to_list(length=1)
        row: dict[str, Any] = result[0]
        return row

    async def summary(self, workspace_id: str, user_id: str) -> dict[str, Any]:
        pipeline = root_pipeline(workspace_id)
        open_expr = {"$not": [{"$in": ["$status", ["resolved", "wont_fix"]]}]}
        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        pipeline.append(
            {
                "$facet": {
                    "statuses": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
                    "projects": [
                        {
                            "$group": {
                                "_id": "$_page.project_id",
                                "total": {"$sum": 1},
                                "open": {"$sum": {"$cond": [open_expr, 1, 0]}},
                                "resolved": {
                                    "$sum": {"$cond": [{"$eq": ["$status", "resolved"]}, 1, 0]}
                                },
                                "last_activity_at": {
                                    "$max": {"$ifNull": ["$edited_at", "$created_at"]}
                                },
                            }
                        }
                    ],
                    "project_statuses": [
                        {
                            "$group": {
                                "_id": {"project_id": "$_page.project_id", "status": "$status"},
                                "count": {"$sum": 1},
                            }
                        }
                    ],
                    "personal": [
                        {
                            "$group": {
                                "_id": None,
                                "assigned_to_me": {
                                    "$sum": {"$cond": [{"$in": [user_id, "$assignee_ids"]}, 1, 0]}
                                },
                                "needs_reply": {
                                    "$sum": {
                                        "$cond": [
                                            {
                                                "$and": [
                                                    open_expr,
                                                    {
                                                        "$in": [
                                                            user_id,
                                                            {"$ifNull": ["$waiting_on_ids", []]},
                                                        ]
                                                    },
                                                ]
                                            },
                                            1,
                                            0,
                                        ]
                                    }
                                },
                                "waiting_on_client": {
                                    "$sum": {
                                        "$cond": [
                                            {
                                                "$and": [
                                                    open_expr,
                                                    {"$eq": ["$waiting_on_client", True]},
                                                ]
                                            },
                                            1,
                                            0,
                                        ]
                                    }
                                },
                                "overdue": {
                                    "$sum": {
                                        "$cond": [
                                            {
                                                "$and": [
                                                    open_expr,
                                                    {"$ne": [{"$ifNull": ["$due_at", None]}, None]},
                                                    {"$lt": ["$due_at", today]},
                                                ]
                                            },
                                            1,
                                            0,
                                        ]
                                    }
                                },
                            }
                        }
                    ],
                }
            }
        )
        result = await self.db.comments.aggregate(pipeline).to_list(length=1)
        active = await self.db.projects.count_documents(
            {"workspace_id": workspace_id, "archived_at": None}
        )
        archived = await self.db.projects.count_documents(
            {"workspace_id": workspace_id, "archived_at": {"$ne": None}}
        )
        return {**result[0], "active_projects": active, "archived_projects": archived}

    async def activity(
        self, workspace_id: str, user_id: str, offset: int, limit: int, event_type: str
    ) -> tuple[list[dict[str, Any]], int]:
        query: dict[str, Any] = {"workspace_id": workspace_id}
        if event_type == "mine":
            query["actor_id"] = user_id
        elif event_type == "clients":
            query["type"] = {"$regex": "^client\\."}
        elif event_type == "deploys":
            query["type"] = {"$regex": "^(deploy|revision)\\."}
        elif event_type:
            query["type"] = {"$regex": "^" + re.escape(event_type)}
        cursor = (
            self.db.events.find(query)
            .sort([("created_at", -1), ("_id", -1)])
            .skip(offset)
            .limit(limit)
        )
        return [doc async for doc in cursor], await self.db.events.count_documents(query)

    async def standalone_page(self, workspace_id: str, project_id: str) -> dict[str, Any]:
        from pymongo import ReturnDocument

        url = f"backline://projects/{project_id}/tickets"
        doc = await self.db.pages.find_one_and_update(
            {"workspace_id": workspace_id, "project_id": project_id, "url_normalized": url},
            {
                "$setOnInsert": {
                    "title": "Project tickets",
                    "kind": "standalone",
                    "first_seen_at": datetime.now(UTC),
                    "latest_revision_id": None,
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        assert doc is not None
        return doc

    # M-08: the three collections behind global search (dashboard/service.py's
    # search()) were previously queried directly with raw db.* calls from the
    # service layer, bypassing the repository boundary every other module keeps
    # (rule 2.1/2.3). Moved here unchanged in query shape - TDR-0013 already fixed
    # the bounded-search contract itself, this only relocates who executes it.

    async def search_projects(
        self, workspace_id: str, matcher: dict[str, Any], limit: int
    ) -> list[dict[str, Any]]:
        cursor = (
            self.db.projects.find(
                {"workspace_id": workspace_id, "archived_at": None, "name": matcher},
                {"name": 1, "project_type": 1},
            )
            .limit(limit)
            .max_time_ms(2000)
        )
        return [doc async for doc in cursor]

    async def search_comments(
        self, pipeline: list[dict[str, Any]], limit: int
    ) -> list[dict[str, Any]]:
        return await self.db.comments.aggregate(pipeline, maxTimeMS=2000).to_list(length=limit)

    async def search_members(
        self, workspace_id: str, matcher: dict[str, Any], limit: int
    ) -> list[dict[str, Any]]:
        """BE-05: joins every membership in the workspace against the query, instead of
        pre-fetching an arbitrary first 200 memberships and only then matching name/
        email - the old shape silently couldn't find member 201+ regardless of how
        specific the query was. TDR-0013's bounded-result-count/no-ranking scope is
        unaffected - `limit` still caps the final match count the same way; this only
        fixes which memberships are even considered as candidates."""
        pipeline: list[dict[str, Any]] = [
            {"$match": {"workspace_id": workspace_id}},
            {
                "$lookup": {
                    "from": "users",
                    "let": {"uid": {"$toObjectId": "$user_id"}},
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$_id", "$$uid"]}}},
                        {"$match": {"$or": [{"name": matcher}, {"email": matcher}]}},
                        {"$project": {"name": 1, "email": 1}},
                    ],
                    "as": "user",
                }
            },
            {"$unwind": "$user"},
            {"$limit": limit},
            {"$replaceRoot": {"newRoot": "$user"}},
        ]
        return await self.db.memberships.aggregate(pipeline, maxTimeMS=2000).to_list(length=limit)
