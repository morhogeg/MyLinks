"""
Digest Service
==============
Delivers a *curated set of saved cards* to the user on a schedule (daily or
weekly) via email and/or WhatsApp.

The user controls, from Settings:
  • whether digests are on at all              (digest_enabled)
  • how often                                  (digest_frequency: daily | weekly)
  • where to                                   (digest_channels: email / whatsapp)
  • what to curate                             (digest_mode)
  • a topic to focus on                        (digest_topic, when mode=topic)
  • how many cards                             (digest_count)
  • when, in their local time                  (digest_hour, digest_day)

Curation modes (digest_mode). The Settings UI surfaces the first three as the
primary choices and tucks the rest behind an "advanced" disclosure (M14); the
backend curates all six identically — the split is presentation only:
  smart      – a balanced mix of backlog + rediscovery (the default)   [primary]
  unread     – chip away at the backlog (oldest unread first)          [primary]
  rediscover – "on this day": older saves you haven't opened in a while [primary]
  random     – "surprise me": a random sample across the whole library [advanced]
  topic      – only cards from a chosen category/tag                    [advanced]
  favorites  – revisit your starred cards                               [advanced]

Email is sent via SendGrid (if SENDGRID_API_KEY is set) or SMTP (if SMTP_HOST
is set); otherwise it degrades gracefully to a logged no-op, exactly like the
Twilio path in whatsapp_handler.py. No new Python dependency is required.
"""

import os
import html
import random
import logging
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone
from typing import Optional, List

import requests

from db import get_db
from link_service import is_hebrew

logger = logging.getLogger(__name__)

APP_URL = os.environ.get("APP_URL", "https://secondbrain-app-94da2.web.app")

# How old (days) a save must be before "rediscover" will resurface it.
REDISCOVER_MIN_AGE_DAYS = 14
# Cap how many links we pull per user when curating (keeps reads bounded).
CANDIDATE_LIMIT = 500

VALID_MODES = {"smart", "random", "topic", "unread", "favorites", "rediscover", "synthesis"}

# How many days of saves the weekly "What you learned" synthesis (M12) looks back
# over, and the minimum number of cards in that window worth synthesizing (below
# this a recap would be thin — skip rather than send something hollow).
SYNTHESIS_WINDOW_DAYS = 7
SYNTHESIS_MIN_CARDS = 3

# Short, human description of each mode — shown as the digest's "why these".
MODE_BLURB = {
    "smart": "A balanced mix of your backlog and older gems worth a second look.",
    "random": "A random handful from across your library — surprise yourself.",
    "topic": "Hand-picked from {topic}.",
    "unread": "Still on your list — let's chip away at the backlog.",
    "favorites": "Your starred cards, back for an encore.",
    "rediscover": "From the archives — saves you haven't opened in a while.",
    "synthesis": "A short recap of what your week of reading added up to.",
}

CATEGORY_EMOJI = {
    "Recipe": "🍲", "Tech": "💻", "Health": "❤️", "Business": "💼",
    "Science": "🔬", "Philosophy": "🧭", "Finance": "💰", "News": "📰",
    "Education": "🎓", "Travel": "✈️", "Productivity": "⚡",
}


def _cat_emoji(category: str) -> str:
    for key, emoji in CATEGORY_EMOJI.items():
        if key.lower() in (category or "").lower():
            return emoji
    return "📂"


def _to_ms(value) -> int:
    """Best-effort coerce a Firestore timestamp / ISO string / number to ms."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        # Heuristic: seconds vs milliseconds.
        return int(value if value > 1e11 else value * 1000)
    if hasattr(value, "timestamp"):
        return int(value.timestamp() * 1000)
    if isinstance(value, str):
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
        except Exception:
            return 0
    return 0


# ─────────────────────────────────────────────────────────────────────────
# Curation
# ─────────────────────────────────────────────────────────────────────────

def fetch_candidate_links(uid: str) -> List[dict]:
    """Load the user's links (excluding archived) as plain dicts with `id`."""
    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    docs = links_ref.limit(CANDIDATE_LIMIT).get()

    links = []
    for doc in docs:
        data = doc.to_dict() or {}
        if data.get("status") == "archived":
            continue
        # Drop the heavy embedding vector — never needed for a digest.
        data.pop("embedding_vector", None)
        data["id"] = doc.id
        links.append(data)
    return links


