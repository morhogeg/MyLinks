"""Completing a PARTIAL card with the user's screenshots (2026-09-04).

Facebook (and LinkedIn, Instagram) serve a login wall to server-side fetches,
so those cards can be a preview at best. Rather than telling the user to go
share a screenshot as a NEW card, the partial card now takes the screenshot
itself: ``share_ingest`` accepts ``images + enrichCardId`` and queues an
``enrich`` job, and ``process_link_background`` merges the screenshot read
into the SAME card (identity, notes, reminders and collections untouched),
clears the partial-capture flags, re-embeds, and recomputes connections.

Offline: fake refs for the queue doc and the card; Gemini, the embedder, the
graph service and the image fetch are stubbed at their seams.
"""

import types

import pytest

import main


# ── _card_accepts_screenshots — which cards may be completed ─────────────────

def test_partial_web_card_accepts_screenshots():
    assert main._card_accepts_screenshots({"url": "https://www.facebook.com/x/posts/1", "sourceType": "web",
                                           "status": "unread", "captureQuality": "partial"}) is True


def test_flag_is_not_required():
    # The scraper can't flag every thin read; the user judges the card.
    assert main._card_accepts_screenshots({"url": "https://x.com/a/status/1", "status": "read"}) is True


@pytest.mark.parametrize("card", [
    None,
    {},
    {"url": "https://a.b", "status": "processing"},
    {"url": "https://a.b", "status": "failed"},
    {"url": "https://storage/x.jpg", "sourceType": "image", "status": "unread"},
    {"url": "", "sourceType": "note", "status": "unread"},
    {"url": "https://a.b", "sourceType": "youtube", "status": "unread"},
    {"url": "https://a.b", "captureType": "text", "status": "unread"},
    {"url": "https://a.b", "captureType": "answer", "status": "unread"},
])
def test_non_web_or_unsettled_cards_are_refused(card):
    assert main._card_accepts_screenshots(card) is False


# ── _enrich_context_text / _merge_tags ───────────────────────────────────────

def test_context_names_the_source_and_marks_the_preview_as_partial():
    ctx = main._enrich_context_text({"url": "https://www.facebook.com/p/1", "sourceName": "Crispy Kitchens",
                                     "title": "מתכון לכבדי עוף", "summary": "מתכון...", "detailedSummary": ""})
    assert "SOURCE URL: https://www.facebook.com/p/1" in ctx
    assert "POSTED BY: Crispy Kitchens" in ctx
    assert "partial preview" in ctx
    assert "מתכון לכבדי עוף" in ctx


def test_merge_tags_keeps_the_users_order_and_dedupes_case_insensitively():
    assert main._merge_tags(["Recipes", "food"], ["FOOD", "chicken liver", "Recipes"]) == ["Recipes", "food", "chicken liver"]
    assert main._merge_tags(None, ["a"]) == ["a"]


# ── _enrich_card_with_images — the worker branch ─────────────────────────────

class _Snap:
    def __init__(self, d):
        self._d = d
        self.exists = d is not None

    def to_dict(self):
        return dict(self._d) if self._d is not None else None


class _Ref:
    def __init__(self, doc=None, ref_id="card-1"):
        self.doc = doc
        self.id = ref_id
        self.updates = []
        self.deleted = False

    def get(self):
        return _Snap(self.doc)

    def update(self, fields):
        self.updates.append(dict(fields))
        if self.doc is not None:
            for k, v in fields.items():
                self.doc[k] = v

    def delete(self):
        self.deleted = True


class _Img:
    content = b"\x89PNGfake"
    headers = {"Content-Type": "image/png"}

    def raise_for_status(self):
        return None


class _AI:
    def __init__(self, analysis=None, fail=False):
        self.analysis = analysis
        self.fail = fail
        self.calls = []

    def analyze_text_with_images(self, text, images, **kw):
        self.calls.append((text, images, kw))
        if self.fail:
            raise main.AnalysisError("vision down")
        return self.analysis

    def embed_text(self, text):
        return [0.1, 0.2, 0.3]


