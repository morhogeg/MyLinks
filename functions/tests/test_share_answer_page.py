"""Tests for the public ANSWER share page (/a?id=) — PM-3, "Ask answers become things".

Two things are pinned here, and they are not the same thing:

1. **The render** (`_render_shared_answer`) — the question is the title, the
   answer body is real markdown-rendered HTML, the Sources list links to the
   originals, the "from N saves" credit counts what is actually listed, an
   ungrounded answer says so, and none of it can be turned into markup by a
   hostile string.

2. **The privacy filter** (`_sanitize_answer_payload` + `_publish_share_logic`)
   — the world-readable snapshot is REBUILT from an allowlist, so no card id,
   no `ownerUid`, and no invented field can reach it even if a client posts
   one. The web client drops private cards before this point
   (web/lib/answerShare.ts); this is the server-side half of the same rule, and
   it is the half an attacker cannot skip.

Pure logic — no Firestore, no network (the publish test drives a fake db).
"""

import pytest

from share_service import (
    _render_shared_answer,
    _sanitize_answer_payload,
    _publish_share_logic,
    _SHARE_COLLECTIONS,
)
import share_service


def _answer(**overrides):
    data = {
        "shareId": "abc123",
        "question": "What did I save about sleep?",
        "answer": "Three of your saves agree: **consistency** beats duration.\n\n- Go to bed at the same hour.\n- Morning light matters more than blackout curtains.",
        "sources": [
            {"title": "Why We Sleep", "url": "https://example.com/sleep"},
            {"title": "A screenshot I kept"},
        ],
        "publishedAt": 1752192000000,
    }
    data.update(overrides)
    return data


class TestAnswerPageRender:
    def test_question_is_the_title_and_the_heading(self):
        html = _render_shared_answer(_answer(), "https://x/a?id=abc123")
        assert "<title>What did I save about sleep? · Machina</title>" in html
        assert '<meta property="og:title" content="What did I save about sleep?">' in html
        assert "<h1 dir=\"auto\">What did I save about sleep?</h1>" in html

    def test_answer_body_renders_as_markdown_not_raw_text(self):
        html = _render_shared_answer(_answer(), "https://x/a?id=abc123")
        assert "<strong>consistency</strong>" in html
        assert "<ul>" in html and "Go to bed at the same hour." in html
        # The raw markers must not survive into the page.
        assert "**consistency**" not in html

    def test_sources_link_to_the_original_only(self):
        html = _render_shared_answer(_answer(), "https://x/a?id=abc123")
        assert '<a href="https://example.com/sleep" rel="noopener nofollow" target="_blank">Why We Sleep</a>' in html
        # A source with no URL is listed by title alone — never linked.
        assert "A screenshot I kept" in html
        assert 'href="A screenshot I kept"' not in html

    def test_credit_counts_the_sources_actually_listed(self):
        html = _render_shared_answer(_answer(), "https://x/a?id=abc123")
        assert "Answered by Machina from 2 saves" in html

    def test_credit_is_singular_for_one_source(self):
        html = _render_shared_answer(
            _answer(sources=[{"title": "Why We Sleep", "url": "https://example.com/sleep"}]),
            "https://x/a?id=abc123",
        )
        assert "Answered by Machina from 1 save" in html
        assert "1 saves" not in html
        assert '<p class="srcs-h">Source</p>' in html

    def test_no_sources_means_no_count_and_no_sources_block(self):
        html = _render_shared_answer(_answer(sources=[]), "https://x/a?id=abc123")
        assert "Answered by Machina" in html
        assert "from 0 saves" not in html
        assert 'class="srcs-h"' not in html

    def test_ungrounded_answer_says_so_on_the_page(self):
        html = _render_shared_answer(
            _answer(sources=[], ungrounded=True), "https://x/a?id=abc123"
        )
        assert "could not tie this answer to any saved source" in html

    def test_a_grounded_answer_carries_no_ungrounded_notice(self):
        html = _render_shared_answer(_answer(), "https://x/a?id=abc123")
        assert "could not tie this answer" not in html

    def test_og_image_is_the_brand_icon_with_declared_dimensions(self):
        # An answer has no image of its own. The 512px brand icon is well under
        # the messenger size budget, and declaring width/height/type is what
        # stops WhatsApp dropping the preview entirely.
        html = _render_shared_answer(_answer(), "https://x/a?id=abc123")
        assert "/icon-512.png" in html
        assert '<meta property="og:image:width" content="512">' in html
        assert '<meta property="og:image:height" content="512">' in html
        assert '<meta property="og:image:type" content="image/png">' in html

    def test_og_description_is_plain_text_not_markdown(self):
        html = _render_shared_answer(_answer(), "https://x/a?id=abc123")
        assert '<meta property="og:description" content="Three of your saves agree' in html
        # Markdown markers render literally in every link preview, so they're stripped.
        assert 'content="Three of your saves agree: **' not in html

    def test_hebrew_answers_carry_auto_direction(self):
        html = _render_shared_answer(
            _answer(question="מה שמרתי על שינה?", answer="שלושה מהשמורים שלך מסכימים."),
            "https://x/a?id=abc123",
        )
        assert '<h1 dir="auto">מה שמרתי על שינה?</h1>' in html
        assert '<p dir="auto">שלושה מהשמורים שלך מסכימים.</p>' in html

    def test_hostile_strings_cannot_become_markup(self):
        html = _render_shared_answer(
            _answer(
                question='<script>alert(1)</script>',
                answer='<img src=x onerror=alert(1)>',
                sources=[{"title": '<b>pwn</b>', "url": 'javascript:alert(1)'}],
            ),
            "https://x/a?id=abc123",
        )
        # Escaped everywhere, so nothing can open a tag. (The escaped text still
        # contains the words — what matters is that "<" never survives as "<".)
        assert "<script>" not in html
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
        assert "<img src=x" not in html  # the page's own brand <img> is fine
        assert "&lt;img src=x onerror=alert(1)&gt;" in html
        assert "<b>pwn</b>" not in html
        assert "&lt;b&gt;pwn&lt;/b&gt;" in html
        # A non-http scheme is never linked.
        assert 'href="javascript:alert(1)"' not in html

    def test_the_page_never_carries_a_card_id(self):
        # The snapshot has no ids in it; this pins that the renderer can't
        # reintroduce one from a stray field a future writer adds.
        html = _render_shared_answer(
            _answer(sources=[{"title": "Why We Sleep", "url": "https://example.com/sleep",
                              "id": "card-abc-123"}]),
            "https://x/a?id=abc123",
        )
        assert "card-abc-123" not in html


