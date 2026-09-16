"""Integrations (17-Notifications-Integrations.md): connect/list/disconnect, the manual
ClickUp/Trello create-task/create-card round trip, and each Integration class's own
message-formatting/layer-filtering logic. Third-party HTTP calls are mocked by replacing
`httpx.AsyncClient` in each integration module (same technique as test_proxy.py - patching
the shared class attribute rather than an instance method, so the test's own ASGI-backed
`client` fixture is never affected)."""

from contextlib import contextmanager
from typing import Any
from unittest.mock import patch

import httpx
import pytest
from httpx import AsyncClient

from app.modules.comments.schemas import CommentOut
from app.modules.integrations.slack import SlackIntegration
from tests.helpers import create_project_with_guest_session


class _FakeHttpClient:
    calls: list[tuple[str, str]] = []
    canned: dict[str, httpx.Response] = {}
    default_response = httpx.Response(200, content=b"fake-image-bytes")

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> "_FakeHttpClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self._respond("GET", url)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return self._respond("POST", url)

    def _respond(self, method: str, url: str) -> httpx.Response:
        _FakeHttpClient.calls.append((method, url))
        response = _FakeHttpClient.default_response
        for substring, candidate in _FakeHttpClient.canned.items():
            if substring in url:
                response = candidate
                break
        # raise_for_status() needs a request attached, which a bare httpx.Response(...)
        # built by hand in a test doesn't have.
        response.request = httpx.Request(method, url)
        return response


@contextmanager
def mock_third_party_http(canned: dict[str, httpx.Response] | None = None):
    _FakeHttpClient.calls = []
    _FakeHttpClient.canned = canned or {}
    with (
        patch("app.modules.integrations.slack.httpx.AsyncClient", new=_FakeHttpClient),
        patch("app.modules.integrations.clickup.httpx.AsyncClient", new=_FakeHttpClient),
        patch("app.modules.integrations.trello.httpx.AsyncClient", new=_FakeHttpClient),
        patch("app.modules.integrations.jira.httpx.AsyncClient", new=_FakeHttpClient),
        patch("app.modules.integrations.asana.httpx.AsyncClient", new=_FakeHttpClient),
    ):
        yield _FakeHttpClient


def _sample_comment(**overrides: Any) -> CommentOut:
    base = dict(
        id="c1",
        page_id="p1",
        parent_id=None,
        author_type="guest",
        author_id="g1",
        author_name="Jamie Reviewer",
        layer="client",
        body="The pricing table looks off on mobile",
        status="todo",
        assignee_id=None,
        due_at=None,
        anchor={},
        recovery_status="ok",
        context={
            "url": "https://example.com/pricing",
            "browser": "Chrome",
            "os": "macOS",
            "device_type": "mobile",
        },
        screenshot_url=None,
        capture_status="ok",
        attachments=[],
        created_at="2026-01-01T00:00:00Z",
        edited_at=None,
    )
    base.update(overrides)
    return CommentOut.model_validate(base)


# --- SlackIntegration unit tests -------------------------------------------------


async def test_slack_posts_client_visible_comment_created() -> None:
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        await SlackIntegration().on_comment_created(
            _sample_comment(layer="client"),
            {"webhook_url": "https://hooks.slack.com/services/x", "notify_team_layer": False},
        )
    assert len(fake.calls) == 1


async def test_slack_skips_team_only_comment_unless_opted_in() -> None:
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        await SlackIntegration().on_comment_created(
            _sample_comment(layer="team"),
            {"webhook_url": "https://hooks.slack.com/services/x", "notify_team_layer": False},
        )
    assert fake.calls == []


async def test_slack_posts_team_only_comment_when_opted_in() -> None:
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        await SlackIntegration().on_comment_created(
            _sample_comment(layer="team"),
            {"webhook_url": "https://hooks.slack.com/services/x", "notify_team_layer": True},
        )
    assert len(fake.calls) == 1


async def test_slack_skips_status_change_when_toggled_off() -> None:
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}) as fake:
        await SlackIntegration().on_status_changed(
            _sample_comment(),
            {"webhook_url": "https://hooks.slack.com/services/x", "notify_status_changes": False},
        )
    assert fake.calls == []


async def test_slack_test_connection_true_on_ok_response() -> None:
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}):
        assert await SlackIntegration().test_connection(
            {"webhook_url": "https://hooks.slack.com/x"}
        )


async def test_slack_test_connection_false_on_error_response() -> None:
    with mock_third_party_http({"hooks.slack.com": httpx.Response(404, text="not found")}):
        assert not await SlackIntegration().test_connection(
            {"webhook_url": "https://hooks.slack.com/x"}
        )


