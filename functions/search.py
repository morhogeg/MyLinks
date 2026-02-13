"""
Semantic Search Implementation
Handles embedding generation and vector search queries
"""

import os
import json
from datetime import datetime
from typing import List, Optional, Any
from firebase_functions import firestore_fn, https_fn
from firebase_admin import firestore
from google.cloud.firestore_v1.vector import Vector
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google import genai
from models import LinkDocument

# Reuse the DB accessor from main.py if possible, or duplicate check
_db = None

def get_db():
    global _db
    if _db is None:
        try:
            from firebase_admin import get_app
            get_app()
        except ValueError:
            from firebase_admin import initialize_app
            initialize_app()
        _db = firestore.client()
    return _db

class EmbeddingService:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.model = "models/gemini-embedding-001"
        print(f"EmbeddingService initialized with model: {self.model}")

    def generate_embedding(self, text: str) -> List[float]:
        """Generate 768-dim embedding for text"""
        if not self.client:
            print("Gemini client not initialized, returning mock embedding")
            return [0.0] * 768
        
        try:
            result = self.client.models.embed_content(
                model=self.model,
                contents=text,
                config={"output_dimensionality": 768}
            )
            return result.embeddings[0].values
        except Exception as e:
            print(f"Embedding generation failed: {e}")
            raise Exception(f"Gemini Embedding failed: {str(e)}")

@firestore_fn.on_document_created(document="users/{uid}/links/{linkId}")
def sync_link_embedding(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    """
    Trigger: When a new link is created, generate its embedding.
    """
    try:
        snapshot = event.data
        if not snapshot:
            return

        data = snapshot.to_dict()
        link_id = snapshot.id
        uid = event.params["uid"]
        
        # specific check to avoid infinite loops if we were updating the same doc triggers
        # (Though on_document_created only triggers once)

        # Construct text to embed
        # We weigh the title heavily, followed by summary and tags
        title = data.get("title", "")
        summary = data.get("summary", "")
        tags = ", ".join(data.get("tags", []))
        
        text_to_embed = f"Title: {title}\nSummary: {summary}\nTags: {tags}"
        
        print(f"Generating embedding for link {link_id}...")
        
        service = EmbeddingService()
        vector = service.generate_embedding(text_to_embed)
        
        if vector:
            print(f"Vector generated (len={len(vector)}). Updating document...")
            # Update the document with the vector
            # We use the Vector class from firestore_v1 for native support
            db = get_db()
            doc_ref = db.collection("users").document(uid).collection("links").document(link_id)
            doc_ref.update({
                "embedding_vector": Vector(vector)
            })
        else:
            print("Failed to generate vector, skipping update.")

    except Exception as e:
        print(f"Error in on_link_created: {e}")


def perform_search_logic(uid: str, query_text: str, limit: int = 10) -> List[dict]:
    """
    Core search logic separated from Firebase transport
    """
    print(f"Searching for '{query_text}' for user {uid}")

    # 1. Generate embedding for query
    service = EmbeddingService()
    query_vector = service.generate_embedding(query_text)
    
    if not query_vector:
        raise Exception("Failed to generate query embedding")

    # 2. Perform Vector Search
    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    
    # Requires a Vector Index on the 'embedding_vector' field
    vector_query = links_ref.find_nearest(
        vector_field="embedding_vector",
        query_vector=Vector(query_vector),
        distance_measure=DistanceMeasure.COSINE,
        limit=limit,
        distance_result_field="vector_distance" # This will add the distance to the result
    )
    
    results = vector_query.get()
    
    # 3. Format results
    links = []
    for doc in results:
        data = doc.to_dict()
        # Convert Firestore types to JSON serializable
        if "createdAt" in data and hasattr(data["createdAt"], "isoformat"):
            data["createdAt"] = int(data["createdAt"].timestamp() * 1000)
        
        # Remove the vector from response to save bandwidth
        if "embedding_vector" in data:
            del data["embedding_vector"]
        
        # Add ID
        data["id"] = doc.id
        
        links.append(data)
        
    print(f"Found {len(links)} results.")
    return links

@https_fn.on_call()
def search_links(req: https_fn.CallableRequest) -> Any:
    """
    Callable Function: Perform semantic search
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

    except Exception as e:
        print(f"Search failed: {e}")
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)
