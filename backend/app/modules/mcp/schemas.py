from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AgentHint = Literal["claude", "cursor", "codex", "antigravity", "other"]


class McpTokenCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    agent_hint: AgentHint | None = None


class McpTokenIssued(BaseModel):
    """Returned exactly once, at creation time - mirrors ExtensionTokenIssued
    (modules/extension_tokens/schemas.py): the raw token is never retrievable again,
    McpTokenOut never includes it."""

    id: str
    token: str
    label: str
    agent_hint: AgentHint | None
    created_at: datetime


class McpTokenOut(BaseModel):
    id: str
    label: str
    agent_hint: AgentHint | None
    workspace_id: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class StructuredPlan(BaseModel):
    steps: list[str]


class GeneratePromptRequest(BaseModel):
    """`agent` is which tool the prompt is headed for - accepted for parity with the
    architecture doc's response shape and so the UI can label the copy target, but MVP
    doesn't vary prompt phrasing per agent (all four consume the same plain-text
    implementation prompt)."""

    agent: AgentHint = "other"


class GeneratePromptResult(BaseModel):
    agent: AgentHint
    implementation_prompt: str
    suggested_files: list[str] | None = None
    structured_plan: StructuredPlan | None = None
