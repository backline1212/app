import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.actor_access import resolve_actor_project_access
from app.core.arq_pool import get_arq_pool
from app.core.errors import NotFoundError, PermissionDeniedError, ValidationError
from app.core.events import append_event
from app.core.session import Actor, GuestSession, Session, actor_identity
from app.modules.auth.repository import UserRepository
from app.modules.comments import events as comment_events
from app.modules.comments.repository import CommentRepository
from app.modules.comments.schemas import (
    AnchorIn,
    AttachmentIn,
    AttachmentOut,
    CommentOut,
    CommentUpdate,
    ContextIn,
    GuestBoardItemOut,
    GuestBoardOut,
    RecoveryStatus,
    Tag,
)
from app.modules.notifications import service as notification_service
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.realtime.pubsub import publish as publish_realtime_event
from app.modules.storage.r2_client import generate_presigned_get

logger = logging.getLogger("backline.comments")


async def _page_for_broadcast(
    db: AsyncIOMotorDatabase[dict[str, Any]], page_id: str
) -> dict[str, Any] | None:
    """Looked up only to get project_id for a realtime broadcast, after the comment
    mutation it follows has already committed - pages/service.py's delete_page now
    runs its reference-count check and the delete inside one transaction, so a
    comment ending up with a dangling page_id from that specific race should be
    impossible, but this stays as defense-in-depth for any other cause of one. A
    missing page here must never crash a request whose actual mutation already
    succeeded; the broadcast is simply skipped."""
    page = await PageRepository(db).find_by_id(page_id)
    if page is None:
        logger.warning(
            "Comment references page %s which no longer exists; skipping broadcast.", page_id
        )
    return page


async def _broadcast_comment_event(
    *, event_type: str, workspace_id: str, project_id: str, comment: CommentOut
) -> None:
    """Fan out to both the workspace-wide member channel and, only when the comment is
    client-visible, the project's guest channel (12-API-WebSocket.md §12.6's subscription
    split) - a team-only comment never reaches a guest connection, at the pub/sub layer,
    not filtered after the fact. `project_id` rides along in the WS payload only (not in
    `CommentOut`/the REST response) purely so a dashboard client already holding many
    projects' comments in cache can tell which project's query to merge this into."""
    payload = {**comment.model_dump(mode="json"), "project_id": project_id}
    await publish_realtime_event(
        f"workspace:{workspace_id}:all",
        event_type=event_type,
        workspace_id=workspace_id,
        payload=payload,
    )
    if comment.layer == "client":
        await publish_realtime_event(
            f"project:{project_id}:client",
            event_type=event_type,
            workspace_id=workspace_id,
            payload=payload,
        )


async def _broadcast_comment_deleted(
    *, workspace_id: str, project_id: str, comment_id: str, parent_id: str | None, layer: str
) -> None:
    """Same channel-fanout rule as _broadcast_comment_event, but a deleted comment has
    no meaningful "current state" left to send - just enough to let a client remove it
    from a local list (the widget's own pin list, the dashboard Board's cache). Closes a
    gap toggle_layer's docstring already flagged: "the spec's event table has no
    comment.deleted/comment.hidden type... inventing new protocol surface wasn't asked
    for by this milestone" - this milestone is exactly that ask."""
    payload = {"comment_id": comment_id, "parent_id": parent_id, "project_id": project_id}
    await publish_realtime_event(
        f"workspace:{workspace_id}:all",
        event_type=comment_events.COMMENT_DELETED,
        workspace_id=workspace_id,
        payload=payload,
    )
    if layer == "client":
        await publish_realtime_event(
            f"project:{project_id}:client",
            event_type=comment_events.COMMENT_DELETED,
            workspace_id=workspace_id,
            payload=payload,
        )


def _require_own_comment(existing: dict[str, Any], actor: Actor) -> None:
    """Milestone scope: only a comment's own author may edit/delete it via the widget -
    no moderation-by-others capability here (that stays a dashboard/member action via
    the existing member-only PATCH /comments/{id})."""
    actor_type, actor_id = actor_identity(actor)
    author_id = existing["author_member_id"] or existing["author_guest_id"]
    if actor_type != existing["author_type"] or actor_id != author_id:
        raise PermissionDeniedError("Only the comment's own author can do that.")


async def _dispatch_integration_event(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, event_type: str, comment_id: str
) -> None:
    # Deferred import: integrations/service.py imports get_comment_out from this same
    # module (for its manual create-task/create-card triggers), so importing it at
    # module scope here would be circular. See projects/service.py's identical pattern
    # for share_links.
    from app.modules.integrations.service import dispatch_comment_event

    await dispatch_comment_event(
        db, workspace_id=workspace_id, event_type=event_type, comment_id=comment_id
    )


