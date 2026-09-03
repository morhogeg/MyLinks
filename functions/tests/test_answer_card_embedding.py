"""A kept Ask answer is an ordinary, searchable card — PM-3.

Saving an answer (web/lib/answerCards.ts) writes a link doc with
`captureType: 'answer'`, `sourceType: 'answer'`, no `url`, and
`needsEmbedding: true`. If `sync_link_embedding` skipped it, the answer would
sit in the library invisible to search and to Ask — the exact failure the whole
feature exists to avoid.

The trigger gates on STATE (processing / failed / already-vectorized), never on
a card's type, so no change was needed there. These tests pin that, so a future
type filter can't silently strip kept answers out of retrieval.
"""

import types

import search
from search import build_embedding_text

_handler = search.sync_link_embedding.__wrapped__


class _Snap:
    def __init__(self, data, doc_id="answer-card-1"):
        self._data = data
        self.exists = True
        self.id = doc_id

    def to_dict(self):
        return self._data


def _event(data, uid="uid-1"):
    snap = _Snap(data)
    return types.SimpleNamespace(
        data=types.SimpleNamespace(after=snap),
        params={"uid": uid, "linkId": snap.id},
    )


def _answer_card(**overrides):
    """What lib/answerCards.buildAnswerCard actually writes, in doc form."""
    card = {
        "url": "",
        "title": "What did I save about sleep?",
        "summary": "Three of your saves agree: consistency beats duration.",
        "detailedSummary": "Three of your saves agree: consistency beats duration.\n\n- Same hour every night.",
        "tags": ["health/sleep"],
        "category": "Health",
        "concepts": ["circadian rhythm", "sleep debt"],
        "status": "unread",
        "isRead": False,
        "sourceType": "answer",
        "sourceName": "Machina answer",
        "captureType": "answer",
        "language": "en",
        "answerRef": "chat-1:3",
        "needsEmbedding": True,
        "metadata": {"originalTitle": "What did I save about sleep?", "estimatedReadTime": 1},
    }
    card.update(overrides)
    return card


def _instrument(monkeypatch):
    """Let the trigger run to the embed call; record what it embedded."""
    embedded = []

    class FakeES:
        def generate_embedding(self, text):
            embedded.append(text)
            return [0.1] * 768

    class _FakeRef:
        def collection(self, *_a):
            return self

        def document(self, *_a):
            return self

        def update(self, *_a, **_k):
            return None

    monkeypatch.setattr(search, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(search, "EmbeddingService", FakeES)
    monkeypatch.setattr(search, "get_db", lambda: _FakeRef())
    return embedded


def test_a_kept_answer_card_is_embedded(monkeypatch):
    embedded = _instrument(monkeypatch)
    _handler(_event(_answer_card()))
    assert len(embedded) == 1


def test_the_embedded_text_carries_the_question_and_the_answer(monkeypatch):
    # An answer is findable by what it ASKED as well as what it said — the
    # question is the card's title, the answer its summary and details.
    embedded = _instrument(monkeypatch)
    _handler(_event(_answer_card()))
    text = embedded[0]
    assert "What did I save about sleep?" in text
    assert "consistency beats duration" in text
    assert "Same hour every night" in text
    assert "circadian rhythm" in text


def test_a_url_less_answer_card_is_not_treated_as_a_placeholder(monkeypatch):
    # The trigger's only content gate is "has a title or a summary". An answer
    # card has both and no url, exactly like a note card.
    embedded = _instrument(monkeypatch)
    _handler(_event(_answer_card(url="")))
    assert len(embedded) == 1


def test_build_embedding_text_folds_an_answer_card_in_whole():
    text = build_embedding_text(_answer_card())
    assert text.startswith("Title: What did I save about sleep?")
    assert "Details: Three of your saves agree" in text
    assert "Concepts: circadian rhythm, sleep debt" in text
