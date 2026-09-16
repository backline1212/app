"""modules/mcp (docs/implementation/slack-ai-mcp-architecture.md §2): personal-access-
token issuance/listing/revocation, the session-authenticated "generate implementation
prompt" dashboard action, and the PAT bearer-token verification the MCP server itself
uses (modules/mcp/server.py mounts a separate Starlette app that isn't reachable through
the ASGI `client` fixture, so verify_bearer_token/BacklineTokenVerifier are tested
directly rather than through an HTTP round trip). Previously entirely untested despite
being the newest, most security-sensitive surface in this codebase (a long-lived bearer
credential an external tool holds)."""

from typing import Any

import pytest
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.modules.mcp import service as mcp_service
from app.modules.mcp.service import BacklineTokenVerifier, pack_actor, unpack_actor
from tests.helpers import create_project_with_guest_session, login_via_otp, switch_workspace
from tests.test_integrations import _register_page_and_comment


async def test_issue_list_and_revoke_mcp_token(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="mcp1@example.com", code="970001", workspace_name="MCP1"
    )
    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/mcp/tokens",
        json={"label": "My laptop", "agent_hint": "claude"},
        headers=ctx["owner_headers"],
    )
    assert issued.status_code == 201
    body = issued.json()
    assert body["token"].startswith("bl_mcp_")
    token_id = body["id"]

    listing = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/mcp/tokens", headers=ctx["owner_headers"]
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    # The raw secret is never returned again, only in the one-time issue response.
    assert "token" not in listing.json()[0]
    assert body["token"] not in listing.text

    revoke = await client.delete(
        f"/api/v1/mcp/tokens/{token_id}", headers=ctx["owner_headers"]
    )
    assert revoke.status_code == 204

    listing_after = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/mcp/tokens", headers=ctx["owner_headers"]
    )
    assert listing_after.json()[0]["revoked_at"] is not None


async def test_cannot_revoke_someone_elses_mcp_token(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="mcp2@example.com", code="970002", workspace_name="MCP2"
    )
    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/mcp/tokens",
        json={"label": "Owner's token", "agent_hint": None},
        headers=ctx["owner_headers"],
    )
    token_id = issued.json()["id"]

    invite = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/members/invite",
        json={"email": "mcp2-member@example.com", "role": "member"},
        headers=ctx["owner_headers"],
    )
    assert invite.status_code == 201
    member_login = await login_via_otp(client, monkeypatch, "mcp2-member@example.com", "970003")
    member_token = await switch_workspace(client, member_login["access_token"], ctx["workspace_id"])

    resp = await client.delete(
        f"/api/v1/mcp/tokens/{token_id}",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert resp.status_code == 404

    # It's still active - the failed cross-user revoke attempt didn't touch it.
    listing = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/mcp/tokens", headers=ctx["owner_headers"]
    )
    assert listing.json()[0]["revoked_at"] is None


async def test_generate_prompt_includes_thread_and_context(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="mcp3@example.com", code="970004", workspace_name="MCP3"
    )
    _, comment_id = await _register_page_and_comment(client, ctx)

    resp = await client.post(
        f"/api/v1/comments/{comment_id}/mcp/generate-prompt",
        json={"agent": "cursor"},
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent"] == "cursor"
    assert "This CTA needs more contrast" in body["implementation_prompt"]


async def test_generate_prompt_rejects_comment_from_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="mcp4a@example.com", code="970005", workspace_name="MCP4a"
    )
    _, comment_id_a = await _register_page_and_comment(client, ctx_a)

    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="mcp4b@example.com", code="970006", workspace_name="MCP4b"
    )
    resp = await client.post(
        f"/api/v1/comments/{comment_id_a}/mcp/generate-prompt",
        json={"agent": "other"},
        headers=ctx_b["owner_headers"],
    )
    assert resp.status_code == 404


async def test_pack_and_unpack_actor_round_trip() -> None:
    packed = pack_actor("507f1f77bcf86cd799439011", "workspace-abc")
    assert unpack_actor(packed) == ("507f1f77bcf86cd799439011", "workspace-abc")


async def test_verify_bearer_token_rejects_unknown_and_revoked_tokens(
    client: AsyncClient, db: AsyncIOMotorDatabase[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="mcp5@example.com", code="970007", workspace_name="MCP5"
    )
    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/mcp/tokens",
        json={"label": "For verification", "agent_hint": None},
        headers=ctx["owner_headers"],
    )
    raw_token = issued.json()["token"]
    token_id = issued.json()["id"]

    assert await mcp_service.verify_bearer_token(db, "bl_mcp_not-a-real-token") is None

    doc = await mcp_service.verify_bearer_token(db, raw_token)
    assert doc is not None

    # verify_bearer_token returns the doc as read *before* its own touch_last_used
    # call, so check the persisted effect by re-reading rather than asserting on the
    # returned snapshot.
    from bson import ObjectId

    refreshed = await db.mcp_personal_tokens.find_one({"_id": ObjectId(doc["_id"])})
    assert refreshed is not None
    assert refreshed["last_used_at"] is not None

    await client.delete(f"/api/v1/mcp/tokens/{token_id}", headers=ctx["owner_headers"])
    assert await mcp_service.verify_bearer_token(db, raw_token) is None


async def test_backline_token_verifier_packs_user_and_workspace_into_client_id(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="mcp6@example.com", code="970008", workspace_name="MCP6"
    )
    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/mcp/tokens",
        json={"label": "For the verifier", "agent_hint": None},
        headers=ctx["owner_headers"],
    )
    raw_token = issued.json()["token"]

    access_token = await BacklineTokenVerifier().verify_token(raw_token)
    assert access_token is not None
    user_id, workspace_id = unpack_actor(access_token.client_id)
    assert workspace_id == ctx["workspace_id"]
    assert access_token.scopes == ["mcp:generate_prompt"]