class _Graph:
    def __init__(self, db):
        self.args = None

    def find_related_links(self, **kw):
        self.args = kw
        return [{"id": "other", "title": "Other", "reason": "Same recipe family", "similarity": 0.9, "commonConcepts": []}]


PARTIAL_CARD = {
    "url": "https://www.facebook.com/crispy/posts/1",
    "sourceType": "web",
    "sourceName": "Crispy Kitchens",
    "status": "unread",
    "title": "מתכון לכבדי עוף",
    "summary": "מתכון להכנת כבדי עוף.",
    "detailedSummary": "",
    "tags": ["מתכונים", "אוכל"],
    "concepts": ["Chicken Liver"],
    "category": "Recipe",
    "language": "he",
    "captureQuality": "partial",
    "captureReason": "teaser",
    "enrichStatus": "processing",
    "metadata": {"originalTitle": "Crispy", "estimatedReadTime": 1},
}

FULL_ANALYSIS = {
    "title": "מתכון לכבדי עוף עם בצל מקורמל",
    "summary": "כבדי עוף מוקפצים עם בצל מקורמל וסוכר.",
    "detailedSummary": "## מצרכים\n- ½ קילו כבדי עוף\n## הכנה\n1. מטגנים בצל\n2. מוסיפים כבדים",
    "tags": ["כבדי עוף", "מתכונים"],
    "concepts": ["Chicken Liver", "Caramelized Onion"],
    "category": "Recipe",
    "language": "he",
    "actionableTakeaway": "מטגנים את הבצל עד הזהבה לפני הכבדים.",
}


@pytest.fixture
def seams(monkeypatch):
    # The offline harness fakes google.cloud.firestore with a fresh object per
    # attribute read, so pin one DELETE_FIELD sentinel the assertions can compare.
    monkeypatch.setattr(main, "gc_firestore", types.SimpleNamespace(DELETE_FIELD=object()))
    monkeypatch.setattr(main, "get_user_vocabulary", lambda uid: (["מתכונים"], ["Recipe"]))
    monkeypatch.setattr(main, "GraphService", _Graph)
    monkeypatch.setattr(main, "get_db", lambda: None)
    monkeypatch.setattr(main, "log_to_firestore", lambda *a, **k: None)
    import scraper
    monkeypatch.setattr(scraper, "safe_get", lambda url, **kw: _Img())
    return monkeypatch


def test_enrich_merges_the_screenshot_read_into_the_same_card(seams):
    ai = _AI(FULL_ANALYSIS)
    seams.setattr(main, "GeminiService", lambda: ai)
    queue = _Ref({"uid": "u1", "cardId": "card-1", "enrich": True,
                  "imageUrls": ["https://firebasestorage/o/screenshots%2Fu1%2Fa.png"]}, ref_id="q1")
    card = _Ref(dict(PARTIAL_CARD), ref_id="card-1")

    main._enrich_card_with_images(queue, "q1", "u1", card, queue.doc)

    final = card.updates[-1]
    # Fresh read from the screenshot, on the SAME card (update, not set).
    assert final["title"] == FULL_ANALYSIS["title"]
    assert "מצרכים" in final["detailedSummary"]
    assert final["metadata.actionableTakeaway"] == FULL_ANALYSIS["actionableTakeaway"]
    # The user's tags come first; new ones are appended without duplicates.
    assert final["tags"] == ["מתכונים", "אוכל", "כבדי עוף"]
    # The screenshot is now part of the card, and it is no longer partial.
    assert final["imageUrls"] == ["https://firebasestorage/o/screenshots%2Fu1%2Fa.png"]
    assert final["captureQuality"] is main.gc_firestore.DELETE_FIELD
    assert final["captureReason"] is main.gc_firestore.DELETE_FIELD
    assert final["enrichStatus"] is main.gc_firestore.DELETE_FIELD
    assert final["enrichedAt"] > 0
    # Re-embedded on the current recipe; connections recomputed for THIS card.
    assert final["embeddingVersion"] == main.EMBED_TEXT_VERSION
    assert list(final["embedding_vector"]) == [0.1, 0.2, 0.3]
    assert final["relatedLinks"][0]["id"] == "other"
    # Identity fields are never touched by the merge.
    for key in ("url", "sourceName", "status", "createdAt", "sourceType"):
        assert key not in final
    # The screenshot was read as the authoritative content, with the partial
    # read as context.
    text, images, kw = ai.calls[0]
    assert kw["image_is_primary"] is True and kw["image_text_dense"] is True
    assert kw["user_screenshots"] is True
    # Stages written in order, then cleared with the count of screenshots read.
    assert [u["enrichStage"] for u in card.updates[:-1]] == ["reading", "analyzing", "connecting"]
    assert final["enrichStage"] is main.gc_firestore.DELETE_FIELD
    assert final["enrichCount"] == 1
    assert len(images) == 1 and images[0][1] == "image/png"
    assert "SOURCE URL: https://www.facebook.com/crispy/posts/1" in text
    assert queue.deleted


