"""Publish-time content check for public share pages (App Review 1.2).

A public page (/s card, /c collection, /a Ask answer) is the one place where
something a user wrote or uploaded reaches other people, and the snapshot is
client-built (share_service._publish_share_logic only allowlists and clips
it). Apple's guideline 1.2 asks for "a method for filtering objectionable
material from being posted", so every publish runs the page's text, plus any
image it would show, past Gemini before the page goes live.

What is judged: exactly what the page would show. Card: title, summary,
detailed summary, tags and its hero image. Collection: name, description,
each member's title and summary, and the first `_MAX_IMAGES` thumbnails (the
cover mosaic). Answer: question, answer and source titles.

Fail-open by design: a Gemini outage, timeout or unparseable reply lets the
page publish (logged), because a broken Share button is a worse failure for a
personal library than an unchecked page that is still reportable (every page
carries a Report link) and removable (tools/takedown_share.py). Only a clear
"not allowed" verdict, or Gemini refusing the input outright, blocks a
publish. `SHARE_MODERATION=off` disables the check entirely.
"""

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

REFUSAL_MESSAGE = ("This can't be shared publicly because it may break Machina's "
                   "content rules. It's still saved in your library.")

# Long enough for a full card or answer page; a 200-card collection is judged
# on its first ~24k characters, which is where its title, description and
# leading items are.
_MAX_TEXT_CHARS = 24000
_MAX_IMAGES = 4
_IMAGE_MAX_BYTES = 6 * 1024 * 1024
_CALL_TIMEOUT_MS = 15000

_PROMPT = """You review content that a user of a personal knowledge app wants to publish as a public, read-only web page.

Decide whether it may be published. Refuse ONLY clear cases of:
- sexually explicit content or nudity, and any sexual content involving minors
- hate speech, or slurs attacking people for a protected trait
- harassment, threats or bullying aimed at a real, identifiable person
- graphic violence or gore
- promotion or instructions for self-harm, suicide, terrorism or violent extremism
- instructions that enable serious harm (weapons, explosives, hard drugs)

Allow everything else, including news, education, health, history, politics, fiction, and summaries or discussion OF the topics above. When unsure, allow.

Reply as JSON: {"allowed": true or false, "category": one short label, or "" when allowed}."""


def _enabled() -> bool:
    return (os.environ.get("SHARE_MODERATION") or "on").strip().lower() not in ("off", "0", "false", "no")


def _card_text(card: dict) -> list:
    parts = [card.get("title"), card.get("summary"), card.get("detailedSummary")]
    tags = card.get("tags")
    if isinstance(tags, list) and tags:
        parts.append("Tags: " + ", ".join(str(t) for t in tags))
    return [str(p) for p in parts if p]


def page_text(share_type: str, doc: dict) -> str:
    """Everything the public page would print, as one block of text."""
    lines = []
    if share_type == "card":
        lines += _card_text(doc.get("card") or {})
    elif share_type == "collection":
        lines += [str(v) for v in (doc.get("name"), doc.get("description")) if v]
        for c in doc.get("cards") or []:
            if isinstance(c, dict):
                lines += _card_text(c)
    elif share_type == "answer":
        lines += [str(v) for v in (doc.get("question"), doc.get("answer")) if v]
        for s in doc.get("sources") or []:
            if isinstance(s, dict) and s.get("title"):
                lines.append(str(s["title"]))
    return "\n\n".join(lines)[:_MAX_TEXT_CHARS]


def shown_image_urls(share_type: str, doc: dict) -> list:
    """The images the page will display prominently: a card's hero, or the
    first `_MAX_IMAGES` thumbnails of a collection (its cover mosaic). Every
    one is a client-supplied URL, so a link card's "thumbnail" could be any
    picture at all; hidden images are never on the page, so never fetched."""
    from share_service import _card_thumb
    if share_type == "card":
        cards = [doc.get("card") or {}]
    elif share_type == "collection":
        cards = [c for c in (doc.get("cards") or []) if isinstance(c, dict)]
    else:
        return []
    urls = []
    for c in cards:
        u = _card_thumb(c)
        if isinstance(u, str) and u.startswith("https://") and u not in urls:
            urls.append(u)
        if len(urls) >= _MAX_IMAGES:
            break
    return urls


def _fetch_image(url: str) -> Optional[tuple]:
    """(bytes, mime) through the scraper's SSRF guard, or None. The URL is
    client-supplied, so it gets the same guard as any capture URL."""
    try:
        from scraper import safe_get
        resp = safe_get(url, timeout=5, max_bytes=_IMAGE_MAX_BYTES)
        resp.raise_for_status()
        content = resp.content
        mime = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if not content or len(content) > _IMAGE_MAX_BYTES or not mime.startswith("image/"):
            return None
        return content, mime
    except Exception as e:
        logger.warning("Share moderation: image fetch skipped: %s", type(e).__name__)
        return None


def _client():
    from google import genai
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    return genai.Client(api_key=key, http_options={"timeout": _CALL_TIMEOUT_MS})


def _verdict(response) -> Optional[bool]:
    """True allowed / False refused / None no usable verdict (fail open).
    Gemini refusing the INPUT itself (prompt_feedback.block_reason) counts as
    refused: its own safety filter judged the content."""
    from ai_service import _prompt_blocked, _response_text
    if _prompt_blocked(response):
        return False
    try:
        cands = getattr(response, "candidates", None) or []
        fr = str(getattr(cands[0], "finish_reason", "") or "") if cands else ""
        if "SAFETY" in fr.upper() or "PROHIBITED" in fr.upper():
            return False
    except Exception:
        pass
    try:
        data = json.loads(_response_text(response) or "")
    except Exception:
        return None
    allowed = data.get("allowed") if isinstance(data, dict) else None
    return allowed if isinstance(allowed, bool) else None


def check_share_content(share_type: str, doc: dict) -> bool:
    """True when the page may be published. Never raises."""
    if not _enabled():
        return True
    try:
        client = _client()
    except Exception as e:
        logger.warning("Share moderation unavailable, publishing unchecked: %s", type(e).__name__)
        return True
    if client is None:
        logger.warning("Share moderation skipped: GEMINI_API_KEY is empty")
        return True
    text = page_text(share_type, doc)
    urls = shown_image_urls(share_type, doc)
    if urls:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=len(urls)) as pool:
            images = [i for i in pool.map(_fetch_image, urls) if i]
    else:
        images = []
    if not text.strip() and not images:
        return True
    try:
        from google.genai import types
        from ai_service import GEMINI_ANALYSIS_MODEL
        contents = [_PROMPT, "CONTENT TO REVIEW:\n" + (text or "(no text)")]
        contents += [types.Part.from_bytes(data=b, mime_type=m) for b, m in images]
        response = client.models.generate_content(
            model=GEMINI_ANALYSIS_MODEL,
            contents=contents,
            config={
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": "OBJECT",
                    "properties": {"allowed": {"type": "BOOLEAN"}, "category": {"type": "STRING"}},
                    "required": ["allowed"],
                },
                "temperature": 0,
            },
        )
    except Exception as e:
        logger.warning("Share moderation unavailable, publishing unchecked: %s", type(e).__name__)
        return True
    verdict = _verdict(response)
    if verdict is None:
        logger.warning("Share moderation: no usable verdict, publishing unchecked")
        return True
    if not verdict:
        logger.info("Share moderation refused a %s page", share_type)
    return verdict
