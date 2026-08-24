"""
SecondBrain / Machina — Public share-page subsystem.

Extracted verbatim from `main.py` (the Cloud Functions entry point) so that the
entry point stays focused on deployable-function discovery. This module owns
everything behind the public /s (single card) and /c (collection) routes:

- Markdown → safe-HTML rendering used to render stored card text on the
  server-rendered share pages: `_esc`, `_md_inline`, `_md_to_html`.
- Full share-page HTML shells with OpenGraph/Twitter-card metadata:
  `_share_card_image`, `_share_html_shell`, `_render_shared_card`,
  `_render_shared_collection`, `_share_not_found_html`.
- Publish/unpublish logic that writes the world-readable share snapshot WITHOUT
  the owner's PII, keeping the owner mapping in the functions-only
  `shared_owners` collection: `_SHARE_COLLECTIONS`, `_share_owner_uid`,
  `_publish_share_logic`, `_unpublish_share_logic`.

The three HTTP ENDPOINTS that expose this (`publish_share_http`,
`unpublish_share_http`, `share_page`) REMAIN in `main.py`: Firebase Functions
discovers deployables by scanning `main.py`, so a decorated function must live
there. Those endpoints are thin wrappers that handle CORS/auth and call into the
render/logic helpers below.

Dependency direction: this module imports only from `db` (get_db) and the
standard library — it must NOT import `main` (that would be circular). `WEB_URL`
is read from the same environment variable `main.py` reads, so both resolve to
an identical value.
"""

import os
import re
import html as _html
import logging
from typing import Optional
from datetime import datetime, timezone

from db import get_db

logger = logging.getLogger("share_service")

# Public BRAND origin. EVERY url in this module is user-visible — og:url, the
# favicon, the brand header, "Open in Machina" — so it must read `mymachina.app`
# and never the Firebase project host, whose name is exactly what BRANDING D-3
# keeps off user-visible surfaces. Distinct from `main.APP_URL`, which stays the
# API origin (the share-extension endpoint and the CORS allowlist) — moving that
# would put a Vercel proxy hop in the share extension's critical path.
WEB_URL = os.environ.get("WEB_URL", "https://mymachina.app")


def _esc(value) -> str:
    """HTML-escape a value for safe interpolation (handles None)."""
    return _html.escape(str(value), quote=True) if value is not None else ""


# Inline markdown patterns, applied AFTER the whole string is HTML-escaped.
# Order matters: bold (**/__) before italic (*/_) so we don't eat the inner stars.
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
_MD_BOLD_RE = re.compile(r"(?<!\*)\*\*(?!\s)(.+?)(?<!\s)\*\*(?!\*)|(?<!_)__(?!\s)(.+?)(?<!\s)__(?!_)")
# Note: no \w lookbehind on the * form, so emphasis works flush against
# letters in RTL scripts (e.g. Hebrew "ו*נטוי*"). Bold (**) runs first, and
# the (?<!\*)/(?!\*) guards keep us from eating bold's leftover stars. The _
# form keeps word-boundary guards to avoid mangling snake_case identifiers.
_MD_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\s)([^*]+?)(?<!\s)\*(?!\*)|(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])")
_MD_CODE_RE = re.compile(r"`([^`]+)`")


def _md_inline(text: str) -> str:
    """Render inline markdown for a SINGLE already-HTML-escaped line.

    Input MUST be pre-escaped (see _md_to_html). We only translate a fixed set
    of markdown markers into a fixed set of safe tags, so no untrusted text ever
    becomes markup. Links are restricted to http(s) and rel-hardened.
    """
    # Inline code first so markers inside backticks aren't reinterpreted.
    text = _MD_CODE_RE.sub(lambda m: f"<code>{m.group(1)}</code>", text)

    def _link(m):
        label, href = m.group(1), m.group(2)
        return f'<a href="{href}" rel="noopener nofollow" target="_blank">{label}</a>'

    text = _MD_LINK_RE.sub(_link, text)
    text = _MD_BOLD_RE.sub(lambda m: f"<strong>{m.group(1) or m.group(2)}</strong>", text)
    text = _MD_ITALIC_RE.sub(lambda m: f"<em>{m.group(1) or m.group(2)}</em>", text)
    return text