async def _resolve_author_name(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    doc: dict[str, Any],
    *,
    member_name_cache: dict[str, str] | None = None,
) -> str:
    """CommentOut's author_name - resolved live from the users/guest_sessions
    collections rather than persisted on the comment doc at creation time, so a later
    profile name change is reflected retroactively (16-Dashboard.md's Comments panel
    needs a real display name, not just author_type/author_id - a guest reviewer's
    name was previously only visible on their own guest_session doc, never surfaced
    through CommentOut at all).

    `member_name_cache` is an opt-in batching hook for callers rendering many comments
    at once (dashboard/service.py's list_tickets) - when supplied and pre-populated, this
    skips the per-comment user lookup entirely instead of doing one query per row."""
    if doc["author_type"] == "member":
        member_id = doc["author_member_id"]
        if member_name_cache is not None and member_id in member_name_cache:
            return member_name_cache[member_id]
        user = await UserRepository(db).find_by_id(member_id)
        return user["name"] if user else "Unknown"

    # Deferred import: share_links.service already imports from comments in some
    # paths, so a module-level import here risks the same circularity projects/service.py
    # documents for share_links elsewhere in this file.
    from app.modules.share_links.repository import GuestSessionRepository

    guest = await GuestSessionRepository(db).find_by_id(doc["author_guest_id"])
    return guest["display_name"] if guest else "Guest"


async def _resolve_attachments(doc: dict[str, Any]) -> list[AttachmentOut]:
    # Signed GET per attachment, same as screenshot_url below - attachments are never
    # served from a public bucket either (18-Storage-Deployment.md §18.2's reasoning
    # applies just as much to a comment's own uploaded file as to its screenshot).
    return [
        AttachmentOut(
            filename=attachment["filename"],
            content_type=attachment["content_type"],
            url=await generate_presigned_get(attachment["key"]),
        )
        for attachment in doc.get("attachments", [])
    ]


async def _comment_out(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    doc: dict[str, Any],
    *,
    member_name_cache: dict[str, str] | None = None,
) -> CommentOut:
    screenshot_url = None
    if doc.get("screenshot_key"):
        screenshot_url = await generate_presigned_get(doc["screenshot_key"])
    attachments = await _resolve_attachments(doc)
    author_name = await _resolve_author_name(db, doc, member_name_cache=member_name_cache)

    # DB-02: a reply created after the anchor/context_json de-duplication (see
    # create_reply) has none of its own - it's the same visual pin as its parent, so
    # fall back to the parent doc's values rather than requiring every reply to carry
    # its own copy. A reply created before that change still has its own copied
    # values and never reaches this fallback.
    anchor = doc.get("anchor")
    context_json = doc.get("context_json")
    recovery_status = doc.get("recovery_status")
    if doc.get("parent_id") and (anchor is None or context_json is None or recovery_status is None):
        parent = await CommentRepository(db).find_by_id(doc["parent_id"])
        if parent is not None:
            anchor = anchor if anchor is not None else parent.get("anchor")
            context_json = context_json if context_json is not None else parent.get("context_json")
            recovery_status = (
                recovery_status if recovery_status is not None else parent.get("recovery_status")
            )
    # Defensive fallback only - a reply's parent always has these fields in practice
    # (every top-level comment does); this just keeps a dangling/deleted parent from
    # turning into a 500 instead of a merely-imprecise render.
    anchor = anchor if anchor is not None else {}
    context_json = context_json if context_json is not None else {}
    final_recovery_status: RecoveryStatus = recovery_status if recovery_status is not None else "ok"

    return CommentOut(
        id=str(doc["_id"]),
        page_id=doc["page_id"],
        parent_id=doc.get("parent_id"),
        author_type=doc["author_type"],
        author_id=doc["author_member_id"] or doc["author_guest_id"],
        author_name=author_name,
        layer=doc["layer"],
        body=doc["body"],
        status=doc["status"],
        priority=doc.get("priority", "medium"),
        tags=doc.get("tags", []),
        assignee_ids=doc.get(
            "assignee_ids", [doc["assignee_id"]] if doc.get("assignee_id") else []
        ),
        waiting_on_ids=doc.get("waiting_on_ids", []),
        waiting_on_client=doc.get("waiting_on_client", False),
        is_standalone=doc.get("is_standalone", False),
        assignee_id=doc.get("assignee_id"),
        due_at=doc.get("due_at"),
        anchor=anchor,
        recovery_status=final_recovery_status,
        context=context_json,
        screenshot_url=screenshot_url,
        capture_status=doc["capture_status"],
        attachments=attachments,
        created_at=doc["created_at"],
        edited_at=doc.get("edited_at"),
    )


async def get_comment_out(
    db: AsyncIOMotorDatabase[dict[str, Any]], comment_id: str
) -> CommentOut | None:
    """Public accessor for cross-module reuse (integrations/service.py's manual
    create-task/create-card triggers need a fully-built CommentOut, not a raw doc)."""
    doc = await CommentRepository(db).find_by_id(comment_id)
    if doc is None:
        return None
    return await _comment_out(db, doc)


