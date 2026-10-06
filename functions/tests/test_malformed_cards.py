"""One malformed card must not break search for the whole library (AI-15).

Card docs are client-written. A None tag, a numeric concept or a numeric note
raised inside `_card_haystack` / `collect_notes_text`, and keyword_scan_cards
had no per-document guard, so a single such card aborted the lexical scan:
keyword search failed for every query in that library (and Ask's rerank,
which builds the same haystack, took the vector half down with it).
"""

from types import SimpleNamespace

import search
from ai_service import collect_notes_text

_BAD = {"title": None, "summary": 42, "tags": [None, 5, "pasta", {"x": 1}],
        "concepts": [3, "Italian cooking"], "sourceName": None, "category": 7,
        "userNote": 9, "userNotes": [{"text": 11}, None, "loose", {"text": "my real note"}],
        "metadata": "not a map", "videoHighlights": "0:10 - not a list"}


def test_haystack_and_notes_survive_every_bad_shape():
    hay = search._card_haystack(_BAD)
    assert "pasta" in hay and "italian cooking" in hay and "my real note" in hay
    assert "none" not in hay.split()
    assert collect_notes_text({"userNote": 9, "userNotes": 5}) == ""
    assert collect_notes_text(_BAD) == "my real note"


def test_scoring_rerank_and_embedding_text_survive_too():
    tokens = search.keyword_query_tokens("pasta")
    assert search.keyword_match_score(_BAD, tokens) > 0
    assert search.rerank_candidates("pasta", [dict(_BAD, id="bad"), {"id": "ok", "title": "pasta"}])
    text = search.build_embedding_text(_BAD)
    assert "Tags: pasta" in text and "Concepts: Italian cooking" in text


class _Doc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        if isinstance(self._data, Exception):
            raise self._data
        return dict(self._data)


class _LinksQuery:
    def __init__(self, docs):
        self.docs = docs

    def order_by(self, *a, **k):
        return self

    def limit(self, n):
        return self

    def select(self, fields):
        return self

    def stream(self):
        return iter(self.docs)


def test_one_bad_card_costs_only_itself_in_the_scan(monkeypatch):
    docs = [_Doc("bad", _BAD),
            _Doc("broken", RuntimeError("undecodable document")),
            _Doc("good", {"title": "Lemon pasta", "createdAt": 1})]
    q = _LinksQuery(docs)
    db = SimpleNamespace(collection=lambda n: SimpleNamespace(
        document=lambda uid: SimpleNamespace(collection=lambda sub: q)))
    monkeypatch.setattr(search, "get_db", lambda: db)

    hits = search.keyword_scan_cards("u1", "pasta", fields=search.SEARCH_SCAN_FIELDS)

    assert [h["id"] for h in hits] == ["good", "bad"]  # title hit outranks a tag hit