class TestAnswerPayloadPrivacy:
    def test_the_snapshot_keeps_only_the_four_public_fields(self):
        clean = _sanitize_answer_payload({
            "question": "Q?",
            "answer": "A.",
            "sources": [{"title": "T", "url": "https://example.com"}],
            "ungrounded": True,
        })
        assert set(clean) == {"question", "answer", "sources", "ungrounded"}

    def test_card_ids_are_stripped_from_every_source(self):
        clean = _sanitize_answer_payload({
            "question": "Q?", "answer": "A.",
            "sources": [
                {"id": "card-1", "title": "One", "url": "https://example.com/1"},
                {"id": "card-2", "title": "Two"},
            ],
        })
        assert clean["sources"] == [
            {"title": "One", "url": "https://example.com/1"},
            {"title": "Two"},
        ]

    def test_invented_fields_never_reach_the_public_doc(self):
        clean = _sanitize_answer_payload({
            "question": "Q?", "answer": "A.", "sources": [],
            "ownerUid": "+15551234567",
            "uid": "+15551234567",
            "cards": [{"title": "a private card"}],
            "thumbnailUrl": "https://example.com/private.jpg",
        })
        assert "ownerUid" not in clean
        assert "uid" not in clean
        assert "cards" not in clean
        assert "thumbnailUrl" not in clean
        assert "+15551234567" not in str(clean)

    def test_non_http_source_urls_are_dropped_not_published(self):
        clean = _sanitize_answer_payload({
            "question": "Q?", "answer": "A.",
            "sources": [
                {"title": "js", "url": "javascript:alert(1)"},
                {"title": "file", "url": "file:///etc/passwd"},
                {"title": "ok", "url": "https://example.com"},
            ],
        })
        assert clean["sources"] == [
            {"title": "js"}, {"title": "file"}, {"title": "ok", "url": "https://example.com"},
        ]

    def test_titleless_and_malformed_sources_are_dropped(self):
        clean = _sanitize_answer_payload({
            "question": "Q?", "answer": "A.",
            "sources": ["not a dict", {"url": "https://example.com"}, {"title": "   "}],
        })
        assert clean["sources"] == []

    def test_sources_and_text_are_bounded(self):
        clean = _sanitize_answer_payload({
            "question": "q" * 5000,
            "answer": "a" * 100_000,
            "sources": [{"title": f"s{i}"} for i in range(200)],
        })
        assert len(clean["question"]) == 500
        assert len(clean["answer"]) == 20_000
        assert len(clean["sources"]) == 50

    def test_ungrounded_is_absent_unless_the_answer_was_flagged(self):
        assert "ungrounded" not in _sanitize_answer_payload(
            {"question": "Q?", "answer": "A.", "sources": []}
        )