# --- API-level connect/list/disconnect ------------------------------------------


async def test_connect_slack_integration_success(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int1@example.com", code="920001", workspace_name="INT1"
    )
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}):
        resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "slack", "webhook_url": "https://hooks.slack.com/services/x"},
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "slack"
    assert "webhook_url" not in body["config_summary"]

    listing = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/integrations", headers=ctx["owner_headers"]
    )
    assert len(listing.json()) == 1


async def test_connect_slack_integration_fails_verification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int2@example.com", code="920002", workspace_name="INT2"
    )
    with mock_third_party_http({"hooks.slack.com": httpx.Response(404, text="not found")}):
        resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "slack", "webhook_url": "https://hooks.slack.com/services/bad"},
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 422


async def test_connect_trello_integration_success(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int3@example.com", code="920003", workspace_name="INT3"
    )
    with mock_third_party_http({"api.trello.com/1/members/me": httpx.Response(200, json={})}):
        resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "trello", "api_key": "k", "token": "t", "list_id": "list123"},
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 201
    assert resp.json()["config_summary"] == {"list_id": "list123"}


async def test_connect_clickup_integration_success(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int4@example.com", code="920004", workspace_name="INT4"
    )
    with mock_third_party_http(
        {
            "oauth/token": httpx.Response(200, json={"access_token": "cu-token-abc"}),
            "api.clickup.com/api/v2/user": httpx.Response(200, json={"id": 1}),
        }
    ):
        resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "clickup", "oauth_code": "abc", "list_id": "901"},
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["config_summary"] == {"list_id": "901"}
    # The encrypted token must never appear in the API response at all.
    assert "cu-token-abc" not in resp.text


async def test_non_admin_cannot_connect_integration(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int5@example.com", code="920005", workspace_name="INT5"
    )
    invite = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/members/invite",
        json={"email": "member5@example.com", "role": "member"},
        headers=ctx["owner_headers"],
    )
    assert invite.status_code == 201
    from tests.helpers import login_via_otp, switch_workspace

    member_login = await login_via_otp(client, monkeypatch, "member5@example.com", "920006")
    member_token = await switch_workspace(client, member_login["access_token"], ctx["workspace_id"])

    resp = await client.post(
        f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
        json={"type": "slack", "webhook_url": "https://hooks.slack.com/services/x"},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert resp.status_code == 403


async def test_cannot_list_integrations_for_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """M-01: integrations/router.py's list/create endpoints previously had no
    require_workspace_match - a valid owner token for workspace A could target
    workspace B's `{workspace_id}` path segment directly."""
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="int12a@example.com", code="920015", workspace_name="INT12a"
    )
    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="int12b@example.com", code="920016", workspace_name="INT12b"
    )

    resp = await client.get(
        f"/api/v1/workspaces/{ctx_b['workspace_id']}/integrations", headers=ctx_a["owner_headers"]
    )
    assert resp.status_code == 403


async def test_cannot_create_integration_for_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="int13a@example.com", code="920017", workspace_name="INT13a"
    )
    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="int13b@example.com", code="920018", workspace_name="INT13b"
    )

    resp = await client.post(
        f"/api/v1/workspaces/{ctx_b['workspace_id']}/integrations",
        json={"type": "slack", "webhook_url": "https://hooks.slack.com/services/x"},
        headers=ctx_a["owner_headers"],
    )
    assert resp.status_code == 403


async def test_disconnect_integration(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int6@example.com", code="920007", workspace_name="INT6"
    )
    with mock_third_party_http({"hooks.slack.com": httpx.Response(200, text="ok")}):
        created = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "slack", "webhook_url": "https://hooks.slack.com/services/x"},
            headers=ctx["owner_headers"],
        )
    integration_id = created.json()["id"]

    resp = await client.delete(
        f"/api/v1/integrations/{integration_id}", headers=ctx["owner_headers"]
    )
    assert resp.status_code == 204

    listing = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/integrations", headers=ctx["owner_headers"]
    )
    assert listing.json() == []


# --- ClickUp/Trello manual create-task/create-card round trip -------------------


