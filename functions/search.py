"""
Semantic Search Implementation
Handles embedding generation and vector search queries.
"""

import os
import re
import json
import logging
from datetime import datetime
from typing import List, Optional, Any
from firebase_functions import firestore_fn, https_fn
from firebase_admin import firestore
from google.cloud.firestore_v1.vector import Vector
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google import genai

from db import get_db
from ai_service import embedding_needs_repair, collect_notes_text

logger = logging.getLogger(__name__)


# ── Embedding text recipe ──────────────────────────────────────────────────
# Bump this whenever `build_embedding_text` changes what goes INTO the vector.
# Every card stamps the version it was embedded under (`embeddingVersion`); the
# `backfill_embeddings` admin endpoint re-embeds any card whose stamp is behind
# this number, so a recipe change can be rolled out to the whole existing
# library. v1 = title + short summary + tags only (the old, too-thin recipe that
# left detail invisible to Ask). v2 = the richer recipe below. v3 folds in the
# user's OWN note (userNote) so a card is findable by what the user thought about
# it, not only by the machine-written summary. v4 folds in ALL of the user's
# notes — the legacy `userNote` string PLUS the newer multi-note `userNotes`
# array (see ai_service.collect_notes_text) — so every note contributes.
EMBED_TEXT_VERSION = 4

# gemini-embedding-001 accepts ~2048 input tokens. We cap the assembled text at
# a conservative character budget (roughly that many tokens) so a long
# detailedSummary can never overflow the model input. The most important fields
# (title, summary, details) are placed first, so truncation only ever drops the
# lower-value tail (tags/concepts/highlights).
_EMBED_TEXT_MAX_CHARS = 8000


def build_embedding_text(data: dict) -> str:
    """Assemble the text that represents a card in vector space.

    The old recipe embedded only ``Title + Summary + Tags`` — so anything that
    lived in the deeper ``detailedSummary`` (the key points, conclusions, the
    specifics that didn't survive into the 2-4 sentence blurb) was structurally
    invisible to semantic search and Ask. That is the "you never saved that"
    demo-killer. This builder folds in every content field we actually STORE on
    a link doc — detailedSummary, the actionable takeaway, concepts, and video
    highlights — so a card can be found by the details it contains, not just its
    headline. (Raw scraped body is NOT stored on the doc, so it can't be
    embedded; we embed what persists.)

    Pure and importable so both the embed sites (the Firestore trigger, the
    background pipeline) and the backfill agree on one recipe, and it can be
    unit-tested offline.
    """
    data = data or {}
    title = (data.get("title") or "").strip()
    summary = (data.get("summary") or "").strip()
    detailed = (data.get("detailedSummary") or "").strip()
    # The user's own annotations — high-signal, their words, not the model's.
    # Merges the legacy `userNote` string + the multi-note `userNotes` array.
    note = collect_notes_text(data).strip()
    tags = ", ".join(t for t in (data.get("tags") or []) if t)
    concepts = ", ".join(c for c in (data.get("concepts") or []) if c)
    meta = data.get("metadata") or {}
    takeaway = (meta.get("actionableTakeaway") or "").strip()
    highlights = [str(h) for h in (data.get("videoHighlights") or []) if h]

    parts = []
    if title:
        parts.append(f"Title: {title}")
    if summary:
        parts.append(f"Summary: {summary}")
    if detailed:
        parts.append(f"Details: {detailed}")
    if note:
        parts.append(f"Note: {note}")
    if takeaway:
        parts.append(f"Takeaway: {takeaway}")
    if tags:
        parts.append(f"Tags: {tags}")
    if concepts:
        parts.append(f"Concepts: {concepts}")
    if highlights:
        parts.append("Highlights: " + " | ".join(highlights))

    return "\n".join(parts)[:_EMBED_TEXT_MAX_CHARS]