class _FakeDoc:
    def __init__(self, store, coll, doc_id):
        self._store, self._coll, self._id = store, coll, doc_id
        self.exists = (coll, doc_id) in store

    def get(self):
        self.exists = (self._coll, self._id) in self._store
        return self

    def to_dict(self):
        return self._store.get((self._coll, self._id))

    def set(self, data):
        self._store[(self._coll, self._id)] = data

    def delete(self):
        self._store.pop((self._coll, self._id), None)


class _FakeColl:
    def __init__(self, store, name):
        self._store, self._name = store, name

    def document(self, doc_id):
        return _FakeDoc(self._store, self._name, doc_id)


class _FakeDb:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return _FakeColl(self.store, name)


@pytest.fixture
def db(monkeypatch):
    fake = _FakeDb()
    monkeypatch.setattr(share_service, "get_db", lambda: fake)
    return fake


class TestPublishAnswer:
    def test_answer_is_a_first_class_share_type(self):
        assert _SHARE_COLLECTIONS["answer"] == "shared_answers"

    def test_publish_writes_the_sanitized_snapshot_without_owner_uid(self, db):
        result = _publish_share_logic("+15551234567", "answer", "share-1", {
            "question": "What did I save about sleep?",
            "answer": "Consistency beats duration.",
            "sources": [{"id": "card-1", "title": "Why We Sleep", "url": "https://example.com/sleep"}],
            "ownerUid": "+15551234567",
        })
        assert result == {"shareId": "share-1"}

        doc = db.store[("shared_answers", "share-1")]
        assert doc["question"] == "What did I save about sleep?"
        assert doc["sources"] == [{"title": "Why We Sleep", "url": "https://example.com/sleep"}]
        assert doc["shareId"] == "share-1" and doc["publishedAt"] > 0
        # The two things that must never be in a world-readable doc.
        assert "ownerUid" not in doc
        assert "card-1" not in str(doc)

        # The owner mapping lives in the functions-only collection instead.
        assert db.store[("shared_owners", "share-1")]["ownerUid"] == "+15551234567"
        assert db.store[("shared_owners", "share-1")]["type"] == "answer"

    def test_publish_generates_no_og_preview_for_an_answer(self, db, monkeypatch):
        # An answer has no image, and the preview path would fetch a URL. It must
        # never even be attempted.
        def _boom(*_a, **_k):
            raise AssertionError("answers must not run the og-preview fetch")

        monkeypatch.setattr(share_service, "_downscale_og_preview", _boom)
        _publish_share_logic("+15551234567", "answer", "share-2", {
            "question": "Q?", "answer": "A.", "sources": [],
        })
        assert "ogPreview" not in db.store[("shared_answers", "share-2")]

    def test_another_account_cannot_overwrite_a_published_answer(self, db):
        _publish_share_logic("+15551234567", "answer", "share-3", {
            "question": "Q?", "answer": "A.", "sources": [],
        })
        with pytest.raises(PermissionError):
            _publish_share_logic("+15559999999", "answer", "share-3", {
                "question": "Phishing", "answer": "Click here.", "sources": [],
            })
        assert db.store[("shared_answers", "share-3")]["question"] == "Q?"
