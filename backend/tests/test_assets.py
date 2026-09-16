"""modules/assets - project-level file uploads (Images/PDF project types), previously
untested. Covers the basic upload path and the per-project file-limit enforcement,
including the concurrent-upload race the limit check must survive (assets/service.py's
upload_asset wraps the count-check and the page+asset inserts in a single Mongo
transaction so two racing uploads to a 1-file PDF project can't both succeed)."""

import asyncio
import io

import pypdf
import pytest
from httpx import AsyncClient
from PIL import Image

from tests.helpers import create_workspace_and_get_owner_token


def _make_pdf_bytes() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _make_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="red").save(buf, format="PNG")
    return buf.getvalue()


async def _create_project(
    client: AsyncClient, headers: dict[str, str], workspace_id: str, project_type: str
) -> str:
    payload: dict[str, str] = {"name": f"{project_type} project", "project_type": project_type}
    if project_type == "website":
        payload["target_origin"] = "https://example.com"
    resp = await client.post(
        f"/api/v1/workspaces/{workspace_id}/projects",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def test_member_can_upload_and_list_a_pdf_asset(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="asset1@example.com", code="500001", workspace_name="A1"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}
    project_id = await _create_project(client, headers, workspace_id, "pdf")

    resp = await client.post(
        f"/api/v1/projects/{project_id}/assets",
        headers=headers,
        files={"file": ("doc.pdf", _make_pdf_bytes(), "application/pdf")},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["content_type"] == "application/pdf"

    listing = await client.get(f"/api/v1/projects/{project_id}/assets", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1


async def test_pdf_project_rejects_a_second_upload_past_its_one_file_limit(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="asset2@example.com", code="500002", workspace_name="A2"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}
    project_id = await _create_project(client, headers, workspace_id, "pdf")

    first = await client.post(
        f"/api/v1/projects/{project_id}/assets",
        headers=headers,
        files={"file": ("first.pdf", _make_pdf_bytes(), "application/pdf")},
    )
    assert first.status_code == 201

    second = await client.post(
        f"/api/v1/projects/{project_id}/assets",
        headers=headers,
        files={"file": ("second.pdf", _make_pdf_bytes(), "application/pdf")},
    )
    assert second.status_code == 422
    assert "file limit" in second.json()["error"]["message"]


async def test_concurrent_uploads_to_a_pdf_project_cannot_both_exceed_the_file_limit(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression test: upload_asset used to check-then-act (read the current asset
    count, then insert) with no atomicity, so two concurrent uploads to a 1-file PDF
    project could both read count=0 and both succeed, leaving two PDFs where exactly
    one is assumed everywhere else. The count check and the page+asset inserts are now
    one Mongo transaction, so exactly one of two simultaneous uploads must win."""
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="asset3@example.com", code="500003", workspace_name="A3"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}
    project_id = await _create_project(client, headers, workspace_id, "pdf")

    async def _upload(name: str) -> int:
        resp = await client.post(
            f"/api/v1/projects/{project_id}/assets",
            headers=headers,
            files={"file": (name, _make_pdf_bytes(), "application/pdf")},
        )
        return resp.status_code

    statuses = await asyncio.gather(_upload("a.pdf"), _upload("b.pdf"))
    assert sorted(statuses) == [201, 422]

    listing = await client.get(f"/api/v1/projects/{project_id}/assets", headers=headers)
    assert len(listing.json()) == 1


async def test_website_project_rejects_file_uploads(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace_id, owner_token = await create_workspace_and_get_owner_token(
        client, monkeypatch, email="asset4@example.com", code="500004", workspace_name="A4"
    )
    headers = {"Authorization": f"Bearer {owner_token}"}
    project_id = await _create_project(client, headers, workspace_id, "website")

    resp = await client.post(
        f"/api/v1/projects/{project_id}/assets",
        headers=headers,
        files={"file": ("img.png", _make_png_bytes(), "image/png")},
    )
    assert resp.status_code == 422