async def get_comment_out_for_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, workspace_id: str
) -> CommentOut | None:
    """Same as get_comment_out, but also enforces the comment belongs to workspace_id -
    CommentOut itself has no workspace_id field to check post-hoc, so every caller that
    needs this scoping (integrations/service.py's manual create-task/create-card/
    create-issue triggers, mcp/service.py's generate_implementation_prompt) previously
    had to fetch the raw doc a second time just to check it. One fetch instead of two."""
    doc = await CommentRepository(db).find_by_id(comment_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        return None
    return await _comment_out(db, doc)


async def _resolve_page_and_access(
    db: AsyncIOMotorDatabase[dict[str, Any]], actor: Actor, page_id: str
) -> dict[str, Any]:
    page = await PageRepository(db).find_by_id(page_id)
    if page is None:
        raise NotFoundError("Page not found.")
    await resolve_actor_project_access(db, actor, page["project_id"])
    return page


def _redact_context(context: ContextIn, *, capture_device_details: bool) -> dict[str, Any]:
    """FD-AUD-018/M-04 'Capture browser and device details' - "Attaches OS, viewport
    and the element selector to every comment." The anchor's own DOM fingerprint
    (the actual "element selector" used for recovery/positioning) is intentionally
    never touched here - anchor and snapshot node identity must share one hash
    implementation regardless of this cosmetic telemetry setting (constraint 2.7);
    only the browser/OS/device/viewport metadata this project's settings actually
    describe is gated. `url` is kept either way - it identifies which page the
    comment was left on, not a device fingerprint."""
    if capture_device_details:
        return context.model_dump()
    return {"url": context.url, "browser": "", "os": "", "device_type": "", "viewport": {}}


async def create_comment(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    page_id: str,
    actor: Actor,
    body: str,
    layer: str,
    anchor: AnchorIn,
    context: ContextIn,
    screenshot_key: str | None,
    capture_status: str,
    attachments: list[AttachmentIn] | None = None,
    tags: list[Tag] | None = None,
    client_request_id: str | None = None,
) -> CommentOut:
    page = await _resolve_page_and_access(db, actor, page_id)

    # M-08 idempotency: a retried POST with the same caller-generated key replays the
    # original comment instead of creating a duplicate - same check-before-create shape
    # as pages/service.py's register_page idempotency-by-normalized-url.
    if client_request_id is not None:
        existing = await CommentRepository(db).find_by_client_request_id(
            page["workspace_id"], client_request_id
        )
        if existing is not None:
            return await _comment_out(db, existing)

    project = await ProjectRepository(db).find_by_id(page["project_id"])
    capture_device_details = bool(
        project is not None
        and project.get("settings_json", {}).get("capture_device_details", False)
    )

    # Guest-authored comments always default to layer=client, never overridable by the
    # guest themselves (12-API-WebSocket.md §12.4).
    effective_layer = "client" if isinstance(actor, GuestSession) else layer

    doc: dict[str, Any] = {
        "page_id": page_id,
        "workspace_id": page["workspace_id"],
        "parent_id": None,
        "author_type": "guest" if isinstance(actor, GuestSession) else "member",
        "author_member_id": actor.user_id if isinstance(actor, Session) else None,
        "author_guest_id": actor.guest_session_id if isinstance(actor, GuestSession) else None,
        "layer": effective_layer,
        "body": body,
        "status": "todo",
        "assignee_id": None,
        "due_at": None,
        "anchor": anchor.model_dump(),
        "recovery_status": "ok",
        "consecutive_orphaned_revisions": 0,
        "context_json": _redact_context(context, capture_device_details=capture_device_details),
        "attachments": [a.model_dump() for a in (attachments or [])],
        "tags": list(dict.fromkeys(tags or [])),
        "screenshot_key": screenshot_key,
        "capture_status": capture_status,
        "client_request_id": client_request_id,
        "created_at": datetime.now(UTC),
        "edited_at": None,
    }
    created = await CommentRepository(db).create(doc)

    actor_type, actor_id = actor_identity(actor)
    await append_event(
        db,
        workspace_id=page["workspace_id"],
        type=comment_events.COMMENT_CREATED,
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"comment_id": str(created["_id"]), "page_id": page_id, "layer": effective_layer},
    )
    comment_out = await _comment_out(db, created)
    await _broadcast_comment_event(
        event_type="comment.created",
        workspace_id=page["workspace_id"],
        project_id=page["project_id"],
        comment=comment_out,
    )
    await _dispatch_integration_event(
        db,
        workspace_id=page["workspace_id"],
        event_type="comment.created",
        comment_id=comment_out.id,
    )
    return comment_out


