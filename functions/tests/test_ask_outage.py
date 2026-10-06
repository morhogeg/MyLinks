"""An embedding outage is not an empty library (AI-6).

ask_brain only treated retrieval as down when BOTH halves raised. When the
embedding API failed but the literal keyword scan still ran (and, as usual for
a natural-language question, matched nothing), the user with hundreds of saves
was told their library had nothing on the topic and to "try saving a few
links". Offline: retrieval and the model are stubbed at the main boundary.
"""

import json

import pytest

import main
from tests.test_search_http import _Req, _Resp


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "plan_for", lambda uid: "free")
    monkeypatch.setattr(main, "meter_quota",
                        lambda *a, **k: {"ok": True, "remaining": 1, "used": 1, "limit": 2, "plan": "free"})
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "rerank_candidates", lambda q, c, top_k=10: list(c))
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())

    def embed_down(*a, **k):
        raise Exception("SEMANTIC_SEARCH_ERROR: Failed to generate query embedding - 503 UNAVAILABLE")

    monkeypatch.setattr(main, "perform_search_logic", embed_down)
    refunds, asked = [], []
    monkeypatch.setattr(main, "refund_quota", lambda *a: refunds.append(a))

    class _Gemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            asked.append([c["id"] for c in cards])
            return {"answer": "from the library", "citedIds": [c["id"] for c in cards]}

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    return {"refunds": refunds, "asked": asked}


def test_embedding_down_and_no_literal_hit_is_a_retryable_503(monkeypatch, env):
    monkeypatch.setattr(main, "keyword_scan_cards", lambda *a, **k: [])
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "what did I learn about sleep"}))
    assert resp.status == 503
    assert json.loads(resp.body)["error"] == (
        "Machina couldn't search your library just now. Try again in a moment.")
    assert env["refunds"] == [("u1", "asks")]
    assert env["asked"] == []  # never the "nothing saved on that" answer


def test_embedding_down_but_a_literal_hit_still_answers(monkeypatch, env):
    monkeypatch.setattr(main, "keyword_scan_cards",
                        lambda *a, **k: [{"id": "sleep", "title": "Sleep hygiene"}])
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "what did I learn about sleep"}))
    assert resp.status == 200
    assert env["asked"] == [["sleep"]]
    assert env["refunds"] == []
