"""
URL Scraping Service
Handles content extraction from URLs including special handling
for Twitter/X, Instagram, and YouTube.
"""

import re
import requests
import logging
from typing import Optional

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled

logger = logging.getLogger(__name__)


def scrape_url(url: str, message_body: Optional[str] = None) -> dict:
    """
    Fetch and extract content from a URL.
    Handles Twitter/X and Instagram URLs specially.

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

        # Special handling for YouTube URLs
        if 'youtube.com' in url or 'youtu.be' in url:
            return _scrape_youtube_url(url)

        # General URL scraping with BeautifulSoup
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        html = response.text

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

    except Exception as e:
        logger.error(f"Scrape error for {url}: {e}")
        return {"html": "", "title": "", "text": ""}


def _scrape_twitter_url(url: str) -> dict:
    """
    Scrape Twitter/X URLs using the fxtwitter.com API.

    Returns:
        dict with 'html', 'title', 'text' keys formatted for AI analysis
    """
    logger.info(f"Analyzing Twitter URL: {url}")

    try:
        # 1. Try fxtwitter.com API first
        fx_api_url = url.replace('twitter.com', 'api.fxtwitter.com').replace('x.com', 'api.fxtwitter.com')
        logger.info(f"Attempting fxtwitter API: {fx_api_url}")

        try:
            response = requests.get(fx_api_url, timeout=10)
            if response.ok:
                data = response.json()
                if data.get('tweet'):
                    tweet = data['tweet']
                    has_text = bool(tweet.get('text'))
                    has_quote = bool(tweet.get('quote'))
                    has_media = bool(tweet.get('media'))

                    if has_text or has_quote or has_media:
                        return _format_twitter_data(tweet, 'fxtwitter')
        except Exception as e:
            logger.warning(f"fxtwitter failed: {e}")

        # 2. Fallback to vxtwitter.com
        logger.info("fxtwitter failed or empty, trying vxtwitter...")
        vx_api_url = url.replace('twitter.com', 'api.vxtwitter.com').replace('x.com', 'api.vxtwitter.com')

        vx_result = None
        try:
            response = requests.get(vx_api_url, timeout=10)
            if response.ok:
                data = response.json()

                has_media = bool(data.get('mediaURLs') or data.get('media_extended'))
                text_len = len(data.get('text', ''))

                if has_media or text_len > 100:
                    return _format_vxtwitter_data(data)

                logger.info("vxtwitter content found but 'thin' (no media, short text). Attempting scrape...")
                vx_result = _format_vxtwitter_data(data)

        except Exception as e:
            logger.warning(f"vxtwitter failed: {e}")

        # 3. Final Fallback: Direct metadata scrape (Twitter Article support)
        logger.info("APIs failed/thin. Trying direct metadata scrape...")
        scrape_result = _scrape_twitter_metadata(url)

        if scrape_result.get('title') or scrape_result.get('text'):
            return scrape_result

        if vx_result:
            logger.info("Scrape failed, reverting to thin vxtwitter result")
            return vx_result

        return {"html": "", "title": "", "text": ""}

    except Exception as e:
        logger.error(f"Twitter scrape error: {e}")
        return {"html": "", "title": "", "text": ""}


def _scrape_twitter_metadata(url: str) -> dict:
    """Scrape OpenGraph tags for Twitter Articles."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        }
        response = requests.get(url, headers=headers, timeout=10)
        if not response.ok:
            return {"html": "", "title": "", "text": ""}

        html = response.text

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
        logger.warning(f"Metadata scrape failed: {e}")
        return {"html": "", "title": "", "text": ""}


