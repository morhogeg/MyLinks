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
        # Require a GLOBALLY-ROUTABLE address rather than enumerating a denylist
        # of special ranges. `not ip.is_global` is strictly stronger: it also
        # rejects shared address space (CGNAT 100.64.0.0/10, IPv6 equivalents)
        # and any future special-purpose range the explicit flags below miss,
        # while still catching private / loopback / link-local (metadata
        # 169.254.169.254) / reserved / multicast / unspecified.
        if not ip.is_global:
            raise UnsafeURLError(f"URL resolves to a non-public address: {ip}")


def safe_get(url: str, *, headers: Optional[dict] = None,
             timeout: int = 10, max_redirects: int = 5) -> requests.Response:
    """`requests.get` that re-validates the SSRF guard on every redirect hop.

    `validate_public_url` only checks the URL it's handed, but `requests` follows
    redirects by default — so a public URL could 302 to http://169.254.169.254/
    or an RFC1918 host and the follow-up fetch would happily retrieve it. Here we
    disable automatic redirects and re-validate each Location ourselves before
    following it, preserving legitimate redirects (http→https, shorteners) while
    closing the bypass.

    Residual: a TOCTOU gap remains between DNS resolution and the socket connect
    (DNS rebinding). Pinning the connection to the validated IP would close it
    fully; tracked as a follow-up.
    """
    current = url
    for _ in range(max_redirects + 1):
        validate_public_url(current)
        resp = requests.get(current, headers=headers, timeout=timeout,
                             allow_redirects=False)
        if resp.is_redirect or resp.is_permanent_redirect:
            location = resp.headers.get("Location")
            if not location:
                return resp
            current = requests.compat.urljoin(current, location)
            continue
        return resp
    raise UnsafeURLError("Too many redirects")


# A scraped result whose readable text (whitespace removed) is shorter than this
# is treated as "nothing readable" — a JS shell, a login/paywall gate, or a
# binary document. We degrade honestly rather than feed markup/junk to the model.
_MIN_READABLE_CHARS = 40


def _readable_len(text: Optional[str]) -> int:
    """Length of `text` with all whitespace removed — a cheap 'is there real
    content here?' probe that ignores the scaffolding we add (labels, rules)."""
    if not text:
        return 0
    probe = text.replace("SHARED CAPTION:", "").replace("---", "")
    return len(re.sub(r"\s+", "", probe))


def _unreadable_result(title: str, note: str = "[no text content available]") -> dict:
    """An honest 'this content couldn't be read' result.

    The body is the EXACT ``[no text content available]`` placeholder the
    GROUNDING prompt rule (ai_service.py) recognizes, so the model writes a
    plain "content could not be retrieved" card instead of fabricating a summary
    of unread bytes. Also sets ``truncated=True`` — the SAME channel Facebook
    uses — so ``main._analyze_scraped`` appends the capture note."""
    return {"html": "", "title": title, "text": note, "truncated": True}


