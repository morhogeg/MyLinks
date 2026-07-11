"""Weakness #5 — durable web link capture.

The web Add-Link form no longer blocks on the synchronous /api/analyze call
(which could time out at 60s and lose a slow capture). Instead it writes a
`processing` placeholder card client-side and enqueues the URL — via the SAME
share-ingest pipeline the iOS share sheet uses — passing the card's id through
as `cardId` so `process_link_background` finalizes THAT card in place.

These are pure tests over the queue-doc builder and the placeholder title
helper (no Firestore/Gemini/network — see the offline conftest). The Firestore
wiring (share_ingest auth branch, trigger card reuse) is covered by tracing and
noted for live verification.
"""

import main


# ── _pending_url_doc — the shared pending_processing queue-doc shape ──────────

def test_pending_doc_share_path_has_no_card_id():
    # iOS share sheet: no client card exists yet, so the trigger creates one.
    doc = main._pending_url_doc("user-1", "https://example.com/a", body="note")
    assert doc["uid"] == "user-1"
    assert doc["url"] == "https://example.com/a"
    assert doc["source"] == "share"
    assert doc["status"] == "queued"
    assert doc["attempts"] == 0
    assert doc["body"] == "note"
    # No cardId → process_link_background writes its own placeholder card.
    assert "cardId" not in doc


def test_pending_doc_web_path_carries_card_id_and_web_source():
    # Durable web capture: the client already wrote the placeholder card, so its
    # id rides on the queue doc and the trigger reuses it (no duplicate card).
    doc = main._pending_url_doc(
        "user-2", "https://example.com/b", card_id="card-xyz", source="web"
    )
    assert doc["cardId"] == "card-xyz"
    assert doc["source"] == "web"
    assert doc["url"] == "https://example.com/b"
    assert doc["status"] == "queued"


def test_pending_doc_omits_empty_card_id():
    # A falsy cardId must NOT be written (keeps the share path's shape identical).
    doc = main._pending_url_doc("u", "https://x.io", card_id="")
    assert "cardId" not in doc


def test_pending_doc_defaults_body_to_empty():
    doc = main._pending_url_doc("u", "https://x.io")
    assert doc["body"] == ""


# ── _capture_placeholder_title — friendly in-flight card title ────────────────
# The web client mirrors this (web/lib/storage.ts `placeholderTitle`) so a
# web-added processing card reads the same as an iOS-shared one.

def test_placeholder_title_uses_host_without_www():
    assert main._capture_placeholder_title("https://www.nytimes.com/x", False) == "nytimes.com"


def test_placeholder_title_falls_back_when_no_host():
    assert main._capture_placeholder_title("not a url", False) == "Analyzing link…"


def test_placeholder_title_image_is_generic():
    assert main._capture_placeholder_title("https://example.com/pic.jpg", True) == "Analyzing image…"
