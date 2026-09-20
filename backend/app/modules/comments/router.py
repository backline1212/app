from datetime import datetime

from fastapi import APIRouter, Depends, Request

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.rate_limit import actor_rate_limit_key, check_rate_limit
from app.core.redis_client import get_redis
from app.core.session import Actor, Session, get_current_actor, require_workspace_context
from app.modules.comments import service as comment_service
from app.modules.comments.schemas import (
    CommentBodyEdit,
    CommentCreate,
    CommentOut,
    CommentUpdate,
    GuestBoardOut,
    LayerToggleRequest,
    ReanchorRequest,
    ReplyCreate,
)

router = APIRouter(tags=["comments"])


@router.get("/pages/{page_id}/comments", response_model=list[CommentOut])
async def list_comments(
    page_id: str,
    since: datetime | None = None,
    actor: Actor = Depends(get_current_actor),
) -> list[CommentOut]:
    return await comment_service.list_comments(get_db(), page_id=page_id, actor=actor, since=since)


@router.get("/projects/{project_id}/comments", response_model=list[CommentOut])
async def list_comments_for_project(
    project_id: str,
    session: Session = Depends(require_permission("comment:view_team")),
) -> list[CommentOut]:
    return await comment_service.list_comments_for_project(
        get_db(), project_id=project_id, workspace_id=require_workspace_context(session)
    )


# FD-AUD-042/M-04 "show the ticket board to this client". Reachable by both a guest
# (their share link's own project) and a member (who is always allowed to preview
# exactly what their client sees) via get_current_actor - comment_service enforces
# both the workspace/project boundary and the show_board_to_client setting itself,
# so no separate permission dependency is needed here.
@router.get("/projects/{project_id}/guest-board", response_model=GuestBoardOut)
async def guest_board(project_id: str, actor: Actor = Depends(get_current_actor)) -> GuestBoardOut:
    return await comment_service.list_guest_board(get_db(), project_id=project_id, actor=actor)


@router.post("/pages/{page_id}/comments", response_model=CommentOut, status_code=201)
async def create_comment(
    page_id: str, body: CommentCreate, request: Request, actor: Actor = Depends(get_current_actor)
) -> CommentOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("comment-create", request, actor),
        limit=settings.comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    return await comment_service.create_comment(
        get_db(),
        page_id=page_id,
        actor=actor,
        body=body.body,
        layer=body.layer,
        anchor=body.anchor,
        context=body.context,
        screenshot_key=body.screenshot_key,
        capture_status=body.capture_status,
        attachments=body.attachments,
        tags=body.tags,
        client_request_id=body.client_request_id,
    )


@router.post("/comments/{comment_id}/replies", response_model=CommentOut, status_code=201)
async def create_reply(
    comment_id: str, body: ReplyCreate, request: Request, actor: Actor = Depends(get_current_actor)
) -> CommentOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("comment-create", request, actor),
        limit=settings.comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    return await comment_service.create_reply(
        get_db(),
        parent_id=comment_id,
        actor=actor,
        body=body.body,
        layer=body.layer,
        attachments=body.attachments,
        client_request_id=body.client_request_id,
        mentioned_user_ids=body.mentioned_user_ids,
    )


# Deliberately not member-only like PATCH /comments/{id} above - a guest reviewer needs
# to be able to delete their own accidental/abandoned comments too (docs/tdr's
# "only the comment's own author" scope decision). comment_service enforces authorship,
# not this dependency.
@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: str, request: Request, actor: Actor = Depends(get_current_actor)
) -> None:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("comment-create", request, actor),
        limit=settings.comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    await comment_service.delete_comment(get_db(), comment_id=comment_id, actor=actor)


# Same "own author only" scope as delete above - distinct from the member-only
# PATCH /comments/{comment_id} below, which is a moderation action over any comment
# regardless of authorship.
@router.patch("/comments/{comment_id}/body", response_model=CommentOut)
async def edit_comment_body(
    comment_id: str,
    body: CommentBodyEdit,
    request: Request,
    actor: Actor = Depends(get_current_actor),
) -> CommentOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("comment-create", request, actor),
        limit=settings.comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    return await comment_service.edit_comment(
        get_db(), comment_id=comment_id, actor=actor, body=body.body
    )


# FD-AUD-018/M-04 "let reviewers resolve their own comments" - own-author-only,
# guest-only, gated by the owning project's reviewer_can_resolve setting (see
# comment_service.resolve_own_comment's docstring and TDR-0015). Deliberately a
# distinct route from the member-only moderation PATCH /comments/{comment_id} below
# rather than a status value that endpoint would also have to accept from a guest.
@router.patch("/comments/{comment_id}/resolve", response_model=CommentOut)
async def resolve_own_comment(
    comment_id: str, request: Request, actor: Actor = Depends(get_current_actor)
) -> CommentOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("comment-create", request, actor),
        limit=settings.comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    return await comment_service.resolve_own_comment(get_db(), comment_id=comment_id, actor=actor)


@router.delete("/comments/{comment_id}/thread", status_code=204)
async def delete_thread(
    comment_id: str, request: Request, actor: Actor = Depends(get_current_actor)
) -> None:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("comment-create", request, actor),
        limit=settings.comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    await comment_service.delete_thread(get_db(), comment_id=comment_id, actor=actor)


# Dashboard moderation - any comment in the caller's workspace, regardless of
# authorship (same trust level as PATCH /comments/{id} below already grants). Distinct
# routes from DELETE /comments/{id} and /thread above, which are the widget's
# own-author-only guest self-service surface with no role gate at all.
@router.delete("/comments/{comment_id}/moderate", status_code=204)
async def delete_comment_moderated(
    comment_id: str, session: Session = Depends(require_permission("comment:delete"))
) -> None:
    await comment_service.delete_comment_moderated(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
    )


@router.delete("/comments/{comment_id}/thread/moderate", status_code=204)
async def delete_thread_moderated(
    comment_id: str, session: Session = Depends(require_permission("comment:delete"))
) -> None:
    await comment_service.delete_thread_moderated(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
    )


@router.patch("/comments/{comment_id}", response_model=CommentOut)
async def update_comment(
    comment_id: str,
    body: CommentUpdate,
    session: Session = Depends(require_permission("comment:update_status")),
) -> CommentOut:
    return await comment_service.update_comment(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
        body=body.body,
        status=body.status,
        assignee_id=body.assignee_id,
        due_at=body.due_at,
        changes=body,
    )


@router.patch("/comments/{comment_id}/layer", response_model=CommentOut)
async def toggle_layer(
    comment_id: str,
    body: LayerToggleRequest,
    session: Session = Depends(require_permission("comment:toggle_layer")),
) -> CommentOut:
    return await comment_service.toggle_layer(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
        layer=body.layer,
        confirm=body.confirm,
    )


@router.patch("/comments/{comment_id}/reanchor", response_model=CommentOut)
async def reanchor(
    comment_id: str,
    body: ReanchorRequest,
    session: Session = Depends(require_permission("comment:reanchor")),
) -> CommentOut:
    return await comment_service.reanchor(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
        anchor=body.anchor,
    )
