"""Public share pages (server-rendered OG previews).

The web app is a static export, so a client-rendered /s?id=… page can't give
link-preview crawlers (WhatsApp, iMessage, Slack, X…) per-card OpenGraph tags —
they don't run JS, so every shared link previewed as the generic app. These
functions OWN the /s (single card) and /c (collection) routes via Hosting
rewrites and return real HTML: correct og:title/description/image for crawlers,
and a readable card for humans with no JS required.

`share_page` is re-exported from main.py so Firebase's entrypoint scan still
discovers it under the same deployed name.
"""

import re
import html as _html
import logging

from firebase_functions import https_fn

from config import APP_URL
from db import get_db

logger = logging.getLogger(__name__)


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


def _share_card_image(card: dict) -> str:
    """Best preview image for a card; falls back to the Machina icon."""
    thumb = card.get("thumbnailUrl")
    if thumb and str(thumb).startswith("http"):
        return thumb
    url = card.get("url") or ""
    # Image/screenshot cards store the (public) image itself as the url.
    if card.get("sourceType") == "image" and url.startswith("http"):
        return url
    return f"{APP_URL}/icon-512.png"


def _share_html_shell(*, title: str, description: str, image: str, url: str, body: str) -> str:
    """Wrap rendered body in a full HTML doc with OpenGraph + Twitter cards."""
    t, d = _esc(title), _esc(description)
    img, u = _esc(image), _esc(url)
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
<meta property="og:url" content="{u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{img}">
<link rel="icon" href="{_esc(APP_URL)}/icon-192.png">
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#070708; color:#ededed;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         line-height:1.6; }}
  .wrap {{ max-width:640px; margin:0 auto; padding:32px 20px 64px; }}
  .brand {{ display:flex; align-items:center; gap:10px; margin-bottom:28px; }}
  .brand img {{ width:32px; height:32px; border-radius:8px; }}
  .brand span {{ font-weight:600; letter-spacing:.2px; }}
  .badge {{ display:inline-block; font-size:12px; font-weight:700; letter-spacing:.6px;
           text-transform:uppercase; color:#c4b5fd; background:rgba(139,92,246,.14);
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
  .md a {{ color:#c4b5fd; }}
  .tags {{ margin:22px 0 0; display:flex; flex-wrap:wrap; gap:8px; }}
  .tag {{ font-size:13px; color:#a1a1aa; background:#161618; border:1px solid #262629;
         padding:4px 10px; border-radius:999px; }}
  .actions {{ margin-top:32px; display:flex; flex-wrap:wrap; gap:12px; }}
  .btn {{ display:inline-block; padding:12px 20px; border-radius:12px; font-weight:600;
         text-decoration:none; font-size:15px; }}
  .btn-primary {{ background:linear-gradient(135deg,#8b5cf6,#d946ef); color:#fff; }}
  .btn-ghost {{ background:#161618; color:#ededed; border:1px solid #262629; }}
  .card {{ background:#0e0e10; border:1px solid #1c1c1f; border-radius:18px; padding:24px; }}
  .col-item {{ padding:18px 0; border-top:1px solid #1c1c1f; }}
  .col-item h3 {{ margin:0 0 6px; font-size:18px; }}
  .col-item p {{ margin:0; color:#a1a1aa; font-size:15px; }}
  .foot {{ margin-top:40px; font-size:13px; color:#71717a; text-align:center; }}
  a {{ color:#c4b5fd; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><img src="{_esc(APP_URL)}/icon-192.png" alt="Machina"><span>Machina</span></div>
    {body}
    <div class="foot">Saved on <a href="{_esc(APP_URL)}">Machina</a> — your AI knowledge base.</div>
  </div>
</body>
</html>"""


def _render_shared_card(card: dict, share_url: str) -> str:
    title = card.get("title") or "Shared card"
    summary = card.get("summary") or ""
    detailed = card.get("detailedSummary") or ""
    source = card.get("sourceName") or card.get("category") or ""
    image = _share_card_image(card)
    original = card.get("url") or ""
    tags = card.get("tags") or []

    has_real_image = image and not image.endswith("/icon-512.png")
    hero = f'<img class="hero" src="{_esc(image)}" alt="">' if has_real_image else ""
    badge = f'<div class="badge">{_esc(source)}</div>' if source else ""
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
        <a class="btn btn-primary" href="{_esc(APP_URL)}">Open in Machina</a>
        {original_btn}
      </div>
    </div>"""
    return _share_html_shell(
        title=title, description=summary or detailed or "Shared from Machina",
        image=image, url=share_url, body=body,
    )


def _render_shared_collection(data: dict, share_url: str) -> str:
    name = data.get("name") or "Shared collection"
    description = data.get("description") or ""
    cards = data.get("cards") or []
    image = _share_card_image(cards[0]) if cards else f"{APP_URL}/icon-512.png"

    items = "".join(
        f'<div class="col-item"><h3 dir="auto">{_esc(c.get("title"))}</h3>'
        f'<div class="md" dir="auto">{_md_to_html(c.get("summary"))}</div></div>'
        for c in cards[:50]
    )
    desc_html = f'<div class="summary md" dir="auto">{_md_to_html(description)}</div>' if description else ""
    count = len(cards)
    body = f"""<div class="card">
      <div class="badge">Collection · {count} card{'s' if count != 1 else ''}</div>
      <h1 dir="auto">{_esc(name)}</h1>
      {desc_html}
      {items}
      <div class="actions"><a class="btn btn-primary" href="{_esc(APP_URL)}">Open in Machina</a></div>
    </div>"""
    return _share_html_shell(
        title=name, description=description or f"A collection of {count} cards on Machina",
        image=image, url=share_url, body=body,
    )


def _share_not_found_html() -> str:
    body = """<div class="card">
      <h1>This page isn’t available</h1>
      <div class="summary">The shared card or collection may have been removed.</div>
      <div class="actions"><a class="btn btn-primary" href="%s">Open Machina</a></div>
    </div>""" % _esc(APP_URL)
    return _share_html_shell(
        title="Not available", description="This shared page may have been removed.",
        image=f"{APP_URL}/icon-512.png", url=APP_URL, body=body,
    )


@https_fn.on_request()
def share_page(req: https_fn.Request) -> https_fn.Response:
    """Server-rendered public page for a shared card (/s) or collection (/c).

    Owns those routes via Hosting rewrites so link-preview crawlers get real
    per-item OpenGraph tags (the static export can't). Always returns HTML.
    """
    html_headers = {
        "Content-Type": "text/html; charset=utf-8",
        # Let CDNs/crawlers cache briefly; cards are immutable snapshots.
        "Cache-Control": "public, max-age=300, s-maxage=600",
    }
    try:
        share_id = (req.args.get("id") or "").strip()
        is_collection = "/c" in req.path
        share_url = f"{APP_URL}{'/c' if is_collection else '/s'}?id={share_id}"

        if not share_id:
            return https_fn.Response(_share_not_found_html(), status=404, headers=html_headers)

        db = get_db()
        collection = "shared_collections" if is_collection else "shared_cards"
        snap = db.collection(collection).document(share_id).get()
        if not snap.exists:
            return https_fn.Response(_share_not_found_html(), status=404, headers=html_headers)

        data = snap.to_dict() or {}
        if is_collection:
            html_out = _render_shared_collection(data, share_url)
        else:
            html_out = _render_shared_card(data.get("card", {}) or {}, share_url)
        return https_fn.Response(html_out, status=200, headers=html_headers)

    except Exception as e:
        logger.error(f"share_page failed: {e}", exc_info=True)
        return https_fn.Response(_share_not_found_html(), status=200, headers=html_headers)
