from typing import Literal

from pydantic import BaseModel, Field


class SummarizeResult(BaseModel):
    summary: str


class SuggestReplyResult(BaseModel):
    suggestions: list[str]


# Same vocabulary as comments.schemas.Priority - the analysis writes straight into the
# existing `priority` field, so it never invents a severity scale the rest of the app
# doesn't already understand.
Severity = Literal["low", "medium", "high"]


class BugHuntFinding(BaseModel):
    comment_id: str
    ticket_number: int | None
    severity: Severity
    reason: str


class DuplicatePair(BaseModel):
    comment_id_a: str
    comment_id_b: str
    ticket_number_a: int | None
    ticket_number_b: int | None
    reason: str


class ProjectAnalysisResult(BaseModel):
    summary: str
    findings: list[BugHuntFinding] = Field(default_factory=list)
    possible_duplicates: list[DuplicatePair] = Field(default_factory=list)
    analyzed_comment_count: int