def scrape_url(url: str, message_body: Optional[str] = None) -> dict:
    """
    Fetch and extract content from a URL.
    Handles Twitter/X and Instagram URLs specially.

    Returns:
        dict with 'html', 'title', 'text' keys (plus 'truncated' when the
        content could only be partially read, or not read at all).
    """
    try:
        # SSRF guard: block private/internal/metadata targets before any fetch.
        validate_public_url(url)

        # Dispatch on the PARSED HOSTNAME (exact domain or a subdomain of it),
        # never a substring of the raw URL: substring matching lets a hostile
        # host like `instagram.com.evil.test` (or `evil.test/?x=instagram.com`)
        # hijack a platform branch. `_host_is` matches `instagram.com` and
        # `www.instagram.com` but not `instagram.com.evil.test`.
        host = (urlparse(url).hostname or '').lower()

        def _host_is(*domains: str) -> bool:
            return any(host == d or host.endswith('.' + d) for d in domains)

        # PDFs (and other non-HTML documents) can't be read as text by the HTML
        # scraper — the BeautifulSoup pass yields garbled bytes that the model
        # then "summarizes" with confident nonsense. Detect a .pdf URL up front
        # (cheap, no fetch) and degrade honestly. Content-Type is also checked
        # after the fetch below for URLs that don't end in .pdf.
        path = (urlparse(url).path or '').lower()
        if path.endswith('.pdf'):
            logger.info(f"Unreadable content type (.pdf URL): {url}")
            return _unreadable_result("PDF document")

        # Special handling for Twitter/X URLs
        if _host_is('twitter.com', 'x.com'):
            return _scrape_twitter_url(url)

        # Special handling for Instagram URLs
        if _host_is('instagram.com'):
            return _scrape_instagram_url(url, message_body)

        # Special handling for YouTube URLs
        if _host_is('youtube.com', 'youtu.be'):
            return _scrape_youtube_url(url, message_body=message_body)

        # Special handling for LinkedIn URLs (capture the post author's name)
        if _host_is('linkedin.com'):
            return _scrape_linkedin_url(url)

        # Special handling for Facebook URLs (full caption, not just og intro)
        if _host_is('facebook.com', 'fb.watch', 'fb.com'):
            return _scrape_facebook_url(url, message_body)

        # General URL scraping with BeautifulSoup
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
        }
        response = safe_get(url, headers=headers, timeout=10)
        response.raise_for_status()

        # Content-Type honesty: a URL that didn't end in .pdf can still serve a
        # PDF (or other non-HTML document). Reading its bytes as HTML produces
        # junk, so degrade honestly here too rather than hand garbage to the model.
        ctype = (response.headers.get('Content-Type') or '').lower()
        if 'application/pdf' in ctype:
            logger.info(f"Unreadable content type ({ctype}): {url}")
            return _unreadable_result("PDF document")

        html = response.text

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')

        # Extract title
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()

        # Extract text from paragraphs and main content
        text_parts = []
        for p in soup.find_all('p'):
            text_parts.append(p.get_text().strip())

        # Also try to get article content
        article = soup.find('article')
        if article:
            text_parts.append(article.get_text().strip())

        text = " ".join(text_parts).strip()[:5000]

        # `truncated` = we could only read a partial preview, not the real body.
        # It rides the SAME channel Facebook uses; main._analyze_scraped appends
        # the honest "couldn't get the full text" note when it's set.
        truncated = False

        # Fallbacks for JS-gated pages (TikTok, JS shells, SPAs) that carry no
        # <p>/<article> text. First try the body's visible text (scripts/styles
        # stripped): a server-rendered page keeps its real content in divs, so if
        # that's substantial we treat it as the genuine body (NOT truncated).
        if not text:
            for tag in soup(["script", "style", "noscript", "template"]):
                tag.decompose()
            body_text = " ".join(soup.get_text(" ", strip=True).split())[:5000]
            if _readable_len(body_text) >= _MIN_READABLE_CHARS:
                text = body_text
            else:
                # Only the social-preview meta tags are left — a teaser, never the
                # real article. Use it (better than nothing) but flag it truncated
                # so we don't present a preview as the whole thing.
                og_bits = []
                for name in ('og:title', 'og:description', 'twitter:title', 'twitter:description'):
                    tag = soup.find('meta', property=name) or soup.find('meta', attrs={'name': name})
                    if tag and tag.get('content'):
                        og_bits.append(tag['content'].strip())
                text = "\n".join(dict.fromkeys(b for b in og_bits if b))[:5000]
                truncated = True

        # Fold in any caption/text the share carried. For JS-gated pages the
        # on-page extraction is often empty, and this shared text is the only
        # real signal — don't throw it away (the special-cased platforms above
        # already use it; the generic branch historically ignored it).
        if message_body:
            caption_guess = message_body.replace(url, '').strip()
            if caption_guess and len(caption_guess) > 5 and caption_guess not in text:
                text = (f"SHARED CAPTION:\n{caption_guess}\n\n---\n\n{text}").strip()

        # If after every fallback there's still essentially no readable content,
        # this was a JS shell / gated / binary page. Return an honest placeholder
        # (the grounding rule turns it into a "content could not be retrieved"
        # card) instead of hallucinating a summary from raw markup — which is
        # exactly what the old `text or html[:5000]` fallback did.
        if _readable_len(text) < _MIN_READABLE_CHARS:
            logger.info(f"No readable content extracted: {url}")
            return _unreadable_result(title or "")

        return {
            "html": html,
            "title": title,
            "text": text,
            "truncated": truncated,
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
    response = safe_get(url, headers=headers, timeout=12)
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
        response = safe_get(url, headers=headers, timeout=10)
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
            # Poster ONLY for actual VIDEO posts: LinkedIn serves a generic
            # "Posted on LinkedIn" branding og:image even for plain TEXT posts, so
            # we can't blindly trust og:image. Gating on og:type=video / og:video
            # shows a real video thumbnail while a text post stays media-less.
            "video_thumbnail_url": _extract_og_image(soup) if _og_indicates_video(soup, url) else "",
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
            response = safe_get(fx_api_url, timeout=10)
            if response.ok:
                data = response.json()
                if data.get('tweet'):
                    tweet = data['tweet']
                    has_text = bool(tweet.get('text'))
                    has_quote = bool(tweet.get('quote'))
                    has_media = bool(tweet.get('media'))
                    # X Articles (long-form posts) carry NO tweet.text — the body
                    # lives in tweet.article.content.blocks. Without this, an
                    # article would look "empty" here and fall through to a thin
                    # OG-metadata scrape (which makes the AI hallucinate).
                    has_article = bool(tweet.get('article'))

                    if has_text or has_quote or has_media or has_article:
                        return _format_twitter_data(tweet, 'fxtwitter')
        except Exception as e:
            logger.warning(f"fxtwitter failed: {e}")

        # 2. Fallback to vxtwitter.com
        logger.info("fxtwitter failed or empty, trying vxtwitter...")
        vx_api_url = url.replace('twitter.com', 'api.vxtwitter.com').replace('x.com', 'api.vxtwitter.com')

        vx_result = None
        try:
            response = safe_get(vx_api_url, timeout=10)
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

        logger.warning(f"All Twitter extraction methods (fxtwitter/vxtwitter/metadata) failed for {url}")
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
        response = safe_get(url, headers=headers, timeout=10)
        if not response.ok:
            logger.warning(f"Twitter metadata scrape got HTTP {response.status_code} for {url}")
            return {"html": "", "title": "", "text": ""}

        html = response.text

        title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)

        title = title_match.group(1) if title_match else ""
        desc = desc_match.group(1) if desc_match else ""

        if not title and not desc:
            logger.warning(f"Twitter metadata scrape found no og:title/og:description for {url}")
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