async def create_reply(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    parent_id: str,
    actor: Actor,
    body: str,
    layer: str,
    attachments: list[AttachmentIn] | None = None,
    client_request_id: str | None = None,
    mentioned_user_ids: list[str] | None = None,
) -> CommentOut:
    repo = CommentRepository(db)
    parent = await repo.find_by_id(parent_id)
    if parent is None or parent.get("deleted_at") is not None:
        raise NotFoundError("Comment not found.")

    parent_page = await PageRepository(db).find_by_id(parent["page_id"])
    if parent_page is None:
        raise NotFoundError("Page not found.")
    await resolve_actor_project_access(db, actor, parent_page["project_id"])

    is_guest = isinstance(actor, GuestSession)
    if is_guest and parent["layer"] != "client":
        # A guest can reply "on client-visible threads only" (13-Authentication.md §13.5).
        # Treated as not-found, not forbidden, so a crafted request can't be used to
        # confirm that a team-only comment exists on a page a guest can see.
        raise NotFoundError("Comment not found.")

    if client_request_id is not None:
        existing_reply = await repo.find_by_client_request_id(
            parent["workspace_id"], client_request_id
        )
        if existing_reply is not None:
            return await _comment_out(db, existing_reply)

    effective_layer = "client" if is_guest else layer

    doc: dict[str, Any] = {
        "page_id": parent["page_id"],
        "workspace_id": parent["workspace_id"],
        "parent_id": parent_id,
        "author_type": "guest" if is_guest else "member",
        "author_member_id": actor.user_id if isinstance(actor, Session) else None,
        "author_guest_id": actor.guest_session_id if isinstance(actor, GuestSession) else None,
        "layer": effective_layer,
        "body": body,
        "status": "todo",
        "assignee_id": None,
        "due_at": None,
        # DB-02: replies no longer copy the parent's anchor/context_json/
        # recovery_status - a reply is the same visual pin as its parent, so
        # _comment_out() falls back to the parent's own fields for any reply that
        # doesn't have its own (every reply created from here on). Replies created
        # before this change keep their old copied values untouched - no backfill/
        # deletion, per docs/implementation/audit-batch-01-report.md's own sequencing
        # note ("stop writing copies for new replies first, backfill reads with
        # fallback").
        "consecutive_orphaned_revisions": 0,
        "attachments": [a.model_dump() for a in (attachments or [])],
        "screenshot_key": None,
        "capture_status": "ok",
        "client_request_id": client_request_id,
        "created_at": datetime.now(UTC),
        "edited_at": None,
    }
    created = await repo.create(doc)

    actor_type, actor_id = actor_identity(actor)
    await append_event(
        db,
        workspace_id=parent["workspace_id"],
        type=comment_events.COMMENT_CREATED,
        actor_type=actor_type,
        actor_id=actor_id,
        payload={
            "comment_id": str(created["_id"]),
            "parent_id": parent_id,
            "layer": effective_layer,
        },
    )
    comment_out = await _comment_out(db, created)
    await _broadcast_comment_event(
        event_type="comment.created",
        workspace_id=parent["workspace_id"],
        project_id=parent_page["project_id"],
        comment=comment_out,
    )
    await _dispatch_integration_event(
        db,
        workspace_id=parent["workspace_id"],
        event_type="comment.created",
        comment_id=comment_out.id,
    )

    # M-06: notify the thread's stakeholders - the parent comment's own author (when
    # a member; a guest author has no notification inbox) and its current assignees -
    # excluding whoever just posted this reply. This applies uniformly regardless of
    # layer: a team-layer thread's participants are already members (guests can never
    # reach one, enforced above), and a client-layer thread's participants are still
    # members even when a guest posts the reply - the module's own membership guard
    # (notifications/service.py's _create_and_broadcast) refuses a non-member id
    # either way, so this can never notify a guest.
    reply_author_name = await _resolve_author_name(db, created)
    actor_member_id = actor.user_id if isinstance(actor, Session) else ""
    reply_recipients = set(
        parent.get("assignee_ids", [parent["assignee_id"]] if parent.get("assignee_id") else [])
    )
    if parent["author_type"] == "member" and parent.get("author_member_id"):
        reply_recipients.add(parent["author_member_id"])
    for recipient_id in reply_recipients:
        await notification_service.notify_comment_reply(
            db,
            workspace_id=parent["workspace_id"],
            project_id=parent_page["project_id"],
            parent_comment_id=parent_id,
            reply_author_name=reply_author_name,
            recipient_user_id=recipient_id,
            actor_user_id=actor_member_id,
        )

    # M-06/M-15: @mentions from the composer's own picker selection (stable member
    # ids - see ReplyCreate.mentioned_user_ids's docstring for why this isn't parsed
    # out of `body` instead). Unknown/foreign ids are silently ignored, not an error -
    # the id list is client-supplied and must be re-validated, never trusted blind.
    from app.modules.workspaces.repository import MembershipRepository

    for member_id in dict.fromkeys(mentioned_user_ids or []):
        if not await MembershipRepository(db).find(
            workspace_id=parent["workspace_id"], user_id=member_id
        ):
            continue
        await notification_service.notify_comment_mention(
            db,
            workspace_id=parent["workspace_id"],
            project_id=parent_page["project_id"],
            comment_id=str(created["_id"]),
            mentioned_user_id=member_id,
            actor_name=reply_author_name,
            actor_user_id=actor_member_id,
        )
    return comment_out


async def delete_comment(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, actor: Actor
) -> None:
    """Deletes exactly one message (a top-level comment with no replies, or a single
    reply) - not the thread it might be part of. Soft delete: comments/repository.py's
    list_* queries all exclude deleted_at is not None, so it disappears from every
    listing immediately, but nothing is destroyed (matches this codebase's only other
    "delete" - projects.service.archive_project - never a hard delete)."""
    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if existing is None or existing.get("deleted_at") is not None:
        raise NotFoundError("Comment not found.")
    _require_own_comment(existing, actor)

    await repo.soft_delete(comment_id)
    actor_type, actor_id = actor_identity(actor)
    await append_event(
        db,
        workspace_id=existing["workspace_id"],
        type=comment_events.COMMENT_DELETED,
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"comment_id": comment_id},
    )

    page = await _page_for_broadcast(db, existing["page_id"])
    if page is not None:
        await _broadcast_comment_deleted(
            workspace_id=existing["workspace_id"],
            project_id=page["project_id"],
            comment_id=comment_id,
            parent_id=existing.get("parent_id"),
            layer=existing["layer"],
        )


