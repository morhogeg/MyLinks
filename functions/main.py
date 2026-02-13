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
from datetime import datetime, timedelta
from typing import Optional
from twilio.rest import Client

# Firebase Functions framework
from firebase_functions import https_fn, scheduler_fn, firestore_fn, options
from firebase_admin import initialize_app, firestore

from models import WebhookPayload, LinkDocument, LinkStatus, LinkMetadata, AIAnalysis, ReminderStatus
from ai_service import ClaudeService
from graph_service import GraphService
from search import sync_link_embedding, search_links
from backfill_embeddings import backfill_embeddings




APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")

def get_db():
    global _db
    if _db is None:
        try:
            from firebase_admin import get_app
            get_app()
        except ValueError:
            initialize_app()
        _db = firestore.client()
    return _db


def scrape_url(url: str, message_body: Optional[str] = None) -> dict:
    """
    Fetch and extract content from a URL
    Handles Twitter/X and Instagram URLs specially
    
    Returns:
        dict with 'html', 'title', 'text' keys
    """
    try:
        # Special handling for Twitter/X URLs
        if 'twitter.com' in url or 'x.com' in url:
            return _scrape_twitter_url(url)
            
        # Special handling for Instagram URLs
        if 'instagram.com' in url:
            return _scrape_instagram_url(url, message_body)
        
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


