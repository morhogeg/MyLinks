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