async def edit_comment(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, actor: Actor, body: str
) -> CommentOut:
    """Own-author-only body edit via the widget (or a member editing their own comment
    the same way) - distinct from the member-only update_comment below, which can change
    ANY comment's body/status/assignee as a moderation action regardless of who wrote
    it. Mirrors delete_comment's ownership check exactly, and reuses the existing
    comment.updated broadcast (already handled by both the widget and the dashboard
    Board's cache) rather than inventing new protocol surface for this."""
    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if existing is None or existing.get("deleted_at") is not None:
        raise NotFoundError("Comment not found.")
    _require_own_comment(existing, actor)

    await repo.update(comment_id, {"body": body, "edited_at": datetime.now(UTC)})

    actor_type, actor_id = actor_identity(actor)
    await append_event(
        db,
        workspace_id=existing["workspace_id"],
        type=comment_events.COMMENT_UPDATED,
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"comment_id": comment_id, "body": body},
    )

    updated = await repo.find_by_id(comment_id)
    assert updated is not None
    comment_out = await _comment_out(db, updated)
    page = await _page_for_broadcast(db, updated["page_id"])
    if page is not None:
        await _broadcast_comment_event(
            event_type="comment.updated",
            workspace_id=existing["workspace_id"],
            project_id=page["project_id"],
            comment=comment_out,
        )
    return comment_out


async def delete_thread(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, actor: Actor
) -> None:
    """Deletes a top-level comment *and every reply on it* - only reachable by the
    thread's own author (the person who started it), regardless of who replied since.
    A comment with no replies is a thread of one - this still works for it, same as
    delete_comment would, just via the "delete this whole thread" affordance instead."""
    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if existing is None or existing.get("deleted_at") is not None:
        raise NotFoundError("Comment not found.")
    if existing.get("parent_id") is not None:
        raise ValidationError("Only a top-level comment can be deleted as a thread.")
    _require_own_comment(existing, actor)

    replies = await repo.list_replies(comment_id)
    await repo.soft_delete_many([comment_id, *(str(r["_id"]) for r in replies)])

    actor_type, actor_id = actor_identity(actor)
    await append_event(
        db,
        workspace_id=existing["workspace_id"],
        type=comment_events.COMMENT_DELETED,
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"comment_id": comment_id, "reply_count": len(replies)},
    )

    page = await _page_for_broadcast(db, existing["page_id"])
    if page is not None:
        await _broadcast_comment_deleted(
            workspace_id=existing["workspace_id"],
            project_id=page["project_id"],
            comment_id=comment_id,
            parent_id=None,
            layer=existing["layer"],
        )
        for reply in replies:
            await _broadcast_comment_deleted(
                workspace_id=existing["workspace_id"],
                project_id=page["project_id"],
                comment_id=str(reply["_id"]),
                parent_id=comment_id,
                layer=reply["layer"],
            )


async def delete_comment_moderated(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    actor_user_id: str,
) -> None:
    """Dashboard moderation delete - any comment in the caller's own workspace,
    regardless of authorship. Same workspace-scoping-only check update_comment/
    toggle_layer/reanchor above already use for every other member moderation action
    on a comment; distinct from delete_comment above (own-author-only, the widget's
    guest self-service surface, which has no role/permission gate at all)."""
    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if (
        existing is None
        or existing.get("deleted_at") is not None
        or existing["workspace_id"] != workspace_id
    ):
        raise NotFoundError("Comment not found.")

    await repo.soft_delete(comment_id)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=comment_events.COMMENT_DELETED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"comment_id": comment_id},
    )
    page = await _page_for_broadcast(db, existing["page_id"])
    if page is not None:
        await _broadcast_comment_deleted(
            workspace_id=workspace_id,
            project_id=page["project_id"],
            comment_id=comment_id,
            parent_id=existing.get("parent_id"),
            layer=existing["layer"],
        )


async def delete_thread_moderated(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    actor_user_id: str,
) -> None:
    """Moderated counterpart to delete_thread above - same workspace-scoping-only
    authorization as delete_comment_moderated, cascading to every reply the same way."""
    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if (
        existing is None
        or existing.get("deleted_at") is not None
        or existing["workspace_id"] != workspace_id
    ):
        raise NotFoundError("Comment not found.")
    if existing.get("parent_id") is not None:
        raise ValidationError("Only a top-level comment can be deleted as a thread.")

    replies = await repo.list_replies(comment_id)
    await repo.soft_delete_many([comment_id, *(str(r["_id"]) for r in replies)])
    await append_event(
        db,
        workspace_id=workspace_id,
        type=comment_events.COMMENT_DELETED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"comment_id": comment_id, "reply_count": len(replies)},
    )

    page = await _page_for_broadcast(db, existing["page_id"])
    if page is not None:
        await _broadcast_comment_deleted(
            workspace_id=workspace_id,
            project_id=page["project_id"],
            comment_id=comment_id,
            parent_id=None,
            layer=existing["layer"],
        )
        for reply in replies:
            await _broadcast_comment_deleted(
                workspace_id=workspace_id,
                project_id=page["project_id"],
                comment_id=str(reply["_id"]),
                parent_id=comment_id,
                layer=reply["layer"],
            )


