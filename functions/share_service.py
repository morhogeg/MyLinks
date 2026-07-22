"""
SecondBrain / Machina AI — Public share-page subsystem.

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
standard library — it must NOT import `main` (that would be circular). `APP_URL`
is read from the same environment variable `main.py` reads, so both resolve to
an identical value.
"""

import os
import re
import html as _html
from typing import Optional
from datetime import datetime, timezone

from db import get_db

APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")


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
<meta property="og:image:secure_url" content="{img}">
<meta property="og:image:alt" content="{t}">
<meta property="og:url" content="{u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{img}">
<meta name="twitter:image:alt" content="{t}">
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
  .col-item h3 a {{ color:#ededed; text-decoration:none; }}
  .col-item h3 a:hover {{ color:#c4b5fd; }}
  .col-item p {{ margin:0; color:#a1a1aa; font-size:15px; }}
  .col-item .visit {{ font-size:13px; color:#c4b5fd; text-decoration:none; }}
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


def _card_thumb(card: dict) -> Optional[str]:
    """A card's real preview image, or None (no icon fallback here)."""
    img = _share_card_image(card)
    return img if img and not img.endswith("/icon-512.png") else None


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
    image = _share_card_image(cards[0]) if cards else f"{APP_URL}/icon-512.png"

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
      <div class="actions"><a class="btn btn-primary" href="{_esc(APP_URL)}">Open in Machina</a></div>
    </div>"""
    og_desc = description or f"A curated collection of {count} card{'s' if count != 1 else ''} on Machina — summaries, sources, and links."
    return _share_html_shell(
        title=name, description=og_desc,
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
    return {"success": True}
