from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.text import Trimmed

AgentHint = Literal[
    "claude",
    "claude_desktop",
    "cursor",
    "vscode",
    "codex",
    "antigravity",
    "windsurf",
    "gemini",
    "other",
]
McpAccess = Literal["read", "read_write"]

# What a token lets the connected agent do. Read covers listing, reading and building
# implementation prompts; write adds replying, changing status/priority and filing
# tickets in a connected tracker - always also bounded by the member's own role.
SCOPE_READ = "backline:read"
SCOPE_WRITE = "backline:write"


class McpTokenCreate(BaseModel):
    label: Trimmed = Field(min_length=1, max_length=200)
    agent_hint: AgentHint | None = None
    access: McpAccess = "read_write"


class McpTokenIssued(BaseModel):
    """Returned exactly once, at creation time - mirrors ExtensionTokenIssued
    (modules/extension_tokens/schemas.py): the raw token is never retrievable again,
    McpTokenOut never includes it."""

    id: str
    token: str
    label: str
    agent_hint: AgentHint | None
    scopes: list[str] = Field(default_factory=list)
    created_at: datetime


class McpTokenOut(BaseModel):
    id: str
    label: str
    agent_hint: AgentHint | None
    workspace_id: str
    # Tokens issued before scopes existed could only build implementation prompts, so
    # they read as read-only.
    scopes: list[str] = Field(default_factory=lambda: [SCOPE_READ])
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class StructuredPlan(BaseModel):
    steps: list[str]


class GeneratePromptRequest(BaseModel):
    """`agent` is which tool the prompt is headed for - accepted for parity with the
    architecture doc's response shape and so the UI can label the copy target; every
    agent consumes the same plain-text implementation prompt."""

    agent: AgentHint = "other"


class GeneratePromptResult(BaseModel):
    agent: AgentHint
    implementation_prompt: str
    suggested_files: list[str] | None = None
    structured_plan: StructuredPlan | None = None
