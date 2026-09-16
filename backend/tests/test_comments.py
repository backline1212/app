from typing import Any

import pytest
from httpx import AsyncClient

from tests.helpers import create_project_with_guest_session
from tests.test_notifications import _invite_and_login_member

SAMPLE_ANCHOR = {
    "tier": 1,
    "dom_fingerprint": {
        "selector_path": "body > button:nth-of-type(1)",
        "tag": "button",
        "attributes": {"class": "btn btn-primary", "data-testid": "upgrade-cta"},
        "node_hash": "sha256:9f2a",
        "ancestor_path_hash": "sha256:aa11",
    },
    "text_fingerprint": {
        "normalized_text": "upgrade to pro",
        "text_similarity_hash": "0" * 16,
    },
}

SAMPLE_CONTEXT = {
    "browser": "Chrome",
    "os": "macOS",
    "viewport": {"width": 1440, "height": 900},
    "device_type": "desktop",
    "url": "https://reviewable.example.com/",
}


async def _register_page(client: AsyncClient, ctx: dict[str, Any]) -> str:
    resp = await client.post(
        "/api/v1/pages",
        json={"project_id": ctx["project_id"], "url": "https://reviewable.example.com/"},
        headers=ctx["guest_headers"],
    )
    assert resp.status_code == 201
    page_id: str = resp.json()["id"]
    return page_id


def _comment_payload(body: str = "Something's off here.", layer: str = "client") -> dict[str, Any]:
    return {
        "body": body,
        "layer": layer,
        "anchor": SAMPLE_ANCHOR,
        "context": SAMPLE_CONTEXT,
        "screenshot_key": None,
        "capture_status": "ok",
    }


async def test_guest_can_create_a_comment_defaulting_to_client_layer(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm1@example.com", code="700001", workspace_name="C1"
    )
    page_id = await _register_page(client, ctx)

    resp = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(),
        headers=ctx["guest_headers"],
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["layer"] == "client"
    assert body["author_type"] == "guest"
    assert body["status"] == "todo"
    assert body["recovery_status"] == "ok"


async def test_anchor_click_offset_round_trips(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A selector path resolves no finer than a whole element, so the SDK also stores
    where inside that element the reviewer clicked (as a 0-1 fraction) - that's what
    puts a pin back on the clicked word rather than the paragraph's corner on reload.
    Pydantic drops unknown fields silently, so without DomFingerprintIn declaring this
    explicitly the offset would vanish on the way into the database with no error."""
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm-offset@example.com", code="700098", workspace_name="COffset"
    )
    page_id = await _register_page(client, ctx)

    payload = _comment_payload()
    payload["anchor"] = {
        **SAMPLE_ANCHOR,
        "dom_fingerprint": {
            **SAMPLE_ANCHOR["dom_fingerprint"],  # type: ignore[dict-item]
            "click_offset_pct": {"x": 0.42, "y": 0.75},
        },
    }
    resp = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=payload, headers=ctx["guest_headers"]
    )
    assert resp.status_code == 201
    assert resp.json()["anchor"]["dom_fingerprint"]["click_offset_pct"] == {"x": 0.42, "y": 0.75}

    # And it's still there when the comment is read back, not just echoed on create.
    listed = await client.get(f"/api/v1/pages/{page_id}/comments", headers=ctx["guest_headers"])
    assert listed.json()[0]["anchor"]["dom_fingerprint"]["click_offset_pct"] == {
        "x": 0.42,
        "y": 0.75,
    }

    # An anchor with no offset at all (every comment created before this field existed)
    # is still accepted, and reads back as None rather than erroring.
    plain = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=_comment_payload(), headers=ctx["guest_headers"]
    )
    assert plain.status_code == 201
    assert plain.json()["anchor"]["dom_fingerprint"]["click_offset_pct"] is None


async def test_comment_and_reply_attachments_round_trip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Attachments (images, PDF, Word/Excel docs, Markdown) are uploaded client-side via
    the same presigned-PUT flow a screenshot uses, then referenced by key on create -
    this doesn't re-verify the upload itself (test_storage.py covers that), just that a
    comment/reply created with attachment keys round-trips them back with resolved,
    fetchable URLs and the original filename/content_type intact."""
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm-attach@example.com", code="700099", workspace_name="CAttach"
    )
    page_id = await _register_page(client, ctx)

    payload = _comment_payload()
    payload["attachments"] = [
        {
            "key": "uploads/ws1/p1/brief.pdf",
            "filename": "brief.pdf",
            "content_type": "application/pdf",
        },
        {
            "key": "uploads/ws1/p1/notes.md",
            "filename": "notes.md",
            "content_type": "text/markdown",
        },
    ]
    resp = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=payload, headers=ctx["guest_headers"]
    )
    assert resp.status_code == 201
    comment = resp.json()
    assert len(comment["attachments"]) == 2
    assert comment["attachments"][0]["filename"] == "brief.pdf"
    assert comment["attachments"][0]["content_type"] == "application/pdf"
    assert comment["attachments"][0]["url"]
    assert comment["attachments"][1]["filename"] == "notes.md"

    reply_resp = await client.post(
        f"/api/v1/comments/{comment['id']}/replies",
        json={
            "body": "Here's the updated version.",
            "attachments": [
                {
                    "key": "uploads/ws1/p1/v2.docx",
                    "filename": "v2.docx",
                    "content_type": (
                        "application/vnd.openxmlformats-officedocument." "wordprocessingml.document"
                    ),
                }
            ],
        },
        headers=ctx["guest_headers"],
    )
    assert reply_resp.status_code == 201
    reply = reply_resp.json()
    assert len(reply["attachments"]) == 1
    assert reply["attachments"][0]["filename"] == "v2.docx"
    assert reply["attachments"][0]["url"]

    # A comment/reply created with no attachments still round-trips as an empty list,
    # not a missing field.
    plain_resp = await client.post(
        f"/api/v1/comments/{comment['id']}/replies",
        json={"body": "No files on this one."},
        headers=ctx["guest_headers"],
    )
    assert plain_resp.status_code == 201
    assert plain_resp.json()["attachments"] == []