def _normalize_topics(topics) -> List[str]:
    """Accept a str, list, or None and return a lowercased, de-duped list."""
    if not topics:
        return []
    if isinstance(topics, str):
        topics = [topics]
    seen, out = set(), []
    for t in topics:
        key = (t or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def curate(links: List[dict], mode: str, count: int, topics=None) -> List[dict]:
    """
    Pick `count` cards out of `links` according to `mode`.

    `topics` may be a single string or a list of categories/tags (used when
    mode == "topic"). Pure function (no I/O) so it can be unit-tested.
    """
    mode = mode if mode in VALID_MODES else "smart"
    count = max(1, min(int(count or 5), 20))
    topic_set = set(_normalize_topics(topics))
    # Defense in depth: never surface archived cards even if they slip in.
    links = [l for l in links if l.get("status") != "archived"]
    if not links:
        return []

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    age_cutoff = now_ms - REDISCOVER_MIN_AGE_DAYS * 86_400_000

    def created(l):
        return _to_ms(l.get("createdAt"))

    def viewed(l):
        return _to_ms(l.get("lastViewedAt"))

    if mode == "random":
        pool = list(links)
        random.shuffle(pool)
        return pool[:count]

    if mode == "topic":
        pool = [
            l for l in links
            if topic_set and (
                (l.get("category") or "").lower() in topic_set
                or any(tag.lower() in topic_set for tag in (l.get("tags") or []))
            )
        ]
        random.shuffle(pool)
        return pool[:count]

    if mode == "favorites":
        pool = [l for l in links if l.get("status") == "favorite"]
        random.shuffle(pool)
        return pool[:count]

    if mode == "unread":
        pool = [l for l in links if l.get("status") not in ("archived", "favorite")
                and not l.get("isRead")]
        pool.sort(key=created)  # oldest first — clear the backlog
        return pool[:count]

    if mode == "rediscover":
        pool = [l for l in links
                if created(l) and created(l) < age_cutoff
                and viewed(l) < age_cutoff]
        # Prefer the ones gathering the most dust (least recently touched).
        pool.sort(key=lambda l: max(viewed(l), created(l)))
        if len(pool) < count:
            # Backfill with random older items so the digest isn't thin.
            extra = [l for l in links if l not in pool]
            random.shuffle(extra)
            pool += extra
        return pool[:count]

    # ── smart: a balanced mix of backlog + rediscovery ──────────────────
    unread = [l for l in links if l.get("status") not in ("archived", "favorite")
              and not l.get("isRead")]
    unread.sort(key=created)

    old = [l for l in links if created(l) and created(l) < age_cutoff]
    old.sort(key=lambda l: max(viewed(l), created(l)))

    picks, seen = [], set()
    # Roughly 60% fresh backlog, 40% rediscovery, interleaved.
    fresh_target = max(1, round(count * 0.6))
    for source, take in ((unread, fresh_target), (old, count - fresh_target)):
        for l in source:
            if len(picks) >= count:
                break
            if l["id"] in seen:
                continue
            picks.append(l)
            seen.add(l["id"])
        # (loop continues to second source)

    # Fill any remainder from a shuffle of everything left.
    if len(picks) < count:
        rest = [l for l in links if l["id"] not in seen]
        random.shuffle(rest)
        for l in rest:
            if len(picks) >= count:
                break
            picks.append(l)
            seen.add(l["id"])

    return picks[:count]


# ─────────────────────────────────────────────────────────────────────────
# Formatting — WhatsApp
# ─────────────────────────────────────────────────────────────────────────

def _link_url(link_id: str) -> str:
    return f"{APP_URL}?linkId={link_id}"


# Twilio caps a WhatsApp message body at 1600 chars; stay safely under it and
# split a long digest across multiple messages rather than have Twilio reject it.
WHATSAPP_LIMIT = 1500


def _whatsapp_card_block(index: int, c: dict) -> str:
    """Render a single card as an atomic WhatsApp block (never split)."""
    title = (c.get("title") or "Untitled").strip()
    category = c.get("category") or "General"
    emoji = _cat_emoji(category)
    read = (c.get("metadata") or {}).get("estimatedReadTime")
    meta = f"{emoji} {category}"
    if read:
        meta += f" · ⏱️ {read} min"
    summary = (c.get("summary") or "").strip()
    if len(summary) > 140:
        summary = summary[:137].rstrip() + "…"

    parts = [f"*{index}. {title}*", meta]
    if summary:
        parts.append(summary)
    parts.append(_link_url(c["id"]))
    return "\n".join(parts)


def _topics_label(topics) -> str:
    """Human-readable, original-case join of topics for headers/blurbs."""
    if not topics:
        return "your library"
    if isinstance(topics, str):
        topics = [topics]
    items = [t.strip() for t in topics if t and t.strip()]
    return ", ".join(items) if items else "your library"


def format_digest_whatsapp_messages(cards: List[dict], mode: str, topics, frequency: str) -> List[str]:
    """
    Render the curated cards as one or more WhatsApp messages, each kept under
    Twilio's length limit. Card blocks are packed greedily; the header rides on
    the first message and the footer on the last.
    """
    period = "Daily" if frequency == "daily" else "Weekly"
    blurb = MODE_BLURB.get(mode, MODE_BLURB["smart"]).format(topic=_topics_label(topics))
    header = f"🧠 *Your {period} Brew* — {len(cards)} cards\n_{blurb}_"
    footer = (f"📲 Open Machina AI:\n{APP_URL}\n\n"
              "_Reply DIGEST for a fresh one • STOP DIGEST to pause_")

    blocks = [_whatsapp_card_block(i, c) for i, c in enumerate(cards, 1)]

    messages: List[str] = []
    current = header
    for block in blocks:
        candidate = f"{current}\n\n{block}"
        if len(candidate) > WHATSAPP_LIMIT:
            messages.append(current)
            current = block
        else:
            current = candidate

    candidate = f"{current}\n\n{footer}"
    if len(candidate) > WHATSAPP_LIMIT:
        messages.append(current)
        messages.append(footer)
    else:
        messages.append(candidate)

    # Tag parts when there's more than one message.
    if len(messages) > 1:
        total = len(messages)
        messages = [f"{m}\n\n_({i}/{total})_" for i, m in enumerate(messages, 1)]
    return messages


def format_digest_whatsapp(cards: List[dict], mode: str, topics, frequency: str) -> str:
    """Convenience: the full digest as a single string (joins all parts)."""
    return "\n\n".join(format_digest_whatsapp_messages(cards, mode, topics, frequency))


# ─────────────────────────────────────────────────────────────────────────
# Formatting — Email (HTML + plain-text fallback)
# ─────────────────────────────────────────────────────────────────────────

def format_digest_email(cards: List[dict], mode: str, topics, frequency: str) -> tuple:
    """Return (subject, html_body, text_body)."""
    period = "Daily" if frequency == "daily" else "Weekly"
    blurb = MODE_BLURB.get(mode, MODE_BLURB["smart"]).format(topic=_topics_label(topics))
    subject = f"🧠 Your {period} Brew — {len(cards)} cards to revisit"

    # ── HTML ──
    rows = []
    for i, c in enumerate(cards, 1):
        title = html.escape((c.get("title") or "Untitled").strip())
        category = html.escape(c.get("category") or "General")
        emoji = _cat_emoji(c.get("category") or "")
        read = (c.get("metadata") or {}).get("estimatedReadTime")
        summary = html.escape((c.get("summary") or "").strip())
        url = html.escape(_link_url(c["id"]))
        src = html.escape((c.get("sourceName") or "").strip())
        rtl = ' dir="rtl"' if is_hebrew(c.get("title") or "") else ""

        meta_bits = [f"{emoji} {category}"]
        if read:
            meta_bits.append(f"⏱️ {read} min")
        if src and src not in ("None", "Screenshot"):
            meta_bits.append(src)
        meta = html.escape(" · ").join(html.escape(b) for b in meta_bits)

        rows.append(f"""
        <tr><td style="padding:0 0 16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="background:#1b1b29;border:1px solid #2c2c40;border-radius:16px;">
            <tr><td style="padding:18px 20px;"{rtl}>
              <div style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#8a8aa3;letter-spacing:.08em;text-transform:uppercase;">{meta}</div>
              <a href="{url}" style="display:block;margin:6px 0 8px;font:700 17px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;color:#ffffff;text-decoration:none;">{i}. {title}</a>
              <div style="font:400 14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#b6b6cc;">{summary}</div>
              <a href="{url}" style="display:inline-block;margin-top:12px;font:600 13px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#a78bfa;text-decoration:none;">Open card →</a>
            </td></tr>
          </table>
        </td></tr>""")

    html_body = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0e0e16;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0e0e16;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px;">
          <div style="font:800 24px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(90deg,#a78bfa,#ec4899);-webkit-background-clip:text;background-clip:text;color:#a78bfa;">🧠 Your {period} Brew</div>
          <div style="margin-top:6px;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#8a8aa3;">{html.escape(blurb)}</div>
        </td></tr>
        {''.join(rows)}
        <tr><td align="center" style="padding:8px 0 4px;">
          <a href="{html.escape(APP_URL)}" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#db2777);color:#fff;font:700 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;padding:14px 26px;border-radius:999px;">Open Machina AI</a>
        </td></tr>
        <tr><td align="center" style="padding:22px 0 0;">
          <div style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#5c5c75;">You're getting this because digests are on in Machina AI.<br/>Change the schedule, topic, or turn it off anytime in Settings.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""

    # ── Plain text ──
    text_lines = [f"Your {period} Brew — {len(cards)} cards", blurb, ""]
    for i, c in enumerate(cards, 1):
        text_lines.append(f"{i}. {c.get('title','Untitled')}")
        if c.get("summary"):
            text_lines.append(f"   {c['summary']}")
        text_lines.append(f"   {_link_url(c['id'])}")
        text_lines.append("")
    text_lines.append(f"Open Machina AI: {APP_URL}")
    text_body = "\n".join(text_lines)

    return subject, html_body, text_body


# ─────────────────────────────────────────────────────────────────────────
# Email delivery (SendGrid → SMTP → graceful no-op)
# ─────────────────────────────────────────────────────────────────────────

def _from_email() -> str:
    return os.environ.get("DIGEST_FROM_EMAIL", "Machina AI <digest@secondbrain.app>")


def send_email(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Send an email. Returns True on success, False on no-op/failure."""
    if not to_email:
        logger.warning("send_email called with no recipient")
        return False

    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    smtp_host = os.environ.get("SMTP_HOST")

    if sendgrid_key:
        try:
            resp = requests.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {sendgrid_key}",
                         "Content-Type": "application/json"},
                json={
                    "personalizations": [{"to": [{"email": to_email}]}],
                    "from": _parse_from(_from_email()),
                    "subject": subject,
                    "content": [
                        {"type": "text/plain", "value": text_body},
                        {"type": "text/html", "value": html_body},
                    ],
                },
                timeout=20,
            )
            if resp.status_code in (200, 201, 202):
                logger.info(f"Digest email sent to {to_email} via SendGrid")
                return True
            logger.error(f"SendGrid error {resp.status_code}: {resp.text[:300]}")
            return False
        except Exception as e:
            logger.error(f"SendGrid request failed: {e}")
            return False

    if smtp_host:
        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = _from_email()
            msg["To"] = to_email
            msg.set_content(text_body)
            msg.add_alternative(html_body, subtype="html")

            port = int(os.environ.get("SMTP_PORT", "587"))
            user = os.environ.get("SMTP_USER")
            password = os.environ.get("SMTP_PASSWORD")
            with smtplib.SMTP(smtp_host, port, timeout=20) as server:
                server.starttls()
                if user and password:
                    server.login(user, password)
                server.send_message(msg)
            logger.info(f"Digest email sent to {to_email} via SMTP")
            return True
        except Exception as e:
            logger.error(f"SMTP send failed: {e}")
            return False

    logger.warning(
        f"No email provider configured (set SENDGRID_API_KEY or SMTP_HOST). "
        f"Would have emailed {to_email}: {subject!r}"
    )
    return False


def _parse_from(value: str) -> dict:
    """Turn 'Name <addr@x>' or 'addr@x' into SendGrid's {email,name} dict."""
    if "<" in value and ">" in value:
        name = value.split("<")[0].strip()
        email_addr = value.split("<")[1].split(">")[0].strip()
        return {"email": email_addr, "name": name or "Machina AI"}
    return {"email": value.strip(), "name": "Machina AI"}


# ─────────────────────────────────────────────────────────────────────────
# Weekly "What you learned" synthesis (M12)
# ─────────────────────────────────────────────────────────────────────────

def _week_id(now: Optional[datetime] = None) -> str:
    """Stable id for the current ISO week, e.g. '2026-W27' — one synthesis/week."""
    now = now or datetime.now(timezone.utc)
    iso = now.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def synthesis_window_cards(links: List[dict]) -> List[dict]:
    """The saves from the last SYNTHESIS_WINDOW_DAYS, newest first — the raw
    material for the weekly recap. Pure function so it can be unit-tested."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    cutoff = now_ms - SYNTHESIS_WINDOW_DAYS * 86_400_000
    recent = [l for l in links if _to_ms(l.get("createdAt")) >= cutoff]
    recent.sort(key=lambda l: _to_ms(l.get("createdAt")), reverse=True)
    return recent


def _card_index(cards: List[dict]) -> dict:
    return {c["id"]: c for c in cards if c.get("id")}


def format_synthesis_whatsapp_messages(synth: dict, cards: List[dict]) -> List[str]:
    """Render the synthesis as one or more WhatsApp messages under Twilio's limit."""
    by_id = _card_index(cards)
    title = (synth.get("title") or "What you learned this week").strip()
    parts = [f"🧠 *{title}*"]

    narrative = (synth.get("narrative") or "").strip()
    if narrative:
        parts.append(narrative)

    for theme in (synth.get("themes") or []):
        t_title = (theme.get("title") or "").strip()
        insight = (theme.get("insight") or "").strip()
        if not t_title and not insight:
            continue
        block = f"*{t_title}*" if t_title else ""
        if insight:
            block = f"{block}\n{insight}" if block else insight
        # Link the theme's source cards.
        links_lines = []
        for cid in (theme.get("cardIds") or []):
            c = by_id.get(cid)
            if c:
                links_lines.append(f"• {(c.get('title') or 'Untitled').strip()}\n  {_link_url(cid)}")
        if links_lines:
            block += "\n" + "\n".join(links_lines)
        parts.append(block)

    standout_id = synth.get("standoutCardId")
    standout = by_id.get(standout_id) if standout_id else None
    if standout:
        reason = (synth.get("standoutReason") or "").strip()
        s = f"⭐ *Standout:* {(standout.get('title') or 'Untitled').strip()}"
        if reason:
            s += f"\n{reason}"
        s += f"\n{_link_url(standout_id)}"
        parts.append(s)

    question = (synth.get("openQuestion") or "").strip()
    if question:
        parts.append(f"💭 *Worth sitting with:*\n{question}")

    footer = f"📲 Open Machina AI:\n{APP_URL}"

    # Pack greedily into messages under the WhatsApp limit.
    messages: List[str] = []
    current = ""
    for block in parts:
        candidate = f"{current}\n\n{block}" if current else block
        if len(candidate) > WHATSAPP_LIMIT and current:
            messages.append(current)
            current = block
        else:
            current = candidate
    candidate = f"{current}\n\n{footer}"
    if len(candidate) > WHATSAPP_LIMIT:
        messages.append(current)
        messages.append(footer)
    else:
        messages.append(candidate)

    if len(messages) > 1:
        total = len(messages)
        messages = [f"{m}\n\n_({i}/{total})_" for i, m in enumerate(messages, 1)]
    return messages


def format_synthesis_email(synth: dict, cards: List[dict]) -> tuple:
    """Return (subject, html_body, text_body) for the weekly synthesis email."""
    by_id = _card_index(cards)
    title = (synth.get("title") or "What you learned this week").strip()
    subject = f"🧠 {title}"

    def _rtl(s: str) -> str:
        return ' dir="rtl"' if is_hebrew(s or "") else ""

    # Narrative — render paragraph breaks.
    narrative = html.escape((synth.get("narrative") or "").strip())
    narrative_html = "".join(
        f'<p style="margin:0 0 14px;font:400 15px/1.7 -apple-system,Segoe UI,Roboto,sans-serif;color:#c8c8dc;"{_rtl(p)}>{p}</p>'
        for p in narrative.split("\n") if p.strip()
    )

    theme_rows = []
    for theme in (synth.get("themes") or []):
        t_title = html.escape((theme.get("title") or "").strip())
        insight = html.escape((theme.get("insight") or "").strip())
        card_links = []
        for cid in (theme.get("cardIds") or []):
            c = by_id.get(cid)
            if not c:
                continue
            ct = html.escape((c.get("title") or "Untitled").strip())
            url = html.escape(_link_url(cid))
            card_links.append(
                f'<a href="{url}" style="display:block;margin:4px 0;font:500 14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#a78bfa;text-decoration:none;">↳ {ct}</a>'
            )
        theme_rows.append(f"""
        <tr><td style="padding:0 0 18px;">
          <div style="font:700 16px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#ffffff;">{t_title}</div>
          <div style="margin:4px 0 8px;font:400 14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#b6b6cc;">{insight}</div>
          {''.join(card_links)}
        </td></tr>""")

    standout_html = ""
    standout_id = synth.get("standoutCardId")
    standout = by_id.get(standout_id) if standout_id else None
    if standout:
        reason = html.escape((synth.get("standoutReason") or "").strip())
        ct = html.escape((standout.get("title") or "Untitled").strip())
        url = html.escape(_link_url(standout_id))
        standout_html = f"""
        <tr><td style="padding:4px 0 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#1b1b29;border:1px solid #2c2c40;border-radius:16px;">
            <tr><td style="padding:16px 18px;">
              <div style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#f0b45a;letter-spacing:.08em;text-transform:uppercase;">⭐ Standout</div>
              <a href="{url}" style="display:block;margin:6px 0 4px;font:700 16px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;color:#ffffff;text-decoration:none;">{ct}</a>
              <div style="font:400 14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#b6b6cc;">{reason}</div>
            </td></tr>
          </table>
        </td></tr>"""

    question_html = ""
    question = html.escape((synth.get("openQuestion") or "").strip())
    if question:
        question_html = f"""
        <tr><td style="padding:4px 0 18px;">
          <div style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#8a8aa3;letter-spacing:.08em;text-transform:uppercase;">💭 Worth sitting with</div>
          <div style="margin-top:6px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#c8c8dc;font-style:italic;">{question}</div>
        </td></tr>"""

    html_body = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0e0e16;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0e0e16;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px;">
          <div style="font:800 24px/1.25 -apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(90deg,#a78bfa,#ec4899);-webkit-background-clip:text;background-clip:text;color:#a78bfa;"{_rtl(title)}>{html.escape(title)}</div>
          <div style="margin-top:6px;font:400 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#8a8aa3;">Your week in Machina AI</div>
        </td></tr>
        <tr><td style="padding:0 4px 8px;">{narrative_html}</td></tr>
        {''.join(theme_rows)}
        {standout_html}
        {question_html}
        <tr><td align="center" style="padding:8px 0 4px;">
          <a href="{html.escape(APP_URL)}" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#db2777);color:#fff;font:700 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;padding:14px 26px;border-radius:999px;">Open Machina AI</a>
        </td></tr>
        <tr><td align="center" style="padding:22px 0 0;">
          <div style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#5c5c75;">You're getting this weekly recap because digests are on in Machina AI.<br/>Change it anytime in Settings.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""

    # ── Plain text ──
    text_lines = [title, ""]
    if synth.get("narrative"):
        text_lines += [synth["narrative"].strip(), ""]
    for theme in (synth.get("themes") or []):
        if theme.get("title"):
            text_lines.append(theme["title"])
        if theme.get("insight"):
            text_lines.append(f"  {theme['insight']}")
        for cid in (theme.get("cardIds") or []):
            c = by_id.get(cid)
            if c:
                text_lines.append(f"  - {(c.get('title') or 'Untitled').strip()}: {_link_url(cid)}")
        text_lines.append("")
    if standout:
        text_lines.append(f"Standout: {(standout.get('title') or 'Untitled').strip()} — {_link_url(standout_id)}")
        if synth.get("standoutReason"):
            text_lines.append(f"  {synth['standoutReason']}")
        text_lines.append("")
    if synth.get("openQuestion"):
        text_lines += [f"Worth sitting with: {synth['openQuestion']}", ""]
    text_lines.append(f"Open Machina AI: {APP_URL}")
    text_body = "\n".join(text_lines)

    return subject, html_body, text_body


def _write_inapp_synthesis(uid: str, synth: dict, cards: List[dict], week_id: str) -> None:
    """Persist the synthesis as an in-app "special card" the feed surfaces (M12).

    Stored at users/{uid}/syntheses/{week_id} (one per ISO week, so a re-run
    within the same week overwrites rather than duplicates). We denormalize the
    referenced cards' id+title+category so the card renders even if a source is
    later deleted — the feed still deep-links by id when the card exists.
    """
    by_id = _card_index(cards)
    referenced_ids = set()
    for theme in (synth.get("themes") or []):
        referenced_ids.update(theme.get("cardIds") or [])
    if synth.get("standoutCardId"):
        referenced_ids.add(synth["standoutCardId"])

    card_refs = [
        {
            "id": cid,
            "title": (by_id[cid].get("title") or "Untitled").strip(),
            "category": by_id[cid].get("category") or "General",
        }
        for cid in referenced_ids if cid in by_id
    ]

    doc = {
        "weekId": week_id,
        "title": synth.get("title") or "What you learned this week",
        "narrative": synth.get("narrative") or "",
        "themes": synth.get("themes") or [],
        "standoutCardId": synth.get("standoutCardId"),
        "standoutReason": synth.get("standoutReason") or "",
        "openQuestion": synth.get("openQuestion") or "",
        "cards": card_refs,
        "cardCount": len(cards),
        "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
    }
    try:
        get_db().collection("users").document(uid).collection("syntheses").document(week_id).set(doc)
    except Exception as e:
        logger.error(f"Failed to write in-app synthesis for {uid}: {e}")


def build_and_send_synthesis(uid: str, user_data: dict, links: List[dict], force: bool = False) -> dict:
    """Generate the weekly "What you learned" synthesis and deliver it.

    Always writes the in-app special card (that's the primary surface), and
    additionally sends over whichever email/WhatsApp channels the user has on.
    Returns a result dict shaped like build_and_send_digest's.
    """
    from whatsapp_handler import send_whatsapp_message  # lazy: pulls Twilio SDK
    from ai_service import GeminiService, AnalysisError

    settings = user_data.get("settings", {}) or {}
    channels = settings.get("digest_channels", ["whatsapp"]) or []
    result = {"uid": uid, "sent": False, "channels": [], "card_count": 0, "skipped": None, "mode": "synthesis"}

    cards = synthesis_window_cards(links)
    if len(cards) < SYNTHESIS_MIN_CARDS and not force:
        result["skipped"] = "not_enough_cards"
        return result
    if not cards:
        result["skipped"] = "no_cards"
        return result

    try:
        synth = GeminiService().synthesize_week(cards)
    except AnalysisError as e:
        logger.error(f"Synthesis generation failed for {uid}: {e}")
        result["skipped"] = "synthesis_failed"
        return result

    result["card_count"] = len(cards)
    week_id = _week_id()

    # Primary surface: always write the in-app special card.
    _write_inapp_synthesis(uid, synth, cards, week_id)
    result["channels"].append("in_app")

    # WhatsApp
    if "whatsapp" in channels:
        phone = user_data.get("phone_number") or user_data.get("phoneNumber")
        if phone:
            try:
                for body in format_synthesis_whatsapp_messages(synth, cards):
                    send_whatsapp_message(f"whatsapp:{phone}", body)
                result["channels"].append("whatsapp")
            except Exception as e:
                logger.error(f"Synthesis WhatsApp send failed for {uid}: {e}")

    # Email
    if "email" in channels:
        email_addr = user_data.get("email") or settings.get("email")
        if email_addr:
            try:
                subject, html_body, text_body = format_synthesis_email(synth, cards)
                if send_email(email_addr, subject, html_body, text_body):
                    result["channels"].append("email")
            except Exception as e:
                logger.error(f"Synthesis email send failed for {uid}: {e}")

    result["sent"] = True
    get_db().collection("users").document(uid).set(
        {"lastDigestSentAt": int(datetime.now(timezone.utc).timestamp() * 1000)},
        merge=True,
    )
    return result


# ─────────────────────────────────────────────────────────────────────────
# Orchestration
# ─────────────────────────────────────────────────────────────────────────

def build_and_send_digest(uid: str, user_data: dict, force: bool = False) -> dict:
    """
    Build a curated digest for one user and deliver it on their chosen
    channels. `force=True` ignores schedule/empty checks (used by the
    "send one now" preview button).

    Returns a per-user result dict.
    """
    from whatsapp_handler import send_whatsapp_message  # lazy: pulls Twilio SDK

    settings = user_data.get("settings", {}) or {}
    result = {"uid": uid, "sent": False, "channels": [], "card_count": 0, "skipped": None}

    mode = settings.get("digest_mode", "smart")
    # Support multi-topic (digest_topics) with single-topic (digest_topic) fallback.
    topics = settings.get("digest_topics") or []
    if not topics and settings.get("digest_topic"):
        topics = [settings["digest_topic"]]
    count = settings.get("digest_count", 5)
    frequency = settings.get("digest_frequency", "weekly")
    channels = settings.get("digest_channels", ["whatsapp"]) or []
    skip_empty = settings.get("digest_skip_empty", True)

    links = fetch_candidate_links(uid)

    # The weekly "What you learned" synthesis (M12) is its own narrative path —
    # it recaps the week's saves instead of curating a set of cards.
    if mode == "synthesis":
        return build_and_send_synthesis(uid, user_data, links, force=force)

    cards = curate(links, mode, count, topics)

    if not cards and skip_empty and not force:
        result["skipped"] = "no_cards"
        return result
    if not cards:
        result["skipped"] = "no_cards"
        return result

    result["card_count"] = len(cards)
    db = get_db()
    delivered_any = False

    # WhatsApp
    if "whatsapp" in channels:
        phone = user_data.get("phone_number") or user_data.get("phoneNumber")
        if phone:
            try:
                messages = format_digest_whatsapp_messages(cards, mode, topics, frequency)
                # Only count the channel as delivered if every part actually sent.
                all_sent = True
                for body in messages:
                    if not send_whatsapp_message(f"whatsapp:{phone}", body):
                        all_sent = False
                        break
                if all_sent and messages:
                    result["channels"].append("whatsapp")
                    result["whatsapp_parts"] = len(messages)
                    delivered_any = True
                else:
                    logger.error(f"Digest WhatsApp send failed for {uid} (no message SID)")
            except Exception as e:
                logger.error(f"Digest WhatsApp send failed for {uid}: {e}")
        else:
            logger.warning(f"Digest: user {uid} has whatsapp channel but no phone")

    # Email
    if "email" in channels:
        email_addr = user_data.get("email") or settings.get("email")
        if email_addr:
            try:
                subject, html_body, text_body = format_digest_email(cards, mode, topics, frequency)
                if send_email(email_addr, subject, html_body, text_body):
                    result["channels"].append("email")
                    delivered_any = True
            except Exception as e:
                logger.error(f"Digest email send failed for {uid}: {e}")
        else:
            logger.warning(f"Digest: user {uid} has email channel but no address")

    if delivered_any:
        result["sent"] = True
        db.collection("users").document(uid).set(
            {"lastDigestSentAt": int(datetime.now(timezone.utc).timestamp() * 1000)},
            merge=True,
        )

    return result


def _local_now(tz_name: Optional[str]) -> datetime:
    now = datetime.now(timezone.utc)
    if tz_name:
        try:
            from zoneinfo import ZoneInfo
            return now.astimezone(ZoneInfo(tz_name))
        except Exception as e:
            logger.warning(f"Bad timezone {tz_name!r}: {e}")
    return now


def is_due(settings: dict, tz_name: Optional[str], last_sent_ms: Optional[int]) -> bool:
    """
    Decide whether a user's digest is due *right now*. Designed to be called
    by an hourly scheduler — fires once when the local hour matches, and uses
    last_sent_ms to avoid duplicate sends within the same period.
    """
    if not settings.get("digest_enabled"):
        return False
    if not (settings.get("digest_channels") or []):
        return False

    local = _local_now(tz_name)
    target_hour = int(settings.get("digest_hour", 9))
    if local.hour != target_hour:
        return False

    frequency = settings.get("digest_frequency", "weekly")
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    last = last_sent_ms or 0

    if frequency == "daily":
        # Guard window: at least 20h since the last send.
        return (now_ms - last) >= 20 * 3600 * 1000

    # weekly
    target_day = int(settings.get("digest_day", 0))
    if local.weekday() != target_day:
        return False
    return (now_ms - last) >= 6 * 86_400 * 1000


def run_digest_check() -> dict:
    """
    Scheduled entry point. Walks every user, sends a digest to those who are
    due. Returns a summary report (mirrors run_reminder_check's shape).
    """
    db = get_db()
    logger.info("Starting digest check…")

    report = {
        "users_checked": 0,
        "users_enabled": 0,
        "digests_sent": 0,
        "cards_delivered": 0,
        "errors": [],
    }

    for user_doc in db.collection("users").get():
        report["users_checked"] += 1
        uid = user_doc.id
        user_data = user_doc.to_dict() or {}
        settings = user_data.get("settings", {}) or {}

        if not settings.get("digest_enabled"):
            continue
        report["users_enabled"] += 1

        try:
            if not is_due(settings, user_data.get("timezone"), user_data.get("lastDigestSentAt")):
                continue
            res = build_and_send_digest(uid, user_data, force=False)
            if res.get("sent"):
                report["digests_sent"] += 1
                report["cards_delivered"] += res.get("card_count", 0)
        except Exception as e:
            err = f"Digest failed for {uid}: {e}"
            logger.error(err)
            report["errors"].append(err)

    logger.info(f"Digest check complete: {report}")
    return report