async def _register_page_and_comment(
    client: AsyncClient, ctx: dict[str, Any], *, with_screenshot: bool = False
) -> tuple[str, str]:
    page_resp = await client.post(
        "/api/v1/pages",
        json={"project_id": ctx["project_id"], "url": "https://reviewable.example.com/"},
        headers=ctx["owner_headers"],
    )
    page_id = page_resp.json()["id"]

    anchor = {
        "tier": 1,
        "dom_fingerprint": {
            "selector_path": "body > button",
            "tag": "button",
            "attributes": {},
            "node_hash": "sha256:a",
            "ancestor_path_hash": "sha256:b",
        },
        "text_fingerprint": {"normalized_text": "hi", "text_similarity_hash": "0" * 16},
    }
    context = {
        "browser": "Chrome",
        "os": "macOS",
        "viewport": {"width": 1440, "height": 900},
        "device_type": "desktop",
        "url": "https://reviewable.example.com/",
    }
    comment_resp = await client.post(
        f"/api/v1/pages/{page_id}/comments",
        json={
            "body": "This CTA needs more contrast",
            "layer": "client",
            "anchor": anchor,
            "context": context,
            "screenshot_key": "screenshots/fake-key.png" if with_screenshot else None,
            "capture_status": "ok",
        },
        headers=ctx["owner_headers"],
    )
    comment_id = comment_resp.json()["id"]
    return page_id, comment_id


async def test_clickup_create_task_round_trip_preserves_metadata_and_backlink(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int7@example.com", code="920008", workspace_name="INT7"
    )
    with mock_third_party_http(
        {
            "oauth/token": httpx.Response(200, json={"access_token": "cu-token"}),
            "api.clickup.com/api/v2/user": httpx.Response(200, json={"id": 1}),
        }
    ):
        integration_resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "clickup", "oauth_code": "abc", "list_id": "901"},
            headers=ctx["owner_headers"],
        )
    integration_id = integration_resp.json()["id"]

    _, comment_id = await _register_page_and_comment(client, ctx, with_screenshot=True)

    with mock_third_party_http(
        {
            "list/901/task": httpx.Response(
                200, json={"id": "task-1", "url": "https://app.clickup.com/t/task-1"}
            ),
            "task/task-1/attachment": httpx.Response(200, json={"id": "att-1"}),
        }
    ) as fake:
        resp = await client.post(
            f"/api/v1/comments/{comment_id}/integrations/clickup/create-task"
            f"?integration_id={integration_id}",
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["task_id"] == "task-1"
    assert body["task_url"] == "https://app.clickup.com/t/task-1"
    # Both the task creation and the screenshot attachment actually happened.
    called_paths = [url for _, url in fake.calls]
    assert any("list/901/task" in u for u in called_paths)
    assert any("task/task-1/attachment" in u for u in called_paths)


async def test_trello_create_card_round_trip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int8@example.com", code="920009", workspace_name="INT8"
    )
    with mock_third_party_http({"api.trello.com/1/members/me": httpx.Response(200, json={})}):
        integration_resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "trello", "api_key": "k", "token": "t", "list_id": "list123"},
            headers=ctx["owner_headers"],
        )
    integration_id = integration_resp.json()["id"]

    _, comment_id = await _register_page_and_comment(client, ctx, with_screenshot=True)

    with mock_third_party_http(
        {
            "api.trello.com/1/cards/card-1": httpx.Response(
                200, json={"id": "card-1", "shortUrl": "https://trello.com/c/card-1"}
            ),
            "api.trello.com/1/cards": httpx.Response(
                200, json={"id": "card-1", "shortUrl": "https://trello.com/c/card-1"}
            ),
        }
    ) as fake:
        resp = await client.post(
            f"/api/v1/comments/{comment_id}/integrations/trello/create-card"
            f"?integration_id={integration_id}",
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["card_id"] == "card-1"
    assert body["card_url"] == "https://trello.com/c/card-1"
    called_paths = [url for _, url in fake.calls]
    assert any(u.rstrip("/").endswith("/cards") for u in called_paths)


async def test_create_task_with_wrong_integration_type_is_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int9@example.com", code="920010", workspace_name="INT9"
    )
    with mock_third_party_http({"api.trello.com/1/members/me": httpx.Response(200, json={})}):
        integration_resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "trello", "api_key": "k", "token": "t", "list_id": "list123"},
            headers=ctx["owner_headers"],
        )
    integration_id = integration_resp.json()["id"]
    _, comment_id = await _register_page_and_comment(client, ctx)

    resp = await client.post(
        f"/api/v1/comments/{comment_id}/integrations/clickup/create-task"
        f"?integration_id={integration_id}",
        headers=ctx["owner_headers"],
    )
    assert resp.status_code == 422


