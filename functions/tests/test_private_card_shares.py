"""A private card never has a live public page.

Making a card Private (its own flag, or by joining a private collection)
wrote only `isPrivate` on the card; nothing server-side reacted. Its /s page
kept rendering the snapshot, and the publish endpoint would happily publish a
private card in the first place. Now:

  * `_publish_share_logic` refuses an effectively-private card (and a private
    collection), before anything is written or any preview is generated, and
    records the card id on the functions-only owner row.
  * `share_page` checks the card behind a /s snapshot on every render and
    serves the not-found page (no-store) when it is now private or deleted.
  * Both checks fail CLOSED: a read error counts as private.

Offline: an in-memory Firestore double at share_service.get_db / main.get_db.
"""

import types

import pytest

import main
import share_service

SID = "c" * 32
OWNER = "+15551234567"


# ── In-memory Firestore ──────────────────────────────────────────────────────

class _Snap:
    def __init__(self, ref, data):
        self.reference = ref
        self.id = ref.id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return None if self._data is None else dict(self._data)


def _project(data, field_paths):
    if data is None or field_paths is None:
        return data
    return {k: v for k, v in data.items() if k in field_paths}


class _Query:
    def __init__(self, db, path, filters=(), lim=None, fields=None):
        self.db, self.path, self.filters, self.lim, self.fields = db, path, list(filters), lim, fields

    def where(self, filter):
        return _Query(self.db, self.path, self.filters + [(filter.field_path, filter.op_string, filter.value)],
                      self.lim, self.fields)

    def limit(self, n):
        return _Query(self.db, self.path, self.filters, n, self.fields)

    def select(self, fields):
        return _Query(self.db, self.path, self.filters, self.lim, list(fields))

    def get(self):
        self.db.reads.append(self.path)
        if self.db.fail_queries_under and self.path.endswith(self.db.fail_queries_under):
            raise RuntimeError("Firestore unavailable")
        prefix = self.path + "/"
        out = []
        for p, data in sorted(self.db.docs.items()):
            if not p.startswith(prefix) or "/" in p[len(prefix):]:
                continue
            ok = True
            for field, op, value in self.filters:
                actual = data.get(field)
                if op == "==" and actual != value:
                    ok = False
                elif op == "array_contains" and not (isinstance(actual, list) and value in actual):
                    ok = False
            if ok:
                out.append(_Snap(_Doc(self.db, p), _project(data, self.fields)))
        return out[: self.lim] if self.lim else out

    def stream(self):
        return iter(self.get())


class _Coll(_Query):
    def document(self, doc_id):
        return _Doc(self.db, f"{self.path}/{doc_id}")


class _Doc:
    def __init__(self, db, path):
        self.db, self.path = db, path
        self.id = path.rsplit("/", 1)[1]

    def collection(self, name):
        return _Coll(self.db, f"{self.path}/{name}")

    def get(self, field_paths=None, transaction=None):
        self.db.reads.append(self.path)
        if self.db.fail_docs_under and self.path.startswith(self.db.fail_docs_under):
            raise RuntimeError("Firestore unavailable")
        return _Snap(self, _project(self.db.docs.get(self.path), field_paths))

    def set(self, data, merge=False):
        if merge and self.path in self.db.docs:
            self.db.docs[self.path].update(data)
        else:
            self.db.docs[self.path] = dict(data)

    def delete(self):
        self.db.docs.pop(self.path, None)


class _Batch:
    def __init__(self, db):
        self.db, self.ops = db, []

    def set(self, ref, data, merge=False):
        self.ops.append(lambda: ref.set(data, merge=merge))

    def delete(self, ref):
        self.ops.append(ref.delete)

    def commit(self):
        for op in self.ops:
            op()


class FakeDB:
    def __init__(self, docs):
        self.docs = {k: dict(v) for k, v in docs.items()}
        self.reads = []
        self.fail_queries_under = None
        self.fail_docs_under = None

    def collection(self, name):
        return _Coll(self, name)

    def batch(self):
        return _Batch(self)


@pytest.fixture
def env(monkeypatch):
    previews = []

    def make(docs):
        db = FakeDB(docs)
        monkeypatch.setattr(share_service, "get_db", lambda: db)
        monkeypatch.setattr(main, "get_db", lambda: db)
        monkeypatch.setattr(share_service, "_generate_og_preview",
                            lambda *a, **k: previews.append(a) or None)
        monkeypatch.setattr(share_service, "_delete_share_previews", lambda sid: None)
        db.previews = previews
        return db
    return make


def _card(**extra):
    return {"title": "Notes on my diagnosis", "summary": "Private stuff", "url": "https://e.com/x", **extra}


def _publish(card_id="c1", uid=OWNER):
    return share_service._publish_share_logic(
        uid, "card", SID, {"card": {"title": "Notes on my diagnosis", "summary": "Private stuff"}},
        card={"id": card_id})


def _page(path="/s", share_id=SID):
    return main.share_page(types.SimpleNamespace(args={"id": share_id}, path=path))


# ── Publish refuses a private card ───────────────────────────────────────────

def test_publishing_a_private_card_is_refused_before_anything_is_written(env):
    db = env({f"users/{OWNER}": {}, f"users/{OWNER}/links/c1": _card(isPrivate=True)})
    with pytest.raises(PermissionError) as exc:
        _publish()
    assert "private" in str(exc.value).lower()
    assert f"shared_cards/{SID}" not in db.docs
    assert f"shared_owners/{SID}" not in db.docs
    assert "shareId" not in db.docs[f"users/{OWNER}/links/c1"]
    assert db.previews == []            # no preview image uploaded either


