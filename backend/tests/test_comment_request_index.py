import contextlib
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

import app.main as main_module
from app.core.indexes import AUDIT_BATCH_03_INDEXES, ensure_indexes
from app.main import app
from app.modules.comments.repository import CommentRepository


@pytest.fixture
async def index_db(
    db: AsyncIOMotorDatabase[dict[str, Any]],
) -> AsyncIterator[AsyncIOMotorDatabase[dict[str, Any]]]:
    # A fresh, disposable database lets us seed legacy data BEFORE startup indexes.
    database = db.client[f"{db.name[:20]}_index_{uuid4().hex}"]
    try:
        yield database
    finally:
        await db.client.drop_database(database.name)


async def test_startup_with_legacy_comments_serves_auth_preflights(
    index_db: AsyncIOMotorDatabase[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    legacy = [
        {"workspace_id": "workspace-a", "body": "missing one"},
        {"workspace_id": "workspace-a", "body": "missing two"},
        {"workspace_id": "workspace-a", "client_request_id": None},
        {"workspace_id": "workspace-a", "client_request_id": None},
    ]
    await index_db.comments.insert_many(legacy)
    before = await index_db.comments.find().to_list(length=None)

    # The real MCP session manager (modules/mcp/server.py's FastMCP instance, mounted
    # in main.py's lifespan) can only be entered via .run() once per process - by the
    # SDK's own design, since a real restart always gets a fresh process and therefore
    # a fresh instance. This test deliberately re-enters the *whole* app lifespan twice
    # in the same process to exercise index creation against legacy data across a
    # simulated "restart" - something the MCP singleton was never built to tolerate,
    # but every assertion below is about comments/CORS, not MCP. Stub out just the
    # session manager's run() for this test so the simulated restart doesn't trip over
    # a real-world restriction that has nothing to do with what's under test here.
    @contextlib.asynccontextmanager
    async def _reentrant_noop_run() -> AsyncIterator[None]:
        yield

    monkeypatch.setattr(main_module.mcp_server.session_manager, "run", _reentrant_noop_run)

    # Reproduce the actual failing lifespan, including index creation on restart.
    with patch("app.main.get_db", return_value=index_db):
        for _ in range(2):
            async with app.router.lifespan_context(app):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    for path in ("google/callback", "refresh"):
                        response = await client.options(
                            f"/api/v1/auth/{path}",
                            headers={
                                "Origin": "http://localhost:5173",
                                "Access-Control-Request-Method": "POST",
                                "Access-Control-Request-Headers": "content-type",
                            },
                        )
                        assert response.status_code == 200
                        assert response.headers["access-control-allow-origin"] == (
                            "http://localhost:5173"
                        )
    assert await index_db.comments.find().to_list(length=None) == before
    await index_db.comments.insert_many(
        [{"workspace_id": "workspace-a"}, {"workspace_id": "workspace-a"}]
    )


async def test_request_ids_are_unique_only_within_workspace(
    index_db: AsyncIOMotorDatabase[dict[str, Any]],
) -> None:
    await ensure_indexes(index_db)
    await index_db.comments.insert_one(
        {"workspace_id": "workspace-a", "client_request_id": "request-1"}
    )
    with pytest.raises(DuplicateKeyError):
        await index_db.comments.insert_one(
            {"workspace_id": "workspace-a", "client_request_id": "request-1"}
        )
    await index_db.comments.insert_one(
        {"workspace_id": "workspace-b", "client_request_id": "request-1"}
    )
    repository = CommentRepository(index_db)
    found = await repository.find_by_client_request_id("workspace-a", "request-1")
    assert found is not None and found["workspace_id"] == "workspace-a"
    assert await repository.find_by_client_request_id("workspace-c", "request-1") is None


async def test_existing_sparse_index_does_not_block_startup(
    index_db: AsyncIOMotorDatabase[dict[str, Any]],
) -> None:
    # Deployments where the old index built successfully must not hit code 85.
    old_name = "comments_workspace_client_request_id"
    await index_db.comments.create_index(
        [("workspace_id", 1), ("client_request_id", 1)],
        name=old_name,
        unique=True,
        sparse=True,
    )
    await ensure_indexes(index_db)
    indexes = await index_db.comments.index_information()
    assert old_name in indexes
    assert AUDIT_BATCH_03_INDEXES[0].name in indexes
