"""Regression tests for the 2026-09-16 pre-launch security pass.

Each block pins one fix in `main.py` / `link_service.py` / `share_service.py`:

  - workspace resolver: an auth uid linked to two workspaces resolves to its
    OWN doc, never to whichever doc Firestore ordered first;
  - share_ingest pre-body gate: a random `X-Ingest-Token` can no longer mint
    an unbounded number of `rate_limits` docs (malformed → refused before the
    limiter; well-formed-but-unknown → charged to the IP bucket);
  - stored image Content-Type is allowlisted (no `text/html` at a public URL);
  - malformed / non-object JSON bodies are 400s, not 500s;
  - callable rate limits raise the callable error shape;
  - share ids are single path segments;
  - account deletion sweeps every subcollection, the per-uid server state,
    and the user's public shares.

Offline: Firestore is faked at the `get_db` boundary.
"""

import json

import pytest

import main
import link_service
import share_service


# ── fakes ────────────────────────────────────────────────────────────────────

class _Resp:
    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    def __init__(self, method="POST", json_body=None, headers=None, remote_addr="1.2.3.4",
                 raise_on_json=False):
        self.method = method
        self._json = json_body
        self.headers = headers or {}
        self.remote_addr = remote_addr
        self._raise = raise_on_json

    def get_json(self, silent=False):
        if self._raise:
            if silent:
                return None
            raise ValueError("bad json")
        return self._json


class _Doc:
    def __init__(self, id, data):
        self.id = id
        self._data = data
        self.exists = True

    def to_dict(self):
        return dict(self._data)


@pytest.fixture(autouse=True)
def _harness(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "REQUIRE_AUTH", True)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)


# ── workspace resolver ───────────────────────────────────────────────────────

class _UsersQuery:
    def __init__(self, docs):
        self._docs = docs

    def where(self, **kw):
        return self

    def limit(self, n):
        self._n = n
        return self

    def get(self):
        return self._docs[: self._n]


class _ResolverDb:
    def __init__(self, docs):
        self._docs = docs

    def collection(self, name):
        assert name == "users"
        return _UsersQuery(self._docs)


def test_resolver_prefers_the_accounts_own_workspace_when_two_match(monkeypatch):
    """Attacker doc `aaa` lists victim `zzz` in authUids and sorts FIRST."""
    docs = [_Doc("aaa", {"authUids": ["zzz"]}), _Doc("zzz", {"authUids": ["zzz"]})]
    monkeypatch.setattr(link_service, "get_db", lambda: _ResolverDb(docs))
    assert link_service.find_data_uid_by_auth_uid("zzz") == "zzz"


def test_resolver_single_match_is_unchanged(monkeypatch):
    docs = [_Doc("+15551234567", {"authUids": ["google-uid"]})]
    monkeypatch.setattr(link_service, "get_db", lambda: _ResolverDb(docs))
    assert link_service.find_data_uid_by_auth_uid("google-uid") == "+15551234567"


def test_resolver_legacy_phone_doc_still_wins_by_order(monkeypatch):
    """A phone-keyed workspace with no own-uid doc keeps resolving as before
    (no lockout regression); the ambiguity is only logged."""
    docs = [_Doc("+15551234567", {"authUids": ["g"]}), _Doc("other", {"authUids": ["g"]})]
    monkeypatch.setattr(link_service, "get_db", lambda: _ResolverDb(docs))
    assert link_service.find_data_uid_by_auth_uid("g") == "+15551234567"


def test_resolver_queries_two_so_ambiguity_is_visible(monkeypatch):
    q = _UsersQuery([_Doc("zzz", {"authUids": ["zzz"]})])

    class Db:
        def collection(self, name):
            return q

    monkeypatch.setattr(link_service, "get_db", lambda: Db())
    link_service.find_data_uid_by_auth_uid("zzz")
    assert q._n == 2


# ── share_ingest pre-body gate ───────────────────────────────────────────────

def _record_buckets(monkeypatch):
    seen = []

    def _check(key, limit, window, fail_open=False):
        seen.append(key)
        return True

    monkeypatch.setattr(main, "check_rate_limit", _check)
    return seen


def test_malformed_ingest_token_never_reaches_the_limiter(monkeypatch):
    seen = _record_buckets(monkeypatch)
    monkeypatch.setattr(main, "find_user_by_ingest_token",
                        lambda t: pytest.fail("lookup ran for a malformed token"))
    resp = main.share_ingest(_Req(headers={"X-Ingest-Token": "not a token!!"},
                                  json_body={"url": "https://x.com"}))
    assert resp.status == 403
    assert seen == []


