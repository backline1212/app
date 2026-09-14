from datetime import UTC, datetime
from html import escape
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.email import send_email
from app.modules.auth.repository import UserRepository
from app.modules.comments.repository import CommentRepository
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository

# 17.6: "Instant or daily digest (member-configurable per workspace, default: daily)."
# Only the daily digest is implemented this milestone - a per-member instant/daily
# preference needs its own settings UI and a schema field on `memberships`, which is a
# real, separate piece of scope deliberately deferred (docs/tdr/0009), not half-built
# here. Every member currently gets the daily digest; there is no instant mode yet.
#
# M-08: this module previously issued raw db.* calls directly instead of going through
# each collection's repository (rule 2.1 violation) - every query below now goes
# through the same repository classes the rest of the app uses.


async def _project_name_for_page(
    db: AsyncIOMotorDatabase[dict[str, Any]], page_id: str, cache: dict[str, str]
) -> str:
    if page_id in cache:
        return cache[page_id]
    page = await PageRepository(db).find_by_id(page_id)
    name = "Unknown project"
    if page is not None:
        project = await ProjectRepository(db).find_by_id(page["project_id"])
        if project is not None:
            name = str(project["name"])
    cache[page_id] = name
    return name


def _render_digest_html(grouped: dict[str, list[dict[str, Any]]]) -> str:
    sections = []
    for project_name, comments in grouped.items():
        items = "".join(f"<li>{escape(c['body'][:200])}</li>" for c in comments)
        sections.append(f"<h3>{escape(project_name)}</h3><ul>{items}</ul>")
    return "<p>New comments since your last digest:</p>" + "".join(sections)


async def run_digest_for_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_doc: dict[str, Any]
) -> int:
    """Returns the number of comments included (0 if nothing new, or on a workspace's
    first-ever run - there's no prior checkpoint to diff against, so it just establishes
    one rather than emailing the workspace's entire history on day one)."""
    workspace_id = str(workspace_doc["_id"])
    since = workspace_doc.get("last_digest_sent_at")
    now = datetime.now(UTC)
    workspace_repo = WorkspaceRepository(db)

    # Claim the digest window atomically BEFORE fetching/sending anything: a second
    # overlapping run for this workspace (duplicate schedule fire) or a retry after a
    # partial crash will lose this compare-and-swap and skip, rather than both runs
    # emailing the same batch of comments to every member.
    if not await workspace_repo.claim_digest_window(
        workspace_id, expected_last_sent_at=since, new_last_sent_at=now
    ):
        return 0

    if since is None:
        return 0

    comments = await CommentRepository(db).list_since_for_workspace(workspace_id, since)

    if not comments:
        return 0

    project_name_cache: dict[str, str] = {}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for comment in comments:
        project_name = await _project_name_for_page(db, comment["page_id"], project_name_cache)
        grouped.setdefault(project_name, []).append(comment)

    html = _render_digest_html(grouped)
    subject = (
        f"{len(comments)} new comment{'s' if len(comments) != 1 else ''} - {workspace_doc['name']}"
    )

    members = await MembershipRepository(db).list_for_workspace(workspace_id)
    users_by_id = await UserRepository(db).find_many_by_ids([m["user_id"] for m in members])
    for membership in members:
        user_doc = users_by_id.get(membership["user_id"])
        if user_doc is None or not user_doc.get("preferences", {}).get("daily_digest", True):
            continue
        await send_email(to=user_doc["email"], subject=subject, html=html)

    return len(comments)


async def run_daily_digests(db: AsyncIOMotorDatabase[dict[str, Any]]) -> dict[str, int]:
    workspaces = await WorkspaceRepository(db).list_all()
    results = {}
    for workspace_doc in workspaces:
        count = await run_digest_for_workspace(db, workspace_doc)
        results[str(workspace_doc["_id"])] = count
    return results
