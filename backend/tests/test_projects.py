import pytest
from httpx import AsyncClient

from app.core.security import decode_access_token
from tests.helpers import create_workspace_and_get_owner_token


async def test_create_and_list_projects(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner1@example.com", code="200001", workspace_name="P1"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}

    created = await client.post(
        f"/api/v1/workspaces/{workspace_id}/projects",
        json={"name": "Marketing Site", "target_origin": "https://example.com"},
        headers=headers,
    )
    assert created.status_code == 201
    project = created.json()
    assert project["name"] == "Marketing Site"
    assert project["settings"] == {
        "proxy_mode": False,
        "snippet_installed": False,
        "capture_device_details": False,
        "reanchor_on_deploy": False,
        "reviewer_can_resolve": False,
        "show_board_to_client": False,
        "client_digest_enabled": False,
    }
    assert project["archived_at"] is None
    # Card attribution on the workspace dashboard needs to know who created it.
    assert project["created_by"] == decode_access_token(owner_token).sub

    listing = await client.get(f"/api/v1/workspaces/{workspace_id}/projects", headers=headers)
    assert listing.status_code == 200
    # 2, not 1: every workspace is seeded with an "Example Project" on creation
    # (F7, Milestone 9's onboarding empty state) - this asserts the newly-created one
    # is present alongside it, not that it's the only project.
    names = {p["name"] for p in listing.json()}
    assert names == {"Marketing Site", "Example Project"}


async def test_archived_projects_excluded_from_default_list(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner2@example.com", code="200002", workspace_name="P2"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}

    created = await client.post(
        f"/api/v1/workspaces/{workspace_id}/projects",
        json={"name": "Old Site", "target_origin": "https://old.example.com"},
        headers=headers,
    )
    project_id = created.json()["id"]

    archive_resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert archive_resp.status_code == 204

    listing = await client.get(f"/api/v1/workspaces/{workspace_id}/projects", headers=headers)
    # Only the seeded "Example Project" remains (F7) - "Old Site" is archived out.
    names = {p["name"] for p in listing.json()}
    assert names == {"Example Project"}

    # Still individually fetchable (soft archive, not a hard delete).
    detail = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["archived_at"] is not None


async def test_project_not_visible_across_workspaces(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_a, token_a = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner3@example.com", code="200003", workspace_name="A"
    )
    headers_a = {"Authorization": f"Bearer {token_a}"}
    project = await client.post(
        f"/api/v1/workspaces/{workspace_a}/projects",
        json={"name": "Secret Project", "target_origin": "https://secret.example.com"},
        headers=headers_a,
    )
    project_id = project.json()["id"]

    _, token_b = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner4@example.com", code="200004", workspace_name="B"
    )
    headers_b = {"Authorization": f"Bearer {token_b}"}

    cross_tenant = await client.get(f"/api/v1/projects/{project_id}", headers=headers_b)
    assert cross_tenant.status_code == 404


async def test_update_project(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner5@example.com", code="200005", workspace_name="P5"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}

    created = await client.post(
        f"/api/v1/workspaces/{workspace_id}/projects",
        json={"name": "Draft Name", "target_origin": "https://draft.example.com"},
        headers=headers,
    )
    project_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Final Name"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Final Name"
    assert updated.json()["target_origin"] == "https://draft.example.com"


async def test_resolve_project_creates_once_and_is_idempotent_per_origin(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Browser-extension "auto-detect current site" flow (POST .../projects/resolve):
    the first visit to a new origin creates a project, and a second visit to the same
    origin reuses it rather than creating a duplicate."""
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner6@example.com", code="200006", workspace_name="P6"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}

    first = await client.post(
        f"/api/v1/workspaces/{workspace_id}/projects/resolve",
        json={"target_origin": "https://newsite.example.com"},
        headers=headers,
    )
    assert first.status_code == 200
    first_body = first.json()
    # No explicit name given - falls back to the origin's own hostname.
    assert first_body["name"] == "newsite.example.com"
    assert first_body["target_origin"] == "https://newsite.example.com"

    second = await client.post(
        f"/api/v1/workspaces/{workspace_id}/projects/resolve",
        json={"target_origin": "https://newsite.example.com", "name": "Ignored on reuse"},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["id"] == first_body["id"]

    other_origin = await client.post(
        f"/api/v1/workspaces/{workspace_id}/projects/resolve",
        json={"target_origin": "https://othersite.example.com"},
        headers=headers,
    )
    assert other_origin.status_code == 200
    assert other_origin.json()["id"] != first_body["id"]


async def test_resolve_project_is_isolated_per_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_a, token_a = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner7a@example.com", code="200007", workspace_name="P7a"
    )
    workspace_b, token_b = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner7b@example.com", code="200008", workspace_name="P7b"
    )

    resp_a = await client.post(
        f"/api/v1/workspaces/{workspace_a}/projects/resolve",
        json={"target_origin": "https://shared-domain.example.com"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    resp_b = await client.post(
        f"/api/v1/workspaces/{workspace_b}/projects/resolve",
        json={"target_origin": "https://shared-domain.example.com"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    assert resp_a.json()["id"] != resp_b.json()["id"]


async def test_cannot_resolve_project_for_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_a, token_a = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner8a@example.com", code="200009", workspace_name="P8a"
    )
    _, token_b = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="proj-owner8b@example.com", code="200010", workspace_name="P8b"
    )

    resp = await client.post(
        f"/api/v1/workspaces/{workspace_a}/projects/resolve",
        json={"target_origin": "https://someorigin.example.com"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 403
