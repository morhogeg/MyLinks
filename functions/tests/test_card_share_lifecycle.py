"""Card share lifecycle + card-delete cleanup + empty-library Ask.

  * A card share is remembered on the card (`shareId`), can be stopped one at
    a time or all at once (Settings → Privacy), and the card-delete trigger
    takes the page down and removes the user's own stored images, never
    another user's.
  * "Hide image" survives into the public snapshot and wins over the
    screenshot-url fallback on /s and /c.
  * An Ask that retrieves nothing answers in the question's language and does
    not spend an ask.

Offline: a small in-memory Firestore stands in at the `get_db` boundary.
"""

import json

import pytest

import card_cleanup
import share_service
from ai_service import empty_library_answer


# ── In-memory Firestore ────────────────────────────────────────────────────

class _Snap:
    def __init__(self, ref, data):
        self.reference = ref
        self.id = ref.id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return None if self._data is None else dict(self._data)


def _get_path(data, dotted):
    cur = data
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


class _Query:
    def __init__(self, db, path, filters=None, lim=None):
        self.db, self.path, self.filters, self.lim = db, path, list(filters or []), lim

    def where(self, filter):
        return _Query(self.db, self.path, self.filters + [(filter.field_path, filter.op_string, filter.value)], self.lim)

    def limit(self, n):
        return _Query(self.db, self.path, self.filters, n)

    def _docs(self):
        prefix = self.path + "/"
        out = []
        for p, data in sorted(self.db.docs.items()):
            if not p.startswith(prefix) or "/" in p[len(prefix):]:
                continue
            ok = True
            for field, op, value in self.filters:
                actual = _get_path(data, field)
                if op == "==" and actual != value:
                    ok = False
                elif op == "array_contains" and not (isinstance(actual, list) and value in actual):
                    ok = False
            if ok:
                out.append(_Snap(_Doc(self.db, p), data))
        return out[: self.lim] if self.lim else out

    def get(self):
        return self._docs()

    def stream(self):
        return iter(self._docs())


class _Coll(_Query):
    def __init__(self, db, path):
        super().__init__(db, path)

    def document(self, doc_id):
        return _Doc(self.db, f"{self.path}/{doc_id}")


class _Doc:
    def __init__(self, db, path):
        self.db, self.path = db, path
        self.id = path.rsplit("/", 1)[1]

    def collection(self, name):
        return _Coll(self.db, f"{self.path}/{name}")

    def get(self):
        return _Snap(self, self.db.docs.get(self.path))

    def set(self, data, merge=False):
        if merge and self.path in self.db.docs:
            self.db.docs[self.path].update(data)
        else:
            self.db.docs[self.path] = dict(data)

    def delete(self):
        self.db.docs.pop(self.path, None)

    def update(self, data):
        if self.path not in self.db.docs:
            raise LookupError("404 No document to update")
        self.db.docs[self.path].update(data)


class _Batch:
    def __init__(self, db):
        self.db, self.ops = db, []

    def set(self, ref, data, merge=False):
        self.ops.append(lambda: ref.set(data, merge=merge))

    def delete(self, ref):
        self.ops.append(ref.delete)

    def update(self, ref, data):
        self.ops.append(lambda: ref.update(data))

    def commit(self):
        # All-or-nothing like Firestore.
        snapshot = {k: dict(v) for k, v in self.db.docs.items()}
        try:
            for op in self.ops:
                op()
        except Exception:
            self.db.docs = snapshot
            raise


class FakeDB:
    def __init__(self, docs):
        self.docs = {k: dict(v) for k, v in docs.items()}

    def collection(self, name):
        return _Coll(self, name)

    def batch(self):
        return _Batch(self)


class _Blob:
    def __init__(self, bucket, path):
        self.bucket, self.path = bucket, path

    def delete(self):
        if self.path not in self.bucket.objects:
            raise Exception("404 No such object")
        self.bucket.objects.discard(self.path)


class FakeBucket:
    name = "proj.appspot.com"

    def __init__(self, objects):
        self.objects = set(objects)

    def blob(self, path):
        return _Blob(self, path)

    def list_blobs(self, prefix=""):
        return [_Blob(self, p) for p in list(self.objects) if p.startswith(prefix)]


def _dl(path):
    from urllib.parse import quote
    return (f"https://firebasestorage.googleapis.com/v0/b/{FakeBucket.name}/o/"
            f"{quote(path, safe='')}?alt=media&token=t")