def test_publishing_a_card_in_a_private_collection_is_refused(env):
    db = env({
        f"users/{OWNER}": {},
        f"users/{OWNER}/collections/health": {"name": "Health", "isPrivate": True},
        f"users/{OWNER}/collections/reads": {"name": "Reads"},
        f"users/{OWNER}/links/c1": _card(collectionIds=["reads", "health"]),
    })
    with pytest.raises(PermissionError):
        _publish()
    assert f"shared_cards/{SID}" not in db.docs


def test_publishing_fails_closed_when_privacy_cannot_be_read(env):
    db = env({
        f"users/{OWNER}": {},
        f"users/{OWNER}/collections/reads": {"name": "Reads"},
        f"users/{OWNER}/links/c1": _card(collectionIds=["reads"]),
    })
    db.fail_queries_under = "/collections"
    with pytest.raises(Exception):
        _publish()
    assert f"shared_cards/{SID}" not in db.docs


def test_a_card_in_ordinary_collections_still_publishes_and_the_owner_row_names_it(env):
    db = env({
        f"users/{OWNER}": {},
        f"users/{OWNER}/collections/reads": {"name": "Reads"},
        f"users/{OWNER}/links/c1": _card(collectionIds=["reads"]),
    })
    assert _publish() == {"shareId": SID}
    assert db.docs[f"shared_cards/{SID}"]["card"]["title"] == "Notes on my diagnosis"
    assert db.docs[f"shared_owners/{SID}"]["cardId"] == "c1"
    assert db.docs[f"users/{OWNER}/links/c1"]["shareId"] == SID


def test_publishing_a_private_collection_is_refused(env):
    db = env({f"users/{OWNER}": {}, f"users/{OWNER}/collections/health": {"name": "Health", "isPrivate": True}})
    with pytest.raises(PermissionError):
        share_service._publish_share_logic(OWNER, "collection", SID, {"name": "Health", "cards": []},
                                           collection={"id": "health"})
    assert f"shared_collections/{SID}" not in db.docs


# ── share_page hides a card that is now private or gone ─────────────────────

def _shared(extra_card=None, owner_row=None):
    docs = {
        f"users/{OWNER}": {},
        f"users/{OWNER}/collections/health": {"name": "Health", "isPrivate": True},
        f"users/{OWNER}/collections/reads": {"name": "Reads"},
        f"shared_cards/{SID}": {"shareId": SID, "card": {"title": "Notes on my diagnosis"}, "publishedAt": 1},
        f"shared_owners/{SID}": owner_row or {"ownerUid": OWNER, "type": "card", "publishedAt": 1, "cardId": "c1"},
    }
    if extra_card is not None:
        docs[f"users/{OWNER}/links/c1"] = extra_card
    return docs


def _not_found(resp):
    return (resp.status_code == 404 and resp.headers["Cache-Control"] == "no-store"
            and "Notes on my diagnosis" not in resp.get_data(as_text=True))


def test_a_live_card_still_renders_with_the_short_public_cache(env):
    env(_shared(_card(shareId=SID, collectionIds=["reads"])))
    resp = _page()
    assert resp.status_code == 200
    assert resp.headers["Cache-Control"] == "public, max-age=60, s-maxage=60"
    assert "Notes on my diagnosis" in resp.get_data(as_text=True)


def test_a_card_made_private_after_sharing_is_not_found(env):
    env(_shared(_card(shareId=SID, isPrivate=True)))
    assert _not_found(_page())


def test_a_card_moved_into_a_private_collection_is_not_found(env):
    env(_shared(_card(shareId=SID, collectionIds=["reads", "health"])))
    assert _not_found(_page())


def test_a_deleted_card_is_not_found_even_if_its_snapshot_survived(env):
    env(_shared(extra_card=None))
    assert _not_found(_page())


def test_an_owner_row_from_before_the_card_pointer_falls_back_to_the_cards_shareid(env):
    row = {"ownerUid": OWNER, "type": "card", "publishedAt": 1}
    env(_shared(_card(shareId=SID, isPrivate=True), owner_row=row))
    assert _not_found(_page())
    env(_shared(_card(shareId=SID), owner_row=row))
    assert _page().status_code == 200


def test_a_legacy_share_with_no_pointer_either_way_renders_as_before(env):
    """Shares published before cards remembered their shareId can't be tied
    to a card at all; they keep rendering (documented gap)."""
    row = {"ownerUid": OWNER, "type": "card", "publishedAt": 1}
    env(_shared(_card(isPrivate=True), owner_row=row))   # card has no shareId
    assert _page().status_code == 200


def test_a_stopped_share_whose_snapshot_lingered_is_not_found(env):
    row = {"ownerUid": OWNER, "type": "card", "publishedAt": 1, "unpublishedAt": 2, "cardId": "c1"}
    env(_shared(_card(), owner_row=row))
    assert _not_found(_page())


def test_the_privacy_check_fails_closed(env):
    db = env(_shared(_card(shareId=SID, collectionIds=["reads"])))
    db.fail_queries_under = "/collections"
    assert _not_found(_page())
    db.fail_queries_under = None
    db.fail_docs_under = "shared_owners/"
    assert _not_found(_page())


def test_collection_and_answer_pages_are_unaffected(env):
    db = env({
        f"shared_collections/{SID}": {"shareId": SID, "name": "Reads", "cards": [{"title": "A"}], "publishedAt": 1},
        f"shared_answers/{SID}": {"shareId": SID, "question": "Q?", "answer": "A.", "sources": [], "publishedAt": 1},
    })
    assert _page("/c").status_code == 200
    assert _page("/a").status_code == 200
    assert not any(p.startswith("shared_owners") for p in db.reads)
