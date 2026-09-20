"""Tests for the public share-page renderers (share_service.py).

Pure HTML-generation logic — no Firestore, no network. Focus: the elevated
collection page (mosaic hero, per-card rows with links to originals) stays
XSS-safe and degrades cleanly when cards have no thumbnails or URLs.
"""

from share_service import (
    _render_shared_card,
    _render_shared_collection,
)


def _collection(cards, **overrides):
    data = {
        "name": "Deep Learning",
        "description": "My favorite papers",
        "cards": cards,
        "publishedAt": 1752192000000,  # 2025-07-11 UTC
    }
    data.update(overrides)
    return data


def _card(**overrides):
    card = {
        "title": "Attention Is All You Need",
        "summary": "The transformer paper.",
        "url": "https://arxiv.org/abs/1706.03762",
        "category": "AI",
        "sourceName": "arXiv",
        "thumbnailUrl": "https://example.com/thumb.jpg",
    }
    card.update(overrides)
    return card


class TestSharedCollectionPage:
    def test_renders_mosaic_from_card_thumbnails(self):
        html = _render_shared_collection(_collection([_card(), _card(), _card()]), "https://x/c?id=a")
        assert 'class="mosaic n3"' in html
        assert html.count("https://example.com/thumb.jpg") >= 3

    def test_mosaic_caps_at_four_and_skips_missing_thumbs(self):
        cards = [_card() for _ in range(6)] + [_card(thumbnailUrl=None)]
        html = _render_shared_collection(_collection(cards), "https://x/c?id=a")
        assert 'class="mosaic n4"' in html

    def test_no_mosaic_when_no_thumbnails(self):
        html = _render_shared_collection(
            _collection([_card(thumbnailUrl=None), _card(thumbnailUrl=None)]), "https://x/c?id=a"
        )
        assert 'class="mosaic' not in html  # .mosaic CSS may exist; no mosaic element

    def test_card_titles_link_to_originals(self):
        html = _render_shared_collection(_collection([_card()]), "https://x/c?id=a")
        assert '<a href="https://arxiv.org/abs/1706.03762" rel="noopener nofollow" target="_blank">' in html
        assert "arXiv" in html  # source kicker

    def test_image_cards_do_not_link_their_stored_image(self):
        card = _card(sourceType="image", url="https://storage.example.com/shot.png")
        html = _render_shared_collection(_collection([card]), "https://x/c?id=a")
        assert 'href="https://storage.example.com/shot.png"' not in html

    def test_count_and_updated_date_in_meta_line(self):
        html = _render_shared_collection(_collection([_card(), _card()]), "https://x/c?id=a")
        assert "2 curated cards" in html
        assert "updated Jul" in html

    def test_overflow_note_past_fifty_cards(self):
        html = _render_shared_collection(_collection([_card() for _ in range(53)]), "https://x/c?id=a")
        assert "and 3 more cards" in html

    def test_escapes_malicious_content(self):
        evil = _card(
            title='<script>alert(1)</script>',
            summary='<img src=x onerror=alert(1)>',
            sourceName='"><script>x</script>',
        )
        html = _render_shared_collection(
            _collection([evil], name='<b>Evil</b>', description='<script>d</script>'),
            "https://x/c?id=a",
        )
        assert "<script>" not in html
        assert "<img src=x" not in html  # the payload only survives escaped
        assert "&lt;script&gt;" in html
        assert "&lt;img src=x" in html

    def test_javascript_urls_never_become_links(self):
        card = _card(url="javascript:alert(1)")
        html = _render_shared_collection(_collection([card]), "https://x/c?id=a")
        assert 'href="javascript:' not in html


class TestSharedCardPage:
    def test_single_card_page_still_renders(self):
        html = _render_shared_card(_card(), "https://x/s?id=a")
        assert "Attention Is All You Need" in html
        assert "View original" in html


