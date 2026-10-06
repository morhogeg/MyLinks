"""Privacy on the retrieval paths: what a private card may reach.

A card is effectively private when it carries `isPrivate` or sits in a private
(PIN-locked) collection. These tests pin the server half of that promise:

  - AI-19: a FAILED private-collection lookup must fail CLOSED. It used to
    return an empty set, which reads exactly like "no private collections", so
    one Firestore blip made every PIN-locked collection's cards public to Ask
    and search.
  - AUTH-2: the search bar's relevance judge is a Gemini call that reads each
    candidate's title and summary. Private cards must leave BOTH retrieval
    halves before it runs, not only the response afterwards.

Offline: Firestore is faked at each module's boundary; Gemini never runs.
"""

import json
import types

import pytest

import main
import search
import digest_service as ds
from tests.test_ai_payload_privacy import FakeUserDoc, _install, _link
from tests.test_search_http import _Req, _Resp


class _ExplodingDb:
    """Any read raises, like Firestore during an outage."""

    def collection(self, _name):
        raise RuntimeError("firestore unavailable: users/+15551234567/collections")


# ── AI-19: the lookup fails closed ──────────────────────────────────────────

def test_lookup_failure_is_none_not_an_empty_set(monkeypatch, caplog):
    monkeypatch.setattr(search, "get_db", lambda: _ExplodingDb())
    assert search.private_collection_ids("+15551234567") is None
    # The exception text carries the document path, i.e. the raw uid.
    assert "+15551234567" not in caplog.text


def test_unknown_private_set_drops_every_collection_member():
    cards = [
        {"id": "plain"},
        {"id": "flagged", "isPrivate": True},
        {"id": "member", "collectionIds": ["maybe-private"]},
        {"id": "no-collections", "collectionIds": []},
        {"id": "malformed", "collectionIds": "x"},
    ]
    kept = [c["id"] for c in search.strip_private_cards(cards, None)]
    assert kept == ["plain", "no-collections", "malformed"]


def test_known_private_set_still_keeps_public_collection_members():
    cards = [{"id": "open", "collectionIds": ["open"]},
             {"id": "vault", "collectionIds": ["vault"]},
             {"id": "odd", "collectionIds": [{"not": "hashable"}, "open"]}]
    assert [c["id"] for c in search.strip_private_cards(cards, {"vault"})] == ["open", "odd"]


class _CollectionsDownUser(FakeUserDoc):
    def collection(self, name):
        if name == "collections":
            raise RuntimeError("collections read failed")
        return super().collection(name)


def test_digest_candidates_fail_closed_when_the_lookup_fails(monkeypatch):
    # The digest (and the weekly synthesis sent to Gemini) shares the rule.
    db = _install(monkeypatch, ds, [])
    db._user = _CollectionsDownUser(
        [_link("plain", title="Plain"), _link("member", title="Member", collectionIds=["open"])], [])
    assert [l["id"] for l in ds.fetch_candidate_links("u1")] == ["plain"]


@pytest.fixture
def ask_env(monkeypatch):
    """ask_brain with every outward call stubbed; records the model's cards."""
    seen = {"cards": None}
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "plan_for", lambda uid: "pro")
    monkeypatch.setattr(main, "meter_quota",
                        lambda *a, **k: {"ok": True, "remaining": 1, "used": 1, "limit": 2, "plan": "pro"})
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "rerank_candidates", lambda q, c, top_k=10: list(c))
    monkeypatch.setattr(main, "keyword_scan_full", lambda *a, **k: [])

    class _Gemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            seen["cards"] = [c["id"] for c in cards]
            return {"answer": "ok", "citedIds": []}

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    return seen


def test_ask_fails_closed_when_the_lookup_fails(monkeypatch, ask_env):
    monkeypatch.setattr(main, "perform_search_logic", lambda *a, **k: [
        {"id": "plain", "title": "Plain"},
        {"id": "member", "title": "In some collection", "collectionIds": ["c1"]},
    ])
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: None)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "what about plain things"}))
    assert resp.status == 200
    assert ask_env["cards"] == ["plain"]


def test_ask_filter_bug_also_drops_collection_members(monkeypatch, ask_env):
    monkeypatch.setattr(main, "perform_search_logic", lambda *a, **k: [
        {"id": "plain", "title": "Plain"},
        {"id": "member", "title": "In some collection", "collectionIds": ["c1"]},
    ])

    def boom(uid):
        raise RuntimeError("filter bug")

    monkeypatch.setattr(main, "private_collection_ids", boom)
    main.ask_brain(_Req(json_body={"uid": "u1", "question": "what about plain things"}))
    assert ask_env["cards"] == ["plain"]


def test_search_twin_fails_closed_when_the_lookup_fails(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "perform_hybrid_search", lambda uid, q, limit, meta=None: [
        {"id": "plain"}, {"id": "member", "collectionIds": ["c1"]}])
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: None)
    resp = main.search_links_http(_Req(json_body={"query": "dogs", "uid": "u1"}))
    assert [c["id"] for c in json.loads(resp.body)["links"]] == ["plain"]


# ── AUTH-2: private cards never reach the search judge (a Gemini call) ──────
# The judge prompt carries each candidate's title, summary head, tags and
# concepts. The strip used to run only in the HTTP handler, AFTER the judge.