def _format_twitter_article(tweet: dict, article: dict, source: str) -> dict:
    """Format an X (Twitter) long-form Article for AI analysis.

    X Articles carry their body in ``article.content.blocks`` (Draft.js blocks),
    NOT in ``tweet.text`` (which is empty). We reconstruct readable, structured
    text — preserving headings and the numbering of ordered lists — so the AI
    sees the real content instead of a "[no text content available]" placeholder.
    """
    title = (article.get('title') or '').strip()

    blocks = (article.get('content') or {}).get('blocks') or []
    lines = []
    ordered_index = 0
    for block in blocks:
        btype = block.get('type') or 'unstyled'
        # Restart list numbering whenever a non-list block interrupts the run.
        if btype != 'ordered-list-item':
            ordered_index = 0

        text = (block.get('text') or '').strip()
        if not text:
            continue

        if btype in ('header-one', 'header-two', 'header-three'):
            lines.append(f"\n## {text}")
        elif btype == 'ordered-list-item':
            ordered_index += 1
            lines.append(f"{ordered_index}. {text}")
        elif btype == 'unordered-list-item':
            lines.append(f"- {text}")
        elif btype == 'blockquote':
            lines.append(f"> {text}")
        else:
            lines.append(text)

    body = "\n".join(lines).strip()

    # Safety net: if the blocks were unexpectedly empty, use the API preview.
    if not body:
        body = (article.get('preview_text') or '').strip()

    author = tweet.get('author', {})
    author_name = author.get('name', 'Unknown')
    author_handle = author.get('screen_name', '')
    created_at = tweet.get('created_at', '')
    likes = tweet.get('likes', 0)
    retweets = tweet.get('retweets', 0)

    formatted_text = f"""X ARTICLE (long-form post)
Title: {title}

{body}

---
METADATA:
Author: {author_name} (@{author_handle})
Date: {created_at}
Engagement: {likes} likes, {retweets} retweets
Source: {source} API (article)
"""

    return {
        "html": formatted_text,
        "title": title or f"Article by {author_name}",
        "text": formatted_text,
    }


def _format_twitter_data(tweet: dict, source: str) -> dict:
    """Format fxtwitter API tweet data for AI analysis."""
    # X Articles (long-form posts) store their body in tweet.article, not in
    # tweet.text — handle them separately so we don't emit an empty placeholder.
    article = tweet.get('article')
    if article:
        return _format_twitter_article(tweet, article, source)

    content_parts = []

    if tweet.get('text'):
        content_parts.append(tweet['text'])

    if tweet.get('quote'):
        q_author = tweet['quote'].get('author', {}).get('name', 'Unknown')
        q_handle = tweet['quote'].get('author', {}).get('screen_name', 'unknown')
        q_text = tweet['quote'].get('text', '')
        content_parts.append(f'\n[Replying to/Quoting {q_author} (@{q_handle})]:\n"{q_text}"')

    image_urls = []
    video_thumbnail_url = ""
    if tweet.get('media'):
        media = tweet['media']
        photos = media.get('photos') or []
        if photos:
            content_parts.append(f"\n[Contains {len(photos)} Image(s)]")
            # Surface the photo URLs so the caller can run vision on the images
            # embedded in the post (fxtwitter photos carry a direct `url`).
            image_urls = [p.get('url') for p in photos if isinstance(p, dict) and p.get('url')]
        videos = media.get('videos') or []
        if videos:
            content_parts.append("\n[Contains Video]")
            # Surface the video's poster frame so the card can SHOW a thumbnail
            # like YouTube. We never run vision on it (it's one frame, not the
            # content) — the caller just re-hosts it as the card banner.
            for v in videos:
                if isinstance(v, dict) and isinstance(v.get('thumbnail_url'), str) and v['thumbnail_url']:
                    video_thumbnail_url = v['thumbnail_url']
                    break

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
        "text": formatted_text,
        "image_urls": image_urls,
        "video_thumbnail_url": video_thumbnail_url,
    }


