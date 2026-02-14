import logging
import json
from typing import List, Dict, Optional
from firebase_admin import firestore
from google.cloud.firestore_v1.vector import Vector
from models import LinkDocument, RelatedLink
from ai_service import GeminiService

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
                    # Create RelatedLink object structure
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
                model="gemini-1.5-flash", # Use fast/stable model
                contents=prompt,
                config={'response_mime_type': 'application/json'}
            )
            
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"LLM verification failed: {e}")
            return []
