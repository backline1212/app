from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class SnapshotSubmit(BaseModel):
    viewport: dict[str, int] = Field(min_length=2, max_length=2)
    node_tree: dict[str, Any]
    nodes_index: dict[str, Any] = Field(min_length=1, max_length=5000)
    # The spec's form is "sha256:<64 hex>" (09-Snapshot-Engine.md), which the widget and
    # extension send; a bare digest is accepted too. Stored in the prefixed form so
    # hashes from either client compare equal.
    full_page_hash: str = Field(pattern=r"^(sha256:)?[a-f0-9]{64}$")

    @field_validator("full_page_hash")
    @classmethod
    def canonical_hash(cls, value: str) -> str:
        return value if value.startswith("sha256:") else f"sha256:{value}"

    @model_validator(mode="after")
    def complete_bounded_tree(self) -> "SnapshotSubmit":
        if set(self.viewport) != {"width", "height"} or not all(
            0 < size <= 32768 for size in self.viewport.values()
        ):
            raise ValueError("Use a valid snapshot viewport.")
        seen: set[str] = set()
        pending: list[tuple[Any, int]] = [(self.node_tree, 0)]
        while pending:
            node, depth = pending.pop()
            if not isinstance(node, dict) or depth > 80:
                raise ValueError("Snapshot tree exceeds the supported depth.")
            node_id = node.get("node_id")
            children = node.get("children")
            if (
                not isinstance(node_id, str)
                or node_id in seen
                or node_id not in self.nodes_index
                or not isinstance(children, list)
            ):
                raise ValueError("Snapshot tree must reference each indexed node once.")
            record = self.nodes_index[node_id]
            if not isinstance(record, dict) or record.get("tag") != node.get("tag"):
                raise ValueError("Snapshot tree and index disagree.")
            seen.add(node_id)
            if len(seen) + len(pending) + len(children) > 5000:
                raise ValueError("Snapshot tree exceeds the node limit.")
            pending.extend((child, depth + 1) for child in children)
        if seen != set(self.nodes_index):
            raise ValueError("Snapshot tree must include the complete node index.")
        return self


class RevisionOut(BaseModel):
    id: str
    page_id: str
    full_page_hash: str
    captured_at: datetime
    is_current: bool
    created_new: bool


class RevisionChangeSummary(BaseModel):
    moved: int = 0
    modified: int = 0
    removed: int = 0
    added: int = 0


class RevisionRecoverySummary(BaseModel):
    ok: int = 0
    low_confidence: int = 0
    orphaned: int = 0
    permanently_orphaned: int = 0


class RevisionHistoryOut(BaseModel):
    id: str
    page_id: str
    page_title: str | None
    page_url: str
    full_page_hash: str
    captured_at: datetime
    is_current: bool
    changes: RevisionChangeSummary
    recovery: RevisionRecoverySummary
