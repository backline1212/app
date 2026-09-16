from typing import Literal

from pydantic import BaseModel

StrategyUsed = Literal["exact_path", "stable_attribute", "moved", "text_fingerprint", "none"]
RecoveryStatus = Literal["ok", "low_confidence", "orphaned"]


class MatchResult(BaseModel):
    strategy_used: StrategyUsed
    confidence: float
    recovery_status: RecoveryStatus
    matched_node_id: str | None
    candidates_considered: int