def _format_vxtwitter_data(data: dict) -> dict:
    """Format vxtwitter API data for AI analysis."""
    content_parts = []
    if data.get('text'):
        content_parts.append(data['text'])

    image_urls = []
    video_thumbnail_url = ""
    if data.get('mediaURLs') or data.get('media_extended'):
        count = max(len(data.get('mediaURLs', [])), len(data.get('media_extended', [])))
        content_parts.append(f"\n[Contains {count} Media Item(s)]")
        # Prefer media_extended (typed) so we run vision only on photos, never on
        # video/gif thumbnails; fall back to mediaURLs when types are absent.
        extended = data.get('media_extended') or []
        if extended:
            image_urls = [m.get('url') for m in extended
                          if isinstance(m, dict) and m.get('type') == 'image' and m.get('url')]
            # A video/gif carries no vision-worthy image, but its poster frame
            # (thumbnail_url) makes a good card banner — surface the first one so
            # video tweets get a thumbnail instead of a blank card.
            for m in extended:
                if (isinstance(m, dict) and m.get('type') in ('video', 'gif')
                        and isinstance(m.get('thumbnail_url'), str) and m['thumbnail_url']):
                    video_thumbnail_url = m['thumbnail_url']
                    break
        else:
            image_urls = [u for u in (data.get('mediaURLs') or []) if isinstance(u, str)]

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
        "text": formatted_text,
        "image_urls": image_urls,
        "video_thumbnail_url": video_thumbnail_url,
    }


# Instagram username charset/length: letters, digits, dot, underscore; ≤30 chars.
_IG_HANDLE_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")

# First path segments on instagram.com that are ROUTES, not profiles — so a
# short-code URL (/p/…, /reel/…) is never mistaken for a username.
_IG_RESERVED_SEGMENTS = frozenset({
    "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct",
    "about", "developer", "legal", "web", "graphql", "api", "oauth", "login",
    "emails", "session", "challenge", "privacy", "terms", "directory", "s", "ar",
})

# Generic tokens IG titles use when there's no real author — never a handle.
_IG_GENERIC_HANDLES = frozenset({"instagram", "login", "video", "reel", "post", "photo"})


def _valid_ig_handle(candidate: Optional[str]) -> Optional[str]:
    """Return a clean IG handle (no leading @) when ``candidate`` is a plausible
    username, else None. Rejects generic labels like 'instagram'."""
    if not candidate:
        return None
    h = candidate.strip().lstrip("@")
    if not _IG_HANDLE_RE.match(h) or h.lower() in _IG_GENERIC_HANDLES:
        return None
    return h


# Month names for the modern IG byline ("- handle on July 12, 2026: …"), which
# carries a date instead of the literal word "Instagram".
_IG_MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|"
    "November|December"
)


def _url_segment_handle(url: str) -> Optional[str]:
    """A handle from a URL's first path segment, but only when that segment is a
    profile (not a short-code route like /p/, /reel/, /tv/, /stories/)."""
    try:
        segs = [s for s in (urlparse(url).path or "").split("/") if s]
    except Exception:
        return None
    if segs and segs[0].lower() not in _IG_RESERVED_SEGMENTS:
        return _valid_ig_handle(segs[0])
    return None