def _md_to_plain(value, *, limit: int = 200) -> str:
    """Strip markdown to clean plain text for meta descriptions.

    OpenGraph/Twitter description tags are rendered as PLAIN TEXT by every
    consumer (WhatsApp, iMessage, Slack, …) — markdown markers are never
    styled there, so raw `**bold**` shows its literal asterisks in the share
    preview. This flattens the same small grammar `_md_to_html` understands
    (bold/italic/code, headings, list & quote markers, links) down to the
    words alone, collapses whitespace to single spaces, and truncates to a
    preview-friendly length. The on-page body still renders via `_md_to_html`.
    """
    if not value:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    # Unwrap links: [label](url) -> label
    text = _MD_LINK_RE.sub(lambda m: m.group(1), text)
    # Drop inline code backticks, keeping the code text.
    text = _MD_CODE_RE.sub(lambda m: m.group(1), text)
    # Strip bold/italic markers, keeping the emphasized text.
    text = _MD_BOLD_RE.sub(lambda m: m.group(1) or m.group(2), text)
    text = _MD_ITALIC_RE.sub(lambda m: m.group(1) or m.group(2), text)
    # Strip line-leading block markers: headings (#), bullets (-,*,+),
    # ordered-list numbers (1.), and blockquotes (>).
    lines = [
        re.sub(r"^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)", "", ln).strip()
        for ln in text.split("\n")
    ]
    plain = " ".join(ln for ln in lines if ln)
    plain = re.sub(r"\s+", " ", plain).strip()
    if len(plain) > limit:
        plain = plain[: limit - 1].rstrip() + "…"
    return plain


def _md_to_html(value) -> str:
    """Convert stored markdown to safe HTML for the public share pages.

    XSS-safe by construction: every character of the user/AI-authored text is
    HTML-escaped FIRST (via _esc, line-by-line), and only then do we apply a
    small, fixed grammar (headings, bullet/numbered lists, blockquotes, bold,
    italic, inline code, http(s) links, paragraphs, line breaks). The escaped
    text can never reopen a tag, so no markup injection is possible.
    """
    if not value:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    html_parts: list[str] = []
    list_stack: list[str] = []  # "ul" or "ol" currently open
    para: list[str] = []

    def _flush_para():
        if para:
            html_parts.append(f'<p dir="auto">{"<br>".join(para)}</p>')
            para.clear()

    def _close_lists():
        while list_stack:
            html_parts.append(f"</{list_stack.pop()}>")

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            _flush_para()
            _close_lists()
            continue

        # Headings: ## .. ###### (h1 reserved for the card title).
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            _flush_para()
            _close_lists()
            level = min(max(len(m.group(1)), 2), 4)  # clamp to h2–h4
            html_parts.append(
                f'<h{level} dir="auto">{_md_inline(_esc(m.group(2).strip()))}</h{level}>'
            )
            continue

        # Blockquote.
        m = re.match(r"^>\s?(.*)$", stripped)
        if m:
            _flush_para()
            _close_lists()
            html_parts.append(
                f'<blockquote dir="auto">{_md_inline(_esc(m.group(1).strip()))}</blockquote>'
            )
            continue

        # Unordered list item: - / * / • bullet.
        m = re.match(r"^[-*•]\s+(.*)$", stripped)
        if m:
            _flush_para()
            if list_stack[-1:] != ["ul"]:
                _close_lists()
                list_stack.append("ul")
                html_parts.append("<ul>")
            html_parts.append(
                f'<li dir="auto">{_md_inline(_esc(m.group(1).strip()))}</li>'
            )
            continue

        # Ordered list item: 1. / 1)
        m = re.match(r"^\d+[.)]\s+(.*)$", stripped)
        if m:
            _flush_para()
            if list_stack[-1:] != ["ol"]:
                _close_lists()
                list_stack.append("ol")
                html_parts.append("<ol>")
            html_parts.append(
                f'<li dir="auto">{_md_inline(_esc(m.group(1).strip()))}</li>'
            )
            continue

        # Plain text → accumulate into the current paragraph.
        _close_lists()
        para.append(_md_inline(_esc(stripped)))

    _flush_para()
    _close_lists()
    return "".join(html_parts)


# ---------------------------------------------------------------------------
# Source byline — a server-side port of `web/components/SourceByline.tsx`.
#
# The share page used to show an uppercase violet PILL of the raw `sourceName`,
# which looked nothing like the card in the app and shouted a handle in caps.
# The app's treatment is airy: the platform's mark in its brand colour, then the
# name/handle in muted grey at normal weight — no pill, no border, no uppercase.
#
# Icon geometry is lucide-react v0.563.0's, copied from
# `web/node_modules/lucide-react/dist/esm/icons/*.js` so the marks are identical
# to the app's rather than redrawn by hand; the X mark is the repo's own
# `XLogo` (`web/lib/platform.tsx`), since lucide still ships the old bird.
# Brand colours are `PLATFORM_RGB` from the same file.
#
# This is a PORT, not a shared module — the functions runtime cannot import from
# `web/`. If the byline rules change there, change them here too.
# ---------------------------------------------------------------------------