def test_unknown_but_well_formed_token_is_charged_to_the_ip_bucket(monkeypatch):
    seen = _record_buckets(monkeypatch)
    monkeypatch.setattr(main, "find_user_by_ingest_token", lambda t: None)
    resp = main.share_ingest(_Req(headers={"X-Ingest-Token": "A" * 32},
                                  json_body={"url": "https://x.com"}))
    assert resp.status == 403
    # One bucket, keyed on the caller's IP — not a fresh per-token doc.
    assert seen == ["share:ip:1.2.3.4"]


def test_valid_token_keeps_its_private_hash_bucket_plus_the_uid_bucket(monkeypatch):
    seen = _record_buckets(monkeypatch)
    monkeypatch.setattr(main, "find_user_by_ingest_token", lambda t: "ws-1")
    # Stop after auth: an empty body is rejected before any queue write.
    resp = main.share_ingest(_Req(headers={"X-Ingest-Token": "B" * 32}, json_body={}))
    assert resp.status == 400
    assert seen[0].startswith("share:tok:")
    assert "share-uid:ws-1" in seen


def test_non_object_json_body_is_a_400(monkeypatch):
    _record_buckets(monkeypatch)
    monkeypatch.setattr(main, "find_user_by_ingest_token", lambda t: "ws-1")
    resp = main.share_ingest(_Req(headers={"X-Ingest-Token": "C" * 32}, json_body=["array"]))
    assert resp.status == 400


# ── image Content-Type allowlist ─────────────────────────────────────────────

@pytest.mark.parametrize("value,expected", [
    ("image/png", "image/png"),
    ("IMAGE/JPEG; charset=binary", "image/jpeg"),
    ("image/jpg", "image/jpeg"),
    ("image/webp", "image/webp"),
    ("text/html", "image/jpeg"),
    ("image/svg+xml", "image/jpeg"),  # scriptable → never stored as such
    ("application/octet-stream", "image/jpeg"),
    (None, "image/jpeg"),
    (123, "image/jpeg"),
    ({"a": 1}, "image/jpeg"),
])
def test_stored_image_mime_is_allowlisted(value, expected):
    assert main._safe_image_mime(value) == expected


# ── malformed JSON → 400 ─────────────────────────────────────────────────────

def test_json_object_helper_survives_bad_bodies():
    assert main._json_object(_Req(raise_on_json=True)) == {}
    assert main._json_object(_Req(json_body=[1, 2])) == {}
    assert main._json_object(_Req(json_body="str")) == {}
    assert main._json_object(_Req(json_body={"a": 1})) == {"a": 1}


def test_analyze_link_rejects_malformed_json_with_400(monkeypatch):
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    resp = main.analyze_link(_Req(raise_on_json=True))
    assert resp.status == 400


def test_analyze_link_rejects_non_string_url_with_400(monkeypatch):
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    resp = main.analyze_link(_Req(json_body={"url": ["https://x.com"]}))
    assert resp.status == 400


def test_ask_brain_rejects_array_body_with_400(monkeypatch):
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    resp = main.ask_brain(_Req(json_body=[{"question": "x"}]))
    assert resp.status == 400


# ── callable rate limits ─────────────────────────────────────────────────────

def test_callable_rate_limit_raises_resource_exhausted(monkeypatch):
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: False)
    with pytest.raises(main.https_fn.HttpsError):
        main._callable_rate_limited("rebuild-uid", "ws-1")


def test_callable_rate_limit_passes_when_allowed(monkeypatch):
    keys = []
    monkeypatch.setattr(main, "check_rate_limit", lambda k, *a, **kw: keys.append(k) or True)
    main._callable_rate_limited("digest-now-uid", "ws-1")
    assert keys == ["digest-now-uid:ws-1"]


def test_paid_callables_have_fail_closed_buckets():
    for bucket in ("rebuild-uid", "digest-now-uid"):
        limit, window, fail_open = main._RATE_LIMITS[bucket]
        assert limit > 0 and window > 0 and fail_open is False


# ── share ids ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("bad", ["a/b", "", None, 12, "a" * 200, "id with space", "../x", "a.b"])
def test_share_id_must_be_one_path_segment(bad):
    assert share_service._valid_share_id(bad) is False
    with pytest.raises(ValueError):
        share_service._publish_share_logic("u", "card", bad, {"title": "t"})
    with pytest.raises(ValueError):
        share_service._unpublish_share_logic("u", "card", bad)