async def _build_member_name_cache(
    db: AsyncIOMotorDatabase[dict[str, Any]], docs: list[dict[str, Any]]
) -> dict[str, str]:
    """One batched $in query for every distinct member author across a whole list,
    instead of _resolve_author_name's per-comment find_by_id (still deduped by the
    cache dict itself once populated, but with no cache handed in, asyncio.gather still
    fires one query per comment concurrently rather than one query total) - same fix
    as D3 (dashboard/service.py's list_tickets)."""
    member_ids = {
        doc["author_member_id"] for doc in docs if doc["author_type"] == "member"
    }
    if not member_ids:
        return {}
    users_by_id = await UserRepository(db).find_many_by_ids(list(member_ids))
    return {
        user_id: (users_by_id[user_id]["name"] if user_id in users_by_id else "Unknown")
        for user_id in member_ids
    }


async def list_comments(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    page_id: str,
    actor: Actor,
    since: datetime | None,
) -> list[CommentOut]:
    page = await _resolve_page_and_access(db, actor, page_id)
    repo = CommentRepository(db)

    if isinstance(actor, GuestSession):
        docs = await repo.list_for_guest_session(page["workspace_id"], page_id, since=since)
    else:
        docs = await repo.list_for_member(page["workspace_id"], page_id, since=since)

    member_name_cache = await _build_member_name_cache(db, docs)
    return await asyncio.gather(
        *(_comment_out(db, doc, member_name_cache=member_name_cache) for doc in docs)
    )


async def list_comments_for_project(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, project_id: str, workspace_id: str
) -> list[CommentOut]:
    """The Board's data source (16-Dashboard.md §16.1) - every comment, every layer,
    across every page in the project. Member-only; guests never reach this."""
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")

    pages = await PageRepository(db).list_for_project(workspace_id, project_id)
    page_ids = [str(page["_id"]) for page in pages]
    if not page_ids:
        return []

    docs = await CommentRepository(db).list_for_project(workspace_id, page_ids)
    member_name_cache = await _build_member_name_cache(db, docs)
    return await asyncio.gather(
        *(_comment_out(db, doc, member_name_cache=member_name_cache) for doc in docs)
    )


async def update_comment(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    actor_user_id: str,
    body: str | None,
    status: str | None,
    assignee_id: str | None,
    due_at: datetime | None,
    changes: CommentUpdate | None = None,
) -> CommentOut:
    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if existing is None or existing["workspace_id"] != workspace_id:
        raise NotFoundError("Comment not found.")
    page = await PageRepository(db).find_by_id(existing["page_id"])
    if page is None:
        # Defense-in-depth: a comment whose page no longer exists (pages/service.py's
        # delete_page now enforces this can't happen via its own reference-count
        # check/delete transaction, but this guards any other cause of a dangling
        # page_id) can't be meaningfully updated - fail clean before any write below,
        # rather than crash partway through one.
        raise NotFoundError("Comment not found.")
    project_id = page["project_id"]

    patch: dict[str, Any] = {}
    if body is not None:
        patch["body"] = body
    if status is not None:
        patch["status"] = status
    if assignee_id is not None:
        patch["assignee_id"] = assignee_id
    if due_at is not None:
        patch["due_at"] = due_at

    if existing.get("deleted_at"):
        raise NotFoundError("Comment not found.")
    if changes is not None:
        supplied = changes.model_dump(exclude_unset=True)
        for key in (
            "body",
            "status",
            "priority",
            "tags",
            "assignee_ids",
            "waiting_on_ids",
            "waiting_on_client",
        ):
            if key in supplied and supplied[key] is None:
                raise ValidationError(f"{key} cannot be null.")
        patch.update(supplied)
    if "assignee_ids" in patch:
        patch["assignee_ids"] = list(dict.fromkeys(patch["assignee_ids"]))
        patch["assignee_id"] = next(iter(patch["assignee_ids"]), None)
    elif "assignee_id" in patch:
        patch["assignee_ids"] = [patch["assignee_id"]] if patch["assignee_id"] else []
    if "tags" in patch:
        patch["tags"] = list(dict.fromkeys(patch["tags"]))
    if "waiting_on_ids" in patch:
        patch["waiting_on_ids"] = list(dict.fromkeys(patch["waiting_on_ids"]))
    from app.modules.workspaces.repository import MembershipRepository

    # Validate every member reference that ended up in `patch`, regardless of whether
    # it arrived via the new `assignee_ids`/`waiting_on_ids` fields or was derived from
    # the legacy singular `assignee_id` above (line ~768) - deriving membership scope
    # from only the fields `changes` explicitly supplied let a caller who sends just
    # `assignee_id` skip validation entirely, since the derived `assignee_ids` was
    # never itself in that supplied-keys set.
    recipients: set[str] = set()
    if "assignee_ids" in patch:
        recipients.update(patch["assignee_ids"])
    if "waiting_on_ids" in patch:
        recipients.update(patch["waiting_on_ids"])
    for user_id in recipients:
        if not await MembershipRepository(db).find(workspace_id=workspace_id, user_id=user_id):
            raise ValidationError("Assignees and waiting-on people must belong to this workspace.")
    if patch.get("status", existing["status"]) in ("resolved", "wont_fix"):
        patch.update(waiting_on_ids=[], waiting_on_client=False)

    await repo.update(comment_id, patch)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=comment_events.COMMENT_UPDATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"comment_id": comment_id, **{k: v for k, v in patch.items() if k != "edited_at"}},
    )

    status_changed = status is not None and status != existing["status"]

    previous_assignees = existing.get(
        "assignee_ids", [existing["assignee_id"]] if existing.get("assignee_id") else []
    )
    for assigned_user_id in set(patch.get("assignee_ids", [])) - set(previous_assignees):
        await notification_service.notify_comment_assigned(
            db,
            workspace_id=workspace_id,
            project_id=project_id,
            comment_id=comment_id,
            assignee_user_id=assigned_user_id,
            actor_user_id=actor_user_id,
        )

    if status_changed:
        # M-06: notify whoever has a stake in this comment - its current assignees
        # plus its own author when that author is a member (a guest author has no
        # notification inbox; notify_comment_status_changed's own membership guard
        # would also refuse a guest id, this just avoids the pointless lookup).
        # Excludes the actor themselves (handled inside the notify function too).
        final_assignees = patch.get("assignee_ids", previous_assignees)
        status_recipients = set(final_assignees)
        if existing["author_type"] == "member" and existing.get("author_member_id"):
            status_recipients.add(existing["author_member_id"])
        for recipient_id in status_recipients:
            await notification_service.notify_comment_status_changed(
                db,
                workspace_id=workspace_id,
                project_id=project_id,
                comment_id=comment_id,
                new_status=patch["status"],
                recipient_user_id=recipient_id,
                actor_user_id=actor_user_id,
            )

    updated = await repo.find_by_id(comment_id)
    assert updated is not None
    comment_out = await _comment_out(db, updated)
    await _broadcast_comment_event(
        event_type="comment.updated",
        workspace_id=workspace_id,
        project_id=project_id,
        comment=comment_out,
    )
    if status_changed:
        await _dispatch_integration_event(
            db,
            workspace_id=workspace_id,
            event_type="comment.status_changed",
            comment_id=comment_id,
        )
        if status == "resolved" and updated["author_type"] == "guest":
            await _notify_guest_comment_resolved(db, updated)
    return comment_out