def _extract_instagram_handle(
    url: str, *texts: str, html: Optional[str] = None, og_url: Optional[str] = None
) -> Optional[str]:
    """Best-effort extraction of the Instagram author's @handle.

    Priority (first hit wins):
      1. an explicit ``(@handle)`` in the og:title/description;
      2. a ``<handle> on Instagram`` / ``<handle> on <Month> <day>, <year>``
         byline — a single username token anchored to the start or a separator so
         a multi-word display name never yields a stray word (reels increasingly
         use the date form instead of the literal "Instagram");
      3. an embedded ``"username": "…"`` in the raw page JSON;
      4. an embedded ``"owner": { … "username": "…" }`` in the raw page JSON;
      5. a profile-scoped ``og:url`` / canonical path (og:url sometimes carries
         ``instagram.com/<handle>/reel/…`` even when the visited URL does not);
      6. the visited URL's first path segment when it's a profile.

    Returns the bare handle (no @) or None.
    """
    for text in texts:
        if not text:
            continue
        # 1. "Cristiano Ronaldo (@cristiano) • Instagram photos and videos"
        m = re.search(r"\(@([A-Za-z0-9._]{1,30})\)", text)
        h = _valid_ig_handle(m.group(1)) if m else None
        if h:
            return h
        # 2. "cristiano on Instagram: …" / "… - cristiano on July 12, 2026: …"
        #    Single token anchored to a separator; the tail is the literal word
        #    "Instagram" or a month name (a real date), never an arbitrary word,
        #    so a multi-word display name still can't leak a stray token.
        m = re.search(
            r"(?:^|[-–—|:•·])\s*@?([A-Za-z0-9._]{1,30})\s+on\s+"
            r"(?:Instagram\b|(?:" + _IG_MONTHS + r")\b)",
            text,
            flags=re.I,
        )
        h = _valid_ig_handle(m.group(1)) if m else None
        if h:
            return h

    if html:
        # 3. Embedded JSON: "username": "veryshortphilosophy"
        m = re.search(r'"username"\s*:\s*"([A-Za-z0-9._]{1,30})"', html)
        h = _valid_ig_handle(m.group(1)) if m else None
        if h:
            return h
        # 4. Embedded JSON: "owner": { … "username": "…" }
        m = re.search(
            r'"owner"\s*:\s*\{[^}]*?"username"\s*:\s*"([A-Za-z0-9._]{1,30})"', html
        )
        h = _valid_ig_handle(m.group(1)) if m else None
        if h:
            return h

    # 5. Profile-scoped og:url / canonical path (reuse the URL-segment logic).
    if og_url:
        h = _url_segment_handle(og_url)
        if h:
            return h

    # 6. Visited URL first path segment (profile-scoped URLs only).
    return _url_segment_handle(url)


def _instagram_source_name(
    url: str, *texts: str, html: Optional[str] = None, og_url: Optional[str] = None
) -> Optional[str]:
    """The card ``source_name`` for an Instagram card: ``@handle`` when an author
    handle can be extracted, else None (so the AI's sourceName / plain
    "Instagram" label is used as the fallback).

    Crash-proof: any failure inside handle extraction degrades to None rather
    than breaking the enclosing IG save."""
    try:
        handle = _extract_instagram_handle(url, *texts, html=html, og_url=og_url)
        return f"@{handle}" if handle else None
    except Exception as e:  # pragma: no cover - defensive; runs on every IG save
        logger.warning(f"Instagram handle extraction failed: {e}")
        return None


# Instagram content that is a VIDEO rather than a photo — its og:image is only a
# single poster frame, not the content, so running vision on it is low-value and
# can mislead. Photo posts (/p/) get vision; reels/IGTV don't.
_IG_VIDEO_SEGMENTS = frozenset({"reel", "reels", "tv"})


def _ig_url_is_video(url: str) -> bool:
    """True when the Instagram URL is a reel / IGTV (video), by path segment."""
    try:
        segs = [s for s in (urlparse(url).path or "").split("/") if s]
    except Exception:
        return False
    return any(s.lower() in _IG_VIDEO_SEGMENTS for s in segs)


def _extract_og_image(soup) -> str:
    """Return the og:image / twitter:image URL from a parsed page, or "".

    Instagram exposes the post's cover photo as og:image (the bridge services
    proxy the real media there too). Only http(s) URLs are returned so a relative
    or data: value can't reach the SSRF-guarded fetch as something unexpected.
    """
    for tag_name in ("og:image", "og:image:secure_url", "twitter:image"):
        tag = soup.find('meta', property=tag_name) or soup.find('meta', attrs={'name': tag_name})
        if tag and tag.get('content'):
            content = tag['content'].strip()
            if content.startswith(("http://", "https://")):
                return content
    return ""


# URL path segments that mark a LinkedIn/Facebook link as a VIDEO.
_OG_VIDEO_URL_HINTS = ("fb.watch", "/watch", "/videos/", "/video/", "/reel/", "/reels/")


