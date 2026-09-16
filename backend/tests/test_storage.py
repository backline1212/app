import httpx
import pytest
from httpx import AsyncClient

from tests.helpers import create_project_with_guest_session, create_workspace_and_get_owner_token


async def test_member_can_request_and_use_an_upload_url(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="storage1@example.com", code="400001", workspace_name="S1"
    )

    fake_bytes = b"fake-jpeg-bytes"
    resp = await client.post(
        "/api/v1/uploads",
        json={
            "project_id": ctx["project_id"],
            "content_type": "image/jpeg",
            "content_length": len(fake_bytes),
        },
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["key"].startswith(f"uploads/{ctx['workspace_id']}/{ctx['project_id']}/")
    assert body["key"].endswith(".jpg")

    # The presigned URL is real - actually PUT a small "image" to it against local MinIO.
    async with httpx.AsyncClient() as raw_client:
        put_resp = await raw_client.put(
            body["upload_url"], content=fake_bytes, headers={"Content-Type": "image/jpeg"}
        )
    assert put_resp.status_code == 200


async def test_guest_can_request_an_upload_url_for_their_project(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="storage2@example.com", code="400002", workspace_name="S2"
    )

    resp = await client.post(
        "/api/v1/uploads",
        json={"project_id": ctx["project_id"], "content_type": "image/png", "content_length": 1024},
        headers=ctx["guest_headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["key"].endswith(".png")


async def test_guest_cannot_request_upload_for_another_projects(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="storage3@example.com", code="400003", workspace_name="S3"
    )

    other_workspace_id, other_owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="storage3b@example.com", code="400004", workspace_name="Other"
    )
    other_project = await client.post(
        f"/api/v1/workspaces/{other_workspace_id}/projects",
        json={"name": "Other Project", "target_origin": "https://other.example.com"},
        headers={"Authorization": f"Bearer {other_owner_token}"},
    )
    other_project_id = other_project.json()["id"]

    resp = await client.post(
        "/api/v1/uploads",
        json={"project_id": other_project_id, "content_type": "image/jpeg", "content_length": 1024},
        headers=ctx["guest_headers"],
    )
    assert resp.status_code == 403


async def test_upload_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/uploads",
        json={"project_id": "irrelevant", "content_type": "image/jpeg", "content_length": 1024},
    )
    assert resp.status_code == 401


async def test_upload_rejects_disallowed_content_type(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="storage4@example.com", code="400005", workspace_name="S4"
    )
    # application/zip is intentionally outside the comment-attachment allowlist
    # (images, PDF, Word/Excel docs, Markdown) - unlike PDF, this one still is.
    resp = await client.post(
        "/api/v1/uploads",
        json={
            "project_id": ctx["project_id"],
            "content_type": "application/zip",
            "content_length": 1024,
        },
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 422


async def test_upload_rejects_oversized_content_length(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="storage7@example.com", code="400008", workspace_name="S7"
    )
    resp = await client.post(
        "/api/v1/uploads",
        json={
            "project_id": ctx["project_id"],
            "content_type": "image/jpeg",
            "content_length": 20 * 1024 * 1024 + 1,
        },
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "content_type",
    [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/markdown",
    ],
)
async def test_upload_allows_comment_attachment_content_types(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, content_type: str
) -> None:
    ctx = await create_project_with_guest_session(
        client,
        monkeypatch,
        email=f"storage-{abs(hash(content_type))}@example.com",
        code="400006",
        workspace_name="S5",
    )
    resp = await client.post(
        "/api/v1/uploads",
        json={
            "project_id": ctx["project_id"],
            "content_type": content_type,
            "content_length": 1024,
        },
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 201