async def _notify_guest_comment_resolved(
    db: AsyncIOMotorDatabase[dict[str, Any]], comment_doc: dict[str, Any]
) -> None:
    """17.6's opt-in guest notification: "your feedback was addressed" when a comment
    they authored moves to resolved - only if they supplied an email at session
    creation (never required, F1). Dispatched via Arq, off the request path."""
    from app.modules.share_links.repository import GuestSessionRepository

    guest_doc = await GuestSessionRepository(db).find_by_id(comment_doc["author_guest_id"])
    if guest_doc is None or not guest_doc.get("email"):
        return

    pool = await get_arq_pool()
    await pool.enqueue_job(
        "send_guest_resolved_email_job",
        guest_email=guest_doc["email"],
        guest_name=guest_doc["display_name"],
        comment_body=comment_doc["body"],
    )


async def resolve_own_comment(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, comment_id: str, actor: Actor
) -> CommentOut:
    """FD-AUD-018/M-04 "let reviewers resolve their own comments" - narrow, additive
    exception to 13-Authentication.md §13.5's guest permission matrix (documented in
    TDR-0015, since that spec text is otherwise an unconditional "never" for guest
    status changes). Scoped tightly on every axis so this can't become general guest
    moderation:
      - guest actors only (a member already has PATCH /comments/{id} for this)
      - the comment's own author only (_require_own_comment, same check delete/edit use)
      - the owning project's reviewer_can_resolve setting must be on
      - one direction only: -> resolved. A guest can never reopen, reassign, or
        change any other field through this endpoint.
    """
    if not isinstance(actor, GuestSession):
        raise PermissionDeniedError("Only a guest reviewer resolves their own comment this way.")

    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if existing is None or existing.get("deleted_at") is not None:
        raise NotFoundError("Comment not found.")
    _require_own_comment(existing, actor)

    page = await PageRepository(db).find_by_id(existing["page_id"])
    if page is None:
        raise NotFoundError("Page not found.")
    workspace_id = await resolve_actor_project_access(db, actor, page["project_id"])

    project = await ProjectRepository(db).find_by_id(page["project_id"])
    if project is None or not project.get("settings_json", {}).get("reviewer_can_resolve", False):
        raise PermissionDeniedError(
            "This project does not let reviewers resolve their own comments."
        )

    if existing["status"] == "resolved":
        return await _comment_out(db, existing)  # idempotent no-op, not an error

    await repo.update(
        comment_id, {"status": "resolved", "waiting_on_ids": [], "waiting_on_client": False}
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=comment_events.COMMENT_UPDATED,
        actor_type="guest",
        actor_id=actor.guest_session_id,
        payload={"comment_id": comment_id, "status": "resolved", "resolved_by": "reviewer"},
    )

    updated = await repo.find_by_id(comment_id)
    assert updated is not None
    comment_out = await _comment_out(db, updated)
    await _broadcast_comment_event(
        event_type="comment.updated",
        workspace_id=workspace_id,
        project_id=page["project_id"],
        comment=comment_out,
    )
    await _dispatch_integration_event(
        db,
        workspace_id=workspace_id,
        event_type="comment.status_changed",
        comment_id=comment_id,
    )
    # Same M-06 stakeholder notification status changes always trigger - a guest
    # resolving their own comment is still a status change assignees/authors care
    # about. The comment's own author is this same guest, so there's nothing to
    # notify there; only assignees are relevant.
    assignees = existing.get(
        "assignee_ids", [existing["assignee_id"]] if existing.get("assignee_id") else []
    )
    for recipient_id in assignees:
        await notification_service.notify_comment_status_changed(
            db,
            workspace_id=workspace_id,
            project_id=page["project_id"],
            comment_id=comment_id,
            new_status="resolved",
            recipient_user_id=recipient_id,
            actor_user_id="",
        )
    return comment_out