def _format_twitter_data(tweet: dict, source: str) -> dict:
    """Format fxtwitter API tweet data for AI analysis."""
    content_parts = []

    if tweet.get('text'):
        content_parts.append(tweet['text'])

    if tweet.get('quote'):
        q_author = tweet['quote'].get('author', {}).get('name', 'Unknown')
        q_handle = tweet['quote'].get('author', {}).get('screen_name', 'unknown')
        q_text = tweet['quote'].get('text', '')
        content_parts.append(f'\n[Replying to/Quoting {q_author} (@{q_handle})]:\n"{q_text}"')

    if tweet.get('media'):
        media = tweet['media']
        if media.get('photos'):
            content_parts.append(f"\n[Contains {len(media['photos'])} Image(s)]")
        if media.get('videos'):
            content_parts.append("\n[Contains Video]")

    final_tweet_content = "\n\n".join(content_parts) or "[Media-only tweet or no text content available]"

    author = tweet.get('author', {})
    author_name = author.get('name', 'Unknown')
    author_handle = author.get('screen_name', '')
    created_at = tweet.get('created_at', '')
    likes = tweet.get('likes', 0)
    retweets = tweet.get('retweets', 0)

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
    """Format vxtwitter API data for AI analysis."""
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
    Scrape Instagram URLs using direct scraping first (reliable with mobile headers),
    then fall back to bridges.
    """
    logger.info(f"Analyzing Instagram URL: {url}")

    metadata_lines = []
    best_title = "Instagram Post"
    best_desc = ""
    generic_titles = ["Instagram Post", "Instagram", "Open in App", "Login • Instagram", "Instagram Video", "Instagram Reel"]

    MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"

    # 1. Try direct scrape first
    try:
        logger.info("Trying direct Instagram scrape...")
        headers = {
            "User-Agent": MOBILE_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        response = requests.get(url, headers=headers, timeout=10)
        if response.ok:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')

            meta_sources = {
                'title': ['og:title', 'twitter:title', 'title'],
                'desc': ['og:description', 'twitter:description', 'description']
            }

            results = {'title': None, 'desc': None}
            for key, tags in meta_sources.items():
                for tag_name in tags:
                    tag = soup.find('meta', property=tag_name) or soup.find('meta', attrs={'name': tag_name})
                    if tag and tag.get('content'):
                        content = tag['content']
                        if "Likes," in content and "Comments" in content and "Instagram" in content:
                            results[key] = content
                            break
                        results[key] = content
                        break

            d_title = results['title'].split('|')[0].strip() if results['title'] else ""
            d_desc = results['desc'] if results['desc'] else ""

            if d_title and d_title not in generic_titles:
                best_title = d_title
            if d_desc and len(d_desc) > 20:
                best_desc = d_desc
                metadata_lines.append(f"CONTENT DESCRIPTION:\n{d_desc}")
    except Exception as e:
        logger.warning(f"Direct scrape failed: {e}")

    # 2. Try bridge services only if direct scrape was "thin"
    if len(best_desc) < 100:
        bridges = ['instagramez.com', 'kkinstagram.com', 'ddinstagram.com']
        for bridge in bridges:
            try:
                bridge_url = url.replace('instagram.com', bridge)
                logger.info(f"Trying Instagram bridge: {bridge_url}")
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
                logger.warning(f"Instagram bridge {bridge} failed: {e}")

    # 3. Incorporate original message body
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

    # Final Title fallback
    if best_title in generic_titles and best_desc:
        if " - " in best_desc and " on Instagram: " in best_desc:
            parts = best_desc.split(" on Instagram: ")
            if len(parts) > 1:
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


def _scrape_youtube_url(url: str) -> dict:
    """Scrape YouTube video metadata and transcript."""
    logger.info(f"Analyzing YouTube URL: {url}")

    try:
        # 1. Extract Video ID
        video_id = None
        if "youtu.be" in url:
            video_id = url.split("/")[-1].split("?")[0]
        elif "v=" in url:
            video_id = url.split("v=")[1].split("&")[0]

        if not video_id:
            logger.warning("Could not extract video ID")
            return {"html": "", "title": "YouTube Video", "text": ""}

        logger.info(f"Video ID: {video_id}")

        # 2. Get Metadata via lightweight scrape
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }

        response = requests.get(url, headers=headers, timeout=10)
        html = response.text

        title = "YouTube Video"
        author = "Unknown Channel"
        description = ""

        t_match = re.search(r'<meta name="title" content="([^"]+)">', html)
        if t_match:
            title = t_match.group(1)

        d_match = re.search(r'<meta name="description" content="([^"]+)">', html)
        if d_match:
            description = d_match.group(1)

        a_match = re.search(r'<link itemprop="name" content="([^"]+)">', html)
        if a_match:
            author = a_match.group(1)

        logger.info(f"Metadata found: {title} by {author}")

        # 3. Get Transcript
        transcript_text = ""
        try:
            yt_api = YouTubeTranscriptApi()
            transcript_list = yt_api.fetch(video_id)
            lines = [t.text for t in transcript_list]
            transcript_text = " ".join(lines)
            logger.info(f"Transcript found, length: {len(transcript_text)}")
        except TranscriptsDisabled:
            logger.info("Transcripts are disabled for this video")
            transcript_text = "[Transcript disabled by uploader]"
        except Exception as e:
            logger.warning(f"Transcript extraction failed: {e}")
            transcript_text = "[Transcript unavailable]"

        # 4. Format for AI Analysis
        formatted_text = f"""
VIDEO METADATA:
Title: {title}
Channel: {author}
Description: {description}

---
TRANSCRIPT:
{transcript_text[:25000]}
"""

        return {
            "html": formatted_text,
            "title": title,
            "text": formatted_text
        }

    except Exception as e:
        logger.error(f"YouTube scrape error: {e}")
        return {"html": "", "title": "YouTube Video", "text": ""}
