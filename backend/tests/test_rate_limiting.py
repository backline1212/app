from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from tests.helpers import create_project_with_guest_session

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
SIMPLE_NODE_TREE = {"node_id": "n_0", "tag": "html", "children": []}
SIMPLE_NODES_INDEX = {"n_0": {"tag": "html", "attributes": {}, "text": None}}


def _comment_payload(body: str = "Something's off here.") -> dict[str, Any]:
    return {
        "body": body,
        "layer": "client",
        "anchor": SAMPLE_ANCHOR,
        "context": SAMPLE_CONTEXT,
        "screenshot_key": None,
        "capture_status": "ok",
    }


async def test_otp_request_rate_limited_per_ip(client: AsyncClient) -> None:
    limit = get_settings().otp_request_rate_limit_per_minute
    fake_ip = "203.0.113.10"

    statuses = []
    for i in range(limit + 3):
        resp = await client.post(
            "/api/v1/auth/otp/request",
            json={"email": f"rl-otp-{i}@example.com"},
            headers={"X-Forwarded-For": fake_ip},
        )
        statuses.append(resp.status_code)

    assert 429 in statuses
    assert statuses.count(200) <= limit


async def test_page_register_rate_limited_per_guest_ip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="rl-page@example.com", code="400001", workspace_name="RLPage"
    )
    limit = get_settings().page_register_rate_limit_per_minute
    fake_ip = "203.0.113.11"
    headers = {**ctx["guest_headers"], "X-Forwarded-For": fake_ip}

    statuses = []
    for _ in range(limit + 3):
        resp = await client.post(
            "/api/v1/pages",
            json={"project_id": ctx["project_id"], "url": "https://reviewable.example.com/"},
            headers=headers,
        )
        statuses.append(resp.status_code)

    assert 429 in statuses
    assert statuses.count(201) <= limit


async def test_snapshot_submit_rate_limited_per_guest_ip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="rl-snap@example.com", code="400002", workspace_name="RLSnap"
    )
    fake_ip = "203.0.113.12"
    headers = {**ctx["guest_headers"], "X-Forwarded-For": fake_ip}

    page_resp = await client.post(
        "/api/v1/pages",
        json={"project_id": ctx["project_id"], "url": "https://reviewable.example.com/"},
        headers=headers,
    )
    page_id = page_resp.json()["id"]

    limit = get_settings().snapshot_submit_rate_limit_per_minute
    statuses = []
    for _ in range(limit + 3):
        resp = await client.post(
            f"/api/v1/pages/{page_id}/snapshots",
            json={
                "viewport": {"width": 1440, "height": 900},
                "node_tree": SIMPLE_NODE_TREE,
                "nodes_index": SIMPLE_NODES_INDEX,
                "full_page_hash": "sha256:page-v1",
            },
            headers=headers,
        )
        statuses.append(resp.status_code)

    assert 429 in statuses
    assert statuses.count(201) <= limit


async def test_comment_create_rate_limited_per_guest_ip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="rl-comment@example.com", code="400003", workspace_name="RLC"
    )
    fake_ip = "203.0.113.13"
    headers = {**ctx["guest_headers"], "X-Forwarded-For": fake_ip}

    page_resp = await client.post(
        "/api/v1/pages",
        json={"project_id": ctx["project_id"], "url": "https://reviewable.example.com/"},
        headers=headers,
    )
    page_id = page_resp.json()["id"]

    limit = get_settings().comment_create_rate_limit_per_minute
    statuses = []
    for _ in range(limit + 3):
        resp = await client.post(
            f"/api/v1/pages/{page_id}/comments", json=_comment_payload(), headers=headers
        )
        statuses.append(resp.status_code)

    assert 429 in statuses
    assert statuses.count(201) <= limit


async def test_upload_rate_limited_per_guest_ip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="rl-upload@example.com", code="400004", workspace_name="RLU"
    )
    fake_ip = "203.0.113.14"
    headers = {**ctx["guest_headers"], "X-Forwarded-For": fake_ip}

    limit = get_settings().upload_rate_limit_per_minute
    statuses = []
    for _ in range(limit + 3):
        resp = await client.post(
            "/api/v1/uploads",
            json={
                "project_id": ctx["project_id"],
                "content_type": "image/jpeg",
                "content_length": 1024,
            },
            headers=headers,
        )
        statuses.append(resp.status_code)

    assert 429 in statuses
    assert statuses.count(201) <= limit


async def test_member_actions_are_rate_limited_per_workspace_not_ip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """12-API-WebSocket.md §12.7: member-authenticated endpoints are rate-limited per
    workspace, not per IP - two different members of the same workspace share one budget."""
    ctx = await create_project_with_guest_session(
        client,
        monkeypatch,
        email="rl-member@example.com",
        code="400005",
        workspace_name="RLMember",
    )
    limit = get_settings().comment_create_rate_limit_per_minute

    page_resp = await client.post(
        "/api/v1/pages",
        json={"project_id": ctx["project_id"], "url": "https://reviewable.example.com/"},
        headers=ctx["guest_headers"],
    )
    page_id = page_resp.json()["id"]

    statuses = []
    for _ in range(limit + 3):
        resp = await client.post(
            f"/api/v1/pages/{page_id}/comments",
            json=_comment_payload(),
            headers=ctx["owner_headers"],
        )
        statuses.append(resp.status_code)

    assert 429 in statuses
    assert statuses.count(201) <= limit
