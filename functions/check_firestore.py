import firebase_admin
from firebase_admin import firestore, credentials
import os

def check_health():
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
        
        # Check pending_processing
        docs = db.collection('pending_processing').get()
        print(f"Found {len(docs)} documents in 'pending_processing'")
        for doc in docs:
            print(f"ID: {doc.id}, Data: {doc.to_dict()}")
            
        # Check users count
        users = db.collection('users').get()
        print(f"Found {len(users)} users in 'users' collection")
        if users:
            print(f"First user keys: {users[0].to_dict().keys()}")
            print(f"First user phone data: { {k: v for k, v in users[0].to_dict().items() if 'phone' in k.lower()} }")
        
    except Exception as e:
        print(f"Health check failed: {e}")

if __name__ == "__main__":
    check_health()