_ICON_STROKE = (
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round"'
)

_PLATFORM_ICONS = {
    "youtube": (
        "#FF0000",
        f'<svg {_ICON_STROKE}><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 '
        '49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 '
        '49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>',
    ),
    "instagram": (
        "#E1306C",
        f'<svg {_ICON_STROKE}><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>'
        '<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>'
        '<line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>',
    ),
    "linkedin": (
        "#0A66C2",
        f'<svg {_ICON_STROKE}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 '
        '2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/>'
        '<circle cx="4" cy="4" r="2"/></svg>',
    ),
    "facebook": (
        "#1877F2",
        f'<svg {_ICON_STROKE}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 '
        '0 1 1-1h3z"/></svg>',
    ),
    "github": (
        "#8B949E",
        f'<svg {_ICON_STROKE}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27'
        '-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 '
        '1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17'
        '.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
    ),
    # Solid-fill marks (no stroke): the repo's own X wordmark.
    "x": (
        "#BFC9D6",
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 '
        '8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 '
        '6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z"/></svg>',
    ),
}

_ICON_IMAGE = (
    f'<svg {_ICON_STROKE}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>'
    '<circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
)
_ICON_NOTE = (
    f'<svg {_ICON_STROKE}><path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 '
    '3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>'
    '<path d="M15 3v5a1 1 0 0 0 1 1h5"/></svg>'
)

# Machina's own hosts — the only place a "Machina" sourceName is legitimate.
# Mirrors MACHINA_HOSTS in web/components/SourceByline.tsx.
_MACHINA_HOSTS = {
    "mymachina.app",
    "www.mymachina.app",
    "secondbrain-app-94da2.web.app",
    "my-links-sable.vercel.app",
}

_X_RESERVED = {
    "home", "explore", "notifications", "messages", "search", "settings",
    "compose", "hashtag", "i", "intent", "login", "signup", "about",
}


def _host_of(url: str) -> str:
    """Bare lowercase hostname, `www.` stripped. Empty string when unparseable."""
    m = re.match(r"^https?://([^/?#]+)", (url or "").strip(), re.I)
    if not m:
        return ""
    return m.group(1).split("@")[-1].split(":")[0].lstrip(".").lower().removeprefix("www.")


def _platform_of(url: str) -> Optional[str]:
    """Map a URL to a platform key. Mirrors `getPlatform` in platform.tsx."""
    host = _host_of(url)
    if not host:
        return None

    def is_(domain: str) -> bool:
        return host == domain or host.endswith("." + domain)

    if is_("youtube.com") or is_("youtu.be"):
        return "youtube"
    if is_("twitter.com") or is_("x.com"):
        return "x"
    if is_("instagram.com"):
        return "instagram"
    if is_("linkedin.com"):
        return "linkedin"
    if is_("facebook.com") or is_("fb.com") or is_("fb.watch"):
        return "facebook"
    if is_("github.com"):
        return "github"
    return None


def _x_handle(url: str) -> Optional[str]:
    """Author @handle from an X/Twitter post URL. Mirrors `xHandle`."""
    if _platform_of(url) != "x":
        return None
    m = re.match(r"^https?://[^/]+/([^/?#]+)", (url or "").strip(), re.I)
    if not m:
        return None
    handle = m.group(1).lstrip("@")
    if handle.lower() in _X_RESERVED:
        return None
    return handle if re.fullmatch(r"[A-Za-z0-9_]{1,15}", handle) else None


def _instagram_handle(source_name: str) -> Optional[str]:
    """Bare IG handle from a stored `@handle` sourceName. Mirrors `instagramHandle`."""
    m = re.fullmatch(r"@([A-Za-z0-9._]{1,30})", (source_name or "").strip())
    return m.group(1) if m else None


def _byline_html(icon_svg: str, color: str, text: str) -> str:
    tinted = f' style="color:{color}"' if color else ""
    label = f'<span class="src-name">{_esc(text)}</span>' if text else ""
    return f'<div class="src"><span class="src-ico"{tinted}>{icon_svg}</span>{label}</div>'


