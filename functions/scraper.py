"""
URL Scraping Service
Handles content extraction from URLs including special handling
for Twitter/X, Instagram, and YouTube.
"""

import re
import socket
import ipaddress
import requests
import logging
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class UnsafeURLError(ValueError):
    """Raised when a URL resolves to a private/internal address (SSRF guard)."""


def validate_public_url(url: str) -> None:
    """Reject URLs that point at private, loopback, or cloud-metadata addresses.

    Server-side fetches of user-supplied URLs are an SSRF vector: without this
    an attacker could make the function request http://169.254.169.254/ (cloud
    metadata) or internal RFC1918 hosts. We require http(s) and verify every
    resolved IP is global/public before any request is made.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Unsupported URL scheme: {parsed.scheme!r}")

    host = parsed.hostname
    if not host:
        raise UnsafeURLError("URL has no host")

    try:
        addrinfos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise UnsafeURLError(f"Could not resolve host: {host}") from e

    for family, _, _, _, sockaddr in addrinfos:
        ip = ipaddress.ip_address(sockaddr[0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            raise UnsafeURLError(f"URL resolves to a non-public address: {ip}")


def scrape_url(url: str, message_body: Optional[str] = None) -> dict:
    """
    Fetch and extract content from a URL.
    Handles Twitter/X and Instagram URLs specially.

    Returns:
        dict with 'html', 'title', 'text' keys
    """
    try:
        # SSRF guard: block private/internal/metadata targets before any fetch.
        validate_public_url(url)

        # Special handling for Twitter/X URLs
        if 'twitter.com' in url or 'x.com' in url:
            return _scrape_twitter_url(url)

        # Special handling for Instagram URLs
        if 'instagram.com' in url:
            return _scrape_instagram_url(url, message_body)

        # Special handling for YouTube URLs
        if 'youtube.com' in url or 'youtu.be' in url:
            return _scrape_youtube_url(url, message_body=message_body)

        # Special handling for LinkedIn URLs (capture the post author's name)
        if 'linkedin.com' in url:
            return _scrape_linkedin_url(url)

        # Special handling for Facebook URLs (full caption, not just og intro)
        if 'facebook.com' in url or 'fb.watch' in url or 'fb.com' in url:
            return _scrape_facebook_url(url, message_body)

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

        # Fold in any caption/text the share carried. For JS-gated pages the
        # on-page extraction is often empty, and this shared text is the only
        # real signal — don't throw it away (the special-cased platforms above
        # already use it; the generic branch historically ignored it).
        if message_body:
            caption_guess = message_body.replace(url, '').strip()
            if caption_guess and len(caption_guess) > 5 and caption_guess not in text:
                text = (f"SHARED CAPTION:\n{caption_guess}\n\n---\n\n{text}").strip()

        return {
            "html": html,
            "title": title,
            "text": text or html[:5000]
        }

    except Exception as e:
        logger.error(f"Scrape error for {url}: {e}")
        return {"html": "", "title": "", "text": ""}


def extract_readable_article(url: str) -> dict:
    """Extract clean, paragraph-structured article text for in-app reading.

    Unlike `scrape_url` (which space-joins paragraphs and truncates hard for AI
    analysis), this preserves block structure and keeps the full body so the
    reader renders like a real article. Returns:
        { "title": str, "paragraphs": [{"type": "p|h2|h3|li|blockquote", "text": str}] }
    """
    # SSRF guard: block private/internal/metadata targets before any fetch.
    validate_public_url(url)

    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) "
                      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
    }
    response = requests.get(url, headers=headers, timeout=12)
    response.raise_for_status()

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(response.text, "html.parser")

    # Strip non-content noise so the reader isn't polluted with menus/scripts.
    for tag in soup(["script", "style", "noscript", "nav", "footer",
                     "aside", "header", "form", "svg", "button"]):
        tag.decompose()

    # Title: prefer og:title, fall back to <title>.
    title = ""
    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        title = og["content"].strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()

    # Prefer the semantic <article>/<main> region; otherwise the whole body.
    root = soup.find("article") or soup.find("main") or soup.body or soup

    paragraphs = []
    seen = set()
    for el in root.find_all(["p", "h2", "h3", "li", "blockquote"]):
        text = el.get_text(" ", strip=True)
        if len(text) < 2:
            continue
        # Drop exact duplicates (sites often repeat content blocks).
        if text in seen:
            continue
        seen.add(text)
        paragraphs.append({"type": el.name, "text": text})

    # Trim leading nav-ish list items (e.g. "Article / Talk" tabs) that appear
    # before the first real paragraph — in-article lists always follow prose.
    first_p = next((i for i, p in enumerate(paragraphs)
                    if p["type"] in ("p", "blockquote")), None)
    if first_p:
        paragraphs = [p for i, p in enumerate(paragraphs)
                      if not (i < first_p and p["type"] == "li")]

    return {
        "title": title,
        "paragraphs": paragraphs[:400],  # bound pathologically long pages
    }


def _extract_linkedin_author(html: str) -> Optional[str]:
    """Pull the post author's display name from LinkedIn meta tags.

    LinkedIn post previews title as "<Author> on LinkedIn: …", which gives us
    the real name (e.g. "Mark Manson") that the URL slug can't always recover.
    """
    import html as html_lib

    candidates = []
    for prop in ('og:title', 'twitter:title'):
        m = re.search(
            r'<meta[^>]+(?:property|name)=["\']' + prop + r'["\'][^>]+content=["\']([^"\']*)',
            html, re.I,
        )
        if m:
            candidates.append(m.group(1))
    tm = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
    if tm:
        candidates.append(tm.group(1))

    for c in candidates:
        c = html_lib.unescape(c).strip()
        m = re.match(r'^(.{2,60}?)\s+on LinkedIn\b', c, re.I)
        if m:
            author = m.group(1).strip(' :-|')
            if author and author.lower() != 'linkedin':
                return author
    return None


def _scrape_linkedin_url(url: str) -> dict:
    """Scrape a LinkedIn URL and capture the author's display name."""
    logger.info(f"Analyzing LinkedIn URL: {url}")
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        html = response.text

        from bs4 import BeautifulSoup
        import html as html_lib
        soup = BeautifulSoup(html, 'html.parser')

        title = soup.title.string.strip() if soup.title and soup.title.string else ""

        text_parts = []
        og_desc = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']*)', html, re.I)
        if og_desc:
            text_parts.append(html_lib.unescape(og_desc.group(1)))
        for p in soup.find_all('p'):
            text_parts.append(p.get_text().strip())
        text = " ".join([t for t in text_parts if t])[:5000]

        return {
            "html": html,
            "title": title,
            "text": text or html[:5000],
            "source_name": _extract_linkedin_author(html),
        }
    except Exception as e:
        logger.error(f"LinkedIn scrape error for {url}: {e}")
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


