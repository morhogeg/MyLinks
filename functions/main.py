"""
SecondBrain Cloud Functions
Handles WhatsApp webhook ingestion and AI processing

TODO: Deploy to Firebase Cloud Functions:
    firebase deploy --only functions
"""

import os
import json
import re
import requests
from datetime import datetime
from typing import Optional

# Firebase Functions framework
# TODO: Uncomment when deploying to Firebase
# from firebase_functions import https_fn
# from firebase_admin import initialize_app, firestore

from models import WebhookPayload, LinkDocument, LinkStatus, LinkMetadata, AIAnalysis
from ai_service import ClaudeService

# Initialize Firebase Admin (for Firestore access)
# TODO: Uncomment when deploying
# initialize_app()
# db = firestore.client()


def scrape_url(url: str) -> dict:
    """
    Fetch and extract content from a URL
    
    Returns:
        dict with 'html', 'title', 'text' keys
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; SecondBrain/1.0)"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        html = response.text
        
        # Extract title
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else ""
        
        # Extract text from paragraphs
        p_matches = re.findall(r'<p[^>]*>([^<]+)</p>', html, re.IGNORECASE)
        text = " ".join(p_matches)[:5000]  # Limit text length
        
        return {
            "html": html,
            "title": title,
            "text": text or html[:5000]
        }
    except Exception as e:
        print(f"Scrape error: {e}")
        return {"html": "", "title": "", "text": ""}


def find_user_by_phone(phone_number: str) -> Optional[str]:
    """
    Look up user UID by phone number in Firestore
    
    TODO: Implement Firestore query:
        users_ref = db.collection('users')
        query = users_ref.where('phoneNumber', '==', phone_number).limit(1)
        docs = query.get()
        if docs:
            return docs[0].id
        return None
    """
    # Mock implementation - return None (user not found)
    # In production, this queries Firestore
    print(f"Looking up user with phone: {phone_number}")
    return None


def save_link_to_firestore(uid: str, link_data: dict) -> str:
    """
    Save a new link document to Firestore
    
    TODO: Implement Firestore write:
        doc_ref = db.collection('users').document(uid).collection('links').document()
        doc_ref.set(link_data)
        return doc_ref.id
    """
    # Mock implementation
    print(f"Saving link for user {uid}: {link_data.get('title', 'Untitled')}")
    return "mock-link-id"


# TODO: Uncomment decorator when deploying to Firebase
# @https_fn.on_request()
def whatsapp_webhook(request):
    """
    WhatsApp webhook endpoint
    
    Flow:
    1. Receive incoming message
    2. Verify sender is a registered user
    3. Extract URL from message
    4. Scrape and analyze the URL
    5. Save to Firestore
    6. Send confirmation back to user
    
    CRITICAL: Uses try/except to save links even if AI fails
    """
    
    # Parse incoming payload
    try:
        # Handle both form-encoded (Twilio) and JSON payloads
        if request.content_type == 'application/x-www-form-urlencoded':
            data = request.form.to_dict()
        else:
            data = request.get_json()
            
        payload = WebhookPayload(**data)
    except Exception as e:
        print(f"Payload parse error: {e}")
        return {"error": "Invalid payload"}, 400
    
    # Find user by phone number
    uid = find_user_by_phone(payload.from_number)
    if not uid:
        print(f"Unauthorized number: {payload.from_number}")
        # TODO: Send "Unauthorized" reply via WhatsApp API
        return {"error": "User not found"}, 403
    
    # Extract URL from message body
    url_match = re.search(r'https?://[^\s]+', payload.body)
    if not url_match:
        # TODO: Send "No URL found" reply
        return {"error": "No URL in message"}, 400
        
    url = url_match.group(0)
    
    # Process the URL
    try:
        # Scrape content
        scraped = scrape_url(url)
        
        # Analyze with AI
        claude = ClaudeService()
        analysis = claude.analyze_text(scraped["text"] or scraped["html"])
        
        # Build link document
        link_data = {
            "url": url,
            "title": analysis["title"],
            "summary": analysis["summary"],
            "tags": analysis["tags"],
            "category": analysis["category"],
            "status": LinkStatus.UNREAD.value,
            "createdAt": datetime.now().isoformat(),
            "metadata": {
                "originalTitle": scraped["title"],
                "estimatedReadTime": max(1, len(scraped["text"]) // 1500)
            }
        }
        
        # Save to Firestore
        link_id = save_link_to_firestore(uid, link_data)
        
        # TODO: Send success message via WhatsApp API
        # send_whatsapp_message(payload.from_number, f"✅ Saved: {analysis['title']}")
        
        return {"success": True, "linkId": link_id}, 200
        
    except Exception as e:
        # CRITICAL: Even if AI fails, save the link with error tag
        print(f"Processing error: {e}")
        
        fallback_data = {
            "url": url,
            "title": scraped.get("title", url),
            "summary": "Processing failed. Click to view original.",
            "tags": ["Processing Failed"],
            "category": "Uncategorized",
            "status": LinkStatus.UNREAD.value,
            "createdAt": datetime.now().isoformat(),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": 0
            }
        }
        
        link_id = save_link_to_firestore(uid, fallback_data)
        
        # TODO: Send error notification via WhatsApp
        # send_whatsapp_message(payload.from_number, f"⚠️ Saved with limited info: {url}")
        
        return {"success": True, "linkId": link_id, "warning": "AI processing failed"}, 200


# Local testing entry point
if __name__ == "__main__":
    from flask import Flask, request as flask_request
    
    app = Flask(__name__)
    
    @app.route("/webhook/whatsapp", methods=["POST"])
    def local_webhook():
        return whatsapp_webhook(flask_request)
    
    print("Starting local server on http://localhost:5001")
    print("Test with: curl -X POST http://localhost:5001/webhook/whatsapp -d 'From=+1234567890&Body=https://example.com'")
    app.run(port=5001, debug=True)
