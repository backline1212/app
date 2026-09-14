from dataclasses import dataclass, field
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase


@dataclass(frozen=True)
class AdditiveIndex:
    collection: str
    keys: tuple[tuple[str, int], ...]
    name: str
    options: dict[str, Any] = field(default_factory=dict)


# Audit batch 02 / M-07. These definitions are intentionally separate from the
# historical startup indexes below so the dry-run migration can report exactly what
# this additive change will create. Existing indexes are never dropped or renamed.
AUDIT_BATCH_02_INDEXES: tuple[AdditiveIndex, ...] = (
    AdditiveIndex(
        "notifications",
        (("workspace_id", 1), ("user_id", 1), ("read_at", 1), ("created_at", -1)),
        "notifications_unread_by_user",
    ),
    AdditiveIndex(
        "share_links",
        (("workspace_id", 1), ("project_id", 1), ("created_at", -1)),
        "share_links_workspace_project_created",
    ),
    AdditiveIndex(
        "pages",
        (("workspace_id", 1), ("project_id", 1), ("url_normalized", 1)),
        "pages_workspace_project_url",
        {"unique": True},
    ),
    AdditiveIndex(
        "revisions",
        (("workspace_id", 1), ("page_id", 1), ("captured_at", -1)),
        "revisions_workspace_page_captured",
    ),
    AdditiveIndex(
        "revisions",
        (("workspace_id", 1), ("page_id", 1), ("is_current", 1)),
        "revisions_workspace_page_current",
    ),
    AdditiveIndex(
        "recovery_logs",
        (("workspace_id", 1), ("comment_id", 1), ("created_at", -1)),
        "recovery_logs_workspace_comment_created",
    ),
    AdditiveIndex(
        "refresh_tokens",
        (("user_id", 1), ("family_id", 1)),
        "refresh_tokens_user_family",
    ),
    AdditiveIndex(
        "refresh_tokens",
        (("family_id", 1), ("revoked_at", 1)),
        "refresh_tokens_family_revoked",
    ),
    AdditiveIndex(
        "events",
        (("workspace_id", 1), ("created_at", -1), ("_id", -1)),
        "events_workspace_created_id",
    ),
    AdditiveIndex(
        "events",
        (("workspace_id", 1), ("type", 1), ("created_at", -1), ("_id", -1)),
        "events_workspace_type_created_id",
    ),
    AdditiveIndex(
        "otp_codes",
        (("email", 1), ("consumed_at", 1), ("expires_at", 1), ("created_at", -1)),
        "otp_codes_active_lookup",
    ),
)


AUDIT_BATCH_03_INDEXES: tuple[AdditiveIndex, ...] = (
    # Compound sparse indexes include every document with workspace_id, even when
    # client_request_id is missing/null. Only real request IDs should be unique.
    # Use a new name so an existing sparse index cannot cause an options conflict;
    # never drop an existing index during startup (TDR-0017).
    AdditiveIndex(
        "comments",
        (("workspace_id", 1), ("client_request_id", 1)),
        "comments_workspace_client_request_id_strings",
        {
            "unique": True,
            "partialFilterExpression": {"client_request_id": {"$type": "string"}},
        },
    ),
)


# Production-readiness audit 2026-09-13 (docs/implementation/production-readiness-
# master-plan-2026-09-13.md Parts C5/C6): DB-level enforcement backing the app-level
# race fixes in snapshot_engine/service.py and recovery_engine/service.py - a retry
# loop alone only reduces the race window, these indexes make the invariant impossible
# to violate even under real concurrent writers.
AUDIT_BATCH_14_INDEXES: tuple[AdditiveIndex, ...] = (
    AdditiveIndex(
        "revisions",
        (("page_id", 1), ("is_current", 1)),
        "revisions_page_current_unique",
        {"unique": True, "partialFilterExpression": {"is_current": True}},
    ),
    AdditiveIndex(
        "revision_diffs",
        (("page_id", 1), ("to_revision_id", 1)),
        "revision_diffs_page_to_revision_unique",
        {"unique": True},
    ),
)


BROWSER_RENDER_INDEXES: tuple[AdditiveIndex, ...] = (
    # One cache/job-status document per (page, browser, viewport, orientation)
    # combination - modules/browser_render's repository upserts against exactly this
    # key, never generates duplicates for the same combination.
    AdditiveIndex(
        "browser_renders",
        (
            ("page_id", 1),
            ("browser", 1),
            ("viewport.width", 1),
            ("viewport.height", 1),
            ("orientation", 1),
        ),
        "browser_renders_page_browser_viewport_orientation",
        {"unique": True},
    ),
    AdditiveIndex(
        "browser_renders",
        (("workspace_id", 1), ("project_id", 1)),
        "browser_renders_workspace_project",
    ),
)


DELETION_SUPPORT_INDEXES: tuple[AdditiveIndex, ...] = (
    AdditiveIndex(
        "deletion_plans",
        (
            ("workspace_id", 1),
            ("project_id", 1),
            ("correlation_id", 1),
            ("actor_user_id", 1),
        ),
        "deletion_plans_workspace_project_correlation_actor",
        {"unique": True},
    ),
    AdditiveIndex(
        "deletion_plans",
        (("purge_after", 1),),
        "deletion_plans_purge_after",
        {"expireAfterSeconds": 0},
    ),
    AdditiveIndex(
        "object_gc_tombstones",
        (
            ("workspace_id", 1),
            ("project_id", 1),
            ("correlation_id", 1),
            ("status", 1),
            ("created_at", 1),
        ),
        "object_gc_workspace_project_operation_status",
    ),
    AdditiveIndex(
        "object_gc_tombstones",
        (("bucket", 1), ("key", 1)),
        "object_gc_bucket_key",
        {"unique": True},
    ),
    AdditiveIndex(
        "events",
        (("correlation_id", 1),),
        "events_correlation_id",
        {"unique": True, "sparse": True},
    ),
)


