"""_publish_share_logic / _unpublish_share_logic — ownership and write-order.

Offline: a tiny fake at the share_service.get_db boundary records writes in
order. Pins the anti-takeover contract: the functions-only shared_owners
mapping is the source of truth, and it is written BEFORE the public snapshot
so a crash between the two writes can never leave a claimable, ownerless
public share.
"""

import pytest

import share_service as ss


class _FakeDoc:
    def __init__(self, db, coll, doc_id):
        self._db, self._coll, self._id = db, coll, doc_id

    def get(self):
        data = self._db.store.get(self._coll, {}).get(self._id)

        class Snap:
            exists = data is not None

            def to_dict(self_inner):
                return dict(data) if data else None
        return Snap()

    def set(self, payload):
        if (self._coll, self._id) in self._db.fail_on_set:
            raise RuntimeError("simulated write failure")
        self._db.store.setdefault(self._coll, {})[self._id] = dict(payload)
        self._db.write_log.append((self._coll, self._id))

    def delete(self):
        self._db.store.get(self._coll, {}).pop(self._id, None)
        self._db.write_log.append(("DELETE:" + self._coll, self._id))


class _FakeDB:
    def __init__(self):
        self.store = {}
        self.write_log = []
        self.fail_on_set = set()

    def collection(self, name):
        db = self

        class Coll:
            def document(self, doc_id):
                return _FakeDoc(db, name, doc_id)
        return Coll()


@pytest.fixture
def db(monkeypatch):
    fake = _FakeDB()
    monkeypatch.setattr(ss, "get_db", lambda: fake)
    return fake


def test_publish_writes_ownership_before_snapshot(db):
    ss._publish_share_logic("owner-1", "card", "share-a", {"title": "T"})
    colls = [c for c, _ in db.write_log]
    assert colls.index("shared_owners") < colls.index("shared_cards")
    # And the public doc never carries ownerUid.
    assert "ownerUid" not in db.store["shared_cards"]["share-a"]


def test_partial_publish_leaves_no_claimable_share(db):
    # The snapshot write fails AFTER ownership is recorded: the id must remain
    # owned, so another account can neither claim nor overwrite it. (With the
    # old snapshot-first order, the failure window left an ownerless public
    # doc that any uid could take over.)
    db.fail_on_set.add(("shared_cards", "share-a"))
    with pytest.raises(RuntimeError):
        ss._publish_share_logic("owner-1", "card", "share-a", {"title": "T"})

    db.fail_on_set.clear()
    with pytest.raises(PermissionError):
        ss._publish_share_logic("attacker", "card", "share-a", {"title": "Mine now"})
    # The rightful owner's retry succeeds.
    ss._publish_share_logic("owner-1", "card", "share-a", {"title": "T"})
    assert db.store["shared_cards"]["share-a"]["title"] == "T"


def test_publish_rejects_foreign_overwrite(db):
    ss._publish_share_logic("owner-1", "card", "share-a", {"title": "T"})
    with pytest.raises(PermissionError):
        ss._publish_share_logic("owner-2", "card", "share-a", {"title": "X"})


def test_unpublish_requires_ownership(db):
    ss._publish_share_logic("owner-1", "collection", "col-1", {"name": "N"})
    with pytest.raises(PermissionError):
        ss._unpublish_share_logic("owner-2", "collection", "col-1")
    ss._unpublish_share_logic("owner-1", "collection", "col-1")
    assert "col-1" not in db.store.get("shared_collections", {})


def test_publish_validates_inputs(db):
    with pytest.raises(ValueError):
        ss._publish_share_logic("u", "bogus-type", "id", {})
    with pytest.raises(ValueError):
        ss._publish_share_logic("u", "card", "", {})
    with pytest.raises(ValueError):
        ss._publish_share_logic("u", "card", "id", "not-a-dict")
