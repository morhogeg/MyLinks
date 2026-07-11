"""ai_service.embedding_needs_repair — the "is this embedding usable?" gate.

Uses the same ``Vector`` symbol ai_service imports (real google.cloud Vector in
CI, the list-subclass fake offline), so the ``isinstance`` check is exercised
against a genuine Vector type either way.
"""

from ai_service import embedding_needs_repair
from google.cloud.firestore_v1.vector import Vector


def test_missing_embedding_needs_repair():
    # Never embedded / dropped after a failure.
    assert embedding_needs_repair(None) is True


def test_plain_list_drift_needs_repair():
    # A plain list (not a Vector) is dead weight — find_nearest won't index it.
    assert embedding_needs_repair([0.1] * 768) is True
    assert embedding_needs_repair([0.0]) is True


def test_empty_vector_needs_repair():
    assert embedding_needs_repair(Vector([])) is True


def test_degenerate_all_near_zero_vector_needs_repair():
    # Legacy embed-failure sentinel was [1e-9]*768 — indexes but ranks randomly.
    assert embedding_needs_repair(Vector([1e-9] * 768)) is True
    assert embedding_needs_repair(Vector([0.0] * 5)) is True


def test_healthy_vector_does_not_need_repair():
    assert embedding_needs_repair(Vector([0.1] * 768)) is False


def test_vector_with_one_meaningful_value_is_healthy():
    # A single component above the 1e-6 threshold is enough to be "not degenerate".
    assert embedding_needs_repair(Vector([0.0, 0.0, 0.5])) is False


def test_negative_values_count_toward_health():
    # The degeneracy test is on abs(v), so a strongly negative vector is healthy.
    assert embedding_needs_repair(Vector([-0.9] * 4)) is False