async def test_clickup_create_task_rejects_comment_from_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="int10@example.com", code="920011", workspace_name="INT10"
    )
    _, comment_id_a = await _register_page_and_comment(client, ctx_a)

    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="int10b@example.com", code="920012", workspace_name="INT10b"
    )
    with mock_third_party_http(
        {
            "oauth/token": httpx.Response(200, json={"access_token": "cu-token"}),
            "api.clickup.com/api/v2/user": httpx.Response(200, json={"id": 1}),
        }
    ):
        integration_resp = await client.post(
            f"/api/v1/workspaces/{ctx_b['workspace_id']}/integrations",
            json={"type": "clickup", "oauth_code": "abc", "list_id": "901"},
            headers=ctx_b["owner_headers"],
        )
    integration_id = integration_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/comments/{comment_id_a}/integrations/clickup/create-task"
        f"?integration_id={integration_id}",
        headers=ctx_b["owner_headers"],
    )
    assert resp.status_code == 404


async def test_trello_create_card_rejects_comment_from_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="int11@example.com", code="920013", workspace_name="INT11"
    )
    _, comment_id_a = await _register_page_and_comment(client, ctx_a)

    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="int11b@example.com", code="920014", workspace_name="INT11b"
    )
    with mock_third_party_http({"api.trello.com/1/members/me": httpx.Response(200, json={})}):
        integration_resp = await client.post(
            f"/api/v1/workspaces/{ctx_b['workspace_id']}/integrations",
            json={"type": "trello", "api_key": "k", "token": "t", "list_id": "list123"},
            headers=ctx_b["owner_headers"],
        )
    integration_id = integration_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/comments/{comment_id_a}/integrations/trello/create-card"
        f"?integration_id={integration_id}",
        headers=ctx_b["owner_headers"],
    )
    assert resp.status_code == 404


# --- Jira/Asana: connect, manual create-issue/create-task, IDOR, token-rotation race --


_JIRA_TOKEN_EXCHANGE = {"access_token": "jira-access-1", "refresh_token": "jira-refresh-1"}
_JIRA_ACCESSIBLE_RESOURCES = [{"id": "cloud-1", "url": "https://backline.atlassian.net"}]


async def _connect_jira(
    client: AsyncClient, ctx: dict[str, Any], *, project_key: str = "BL"
) -> str:
    with mock_third_party_http(
        {
            "auth.atlassian.com/oauth/token": httpx.Response(200, json=_JIRA_TOKEN_EXCHANGE),
            "accessible-resources": httpx.Response(200, json=_JIRA_ACCESSIBLE_RESOURCES),
        }
    ):
        resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "jira", "oauth_code": "abc", "project_key": project_key},
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def _connect_asana(
    client: AsyncClient, ctx: dict[str, Any], *, project_gid: str = "12345"
) -> str:
    # Same URL (app.asana.com/-/oauth_token) serves both the initial code exchange
    # (exchange_code_for_refresh_token, reads "refresh_token") and connect's own
    # test_connection call (_refresh_access_token, reads "access_token") - both keys
    # must be present in the one canned response.
    with mock_third_party_http(
        {
            "app.asana.com/-/oauth_token": httpx.Response(
                200, json={"refresh_token": "asana-rt-1", "access_token": "asana-at-1"}
            )
        }
    ):
        resp = await client.post(
            f"/api/v1/workspaces/{ctx['workspace_id']}/integrations",
            json={"type": "asana", "oauth_code": "abc", "project_gid": project_gid},
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def test_connect_jira_integration_success(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int14@example.com", code="920019", workspace_name="INT14"
    )
    integration_id = await _connect_jira(client, ctx)

    listing = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/integrations", headers=ctx["owner_headers"]
    )
    assert len(listing.json()) == 1
    body = next(i for i in listing.json() if i["id"] == integration_id)
    assert body["type"] == "jira"
    # The encrypted refresh token must never appear in the API response.
    assert "jira-refresh-1" not in listing.text


async def test_connect_asana_integration_success(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int15@example.com", code="920020", workspace_name="INT15"
    )
    await _connect_asana(client, ctx)

    listing = await client.get(
        f"/api/v1/workspaces/{ctx['workspace_id']}/integrations", headers=ctx["owner_headers"]
    )
    assert len(listing.json()) == 1
    assert listing.json()[0]["type"] == "asana"
    assert "asana-rt-1" not in listing.text