async def list_guest_board(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, project_id: str, actor: Actor
) -> GuestBoardOut:
    """FD-AUD-042/M-04 "show the ticket board to this client". A deliberately
    client-safe DTO built from scratch (GuestBoardItemOut), never the staff
    CommentOut/board payload with fields hidden in React (M-02's explicit
    requirement). The endpoint itself is unreachable at all when the project's
    show_board_to_client setting is off - matching the prototype's own wording
    ("Off means clients see comments and statuses but not due dates, assignees or
    the board"), so there is no partial/degraded response to design for."""
    workspace_id = await resolve_actor_project_access(db, actor, project_id)
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None:
        raise NotFoundError("Project not found.")
    if not project.get("settings_json", {}).get("show_board_to_client", False):
        raise PermissionDeniedError(
            "The ticket board is not shared with reviewers on this project."
        )

    pages = await PageRepository(db).list_for_project(workspace_id, project_id)
    page_ids = [str(page["_id"]) for page in pages]
    if not page_ids:
        return GuestBoardOut(project_id=project_id, items=[])

    docs = await CommentRepository(db).list_client_layer_for_project(workspace_id, page_ids)
    all_assignee_ids = {
        user_id
        for doc in docs
        for user_id in doc.get(
            "assignee_ids", [doc["assignee_id"]] if doc.get("assignee_id") else []
        )
    }
    users_by_id = await UserRepository(db).find_many_by_ids(list(all_assignee_ids))
    items = []
    for doc in docs:
        assignee_ids = doc.get(
            "assignee_ids", [doc["assignee_id"]] if doc.get("assignee_id") else []
        )
        names = [
            users_by_id[user_id]["name"] if user_id in users_by_id else "Former member"
            for user_id in assignee_ids
        ]
        items.append(
            GuestBoardItemOut(
                id=str(doc["_id"]),
                body=doc["body"],
                status=doc["status"],
                created_at=doc["created_at"],
                due_at=doc.get("due_at"),
                assignee_names=names,
            )
        )
    return GuestBoardOut(project_id=project_id, items=items)


async def toggle_layer(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    actor_user_id: str,
    layer: str,
    confirm: bool,
) -> CommentOut:
    if not confirm:
        raise ValidationError("Toggling a comment's layer requires confirm: true.")

    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if (
        existing is None
        or existing["workspace_id"] != workspace_id
        or existing.get("deleted_at") is not None
    ):
        raise NotFoundError("Comment not found.")

    await repo.update(comment_id, {"layer": layer})
    await append_event(
        db,
        workspace_id=workspace_id,
        type=comment_events.COMMENT_LAYER_CHANGED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"comment_id": comment_id, "new_layer": layer},
    )

    updated = await repo.find_by_id(comment_id)
    assert updated is not None
    comment_out = await _comment_out(db, updated)
    page = await _page_for_broadcast(db, updated["page_id"])
    if page is not None:
        # Note: a client->team toggle has no corresponding "hide this" WS event (the
        # spec's event table has no comment.deleted/comment.hidden type) - a guest who
        # already has this comment in a local list (once the widget maintains one)
        # would only stop seeing it on their next full refetch, not live. Documented in
        # TDR-0006, not solved here: inventing new protocol surface wasn't asked for by
        # this milestone.
        await _broadcast_comment_event(
            event_type="comment.updated",
            workspace_id=workspace_id,
            project_id=page["project_id"],
            comment=comment_out,
        )
    return comment_out


async def reanchor(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    comment_id: str,
    workspace_id: str,
    actor_user_id: str,
    anchor: AnchorIn,
) -> CommentOut:
    repo = CommentRepository(db)
    existing = await repo.find_by_id(comment_id)
    if (
        existing is None
        or existing["workspace_id"] != workspace_id
        or existing.get("deleted_at") is not None
    ):
        raise NotFoundError("Comment not found.")

    await repo.update(
        comment_id,
        {
            "anchor": anchor.model_dump(),
            "recovery_status": "ok",
            "consecutive_orphaned_revisions": 0,
        },
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=comment_events.COMMENT_REANCHORED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"comment_id": comment_id},
    )

    updated = await repo.find_by_id(comment_id)
    assert updated is not None
    comment_out = await _comment_out(db, updated)
    page = await _page_for_broadcast(db, updated["page_id"])
    if page is not None:
        await _broadcast_comment_event(
            event_type="comment.updated",
            workspace_id=workspace_id,
            project_id=page["project_id"],
            comment=comment_out,
        )
    return comment_out
