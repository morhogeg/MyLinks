import logging
import json
from typing import List, Dict, Optional
from firebase_admin import firestore
from google.cloud.firestore_v1.vector import Vector
from ai_service import GeminiService, GEMINI_ANALYSIS_MODEL, embedding_needs_repair

logger = logging.getLogger(__name__)

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
                distance_measure=firestore.DistanceMeasure.COSINE,
                limit=10
            )
            
            candidates = vector_query.get()
            
            # Filter out the current link itself (if it was already saved)
            candidates = [doc for doc in candidates if doc.id != new_link_id]
            
            if not candidates:
                logger.info("No vector candidates found")
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
            
            # 3. Format result
            results = []
            for rel in relations:
                target_id = rel.get("id")
                if target_id in valid_candidates_map:
                    target_data = valid_candidates_map[target_id]
                    # Build the related-link dict written to the card's relatedLinks.
                    results.append({
                        "id": target_id,
                        "title": target_data.get("title"),
                        "reason": rel.get("reason"),
                        "similarity": rel.get("similarity", 0.8), # Default if LLM doesn't give score
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
                failed += 1
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

        logger.info(f"Backfill for {uid}: embedded={embedded} updated={updated} skipped={skipped} failed={failed}")
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
                failed += 1
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

        prompt = f"""You are a "Knowledge Graph" assistant.
Your task is to identify meaningful connections between a NEW NOTE and EXISTING NOTES.

NEW NOTE:
Title: {title}
Summary: {summary}
Concepts: {', '.join(concepts)}

EXISTING CANDIDATES (retrieved via vector search):
{json.dumps(candidates, indent=2)}

INSTRUCTIONS:
1. Analyze the semantic relationship between the NEW NOTE and each CANDIDATE.
2. Select ONLY candidates that have a strong, meaningful connection (shared philosophy, opposing region, supporting evidence, etc.).
3. Ignore superficial connections (e.g. just sharing the word "software").
4. For each match, provide a "reason" (1 short sentence explaining the connection).
5. Identify "commonConcepts" (overlap).

OUTPUT FORMAT:
Return a JSON list of objects:
[
  {{
    "id": "candidate_id",
    "reason": "Both discuss the impact of compounding, one in finance and one in habits.",
    "similarity": 0.9,
    "commonConcepts": ["Compounding"]
  }}
]
If no strong connections, return [].
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