async def test_comment_out_resolves_a_real_author_name(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """author_name is resolved live (comments/service.py's _resolve_author_name), not
    stored on the comment - a guest's display_name (from their guest_session doc) for a
    guest-authored comment, the signed-in user's own name for a member-authored one.
    The dashboard's Comments panel needs a real name, not just author_type/author_id."""
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm1b@example.com", code="700010", workspace_name="C1B"
    )
    page_id = await _register_page(client, ctx)

    guest_comment = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(),
        headers=ctx["guest_headers"],
    )
    assert guest_comment.json()["author_name"] == "Test Guest"

    member_comment = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(),
        headers=ctx["owner_headers"],
    )
    assert member_comment.json()["author_name"] == "cm1b"


async def test_guest_cannot_override_layer_to_team(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm2@example.com", code="700002", workspace_name="C2"
    )
    page_id = await _register_page(client, ctx)

    resp = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(layer="team"),
        headers=ctx["guest_headers"],
    )
    assert resp.status_code == 201
    # The service forces layer=client regardless of what the guest requested
    # (12-API-WebSocket.md §12.4) - this is not merely a default, it's an override.
    assert resp.json()["layer"] == "client"


async def test_member_can_create_team_only_comment(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm3@example.com", code="700003", workspace_name="C3"
    )
    page_id = await _register_page(client, ctx)

    resp = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(layer="team"),
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["layer"] == "team"
    assert resp.json()["author_type"] == "member"


async def test_guest_never_receives_team_layer_comments_in_raw_api_response(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The exact guarantee F3/Journey #3 depends on (19-Testing-CI.md §19.3): asserted
    against the raw API response the guest session receives, not what's rendered."""
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm4@example.com", code="700004", workspace_name="C4"
    )
    page_id = await _register_page(client, ctx)

    await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(body="Client-visible issue", layer="client"),
        headers=ctx["owner_headers"],
    )
    await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(body="Internal-only note", layer="team"),
        headers=ctx["owner_headers"],
    )

    guest_listing = await client.get(
        f"/api/v1/pages/{page_id}/comments", headers=ctx["guest_headers"]
    )
    assert guest_listing.status_code == 200
    bodies = [c["body"] for c in guest_listing.json()]
    assert bodies == ["Client-visible issue"]
    assert "Internal-only note" not in bodies

    member_listing = await client.get(
        f"/api/v1/pages/{page_id}/comments", headers=ctx["owner_headers"]
    )
    member_bodies = {c["body"] for c in member_listing.json()}
    assert member_bodies == {"Client-visible issue", "Internal-only note"}


