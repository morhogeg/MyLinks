"""The deprecated `search_links` callable keeps the HTTP twin's guards (AI-18).

No client calls it any more (web and native use search_links_http), but it is
still deployed, so anyone with a token could reach a path that skipped every
guard the twin has: no query type/length check, no limit clamp, no App Check,
no private strip. These tests drive the undecorated handler with a
CallableRequest-shaped stand-in.
"""

from types import SimpleNamespace

import pytest

import main
import search
from tests.test_search_http import _Req, _Resp

def _innermost(fn):
    """The real package stacks two wrappers (flask_cors, then on_call); the
    offline stub sets `__wrapped__` to the function itself. Follow the chain
    to the handler body either way."""
    while getattr(fn, "__wrapped__", fn) is not fn:
        fn = fn.__wrapped__
    return fn


_handler = _innermost(search.search_links)
HttpsError = search.https_fn.HttpsError
Code = search.https_fn.FunctionsErrorCode


@pytest.fixture(autouse=True)
def _soft_posture(monkeypatch):
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)


def _call(data, app=None):
    return _handler(SimpleNamespace(auth=None, data=data, app=app))


def _capture_search(monkeypatch):
    seen = {}

    def fake(uid, query_text, limit=20, meta=None):
        seen.update(uid=uid, query=query_text, limit=limit)
        return [{"id": "a"}]

    monkeypatch.setattr(search, "perform_hybrid_search", fake)
    return seen


@pytest.mark.parametrize("query", [None, "", "   ", 42, ["dogs"], {"q": "dogs"}])
def test_query_must_be_a_non_empty_string(monkeypatch, query):
    _capture_search(monkeypatch)
    with pytest.raises(HttpsError) as err:
        _call({"uid": "u1", "query": query})
    assert err.value.code == Code.INVALID_ARGUMENT


def test_query_length_is_capped_like_the_twin(monkeypatch):
    _capture_search(monkeypatch)
    with pytest.raises(HttpsError) as err:
        _call({"uid": "u1", "query": "x" * (main.MAX_QUESTION_LENGTH + 1)})
    assert err.value.code == Code.INVALID_ARGUMENT


@pytest.mark.parametrize("raw, expected", [
    (10_000, 50), (0, 1), (-5, 1), ("7", 7), ("lots", 10), (None, 10),
    (float("inf"), 10), (float("nan"), 10), ({"n": 3}, 10),
])
def test_limit_is_clamped(monkeypatch, raw, expected):
    seen = _capture_search(monkeypatch)
    assert _call({"uid": "u1", "query": "  dogs ", "limit": raw}) == {"links": [{"id": "a"}]}
    assert seen == {"uid": "u1", "query": "dogs", "limit": expected}


def test_app_check_is_enforced_when_the_flag_is_on(monkeypatch):
    _capture_search(monkeypatch)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", True)
    with pytest.raises(HttpsError) as err:
        _call({"uid": "u1", "query": "dogs"}, app=None)
    assert err.value.code == Code.UNAUTHENTICATED
    # A verified App Check token (the transport sets req.app) passes.
    assert _call({"uid": "u1", "query": "dogs"}, app=SimpleNamespace(app_id="x"))["links"]


def test_private_cards_never_leave_the_callable(monkeypatch):
    monkeypatch.setattr(search, "judge_relevance", lambda q, c, **kw: None)
    monkeypatch.setattr(search, "perform_search_logic", lambda uid, q, limit: [])
    monkeypatch.setattr(search, "keyword_scan_cards",
                        lambda uid, q, exclude_ids=None, limit=10, fields=None: [
                            {"id": "pub", "title": "dogs", "createdAt": 1},
                            {"id": "flag", "title": "dogs", "isPrivate": True, "createdAt": 1},
                            {"id": "vault", "title": "dogs", "collectionIds": ["vault"], "createdAt": 1}])
    monkeypatch.setattr(search, "private_collection_ids", lambda uid: {"vault"})
    assert [c["id"] for c in _call({"uid": "u1", "query": "dogs"})["links"]] == ["pub"]


def test_twin_rejects_a_non_string_query_with_400(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "perform_hybrid_search",
                        lambda *a, **k: pytest.fail("searched a non-string query"))
    resp = main.search_links_http(_Req(json_body={"query": ["dogs"], "uid": "u1"}))
    assert resp.status == 400


def test_clamp_helper_matches_the_twin():
    assert search.clamp_search_limit(25) == 25
    assert search.clamp_search_limit("x") == 10
    assert search.clamp_search_limit(float("inf")) == 10
