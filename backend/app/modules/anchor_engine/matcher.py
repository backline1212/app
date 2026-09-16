from typing import Any

from app.modules.anchor_engine.schemas import MatchResult, RecoveryStatus, StrategyUsed
from app.modules.anchor_engine.simhash import similarity

# Empirically calibrated (apps/widget/src/simhash.ts's character-trigram SimHash) - the
# gap between "genuinely edited, same element" and "coincidentally similar-length
# unrelated text" on short UI strings is narrow, so this threshold trades a bit of
# precision for not missing real edits. It doesn't need to be exact: a text-fingerprint
# match is capped at confidence 0.7, which per the thresholds below always lands in
# low_confidence, never "ok" - a human always reviews this tier's matches (P4).
TEXT_SIMILARITY_THRESHOLD = 0.70


def _classify(confidence: float) -> RecoveryStatus:
    """08-Anchor-Engine.md §8.4 thresholds."""
    if confidence >= 0.75:
        return "ok"
    if confidence >= 0.4:
        return "low_confidence"
    return "orphaned"


def _score(
    strategy: StrategyUsed,
    base_score: float,
    candidate_ids: list[str],
    revisions_since_last_confirmed: int,
) -> MatchResult:
    ambiguity_penalty = 0.1 * (len(candidate_ids) - 1)
    staleness_penalty = min(0.05 * revisions_since_last_confirmed, base_score)
    confidence = max(0.0, base_score - ambiguity_penalty - staleness_penalty)
    return MatchResult(
        strategy_used=strategy,
        confidence=confidence,
        recovery_status=_classify(confidence),
        matched_node_id=candidate_ids[0],
        candidates_considered=len(candidate_ids),
    )


def match_anchor(
    anchor: dict[str, Any],
    nodes_index: dict[str, dict[str, Any]],
    *,
    revisions_since_last_confirmed: int = 0,
) -> MatchResult:
    """08-Anchor-Engine.md §8.3's tiered matching order, stopping at the first tier that
    finds a candidate. Pure function - no DB/IO, operates entirely on the anchor payload
    and a target snapshot's nodes_index (both already-loaded dicts). Wiring this to run
    automatically whenever a page's revision changes - the diff engine, recovery_logs
    persistence, orchestration - is Milestone 8 (10-Revision-Recovery.md); this milestone
    is the matching/confidence-scoring algorithm itself, tested against golden fixtures
    (19-Testing-CI.md §19.2)."""
    dom_fp = anchor["dom_fingerprint"]
    anchor_attributes: dict[str, str] = dom_fp["attributes"]
    anchor_stable_id = anchor_attributes.get("id") or anchor_attributes.get("data-testid")
    anchor_ancestor_hash: str = dom_fp["ancestor_path_hash"]
    anchor_node_hash: str = dom_fp["node_hash"]

    text_fp = anchor["text_fingerprint"]
    anchor_simhash: str | None = text_fp.get("text_similarity_hash")

    # Tier 1: exact match - identical content AND identical structural position, i.e.
    # nothing changed for this element at all.
    exact = [
        node_id
        for node_id, node in nodes_index.items()
        if node["ancestor_path_hash"] == anchor_ancestor_hash
    ]
    if exact:
        return _score("exact_path", 1.0, exact, revisions_since_last_confirmed)

    # Tier 2a: stable-attribute match - the same id/data-testid exists somewhere in the
    # new tree, regardless of whether the element's text or position changed
    # (08-Anchor-Engine.md §8.3 step 2 - this is what makes "text edited, same element"
    # recoverable: attributes survive edits that change node_hash).
    if anchor_stable_id:
        attribute_matches = [
            node_id
            for node_id, node in nodes_index.items()
            if (node["attributes"].get("id") or node["attributes"].get("data-testid"))
            == anchor_stable_id
        ]
        if attribute_matches:
            return _score(
                "stable_attribute", 0.9, attribute_matches, revisions_since_last_confirmed
            )

    # Tier 2b: no stable attribute to key off, but the exact same content (tag +
    # attributes + text, all baked into node_hash) turned up elsewhere - a plain move.
    moved = [
        node_id for node_id, node in nodes_index.items() if node["node_hash"] == anchor_node_hash
    ]
    if moved:
        return _score("moved", 0.9, moved, revisions_since_last_confirmed)

    # Tier 3: text fingerprint (SimHash similarity) - the element's visible label
    # persisted (exactly or approximately) even though everything else changed.
    if anchor_simhash:

        def _text_similar_enough(node: dict[str, Any]) -> bool:
            node_simhash = node.get("text_similarity_hash")
            if not node_simhash:
                return False
            return similarity(anchor_simhash, node_simhash) >= TEXT_SIMILARITY_THRESHOLD

        text_matches = [
            node_id for node_id, node in nodes_index.items() if _text_similar_enough(node)
        ]
        if text_matches:
            return _score("text_fingerprint", 0.7, text_matches, revisions_since_last_confirmed)

    # No deterministic strategy found a match at all.
    return MatchResult(
        strategy_used="none",
        confidence=0.0,
        recovery_status="orphaned",
        matched_node_id=None,
        candidates_considered=0,
    )
