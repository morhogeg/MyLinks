
import os
from firebase_admin import initialize_app, firestore

try:
    initialize_app()
except:
    pass

db = firestore.client()
uid = "+16462440305"
links_ref = db.collection("users").document(uid).collection("links")
links = links_ref.limit(5).stream()

print(f"Checking links for user: {uid}")
for link in links:
    data = link.to_dict()
    has_vector = "embedding_vector" in data
    dim = len(data["embedding_vector"]) if has_vector else "N/A"
    print(f"- ID: {link.id}, Title: {data.get('title', 'N/A')}, Vector: {has_vector}, Dim: {dim}")