async def ensure_additive_indexes(
    db: AsyncIOMotorDatabase[dict[str, Any]], indexes: tuple[AdditiveIndex, ...]
) -> None:
    for spec in indexes:
        await db[spec.collection].create_index(list(spec.keys), name=spec.name, **spec.options)


async def ensure_indexes(db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
    """Indexes per 11-Database.md, created idempotently on startup rather than via a
    separate migration step (no schema migrations exist yet at this scale)."""
    await db.users.create_index("email", unique=True)

    await db.workspaces.create_index("slug", unique=True)

    await db.memberships.create_index([("workspace_id", 1), ("user_id", 1)], unique=True)
    await db.memberships.create_index("user_id")

    await db.refresh_tokens.create_index("token_hash", unique=True)
    await db.refresh_tokens.create_index("user_id")
    await db.refresh_tokens.create_index([("user_id", 1), ("family_id", 1), ("revoked_at", 1)])
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)

    await db.otp_codes.create_index([("email", 1), ("created_at", -1)])
    await db.otp_codes.create_index("expires_at", expireAfterSeconds=0)

    await db.events.create_index([("workspace_id", 1), ("created_at", -1)])
    await db.events.create_index([("type", 1), ("created_at", -1)])

    await db.projects.create_index("workspace_id")
    await db.projects.create_index(
        [("workspace_id", 1), ("archived_at", 1), ("created_at", -1), ("_id", -1)]
    )
    await db.projects.create_index([("workspace_id", 1), ("client_id", 1)])
    await db.projects.create_index([("workspace_id", 1), ("target_origin", 1), ("archived_at", 1)])
    # Bounded, workspace-first regex search (FD-AUD-049); replace only after selecting
    # a text-search provider and migration plan.
    await db.projects.create_index([("workspace_id", 1), ("name", 1)])
    await db.project_assets.create_index(
        [("workspace_id", 1), ("project_id", 1), ("created_at", 1)]
    )
    await db.project_assets.create_index("page_id", unique=True)
    await db.clients.create_index(
        [("workspace_id", 1), ("archived_at", 1), ("name", 1), ("_id", 1)]
    )

    await db.share_links.create_index("token", unique=True)
    await db.share_links.create_index("project_id")

    await db.guest_sessions.create_index("share_link_id")
    await db.guest_sessions.create_index("last_seen_at", expireAfterSeconds=180 * 24 * 60 * 60)

    await db.pages.create_index([("project_id", 1), ("url_normalized", 1)], unique=True)

    await db.revisions.create_index([("page_id", 1), ("captured_at", -1)])
    await db.revisions.create_index([("page_id", 1), ("is_current", 1)])

    await db.comments.create_index([("page_id", 1), ("status", 1)])
    await db.comments.create_index([("workspace_id", 1), ("assignee_id", 1)])
    await db.comments.create_index("parent_id")
    await db.comments.create_index([("workspace_id", 1), ("layer", 1)])
    await db.comments.create_index(
        [("workspace_id", 1), ("deleted_at", 1), ("parent_id", 1), ("created_at", -1), ("_id", -1)]
    )
    await db.comments.create_index(
        [("workspace_id", 1), ("deleted_at", 1), ("parent_id", 1), ("status", 1), ("due_at", 1)]
    )
    await db.comments.create_index(
        [("workspace_id", 1), ("assignee_ids", 1), ("deleted_at", 1), ("parent_id", 1)]
    )
    await db.comments.create_index(
        [("workspace_id", 1), ("page_id", 1), ("deleted_at", 1), ("parent_id", 1)]
    )
    await db.comments.create_index(
        [("workspace_id", 1), ("deleted_at", 1), ("parent_id", 1), ("created_at", -1)]
    )

    await db.revision_diffs.create_index([("page_id", 1), ("to_revision_id", 1)])
    await db.recovery_logs.create_index([("comment_id", 1), ("created_at", -1)])

    await db.integrations.create_index([("workspace_id", 1), ("type", 1)])

    await db.extension_tokens.create_index("token_hash", unique=True)
    await db.extension_tokens.create_index(
        [("workspace_id", 1), ("user_id", 1), ("created_at", -1)]
    )

    await db.mcp_personal_tokens.create_index("token_hash", unique=True)
    await db.mcp_personal_tokens.create_index(
        [("workspace_id", 1), ("user_id", 1), ("created_at", -1)]
    )

    # notifications: shape/indexes documented in docs/tdr/0009 (11-Database.md never
    # gave this collection an explicit schema, unlike every other one).
    await db.notifications.create_index([("workspace_id", 1), ("user_id", 1), ("created_at", -1)])

    # feature_flags: one row per (key, workspace_id) - 18-Storage-Deployment.md §18.7.
    await db.feature_flags.create_index([("key", 1), ("workspace_id", 1)], unique=True)

    await ensure_additive_indexes(db, AUDIT_BATCH_02_INDEXES)
    await ensure_additive_indexes(db, DELETION_SUPPORT_INDEXES)
    await ensure_additive_indexes(db, AUDIT_BATCH_03_INDEXES)
    await ensure_additive_indexes(db, BROWSER_RENDER_INDEXES)
    await ensure_additive_indexes(db, AUDIT_BATCH_14_INDEXES)