SHARE = "a" * 32
OTHER_SHARE = "b" * 32


@pytest.fixture
def env(monkeypatch):
    def make(docs, objects=()):
        db = FakeDB(docs)
        bucket = FakeBucket(objects)
        monkeypatch.setattr(share_service, "get_db", lambda: db)
        monkeypatch.setattr(card_cleanup, "get_db", lambda: db)
        import firebase_admin.storage as fb_storage
        monkeypatch.setattr(fb_storage, "bucket", lambda *a, **k: bucket)
        monkeypatch.setattr(share_service, "_generate_og_preview", lambda *a, **k: None)
        return db, bucket
    return make


# ── Publish remembers the share on the card; unpublish clears it ───────────

def test_card_publish_stores_share_id_on_the_card_and_unpublish_clears_it(env):
    db, _ = env({"users/u1": {}, "users/u1/links/c1": {"title": "T", "updatedAt": 5}})
    share_service._publish_share_logic(
        "u1", "card", SHARE, {"card": {"title": "T", "summary": "s", "url": "https://x.com"}},
        card={"id": "c1"})
    card = db.docs["users/u1/links/c1"]
    assert card["shareId"] == SHARE and card["sharePublishedAt"] > 0
    assert card["updatedAt"] == 5  # a share is not an owner edit
    assert db.docs[f"shared_owners/{SHARE}"]["ownerUid"] == "u1"

    # Re-share with the SAME id is a republish (update), not a second page.
    share_service._publish_share_logic(
        "u1", "card", SHARE, {"card": {"title": "T2", "summary": "s", "url": "https://x.com"}},
        card={"id": "c1"})
    assert db.docs[f"shared_cards/{SHARE}"]["card"]["title"] == "T2"

    share_service._unpublish_share_logic("u1", "card", SHARE, card_id="c1")
    assert f"shared_cards/{SHARE}" not in db.docs
    assert db.docs["users/u1/links/c1"]["shareId"] is None
    assert db.docs[f"shared_owners/{SHARE}"]["unpublishedAt"]


def test_card_flags_are_refused_on_other_share_types(env):
    env({"users/u1/links/c1": {}})
    with pytest.raises(ValueError):
        share_service._publish_share_logic("u1", "answer", SHARE, {"question": "q"}, card={"id": "c1"})


def test_stop_all_card_links_touches_only_this_owners_live_card_shares(env):
    db, _ = env({
        "users/u1/links/c1": {"shareId": SHARE},
        f"shared_cards/{SHARE}": {"card": {}},
        f"shared_owners/{SHARE}": {"ownerUid": "u1", "type": "card"},
        f"shared_collections/{'c' * 32}": {"cards": []},
        f"shared_owners/{'c' * 32}": {"ownerUid": "u1", "type": "collection"},
        f"shared_cards/{OTHER_SHARE}": {"card": {}},
        f"shared_owners/{OTHER_SHARE}": {"ownerUid": "u2", "type": "card"},
    })
    result = share_service._unpublish_all_card_shares_logic("u1")
    assert result == {"success": True, "stopped": 1}
    assert f"shared_cards/{SHARE}" not in db.docs
    assert db.docs["users/u1/links/c1"]["shareId"] is None
    assert f"shared_collections/{'c' * 32}" in db.docs  # collections untouched
    assert f"shared_cards/{OTHER_SHARE}" in db.docs      # other owner untouched
    # Idempotent: the tombstoned row is skipped on a second sweep.
    assert share_service._unpublish_all_card_shares_logic("u1")["stopped"] == 0


# ── Card-delete trigger ─────────────────────────────────────────────────────

def test_blob_path_only_accepts_the_owners_own_prefixes():
    keys = {"u1", "k1"}
    assert card_cleanup.blob_path_for(_dl("screenshots/k1/a.jpg"), FakeBucket.name, keys) == "screenshots/k1/a.jpg"
    assert card_cleanup.blob_path_for(_dl("post_thumbs/u1/t.jpg"), FakeBucket.name, keys) == "post_thumbs/u1/t.jpg"
    for bad in (_dl("screenshots/u2/a.jpg"),           # another user
                _dl("share_previews/k1/a.jpg"),        # not a card blob root
                _dl("screenshots/k1/../u2/a.jpg"),     # traversal / nesting
                _dl("screenshots/k1/x/a.jpg"),
                "https://cdn.example.com/screenshots/k1/a.jpg",
                _dl("screenshots/k1/a.jpg").replace(FakeBucket.name, "other.appspot.com")):
        assert card_cleanup.blob_path_for(bad, FakeBucket.name, keys) is None, bad


