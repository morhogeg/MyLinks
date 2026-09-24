"""Card embedding vectors, stored OFF the card doc.

Why: every card in users/{uid}/links carried its 768-float `embedding_vector`,
so the client's feed listener and full-library reads downloaded ~7 KB of
floats per card (~35 MB at 5k cards) that the UI never renders. The vectors
move to a sibling doc per card:

    users/{uid}/vectors/{linkId}   { embedding_vector: Vector, embeddingVersion?, updatedAt }

Same doc id as the card, same field name, so the vector index config and every
`find_nearest(vector_field="embedding_vector")` call carry over unchanged. The
collection has no client rule (default deny), so vectors are server-only.

The move is staged by two flags on the Admin-only doc `config/vector_store`:

  * phase 1 (no flags): DUAL-WRITE. Every server path that writes a card's
    vector also mirrors it here (and deletes it when the card's vector is
    dropped). Readers still use the card field. Mirror failures are logged,
    never raised: the card is authoritative.
  * `siblingReady: true` — set by tools/backfill_vectors.py after it has
    mirrored every existing card. Vector search (search bar, Ask retrieval,
    See-also candidates, the related/graph similarity endpoint) now reads the
    sibling collection, falling back to the card field on error or no hits.
  * `cardVectorsRemoved: true` — set by tools/migrate_strip_card_vectors.py
    (phase 3) BEFORE it strips the card field. From then on writers stop
    putting the vector on the card, the sibling is the only copy (so a mirror
    failure is raised, not swallowed), and "does this card need embedding?"
    consults the sibling when the card has no field.

Flags are cached per instance for `_FLAG_TTL_S`; the phase-3 script waits past
that TTL after setting its flag before touching any card.
"""

import logging
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

from google.cloud.firestore_v1 import DELETE_FIELD, SERVER_TIMESTAMP
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

from ai_service import embedding_needs_repair
from db import get_db

logger = logging.getLogger(__name__)

VECTOR_FIELD = "embedding_vector"
VECTORS_COLLECTION = "vectors"
CONFIG_COLLECTION = "config"
CONFIG_DOC = "vector_store"
_FLAG_TTL_S = 60.0

_flag_cache: Dict[str, Any] = {"at": None, "value": {}}


def reset_flag_cache() -> None:
    """Forget the cached flags (tests; the phase scripts never need it)."""
    _flag_cache["at"] = None
    _flag_cache["value"] = {}


def _flags(db=None) -> dict:
    now = time.monotonic()
    at = _flag_cache["at"]
    if at is not None and now - at < _FLAG_TTL_S:
        return _flag_cache["value"]
    try:
        db = db or get_db()
        snap = db.collection(CONFIG_COLLECTION).document(CONFIG_DOC).get()
        value = {}
        # `is True`: a mocked snapshot's truthy MagicMock must not read as a doc.
        if getattr(snap, "exists", False) is True:
            d = snap.to_dict()
            if isinstance(d, dict):
                value = d
        _flag_cache["value"] = value
    except Exception as e:
        # Keep the last known value on a blip rather than flip modes mid-flight.
        logger.warning(f"vector_store flags unreadable, keeping last value: {type(e).__name__}")
    _flag_cache["at"] = now
    return _flag_cache["value"]


def sibling_ready(db=None) -> bool:
    """True once the backfill has mirrored every card: search reads siblings."""
    return _flags(db).get("siblingReady") is True


def card_vectors_removed(db=None) -> bool:
    """True once phase 3 began: the card no longer carries the vector."""
    return _flags(db).get("cardVectorsRemoved") is True


# ── Refs ─────────────────────────────────────────────────────────────────────

def vectors_collection(db, uid: str):
    return db.collection("users").document(uid).collection(VECTORS_COLLECTION)


def vector_ref_for_card(card_ref):
    """users/{uid}/links/{id} → users/{uid}/vectors/{id}."""
    return card_ref.parent.parent.collection(VECTORS_COLLECTION).document(card_ref.id)


# ── Writes ───────────────────────────────────────────────────────────────────