def _og_indicates_video(soup, url: str = "") -> bool:
    """True when a page's Open Graph metadata (or its URL) marks it as a VIDEO
    post — so its og:image is a real poster frame worth showing as the card
    banner, not the generic branding / link-preview image a TEXT post carries
    (e.g. LinkedIn's "Posted on LinkedIn" card). This is the gate that lets a
    LinkedIn/Facebook VIDEO show a thumbnail while a text post stays media-less.

    Signals, most-authoritative first: og:type = video.*; a present og:video[:*]
    tag; then video-shaped URL segments (fb.watch, /watch, /videos/, /reel(s)/).
    """
    try:
        t = soup.find('meta', property='og:type') or soup.find('meta', attrs={'name': 'og:type'})
        if t and isinstance(t.get('content'), str) and t['content'].strip().lower().startswith('video'):
            return True
        for prop in ('og:video', 'og:video:url', 'og:video:secure_url', 'og:video:type'):
            if soup.find('meta', property=prop):
                return True
    except Exception:
        pass
    u = (url or "").lower()
    return any(h in u for h in _OG_VIDEO_URL_HINTS)


def _scrape_instagram_url(url: str, message_body: Optional[str] = None) -> dict:
    """
    Scrape Instagram URLs using direct scraping first (reliable with mobile headers),
    then fall back to bridges.
    """
    logger.info(f"Analyzing Instagram URL: {url}")

    metadata_lines = []
    best_title = "Instagram Post"
    best_desc = ""
    best_image = ""  # og:image (post cover photo) — fed to vision for photo posts
    raw_html = ""   # kept for embedded-author signals (JSON "username"/"owner")
    og_url = ""     # og:url/canonical often carries a profile-scoped path
    # Reels/IGTV expose only a poster frame as og:image — skip vision for them.
    is_video = _ig_url_is_video(url)
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
        response = safe_get(url, headers=headers, timeout=10)
        if response.ok:
            from bs4 import BeautifulSoup
            raw_html = response.text or ""
            soup = BeautifulSoup(response.text, 'html.parser')

            og_tag = soup.find('meta', property='og:url') or soup.find('meta', attrs={'name': 'og:url'})
            if og_tag and og_tag.get('content'):
                og_url = og_tag['content']

            # Cover photo + a secondary video signal (og:type=video) so a reel
            # served from a profile-style URL is still gated out of vision.
            best_image = _extract_og_image(soup) or best_image
            type_tag = soup.find('meta', property='og:type') or soup.find('meta', attrs={'name': 'og:type'})
            if type_tag and 'video' in (type_tag.get('content') or '').lower():
                is_video = True

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
                response = safe_get(bridge_url, headers=headers, timeout=5)
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

                    # Bridges expose the real media as og:image — prefer it when
                    # the direct scrape didn't yield one (login-walled preview).
                    if not best_image:
                        best_image = _extract_og_image(soup)

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
            metadata_lines.append(f"SHARED CAPTION:\n{caption_guess}")
            if len(caption_guess) > len(best_desc):
                best_desc = caption_guess
            if best_title in generic_titles:
                best_title = caption_guess[:100].split('\n')[0]

    if not metadata_lines and not best_desc:
        return {"html": "", "title": "Instagram Link", "text": "Instagram content (metadata extraction failed)",
                "source_name": _instagram_source_name(url, best_title, best_desc, html=raw_html, og_url=og_url)}

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

    # Feed the cover photo to vision ONLY for photo posts with real metadata (we
    # reached this return, so the scrape wasn't a bare login wall). Reels/IGTV and
    # missing images yield no image_urls, so those cards stay text-only.
    image_urls = [best_image] if (best_image and not is_video) else []

    return {
        "html": final_text,
        "title": best_title,
        "text": final_text,
        "source_name": _instagram_source_name(url, best_title, best_desc, html=raw_html, og_url=og_url),
        "image_urls": image_urls,
        # Instagram is image-first: the cover is usually a screenshot carrying the
        # post's real text, and the caption we scraped is a teaser. Signals the
        # analysis layer to read the image at higher resolution and trust it over
        # the caption. (X posts leave this unset — there the text is primary.)
        "image_primary": True,
        # Reels/IGTV are gated out of vision above (image_urls stays empty), but
        # their og:image poster frame still makes a good card banner — surface it
        # so video posts get a thumbnail like YouTube. Photo posts leave this empty
        # (their cover already flows through image_urls → the vision thumbnail).
        "video_thumbnail_url": best_image if (is_video and best_image) else "",
    }