def test_delete_trigger_unpublishes_and_removes_only_unreferenced_own_blobs(env):
    shot = "screenshots/k1/shot.jpg"
    second = "screenshots/k1/two.jpg"
    thumb = "post_thumbs/k1/t.jpg"
    shared_blob = "screenshots/k1/shared.jpg"
    foreign = "screenshots/u2/evil.jpg"
    db, bucket = env({
        "users/u1": {"storageKey": "k1"},
        f"shared_cards/{SHARE}": {"card": {}},
        f"shared_owners/{SHARE}": {"ownerUid": "u1", "type": "card"},
        # Another remaining card still uses `shared_blob`.
        "users/u1/links/keep": {"imageUrls": [_dl(shared_blob)]},
    }, objects={shot, second, thumb, shared_blob, foreign})
    deleted_card = {
        "shareId": SHARE,
        "url": _dl(shot),
        "imageUrls": [_dl(shot), _dl(second), _dl(shared_blob), _dl(foreign)],
        "metadata": {"thumbnailUrl": _dl(thumb)},
    }
    report = card_cleanup.cleanup_deleted_card_logic("u1", "gone", deleted_card)
    assert report["unpublished"] is True
    assert f"shared_cards/{SHARE}" not in db.docs
    assert db.docs[f"shared_owners/{SHARE}"]["unpublishedAt"]  # tombstone kept
    assert bucket.objects == {shared_blob, foreign}
    assert report["deleted_blobs"] == 3 and report["kept_blobs"] == 1

    # Re-delivery: nothing left to do, nothing raises.
    again = card_cleanup.cleanup_deleted_card_logic("u1", "gone", deleted_card)
    assert again["unpublished"] is False and again["deleted_blobs"] == 0


def test_delete_trigger_never_unpublishes_someone_elses_share(env):
    db, _ = env({
        "users/u1": {},
        f"shared_cards/{SHARE}": {"card": {}},
        f"shared_owners/{SHARE}": {"ownerUid": "u2", "type": "card"},
    })
    report = card_cleanup.cleanup_deleted_card_logic("u1", "gone", {"shareId": SHARE})
    assert report["unpublished"] is False
    assert f"shared_cards/{SHARE}" in db.docs


def test_delete_trigger_stands_down_during_account_deletion(env):
    shot = "screenshots/u1/a.jpg"
    db, bucket = env({f"shared_owners/{SHARE}": {"ownerUid": "u1", "type": "card"}}, objects={shot})
    report = card_cleanup.cleanup_deleted_card_logic("u1", "gone", {"shareId": SHARE, "url": _dl(shot)})
    assert report["skipped"] == "no-user"
    assert "unpublishedAt" not in db.docs[f"shared_owners/{SHARE}"]  # no owner row re-created/touched
    assert shot in bucket.objects


# ── Hide image honored on the public snapshot ───────────────────────────────

def test_hidden_screenshot_is_not_published_or_rendered():
    card = share_service._sanitize_card_snapshot({
        "title": "Private screenshot", "summary": "s", "sourceType": "image",
        "url": "https://firebasestorage.googleapis.com/v0/b/x/o/screenshots%2Fk%2Fa.jpg",
        "thumbnailUrl": "https://img.example/a.jpg", "hideThumbnail": True,
    })
    assert card["hideThumbnail"] is True
    assert "url" not in card and "thumbnailUrl" not in card
    # Even an un-sanitized legacy snapshot honors the flag at render time.
    legacy = {"title": "t", "summary": "s", "sourceType": "image", "hideThumbnail": True,
              "url": "https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg"}
    assert share_service._card_thumb(legacy) is None
    html = share_service._render_shared_card(legacy, "https://x/s?id=1")
    assert 'class="hero"' not in html and "o/a.jpg" not in html
    col = share_service._render_shared_collection({"name": "n", "cards": [legacy]}, "https://x/c?id=1")
    assert "o/a.jpg" not in col


def test_collection_item_keeps_the_hide_flag():
    item = share_service._sanitize_card_snapshot(
        {"title": "t", "thumbnailUrl": "https://img/x.jpg", "hideThumbnail": True}, collection_item=True)
    assert item == {"title": "t", "hideThumbnail": True}


