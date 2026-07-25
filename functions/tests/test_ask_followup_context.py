"""What `ask_brain` actually RETRIEVES for on a conversational follow-up.

`search.followup_retrieval_query` is unit-tested as a pure function in
test_ask_retrieval.py; these tests cover the WIRING — that the endpoint feeds
that text to every retrieval-steering call (vector search, rerank, keyword
scan) while still asking the MODEL the raw question plus history.

The owner-reported failure (2026-07-25): an English answer about a saved maple
cake recipe, then the follow-up "בעברית" ("in Hebrew"). Retrieval embedded
those two meta words, returned topically random cards, and the model said the
library holds nothing on the recipe it had just cited on screen.

conftest installs the offline fakes so `import main` works with plain pytest;
Firestore, the embedding API, and Gemini are all stubbed at the main boundary.
"""

import json

import pytest

import main


_ASKED = 'Why is "מתכון לעוגת מייפל עסיסית" worth my time?'
_HISTORY = [
    {"role": "user", "content": _ASKED},
    {"role": "assistant", "content": "The maple cake is worth your time because…"},
]

_RECIPE_CARD = {"id": "cake", "title": "מתכון לעוגת מייפל עסיסית",
                "category": "Food", "summary": "A moist maple cake."}


class _Resp:
    """Capturing stand-in for https_fn.Response (same shim as test_search_http)."""

    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    def __init__(self, method="POST", json_body=None, headers=None, remote_addr="1.2.3.4"):
        self.method = method
        self._json = json_body
        self.headers = headers or {}
        self.remote_addr = remote_addr

    def get_json(self, silent=False):
        return self._json


@pytest.fixture
def seen(monkeypatch):
    """Stub every outward call ask_brain makes and record what retrieval saw."""
    calls = {"search": [], "rerank": [], "keyword": [], "asked": []}

    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "check_and_increment_quota", lambda *a, **k: (True, 1))

    def fake_search(uid, query_text, limit=30):
        calls["search"].append(query_text)
        return [_RECIPE_CARD]

    def fake_rerank(query_text, candidates, top_k=10):
        calls["rerank"].append(query_text)
        return list(candidates)

    def fake_keyword(uid, query_text, exclude_ids=None, limit=5):
        calls["keyword"].append(query_text)
        return []

    monkeypatch.setattr(main, "perform_search_logic", fake_search)
    monkeypatch.setattr(main, "rerank_candidates", fake_rerank)
    monkeypatch.setattr(main, "keyword_scan_cards", fake_keyword)
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())

    class _FakeGemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            calls["asked"].append({"question": question, "history": history,
                                   "cardIds": [c["id"] for c in cards]})
            return {"answer": "…", "citedIds": [c["id"] for c in cards]}

    monkeypatch.setattr(main, "GeminiService", _FakeGemini)
    return calls


def _ask(question, history=None):
    return main.ask_brain(_Req(json_body={
        "uid": "user1", "question": question, "history": history or [],
    }))


def test_context_free_followup_retrieves_for_the_prior_question(seen):
    resp = _ask("בעברית", _HISTORY)

    assert resp.status == 200
    # Every retrieval-steering call sees the topic, not the two meta words.
    assert seen["search"] == [_ASKED]
    assert seen["rerank"] == [_ASKED]
    assert seen["keyword"] == [_ASKED]
    # …so the recipe card is in context and can be cited, which is the whole
    # point: the answer must not contradict the sources shown a turn earlier.
    assert json.loads(resp.body)["citedIds"] == ["cake"]


def test_the_model_is_still_asked_the_raw_question_and_history(seen):
    _ask("בעברית", _HISTORY)

    # Retrieval was steered; GENERATION was not. The model must still see the
    # literal follow-up (it's the instruction — answer in Hebrew) and the
    # conversation, or the swap would silently rewrite the user's request.
    asked = seen["asked"][0]
    assert asked["question"] == "בעברית"
    assert asked["history"] == _HISTORY
    assert asked["cardIds"] == ["cake"]


def test_a_normal_question_retrieves_for_itself_unchanged(seen):
    # The safety property, at the endpoint: a question with a topic of its own
    # is routed EXACTLY as before, whether or not a conversation precedes it.
    _ask("What did I save about Italy?", _HISTORY)
    assert seen["search"] == ["What did I save about Italy?"]
    assert seen["rerank"] == ["What did I save about Italy?"]
    assert seen["asked"][0]["question"] == "What did I save about Italy?"


def test_first_question_of_a_conversation_is_untouched(seen):
    _ask(_ASKED, [])
    assert seen["search"] == [_ASKED]
    assert seen["asked"][0]["question"] == _ASKED
