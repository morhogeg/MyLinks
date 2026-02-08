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
from twilio.rest import Client

# Firebase Functions framework
from firebase_functions import https_fn, scheduler_fn
from firebase_admin import initialize_app, firestore

from models import WebhookPayload, LinkDocument, LinkStatus, LinkMetadata, AIAnalysis, ReminderStatus
from ai_service import ClaudeService

# Initialize Firebase Admin lazily
_db = None

def get_db():
    global _db
    if _db is None:
        initialize_app()
        _db = firestore.client()
    return _db


def scrape_url(url: str) -> dict:
    """
    Fetch and extract content from a URL
    Handles Twitter/X URLs specially via fxtwitter.com API
    
    Returns:
        dict with 'html', 'title', 'text' keys
    """
    try:
        # Special handling for Twitter/X URLs
        if 'twitter.com' in url or 'x.com' in url:
            return _scrape_twitter_url(url)
        
        # General URL scraping with BeautifulSoup
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        html = response.text
        
        # Use BeautifulSoup for better HTML parsing
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extract title
            title = ""
            if soup.title:
                title = soup.title.string.strip()
            
            # Extract text from paragraphs and main content
            text_parts = []
            for p in soup.find_all('p'):
                text_parts.append(p.get_text().strip())
            
            # Also try to get article content
            article = soup.find('article')
            if article:
                text_parts.append(article.get_text().strip())
            
            text = " ".join(text_parts)[:5000]
            
            return {
                "html": html,
                "title": title,
                "text": text or html[:5000]
            }
        except ImportError:
            # Fallback to regex if BeautifulSoup fails
            import re
            title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else ""
            
            p_matches = re.findall(r'<p[^>]*>([^<]+)</p>', html, re.IGNORECASE)
            text = " ".join(p_matches)[:5000]
            
            return {
                "html": html,
                "title": title,
                "text": text or html[:5000]
            }
            
    except Exception as e:
        print(f"Scrape error: {e}")
        return {"html": "", "title": "", "text": ""}

def _scrape_twitter_url(url: str) -> dict:
    """
    Scrape Twitter/X URLs using the fxtwitter.com API
    
    Returns:
        dict with 'html', 'title', 'text' keys formatted for AI analysis
    """
    print(f"Analyzing Twitter URL: {url}")
    
    try:
        # 1. Try fxtwitter.com API first
        fx_api_url = url.replace('twitter.com', 'api.fxtwitter.com').replace('x.com', 'api.fxtwitter.com')
        print(f"Attempting fxtwitter API: {fx_api_url}")
        
        try:
            response = requests.get(fx_api_url, timeout=10)
            if response.ok:
                data = response.json()
                if data.get('tweet'):
                    tweet = data['tweet']
                    # Valid content check
                    has_text = bool(tweet.get('text'))
                    has_quote = bool(tweet.get('quote'))
                    has_media = bool(tweet.get('media'))
                    
                    # If it has content, use it
                    if has_text or has_quote or has_media:
                        return _format_twitter_data(tweet, 'fxtwitter')
        except Exception as e:
            print(f"fxtwitter failed: {e}")

        # 2. Fallback to vxtwitter.com
        print("fxtwitter failed or empty, trying vxtwitter...")
        vx_api_url = url.replace('twitter.com', 'api.vxtwitter.com').replace('x.com', 'api.vxtwitter.com')
        
        vx_result = None
        try:
            response = requests.get(vx_api_url, timeout=10)
            if response.ok:
                data = response.json()
                
                # VALIDATION: Check if vxtwitter gave us meaningful content
                has_media = bool(data.get('mediaURLs') or data.get('media_extended'))
                text_len = len(data.get('text', ''))
                
                # If we have media, or text is substantial (>100 chars), trust it.
                if has_media or text_len > 100:
                     return _format_vxtwitter_data(data)
                
                # Store for potential usage if scrape fails
                print("vxtwitter content found but 'thin' (no media, short text). Attempting scrape...")
                vx_result = _format_vxtwitter_data(data)
                
        except Exception as e:
            print(f"vxtwitter failed: {e}")

        # 3. Final Fallback: Direct metadata scrape (Twitter Article support)
        print("APIs failed/thin. Trying direct metadata scrape...")
        scrape_result = _scrape_twitter_metadata(url)
        
        if scrape_result.get('title') or scrape_result.get('text'):
            return scrape_result
            
        # If scrape failed but we had a "thin" vxtwitter result, likely better than nothing
        if vx_result:
             print("Scrape failed, reverting to thin vxtwitter result")
             return vx_result
             
        return {"html": "", "title": "", "text": ""}

    except Exception as e:
        print(f"Twitter scrape error: {e}")
        return {"html": "", "title": "", "text": ""}

