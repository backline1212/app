"""Extension tokens (browser-extension plan, Phase 1a/1b): issue/list/revoke, using a
token as a Bearer credential on an ordinary member-only endpoint, and the role-drift
guard that mirrors validate_member_session's own check for JWTs."""

import pytest
from httpx import AsyncClient

from app.core.security import decode_access_token
from tests.helpers import create_project_with_guest_session, login_via_otp, switch_workspace


async def test_issue_list_and_use_extension_token(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="ext1@example.com", code="930001", workspace_name="EXT1"
    )

    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/extension-tokens",
        json={"name": "My Chrome"},
        headers=ctx["owner_headers"],
    )
    assert issued.status_code == 201
    body = issued.json()
    assert body["name"] == "My Chrome"
    token = body["token"]
    assert token

    listing = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/extension-tokens", headers=ctx["owner_headers"]
    )
    assert listing.status_code == 200
    listed = listing.json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]
    # The raw token/hash is never returned again once issued.
    assert "token" not in listed[0]
    assert "token_hash" not in listed[0]

    ext_headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/projects", headers=ext_headers
    )
    assert resp.status_code == 200
    assert ctx["project_id"] in {p["id"] for p in resp.json()}


async def test_whoami_resolves_pasted_tokens_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="ext6@example.com", code="930009", workspace_name="EXT6"
    )
    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/extension-tokens",
        json={"name": "My Chrome"},
        headers=ctx["owner_headers"],
    )
    ext_headers = {"Authorization": f"Bearer {issued.json()['token']}"}

    resp = await client.get("/api/v1/extension-tokens/whoami", headers=ext_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_id"] == decode_access_token(ctx["owner_token"]).sub
    assert body["user_email"] == "ext6@example.com"
    assert body["workspace"]["id"] == ctx["workspace_id"]
    assert body["workspace"]["role"] == "owner"


async def test_extension_token_cannot_access_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="ext2a@example.com", code="930002", workspace_name="EXT2a"
    )
    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="ext2b@example.com", code="930003", workspace_name="EXT2b"
    )

    issued = await client.post(
        f"/api/v1/workspaces/{ctx_a['workspace_id']}/extension-tokens",
        json={"name": "My Chrome"},
        headers=ctx_a["owner_headers"],
    )
    ext_headers = {"Authorization": f"Bearer {issued.json()['token']}"}

    resp = await client.get(
        f"/api/v1/workspaces/{ctx_b['workspace_id']}/projects", headers=ext_headers
    )
    assert resp.status_code == 403


async def test_revoked_extension_token_is_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="ext3@example.com", code="930004", workspace_name="EXT3"
    )
    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/extension-tokens",
        json={"name": "My Chrome"},
        headers=ctx["owner_headers"],
    )
    token_id = issued.json()["id"]
    ext_headers = {"Authorization": f"Bearer {issued.json()['token']}"}

    revoke = await client.delete(
        f"/api/v1/extension-tokens/{token_id}", headers=ctx["owner_headers"]
    )
    assert revoke.status_code == 204

    resp = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/projects", headers=ext_headers
    )
    assert resp.status_code == 401


async def test_cannot_revoke_another_members_extension_token(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="ext4@example.com", code="930005", workspace_name="EXT4"
    )
    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/extension-tokens",
        json={"name": "Owner's token"},
        headers=ctx["owner_headers"],
    )
    token_id = issued.json()["id"]

    invite = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/members/invite",
        json={"email": "member4@example.com", "role": "member"},
        headers=ctx["owner_headers"],
    )
    assert invite.status_code == 201
    member_login = await login_via_otp(client, monkeypatch, "member4@example.com", "930006")
    member_token = await switch_workspace(
        client, member_login["access_token"], ctx["workspace_id"]
    )

    resp = await client.delete(
        f"/api/v1/extension-tokens/{token_id}",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert resp.status_code == 404


async def test_extension_token_stops_working_after_role_change(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mirrors validate_member_session's own JWT role-drift check (core/session.py):
    a token minted while the member held one role must stop authorizing the instant
    their role changes, not just once the token itself is revoked or expires."""
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="ext5@example.com", code="930007", workspace_name="EXT5"
    )
    invite = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/members/invite",
        json={"email": "member5@example.com", "role": "member"},
        headers=ctx["owner_headers"],
    )
    assert invite.status_code == 201
    member_id = invite.json()["id"]

    member_login = await login_via_otp(client, monkeypatch, "member5@example.com", "930008")
    member_token = await switch_workspace(
        client, member_login["access_token"], ctx["workspace_id"]
    )
    member_headers = {"Authorization": f"Bearer {member_token}"}

    issued = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/extension-tokens",
        json={"name": "Member's Chrome"},
        headers=member_headers,
    )
    assert issued.status_code == 201
    ext_headers = {"Authorization": f"Bearer {issued.json()['token']}"}

    ok = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/projects", headers=ext_headers
    )
    assert ok.status_code == 200

    role_change = await client.patch(
        f"/api/v1/workspaces/{ctx['workspace_id']}/members/{member_id}",
        json={"role": "admin"},
        headers=ctx["owner_headers"],
    )
    assert role_change.status_code == 204

    stale = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/projects", headers=ext_headers
    )
    assert stale.status_code == 403
