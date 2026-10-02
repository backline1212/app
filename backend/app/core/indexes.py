import logging
from dataclasses import dataclass, field
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

logger = logging.getLogger("backline.indexes")


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


# Human-readable ticket numbers (#14). Sparse-by-type so the records still waiting on
# scripts/migrate_ticket_numbers.py don't collide on a missing value, and unique so two
# writers can never end up sharing a number even if a counter is ever reset by hand.
TICKET_NUMBER_INDEXES: tuple[AdditiveIndex, ...] = (
    AdditiveIndex(
        "comments",
        (("workspace_id", 1), ("ticket_number", 1)),
        "comments_workspace_ticket_number",
        {
            "unique": True,
            "partialFilterExpression": {"ticket_number": {"$type": "int"}},
        },
    ),
)


# Tickets filed in a tracker from a comment (modules/integrations,
# IntegrationLinkRepository). Unique so one comment can only ever be filed once per
# connection - the send path claims this row before calling the tracker.
INTEGRATION_LINK_INDEXES: tuple[AdditiveIndex, ...] = (
    AdditiveIndex(
        "integration_links",
        (("workspace_id", 1), ("comment_id", 1), ("integration_id", 1)),
        "integration_links_comment_integration",
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

# docs/tdr/0052. Webhooks find a checkout by the gateway's own session/order id, and the
# unique checkout_id on invoices is the backstop behind claim_checkout's exactly-once
# activation. Invoice numbers are sequential across the service (one seller).
BILLING_INDEXES: tuple[AdditiveIndex, ...] = (
    AdditiveIndex(
        "billing_checkouts",
        (("provider", 1), ("reference", 1)),
        "billing_checkouts_provider_reference_unique",
        {"unique": True},
    ),
    AdditiveIndex(
        "billing_checkouts",
        (("workspace_id", 1), ("created_at", -1)),
        "billing_checkouts_workspace_created",
    ),
    AdditiveIndex(
        "billing_events",
        (("workspace_id", 1), ("created_at", -1)),
        "billing_events_workspace_created",
    ),
    AdditiveIndex(
        "invoices",
        (("workspace_id", 1), ("created_at", -1)),
        "invoices_workspace_created",
    ),
    AdditiveIndex(
        "invoices",
        (("invoice_number", 1),),
        "invoices_number_unique",
        {"unique": True, "sparse": True},
    ),
    AdditiveIndex(
        "invoices",
        (("checkout_id", 1),),
        "invoices_checkout_unique",
        {"unique": True, "sparse": True},
    ),
    AdditiveIndex(
        "ai_usage",
        (("workspace_id", 1), ("created_at", -1)),
        "ai_usage_workspace_created",
    ),
)


# TDR-0056 project access, room codes, join requests and the org chart.
ORG_ACCESS_INDEXES: tuple[AdditiveIndex, ...] = (
    # A member's hidden-project lookup (core/project_access.py's hidden_project_ids)
    # and workspace listings filter on these.
    AdditiveIndex(
        "projects",
        (("workspace_id", 1), ("access.visibility", 1), ("access.members.user_id", 1)),
        "projects_workspace_access_members",
    ),
    # A code leads to exactly one workspace. Partial on strings, so every workspace
    # with joining by code turned off (room_code None or absent) is left out.
    AdditiveIndex(
        "workspaces",
        (("room_code", 1),),
        "workspaces_room_code_unique",
        {"unique": True, "partialFilterExpression": {"room_code": {"$type": "string"}}},
    ),
    AdditiveIndex(
        "join_requests",
        (("workspace_id", 1), ("status", 1), ("created_at", -1)),
        "join_requests_workspace_status_created",
    ),
    # One waiting request per person per workspace, however fast they click.
    AdditiveIndex(
        "join_requests",
        (("workspace_id", 1), ("user_id", 1)),
        "join_requests_one_pending",
        {"unique": True, "partialFilterExpression": {"status": "pending"}},
    ),
    AdditiveIndex(
        "join_requests",
        (("user_id", 1), ("created_at", -1)),
        "join_requests_user_created",
    ),
    AdditiveIndex(
        "memberships",
        (("workspace_id", 1), ("manager_user_id", 1)),
        "memberships_workspace_manager",
    ),
    # TDR-0057: one canvas link per project, however many members open the canvas at
    # once (share_links/service.py's get_or_create_canvas_link re-reads on a clash).
    AdditiveIndex(
        "share_links",
        (("workspace_id", 1), ("project_id", 1)),
        "share_links_one_canvas_link",
        {"unique": True, "partialFilterExpression": {"purpose": "canvas"}},
    ),
    # A member's canvas session on that link, reused across visits.
    AdditiveIndex(
        "guest_sessions",
        (("workspace_id", 1), ("share_link_id", 1), ("member_user_id", 1)),
        "guest_sessions_canvas_member",
        {"partialFilterExpression": {"member_user_id": {"$type": "string"}}},
    ),
)


async def ensure_additive_indexes(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    indexes: tuple[AdditiveIndex, ...],
    *,
    tolerate_duplicates: bool = False,
) -> None:
    """`tolerate_duplicates` logs, instead of raising, a unique index that existing
    rows already violate - for constraints on fields an earlier build wrote without
    one (ORG_ACCESS_INDEXES), so a stray duplicate can't stop the API from starting.
    The service code still checks before writing; the migration script named in the
    log reports and fixes the rows."""
    for spec in indexes:
        try:
            await db[spec.collection].create_index(list(spec.keys), name=spec.name, **spec.options)
        except OperationFailure as exc:
            if not tolerate_duplicates or exc.code not in (11000, 11001):
                raise
            logger.error(
                "Index %s not created: existing %s rows have duplicate values. "
                "Run scripts/migrate_org_access.py (dry run first) to find them.",
                spec.name,
                spec.collection,
            )


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

    # No separate (project_id, url_normalized) unique index here: AUDIT_BATCH_02_INDEXES'
    # pages_workspace_project_url below is a strict superset (project_id already
    # determines workspace_id, so the two constraints are equivalent) - this used to be
    # declared as its own index too, which just doubled write overhead on every page
    # insert for no added correctness. Not dropped from any database that already has
    # it (this file only ever calls create_index, never drop_index, per TDR-0017) -
    # simply never (re)created going forward, including on a fresh database.

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
    await ensure_additive_indexes(db, TICKET_NUMBER_INDEXES)
    await ensure_additive_indexes(db, INTEGRATION_LINK_INDEXES)
    await ensure_additive_indexes(db, BILLING_INDEXES)
    await ensure_additive_indexes(db, ORG_ACCESS_INDEXES, tolerate_duplicates=True)
