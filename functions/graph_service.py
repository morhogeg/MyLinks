import logging
import json
import os
from typing import List, Dict, Optional
from firebase_admin import firestore
# DistanceMeasure is NOT re-exported by firebase_admin.firestore on the pinned
# firebase-admin (6.9.0) — referencing firestore.DistanceMeasure raised
# AttributeError on EVERY find_related_links call in prod (See-also candidates
# silently empty since at least 2026-07-27). Import it from the real module,
# exactly as search.py does.
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector
from ai_service import GeminiService, GEMINI_ANALYSIS_MODEL, embedding_needs_repair
from log_safe import mask_uid

logger = logging.getLogger(__name__)

# ── Relatedness quality gates ────────────────────────────────────────────────
# find_nearest always returns the `limit` nearest neighbours no matter how far
# away they are: in a small or topically diverse library, the "nearest" cards
# to a robot-vacuum review are whatever exists — AI-model notes included. The
# LLM verifier then dutifully abstracts until any two cards match ("both
# emphasize standardized benchmarking"). Two gates kill that failure mode:
#
#  1. DISTANCE CEILING — a candidate the LLM never sees can't be force-fitted.
#    Cosine distance for gemini-embedding-001: same-topic cards land well under
#    ~0.55, unrelated text drifts toward ~0.7+ (see search.py's gate, which is
#    deliberately LOOSER — search wants recall, relatedness wants precision).
#    No recall floor here: an empty "Related cards" section is the correct
#    answer for a card the library has nothing about.
#  2. SIMILARITY FLOOR — the LLM must commit to a similarity score, and weak
#    ones are dropped. No default is gifted when the model omits the score.
_RELATED_DISTANCE_CEILING = float(os.environ.get("RELATED_DISTANCE_CEILING", "0.60"))
_RELATED_SIMILARITY_FLOOR = float(os.environ.get("RELATED_SIMILARITY_FLOOR", "0.75"))