class _JudgeModels:
    def __init__(self, reply):
        self.prompts = []
        self.reply = reply

    def generate_content(self, model, contents, config=None):
        self.prompts.append(contents)
        return types.SimpleNamespace(text=self.reply)


def _judge(monkeypatch, reply="[]"):
    models = _JudgeModels(reply)
    monkeypatch.setattr(search, "_get_genai_client",
                        lambda timeout_ms: types.SimpleNamespace(models=models))
    return models


def _vres(cid, title, dist, **extra):
    return {"id": cid, "title": title, "summary": f"{title} summary",
            "vector_distance": dist, "createdAt": 1, **extra}


_PRIVATE_NEIGHBOURS = [
    _vres("pub", "Sourdough basics", 0.30),
    _vres("flag", "Sourdough fertility diary", 0.31, isPrivate=True),
    _vres("vault", "Sourdough divorce notes", 0.32, collectionIds=["vault"]),
    _vres("open", "Sourdough in a shared folder", 0.33, collectionIds=["open"]),
]


def _no_keyword_hits(uid, q, exclude_ids=None, limit=10, fields=None):
    return []


def test_private_candidates_never_reach_the_judge_prompt(monkeypatch):
    models = _judge(monkeypatch, reply='[{"n": 1, "evidence": "Sourdough basics"}]')
    monkeypatch.setattr(search, "perform_search_logic", lambda uid, q, limit: list(_PRIVATE_NEIGHBOURS))
    monkeypatch.setattr(search, "keyword_scan_cards", _no_keyword_hits)
    monkeypatch.setattr(search, "private_collection_ids", lambda uid: {"vault"})

    out = search.perform_hybrid_search("u1", "sourdough", limit=10)

    (prompt,) = models.prompts
    assert "fertility" not in prompt and "divorce" not in prompt
    assert "Sourdough basics" in prompt and "shared folder" in prompt
    assert [c["id"] for c in out] == ["pub"]


def test_failed_lookup_keeps_every_collection_member_from_the_judge(monkeypatch):
    models = _judge(monkeypatch)
    monkeypatch.setattr(search, "perform_search_logic", lambda uid, q, limit: list(_PRIVATE_NEIGHBOURS))
    monkeypatch.setattr(search, "keyword_scan_cards", _no_keyword_hits)
    monkeypatch.setattr(search, "private_collection_ids", lambda uid: None)

    search.perform_hybrid_search("u1", "sourdough", limit=10)

    (prompt,) = models.prompts
    assert "Sourdough basics" in prompt
    assert "shared folder" not in prompt and "divorce" not in prompt


def test_private_keyword_hits_never_reach_the_response(monkeypatch):
    monkeypatch.setattr(search, "judge_relevance", lambda q, c, **kw: None)
    monkeypatch.setattr(search, "perform_search_logic", lambda uid, q, limit: [])
    monkeypatch.setattr(search, "keyword_scan_cards",
                        lambda uid, q, exclude_ids=None, limit=10, fields=None: [
                            {"id": "pub", "title": "muffins", "createdAt": 1},
                            {"id": "flag", "title": "muffins", "isPrivate": True, "createdAt": 1},
                            {"id": "vault", "title": "muffins", "collectionIds": ["vault"], "createdAt": 1}])
    monkeypatch.setattr(search, "private_collection_ids", lambda uid: {"vault"})
    meta = {}
    out = search.perform_hybrid_search("u1", "muffins", limit=10, meta=meta)
    assert [c["id"] for c in out] == ["pub"]
    assert meta["private_ids"] == {"vault"}


def test_no_collection_member_means_no_lookup_read(monkeypatch):
    monkeypatch.setattr(search, "judge_relevance", lambda q, c, **kw: None)
    monkeypatch.setattr(search, "perform_search_logic",
                        lambda uid, q, limit: [_vres("pub", "Sourdough basics", 0.30)])
    monkeypatch.setattr(search, "keyword_scan_cards", _no_keyword_hits)
    monkeypatch.setattr(search, "private_collection_ids",
                        lambda uid: pytest.fail("read the collections with no member in sight"))
    meta = {}
    assert [c["id"] for c in search.perform_hybrid_search("u1", "sourdough", meta=meta)] == ["pub"]
    assert meta["private_ids"] == set()


def test_keyword_projection_carries_the_privacy_fields():
    # Without them a private card found by its words came back looking public.
    assert {"isPrivate", "collectionIds"} <= set(search.SEARCH_SCAN_FIELDS)


def test_search_twin_end_to_end_strips_before_the_judge(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    models = _judge(monkeypatch, reply='[{"n": 1, "evidence": "Sourdough basics"}]')
    monkeypatch.setattr(search, "perform_search_logic", lambda uid, q, limit: list(_PRIVATE_NEIGHBOURS))
    monkeypatch.setattr(search, "keyword_scan_cards", _no_keyword_hits)
    monkeypatch.setattr(search, "private_collection_ids", lambda uid: {"vault"})
    # The handler's own strip reuses the verdict the search read.
    monkeypatch.setattr(main, "private_collection_ids",
                        lambda uid: pytest.fail("second collections read"))

    resp = main.search_links_http(_Req(json_body={"query": "sourdough", "uid": "u1"}))

    assert resp.status == 200
    assert [c["id"] for c in json.loads(resp.body)["links"]] == ["pub"]
    assert "fertility" not in models.prompts[0] and "divorce" not in models.prompts[0]