def _source_byline(card: dict) -> str:
    """The card's source line, matching the app's `SourceByline`.

    Order matters and follows the component exactly: YouTube channel, X handle,
    LinkedIn, Facebook, Instagram handle, screenshot, note, then a plain
    publisher name (which renders as bare text with no icon).
    """
    url = card.get("url") or ""
    source_name = (card.get("sourceName") or "").strip()
    source_type = card.get("sourceType") or ""
    platform = _platform_of(url)

    if platform == "youtube" or source_type == "youtube":
        channel = ((card.get("metadata") or {}).get("youtubeChannel") or source_name).strip()
        if channel:
            color, svg = _PLATFORM_ICONS["youtube"]
            return _byline_html(svg, color, channel)

    if platform == "x":
        handle = _x_handle(url)
        if handle:
            color, svg = _PLATFORM_ICONS["x"]
            return _byline_html(svg, color, f"@{handle}")

    if platform in ("linkedin", "facebook"):
        color, svg = _PLATFORM_ICONS[platform]
        junk = source_name.lower() in ("", platform, "none", "screenshot")
        return _byline_html(svg, color, "" if junk else source_name)

    if platform == "instagram":
        handle = _instagram_handle(source_name)
        color, svg = _PLATFORM_ICONS["instagram"]
        return _byline_html(svg, color, f"@{handle}" if handle else "Instagram")

    if source_type == "image":
        return _byline_html(_ICON_IMAGE, "", "Screenshot")
    if source_type == "note":
        return _byline_html(_ICON_NOTE, "", "Note")

    # Plain publisher: name only, no icon — but reject the junk fallbacks the
    # app rejects, so an old bad card silently reads as its host instead.
    rejected = (
        not source_name
        or source_name in ("Screenshot", "None")
        or (re.search(r"machina", source_name, re.I) and _host_of(url) not in _MACHINA_HOSTS)
    )
    display = source_name if not rejected else (_host_of(url) or "")
    return f'<div class="src"><span class="src-name">{_esc(display)}</span></div>' if display else ""


def _share_card_image(card: dict) -> str:
    """Best preview image for a card; falls back to the Machina icon."""
    thumb = card.get("thumbnailUrl")
    if thumb and str(thumb).startswith("http"):
        return thumb
    url = card.get("url") or ""
    # Image/screenshot cards store the (public) image itself as the url.
    if card.get("sourceType") == "image" and url.startswith("http"):
        return url
    return f"{WEB_URL}/icon-512.png"


