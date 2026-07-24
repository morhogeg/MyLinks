"""processingStage mirroring — real pipeline stages on the user-visible card.

process_link_background writes a coarse status to the QUEUE doc (which the client
never reads); these tests pin the NEW card-doc `processingStage` contract the web
progress UI is built against: the URL path emits
``scraping → analyzing → connecting → organizing`` in that order, and a failed
stage write is swallowed so it can never fail the capture.

The trigger is driven through its ``__wrapped__`` raw handler with every external
dependency (scrape, Gemini, graph, Firestore) mocked — no network, no Firestore.
"""

import types
from unittest.mock import MagicMock

import main


def test_write_stage_is_exception_safe():
    ref = MagicMock()
    ref.update.side_effect = RuntimeError("firestore down")
    # A failing stage write must not propagate…
    main._write_stage(ref, "scraping")
    # …and a missing card ref is a no-op.
    main._write_stage(None, "analyzing")


def _drive_url_pipeline(monkeypatch, *, stage_update_raises=False):
    """Run the URL path of process_link_background with mocked deps; return the
    ordered list of processingStage values written to the card doc."""
    stages = []

    card_ref = MagicMock()

    def _card_update(payload):
        if stage_update_raises:
            raise RuntimeError("stage write failed")
        if "processingStage" in payload:
            stages.append(payload["processingStage"])

    card_ref.update.side_effect = _card_update

    user_doc = MagicMock()
    user_doc.collection.return_value.document.return_value = card_ref
    db = MagicMock()
    db.collection.return_value.document.return_value = user_doc

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "log_to_firestore", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_user_tags", lambda uid: [])
    monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(
        embed_text=lambda text: None,  # None → skip the Vector store branch
    ))
    monkeypatch.setattr(main, "_analyze_scraped", lambda ai, scraped, tags: {
        "title": "T", "summary": "S", "concepts": [], "tags": [], "category": "Tech",
    })

    class _FakeGraph:
        def __init__(self, db):
            pass

        def find_related_links(self, **kwargs):
            return []

    monkeypatch.setattr(main, "GraphService", _FakeGraph)
    monkeypatch.setattr(main, "_apply_post_thumbnail", lambda *a, **k: None)
    monkeypatch.setattr(main, "handle_reminder_intent", lambda body: None)

    import scraper
    monkeypatch.setattr(scraper, "scrape_url", lambda url, body=None: {
        "html": "", "title": "Scraped Title", "text": "body text", "source_name": "example.com",
    })

    snap = MagicMock()
    snap.to_dict.return_value = {
        "uid": "u1", "url": "https://example.com/a", "isImage": False,
        "body": "", "cardId": "card-1",
    }
    snap.reference = MagicMock()
    snap.id = "task-1"
    event = types.SimpleNamespace(data=snap)

    main.process_link_background.__wrapped__(event)
    return stages, snap.reference


def test_stages_written_in_order(monkeypatch):
    stages, ref = _drive_url_pipeline(monkeypatch)
    assert stages == ["scraping", "analyzing", "connecting", "organizing"]
    # Queue doc cleaned up on success → the pipeline ran to completion.
    ref.delete.assert_called_once()


def test_failing_stage_write_never_fails_the_pipeline(monkeypatch):
    # Every card_ref.update raises; the capture must still complete cleanly
    # (queue doc deleted, no exception escaping the trigger).
    _, ref = _drive_url_pipeline(monkeypatch, stage_update_raises=True)
    ref.delete.assert_called_once()
