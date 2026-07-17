"""sync_link_embedding — the paid-embed rate-limit backstop.

The trigger fires on ANY write to users/{uid}/links/** which, pre-cutover, is
world-writable — so the in-trigger limiter is the only cost ceiling on that
path. These tests pin the two safety properties:

  1. Over-limit → the trigger returns WITHOUT constructing EmbeddingService and
     WITHOUT touching Firestore (a write here would re-fire the trigger → loop).
  2. The per-uid bucket is checked first (attacker fairness), the global bucket
     second (bounds uid-rotation), and a pass on both proceeds to the embed.

The trigger swallows all exceptions (it must never crash the write path), so
assertions are on recorded side effects, not on raised errors.
"""

import types

import search


class _Snap:
    def __init__(self, data, doc_id="link-1"):
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


_EMBEDDABLE = {"title": "T", "summary": "S", "needsEmbedding": True}


def _instrument(monkeypatch, allow):
    """Patch the limiter/service/db seams; return the recorders.

    `allow` maps a bucket-key prefix ("embed-uid" / "embed-global") to the
    limiter verdict for that bucket.
    """
    limiter_keys = []
    constructed = []
    db_touched = []

    def fake_check(key, limit, window_seconds, fail_open=True):
        limiter_keys.append(key)
        return allow[key.split(":")[0]]

    class FakeES:
        def __init__(self):
            constructed.append(1)

        def generate_embedding(self, text):
            return [0.1] * 768

    class _FakeRef:
        """collection()/document() chain that records nothing but supports the
        trigger's doc_ref navigation and final update()."""
        def collection(self, *_a):
            return self

        def document(self, *_a):
            return self

        def update(self, *_a, **_k):
            return None

    def fake_get_db():
        db_touched.append(1)
        return _FakeRef()

    monkeypatch.setattr(search, "check_rate_limit", fake_check)
    monkeypatch.setattr(search, "EmbeddingService", FakeES)
    monkeypatch.setattr(search, "get_db", fake_get_db)
    return limiter_keys, constructed, db_touched


def test_per_uid_over_limit_skips_embed_and_writes(monkeypatch):
    limiter_keys, constructed, db_touched = _instrument(
        monkeypatch, {"embed-uid": False, "embed-global": True})

    search.sync_link_embedding(_event(_EMBEDDABLE))

    assert limiter_keys == ["embed-uid:uid-1"]  # short-circuits before global
    assert constructed == []
    assert db_touched == []


def test_global_over_limit_skips_embed_and_writes(monkeypatch):
    limiter_keys, constructed, db_touched = _instrument(
        monkeypatch, {"embed-uid": True, "embed-global": False})

    search.sync_link_embedding(_event(_EMBEDDABLE))

    assert limiter_keys == ["embed-uid:uid-1", "embed-global"]
    assert constructed == []
    assert db_touched == []


def test_within_limits_proceeds_to_embed(monkeypatch):
    limiter_keys, constructed, _ = _instrument(
        monkeypatch, {"embed-uid": True, "embed-global": True})

    # Both buckets pass → the paid embed call must be reached.
    search.sync_link_embedding(_event(_EMBEDDABLE))

    assert limiter_keys == ["embed-uid:uid-1", "embed-global"]
    assert constructed == [1]


def test_settled_card_never_hits_the_limiter(monkeypatch):
    # A card with a healthy vector no-ops long before the limiter — the backstop
    # must not spend limiter budget (or Firestore reads) on no-op re-fires.
    limiter_keys, constructed, db_touched = _instrument(
        monkeypatch, {"embed-uid": True, "embed-global": True})
    from google.cloud.firestore_v1.vector import Vector

    search.sync_link_embedding(
        _event({"title": "T", "summary": "S",
                "embedding_vector": Vector([0.1] * 768)}))

    assert limiter_keys == []
    assert constructed == []
    assert db_touched == []