def _scrape_twitter_metadata(url: str) -> dict:
    """Scrape OpenGraph tags for Twitter Articles"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        }
        response = requests.get(url, headers=headers, timeout=10)
        if not response.ok:
            return {"html": "", "title": "", "text": ""}
            
        html = response.text
        
        # Simple regex for OG tags
        title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)
        
        title = title_match.group(1) if title_match else ""
        desc = desc_match.group(1) if desc_match else ""
        
        if not title and not desc:
            return {"html": "", "title": "", "text": ""}
            
        formatted_text = f"""
TWEET/ARTICLE METADATA:
Title: {title}
Description: {desc}

(Full content not available via API, analyzed based on preview metadata)
"""
        return {
            "html": formatted_text,
            "title": title or "Twitter Article",
            "text": formatted_text
        }
    except Exception as e:
        print(f"Metadata scrape failed: {e}")
        return {"html": "", "title": "", "text": ""}

def _format_twitter_data(tweet: dict, source: str) -> dict:
    # Build richer content string
    content_parts = []
    
    # 1. Main Text
    if tweet.get('text'):
            content_parts.append(tweet['text'])
            
    # 2. Quote Tweet
    if tweet.get('quote'):
        q_author = tweet['quote'].get('author', {}).get('name', 'Unknown')
        q_handle = tweet['quote'].get('author', {}).get('screen_name', 'unknown')
        q_text = tweet['quote'].get('text', '')
        content_parts.append(f'\n[Replying to/Quoting {q_author} (@{q_handle})]:\n"{q_text}"')
        
    # 3. Media Descriptions
    if tweet.get('media'):
        media = tweet['media']
        if media.get('photos'):
                content_parts.append(f"\n[Contains {len(media['photos'])} Image(s)]")
        if media.get('videos'):
                content_parts.append("\n[Contains Video]")
                
    # Join content
    final_tweet_content = "\n\n".join(content_parts) or "[Media-only tweet or no text content available]"

    author = tweet.get('author', {})
    author_name = author.get('name', 'Unknown')
    author_handle = author.get('screen_name', '')
    created_at = tweet.get('created_at', '')
    likes = tweet.get('likes', 0)
    retweets = tweet.get('retweets', 0)
    
    # Format as readable text for AI analysis - Emphasize CONTENT over metadata
    formatted_text = f"""
TWEET CONTENT:
"{final_tweet_content}"

---
METADATA:
Author: {author_name} (@{author_handle})
Date: {created_at}
Engagement: {likes} likes, {retweets} retweets
Source: {source} API
"""
    
    title = f"Tweet by {author_name}: {final_tweet_content[:100].replace(chr(10), ' ')}"
    
    return {
        "html": formatted_text,
        "title": title,
        "text": formatted_text
    }

def _format_vxtwitter_data(data: dict) -> dict:
    content_parts = []
    if data.get('text'):
        content_parts.append(data['text'])
        
    if data.get('mediaURLs') or data.get('media_extended'):
        count = max(len(data.get('mediaURLs', [])), len(data.get('media_extended', [])))
        content_parts.append(f"\n[Contains {count} Media Item(s)]")
        
    final_content = "\n\n".join(content_parts) or "[Media-only tweet]"
    
    formatted_text = f"""
TWEET CONTENT:
"{final_content}"