def _scrape_facebook_url(url: str, message_body: Optional[str] = None) -> dict:
    """Scrape Facebook post/reel/video URLs.

    Facebook serves a JS-only login wall to server-side requests, so the
    generic article path comes up empty and falls back to raw HTML — which
    only surfaces the truncated og:description (the caption's first line). For
    a recipe post that first line is usually the author's personal framing
    ("since I went keto…"), not the dish, so we pull the FULL og:description
    caption and fold in any shared caption text from the message body. The
    actual recipe (ingredients/steps) typically lives lower in that caption.
    """
    logger.info(f"Analyzing Facebook URL: {url}")

    MOBILE_USER_AGENT = ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                         "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")
    generic_titles = ["Facebook", "Log in or sign up to view", "Log into Facebook",
                      "Facebook Watch", "Facebook - log in or sign up"]

    metadata_lines = []
    best_title = "Facebook Post"
    best_desc = ""

    try:
        headers = {
            "User-Agent": MOBILE_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        response = requests.get(url, headers=headers, timeout=10)
        if response.ok:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')

            def _meta(*names):
                for name in names:
                    tag = soup.find('meta', property=name) or soup.find('meta', attrs={'name': name})
                    if tag and tag.get('content'):
                        return tag['content'].strip()
                return ""

            d_title = _meta('og:title', 'twitter:title', 'title')
            d_desc = _meta('og:description', 'twitter:description', 'description')

            if d_title and d_title.split('|')[0].strip() not in generic_titles:
                best_title = d_title.split('|')[0].strip()
            if d_desc and len(d_desc) > 20:
                best_desc = d_desc
                metadata_lines.append(f"POST CAPTION:\n{d_desc}")
    except Exception as e:
        logger.warning(f"Facebook scrape failed: {e}")

    # Fold in the shared caption from the message body — for recipe/video posts
    # this is often the most complete text (the on-page caption is gated).
    if message_body and url in message_body:
        caption_guess = message_body.replace(url, '').strip()
        if caption_guess and len(caption_guess) > 5:
            metadata_lines.append(f"WHATSAPP SHARED CAPTION:\n{caption_guess}")
            if len(caption_guess) > len(best_desc):
                best_desc = caption_guess
            if best_title in generic_titles or best_title == "Facebook Post":
                best_title = caption_guess[:100].split('\n')[0]

    if not metadata_lines and not best_desc:
        return {"html": "", "title": "Facebook Link", "text": "Facebook content (metadata extraction failed)"}

    final_text = "\n\n---\n\n".join(metadata_lines)
    return {"html": final_text, "title": best_title, "text": final_text}


def _extract_youtube_id(url: str) -> Optional[str]:
    """Extract the 11-char video ID from any common YouTube URL shape
    (watch?v=, youtu.be/, /shorts/, /embed/, /live/)."""
    patterns = [
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"[?&]v=([A-Za-z0-9_-]{11})",
        r"/shorts/([A-Za-z0-9_-]{11})",
        r"/embed/([A-Za-z0-9_-]{11})",
        r"/live/([A-Za-z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def _scrape_youtube_url(url: str, message_body: Optional[str] = None) -> dict:
    """
    Resolve a YouTube URL to lightweight, reliable metadata only.

    Deep content understanding is handled separately by Gemini's native video
    ingestion (see ai_service.GeminiService.analyze_youtube), which fetches and
    watches the video on Google's own infrastructure. We deliberately do NOT
    scrape transcripts here: YouTube blocks cloud/datacenter IPs (Cloud
    Functions), so server-side transcript fetching is unreliable and the old
    approach fell back to fabricated summaries. oEmbed + the deterministic
    thumbnail URL are not IP-blocked and need no API key.
    """
    logger.info(f"Resolving YouTube URL: {url}")

    video_id = _extract_youtube_id(url)
    if not video_id:
        logger.warning("Could not extract YouTube video ID")
        return {"html": "", "title": "YouTube Video", "text": ""}

    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    title = "YouTube Video"
    channel = "YouTube"
    # hqdefault always exists; oEmbed may upgrade this to the real thumbnail.
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

    # oEmbed: title + channel + thumbnail (no API key, not IP-blocked).
    try:
        oembed_url = f"https://www.youtube.com/oembed?url={watch_url}&format=json"
        resp = requests.get(oembed_url, timeout=8)
        if resp.ok:
            data = resp.json()
            title = data.get("title") or title
            channel = data.get("author_name") or channel
            thumbnail_url = data.get("thumbnail_url") or thumbnail_url
    except Exception as e:
        logger.warning(f"YouTube oEmbed failed: {e}")

    # A caption shared alongside the link (e.g. via WhatsApp) is useful context.
    shared_note = ""
    if message_body:
        body_clean = message_body.replace(url, "").strip()
        if body_clean:
            shared_note = body_clean.split("\n")[0].strip(" -:\"")[:200]

    # Minimal text — used only for embeddings and the honest metadata-only
    # fallback when native video analysis is unavailable (private/over-quota).
    formatted_text = (
        f"YOUTUBE VIDEO\nTitle: {title}\nChannel: {channel}\nURL: {watch_url}"
        + (f"\nShared note: {shared_note}" if shared_note else "")
    )

    return {
        "html": formatted_text,
        "title": title,
        "text": formatted_text,
        "content_type": "youtube",
        "youtube_metadata": {
            "video_id": video_id,
            "watch_url": watch_url,
            "channel": channel,
            "thumbnail_url": thumbnail_url,
        },
    }