def test_share_page_wraps_long_unbroken_titles():
    html = share_service._render_shared_card({"title": "https://" + "a" * 300, "summary": "s"}, "https://x/s?id=1")
    assert "overflow-wrap:anywhere" in html


# ── Ask with nothing retrieved ──────────────────────────────────────────────

def test_empty_library_answer_follows_the_question_language():
    assert "couldn't find" in empty_library_answer("What about Rome?")
    he = empty_library_answer("מה שמרתי על רומא?")
    assert any("֐" <= ch <= "׿" for ch in he)
    assert empty_library_answer("Summarize", "Hebrew") == he


def test_ask_with_no_retrieved_cards_refunds_the_ask(monkeypatch):
    import main
    from tests.test_ask_followup_context import _Req, _Resp

    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "plan_for", lambda uid: "free")
    monkeypatch.setattr(main, "meter_quota", lambda *a, **k: {"ok": True, "remaining": 1, "used": 1, "limit": 2, "plan": "free"})
    monkeypatch.setattr(main, "perform_search_logic", lambda *a, **k: [])
    monkeypatch.setattr(main, "rerank_candidates", lambda q, c, top_k=10: list(c))
    monkeypatch.setattr(main, "keyword_scan_cards", lambda *a, **k: [])
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())
    refunds = []
    monkeypatch.setattr(main, "refund_quota", lambda *a: refunds.append(a))

    class _Gemini:
        def answer_from_context(self, question, cards, history=None, **kwargs):
            assert cards == []
            return {"answer": empty_library_answer(question), "citedIds": [], "ungrounded": False}

    monkeypatch.setattr(main, "GeminiService", _Gemini)
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "מה שמרתי על רומא?"}))
    assert resp.status == 200
    assert refunds == [("u1", "asks")]
    body = json.loads(resp.body)
    assert any("֐" <= ch <= "׿" for ch in body["answer"])


# ── "Update public link" never revives a stopped share ──────────────────────

def test_update_public_link_never_revives_a_share_stopped_elsewhere(env):
    db, _ = env({"users/u1": {}, "users/u1/links/c1": {"title": "T"}})
    payload = {"card": {"title": "T", "summary": "s", "url": "https://x.com"}}
    share_service._publish_share_logic("u1", "card", SHARE, payload, card={"id": "c1"})
    # A live page updates in place.
    share_service._publish_share_logic("u1", "card", SHARE, payload, card={"id": "c1"}, update_only=True)
    assert f"shared_cards/{SHARE}" in db.docs

    # Stopped on another device; this device still shows the old shareId.
    share_service._unpublish_share_logic("u1", "card", SHARE, card_id="c1")
    with pytest.raises(LookupError):
        share_service._publish_share_logic("u1", "card", SHARE, payload, card={"id": "c1"}, update_only=True)
    assert f"shared_cards/{SHARE}" not in db.docs
    assert db.docs["users/u1/links/c1"]["shareId"] is None

    # An explicit re-share is still allowed (the owner keeps the id).
    share_service._publish_share_logic("u1", "card", SHARE, payload, card={"id": "c1"})
    assert f"shared_cards/{SHARE}" in db.docs


# ── Account deletion: the per-card trigger stands down ──────────────────────

def test_delete_trigger_stands_down_while_the_account_is_being_deleted(env):
    shot = "screenshots/u1/a.jpg"
    db, bucket = env({
        "users/u1": {"deleting": True},
        f"shared_cards/{SHARE}": {"card": {}},
        f"shared_owners/{SHARE}": {"ownerUid": "u1", "type": "card"},
    }, objects={shot})
    report = card_cleanup.cleanup_deleted_card_logic("u1", "gone", {"shareId": SHARE, "url": _dl(shot)})
    assert report["skipped"] == "user-deleting"
    assert "unpublishedAt" not in db.docs[f"shared_owners/{SHARE}"]
    assert shot in bucket.objects


def test_account_deletion_flags_the_workspace_before_deleting_cards(monkeypatch):
    from unittest.mock import MagicMock
    import link_service
    db = MagicMock()
    monkeypatch.setattr(link_service, "get_db", lambda: db)
    monkeypatch.setattr(link_service, "delete_shares_for_owner", lambda uid: 0)
    link_service.delete_user_data("u1")
    user_ref = db.collection.return_value.document.return_value
    names = [c[0] for c in user_ref.mock_calls]
    assert names[0] == "update" and user_ref.mock_calls[0].args == ({"deleting": True},)
    assert names.index("update") < names.index("collection")