def card_payload(fields: dict, db=None) -> dict:
    """The dict to write on the CARD: the vector is dropped once phase 3 began.
    Pair every call with `mirror_vector_write` after the card write."""
    if VECTOR_FIELD in fields and isinstance(fields[VECTOR_FIELD], Vector) and card_vectors_removed(db):
        return {k: v for k, v in fields.items() if k != VECTOR_FIELD}
    return fields


def mirror_vector_write(card_ref, fields: dict, *, replace: bool = False, db=None) -> Optional[str]:
    """Mirror the vector part of a card write to the sibling doc.

    `fields` is the payload as the caller BUILT it (before `card_payload`).
    - a Vector under `embedding_vector` → the sibling is set to it;
    - DELETE_FIELD there, or `replace=True` (a card `.set()`) with no vector →
      the sibling is deleted (the card lost its vector, search must too);
    - no vector key on an `.update()` → nothing.
    Returns "set" / "delete" / None. Raises only once the sibling is the sole
    copy (phase 3); before that a failure is logged and the card stays
    authoritative.
    """
    raw = fields.get(VECTOR_FIELD) if isinstance(fields, dict) else None
    if isinstance(raw, Vector):
        payload = {VECTOR_FIELD: raw, "updatedAt": SERVER_TIMESTAMP}
        version = fields.get("embeddingVersion")
        if isinstance(version, int) and not isinstance(version, bool):
            payload["embeddingVersion"] = version
        action = "set"
    elif raw is DELETE_FIELD or (replace and VECTOR_FIELD not in (fields or {})):
        payload = None
        action = "delete"
    else:
        return None
    try:
        ref = vector_ref_for_card(card_ref)
        if payload is None:
            ref.delete()
        else:
            ref.set(payload)
    except Exception as e:
        if card_vectors_removed(db):
            raise
        logger.warning(f"Vector mirror {action} failed (card stays authoritative): {type(e).__name__}: {e}")
        return None
    return action


def delete_vector(db, uid: str, link_id: str) -> bool:
    """Best-effort delete of one sibling (card-delete cleanup)."""
    try:
        vectors_collection(db, uid).document(link_id).delete()
        return True
    except Exception as e:
        logger.warning(f"Vector sibling delete failed: {type(e).__name__}")
        return False


# ── Reads ────────────────────────────────────────────────────────────────────

def _sibling_vector(card_ref):
    try:
        snap = vector_ref_for_card(card_ref).get()
        if getattr(snap, "exists", False) is True:
            return (snap.to_dict() or {}).get(VECTOR_FIELD)
    except Exception as e:
        logger.warning(f"Vector sibling read failed: {type(e).__name__}")
    return None


def stored_vector(card_ref, data: dict):
    """The card's stored vector: its own field, else the sibling doc. Used where
    a missing vector costs a paid re-embed, so one extra read is the cheap side."""
    raw = (data or {}).get(VECTOR_FIELD)
    if raw is not None:
        return raw
    return _sibling_vector(card_ref)


def vector_needs_repair(card_ref, data: dict, db=None) -> bool:
    """`embedding_needs_repair` for a card, wherever its vector lives.

    While cards carry the vector (phases 1-2) this is exactly the old check on
    the card field — no extra read, and a stale sibling can never mask a card
    that genuinely needs embedding. Once phase 3 began, a card without the field
    is checked against its sibling, so an ordinary card write does not re-embed
    the whole library.
    """
    raw = (data or {}).get(VECTOR_FIELD)
    if raw is None and card_vectors_removed(db):
        raw = _sibling_vector(card_ref)
    return embedding_needs_repair(raw)


def as_float_list(raw) -> Optional[List[float]]:
    """Vector / list → list[float], or None when absent/unusable."""
    if raw is None:
        return None
    try:
        values = raw.value if hasattr(raw, "value") else list(raw)
        values = [float(v) for v in values]
    except Exception:
        return None
    return values or None


