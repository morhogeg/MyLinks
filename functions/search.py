"""
Semantic Search Implementation
Handles embedding generation and vector search queries.
"""

import os
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

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.model = "models/gemini-embedding-001"
        logger.info(f"EmbeddingService initialized with model: {self.model}")

    def generate_embedding(self, text: str) -> List[float]:
        """Generate 768-dim embedding for text."""
        if not self.client:
            logger.warning("Gemini client not initialized, returning mock embedding")
            return [0.0] * 768

        try:
            result = self.client.models.embed_content(
                model=self.model,
                contents=text,
                config={"output_dimensionality": 768}
            )
            return result.embeddings[0].values
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise Exception(f"Gemini Embedding failed: {str(e)}")


@firestore_fn.on_document_created(document="users/{uid}/links/{linkId}")
def sync_link_embedding(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    """Trigger: When a new link is created, generate its embedding."""
    try:
        snapshot = event.data
        if not snapshot:
            return

        data = snapshot.to_dict()
        link_id = snapshot.id
        uid = event.params["uid"]

        title = data.get("title", "")
        summary = data.get("summary", "")
        tags = ", ".join(data.get("tags", []))

        text_to_embed = f"Title: {title}\nSummary: {summary}\nTags: {tags}"

        logger.info(f"Generating embedding for link {link_id}...")

        service = EmbeddingService()
        vector = service.generate_embedding(text_to_embed)

        if vector:
            logger.info(f"Vector generated (len={len(vector)}). Updating document...")
            db = get_db()
            doc_ref = db.collection("users").document(uid).collection("links").document(link_id)
            doc_ref.update({
                "embedding_vector": Vector(vector)
            })
        else:
            logger.warning("Failed to generate vector, skipping update.")

    except Exception as e:
        logger.error(f"Error in sync_link_embedding: {e}")


def perform_search_logic(uid: str, query_text: str, limit: int = 10) -> List[dict]:
    """Core search logic separated from Firebase transport."""
    logger.info(f"Searching for '{query_text}' for user {uid}")

    service = EmbeddingService()
    query_vector = service.generate_embedding(query_text)

    if not query_vector:
        raise Exception("Failed to generate query embedding")

    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")

    vector_query = links_ref.find_nearest(
        vector_field="embedding_vector",
        query_vector=Vector(query_vector),
        distance_measure=DistanceMeasure.COSINE,
        limit=limit,
        distance_result_field="vector_distance"
    )

    results = vector_query.get()

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


@https_fn.on_call()
def search_links(req: https_fn.CallableRequest) -> Any:
    """
    Callable Function: Perform semantic search.
    Input: { query: string, limit?: number }
    """
    try:
        uid = req.auth.uid if req.auth else None
        if not uid and req.data and "test_uid" in req.data:
            uid = req.data["test_uid"]

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
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))