# ── Lexical scoring / rerank helpers (pure, unit-tested) ────────────────────
# Words too common to carry retrieval signal — dropped from both the keyword
# fallback and the rerank keyword-overlap term.
_RANK_STOPWORDS = {
    "the", "a", "an", "of", "to", "in", "on", "at", "by", "for", "and", "or",
    "is", "are", "was", "were", "be", "been", "this", "that", "these", "those",
    "what", "whats", "which", "who", "whom", "how", "why", "when", "where",
    "do", "does", "did", "done", "can", "could", "would", "should", "will",
    "i", "me", "my", "you", "your", "it", "its", "they", "them", "their",
    "about", "with", "from", "into", "as", "any", "some", "all", "have", "has",
}


def keyword_query_tokens(question: str) -> set:
    """Content tokens (len >= 3, non-stopword) from a user question."""
    return {
        t for t in re.split(r"[^a-z0-9]+", (question or "").lower())
        if len(t) >= 3 and t not in _RANK_STOPWORDS
    }


def _card_haystack(data: dict) -> str:
    return " ".join(str(x) for x in [
        data.get("title", ""), data.get("summary", ""),
        " ".join(data.get("tags", []) or []),
        data.get("sourceName", ""), data.get("category", ""),
        # The user's own notes are searchable too — a literal word they wrote
        # should surface the card in keyword fallback and rerank. Covers both the
        # legacy string and the multi-note array.
        collect_notes_text(data),
    ]).lower()


def keyword_match_score(data: dict, tokens: set) -> int:
    """Integer lexical score for a card against query `tokens`.

    A token in the title counts double (a title hit is the strongest lexical
    signal), plus one for appearing anywhere in title/summary/tags/source/
    category. Shared by the keyword fallback so the "obvious title hit" is never
    dropped.
    """
    if not tokens:
        return 0
    haystack = _card_haystack(data)
    title_l = str(data.get("title", "")).lower()
    return sum((2 if t in title_l else 0) + (1 if t in haystack else 0) for t in tokens)


def rerank_candidates(question: str, candidates: List[dict], top_k: int = 10) -> List[dict]:
    """Rerank vector-search candidates down to the best `top_k` for the model.

    `candidates` must arrive in vector-distance order (nearest first — the order
    ``find_nearest`` returns). We deepen retrieval (top-30) then rerank so a card
    that the pure vector score buried at rank ~20 but which literally contains
    the query's words is lifted back into the model's context. No new dependency
    and no second embedding call: the score blends

      - vector rank (dominant): 1.0 for the nearest, decaying to ~0 for the last,
      - keyword overlap on title/summary/tags (a boost, with title weighted
        extra) — this is what rescues the buried literal match,
      - recency (a gentle tiebreak; newer saves edge out older on a tie).

    Ties keep the original vector order (stable). Pure, so it's unit-testable
    offline over plain dicts.
    """
    if not candidates:
        return []

    q_tokens = keyword_query_tokens(question)
    times = [c.get("createdAt") or 0 for c in candidates]
    oldest, newest = min(times), max(times)
    span = (newest - oldest) or 1
    n = len(candidates)

    scored = []
    for rank, c in enumerate(candidates):
        vscore = 1.0 - (rank / n)  # rank 0 -> 1.0, decays toward 0
        if q_tokens:
            hay_tokens = set(re.split(r"[^a-z0-9]+", _card_haystack(c)))
            title_tokens = set(re.split(r"[^a-z0-9]+", str(c.get("title", "")).lower()))
            overlap = len(q_tokens & hay_tokens) / len(q_tokens)
            title_overlap = len(q_tokens & title_tokens) / len(q_tokens)
        else:
            overlap = title_overlap = 0.0
        recency = ((c.get("createdAt") or oldest) - oldest) / span
        # Vector rank leads (weight 1.0), but a strong literal match is a strong
        # relevance signal — a FULL query-token overlap adds up to 0.75, enough
        # to rescue a card the vector score buried ~half the list down (the "you
        # never saved that" case) while never overturning a clear top-vector hit.
        # Recency (0.1) is only ever a gentle tiebreak.
        total = 1.0 * vscore + 0.50 * overlap + 0.25 * title_overlap + 0.1 * recency
        scored.append((total, rank, c))

    scored.sort(key=lambda s: (-s[0], s[1]))
    return [c for _, _, c in scored[:top_k]]


