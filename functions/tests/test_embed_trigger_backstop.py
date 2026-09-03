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

# The @on_document_written wrapper is firebase_functions plumbing that parses a
# raw CloudEvent (its shape drifts across library versions); these tests pin the
# handler's behavior, so invoke the undecorated function it wraps directly with
# an already-parsed event shape (.data.after / .params).
_handler = search.sync_link_embedding.__wrapped__


class _Snap:
    def __init__(self, data, doc_id="link-1"):
        self._data = data
        self.exists = True
        self.id = doc_id

    def to_dict(self):
        return self._data


def _event(data, uid="uid-1", before=None):
    """An UPDATE event by default (`before` exists), so these tests exercise the
    embedding path alone and never the create-only trial-anchor check."""
    snap = _Snap(data)
    return types.SimpleNamespace(
        data=types.SimpleNamespace(after=snap, before=before or _Snap(data)),
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

    _handler(_event(_EMBEDDABLE))

    assert limiter_keys == ["embed-uid:uid-1"]  # short-circuits before global
    assert constructed == []
    assert db_touched == []


def test_global_over_limit_skips_embed_and_writes(monkeypatch):
    limiter_keys, constructed, db_touched = _instrument(
        monkeypatch, {"embed-uid": True, "embed-global": False})

    _handler(_event(_EMBEDDABLE))

    assert limiter_keys == ["embed-uid:uid-1", "embed-global"]
    assert constructed == []
    assert db_touched == []


def test_within_limits_proceeds_to_embed(monkeypatch):
    limiter_keys, constructed, _ = _instrument(
        monkeypatch, {"embed-uid": True, "embed-global": True})

    # Both buckets pass → the paid embed call must be reached.
    _handler(_event(_EMBEDDABLE))

    assert limiter_keys == ["embed-uid:uid-1", "embed-global"]
    assert constructed == [1]


def test_settled_card_never_hits_the_limiter(monkeypatch):
    # A card with a healthy vector no-ops long before the limiter — the backstop
    # must not spend limiter budget (or Firestore reads) on no-op re-fires.
    limiter_keys, constructed, db_touched = _instrument(
        monkeypatch, {"embed-uid": True, "embed-global": True})
    from google.cloud.firestore_v1.vector import Vector

    _handler(
        _event({"title": "T", "summary": "S",
                "embedding_vector": Vector([0.1] * 768)}))

    assert limiter_keys == []
    assert constructed == []
    assert db_touched == []


# ── The trial-clock hook on the same trigger ─────────────────────────────────
#
# Machina Pro's reverse trial starts when the library reaches ten cards, and
# this trigger is the one write path every capture ends in, so the check rides
# here. Two properties matter: it runs on a CREATE (whatever the card's status,
# including the `processing` placeholders an import writes, which the embedding
# path skips), and it never runs on an UPDATE.

class _Deleted:
    exists = False

    def to_dict(self):
        return None


def _anchor_calls(monkeypatch):
    seen = []
    import entitlement
    monkeypatch.setattr(entitlement, "maybe_start_trial", lambda uid: seen.append(uid))
    return seen


def test_a_created_card_checks_the_trial_clock(monkeypatch):
    _instrument(monkeypatch, {"embed-uid": True, "embed-global": True})
    seen = _anchor_calls(monkeypatch)
    _handler(_event(_EMBEDDABLE, before=_Deleted()))
    assert seen == ["uid-1"]


def test_a_processing_placeholder_still_checks_the_trial_clock(monkeypatch):
    """An import writes ten `processing` cards; the embedding path returns early
    on those, so the check must run before it does."""
    _instrument(monkeypatch, {"embed-uid": True, "embed-global": True})
    seen = _anchor_calls(monkeypatch)
    _handler(_event({"status": "processing", "title": ""}, before=_Deleted()))
    assert seen == ["uid-1"]


def test_an_updated_card_does_not_recheck_the_trial_clock(monkeypatch):
    _instrument(monkeypatch, {"embed-uid": True, "embed-global": True})
    seen = _anchor_calls(monkeypatch)
    _handler(_event(_EMBEDDABLE))          # before exists -> an update
    assert seen == []