def _looks_like_fb_login_wall(text: str) -> bool:
    """True when the text is Facebook's logged-out login-wall boilerplate rather
    than real post content. FB serves this intermittently to server-side fetches
    (same URL can return the post one minute and the wall the next). Its
    og:description is a generic CTA — "Log into Facebook to start sharing and
    connecting with your friends, family, and people you know." — which is >20
    chars and not a generic *title*, so it would otherwise sail through as a
    caption and get summarized into a bogus "Facebook Login Page" card. Detect it
    so we can fail honestly instead."""
    t = (text or "").lower()
    return ("log into facebook" in t or "log in to facebook" in t
            or "to start sharing and connecting" in t
            or "see posts, photos and more on facebook" in t)


def _clean_fb_title(raw: Optional[str]) -> tuple:
    """Split a Facebook ``og:title`` into ``(caption, author)``.

    Key insight (verified against live reels/posts): Facebook carries the
    **full** post caption in ``og:title`` — formatted as
    ``"<caption> | <Author> | Facebook"`` and sometimes prefixed with an
    ``"45K views · 389 reactions | "`` engagement blurb — while ``og:description``
    is truncated to ~1–2 lines. So ``og:title`` is by far the richer source for
    analysis; this strips the wrapper so we're left with the real caption (and
    recovers the author name as a bonus). Returns ``("", None)`` for empty input.
    """
    if not raw:
        return "", None
    t = raw.strip()
    # Strip a leading "45K views · 389 reactions | " engagement prefix.
    t = re.sub(r"^\s*[\d.,]+[KM]?\s*views?\s*·\s*[\d.,]+[KM]?\s*reactions?\s*\|\s*",
               "", t, flags=re.I)
    # Strip a trailing " | Facebook".
    t = re.sub(r"\s*\|\s*Facebook\s*$", "", t)
    # A remaining short, single-line trailing " | <Author>" is the author name
    # (real captions put items on newlines / use "/" — they won't match this).
    author = None
    m = re.search(r"\s*\|\s*([^|\n]{2,60})\s*$", t)
    if m:
        author = m.group(1).strip()
        t = t[:m.start()].rstrip()
    return t.strip(), author