def _share_html_shell(*, title: str, description: str, image: str, url: str, body: str,
                      image_width: Optional[int] = None, image_height: Optional[int] = None,
                      image_type: Optional[str] = None) -> str:
    """Wrap rendered body in a full HTML doc with OpenGraph + Twitter cards.

    Declare og:image dimensions/type whenever known — WhatsApp in particular
    often renders NO preview on the first share of a page whose image carries
    no declared size."""
    t, d = _esc(title), _esc(description)
    img, u = _esc(image), _esc(url)
    img_meta = ""
    if image_width and image_height:
        img_meta += (f'\n<meta property="og:image:width" content="{int(image_width)}">'
                     f'\n<meta property="og:image:height" content="{int(image_height)}">')
    if image_type:
        img_meta += f'\n<meta property="og:image:type" content="{_esc(image_type)}">'
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t} · Machina</title>
<meta name="description" content="{d}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Machina">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{img}">
<meta property="og:image:secure_url" content="{img}">{img_meta}
<meta property="og:image:alt" content="{t}">
<meta property="og:url" content="{u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{img}">
<meta name="twitter:image:alt" content="{t}">
<link rel="icon" href="{_esc(WEB_URL)}/icon-192.png">
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#050505; color:#E5E5E5;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         line-height:1.6; }}
  .wrap {{ max-width:640px; margin:0 auto; padding:32px 20px 64px; }}
  .brand {{ display:flex; align-items:center; gap:10px; margin-bottom:28px; }}
  .brand img {{ width:32px; height:32px; border-radius:8px; }}
  .brand span {{ font-weight:600; letter-spacing:.2px; }}
  /* Source byline — matches SourceByline.tsx: brand-coloured mark, muted name,
     normal weight, no pill/border/uppercase. (`.badge` survives for the
     collection kicker, which IS a label rather than a source.) */
  .src {{ display:flex; align-items:center; gap:6px; margin-bottom:12px;
         font-size:13px; color:#666666; min-width:0; }}
  .src-ico {{ display:inline-flex; flex-shrink:0; }}
  .src-ico svg {{ width:14px; height:14px; display:block; }}
  .src-name {{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
  .badge {{ display:inline-block; font-size:12px; font-weight:700; letter-spacing:.6px;
           text-transform:uppercase; color:#E9E9F2; background:rgba(233,233,242,.10);
           padding:5px 10px; border-radius:999px; margin-bottom:16px; }}
  h1 {{ font-size:26px; line-height:1.25; margin:0 0 16px; }}
  .hero {{ width:100%; border-radius:14px; margin:8px 0 22px; display:block; }}
  .summary {{ font-size:17px; color:#d4d4d8; }}
  .detail {{ margin-top:16px; color:#a1a1aa; }}
  /* Rendered markdown blocks (summary / detailed / collection items). */
  .md > :first-child {{ margin-top:0; }}
  .md > :last-child {{ margin-bottom:0; }}
  .md p {{ margin:0 0 12px; }}
  .md h2 {{ font-size:20px; line-height:1.3; margin:22px 0 10px; }}
  .md h3 {{ font-size:17px; line-height:1.3; margin:18px 0 8px; }}
  .md h4 {{ font-size:15px; line-height:1.3; margin:16px 0 6px; color:#e4e4e7; }}
  .md ul, .md ol {{ margin:8px 0 14px; padding-inline-start:22px; }}
  .md li {{ margin:4px 0; }}
  .md strong {{ color:#fafafa; font-weight:700; }}
  .md em {{ font-style:italic; }}
  .md code {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9em;
             background:#161618; border:1px solid #262629; border-radius:6px; padding:1px 5px; }}
  .md blockquote {{ margin:12px 0; padding:4px 0 4px 14px; border-inline-start:3px solid #3a3a3f;
                   color:#a1a1aa; }}
  .md a {{ color:#E9E9F2; }}
  .tags {{ margin:22px 0 0; display:flex; flex-wrap:wrap; gap:8px; }}
  .tag {{ font-size:13px; color:#a1a1aa; background:#161618; border:1px solid #262629;
         padding:4px 10px; border-radius:999px; }}
  .actions {{ margin-top:32px; display:flex; flex-wrap:wrap; gap:12px; }}
  .btn {{ display:inline-block; padding:12px 20px; border-radius:12px; font-weight:600;
         text-decoration:none; font-size:15px; }}
  /* Lumen: the primary CTA is the highest-contrast element on the page —
     porcelain on graphite, not a hue. Values ported from web/app/globals.css
     dark tokens (--accent-gradient / --accent-ink); this page is dark-only, so
     it takes the dark side only. The old violet→magenta gradient predated the
     identity and was the last place it survived. */
  .btn-primary {{ background:linear-gradient(135deg,#FFFFFF,#CBD2E0); color:#101016; }}
  .btn-ghost {{ background:#121212; color:#E5E5E5; border:1px solid rgba(255,255,255,.08); }}
  .card {{ background:#121212; border:1px solid rgba(255,255,255,.05); border-radius:18px; padding:24px; }}
  /* Collection pages: thumbnail-mosaic hero + per-card rows. */
  .mosaic {{ display:grid; gap:2px; border-radius:14px; overflow:hidden; margin:8px 0 22px;
            aspect-ratio:2/1; }}
  .mosaic.n1 {{ grid-template-columns:1fr; }}
  .mosaic.n2 {{ grid-template-columns:1fr 1fr; }}
  .mosaic.n3 {{ grid-template-columns:2fr 1fr; grid-template-rows:1fr 1fr; }}
  .mosaic.n3 img:first-child {{ grid-row:span 2; }}
  .mosaic.n4 {{ grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }}
  .mosaic img {{ width:100%; height:100%; object-fit:cover; display:block; }}
  .col-meta {{ color:#71717a; font-size:14px; margin:0 0 4px; }}
  .col-item {{ display:flex; gap:14px; padding:18px 0; border-top:1px solid #1c1c1f; }}
  .col-item .thumb {{ width:56px; height:56px; border-radius:10px; object-fit:cover;
                     flex-shrink:0; background:#161618; }}
  .col-item .body {{ min-width:0; flex:1; }}
  .col-item .kicker {{ font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase;
                      color:#8b8b93; margin:0 0 3px; }}
  .col-item h3 {{ margin:0 0 6px; font-size:18px; }}
  .col-item h3 a {{ color:#E5E5E5; text-decoration:none; }}
  .col-item h3 a:hover {{ color:#E9E9F2; }}
  .col-item p {{ margin:0; color:#a1a1aa; font-size:15px; }}
  .col-item .visit {{ font-size:13px; color:#E9E9F2; text-decoration:none; }}
  .foot {{ margin-top:40px; font-size:13px; color:#71717a; text-align:center; }}
  a {{ color:#E9E9F2; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><img src="{_esc(WEB_URL)}/icon-192.png" alt="Machina"><span>Machina</span></div>
    {body}
    <div class="foot">Saved on <a href="{_esc(WEB_URL)}">Machina</a> — Everything you save, finally useful.</div>
  </div>
</body>
</html>"""


def _og_image_meta(og_preview, fallback_image: str):
    """(image, width, height, type) for the shell — the stored preview copy
    when the publish generated one, else the raw fallback (dims only for the
    one image whose size we know statically, the 512px brand icon)."""
    if isinstance(og_preview, dict) and str(og_preview.get("url", "")).startswith("http"):
        return og_preview["url"], og_preview.get("width"), og_preview.get("height"), "image/jpeg"
    if fallback_image.endswith("/icon-512.png"):
        return fallback_image, 512, 512, "image/png"
    return fallback_image, None, None, None


def _render_shared_card(card: dict, share_url: str, og_preview: Optional[dict] = None) -> str:
    title = card.get("title") or "Shared card"
    summary = card.get("summary") or ""
    detailed = card.get("detailedSummary") or ""
    source = card.get("sourceName") or card.get("category") or ""
    image = _share_card_image(card)
    original = card.get("url") or ""
    tags = card.get("tags") or []

    has_real_image = image and not image.endswith("/icon-512.png")
    hero = f'<img class="hero" src="{_esc(image)}" alt="">' if has_real_image else ""
    badge = _source_byline(card)
    detail_html = f'<div class="detail md" dir="auto">{_md_to_html(detailed)}</div>' if detailed else ""
    tags_html = ""
    if tags:
        chips = "".join(f'<span class="tag">{_esc(t)}</span>' for t in tags[:8])
        tags_html = f'<div class="tags">{chips}</div>'

    # "View original" only for real external links (not stored screenshot images).
    original_btn = ""
    if original.startswith("http") and card.get("sourceType") != "image":
        original_btn = f'<a class="btn btn-ghost" href="{_esc(original)}" rel="noopener nofollow" target="_blank">View original</a>'

    body = f"""<div class="card">
      {badge}
      <h1 dir="auto">{_esc(title)}</h1>
      {hero}
      <div class="summary md" dir="auto">{_md_to_html(summary)}</div>
      {detail_html}
      {tags_html}
      <div class="actions">
        <a class="btn btn-primary" href="{_esc(WEB_URL)}">Open in Machina</a>
        {original_btn}
      </div>
    </div>"""
    og_image, og_w, og_h, og_type = _og_image_meta(og_preview, image)
    return _share_html_shell(
        title=title,
        description=_md_to_plain(summary or detailed) or "Shared from Machina",
        image=og_image, url=share_url, body=body,
        image_width=og_w, image_height=og_h, image_type=og_type,
    )


def _card_thumb(card: dict) -> Optional[str]:
    """A card's real preview image, or None (no icon fallback here)."""
    img = _share_card_image(card)
    return img if img and not img.endswith("/icon-512.png") else None


# ── Link-preview (og:image) copy ─────────────────────────────────────────────
# WhatsApp (and other messengers) silently DROP og:image when the file is too
# heavy (~300 KB is the safe ceiling — a stored screenshot easily exceeds it)
# or when no dimensions are declared, and the share then degrades to a bare
# link with no card at all. So publishing generates a dedicated small JPEG copy
# of the card's image and records its exact pixel size; the share page declares
# them via og:image:width/height/type. Best-effort everywhere: a share must
# never fail to publish because its preview couldn't be built.
_OG_PREVIEW_MAX_EDGE = 1000
_OG_PREVIEW_MAX_BYTES = 280 * 1024
_OG_SOURCE_MAX_BYTES = 10 * 1024 * 1024


def _downscale_og_preview(image_bytes: bytes):
    """(jpeg_bytes, width, height) under the messenger budget, or None."""
    import io
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return None
    long_edge = max(img.size)
    if long_edge > _OG_PREVIEW_MAX_EDGE:
        scale = _OG_PREVIEW_MAX_EDGE / long_edge
        img = img.resize(
            (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
            Image.LANCZOS,
        )
    for quality in (80, 70, 60, 50):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        if buf.tell() <= _OG_PREVIEW_MAX_BYTES:
            return buf.getvalue(), img.width, img.height
    # Even q50 is over budget (an extreme edge) — halve the pixels and accept.
    img = img.resize((max(1, img.width // 2), max(1, img.height // 2)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=60, optimize=True)
    return buf.getvalue(), img.width, img.height


def _delete_share_previews(share_id: str) -> None:
    """Best-effort: remove the stored preview copies for one share."""
    try:
        from firebase_admin import storage as fb_storage
        bucket = fb_storage.bucket()
        for blob in bucket.list_blobs(prefix=f"share_previews/{share_id}/"):
            blob.delete()
    except Exception:
        pass


def _generate_og_preview(share_type: str, doc: dict, share_id: str) -> Optional[dict]:
    """{url, width, height} for the share's link preview, or None.

    The source image is fetched back through scraper.safe_get — the payload is
    client-supplied, so its URLs must pass the same SSRF guard as any queue-doc
    URL. The copy is stored under a fresh token per publish, so a republish
    changes the og:image URL and busts crawler-side image caches. The blob path
    embeds only the share id — never the owner's uid — because og:image is
    world-visible.
    """
    if share_type == "card":
        src = _card_thumb(doc.get("card") or {})
    else:
        src = next((t for t in (_card_thumb(c) for c in (doc.get("cards") or [])) if t), None)
    if not src or not isinstance(src, str) or not src.startswith("http"):
        return None

    from scraper import safe_get
    resp = safe_get(src, timeout=15)
    resp.raise_for_status()
    content = resp.content
    if not content or len(content) > _OG_SOURCE_MAX_BYTES:
        return None
    scaled = _downscale_og_preview(content)
    if not scaled:
        return None
    jpeg, width, height = scaled

    import uuid
    from urllib.parse import quote
    from firebase_admin import storage as fb_storage
    _delete_share_previews(share_id)  # a republish replaces, never accumulates
    bucket = fb_storage.bucket()
    blob_path = f"share_previews/{share_id}/{uuid.uuid4().hex[:12]}.jpg"
    blob = bucket.blob(blob_path)
    token = uuid.uuid4().hex
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(jpeg, content_type="image/jpeg")
    url = (f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/"
           f"{quote(blob_path, safe='')}?alt=media&token={token}")
    return {"url": url, "width": width, "height": height}


def _render_collection_item(card: dict) -> str:
    """One member card on the public collection page: thumbnail, source kicker,
    title (linked to the original where one exists), and the summary."""
    title = _esc(card.get("title") or "Untitled")
    url = card.get("url") or ""
    # Screenshot/image cards store the image itself as `url` — don't link those.
    linkable = url.startswith("http") and card.get("sourceType") != "image"

    thumb = _card_thumb(card)
    thumb_html = f'<img class="thumb" src="{_esc(thumb)}" alt="" loading="lazy">' if thumb else ""

    kicker = card.get("sourceName") or card.get("category") or ""
    kicker_html = f'<p class="kicker" dir="auto">{_esc(kicker)}</p>' if kicker else ""

    title_html = (
        f'<a href="{_esc(url)}" rel="noopener nofollow" target="_blank">{title}</a>'
        if linkable else title
    )
    return (
        f'<div class="col-item">{thumb_html}<div class="body">{kicker_html}'
        f'<h3 dir="auto">{title_html}</h3>'
        f'<div class="md" dir="auto">{_md_to_html(card.get("summary"))}</div>'
        f"</div></div>"
    )


def _render_shared_collection(data: dict, share_url: str) -> str:
    name = data.get("name") or "Shared collection"
    description = data.get("description") or ""
    cards = data.get("cards") or []
    count = len(cards)
    image = _share_card_image(cards[0]) if cards else f"{WEB_URL}/icon-512.png"

    # Hero: a mosaic of up to 4 member thumbnails (skipped when none exist).
    thumbs = [t for t in (_card_thumb(c) for c in cards) if t][:4]
    mosaic = ""
    if thumbs:
        imgs = "".join(f'<img src="{_esc(t)}" alt="" loading="lazy">' for t in thumbs)
        mosaic = f'<div class="mosaic n{len(thumbs)}">{imgs}</div>'

    published_at = data.get("publishedAt")
    updated = ""
    if isinstance(published_at, (int, float)) and published_at > 0:
        dt = datetime.fromtimestamp(published_at / 1000, tz=timezone.utc)
        updated = f' · updated {dt.strftime("%b %-d, %Y")}'

    items = "".join(_render_collection_item(c) for c in cards[:50])
    overflow = ""
    if count > 50:
        overflow = f'<div class="col-item"><div class="body"><p>…and {count - 50} more cards.</p></div></div>'
    desc_html = f'<div class="summary md" dir="auto">{_md_to_html(description)}</div>' if description else ""
    body = f"""<div class="card">
      <div class="badge">Collection</div>
      <h1 dir="auto">{_esc(name)}</h1>
      <p class="col-meta">{count} curated card{'s' if count != 1 else ''}{updated}</p>
      {desc_html}
      {mosaic}
      {items}{overflow}
      <div class="actions"><a class="btn btn-primary" href="{_esc(WEB_URL)}">Open in Machina</a></div>
    </div>"""
    og_desc = _md_to_plain(description) or f"A curated collection of {count} card{'s' if count != 1 else ''} on Machina — summaries, sources, and links."
    og_image, og_w, og_h, og_type = _og_image_meta(data.get("ogPreview"), image)
    return _share_html_shell(
        title=name, description=og_desc,
        image=og_image, url=share_url, body=body,
        image_width=og_w, image_height=og_h, image_type=og_type,
    )


def _share_not_found_html() -> str:
    body = """<div class="card">
      <h1>This page isn’t available</h1>
      <div class="summary">The shared card or collection may have been removed.</div>
      <div class="actions"><a class="btn btn-primary" href="%s">Open Machina</a></div>
    </div>""" % _esc(WEB_URL)
    return _share_html_shell(
        title="Not available", description="This shared page may have been removed.",
        image=f"{WEB_URL}/icon-512.png", url=WEB_URL, body=body,
    )


# ─────────────────────────────────────────────
# Publishing public shares (Admin-SDK; keeps ownerUid out of world-readable docs)
# ─────────────────────────────────────────────
#
# The world-readable `shared_cards`/`shared_collections` docs must NOT carry
# `ownerUid` — for the phone-keyed owner workspace that value is a phone number
# (PII), and any client could `getDoc` a share id and read it. Rules can't hide a
# field, so the fix is structural: publish via these Admin-SDK endpoints, which
# write the public snapshot WITHOUT `ownerUid` and keep the owner mapping in the
# functions-only `shared_owners/{shareId}` collection (rules deny all client
# access). The locked ruleset denies direct client writes to `shared_*`, so these
# endpoints (Admin SDK bypasses rules) are the only writers.

_SHARE_COLLECTIONS = {"card": "shared_cards", "collection": "shared_collections"}


def _share_owner_uid(db, share_id: str, public_coll: str) -> Optional[str]:
    """Resolve who owns a share id. Prefers the functions-only `shared_owners`
    mapping; falls back to a legacy public doc's `ownerUid` (pre-migration shares
    still carry it) so ownership checks keep working during the transition."""
    owner_snap = db.collection("shared_owners").document(share_id).get()
    if owner_snap.exists:
        return (owner_snap.to_dict() or {}).get("ownerUid")
    legacy = db.collection(public_coll).document(share_id).get()
    if legacy.exists:
        return (legacy.to_dict() or {}).get("ownerUid")
    return None


def _publish_share_logic(uid: str, share_type: str, share_id: str, payload: dict) -> dict:
    """Write a public share snapshot for `uid` WITHOUT `ownerUid`, plus the
    functions-only owner mapping. Rejects overwriting a share id owned by someone
    else (the server-side equivalent of the rules' anti-takeover guard)."""
    public_coll = _SHARE_COLLECTIONS.get(share_type)
    if not public_coll:
        raise ValueError("invalid share type")
    if not share_id or not isinstance(payload, dict):
        raise ValueError("shareId and payload are required")

    db = get_db()
    existing_owner = _share_owner_uid(db, share_id, public_coll)
    if existing_owner is not None and existing_owner != uid:
        raise PermissionError("This share id belongs to another account")

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    doc = {k: v for k, v in payload.items() if v is not None}
    doc.pop("ownerUid", None)  # never persist PII in the world-readable doc
    doc["shareId"] = share_id
    doc["publishedAt"] = now_ms

    # Link-preview image for messengers (see _generate_og_preview). Best-effort:
    # publishing must never fail because the preview couldn't be built, and an
    # imageless card simply shares without one (the page falls back to the icon).
    doc.pop("ogPreview", None)  # server-generated only — never trust a client copy
    try:
        preview = _generate_og_preview(share_type, doc, share_id)
        if preview:
            doc["ogPreview"] = preview
    except Exception as e:
        logger.warning(f"og preview generation failed for {share_id}: {e}")

    db.collection(public_coll).document(share_id).set(doc)
    db.collection("shared_owners").document(share_id).set({
        "ownerUid": uid, "type": share_type, "publishedAt": now_ms,
    })
    return {"shareId": share_id}


def _unpublish_share_logic(uid: str, share_type: str, share_id: str) -> dict:
    """Delete a public share + its owner mapping, if `uid` owns it."""
    public_coll = _SHARE_COLLECTIONS.get(share_type)
    if not public_coll:
        raise ValueError("invalid share type")
    if not share_id:
        raise ValueError("shareId is required")

    db = get_db()
    owner = _share_owner_uid(db, share_id, public_coll)
    if owner is not None and owner != uid:
        raise PermissionError("This share id belongs to another account")

    db.collection(public_coll).document(share_id).delete()
    db.collection("shared_owners").document(share_id).delete()
    _delete_share_previews(share_id)
    return {"success": True}