def test_client_shaped_share_ids_are_accepted():
    assert share_service._valid_share_id("3f2a9c1d4e5b6a7f8c9d0e1f2a3b4c5d")
    assert share_service._valid_share_id("3f2a9c1d-4e5b-6a7f-8c9d-0e1f2a3b4c5d")


# ── account deletion sweep ───────────────────────────────────────────────────

class _SweepDoc:
    def __init__(self, coll, id, data, log):
        self.id = id
        self._data = data
        self.reference = self
        self.exists = True
        self._log = log
        self._coll = coll

    def to_dict(self):
        return dict(self._data)

    def delete(self):
        self._log.append(f"{self._coll}/{self.id}")

    def get(self):
        return self


class _SweepColl:
    def __init__(self, name, docs, log):
        self._name = name
        self._docs = docs
        self._log = log

    def where(self, **kw):
        return self

    def stream(self):
        return list(self._docs)

    def document(self, id):
        for d in self._docs:
            if d.id == id:
                return d
        missing = _SweepDoc(self._name, id, {}, self._log)
        missing.exists = False
        return missing


class _SweepUserDoc(_SweepDoc):
    def __init__(self, subs, log):
        super().__init__("users", "ws-1", {}, log)
        self._subs = subs

    def collection(self, name):
        return _SweepColl(f"users/ws-1/{name}", self._subs.get(name, []), self._log)


class _SweepDb:
    def __init__(self, log):
        self.log = log
        self.subs = {
            name: [_SweepDoc(f"users/ws-1/{name}", "d1", {}, log)]
            for name in link_service.USER_SUBCOLLECTIONS
        }
        self.top = {
            "pending_processing": [_SweepDoc("pending_processing", "p1", {"uid": "ws-1"}, log)],
            "task_logs": [_SweepDoc("task_logs", "t1", {}, log)],
            "entitlements": [_SweepDoc("entitlements", "ws-1", {}, log)],
            "usage_quotas": [_SweepDoc("usage_quotas", "ws-1", {}, log)],
            "synthesis_vault": [_SweepDoc("synthesis_vault", "ws-1__2026-W30", {"uid": "ws-1"}, log)],
            "shared_owners": [
                _SweepDoc("shared_owners", "share-a", {"ownerUid": "ws-1", "type": "card"}, log),
                _SweepDoc("shared_owners", "share-b", {"ownerUid": "ws-1", "type": "answer"}, log),
            ],
            "shared_cards": [_SweepDoc("shared_cards", "share-a", {}, log)],
            "shared_answers": [_SweepDoc("shared_answers", "share-b", {}, log)],
            "shared_collections": [],
        }

    def collection(self, name):
        if name == "users":
            user = _SweepUserDoc(self.subs, self.log)

            class _Users:
                def document(self_inner, id):
                    return user
            return _Users()
        return _SweepColl(name, self.top.get(name, []), self.log)


def test_delete_user_data_sweeps_everything(monkeypatch):
    log = []
    db = _SweepDb(log)
    monkeypatch.setattr(link_service, "get_db", lambda: db)
    monkeypatch.setattr(share_service, "_delete_share_previews", lambda sid: log.append(f"previews/{sid}"))

    link_service.delete_user_data("ws-1")

    for sub in ("links", "chats", "collections", "syntheses", "synthesisNotes",
                "digests", "analytics_events", "client_errors"):
        assert f"users/ws-1/{sub}/d1" in log, sub
    for path in ("pending_processing/p1", "task_logs/t1", "entitlements/ws-1",
                 "usage_quotas/ws-1", "synthesis_vault/ws-1__2026-W30",
                 "shared_cards/share-a", "shared_answers/share-b",
                 "shared_owners/share-a", "shared_owners/share-b",
                 "previews/share-a", "previews/share-b", "users/ws-1"):
        assert path in log, path


def test_subcollection_list_matches_the_rules_file():
    """Every client-facing `match /users/{uid}/<sub>/` in firestore.rules must be
    swept on account deletion."""
    import re
    from pathlib import Path
    rules = (Path(__file__).resolve().parents[2] / "firestore.rules").read_text()
    in_rules = set(re.findall(r"match /(\w+)/\{\w+\} \{", rules.split("match /users/{uid}", 1)[1].split("match /shared_collections", 1)[0]))
    assert in_rules <= set(link_service.USER_SUBCOLLECTIONS), in_rules - set(link_service.USER_SUBCOLLECTIONS)
