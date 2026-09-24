"""Server-side card similarity for the Related list and the knowledge graph.

The web client used to compute live "related" ties itself, from the
`embedding_vector` every card doc carried (web/lib/related.ts, lib/graph.ts).
That forced every client to download every vector. This module computes the
only vector-dependent input of that logic — cosine similarity between cards —
from the server-side vector store (vector_store.py), and returns just the
numbers the client's qualification bar (`qualifyLiveTie`) can act on. All the
concept / tag / budget logic stays in related.ts, unchanged, so the Related
list and the graph keep agreeing with each other.

What "can act on" means (mirrors related.ts; test_similarity_service pins the
constants against the TS file):
  - a SEMANTIC tie needs sim >= SEMANTIC_ASSIST_MIN (0.74);
  - a CONCEPT tie needs >= 2 shared specific concepts, and when both cards
    have vectors, sim >= CONCEPT_SIM_FLOOR (0.55).
So a pair below 0.74 matters only when it shares >= 2 concepts, and a pair
below 0.55 never qualifies when both have vectors. The client treats an
omitted pair as "has vectors, sim below every bar" — which yields the same
verdict — and needs to know which cards have NO vector at all (their concept
ties are not vetoed), hence `noVector`.

Served through `/api/search` with a `similarity` body (see main.py
`_similarity_http`), so no new function or Hosting rewrite is needed.
"""

import math
import operator
from typing import Dict, Iterable, List, Optional, Sequence

import vector_store

# Mirrored from web/lib/related.ts (tests assert they match).
SEMANTIC_ASSIST_MIN = 0.74
CONCEPT_SIM_FLOOR = 0.55

# Request bounds.
MAX_GRAPH_IDS = 600          # = MAX_PAIRWISE in web/lib/graph.ts
MAX_RELATED_CANDIDATES = 300
RELATED_NEIGHBOURS = 50      # nearest-neighbour hits past the candidate list
MAX_ID_CHARS = 200
MAX_CONCEPTS_PER_CARD = 40

_sumprod = getattr(math, "sumprod", None)  # Python 3.12+ (prod runs 3.13)


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    if _sumprod is not None:
        return _sumprod(a, b)
    return sum(map(operator.mul, a, b))


def _normalize(v: Sequence[float]) -> Optional[List[float]]:
    norm = math.sqrt(_dot(v, v))
    if not norm:
        return None
    return [x / norm for x in v]


def clean_ids(raw, cap: int) -> List[str]:
    """Card ids from a request body: strings, no path separators, de-duplicated,
    order kept, capped. Anything else is dropped rather than erroring."""
    out: List[str] = []
    seen = set()
    if not isinstance(raw, list):
        return out
    for x in raw:
        if not isinstance(x, str) or not x or len(x) > MAX_ID_CHARS or "/" in x or x in seen:
            continue
        seen.add(x)
        out.append(x)
        if len(out) >= cap:
            break
    return out


def _concept_sets(raw, n: int) -> Optional[List[set]]:
    if not isinstance(raw, list) or len(raw) != n:
        return None
    sets = []
    for entry in raw:
        if not isinstance(entry, list):
            sets.append(set())
            continue
        sets.append({c.strip().lower() for c in entry[:MAX_CONCEPTS_PER_CARD]
                     if isinstance(c, str) and c.strip()})
    return sets


def related_similarity(db, uid: str, anchor_id: str, candidate_ids: Iterable[str]) -> dict:
    """Similarity of one card to the rest of its library.

    `candidate_ids` are the cards the client already knows share a concept
    with the anchor: each gets an exact sim (or lands in `noVector`). On top of
    that, the anchor's nearest neighbours at sim >= SEMANTIC_ASSIST_MIN are
    added from the vector index — the only way a card sharing NO concept can
    qualify. Returns {anchorHasVector, sims: {id: sim}, noVector: [ids]}.
    """
    candidates = [c for c in candidate_ids if c != anchor_id]
    vecs = vector_store.load_vectors(db, uid, [anchor_id] + candidates)
    anchor = vecs.get(anchor_id)
    if not anchor:
        return {"anchorHasVector": False, "sims": {}, "noVector": []}
    a = _normalize(anchor)
    if a is None:
        return {"anchorHasVector": False, "sims": {}, "noVector": []}

    sims: Dict[str, float] = {}
    no_vector: List[str] = []
    for cid in candidates:
        v = vecs.get(cid)
        nv = _normalize(v) if v else None
        if nv is None or len(nv) != len(a):
            no_vector.append(cid)
            continue
        sims[cid] = _dot(a, nv)

    hits = vector_store.find_nearest_cards(
        db, uid, anchor, RELATED_NEIGHBOURS,
        distance_threshold=1.0 - SEMANTIC_ASSIST_MIN, include_card_data=False)
    for hid, data in hits:
        if hid == anchor_id or hid in sims:
            continue
        dist = (data or {}).get("vector_distance")
        if isinstance(dist, (int, float)):
            sims[hid] = 1.0 - float(dist)

    return {
        "anchorHasVector": True,
        "sims": {k: round(v, 6) for k, v in sims.items()},
        "noVector": no_vector,
    }


def graph_similarity(db, uid: str, ids: List[str], concepts=None) -> dict:
    """Pairwise similarity over the graph's node pool (<= MAX_GRAPH_IDS).

    Returns {noVector: [ids], pairs: [[i, j, sim], ...]} with i < j indexing
    `ids`. A pair is included when it can matter to the client's bar: sim >=
    SEMANTIC_ASSIST_MIN, or sim >= CONCEPT_SIM_FLOOR and (when the client sent
    per-card `concepts`) the two cards share >= 2 raw concepts. Raw overlap is a
    superset of related.ts's "specific" overlap, so nothing it could qualify is
    ever omitted.
    """
    ids = ids[:MAX_GRAPH_IDS]
    concept_sets = _concept_sets(concepts, len(ids))
    vecs = vector_store.load_vectors(db, uid, ids)
    normed: List[Optional[List[float]]] = []
    for i in ids:
        v = vecs.get(i)
        normed.append(_normalize(v) if v else None)
    dim = next((len(v) for v in normed if v), 0)
    no_vector = [ids[k] for k, v in enumerate(normed) if v is None or len(v) != dim]

    pairs = []
    n = len(ids)
    for i in range(n):
        vi = normed[i]
        if vi is None or len(vi) != dim:
            continue
        ci = concept_sets[i] if concept_sets else None
        for j in range(i + 1, n):
            vj = normed[j]
            if vj is None or len(vj) != dim:
                continue
            s = _dot(vi, vj)
            if s < CONCEPT_SIM_FLOOR:
                continue
            if s < SEMANTIC_ASSIST_MIN and concept_sets is not None:
                if len(ci & concept_sets[j]) < 2:
                    continue
            pairs.append([i, j, round(s, 6)])
    return {"noVector": no_vector, "pairs": pairs}