def load_vectors(db, uid: str, ids: Iterable[str]) -> Dict[str, List[float]]:
    """id → vector for the given cards, read from wherever vectors live now.

    Sibling docs once `siblingReady`; card docs (projected to the vector field)
    before that, and as the fallback for any id the sibling read missed while
    cards still carry the field. Missing / degenerate vectors are omitted.
    """
    ids = [i for i in dict.fromkeys(ids) if isinstance(i, str) and i]
    out: Dict[str, List[float]] = {}
    if not ids:
        return out
    user_ref = db.collection("users").document(uid)

    def _read(coll_name: str, wanted: List[str]):
        refs = [user_ref.collection(coll_name).document(i) for i in wanted]
        for snap in db.get_all(refs, field_paths=[VECTOR_FIELD]):
            if getattr(snap, "exists", False) is not True:
                continue
            raw = (snap.to_dict() or {}).get(VECTOR_FIELD)
            if embedding_needs_repair(raw):
                continue
            vec = as_float_list(raw)
            if vec:
                out[snap.id] = vec

    if sibling_ready(db):
        try:
            _read(VECTORS_COLLECTION, ids)
        except Exception as e:
            logger.warning(f"Sibling vector read failed; using card vectors: {type(e).__name__}")
    if not card_vectors_removed(db):
        missing = [i for i in ids if i not in out]
        if missing:
            _read("links", missing)
    return out


def find_nearest_cards(db, uid: str, query_vector, limit: int,
                       distance_threshold: Optional[float] = None,
                       include_card_data: bool = True) -> List[Tuple[str, dict]]:
    """Cosine nearest neighbours of `query_vector` in one library.

    Returns [(card_id, data)] nearest first, `data` carrying `vector_distance`
    (and, with `include_card_data`, the card's fields — what callers used to
    get straight from `links.find_nearest`). Reads the sibling collection once
    `siblingReady`, then fetches the matching cards; a hit whose card is gone
    (orphan sibling) or is processing/failed (a retry replaced it) is dropped,
    which is exactly what the card-field index excluded before. Falls back to
    `links.find_nearest` when the sibling query errors or finds nothing, so a
    missing index or unfinished backfill degrades to the old path instead of
    blanking search. Errors from the card-field path propagate (callers
    already handle them).
    """
    user_ref = db.collection("users").document(uid)
    kwargs = dict(
        vector_field=VECTOR_FIELD,
        query_vector=query_vector if isinstance(query_vector, Vector) else Vector(list(query_vector)),
        distance_measure=DistanceMeasure.COSINE,
        limit=limit,
        distance_result_field="vector_distance",
    )
    if distance_threshold is not None:
        kwargs["distance_threshold"] = distance_threshold

    if sibling_ready(db):
        try:
            hits = list(user_ref.collection(VECTORS_COLLECTION).find_nearest(**kwargs).get())
            if hits:
                if not include_card_data:
                    return [(h.id, {"vector_distance": (h.to_dict() or {}).get("vector_distance")})
                            for h in hits]
                refs = [user_ref.collection("links").document(h.id) for h in hits]
                cards = {s.id: s for s in db.get_all(refs)}
                out = []
                for h in hits:
                    snap = cards.get(h.id)
                    if snap is None or getattr(snap, "exists", False) is not True:
                        continue
                    data = snap.to_dict() or {}
                    if data.get("status") in ("processing", "failed"):
                        continue
                    data["vector_distance"] = (h.to_dict() or {}).get("vector_distance")
                    out.append((h.id, data))
                return out
        except Exception as e:
            logger.warning(f"Sibling vector search failed; falling back to card vectors: {type(e).__name__}: {e}")

    results = user_ref.collection("links").find_nearest(**kwargs).get()
    out = []
    for doc in results:
        data = doc.to_dict() or {}
        if not include_card_data:
            data = {"vector_distance": data.get("vector_distance")}
        out.append((doc.id, data))
    return out


def library_has_vectors(db, uid: str) -> bool:
    """Diagnostic only (the "no embeddings at all?" log): any vector anywhere."""
    user_ref = db.collection("users").document(uid)
    try:
        if sibling_ready(db) and list(user_ref.collection(VECTORS_COLLECTION).limit(1).stream()):
            return True
    except Exception:
        pass
    sample = list(user_ref.collection("links").limit(10).stream())
    return any(VECTOR_FIELD in (d.to_dict() or {}) for d in sample)