async def test_jira_create_issue_round_trip_preserves_metadata_and_backlink(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int16@example.com", code="920021", workspace_name="INT16"
    )
    integration_id = await _connect_jira(client, ctx, project_key="BL")
    _, comment_id = await _register_page_and_comment(client, ctx, with_screenshot=True)

    with mock_third_party_http(
        {
            "auth.atlassian.com/oauth/token": httpx.Response(200, json=_JIRA_TOKEN_EXCHANGE),
            "rest/api/3/issue/ISSUE-1/attachments": httpx.Response(200, json={"id": "att-1"}),
            "rest/api/3/issue": httpx.Response(
                200, json={"key": "ISSUE-1", "id": "10001"}
            ),
        }
    ) as fake:
        resp = await client.post(
            f"/api/v1/comments/{comment_id}/integrations/jira/create-issue"
            f"?integration_id={integration_id}",
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["issue_key"] == "ISSUE-1"
    assert body["issue_url"] == "https://backline.atlassian.net/browse/ISSUE-1"
    called_paths = [url for _, url in fake.calls]
    assert any(u.endswith("rest/api/3/issue") for u in called_paths)
    assert any("attachments" in u for u in called_paths)


async def test_asana_create_task_round_trip(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await create_project_with_guest_session(
        client, monkeypatch, email="int17@example.com", code="920022", workspace_name="INT17"
    )
    integration_id = await _connect_asana(client, ctx, project_gid="999")
    _, comment_id = await _register_page_and_comment(client, ctx, with_screenshot=True)

    with mock_third_party_http(
        {
            "app.asana.com/-/oauth_token": httpx.Response(200, json={"access_token": "at-1"}),
            "tasks/task-1/attachments": httpx.Response(200, json={"data": {"gid": "att-1"}}),
            "tasks": httpx.Response(
                200,
                json={"data": {"gid": "task-1", "permalink_url": "https://app.asana.com/0/task-1"}},
            ),
        }
    ) as fake:
        resp = await client.post(
            f"/api/v1/comments/{comment_id}/integrations/asana/create-task"
            f"?integration_id={integration_id}",
            headers=ctx["owner_headers"],
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["task_id"] == "task-1"
    assert body["task_url"] == "https://app.asana.com/0/task-1"
    called_paths = [url for _, url in fake.calls]
    assert any(u.rstrip("/").endswith("/tasks") for u in called_paths)
    assert any("attachments" in u for u in called_paths)


async def test_jira_create_issue_rejects_comment_from_another_workspace(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx_a = await create_project_with_guest_session(
        client, monkeypatch, email="int18a@example.com", code="920023", workspace_name="INT18a"
    )
    _, comment_id_a = await _register_page_and_comment(client, ctx_a)

    ctx_b = await create_project_with_guest_session(
        client, monkeypatch, email="int18b@example.com", code="920024", workspace_name="INT18b"
    )
    integration_id = await _connect_jira(client, ctx_b)

    resp = await client.post(
        f"/api/v1/comments/{comment_id_a}/integrations/jira/create-issue"
        f"?integration_id={integration_id}",
        headers=ctx_b["owner_headers"],
    )
    assert resp.status_code == 404


async def test_jira_token_rotation_race_retries_with_refetched_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B-class regression test for the race jira.py's _get_fresh_access_token itself
    documents: two concurrent create_issue calls for the same integration both read the
    same stored refresh_token, but Atlassian invalidates a refresh token the instant
    either one uses it - so the loser's own refresh attempt fails, and it must retry
    once against whatever refresh_token the winner has since persisted, rather than
    fail the whole request."""
    from app.core.encryption import encrypt_secret
    from app.modules.integrations import jira as jira_module

    calls: list[str] = []

    async def fake_refresh_access_token(refresh_token: str) -> tuple[str, str]:
        calls.append(refresh_token)
        if refresh_token == "stale-token":
            raise jira_module.ExternalServiceError("invalid_grant")
        return "fresh-access-token", "rotated-token"

    monkeypatch.setattr(jira_module, "_refresh_access_token", fake_refresh_access_token)

    rotated: list[str] = []

    async def on_rotate(new_refresh_token_encrypted: str) -> None:
        rotated.append(new_refresh_token_encrypted)

    async def refetch_config() -> dict[str, Any]:
        # Simulates the concurrent winner having already persisted its own rotated
        # token to the integration doc by the time the loser retries.
        return {"refresh_token_encrypted": encrypt_secret("current-token")}

    config = {"refresh_token_encrypted": encrypt_secret("stale-token")}
    access_token = await jira_module._get_fresh_access_token(
        config, on_rotate=on_rotate, refetch_config=refetch_config
    )

    assert access_token == "fresh-access-token"
    assert calls == ["stale-token", "current-token"]
    assert len(rotated) == 1