def _scrape_facebook_url(url: str, message_body: Optional[str] = None) -> dict:
    """Scrape Facebook post/reel/video URLs.

    Facebook serves a JS-only login wall to server-side requests, so there's no
    post body in the HTML — only Open Graph meta tags. The trap: ``og:description``
    is a truncated preview (~1–2 lines), but the **full caption lives in
    ``og:title``** (see ``_clean_fb_title``). We prefer the cleaned ``og:title``
    so the AI sees the whole post (all itinerary items / recipe steps / tips that
    live below the fold), falling back to ``og:description`` only when og:title is
    missing or generic. Any shared caption from the message body is folded in too.
    """
    logger.info(f"Analyzing Facebook URL: {url}")

    MOBILE_USER_AGENT = ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                         "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")
    generic_titles = ["Facebook", "Log in or sign up to view", "Log into Facebook",
                      "Facebook Watch", "Facebook - log in or sign up"]

    metadata_lines = []
    best_title = "Facebook Post"
    best_desc = ""
    source_name = None
    truncated = False
    fb_image = ""  # video poster — set only for actual VIDEO posts (see below)

    try:
        headers = {
            "User-Agent": MOBILE_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        response = safe_get(url, headers=headers, timeout=10)
        if response.ok:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')

            def _meta(*names):
                for name in names:
                    tag = soup.find('meta', property=name) or soup.find('meta', attrs={'name': name})
                    if tag and tag.get('content'):
                        return tag['content'].strip()
                return ""

            # WHERE the full caption lands depends on the URL shape: reels put it
            # in og:title (wrapped "<caption> | <Author> | Facebook"), while
            # posts/videos/photos often keep the fuller text in og:description and
            # put only the author in og:title. Rather than bet on one tag, gather
            # every candidate, strip the reel-style wrapper off each, and keep the
            # LONGEST real one — this handles all shapes and can never regress
            # (worst case it lands on the same og:description we used before).
            title_caption, author = _clean_fb_title(_meta('og:title', 'twitter:title', 'title'))
            if author and author not in generic_titles:
                source_name = author

            def _is_real_caption(c: str) -> bool:
                # Reject login-wall boilerplate, generic FB titles, and bare
                # author-name lines; a real caption is longer than a name.
                return (bool(c) and c.split('|')[0].strip() not in generic_titles
                        and len(c) > 20 and not _looks_like_fb_login_wall(c))

            og_desc = _meta('og:description', 'twitter:description', 'description')
            candidates = [title_caption, og_desc]
            reals = [c.strip() for c in candidates if _is_real_caption(c)]
            body = max(reals, key=len) if reals else ""

            # Text posts put ONLY the author's name in og:title (no caption
            # wrapper), so _clean_fb_title finds no explicit author. When the body
            # came from og:description and og:title is a short single line, that
            # line IS the author/page name — capture it so posts get a byline too
            # (reels already get theirs from the "| Author |" wrapper).
            if not source_name and title_caption and title_caption != body:
                tc = title_caption.split('|')[0].strip()
                if (tc and '\n' not in tc and 2 <= len(tc) <= 60
                        and tc not in generic_titles and not _looks_like_fb_login_wall(tc)):
                    source_name = tc

            # FB truncates og:description with a trailing "..."; when that preview
            # is the best we got (og:title carried no full caption — i.e. a text
            # post, not a reel), the AI is summarizing only a fragment. Flag it so
            # the caller can tell the user the full post wasn't available.
            truncated = (bool(body) and body == og_desc.strip()
                         and body.rstrip().endswith(("...", "…")))

            if body:
                # Title = the caption's first line (far better than "Facebook Post").
                first_line = body.split('\n', 1)[0].strip()
                if first_line and first_line not in generic_titles:
                    best_title = first_line[:120]
                best_desc = body
                metadata_lines.append(f"POST CAPTION:\n{body}")
                # Poster ONLY for actual VIDEO posts (fb.watch / /watch / /reel /
                # og:type=video): there og:image is a real frame worth showing.
                # A text/photo post's og:image is the generic FB card / login
                # logo, so we leave it off (the user can't tell it apart reliably).
                if _og_indicates_video(soup, url):
                    fb_image = _extract_og_image(soup)
    except Exception as e:
        logger.warning(f"Facebook scrape failed: {e}")

    # Fold in the shared caption from the message body — for recipe/video posts
    # this is often the most complete text (the on-page caption is gated).
    if message_body and url in message_body:
        caption_guess = message_body.replace(url, '').strip()
        if caption_guess and len(caption_guess) > 5:
            metadata_lines.append(f"SHARED CAPTION:\n{caption_guess}")
            if len(caption_guess) > len(best_desc):
                best_desc = caption_guess
            if best_title in generic_titles or best_title == "Facebook Post":
                best_title = caption_guess[:100].split('\n')[0]

    if not metadata_lines and not best_desc:
        # No readable caption — FB served a login wall or nothing. Return a
        # placeholder (the grounding rule turns this into an honest "content could
        # not be retrieved" card instead of summarizing the login page) and flag
        # truncated=True so the caller adds the "save a screenshot" note.
        return {"html": "", "title": "Facebook post", "text": "[no text content available]",
                "source_name": source_name, "truncated": True}

    final_text = "\n\n---\n\n".join(metadata_lines)
    # video_thumbnail_url is set ONLY for actual video posts (gated above); text /
    # photo posts leave it "" and stay media-less, since a generic FB og:image
    # can't be told apart from real content reliably.
    return {"html": final_text, "title": best_title, "text": final_text,
            "source_name": source_name, "truncated": truncated,
            "video_thumbnail_url": fb_image}


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
        resp = safe_get(oembed_url, timeout=8)
        if resp.ok:
            data = resp.json()
            title = data.get("title") or title
            channel = data.get("author_name") or channel
            thumbnail_url = data.get("thumbnail_url") or thumbnail_url
    except Exception as e:
        logger.warning(f"YouTube oEmbed failed: {e}")

    # Best-effort duration for the pre-analysis cost cap (main.py
    # YOUTUBE_MAX_VIDEO_MINUTES). The watch page embeds lengthSeconds in its
    # player config; cloud IPs sometimes get a consent/bot wall instead of the
    # page, so a miss is expected and fine — the cap fails open without it.
    length_seconds = _probe_youtube_duration(watch_url)

    # A caption shared alongside the link is useful context.
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
            "length_seconds": length_seconds,
        },
    }


def _probe_youtube_duration(watch_url: str) -> Optional[int]:
    """Return the video length in seconds from the watch page, or None.

    Reads ``"lengthSeconds":"<n>"`` out of the embedded player response. Never
    raises: any fetch/parse failure returns None so callers treat duration as
    unknown (livestreams also carry no usable lengthSeconds — "0" is treated
    as unknown too).
    """
    try:
        resp = safe_get(watch_url, headers={
            "User-Agent": ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
                           "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                           "Version/16.6 Mobile/15E148 Safari/604.1"),
            "Accept-Language": "en-US,en;q=0.9",
        }, timeout=8)
        if resp.ok:
            m = re.search(r'"lengthSeconds"\s*:\s*"?(\d+)', resp.text)
            if m:
                return int(m.group(1)) or None
    except Exception as e:
        logger.warning(f"YouTube duration probe failed: {e}")
    return None