# ── Publish / unpublish hardening (2026-09-20) ───────────────────────────────
# Drives _publish_share_logic / _unpublish_share_logic against an in-memory
# Firestore double. Pinned: the 20-char share-id floor, the unpublish
# TOMBSTONE (a stopped share's id can never be re-claimed by another account,
# while its owner can republish over it), the narrowed collection-card shape,
# and noindex on every share page.

import pytest

import share_service
from share_service import (
    _publish_share_logic,
    _unpublish_share_logic,
    _sanitize_collection_share_payload,
    _sanitize_card_share_payload,
    _share_html_shell,
    _valid_share_id,
)

OWNER = "+15551234567"
STRANGER = "+15559999999"
SHARE_ID = "3f2a9c1d4e5b6a7f8c9d0e1f2a3b4c5d"


class _FakeDoc:
    def __init__(self, store, coll, doc_id):
        self._store, self._coll, self._id = store, coll, doc_id
        self.exists = (coll, doc_id) in store

    def get(self):
        self.exists = (self._coll, self._id) in self._store
        return self

    def to_dict(self):
        return self._store.get((self._coll, self._id))

    def set(self, data, merge=False):
        key = (self._coll, self._id)
        if merge and key in self._store:
            self._store[key] = {**self._store[key], **data}
        else:
            self._store[key] = dict(data)

    def delete(self):
        self._store.pop((self._coll, self._id), None)


class _FakeColl:
    def __init__(self, store, name):
        self._store, self._name = store, name

    def document(self, doc_id):
        return _FakeDoc(self._store, self._name, doc_id)


class _FakeBatch:
    def __init__(self):
        self._ops = []

    def set(self, ref, data):
        self._ops.append((ref, data))

    def commit(self):
        for ref, data in self._ops:
            ref.set(data)
        self._ops = []


class _FakeDb:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return _FakeColl(self.store, name)

    def batch(self):
        return _FakeBatch()


@pytest.fixture
def db(monkeypatch):
    fake = _FakeDb()
    monkeypatch.setattr(share_service, "get_db", lambda: fake)
    # Never touch Storage for preview cleanup / generation in these tests.
    monkeypatch.setattr(share_service, "_delete_share_previews", lambda _id: None)
    monkeypatch.setattr(share_service, "_generate_og_preview", lambda *a, **k: None)
    return fake


def _publish_collection(uid, share_id=SHARE_ID, name="Deep Learning"):
    return _publish_share_logic(uid, "collection", share_id, {
        "name": name, "description": "d", "cards": [_card()],
    })


class TestShareIdFloor:
    @pytest.mark.parametrize("short", ["abc", "a" * 19, "share-1", "1234567890"])
    def test_short_ids_are_rejected(self, short):
        assert _valid_share_id(short) is False
        with pytest.raises(ValueError):
            _publish_share_logic(OWNER, "card", short, {"card": _card()})
        with pytest.raises(ValueError):
            _unpublish_share_logic(OWNER, "card", short)

    def test_client_minted_ids_pass(self):
        # newShareId() in web/lib/collections.ts: a UUID with dashes stripped.
        assert _valid_share_id("a" * 20)
        assert _valid_share_id(SHARE_ID)
        assert _valid_share_id("3f2a9c1d-4e5b-6a7f-8c9d-0e1f2a3b4c5d")