---
METADATA:
Author: {data.get('user_name')} (@{data.get('user_screen_name')})
Date: {data.get('date')}
Engagement: {data.get('likes')} likes, {data.get('retweets')} retweets
Source: vxtwitter API
"""
    
    return {
        "html": formatted_text,
        "title": f"Tweet by {data.get('user_name')}: {final_content[:100].replace(chr(10), ' ')}",
        "text": formatted_text
    }


def find_user_by_phone(phone_number: str) -> Optional[str]:
    """
    Look up user UID by phone number in Firestore
    """
    db = get_db()
    # Normalize phone number (strip 'whatsapp:' prefix if present)
    clean_number = phone_number.replace('whatsapp:', '')
    
    users_ref = db.collection('users')
    query = users_ref.where('phone_number', '==', clean_number).limit(1)
    docs = query.get()
    
    if docs:
        return docs[0].id
    
    print(f"User not found for phone: {clean_number}")
    return None


def save_link_to_firestore(uid: str, link_data: dict) -> str:
    """
    Save a new link document to Firestore
    """
    db = get_db()
    doc_ref = db.collection('users').document(uid).collection('links').document()
    doc_ref.set(link_data)
    return doc_ref.id


def get_user_tags(uid: str) -> list:
    """
    Get all unique tags for a user from Firestore
    """
    db = get_db()
    links_ref = db.collection('users').document(uid).collection('links')
    docs = links_ref.get()
    
    tags = set()
    for doc in docs:
        link_tags = doc.to_dict().get('tags', [])
        for tag in link_tags:
            tags.add(tag)
            
    return sorted(list(tags))


def send_whatsapp_message(to_number: str, body: str):
    """
    Send a WhatsApp message via Twilio
    """
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")
    
    if not account_sid or not auth_token:
        print("Twilio credentials missing")
        return
        
    try:
        client = Client(account_sid, auth_token)
        message = client.messages.create(
            from_=from_number,
            body=body,
            to=to_number
        )
        print(f"Sent message: {message.sid}")
    except Exception as e:
        print(f"Twilio error: {e}")


@https_fn.on_request()
def ping(req: https_fn.Request) -> https_fn.Response:
    """Simple health check function"""
    return https_fn.Response("pong")


@https_fn.on_request()
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
        
        # Fetch existing tags for context
        existing_tags = get_user_tags(uid)
        
        # Analyze with AI
        claude = ClaudeService()
        analysis = claude.analyze_text(scraped["text"] or scraped["html"], existing_tags=existing_tags)
        
        # Build link document
        link_data = {
            "url": url,
            "title": analysis["title"],
            "summary": analysis["summary"],
            "detailedSummary": analysis.get("detailed_summary"),
            "tags": analysis["tags"],
            "category": analysis["category"],
            "status": LinkStatus.UNREAD.value,
            "createdAt": datetime.now().isoformat(),
            "metadata": {
                "originalTitle": scraped["title"],
                "estimatedReadTime": max(1, len(scraped["text"]) // 1500),
                "actionableTakeaway": analysis.get("actionable_takeaway")
            }
        }
        
        # Save to Firestore
        link_id = save_link_to_firestore(uid, link_data)
        
        # Send success message via WhatsApp API
        send_whatsapp_message(payload.from_number, f"✅ Saved: {analysis['title']}\n\nCategory: {analysis['category']}")
        
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
        
        # Send error notification via WhatsApp
        send_whatsapp_message(payload.from_number, f"⚠️ Saved with limited info: {url}\n\nAI analysis encountered an error.")
        
        return {"success": True, "linkId": link_id, "warning": "AI processing failed"}, 200


def calculate_next_reminder(reminder_count: int) -> datetime:
    """
    Calculate the next reminder date using spaced repetition
    Stage 0: 1 day
    Stage 1: 7 days
    Stage 2: 30 days
    Stage 3+: 90 days (quarterly)
    """
    from datetime import timedelta
    
    intervals = {
        0: timedelta(days=1),
        1: timedelta(days=7),
        2: timedelta(days=30),
    }
    
    interval = intervals.get(reminder_count, timedelta(days=90))
    return datetime.now() + interval


@scheduler_fn.on_schedule(schedule="every 1 hours")
def check_reminders(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Scheduled function that runs every hour to check for pending reminders
    Sends WhatsApp messages for links that are due for re-surfacing
    """
    db = get_db()
    
    # Query all users
    users_ref = db.collection('users')
    users = users_ref.get()
    
    for user_doc in users:
        uid = user_doc.id
        user_data = user_doc.to_dict()
        
        # Check if reminders are enabled for this user
        settings = user_data.get('settings', {})
        if not settings.get('reminders_enabled', True):
            continue
            
        phone_number = user_data.get('phone_number')
        if not phone_number:
            continue
        
        # Query links that need reminders
        links_ref = db.collection('users').document(uid).collection('links')
        now = datetime.now()
        
        # Find links where next_reminder_at <= now and reminder_status == 'pending'
        query = links_ref.where('reminder_status', '==', 'pending').where('next_reminder_at', '<=', now).limit(10)
        
        due_links = query.get()
        
        for link_doc in due_links:
            link_id = link_doc.id
            link_data = link_doc.to_dict()
            
            # Send WhatsApp reminder
            title = link_data.get('title', 'Untitled')
            url = link_data.get('url', '')
            reminder_count = link_data.get('reminder_count', 0)
            
            message = f"🧠 Second Brain Reminder\n\nTime to revisit:\n\"{title}\"\n\n{url}\n\n💡 Why now? Research shows spaced repetition strengthens memory retention."
            
            send_whatsapp_message(f"whatsapp:{phone_number}", message)
            
            # Update the link's reminder status
            new_reminder_count = reminder_count + 1
            next_reminder = calculate_next_reminder(new_reminder_count)
            
            # If we've reached the max stages (3), mark as completed
            if new_reminder_count >= 3:
                link_doc.reference.update({
                    'reminder_status': ReminderStatus.COMPLETED.value,
                    'reminder_count': new_reminder_count,
                    'next_reminder_at': None
                })
            else:
                link_doc.reference.update({
                    'reminder_count': new_reminder_count,
                    'next_reminder_at': next_reminder
                })
            
            print(f"Sent reminder for link {link_id} to {phone_number}")


# Local testing relocated to dev_server.py