class GraphService:
    def __init__(self, db):
        self.db = db
        self.ai = GeminiService()

    def find_related_links(self, 
                          new_link_id: str, 
                          title: str, 
                          summary: str, 
                          embedding: List[float], 
                          new_concepts: List[str], 
                          uid: str) -> List[dict]:
        """
        Find semantically related links using Vector Search + LLM Verification
        """
        if not embedding:
            # No query vector (embed failed) → no neighbours; don't crash on
            # Vector(None) inside the query below.
            return []
        try:
            # 1. Vector Search (Candidate Retrieval)
            # Find top 10 similar vectors
            links_ref = self.db.collection('users').document(uid).collection('links')
            
            # Simple vector search query
            # Note: This requires a Firestore Vector Index to be created
            vector_query = links_ref.find_nearest(
                vector_field="embedding_vector",
                query_vector=Vector(embedding),
                distance_measure=DistanceMeasure.COSINE,
                limit=10,
                distance_result_field="vector_distance"
            )

            candidates = vector_query.get()

            # Filter out the current link itself (if it was already saved), then
            # gate on real closeness: a candidate past the ceiling is not about
            # the same thing, and handing it to the LLM anyway is how forced
            # connections get invented. A missing distance fails open (kept).
            candidates = [doc for doc in candidates if doc.id != new_link_id]
            near = []
            for doc in candidates:
                dist = (doc.to_dict() or {}).get("vector_distance")
                if isinstance(dist, (int, float)) and dist > _RELATED_DISTANCE_CEILING:
                    continue
                near.append(doc)
            if len(near) < len(candidates):
                logger.info(f"Distance gate dropped {len(candidates) - len(near)}/{len(candidates)} candidates")
            candidates = near

            if not candidates:
                logger.info("No vector candidates within relatedness distance")
                return []

            # 2. LLM Verification
            # Prepare context for Gemini
            candidate_context = []
            valid_candidates_map = {} # Map ID to doc data

            for doc in candidates:
                data = doc.to_dict()
                doc_id = doc.id
                
                # Basic metadata for the prompt
                info = {
                    "id": doc_id,
                    "title": data.get("title", "Untitled"),
                    "summary": data.get("summary", ""),
                    "concepts": data.get("concepts", [])
                }
                candidate_context.append(info)
                valid_candidates_map[doc_id] = data

            # Ask Gemini to verify relationships
            relations = self._verify_relationships_with_llm(
                title, summary, new_concepts, candidate_context
            )
            
            # 3. Format result — and hold the LLM to its own scores. A relation
            # without a similarity, or one under the floor, is the model hedging
            # ("technically both involve reviews…"); those are exactly the ties
            # the card must NOT show. No connections is a valid outcome.
            results = []
            for rel in relations:
                target_id = rel.get("id")
                if target_id not in valid_candidates_map:
                    continue
                sim = rel.get("similarity")
                if not isinstance(sim, (int, float)) or sim < _RELATED_SIMILARITY_FLOOR:
                    continue
                target_data = valid_candidates_map[target_id]
                # Build the related-link dict written to the card's relatedLinks.
                results.append({
                    "id": target_id,
                    "title": target_data.get("title"),
                    "reason": rel.get("reason"),
                    "similarity": sim,
                    "commonConcepts": rel.get("commonConcepts", [])
                })

            return results

        except Exception as e:
            logger.error(f"Error in find_related_links: {e}")
            # Fallback: Return empty list rather than breaking flow
            return []

    def backfill_related_links(self, uid: str, force: bool = False) -> dict:
        """One-off repair for a single user: compute `relatedLinks` for cards
        that predate the graph (older saves never ran through find_related_links).

        Two passes so old cards can actually connect to each other:
          1. Ensure every card has an `embedding_vector` — cards saved before
             embeddings existed aren't discoverable as neighbors otherwise.
          2. For each card missing `relatedLinks` (or all cards when `force`),
             recompute neighbors and write them back.

        Pure repair: idempotent and safe to re-run. Returns per-user counts.
        """
        links_ref = self.db.collection('users').document(uid).collection('links')
        docs = list(links_ref.stream())

        # Pass 1 — backfill missing embeddings (reused as query vectors below).
        embeddings: Dict[str, List[float]] = {}
        embedded = 0
        for doc in docs:
            d = doc.to_dict() or {}
            if not (d.get('needsEmbedding') or embedding_needs_repair(d.get('embedding_vector'))):
                continue
            text = f"{d.get('title', '')}\n{d.get('summary', '')}".strip()
            if not text:
                continue
            try:
                emb = self.ai.embed_text(text)
            except Exception as e:
                logger.error(f"Backfill embed failed for {doc.id}: {e}")
                emb = None
            if not emb:
                continue
            try:
                doc.reference.update({'embedding_vector': Vector(emb),
                                      'needsEmbedding': firestore.DELETE_FIELD})
                embeddings[doc.id] = emb
                embedded += 1
            except Exception as e:
                logger.error(f"Backfill embedding write failed for {doc.id}: {e}")

        # Pass 2 — compute neighbors for cards that don't have them yet. The
        # vector search runs against live Firestore, so it sees the embeddings
        # just written in pass 1.
        updated = skipped = failed = 0
        for doc in docs:
            d = doc.to_dict() or {}
            if d.get('relatedLinks') and not force:
                skipped += 1
                continue
            text = f"{d.get('title', '')}\n{d.get('summary', '')}".strip()
            if not text:
                # Permanent state, not a retryable failure (see backfill_batch).
                skipped += 1
                continue
            emb = embeddings.get(doc.id)
            if emb is None:
                try:
                    emb = self.ai.embed_text(text)
                except Exception as e:
                    logger.error(f"Backfill query embed failed for {doc.id}: {e}")
                    emb = None
            if not emb:
                failed += 1
                continue
            related = self.find_related_links(
                new_link_id=doc.id,
                title=d.get('title', ''),
                summary=d.get('summary', ''),
                embedding=emb,
                new_concepts=d.get('concepts', []),
                uid=uid,
            )
            try:
                doc.reference.update({'relatedLinks': related})
                updated += 1
            except Exception as e:
                logger.error(f"Backfill relatedLinks write failed for {doc.id}: {e}")
                failed += 1

        logger.info(f"Backfill for {mask_uid(uid)}: embedded={embedded} updated={updated} skipped={skipped} failed={failed}")
        return {'embedded': embedded, 'updated': updated, 'skipped': skipped, 'failed': failed}

    def backfill_batch(self, uid: str, phase: str, cursor: Optional[str] = None,
                       limit: int = 20, force: bool = False) -> dict:
        """One page of the per-user backfill, driven by the client so no single
        call risks the callable timeout (the whole-library version can run for
        minutes on a large brain).

        Two phases the client runs in order:
          - 'embed': give every card missing an `embedding_vector` one. Must
            finish for the WHOLE library before 'relate', so neighbour search
            can see every card.
          - 'relate': compute `relatedLinks` for cards that lack them (or all
            when `force`).

        Paginated by document id (`__name__`). Returns the counts for this page,
        `nextCursor` (last id seen), and `done` (True when the page was short,
        i.e. the collection is exhausted). Idempotent — safe to re-run.
        """
        links_ref = self.db.collection('users').document(uid).collection('links')
        q = links_ref.order_by('__name__')
        if cursor:
            snap = links_ref.document(cursor).get()
            if snap.exists:
                q = q.start_after(snap)
        docs = list(q.limit(limit).stream())

        embedded = updated = skipped = failed = 0
        for doc in docs:
            d = doc.to_dict() or {}
            text = f"{d.get('title', '')}\n{d.get('summary', '')}".strip()

            if phase == 'embed':
                # Repair anything unsearchable: missing, list-typed (schema
                # drift), degenerate/poisoned, or explicitly flagged — not just
                # "field absent" (which missed drift/poison and left cards dead).
                needs = d.get('needsEmbedding') or embedding_needs_repair(d.get('embedding_vector'))
                if not needs or not text:
                    skipped += 1
                    continue
                try:
                    emb = self.ai.embed_text(text)
                    if emb:
                        doc.reference.update({'embedding_vector': Vector(emb),
                                              'needsEmbedding': firestore.DELETE_FIELD})
                        embedded += 1
                    else:
                        doc.reference.update({'needsEmbedding': True})
                        failed += 1
                except Exception as e:
                    logger.error(f"Backfill embed failed for {doc.id}: {e}")
                    failed += 1
                continue

            # phase == 'relate'
            if d.get('relatedLinks') and not force:
                skipped += 1
                continue
            if not text:
                # No title/summary → nothing to embed or relate, ever. That is
                # the card's permanent correct state, not a failure: `failed`
                # must mean "retry could help" (the client re-runs the graph
                # migration until a pass finishes with failed == 0).
                skipped += 1
                continue
            emb = None
            raw = d.get('embedding_vector')
            if raw is not None:
                emb = raw.value if hasattr(raw, 'value') else (list(raw) if not isinstance(raw, list) else raw)
            if not emb:
                try:
                    emb = self.ai.embed_text(text)
                except Exception as e:
                    logger.error(f"Backfill query embed failed for {doc.id}: {e}")
                    emb = None
            if not emb:
                failed += 1
                continue
            try:
                related = self.find_related_links(
                    new_link_id=doc.id,
                    title=d.get('title', ''),
                    summary=d.get('summary', ''),
                    embedding=emb,
                    new_concepts=d.get('concepts', []),
                    uid=uid,
                )
                doc.reference.update({'relatedLinks': related})
                updated += 1
            except Exception as e:
                logger.error(f"Backfill relatedLinks write failed for {doc.id}: {e}")
                failed += 1

        return {
            'done': len(docs) < limit,
            'nextCursor': docs[-1].id if docs else cursor,
            'processed': len(docs),
            'embedded': embedded,
            'updated': updated,
            'skipped': skipped,
            'failed': failed,
        }

    def _verify_relationships_with_llm(self,
                                     title: str, 
                                     summary: str, 
                                     concepts: List[str], 
                                     candidates: List[Dict]) -> List[Dict]:
        """
        Use LLM to filter false positives and generate "why" text
        """
        if not candidates:
            return []

        prompt = f"""You are the skeptical gatekeeper of a personal knowledge graph.
Your job is to REJECT weak connections between a NEW NOTE and EXISTING NOTES.
A user tapping a related card expects "more on the same thing" — not a clever
abstraction. An empty result is a good result; a forced connection erodes trust
in every real one.

NEW NOTE:
Title: {title}
Summary: {summary}
Concepts: {', '.join(concepts)}

EXISTING CANDIDATES (retrieved via vector search — proximity does NOT mean related):
{json.dumps(candidates, indent=2)}

A REAL connection requires at least one of:
- Same specific topic or domain (two notes about robot vacuums; two notes about LLM coding agents).
- Same specific entity: product, person, company, place, event, technology.
- One note directly extends, supports, contradicts, or answers the other.

NEVER connect on:
- Shared methodology or format: "both are reviews", "both use benchmarks/rankings/metrics", "both evaluate products", "both are guides". A vacuum review and an AI-model benchmark share a FORMAT, not a topic — that is NOT a connection.
- Abstract themes you had to zoom out to find: "both involve technology", "both discuss performance", "both emphasize objective evaluation", "both explore trade-offs".
- A single generic word or concept in common ("software", "tech", "product").

Test each candidate: would the reason still hold if you swapped in a random note
of the same format? If yes, it describes the format, not a relationship — reject.
When in doubt, EXCLUDE. Expect to reject most or all candidates.

For each SURVIVING candidate give:
- "reason": one short, concrete sentence naming the shared topic/entity — never the shared format.
- "similarity": your honest 0-1 confidence that a user would agree these belong together. Below 0.75 means you should have rejected it.
- "commonConcepts": the specific overlapping concepts.

OUTPUT FORMAT — a JSON list, [] when nothing genuinely relates:
[
  {{
    "id": "candidate_id",
    "reason": "Both compare flagship robot vacuums on suction and navigation.",
    "similarity": 0.9,
    "commonConcepts": ["robot vacuums"]
  }}
]
"""
        
        try:
            if not self.ai.client:
                 return []
            
            response = self.ai.client.models.generate_content(
                model=GEMINI_ANALYSIS_MODEL,  # Single source of truth (see ai_service)
                contents=prompt,
                config={'response_mime_type': 'application/json'}
            )
            
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"LLM verification failed: {e}")
            return []