class TestUnpublishTombstone:
    def test_unpublish_removes_the_public_doc_but_keeps_the_owner_row(self, db):
        _publish_collection(OWNER)
        _unpublish_share_logic(OWNER, "collection", SHARE_ID)

        assert ("shared_collections", SHARE_ID) not in db.store  # share_page 404s
        row = db.store[("shared_owners", SHARE_ID)]
        assert row["ownerUid"] == OWNER and row["type"] == "collection"
        assert row["unpublishedAt"] > 0
        assert row["publishedAt"] > 0  # merge: nothing else removed

    def test_a_stranger_cannot_claim_a_stopped_share_id(self, db):
        _publish_collection(OWNER)
        _unpublish_share_logic(OWNER, "collection", SHARE_ID)
        with pytest.raises(PermissionError):
            _publish_collection(STRANGER, name="Phishing")
        with pytest.raises(PermissionError):
            _unpublish_share_logic(STRANGER, "collection", SHARE_ID)
        assert ("shared_collections", SHARE_ID) not in db.store

    def test_the_owner_can_republish_over_a_tombstone(self, db):
        _publish_collection(OWNER)
        _unpublish_share_logic(OWNER, "collection", SHARE_ID)
        _publish_collection(OWNER, name="Back again")

        assert db.store[("shared_collections", SHARE_ID)]["name"] == "Back again"
        row = db.store[("shared_owners", SHARE_ID)]
        assert row["ownerUid"] == OWNER
        assert "unpublishedAt" not in row  # a live row again, not a tombstone

    def test_legacy_share_without_an_owner_row_gets_a_tombstone(self, db):
        # Pre-2026-07-07 shares carried ownerUid on the public doc only.
        db.store[("shared_cards", SHARE_ID)] = {"ownerUid": OWNER, "card": _card()}
        _unpublish_share_logic(OWNER, "card", SHARE_ID)
        assert ("shared_cards", SHARE_ID) not in db.store
        assert db.store[("shared_owners", SHARE_ID)]["ownerUid"] == OWNER
        with pytest.raises(PermissionError):
            _publish_share_logic(STRANGER, "card", SHARE_ID, {"card": _card()})


class TestCollectionCardShape:
    def test_collection_cards_drop_what_the_page_never_renders(self):
        doc = _sanitize_collection_share_payload({
            "name": "N", "description": "D",
            "cards": [_card(
                detailedSummary="A long body", tags=["ai", "papers"], language="en",
                sourceType="web", sourcePlatform="x", sourceHandle="@arxiv",
                metadata={"youtubeChannel": "c", "estimatedReadTime": 4},
                createdAt=1752192000000, id="card-1", ownerUid=OWNER,
            )],
        })
        card = doc["cards"][0]
        assert card == {
            "title": "Attention Is All You Need",
            "summary": "The transformer paper.",
            "url": "https://arxiv.org/abs/1706.03762",
            "category": "AI",
            "sourceName": "arXiv",
            "thumbnailUrl": "https://example.com/thumb.jpg",
            "sourceType": "web",
            "sourcePlatform": "x",
            "sourceHandle": "@arxiv",
        }

    def test_single_card_share_keeps_the_full_body(self):
        # The /s page renders detailedSummary and tags; only /c trims them.
        card = _sanitize_card_share_payload({"card": _card(detailedSummary="Body", tags=["ai"])})["card"]
        assert card["detailedSummary"] == "Body" and card["tags"] == ["ai"]

    def test_collection_publish_never_stores_detailed_summary(self, db):
        _publish_share_logic(OWNER, "collection", SHARE_ID, {
            "name": "N", "cards": [_card(detailedSummary="Body", tags=["ai"])],
        })
        stored = db.store[("shared_collections", SHARE_ID)]["cards"][0]
        assert "detailedSummary" not in stored and "tags" not in stored


class TestNoIndex:
    def test_shell_carries_noindex(self):
        html = _share_html_shell(title="t", description="d", image="https://x/i.png",
                                 url="https://x/s?id=a", body="<p>b</p>")
        assert '<meta name="robots" content="noindex">' in html

    def test_every_share_page_type_is_noindex(self):
        pages = [
            _render_shared_card(_card(), "https://x/s?id=a"),
            _render_shared_collection(_collection([_card()]), "https://x/c?id=a"),
            share_service._render_shared_answer(
                {"question": "Q?", "answer": "A.", "sources": []}, "https://x/a?id=a"),
        ]
        for html in pages:
            assert '<meta name="robots" content="noindex">' in html
