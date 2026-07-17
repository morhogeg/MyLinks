"""Adversarial edge cases for main.py's small pure helpers.

`import main` works offline under the conftest fakes (same approach as
test_search_http.py); everything here is pure — no Firestore, no network.
"""

import main


# ── _to_ms (janitor timestamp coercion) ─────────────────────────────────────

def test_to_ms_nan_and_inf_are_unrecognised():
    # Firestore can legally store NaN doubles. int(nan) raises, and the call
    # site in run_processing_janitor sits OUTSIDE the per-doc try — one poison
    # `processingStartedAt` used to abort the whole sweep, so no stuck card
    # was ever failed-out again. Contract: None for anything unrecognised.
    assert main._to_ms(float("nan")) is None
    assert main._to_ms(float("inf")) is None
    assert main._to_ms(float("-inf")) is None


def test_to_ms_normal_shapes():
    class _Ts:
        def timestamp(self):
            return 1_700_000_000.0
    assert main._to_ms(1_700_000_000_000) == 1_700_000_000_000
    assert main._to_ms(_Ts()) == 1_700_000_000_000
    assert main._to_ms("not-a-time") is None
    assert main._to_ms(None) is None


# ── _extract_url (share-sheet URL sniffing) ─────────────────────────────────

def test_extract_url_skips_non_string_candidates():
    # Candidates come straight from a client JSON body; {"url": 123} used to
    # TypeError re.search → unhandled 500 on share_ingest.
    assert main._extract_url(123, {"u": "x"}, "see https://a.example/x") == "https://a.example/x"


def test_extract_url_matches_uppercase_scheme():
    # An uppercase-scheme share must queue as a URL capture, not silently
    # degrade to a note card.
    assert main._extract_url("HTTPS://EXAMPLE.COM/page").lower() == "https://example.com/page"


def test_extract_url_none_and_empty():
    assert main._extract_url(None, "", "no links here") == ""


# ── _format_duration ────────────────────────────────────────────────────────

def test_format_duration_basic_shapes():
    assert main._format_duration(12) == "12 min"
    assert main._format_duration(75) == "1h 15m"
    assert main._format_duration(60) == "1h 00m"  # boundary: exactly one hour
    assert main._format_duration(0) == ""


def test_format_duration_survives_junk():
    # A float ≥ 60 used to crash the '{:02d}' format; NaN/None/str likewise.
    assert main._format_duration(75.5) == "1h 15m"
    assert main._format_duration(float("nan")) == ""
    assert main._format_duration(None) == ""
    assert main._format_duration("soon") == ""


# ── _estimate_read_time ─────────────────────────────────────────────────────

def test_estimate_read_time_floors_at_one_minute():
    assert main._estimate_read_time("") == 1
    assert main._estimate_read_time("a few words only") == 1


def test_estimate_read_time_counts_words_not_chars():
    text = "word " * 400  # 400 words at 200 wpm → 2 minutes
    assert main._estimate_read_time(text) == 2
