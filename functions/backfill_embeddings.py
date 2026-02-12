"""
Backfill script to generate embeddings for existing links.
"""

import os
import sys
import time
from firebase_admin import initialize_app, firestore
from google.cloud.firestore_v1.vector import Vector
from google import genai

# Add functions directory to path for imports
sys.path.append(os.path.join(os.getcwd(), 'functions'))
from search import EmbeddingService

def backfill_embeddings():
    # Initialize Firebase Admin
    try:
        initialize_app()
    except Exception:
        pass
    
    db = firestore.client()
    service = EmbeddingService()
    
    if not service.api_key:
        print("ERROR: GEMINI_API_KEY environment variable not set.")
        return

    print("Starting embedding backfill...")
    
    # Query all users
    users_ref = db.collection("users")
    users = users_ref.stream()
    
    total_processed = 0
    total_updated = 0
    
    for user_doc in users:
        uid = user_doc.id
        print(f"\nProcessing user: {uid}")
        
        links_ref = db.collection("users").document(uid).collection("links")
        # Find links that DON'T have an embedding vector
        # (Firestore doesn't support 'not exists' easily in simple queries, 
        # so we stream and check locally or just re-run for all)
        links = links_ref.stream()
        
        for link_doc in links:
            total_processed += 1
            data = link_doc.to_dict()
            
            if "embedding_vector" in data:
                # print(f"  Skipping {link_doc.id} (already has embedding)")
                continue
                
            title = data.get("title", "")
            summary = data.get("summary", "")
            tags = ", ".join(data.get("tags", []))
            
            text_to_embed = f"Title: {title}\nSummary: {summary}\nTags: {tags}"
            
            print(f"  Embedding link {link_doc.id}: {title[:30]}...")
            
            try:
                vector = service.generate_embedding(text_to_embed)
                if vector:
                    link_doc.reference.update({
                        "embedding_vector": Vector(vector)
                    })
                    total_updated += 1
                    # Rate limiting to avoid API quotas (text-embedding-004 has high limits but safer to pause)
                    time.sleep(0.1) 
                else:
                    print(f"    Failed to generate embedding for {link_doc.id}")
            except Exception as e:
                print(f"    Error processing {link_doc.id}: {e}")

    print(f"\nBackfill complete.")
    print(f"Total processed: {total_processed}")
    print(f"Total updated: {total_updated}")

if __name__ == "__main__":
    backfill_embeddings()