async def test_team_only_reply_is_absent_from_guests_view(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Exact scenario from 19-Testing-CI.md §19.3 Journey #3: a team member posts a
    team-only reply on an otherwise client-visible thread; the guest re-opening that
    thread must not see it - checked against the raw API, not the UI."""
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm5@example.com", code="700005", workspace_name="C5"
    )
    page_id = await _register_page(client, ctx)

    parent = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(body="Client-visible parent", layer="client"),
        headers=ctx["guest_headers"],
    )
    parent_id = parent.json()["id"]

    reply = await client.post(
        f"/api/v1/comments/{parent_id}/replies",
        json={"body": "Let's not mention this to the client yet", "layer": "team"},
        headers=ctx["owner_headers"],
    )
    assert reply.status_code == 201
    assert reply.json()["layer"] == "team"
    assert reply.json()["parent_id"] == parent_id

    guest_listing = await client.get(
        f"/api/v1/pages/{page_id}/comments", headers=ctx["guest_headers"]
    )
    guest_bodies = [c["body"] for c in guest_listing.json()]
    assert "Let's not mention this to the client yet" not in guest_bodies
    assert "Client-visible parent" in guest_bodies


async def test_guest_reply_defaults_to_client_and_is_visible(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm6@example.com", code="700006", workspace_name="C6"
    )
    page_id = await _register_page(client, ctx)

    parent = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(layer="client"),
        headers=ctx["guest_headers"],
    )
    parent_id = parent.json()["id"]

    reply = await client.post(
        f"/api/v1/comments/{parent_id}/replies",
        json={"body": "Thanks, will fix", "layer": "team"},  # guest can't set team
        headers=ctx["guest_headers"],
    )
    assert reply.status_code == 201
    assert reply.json()["layer"] == "client"


async def test_guest_cannot_reply_to_a_team_only_comment(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm7@example.com", code="700007", workspace_name="C7"
    )
    page_id = await _register_page(client, ctx)

    team_comment = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json=_comment_payload(layer="team"),
        headers=ctx["owner_headers"],
    )
    team_comment_id = team_comment.json()["id"]

    resp = await client.post(
        f"/api/v1/comments/{team_comment_id}/replies",
        json={"body": "trying to reply anyway"},
        headers=ctx["guest_headers"],
    )
    # Not-found, not forbidden - a crafted request must not be able to confirm that a
    # team-only comment exists on a page the guest can otherwise see.
    assert resp.status_code == 404


async def test_member_can_update_status_and_assignee(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm8@example.com", code="700008", workspace_name="C8"
    )
    # B2 (production-readiness-master-plan-2026-09-13.md): assignee_id is now validated
    # against real workspace membership, same as the plural assignee_ids field - an
    # arbitrary string like the old "someone" fixture value is correctly rejected
    # (422 ValidationError) rather than silently accepted.
    member_user_id, _ = await _invite_and_login_member(
        client, monkeypatch, ctx, email="cm8-member@example.com", code="700009"
    )
    page_id = await _register_page(client, ctx)
    created = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=_comment_payload(), headers=ctx["owner_headers"]
    )
    comment_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/comments/{comment_id}",
        json={"status": "in_progress", "assignee_id": member_user_id},
        headers=ctx["owner_headers"],
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "in_progress"
    assert updated.json()["assignee_id"] == member_user_id
    assert updated.json()["edited_at"] is not None


async def test_guest_cannot_update_comment(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm9@example.com", code="700009", workspace_name="C9"
    )
    page_id = await _register_page(client, ctx)
    created = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=_comment_payload(), headers=ctx["guest_headers"]
    )
    comment_id = created.json()["id"]

    resp = await client.patch(
        f"/api/v1/comments/{comment_id}", json={"status": "resolved"}, headers=ctx["guest_headers"]
    )
    assert resp.status_code == 401


async def test_toggle_layer_requires_confirm_true(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm10@example.com", code="700010", workspace_name="C10"
    )
    page_id = await _register_page(client, ctx)
    created = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=_comment_payload(), headers=ctx["owner_headers"]
    )
    comment_id = created.json()["id"]

    without_confirm = await client.patch(
        f"/api/v1/comments/{comment_id}/layer",
        json={"layer": "team", "confirm": False},
        headers=ctx["owner_headers"],
    )
    assert without_confirm.status_code == 422

    with_confirm = await client.patch(
        f"/api/v1/comments/{comment_id}/layer",
        json={"layer": "team", "confirm": True},
        headers=ctx["owner_headers"],
    )
    assert with_confirm.status_code == 200
    assert with_confirm.json()["layer"] == "team"


async def test_reanchor_updates_anchor_and_recovery_status(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="cm11@example.com", code="700011", workspace_name="C11"
    )
    page_id = await _register_page(client, ctx)
    created = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=_comment_payload(), headers=ctx["owner_headers"]
    )
    comment_id = created.json()["id"]

    new_anchor = {
        **SAMPLE_ANCHOR,
        "text_fingerprint": {"normalized_text": "a new label", "text_similarity_hash": "0" * 16},
    }
    resp = await client.patch(
        f"/api/v1/comments/{comment_id}/reanchor",
        json={"anchor": new_anchor},
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["anchor"]["text_fingerprint"]["normalized_text"] == "a new label"
    assert resp.json()["recovery_status"] == "ok"


async def test_comment_endpoints_require_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pages/000000000000000000000000/comments")
    assert resp.status_code == 401


async def test_cross_tenant_comment_update_is_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="cm12a@example.com", code="700012", workspace_name="C12A"
    )
    page_id = await _register_page(client, ctx_a)
    created = await client.post(
        f"/api/v1/pages/{page_id}/comments", json=_comment_payload(), headers=ctx_a["owner_headers"]
    )
    comment_id = created.json()["id"]

    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="cm12b@example.com", code="700013", workspace_name="C12B"
    )

    resp = await client.patch(
        f"/api/v1/comments/{comment_id}",
        json={"status": "resolved"},
        headers=ctx_b["owner_headers"],
    )
    assert resp.status_code == 404
