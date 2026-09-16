"""Golden dataset tests for the Anchor Engine's matcher (19-Testing-CI.md §19.2).

Each fixture is a paired (anchor, target snapshot nodes_index) representing a known
transformation type. These operate on synthetic dicts, not real captured snapshots -
the matcher is a pure function, so this is the right level to pin its behavior exactly,
without needing a browser."""

from app.modules.anchor_engine.matcher import match_anchor

IDENTICAL_HASH = "a" * 16
MOVED_ANCESTOR_HASH = "b" * 16


def _anchor(
    *,
    node_hash: str = IDENTICAL_HASH,
    ancestor_path_hash: str = IDENTICAL_HASH,
    attributes: dict[str, str] | None = None,
    normalized_text: str = "upgrade to pro",
    text_similarity_hash: str = "0" * 16,
) -> dict:
    return {
        "dom_fingerprint": {
            "selector_path": "body > button:nth-of-type(1)",
            "tag": "button",
            # `is None`, not `or` - an explicitly-passed {} must stay {}, not silently
            # fall back to the default (an empty dict is falsy in Python).
            "attributes": attributes if attributes is not None else {"data-testid": "upgrade-cta"},
            "node_hash": node_hash,
            "ancestor_path_hash": ancestor_path_hash,
        },
        "text_fingerprint": {
            "normalized_text": normalized_text,
            "text_similarity_hash": text_similarity_hash,
        },
    }


def _node(
    *,
    tag: str = "button",
    attributes: dict[str, str] | None = None,
    text: str = "upgrade to pro",
    node_hash: str = IDENTICAL_HASH,
    ancestor_path_hash: str = IDENTICAL_HASH,
    text_similarity_hash: str = "0" * 16,
) -> dict:
    return {
        "tag": tag,
        "attributes": attributes if attributes is not None else {"data-testid": "upgrade-cta"},
        "text": text,
        "node_hash": node_hash,
        "ancestor_path_hash": ancestor_path_hash,
        "text_similarity_hash": text_similarity_hash,
    }


def test_identical_page_is_an_exact_match_with_confidence_1() -> None:
    anchor = _anchor()
    nodes_index = {"n1": _node()}

    result = match_anchor(anchor, nodes_index)

    assert result.strategy_used == "exact_path"
    assert result.confidence == 1.0
    assert result.recovery_status == "ok"
    assert result.matched_node_id == "n1"
    assert result.candidates_considered == 1


def test_moved_element_matches_via_stable_attribute() -> None:
    # Same id/data-testid and content, but reparented - ancestor_path_hash differs.
    anchor = _anchor(ancestor_path_hash=IDENTICAL_HASH)
    nodes_index = {
        "n1": _node(ancestor_path_hash=MOVED_ANCESTOR_HASH),
    }

    result = match_anchor(anchor, nodes_index)

    assert result.strategy_used == "stable_attribute"
    assert result.confidence == 0.9
    assert result.recovery_status == "ok"


def test_element_with_no_stable_id_that_moved_matches_via_node_hash() -> None:
    anchor = _anchor(attributes={}, ancestor_path_hash=IDENTICAL_HASH)
    nodes_index = {
        "n1": _node(attributes={}, ancestor_path_hash=MOVED_ANCESTOR_HASH),
    }

    result = match_anchor(anchor, nodes_index)

    # Tier 2b (matcher.py): no stable id/data-testid to key off (attributes={} above),
    # so this is the node_hash-only "moved" fallback, not a genuine stable-attribute
    # match - previously mislabeled identically to the Tier 2a case above, which made
    # recovery_logs.strategy_used misreport why a match actually succeeded.
    assert result.strategy_used == "moved"
    assert result.confidence == 0.9


def test_text_edited_element_falls_back_to_text_fingerprint() -> None:
    """The element kept its stable attribute in reality, but this fixture specifically
    covers the case where it *doesn't* (e.g. the attribute itself also changed) and only
    an approximately-similar label survives - the SimHash tier, not stable-attribute."""
    anchor = _anchor(
        attributes={},
        node_hash=IDENTICAL_HASH,
        ancestor_path_hash=IDENTICAL_HASH,
        text_similarity_hash="0000000000000000",
    )
    nodes_index = {
        "n1": _node(
            attributes={},
            node_hash="different-content-hash",
            ancestor_path_hash="different-position-hash",
            text="upgrade now",
            # Close (a handful of bits) but not identical - simulates a slightly edited label.
            text_similarity_hash="0000000000000003",
        )
    }

    result = match_anchor(anchor, nodes_index)

    assert result.strategy_used == "text_fingerprint"
    assert 0.4 <= result.confidence < 0.75
    assert result.recovery_status == "low_confidence"


def test_removed_element_is_orphaned() -> None:
    anchor = _anchor(
        attributes={},
        node_hash=IDENTICAL_HASH,
        ancestor_path_hash=IDENTICAL_HASH,
        text_similarity_hash="0000000000000000",
    )
    # Nothing in the new tree resembles the anchor at all.
    nodes_index = {
        "n1": _node(
            attributes={},
            tag="div",
            text="an entirely unrelated section",
            node_hash="totally-different",
            ancestor_path_hash="totally-different-position",
            text_similarity_hash="ffffffffffffffff",
        )
    }

    result = match_anchor(anchor, nodes_index)

    assert result.strategy_used == "none"
    assert result.confidence == 0.0
    assert result.recovery_status == "orphaned"
    assert result.matched_node_id is None


def test_ambiguous_duplicate_elements_yield_low_confidence_not_a_silent_wrong_match() -> None:
    """Two "Learn more" buttons: the text fingerprint tier finds both, and must flag
    low_confidence rather than silently picking one (08-Anchor-Engine.md §8.3 step 4)."""
    anchor = _anchor(
        attributes={},
        node_hash=IDENTICAL_HASH,
        ancestor_path_hash=IDENTICAL_HASH,
        normalized_text="learn more",
        text_similarity_hash="0000000000000000",
    )
    nodes_index = {
        "n1": _node(
            attributes={},
            node_hash="content-a",
            ancestor_path_hash="position-a",
            text="learn more",
            text_similarity_hash="0000000000000000",
        ),
        "n2": _node(
            attributes={},
            node_hash="content-b",
            ancestor_path_hash="position-b",
            text="learn more",
            text_similarity_hash="0000000000000000",
        ),
    }

    result = match_anchor(anchor, nodes_index)

    assert result.strategy_used == "text_fingerprint"
    assert result.candidates_considered == 2
    assert result.recovery_status == "low_confidence"
    # Ambiguity penalty: 0.7 base - 0.1*(2-1) = 0.6.
    assert result.confidence == 0.6


def test_staleness_penalty_can_push_an_otherwise_exact_match_out_of_ok() -> None:
    anchor = _anchor()
    nodes_index = {"n1": _node()}

    # 6 revisions of staleness * 0.05 = 0.3 penalty -> 1.0 - 0.3 = 0.7, just under "ok".
    result = match_anchor(anchor, nodes_index, revisions_since_last_confirmed=6)

    assert result.strategy_used == "exact_path"
    assert result.confidence == 0.7
    assert result.recovery_status == "low_confidence"