def _scrape_instagram_url(url: str, message_body: Optional[str] = None) -> dict:
    """
    Scrape Instagram URLs using direct scraping first (reliable with mobile headers), then fall back to bridges.
    """
    print(f"Analyzing Instagram URL: {url}")
    
    metadata_lines = []
    best_title = "Instagram Post"
    best_desc = ""
    generic_titles = ["Instagram Post", "Instagram", "Open in App", "Login • Instagram", "Instagram Video", "Instagram Reel"]
    
    # User-Agent that usually gets the meta description from Instagram
    MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"

    # 1. Try direct scrape first (Often contains full caption in meta tags)
    try:
        print("Trying direct Instagram scrape...")
        headers = {
            "User-Agent": MOBILE_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        response = requests.get(url, headers=headers, timeout=10)
        if response.ok:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract meta tags
            meta_sources = {
                'title': ['og:title', 'twitter:title', 'title'],
                'desc': ['og:description', 'twitter:description', 'description']
            }
            
            results = {'title': None, 'desc': None}
            for key, tags in meta_sources.items():
                for tag_name in tags:
                    tag = soup.find('meta', property=tag_name) or soup.find('meta', attrs={'name': tag_name})
                    if tag and tag.get('content'):
                        # Check for the common "Likes, Comments - User on Instagram" pattern
                        content = tag['content']
                        if "Likes," in content and "Comments" in content and "Instagram" in content:
                            # It's a rich description
                            results[key] = content
                            break
                        results[key] = content
                        break

            d_title = results['title'].split('|')[0].strip() if results['title'] else ""
            d_desc = results['desc'] if results['desc'] else ""
            
            if d_title and d_title not in generic_titles:
                best_title = d_title
            if d_desc and len(d_desc) > 20: # Instagram meta desc is usually rich
                best_desc = d_desc
                metadata_lines.append(f"CONTENT DESCRIPTION:\n{d_desc}")
    except Exception as e:
        print(f"Direct scrape failed: {e}")

    # 2. Try bridge services only if direct scrape was "thin"
    if len(best_desc) < 100:
        bridges = ['instagramez.com', 'kkinstagram.com', 'ddinstagram.com']
        for bridge in bridges:
            try:
                bridge_url = url.replace('instagram.com', bridge)
                print(f"Trying Instagram bridge: {bridge_url}")
                headers = {"User-Agent": MOBILE_USER_AGENT}
                response = requests.get(bridge_url, headers=headers, timeout=5)
                if response.ok:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(response.text, 'html.parser')
                    
                    results = {'title': None, 'desc': None}
                    meta_tags = soup.find_all('meta')
                    for tag in meta_tags:
                        prop = tag.get('property', '') or tag.get('name', '')
                        if prop in ['og:description', 'twitter:description', 'description']:
                            results['desc'] = tag.get('content')
                        if prop in ['og:title', 'twitter:title', 'title']:
                            results['title'] = tag.get('content')

                    b_title = results['title'].split('|')[0].strip() if results['title'] else ""
                    b_desc = results['desc'] if results['desc'] else ""
                    
                    # Ignore AliExpress or bridge landing pages
                    if "AliExpress" in b_title or "AliExpress" in b_desc or "Open in App" in b_title:
                        continue

                    if b_desc and len(b_desc) > len(best_desc):
                        best_desc = b_desc
                        metadata_lines.append(f"SECONDARY SOURCE DESCRIPTION:\n{b_desc}")
                        if b_title and b_title not in generic_titles:
                            best_title = b_title
                        if len(best_desc) > 200:
                            break
            except Exception as e:
                print(f"Instagram bridge {bridge} failed: {e}")

    # 3. Incorporate original message body (Often contains shared caption)
    if message_body and url in message_body:
        caption_guess = message_body.replace(url, '').strip()
        noise = ["Check out this reel!", "Watch this reel by", "Instagram post by", "See this post on Instagram", "Watch this video on Instagram"]
        for n in noise:
            caption_guess = caption_guess.replace(n, '').strip()
            
        if caption_guess and len(caption_guess) > 5:
            metadata_lines.append(f"WHATSAPP SHARED CAPTION:\n{caption_guess}")
            if len(caption_guess) > len(best_desc):
                best_desc = caption_guess
            if best_title in generic_titles:
                best_title = caption_guess[:100].split('\n')[0]

    if not metadata_lines and not best_desc:
        return {"html": "", "title": "Instagram Link", "text": "Instagram content (metadata extraction failed)"}

    # Final Title fallback if still generic but we have a description
    if best_title in generic_titles and best_desc:
        # If it's the rich Instagram desc, it might contain the user name
        if " - " in best_desc and " on Instagram: " in best_desc:
            parts = best_desc.split(" on Instagram: ")
            if len(parts) > 1:
                # Use the part AFTER the user name as title
                best_title = parts[1][:100].split('\n')[0].strip('"')
            else:
                best_title = best_desc[:100].split('\n')[0]
        else:
            best_title = best_desc[:100].split('\n')[0]

    final_text = "\n\n---\n\n".join(metadata_lines)
    
    return {
        "html": final_text,
        "title": best_title,
        "text": final_text
    }

def find_user_by_phone(phone_number: str) -> Optional[str]:
    """
    Look up user UID by phone number in Firestore.
    Robust matching: searches both 'phone_number' and 'phoneNumber'.
    """
    db = get_db()
    # Normalize: keep only digits
    clean_number = re.sub(r'\D', '', phone_number)
    
    print(f"Searching for user with normalized phone: {clean_number}")
    
    users_ref = db.collection('users')
    
    # Try all permutations of keys and values (with/without +)
    formats = [f"+{clean_number}", clean_number]
    fields = ['phone_number', 'phoneNumber']
    
    for field in fields:
        for val in formats:
            query = users_ref.where(field, '==', val).limit(1)
            docs = query.get()
            if docs:
                logger.info(f"Found user {docs[0].id} via {field}={val}")
                return docs[0].id
        
    print(f"User not found for phone: {phone_number} (normalized: {clean_number})")
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
        print(f"Twilio credentials missing. Would have sent to {to_number}: {body}")
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


def is_hebrew(text: str) -> bool:
    """Check if text contains Hebrew characters"""
    return any("\u0590" <= char <= "\u05FF" for char in text)

def handle_reminder_intent(text: str) -> Optional[datetime]:
    """Parse text for reminder commands (English and Hebrew)"""
    # Remove URLs first
    text = re.sub(r'https?://[^\s]+', '', text).lower().strip()
    now = datetime.now()
    
    # English Patterns
    if 'tomorrow' in text:
        return now + timedelta(days=1)
    
    if 'next week' in text:
        return now + timedelta(days=7)
    
    match = re.search(r'\bin (\d+) days?', text)
    if match:
        days = int(match.group(1))
        return now + timedelta(days=days)

    # Hebrew Patterns
    if 'מחר' in text:
        return now + timedelta(days=1)
        
    if 'שבוע הבא' in text:
        return now + timedelta(days=7)

    # "בעוד X ימים" or "עוד X ימים"
    match_he = re.search(r'(?:בעוד|עוד)\s+(\d+)\s+ימים', text)
    if match_he:
        days = int(match_he.group(1))
        return now + timedelta(days=days)
        
    # Numeric shortcuts (1, 2, 3) from menu
    # EXACT match only to avoid false positives
    if text.strip() == '1':
        return now + timedelta(days=1)
    if text.strip() == '2':
        return now + timedelta(days=3)
    if text.strip() == '3':
        return now + timedelta(days=7)

    return None

def set_reminder(uid: str, link_id: str, reminder_time: datetime, profile: str = "smart"):
    """Set a reminder for a specific link"""
    db = get_db()
    link_ref = db.collection('users').document(uid).collection('links').document(link_id)
    reminder_time_ms = int(reminder_time.timestamp() * 1000)
    link_ref.update({
        'reminderStatus': 'pending',
        'nextReminderAt': reminder_time_ms,
        'reminderCount': 0,
        'reminderProfile': profile
    })

@https_fn.on_request()
def ping(req: https_fn.Request) -> https_fn.Response:
    """Simple health check function"""
    return https_fn.Response("pong")


import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def log_to_firestore(task_id: str, message: str, level: str = "INFO", data: dict = None):
    """Log a heartbeat to Firestore for visibility"""
    try:
        db = get_db()
        log_entry = {
            "taskId": task_id,
            "message": message,
            "level": level,
            "timestamp": datetime.now().isoformat(),
            "data": data or {}
        }
        db.collection('task_logs').add(log_entry)
        logger.info(f"[{task_id}] {message}")
    except Exception as e:
        logger.error(f"Failed to log to Firestore: {e}")

@https_fn.on_request()
def debug_status(req: https_fn.Request) -> https_fn.Response:
    """
    Public debug endpoint to inspect system state
    """
    try:
        db = get_db()
        
        # 1. Get recent pending tasks
        pending = db.collection('pending_processing').order_by('createdAt', direction='DESCENDING').limit(5).get()
        pending_data = [{**d.to_dict(), "id": d.id} for d in pending]
        
        # 2. Get recent logs
        logs = db.collection('task_logs').order_by('timestamp', direction='DESCENDING').limit(10).get()
        logs_data = [d.to_dict() for d in logs]
        
        # 3. Check for specific user by phone (from env)
        test_phone = "+16462440305"
        user_match = db.collection('users').where('phone_number', '==', test_phone).limit(1).get()
        user_exists = len(user_match) > 0
        
        status = {
            "status": "online",
            "timestamp": datetime.now().isoformat(),
            "environment": {
                "project": os.environ.get("GCLOUD_PROJECT"),
                "has_gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
                "has_twilio_sid": bool(os.environ.get("TWILIO_ACCOUNT_SID")),
            },
            "system_check": {
                "user_exists_16462440305": user_exists,
                "pending_tasks_count": len(pending_data),
            },
            "recent_pending_tasks": pending_data,
            "recent_logs": logs_data
        }
        
        def serialize_firestore(obj):
            if hasattr(obj, 'isoformat'):
                return obj.isoformat()
            if isinstance(obj, dict):
                return {k: serialize_firestore(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [serialize_firestore(i) for i in obj]
            return obj

        status = serialize_firestore(status)
        
        return https_fn.Response(
            json.dumps(status, indent=2),
            mimetype="application/json"
        )
    except Exception as e:
        return https_fn.Response(f"Debug failed: {str(e)}", status=500)

@https_fn.on_request()
def analyze_link(req: https_fn.Request) -> https_fn.Response:
    """
    HTTP endpoint for analyzing URLs immediately (Synchronous)
    Used by the frontend "Add Link" form.
    """
    # Enable CORS
    if req.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return https_fn.Response('', status=204, headers=headers)

    headers = {'Access-Control-Allow-Origin': '*'}

    try:
        data = req.get_json()
        if not data:
            return https_fn.Response(json.dumps({"success": False, "error": "Invalid JSON body"}), status=400, headers=headers)
        
        url = data.get('url')
        existing_tags = data.get('existingTags', [])
        
        if not url:
            return https_fn.Response(json.dumps({"success": False, "error": "URL is required"}), status=400, headers=headers)
            
        logger.info(f"Analyzing URL synchronously: {url}")
        
        # 1. Scrape content
        scraped = scrape_url(url)
        if not scraped.get("text") and not scraped.get("html"):
             return https_fn.Response(json.dumps({"success": False, "error": "Failed to scrape content"}), status=500, headers=headers)

        # 2. Analyze with AI
        claude = ClaudeService()
        analysis = claude.analyze_text(scraped["text"] or scraped["html"], existing_tags=existing_tags)
        
        # 3. Generate Embedding & Find Connections
        # Create a rich text representation for embedding
        embedding_text = f"{analysis.get('title', '')}\n{analysis.get('summary', '')}"
        embedding = claude.embed_text(embedding_text)
        
        # Find related links (if we have a uid context - but here we verify generically first)
        # Note: analyze_link is often called BEFORE saving, so we might not have a UID if it's a public tool. 
        # But typically this is called from the frontend which has auth.
        # However, the current endpoint doesn't extract UID from auth header easily without verify_token.
        # For now, we'll skip DB lookup in this specific endpoint OR we need to pass UID.
        # Front-end typically passes 'uid' in body or we use context.
        
        # Let's check if 'uid' is in data, otherwise skip graph lookup (it will be done on save if we move logic there, but user wants to see it in UI?)
        # If the user wants to see "Related Notes" in the "Add Link" modal *before* saving, we need UID.
        uid = data.get('uid')
        related_links = []
        if uid:
            graph_service = GraphService(get_db())
            related_links = graph_service.find_related_links(
                new_link_id="preview", # Temporary ID
                title=analysis.get("title", ""),
                summary=analysis.get("summary", ""),
                embedding=embedding,
                new_concepts=analysis.get("concepts", []),
                uid=uid
            )

        # 4. Construct Link Object (matching frontend expectation)
        link_data = {
            "url": url,
            "title": analysis.get("title", scraped.get("title", "Untitled")),
            "summary": analysis.get("summary", ""),
            "detailedSummary": analysis.get("detailedSummary", ""),
            "tags": analysis.get("tags", []),
            "category": analysis.get("category", "General"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now().timestamp() * 1000),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": max(1, len(scraped.get("text", "")) // 1500),
                "actionableTakeaway": analysis.get("actionableTakeaway")
            },
            # Expanded fields
            "concepts": analysis.get("concepts", []),
            "embedding_vector": embedding, 
            "relatedLinks": related_links,
            # Enhanced fields
            "sourceType": "web", 
            "sourceName": analysis.get("sourceName"),
            "confidence": 0.8,   
            "keyEntities": []    
        }
        
        return https_fn.Response(json.dumps({"success": True, "link": link_data}), status=200, headers=headers, mimetype='application/json')
        
    except Exception as e:
        return https_fn.Response(json.dumps({"success": False, "error": str(e)}), status=500, headers=headers, mimetype='application/json')


@https_fn.on_request()
def analyze_image(req: https_fn.Request) -> https_fn.Response:
    """
    HTTP endpoint for analyzing Images immediately (Synchronous)
    """
    # Enable CORS
    if req.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return https_fn.Response('', status=204, headers=headers)

    headers = {'Access-Control-Allow-Origin': '*'}

    try:
        data = req.get_json()
        if not data:
            return https_fn.Response(json.dumps({"success": False, "error": "Invalid JSON body"}), status=400, headers=headers)
        
        image_url = data.get('imageUrl')
        existing_tags = data.get('existingTags', [])
        
        if not image_url:
            return https_fn.Response(json.dumps({"success": False, "error": "Image URL is required"}), status=400, headers=headers)
            
        logger.info(f"Analyzing Image: {image_url}")
        
        # 1. Download Image
        try:
            img_response = requests.get(image_url, timeout=20)
            img_response.raise_for_status()
            image_bytes = img_response.content
            mime_type = img_response.headers.get('Content-Type', 'image/jpeg')
        except Exception as e:
            return https_fn.Response(json.dumps({"success": False, "error": f"Failed to download image: {str(e)}"}), status=500, headers=headers)

        # 2. Analyze with AI
        claude = ClaudeService()
        analysis = claude.analyze_image(image_bytes, mime_type, existing_tags=existing_tags)
        
        # 3. Construct Link Object (Adapter for frontend)
        link_data = {
            "url": image_url,
            "title": analysis.get("title", "Image Analysis"),
            "summary": analysis.get("summary", ""),
            "detailedSummary": analysis.get("detailedSummary", ""),
            "tags": analysis.get("tags", []),
            "category": analysis.get("category", "General"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now().timestamp() * 1000),
            "metadata": {
                "originalTitle": "Image Upload",
                "estimatedReadTime": 1,
                "actionableTakeaway": analysis.get("actionableTakeaway")
            },
            "sourceType": "image",
            "sourceName": "Screenshot",
            "confidence": 0.9,
            "keyEntities": []
        }
        
        return https_fn.Response(json.dumps({"success": True, "link": link_data}), status=200, headers=headers, mimetype='application/json')
        
    except Exception as e:
        logger.error(f"Image analysis failed: {e}")
        return https_fn.Response(json.dumps({"success": False, "error": str(e)}), status=500, headers=headers, mimetype='application/json')



@https_fn.on_request()



@https_fn.on_request()
def whatsapp_webhook(request):
    """
    WhatsApp webhook endpoint
    Respond-First Pattern: Saves to pending_processing and returns 200 immediately.
    """
    try:
        if request.content_type == 'application/x-www-form-urlencoded':
            data = request.form.to_dict()
        else:
            data = request.get_json()
        
        logger.info(f"Received webhook payload: {json.dumps(data)}")
        payload = WebhookPayload(**data)
    except Exception as e:
        logger.error(f"Payload parse error: {e}")
        return {"error": f"Invalid payload: {str(e)}"}, 400
    
    db = get_db()
    
    # Find user by phone number
    uid = find_user_by_phone(payload.from_number)
    
    # Normalize UID (remove whatsapp: prefix if present)
    if uid and uid.startswith("whatsapp:"):
        uid = uid.replace("whatsapp:", "")
    
    # Detect language from incoming message
    user_msg_is_hebrew = is_hebrew(payload.body)
    
    if not uid:
        logger.warning(f"Unauthorized number: {payload.from_number}")
        msg = "❌ מצטערים, מספר הטלפון שלך לא מזוהה. אנא וודא שהוא תואם להגדרות." if user_msg_is_hebrew else "❌ Sorry, your phone number is not recognized. Please make sure it matches the number in your Second Brain settings."
        send_whatsapp_message(payload.from_number, msg)
        return {"error": "User not found"}, 403
    
    # Extract URL from message body
    url_match = re.search(r'https?://[^\s]+', payload.body)
    
    if not url_match:
        # Handling conversational commands (Reminders) remains synchronous for instant feedback
        logger.info("No URL found, checking for commands")
        
        # Check for "Reminder" / "תזכורת" keyword first
        msg_lower = payload.body.lower().strip()
        if msg_lower == "reminder" or msg_lower == "תזכורת":
            is_he = (msg_lower == "תזכורת") or user_msg_is_hebrew
            if is_he:
                menu = "מתי להזכיר לך?\n1. מחר\n2. בעוד 3 ימים\n3. בעוד שבוע"
            else:
                menu = "When should I remind you?\n1. Tomorrow\n2. In 3 days\n3. In 1 week"
            send_whatsapp_message(payload.from_number, menu)
            return {"success": True}, 200

        reminder_time = handle_reminder_intent(payload.body)
        
        if reminder_time:
            user_doc = db.collection('users').document(uid).get()
            last_link_id = user_doc.to_dict().get('lastSavedLinkId')
            if last_link_id:
                link_doc = db.collection('users').document(uid).collection('links').document(last_link_id).get()
                if link_doc.exists:
                     # Detect profile from shortcut
                     profile = "spaced" if payload.body.strip() == "2" else "smart"
                     set_reminder(uid, last_link_id, reminder_time, profile=profile)
                     
                     # Get Link Details
                     link_data = link_doc.to_dict()
                     title = link_data.get('title', 'Unknown Link')
                     category = link_data.get('category', 'General')
                     
                     # Format Date
                     date_str = reminder_time.strftime('%d/%m %H:%M') if user_msg_is_hebrew else reminder_time.strftime('%b %d at %I:%M %p')
                     
                     if user_msg_is_hebrew:
                        msg = f"⏰ *התזכורת נקבעה*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}"
                     else:
                        msg = f"⏰ *Reminder Set*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}"
                        
                     send_whatsapp_message(payload.from_number, msg)
                     return {"success": True}, 200
            
            msg = "❌ לא נמצא לינק קודם. שלח לינק קודם!" if user_msg_is_hebrew else "❌ No previous link found. Send a link first!"
            send_whatsapp_message(payload.from_number, msg)
            return {"error": "No context"}, 200
            
        msg = "אני יכול לשמור לינקים או לקבוע תזכורות. נסה לשלוח לינק!" if user_msg_is_hebrew else "I can save links or set reminders. Try sending a URL!"
        send_whatsapp_message(payload.from_number, msg)
        return {"success": True}, 200
        
    # URL FOUND -> Save to pending_processing for Background Processing
    url = url_match.group(0)
    logger.info(f"Queueing URL for processing: {url}")
    
    process_ref = db.collection('pending_processing').document()
    process_ref.set({
        "uid": uid,
        "url": url,
        "fromNumber": payload.from_number,
        "body": payload.body,
        "createdAt": datetime.now().isoformat(),
        "status": "queued",
        "attempts": 0
    })
    
    return {"success": True, "queued": True, "id": process_ref.id}, 200


def _format_success_message(link_data: dict, reminder_time: Optional[datetime] = None, language: str = "en", link_id: Optional[str] = None) -> str:
    """
    Format a rich success message using the final link data structure.
    Supports English ("en") and Hebrew ("he").
    """
    title = link_data.get("title", "Untitled")
    category = link_data.get("category", "General")
    tags = link_data.get("tags", [])
    
    meta = link_data.get("metadata", {})
    read_time = meta.get("estimatedReadTime", 1)
    takeaway = meta.get("actionableTakeaway")
    
    # Emojis for categories
    cat_emoji = "📂"
    if "Recipe" in category: cat_emoji = "🍲"
    elif "Tech" in category: cat_emoji = "💻"
    elif "Health" in category: cat_emoji = "❤️"
    elif "Business" in category: cat_emoji = "💼"
    elif "Science" in category: cat_emoji = "🔬"
    
    # Localization strings
    is_hebrew = language == "he"
    
    lbl_saved = "✅ *נשמר למוח השני*" if is_hebrew else "✅ *Saved to Second Brain*"
    lbl_category = "קטגוריה" if is_hebrew else "Category"
    lbl_read_time = "זמן קריאה" if is_hebrew else "Read Time"
    lbl_min = "דק׳" if is_hebrew else "min"
    lbl_tags = "תגיות" if is_hebrew else "Tags"
    lbl_insight = "💡 *תובנה מרכזית:*" if is_hebrew else "💡 *Key Insight:*"
    lbl_reminder_set = "⏰ *התזכורת נקבעה:*" if is_hebrew else "⏰ *Reminder Set:*"
    lbl_reply_hint = "השב/י עם \"תזכורת\" לקביעת תזכורת." if is_hebrew else "REPLY with \"reminder\" to set a reminder."
    lbl_view_app = "🔗 *פתח במוח השני:*" if is_hebrew else "🔗 *Open in Second Brain:*"
    
    # Format message
    lines = [
        f"{lbl_saved}",
        f"",
        f"📄 *{title}*",
        f"",
        f"{cat_emoji} *{lbl_category}:* {category}",
        f"⏱️ *{lbl_read_time}:* {read_time} {lbl_min}",
        f"🏷️ *{lbl_tags}:* {', '.join([f'#{t}' for t in tags[:3]])}"
    ]
    
    if takeaway:
        lines.append(f"")
        lines.append(f"{lbl_insight}")
        lines.append(f"{takeaway}")
        
    lines.append(f"")
    
    if reminder_time:
        date_str = reminder_time.strftime('%b %d at %I:%M %p')
        lines.append(f"{lbl_reminder_set} {date_str}")
    else:
        lines.append(f"{lbl_reply_hint}")
    
    if link_id:
        lines.append(f"")
        lines.append(f"{lbl_view_app}")
        lines.append(f"{APP_URL}?linkId={link_id}")
        
    return "\n".join(lines)


@firestore_fn.on_document_created(
    document="pending_processing/{doc_id}",
    memory=1024,
    timeout_sec=300
)
def process_link_background(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    """
    Background Task: Scrapes URL, Runs AI analysis, and saves final link.
    Now with status tracking and better logging.
    """
    snapshot = event.data
    if not snapshot:
        logger.error("No snapshot in background trigger")
        return
        
    data = snapshot.to_dict()
    ref = snapshot.reference
    task_id = snapshot.id
    
    uid = data.get("uid")
    url = data.get("url")
    from_number = data.get("fromNumber")
    original_body = data.get("body")
    
    log_to_firestore(task_id, f"Background processing started", data={"url": url, "uid": uid})
    ref.update({"status": "processing", "startedAt": datetime.now().isoformat()})
    
    scraped = {"html": "", "title": "", "text": ""}
    try:
        # 1. Scrape content
        log_to_firestore(task_id, f"Scraping content for: {url}")
        ref.update({"status": "scraping"})
        scraped = scrape_url(url, original_body)
        
        # 2. Analyze with AI
        log_to_firestore(task_id, "Starting AI analysis", data={"scrapedTitle": scraped.get("title")})
        ref.update({"status": "analyzing", "scrapedTitle": scraped.get("title", "")})
        
        db = get_db()
        existing_tags = get_user_tags(uid)
        claude = ClaudeService()
        analysis = claude.analyze_text(scraped["text"] or scraped["html"], existing_tags=existing_tags)
        
        # VALIDATION: Ensure analysis is a dict (AI sometimes returns a list or string)
        if not isinstance(analysis, dict):
            logger.warning(f"AI returned unexpected type: {type(analysis)}. Attempting to fix.")
            if isinstance(analysis, list) and len(analysis) > 0:
                analysis = analysis[0] # Grab first item if it's a list
            
            if not isinstance(analysis, dict):
                raise ValueError(f"AI Analysis failed to return a valid object: {analysis}")

        # 3. Generate Embedding & Find Connections
        embedding_text = f"{analysis.get('title', '')}\n{analysis.get('summary', '')}"
        embedding = claude.embed_text(embedding_text)
        
        graph_service = GraphService(get_db())
        related_links = graph_service.find_related_links(
            new_link_id="pending", # Temp ID
            title=analysis.get("title", ""),
            summary=analysis.get("summary", ""),
            embedding=embedding,
            new_concepts=analysis.get("concepts", []),
            uid=uid
        )

        # 4. Build link document
        final_title = analysis.get("title", scraped.get("title", "Untitled"))
        log_to_firestore(task_id, "Saving processed link to brain", data={"finalTitle": final_title})
        ref.update({"status": "saving"})
        
        link_data = {
            "url": url,
            "title": final_title,
            "summary": analysis.get("summary", "No summary available"),
            "detailedSummary": analysis.get("detailedSummary"),
            "tags": analysis.get("tags", []),
            "concepts": analysis.get("concepts", []),
            "embedding_vector": Vector(embedding), # Store vector directly
            "relatedLinks": related_links,
            "category": analysis.get("category", "General"),
            "sourceName": analysis.get("sourceName"),
            "language": analysis.get("language", "en"),
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now().timestamp() * 1000),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": max(1, len(scraped.get("text", "")) // 1500),
                "actionableTakeaway": analysis.get("actionableTakeaway")
            }
        }
        
        # 4. Save to Firestore
        link_id = save_link_to_firestore(uid, link_data)
        db.collection('users').document(uid).update({'lastSavedLinkId': link_id})
        
        # 5. Check for reminder intent
        reminder_time = handle_reminder_intent(original_body)
        if reminder_time:
             # Detect profile from shortcut
             profile = "spaced" if "2" in original_body else "smart"
             set_reminder(uid, link_id, reminder_time, profile=profile)
        
        msg = _format_success_message(link_data, reminder_time, language=analysis.get("language", "en"), link_id=link_id)
        
        logger.info(f"Processing complete, sending message to {from_number}")
        send_whatsapp_message(from_number, msg)
        
        # Successful cleanup
        ref.delete()
        
    except Exception as e:
        logger.error(f"Background processing error: {e}", exc_info=True)
        ref.update({"status": "failed", "error": str(e)})
        
        # Fallback if AI/Scraping fails completely
        fallback_data = {
            "url": url,
            "title": scraped.get("title", url),
            "summary": f"Cloud processing error: {str(e)}",
            "tags": ["Processing Failed"],
            "category": "Uncategorized",
            "status": LinkStatus.UNREAD.value,
            "createdAt": int(datetime.now().timestamp() * 1000),
            "metadata": {
                "originalTitle": scraped.get("title", ""),
                "estimatedReadTime": 0
            }
        }
        save_link_to_firestore(uid, fallback_data)
        send_whatsapp_message(from_number, f"⚠️ Saved: {url}\n\nNote: Detailed AI analysis encountered an issue ({str(e)[:50]}...).")
        
        # We DON'T delete failed docs immediately now, so we can debug them. 
        # But for auto-cleanup, we might want to. Let's keep them for now.
        # Actually, if we don't delete them, the collection will grow.
        # Let's delete it anyway but after a short delay or just log it.
        # For now, let's keep it for the user to see.


def calculate_next_reminder(reminder_count: int, profile: str = "smart") -> datetime:
    """
    Calculate the next reminder date using spaced repetition
    
    Profiles:
    - smart: 1, 7, 30, 90 days
    - spaced: initial (3), 5, 7 days
    - spaced-N: initial N, then progression
    """
    from datetime import timedelta
    
    if profile.startswith("spaced"):
        start_days = 3
        if "-" in profile:
            try:
                start_days = int(profile.split("-")[1])
            except:
                pass
        
        # Helper for spaced repetition logic
        # Sequence: start -> start+2 -> start+4 ... approximate
        # 3 -> 5 -> 7
        # 5 -> 7 -> 14
        # 7 -> 14 -> 30
        
        days = 90 # default long term
        
        if reminder_count == 0:
            days = start_days
        elif start_days == 3:
            if reminder_count == 1: days = 5
            elif reminder_count == 2: days = 7
        elif start_days == 5:
            if reminder_count == 1: days = 7
            elif reminder_count == 2: days = 14
        elif start_days == 7:
            if reminder_count == 1: days = 14
            elif reminder_count == 2: days = 30
            
        return datetime.now() + timedelta(days=days)
        
    else: # smart
        intervals = {
            0: timedelta(days=1),
            1: timedelta(days=7),
            2: timedelta(days=30),
        }
        interval = intervals.get(reminder_count, timedelta(days=90))
        return datetime.now() + interval

@scheduler_fn.on_schedule(schedule="every 2 minutes")
def check_reminders(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Scheduled function that runs every 2 minutes to check for pending reminders
    """
    run_reminder_check()

def run_reminder_check() -> dict:
    """
    Main logic for checking pending reminders and sending WhatsApp messages
    Returns a summary dict
    """
    db = get_db()
    logger.info("Starting reminder logic execution...")
    
    # Query all users
    users_ref = db.collection('users')
    users = users_ref.get()
    
    report = {
        "users_checked": 0,
        "users_with_reminders_enabled": 0,
        "reminders_found": 0,
        "reminders_sent": 0,
        "errors": []
    }
    
    for user_doc in users:
        uid = user_doc.id
        user_data = user_doc.to_dict()
        report["users_checked"] += 1
        
        # Check if reminders are enabled for this user
        settings = user_data.get('settings', {})
        enabled = settings.get('reminders_enabled', settings.get('remindersEnabled', True))
        
        if not enabled:
            continue
            
        report["users_with_reminders_enabled"] += 1
            
        phone_number = user_data.get('phone_number') or user_data.get('phoneNumber')
        if not phone_number:
            continue
        
        # Query links that need reminders
        links_ref = db.collection('users').document(uid).collection('links')
        now_ms = int(datetime.now().timestamp() * 1000)
        
        # Find links where nextReminderAt <= now_ms and reminderStatus == 'pending'
        # Data Cleanup: Ensure nextReminderAt is always an integer
        all_links_to_clean = links_ref.where('reminderStatus', '==', 'pending').get()
        for l in all_links_to_clean:
            d = l.to_dict()
            nra = d.get('nextReminderAt')
            if hasattr(nra, 'timestamp'): # It's a Firestore Timestamp / datetime
                new_ms = int(nra.timestamp() * 1000)
                l.reference.update({'nextReminderAt': new_ms})
                logger.info(f"Cleaned up nextReminderAt for link {l.id} (converted Timestamp to {new_ms})")

        query = links_ref.where('reminderStatus', '==', 'pending').where('nextReminderAt', '<=', now_ms).limit(10)
        
        try:
            due_links = query.get()
        except Exception as e:
            err_msg = f"Failed to query reminders for user {phone_number}: {e}"
            logger.error(err_msg)
            report["errors"].append(err_msg)
            continue
            
        if due_links:
            logger.info(f"Found {len(due_links)} reminders for user {phone_number}")
            report["reminders_found"] += len(due_links)
        
        for link_doc in due_links:
            link_id = link_doc.id
            link_data = link_doc.to_dict()
            
            # Send WhatsApp reminder
            title = link_data.get('title', 'Untitled')
            url = link_data.get('url', '')
            category = link_data.get('category', 'General')
            reminder_count = link_data.get('reminderCount', 0)
            
            # Richer reminder message
            is_he = is_hebrew(title)
            
            if is_he:
                cat_name = "מתכון" if category == "Recipe" else category
                message = f"🧠 *לולאת המוח השני*\n\nזמן לחזור אל:\n📄 *{title}*\n📂 {cat_name}\n\n{url}\n\n🔗 *פתח במוח השני:*\n{APP_URL}?linkId={link_id}\n\n💡 *למה עכשיו?* חזרה ברווחים מחזקת את הזיכרון לטווח ארוך."
            else:
                cat_emoji = "📂"
                if "Recipe" in category: cat_emoji = "🍲"
                elif "Tech" in category: cat_emoji = "💻"
                
                message = f"🧠 *Second Brain Loop*\n\nTime to revisit:\n📄 *{title}*\n{cat_emoji} {category}\n\n{url}\n\n🔗 *Open in Second Brain:*\n{APP_URL}?linkId={link_id}\n\n💡 *Why now?* Spaced repetition strengthens long-term retention."
            
            try:
                send_whatsapp_message(f"whatsapp:{phone_number}", message)
                report["reminders_sent"] += 1
                
                # Update the link's reminder status
                new_reminder_count = reminder_count + 1
                profile = link_data.get('reminderProfile', 'smart')
                next_reminder = calculate_next_reminder(new_reminder_count, profile=profile)
                next_reminder_ms = int(next_reminder.timestamp() * 1000)
                
                # If we've reached the max stages (3), mark as completed
                if new_reminder_count >= 3:
                    link_doc.reference.update({
                        'reminderStatus': ReminderStatus.COMPLETED.value,
                        'reminderCount': new_reminder_count,
                        'nextReminderAt': None
                    })
                else:
                    link_doc.reference.update({
                        'reminderCount': new_reminder_count,
                        'nextReminderAt': next_reminder_ms
                    })
                
                logger.info(f"Successfully sent reminder for link {link_id} to {phone_number}")
            except Exception as e:
                err_msg = f"Failed to send reminder for link {link_id}: {e}"
                logger.error(err_msg)
                report["errors"].append(err_msg)

    logger.info(f"Reminder execution complete. Report: {report}")
    return report

@https_fn.on_request()
def force_check_reminders(req: https_fn.Request) -> https_fn.Response:
    """
    Manual trigger for reminder check to debug without waiting for schedule
    """
    try:
        report = run_reminder_check()
        return https_fn.Response(json.dumps(report, indent=2), status=200, mimetype="application/json")
    except Exception as e:
        logger.error(f"Manual trigger failed: {e}")
        return https_fn.Response(f"Error: {e}", status=500)



# Local testing relocated to dev_server.py