def test_enrich_failure_leaves_the_card_untouched_and_retryable(seams):
    seams.setattr(main, "GeminiService", lambda: _AI(fail=True))
    queue = _Ref({"uid": "u1", "cardId": "card-1", "enrich": True, "imageUrls": ["https://s/a.png"]}, ref_id="q1")
    before = dict(PARTIAL_CARD)
    card = _Ref(dict(PARTIAL_CARD), ref_id="card-1")

    main._enrich_card_with_images(queue, "q1", "u1", card, queue.doc)

    # Progress stages, then the failure with a reason written for the user
    # (never the raw exception text).
    assert [u["enrichStage"] for u in card.updates[:-1]] == ["reading", "analyzing"]
    final = card.updates[-1]
    assert final["enrichStatus"] == "failed"
    assert "vision down" not in final["enrichError"]
    assert "screenshots" in final["enrichError"]
    assert final["enrichStage"] is main.gc_firestore.DELETE_FIELD
    # Nothing else moved: summary, flags, tags all as they were.
    for key in ("title", "summary", "tags", "captureQuality", "captureReason"):
        assert card.doc[key] == before[key]
    assert queue.deleted


def test_enrich_on_a_deleted_card_just_clears_the_queue(seams):
    seams.setattr(main, "GeminiService", lambda: _AI(FULL_ANALYSIS))
    queue = _Ref({"uid": "u1", "cardId": "gone", "enrich": True, "imageUrls": ["https://s/a.png"]}, ref_id="q1")
    card = _Ref(None, ref_id="gone")
    main._enrich_card_with_images(queue, "q1", "u1", card, queue.doc)
    assert queue.deleted
    assert card.updates and card.updates[-1]["enrichStatus"] == "failed"


def test_worker_routes_enrich_jobs_before_any_placeholder_logic(monkeypatch):
    """An enrich queue doc must never create a placeholder card or re-stamp the
    existing card's processing clock — it goes straight to the merge."""
    seen = {}

    def fake_enrich(ref, task_id, uid, card_ref, data):
        seen["uid"] = uid
        seen["card_id"] = card_ref.id
        seen["data"] = data

    monkeypatch.setattr(main, "_enrich_card_with_images", fake_enrich)
    monkeypatch.setattr(main, "log_to_firestore", lambda *a, **k: None)

    class _Col:
        def __init__(self, path):
            self.path = path

        def document(self, doc_id=None):
            return types.SimpleNamespace(id=doc_id, collection=lambda name: _Col(self.path + [doc_id, name]))

    monkeypatch.setattr(main, "get_db", lambda: types.SimpleNamespace(collection=lambda name: _Col([name])))

    queue_doc = {"uid": "u1", "url": "https://s/a.png", "isImage": True, "enrich": True,
                 "cardId": "card-9", "imageUrls": ["https://s/a.png"]}
    snapshot = types.SimpleNamespace(to_dict=lambda: queue_doc, reference=_Ref(queue_doc, "q9"), id="q9")
    handler = getattr(main.process_link_background, "__wrapped__", main.process_link_background)
    handler(types.SimpleNamespace(data=snapshot))
    assert seen == {"uid": "u1", "card_id": "card-9", "data": queue_doc}
    # No status writes on the queue doc from the generic path (it returned first).
    assert snapshot.reference.updates == []