class EmbeddingService:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
        else:
            logger.warning("GEMINI_API_KEY environment variable not set!")
        self.model = "models/gemini-embedding-001"
        logger.info(f"EmbeddingService initialized with model: {self.model}, client initialized: {self.client is not None}")

    def generate_embedding(self, text: str) -> List[float]:
        """Generate 768-dim embedding for text."""
        if not self.client:
            logger.error("Gemini client not initialized - cannot generate embeddings! Set GEMINI_API_KEY environment variable.")
            raise Exception("GEMINI_API_KEY not configured. Please set the GEMINI_API_KEY environment variable in Firebase Cloud Functions.")

        try:
            result = self.client.models.embed_content(
                model=self.model,
                # Guard the model's input limit — the v2 recipe folds in
                # detailedSummary, so the assembled text can be long.
                contents=text[:_EMBED_TEXT_MAX_CHARS],
                config={"output_dimensionality": 768}
            )
            return result.embeddings[0].values
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise Exception(f"Gemini Embedding failed: {str(e)}")


@firestore_fn.on_document_written(document="users/{uid}/links/{linkId}")
def sync_link_embedding(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    """Trigger: keep every link's `embedding_vector` a valid, searchable Vector.

    Fires on any write (create OR update), not just create, so the two paths
    that previously produced un-searchable embeddings are now self-healing:
      - a **retry** re-runs `/api/analyze` and updates the card in place — an
        `update`, which the old create-only trigger never saw, so the retried
        card was left with no (or a client-round-tripped list) embedding.
      - a client-written **list** embedding (schema drift) or a legacy
        **degenerate** vector never got repaired.

    Loop-safe: we only (re)embed when `embedding_needs_repair` says the stored
    vector is missing/list/degenerate or `needsEmbedding` is set. Our own write
    stores a real Vector and clears the flag, so the write it re-fires no-ops.
    """
    try:
        change = event.data
        snapshot = change.after if change else None
        if snapshot is None or not snapshot.exists:
            return  # deletion — nothing to embed

        data = snapshot.to_dict() or {}
        link_id = snapshot.id
        uid = event.params["uid"]

        # Only embed cards in a settled, searchable state. Skip mid-flight
        # (`processing` placeholder / retry optimistic write — content isn't
        # final and the terminal write re-fires this trigger) and `failed` cards
        # (not searchable; they re-embed when a retry flips them to `unread`).
        if data.get("status") in ("processing", "failed"):
            return

        if not (data.get("needsEmbedding") or embedding_needs_repair(data.get("embedding_vector"))):
            return  # already has a valid Vector — no-op (also breaks the loop)

        if not (data.get("title") or data.get("summary")):
            return  # placeholder/empty card — wait for real content before embedding

        # Richer v2 recipe: fold in detailedSummary/takeaway/concepts, not just
        # the headline, so a card is findable by the details it actually holds.
        text_to_embed = build_embedding_text(data)
        if not text_to_embed:
            return

        db = get_db()
        doc_ref = db.collection("users").document(uid).collection("links").document(link_id)

        logger.info(f"Generating embedding for link {link_id}...")
        service = EmbeddingService()
        try:
            vector = service.generate_embedding(text_to_embed)
        except Exception as embed_err:
            # Embed failed: flag for backfill and drop any drift/degenerate value
            # rather than leaving something un-searchable in place silently.
            logger.error(f"Embedding failed for {link_id}, flagging needsEmbedding: {embed_err}")
            doc_ref.update({"needsEmbedding": True, "embedding_vector": firestore.DELETE_FIELD})
            return

        if vector:
            logger.info(f"Vector generated (len={len(vector)}). Updating document...")
            doc_ref.update({
                "embedding_vector": Vector(vector),
                "embeddingVersion": EMBED_TEXT_VERSION,
                "needsEmbedding": firestore.DELETE_FIELD,
            })
        else:
            doc_ref.update({"needsEmbedding": True, "embedding_vector": firestore.DELETE_FIELD})

    except Exception as e:
        logger.error(f"Error in sync_link_embedding: {e}")


def perform_search_logic(uid: str, query_text: str, limit: int = 10) -> List[dict]:
    """Core search logic separated from Firebase transport."""
    logger.info(f"Searching for '{query_text}' for user {uid}")

    service = EmbeddingService()
    
    # Check if API key is configured
    if not service.api_key:
        raise Exception("SEMANTIC_SEARCH_NOT_CONFIGURED: GEMINI_API_KEY environment variable not set. Please configure the API key in Firebase Cloud Functions.")
    
    try:
        query_vector = service.generate_embedding(query_text)
    except Exception as e:
        logger.error(f"Failed to generate query embedding: {e}")
        raise Exception(f"SEMANTIC_SEARCH_ERROR: Failed to generate query embedding - {str(e)}")

    if not query_vector:
        raise Exception("Failed to generate query embedding")

    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")

    # Does this library have ANY embedded docs to search? Sampling a SINGLE
    # arbitrary doc (the old `limit(1)`) was a correctness bug: if that one doc
    # happened to lack `embedding_vector` (still processing, failed, or flagged
    # needsEmbedding), semantic search AND ask_brain retrieval returned [] for
    # the WHOLE user even when every other doc was fully embedded. Sample a
    # handful instead and treat the library as searchable if ANY of them carries
    # an embedding. This needs no new Firestore index — an
    # `order_by('embedding_vector')` or a `where('embedding_vector', '!=', None)`
    # would each require a scalar index the field doesn't have (it only has the
    # vectorConfig index used by find_nearest), whereas a small scan does not.
    sample_docs = list(links_ref.limit(10).stream())
    has_any_embeddings = any("embedding_vector" in d.to_dict() for d in sample_docs)

    if not has_any_embeddings:
        logger.warning(f"No embeddings found for user {uid}. Use Settings → Connections → Rebuild (or the backfill_related_links admin endpoint) to generate embeddings for existing links.")
        # Don't fail the search, just return empty results with a helpful message
        return []

    try:
        vector_query = links_ref.find_nearest(
            vector_field="embedding_vector",
            query_vector=Vector(query_vector),
            distance_measure=DistanceMeasure.COSINE,
            limit=limit,
            distance_result_field="vector_distance"
        )

        results = vector_query.get()
    except Exception as e:
        logger.error(f"Vector search query failed: {e}")
        # If the vector index isn't ready, return empty with message
        raise Exception(f"VECTOR_SEARCH_ERROR: {str(e)}. Make sure the vector index is deployed in Firestore.")

    links = []
    for doc in results:
        data = doc.to_dict()
        if "createdAt" in data and hasattr(data["createdAt"], "isoformat"):
            data["createdAt"] = int(data["createdAt"].timestamp() * 1000)

        if "embedding_vector" in data:
            del data["embedding_vector"]

        data["id"] = doc.id
        links.append(data)

    logger.info(f"Found {len(links)} results.")
    return links


@https_fn.on_call(max_instances=10)
def search_links(req: https_fn.CallableRequest) -> Any:
    """
    Callable Function: Perform semantic search.
    Input: { query: string, limit?: number }
    """
    try:
        # Prefer the verified caller; fall back to the client uid only while
        # REQUIRE_AUTH is off (staged rollout).
        from link_service import find_data_uid_by_auth_uid
        from main import REQUIRE_AUTH
        uid = find_data_uid_by_auth_uid(req.auth.uid) if req.auth else None
        if not uid and not REQUIRE_AUTH and req.data:
            uid = req.data.get("uid") or req.data.get("test_uid")
        if not uid:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="User must be authenticated")

        query_text = req.data.get("query")
        limit = req.data.get("limit", 10)

        if not query_text:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Query text is required")

        links = perform_search_logic(uid, query_text, limit)
        return {"links": links}

    except https_fn.HttpsError:
        raise
    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Search failed")

