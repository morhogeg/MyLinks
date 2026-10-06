"""Privacy on the retrieval paths: what a private card may reach.

A card is effectively private when it carries `isPrivate` or sits in a private
(PIN-locked) collection. These tests pin the server half of that promise:

  - AI-19: a FAILED private-collection lookup must fail CLOSED. It used to
    return an empty set, which reads exactly like "no private collections", so
    one Firestore blip made every PIN-locked collection's cards public to Ask
    and search.

Offline: Firestore is faked at each module's boundary; Gemini never runs.
"""

import json

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
    monkeypatch.setattr(main, "keyword_scan_cards", lambda *a, **k: [])

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