# ── Adding MORE screenshots to an already-completed card ─────────────────────

def test_prior_screenshots_only_come_from_an_earlier_enrich():
    # A scraped card's own page images are not the user's screenshots.
    assert main._card_enrich_screenshots({"imageUrls": ["https://img/og.jpg"]}) == []
    assert main._card_enrich_screenshots(None) == []
    card = {"enrichedAt": 1, "imageUrls": ["https://s/1.png", "https://s/2.png", None, ""]}
    assert main._card_enrich_screenshots(card) == ["https://s/1.png", "https://s/2.png"]


def test_context_for_a_completed_card_says_the_earlier_screenshots_ride_along():
    ctx = main._enrich_context_text({"url": "https://www.facebook.com/p/1", "enrichedAt": 5,
                                     "title": "T", "summary": "S"})
    assert "earlier screenshots" in ctx
    assert "partial preview" not in ctx


def test_enrich_error_messages_are_for_the_user():
    assert "clearer" in main._enrich_error_message(main.AnalysisError("x"))
    assert main._enrich_error_message(ValueError("Card no longer exists")) == "This card was deleted."
    assert "try again" in main._enrich_error_message(RuntimeError("boom")).lower()


# ── the read itself: user screenshots get the screenshot-save rules ──────────

def _prompt_capturing_service():
    from ai_service import GeminiService
    svc = GeminiService.__new__(GeminiService)  # skip __init__ (no API key needed)
    captured = {}

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=3):
        captured["prompt"] = contents[0]
        captured["media_resolution"] = (config_extra or {}).get("media_resolution")
        return {"summary": "ok"}

    svc._generate_json = fake_generate_json
    return svc, captured


def test_user_screenshots_read_at_high_resolution_even_for_latin_posts():
    svc, captured = _prompt_capturing_service()
    svc.analyze_text_with_images("SOURCE URL: https://facebook.com/p/1", [(b"x", "image/png")],
                                 image_is_primary=True, image_text_dense=True, user_screenshots=True)
    assert captured["media_resolution"] == "MEDIA_RESOLUTION_HIGH"
    assert "COVER THE WHOLE POST" in captured["prompt"].replace("\n", " ")
    # One screenshot: no reading-order paragraph.
    assert "READING ORDER" not in captured["prompt"]


def test_several_user_screenshots_are_read_as_one_post_with_overlaps_counted_once():
    svc, captured = _prompt_capturing_service()
    svc.analyze_text_with_images("ctx", [(b"a", "image/png"), (b"b", "image/png"), (b"c", "image/png")],
                                 image_is_primary=True, image_text_dense=True, user_screenshots=True)
    prompt = captured["prompt"].replace("\n", " ")
    assert "The 3 screenshots are IN READING ORDER" in prompt
    assert "count repeated lines once" in prompt


def test_other_image_posts_are_unchanged():
    svc, captured = _prompt_capturing_service()
    svc.analyze_text_with_images("body", [(b"x", "image/jpeg")], image_is_primary=True)
    assert captured["media_resolution"] == "MEDIA_RESOLUTION_MEDIUM"
    assert "WHOLE POST" not in captured["prompt"]
