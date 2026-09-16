"""Part I (docs/implementation/slack-ai-mcp-architecture.md): the per-project Slack
mute toggle and the "project updated" Slack event wired from projects/service.py's
update_project. Covers the actual bug this pass fixed - dispatch_project_updated_event
used to await the Slack webhook POST inline inside the PATCH /projects/{id} request
(up to a 10s httpx timeout per connected Slack integration), instead of enqueuing
through the same Arq job queue comment events already use - plus the mute flag
(slack_notifications_enabled, defaulting True) actually suppressing the notification."""

from typing import Any

import httpx
import pytest
from httpx import AsyncClient

from app.workers.integrations import dispatch_project_updated_event_job
from tests.helpers import create_project_with_guest_session
from tests.test_integrations import mock_third_party_http


async def _connect_slack(client: AsyncClient, ctx: dict[str, Any]) -> str:
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}):
        resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "slack", "webhook_url": "https://hooks.slack.com/services/x"},
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 201
    return str(resp.json()["id"])


async def test_project_settings_default_slack_notifications_to_enabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="pu1@example.com", code="960001", workspace_name="PU1"
    )
    resp = await client.get(f"/api/v1/projects/{ctx['project_id']}", headers=ctx["owner_headers"])
    assert resp.json()["settings"]["slack_notifications_enabled"] is True


async def test_renaming_a_project_does_not_block_on_slack_webhook(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The actual regression: PATCH /projects/{id} used to await the Slack webhook POST
    synchronously. Even with a Slack integration connected, renaming a project must
    complete without ever calling the (mocked) webhook inline - the call only happens
    later, off the request path, via the Arq job asserted separately below."""
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="pu2@example.com", code="960002", workspace_name="PU2"
    )
    await _connect_slack(client, ctx)

    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        resp = await client.patch(
            f"/api/v1/projects/{ctx['project_id']}",
            json={"name": "Renamed Project"},
            headers=ctx["owner_headers"],
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed Project"
        # The webhook must not have been called synchronously within the request.
        assert fake.calls == []


async def test_project_updated_job_posts_to_slack_when_connected_and_unmuted(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="pu3@example.com", code="960003", workspace_name="PU3"
    )
    await _connect_slack(client, ctx)
    await client.patch(
        f"/api/v1/projects/{ctx['project_id']}",
        json={"name": "Renamed Project"},
        headers=ctx["owner_headers"],
    )

    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        await dispatch_project_updated_event_job(
            {}, workspace_id=ctx["workspace_id"], project_id=ctx["project_id"]
        )
    assert len(fake.calls) == 1


async def test_muted_project_skips_the_slack_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="pu4@example.com", code="960004", workspace_name="PU4"
    )
    await _connect_slack(client, ctx)

    settings_resp = await client.patch(
        f"/api/v1/projects/{ctx['project_id']}/settings",
        json={"slack_notifications_enabled": False},
        headers=ctx["owner_headers"],
    )
    assert settings_resp.status_code == 200
    assert settings_resp.json()["slack_notifications_enabled"] is False

    await client.patch(
        f"/api/v1/projects/{ctx['project_id']}",
        json={"name": "Renamed While Muted"},
        headers=ctx["owner_headers"],
    )

    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        await dispatch_project_updated_event_job(
            {}, workspace_id=ctx["workspace_id"], project_id=ctx["project_id"]
        )
    assert fake.calls == []


async def test_project_updated_job_is_a_no_op_without_a_slack_integration(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="pu5@example.com", code="960005", workspace_name="PU5"
    )
    await client.patch(
        f"/api/v1/projects/{ctx['project_id']}",
        json={"name": "Renamed Without Slack"},
        headers=ctx["owner_headers"],
    )

    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        await dispatch_project_updated_event_job(
            {}, workspace_id=ctx["workspace_id"], project_id=ctx["project_id"]
        )
    assert fake.calls == []
