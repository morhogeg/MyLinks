"""
Semantic Search Implementation
Handles embedding generation and vector search queries.
"""

import os
import re
import json
import logging
from datetime import datetime
from typing import List, Optional, Any
from firebase_functions import firestore_fn, https_fn
from firebase_admin import firestore
from google.cloud import firestore as gc_firestore
from google.cloud.firestore_v1.vector import Vector
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google import genai

from db import get_db
from ai_service import embedding_needs_repair, collect_notes_text
from rate_limit import check_rate_limit

logger = logging.getLogger(__name__)


# ── Embedding text recipe ──────────────────────────────────────────────────
# Bump this whenever `build_embedding_text` changes what goes INTO the vector.
# Every card stamps the version it was embedded under (`embeddingVersion`); the
# `backfill_embeddings` admin endpoint re-embeds any card whose stamp is behind
# this number, so a recipe change can be rolled out to the whole existing
# library. v1 = title + short summary + tags only (the old, too-thin recipe that
# left detail invisible to Ask). v2 = the richer recipe below. v3 folds in the
# user's OWN note (userNote) so a card is findable by what the user thought about
# it, not only by the machine-written summary. v4 folds in ALL of the user's
# notes — the legacy `userNote` string PLUS the newer multi-note `userNotes`
# array (see ai_service.collect_notes_text) — so every note contributes.
# v5 keeps the v4 text but embeds it with task_type=RETRIEVAL_DOCUMENT (queries
# use RETRIEVAL_QUERY) — gemini-embedding-001's asymmetric retrieval mode, which
# measurably improves query→document matching over the untyped default. The
# vectors change, so the version bump rolls the re-embed out via the standard
# backfill.
EMBED_TEXT_VERSION = 5

# gemini-embedding-001 accepts ~2048 input tokens. We cap the assembled text at
# a conservative character budget (roughly that many tokens) so a long
# detailedSummary can never overflow the model input. The most important fields
# (title, summary, details) are placed first, so truncation only ever drops the
# lower-value tail (tags/concepts/highlights).
_EMBED_TEXT_MAX_CHARS = 8000


def build_embedding_text(data: dict) -> str:
    """Assemble the text that represents a card in vector space.

    The old recipe embedded only ``Title + Summary + Tags`` — so anything that
    lived in the deeper ``detailedSummary`` (the key points, conclusions, the
    specifics that didn't survive into the 2-4 sentence blurb) was structurally
    invisible to semantic search and Ask. That is the "you never saved that"
    demo-killer. This builder folds in every content field we actually STORE on
    a link doc — detailedSummary, the actionable takeaway, concepts, and video
    highlights — so a card can be found by the details it contains, not just its
    headline. (Raw scraped body is NOT stored on the doc, so it can't be
    embedded; we embed what persists.)

    Pure and importable so both the embed sites (the Firestore trigger, the
    background pipeline) and the backfill agree on one recipe, and it can be
    unit-tested offline.
    """
    data = data or {}
    title = (data.get("title") or "").strip()
    summary = (data.get("summary") or "").strip()
    detailed = (data.get("detailedSummary") or "").strip()
    # The user's own annotations — high-signal, their words, not the model's.
    # Merges the legacy `userNote` string + the multi-note `userNotes` array.
    note = collect_notes_text(data).strip()
    tags = ", ".join(t for t in (data.get("tags") or []) if t)
    concepts = ", ".join(c for c in (data.get("concepts") or []) if c)
    meta = data.get("metadata") or {}
    takeaway = (meta.get("actionableTakeaway") or "").strip()
    highlights = [str(h) for h in (data.get("videoHighlights") or []) if h]

    parts = []
    if title:
        parts.append(f"Title: {title}")
    if summary:
        parts.append(f"Summary: {summary}")
    if detailed:
        parts.append(f"Details: {detailed}")
    if note:
        parts.append(f"Note: {note}")
    if takeaway:
        parts.append(f"Takeaway: {takeaway}")
    if tags:
        parts.append(f"Tags: {tags}")
    if concepts:
        parts.append(f"Concepts: {concepts}")
    if highlights:
        parts.append("Highlights: " + " | ".join(highlights))

    return "\n".join(parts)[:_EMBED_TEXT_MAX_CHARS]


# ── Lexical scoring / rerank helpers (pure, unit-tested) ────────────────────
# Words too common to carry retrieval signal — dropped from both the keyword
# fallback and the rerank keyword-overlap term.
_RANK_STOPWORDS = {
    "the", "a", "an", "of", "to", "in", "on", "at", "by", "for", "and", "or",
    "is", "are", "was", "were", "be", "been", "this", "that", "these", "those",
    "what", "whats", "which", "who", "whom", "how", "why", "when", "where",
    "do", "does", "did", "done", "can", "could", "would", "should", "will",
    "i", "me", "my", "you", "your", "it", "its", "they", "them", "their",
    "about", "with", "from", "into", "as", "any", "some", "all", "have", "has",
    # Hebrew function words — the tokenizer is unicode-aware (see below), so
    # Hebrew questions produce tokens and these must not count as signal.
    "של", "את", "עם", "על", "זה", "זו", "מה", "איך", "למה", "מתי", "איפה",
    "הוא", "היא", "אני", "לא", "כן", "כל", "גם", "או", "אבל", "יש", "אין",
    "עוד", "כמו", "אם", "אז", "רק", "אלו", "האם", "שלי", "לי",
}


def keyword_query_tokens(question: str) -> set:
    """Content tokens (non-stopword) from a user question.

    Unicode-aware on purpose: the old `[^a-z0-9]+` splitter treated EVERY
    non-ASCII character as a separator, so a Hebrew question (or a Hebrew
    chip-anchor title) produced zero tokens — the keyword fallback, the
    rerank overlap boost, and the anchor-rescue scan were all silently dead
    for exactly the language the product treats as first-class. ASCII tokens
    keep the len>=3 floor; non-ASCII tokens qualify at len>=2 (Hebrew words
    are routinely 2-4 letters)."""
    tokens = set()
    for t in re.split(r"[\W_]+", (question or "").lower(), flags=re.UNICODE):
        if not t or t in _RANK_STOPWORDS:
            continue
        if len(t) >= 3 or (len(t) >= 2 and not t.isascii()):
            tokens.add(t)
    return tokens


def _card_haystack(data: dict) -> str:
    return " ".join(str(x) for x in [
        data.get("title", ""), data.get("summary", ""),
        " ".join(data.get("tags", []) or []),
        # Concepts too: an Ask chip can anchor on a concept ("what else did I
        # save on Resilience?") that appears ONLY in the concepts array — with
        # concepts absent from the haystack the lexical fallback and rerank
        # boost were blind to exactly the label the chip promised to find.
        " ".join(data.get("concepts", []) or []),
        data.get("sourceName", ""), data.get("category", ""),
        # The user's own notes are searchable too — a literal word they wrote
        # should surface the card in keyword fallback and rerank. Covers both the
        # legacy string and the multi-note array.
        collect_notes_text(data),
    ]).lower()


def keyword_match_score(data: dict, tokens: set) -> int:
    """Integer lexical score for a card against query `tokens`.

    A token in the title counts double (a title hit is the strongest lexical
    signal), plus one for appearing anywhere in title/summary/tags/source/
    category. Shared by the keyword fallback so the "obvious title hit" is never
    dropped.
    """
    if not tokens:
        return 0
    haystack = _card_haystack(data)
    title_l = str(data.get("title", "")).lower()
    return sum((2 if t in title_l else 0) + (1 if t in haystack else 0) for t in tokens)


# ── Vector-distance quality gate (pure, unit-tested) ────────────────────────
# find_nearest always returns the `limit` nearest neighbours no matter how far
# away they are — for a query the library has nothing about, that's 20 random
# cards presented as "results", ranked above every exact keyword hit. These
# cutoffs turn nearest-neighbour output into actual matches: keep a result only
# while it's within MARGIN of the best distance AND under an absolute ceiling.
# Cosine distance for gemini-embedding-001: strong matches typically land well
# under ~0.55; unrelated text drifts toward ~0.7+. The ceiling is deliberately
# generous (paraphrase recall — "that video about waking up early" must still
# find "morning routine") and env-tunable without a code change.
_DISTANCE_CEILING = float(os.environ.get("SEARCH_DISTANCE_CEILING", "0.68"))
_DISTANCE_MARGIN = float(os.environ.get("SEARCH_DISTANCE_MARGIN", "0.22"))
# Looser bound for the top-`min_keep` recall floor (see apply_distance_threshold).
_DISTANCE_HARD_CEILING = float(os.environ.get("SEARCH_DISTANCE_HARD_CEILING", "0.80"))


def _to_unix_ms(val) -> int:
    """Best-effort unix-ms from every `createdAt` shape that exists in the wild:
    Firestore datetime, unix ms/seconds number, ISO-8601 string. 0 when absent
    or unparseable. The web client (feedUtils.getTimestampNumber) and main.py's
    `_to_ms` defend against the same zoo — server-side ranking must too: one
    legacy string-timestamp card in a candidate set crashed rerank's min/max
    with a str-vs-int TypeError, which took the WHOLE search request down."""
    if val is None:
        return 0
    if hasattr(val, "timestamp"):
        try:
            return int(val.timestamp() * 1000)
        except Exception:
            return 0
    if isinstance(val, (int, float)):
        return int(val * 1000) if val < 1e12 else int(val)
    if isinstance(val, str):
        try:
            return int(datetime.fromisoformat(val.replace("Z", "+00:00")).timestamp() * 1000)
        except Exception:
            return 0
    return 0


def apply_distance_threshold(results: List[dict],
                             ceiling: float = None,
                             margin: float = None,
                             hard_ceiling: float = None,
                             min_keep: int = 3) -> List[dict]:
    """Drop vector results that are too far to be real matches.

    `results` arrive nearest-first, each carrying the `vector_distance` the
    query stamped (missing/malformed distances are kept — fail open, order
    already encodes rank). Cutoff = min(best_distance + margin, ceiling): the
    relative term keeps the cluster around the best hit; the absolute ceiling
    kills the tail when even the best hit is far.

    RECALL FLOOR: the first `min_keep` results survive the cutoff as long as
    they're under the (looser) `hard_ceiling`. Cross-language recall — an
    English "muffins" finding a Hebrew muffin card — legitimately lands at
    larger distances than a same-language match, and cutting the top handful
    on an absolute number turns the library's best answer into "No matches".
    The floor bounds worst-case junk at `min_keep` cards while making the
    top matches un-droppable; the 20-nearest-neighbour wall stays dead.
    Pure, unit-testable offline.
    """
    if not results:
        return []
    ceiling = _DISTANCE_CEILING if ceiling is None else ceiling
    margin = _DISTANCE_MARGIN if margin is None else margin
    hard_ceiling = _DISTANCE_HARD_CEILING if hard_ceiling is None else hard_ceiling
    dists = [r.get("vector_distance") for r in results
             if isinstance(r.get("vector_distance"), (int, float))]
    if not dists:
        return list(results)
    cutoff = min(min(dists) + margin, ceiling)
    kept = []
    for i, r in enumerate(results):
        d = r.get("vector_distance")
        if not isinstance(d, (int, float)) or d <= cutoff or (i < min_keep and d <= hard_ceiling):
            kept.append(r)
    return kept


def cut_at_distance_cliff(results: List[dict], min_keep: int = 2,
                          max_keep: int = 10, min_gap: float = 0.05) -> List[dict]:
    """Trim the nearest-neighbour tail at the biggest relevance cliff.

    Absolute distance cutoffs can't separate "the two muffin cards" from "the
    18 unrelated cards behind them" — real match distances vary per query and
    per language, so any fixed number is either too tight (drops the Hebrew
    match) or too loose (a wall of junk, the owner-reported failure). The
    CLIFF is scale-free: results arrive nearest-first, and when the gap
    between consecutive distances jumps by >= `min_gap`, everything past the
    jump is a different (worse) cluster — cut there. Guardrails: never cut
    inside the top `min_keep`, never keep more than `max_keep`, and fail open
    (no cut) when distances are missing or no clear cliff exists. Pure.
    """
    if len(results) <= min_keep:
        return list(results)
    dists = []
    for r in results:
        d = r.get("vector_distance")
        if not isinstance(d, (int, float)):
            return list(results)[:max_keep]  # no distances → order is all we have
        dists.append(d)
    cut = min(len(results), max_keep)
    for i in range(min_keep, cut):
        # FIRST cliff wins: the initial big jump is where the relevant cluster
        # ends; a later, larger jump is just structure inside the junk tail.
        if dists[i] - dists[i - 1] >= min_gap:
            cut = i
            break
    return list(results)[:cut]


def normalize_card_for_search(data: dict, doc_id: str) -> dict:
    """One search-result card: id stamped, createdAt as unix-ms, vector dropped.

    Both retrieval halves (vector + keyword scan) run their output through this
    so `rerank_candidates` never sees mixed timestamp types (a raw Firestore
    datetime minus an int crashes the recency math) and no embedding ever
    crosses to the client. Pure."""
    data = dict(data or {})
    if data.get("createdAt") is not None:
        # EVERY stored shape (datetime / ISO string / seconds / ms) → ms int,
        # so ranking math can never hit a mixed-type comparison.
        data["createdAt"] = _to_unix_ms(data.get("createdAt"))
    data.pop("embedding_vector", None)
    data["id"] = doc_id
    return data


# How many recent cards the lexical half scans (matches ask_brain's cap): the
# newest N by createdAt, deterministic and recency-biased. Cards older than the
# cap remain reachable via the vector half.
KEYWORD_SCAN_CAP = 1000


def keyword_scan_cards(uid: str, query_text: str, exclude_ids: set = None,
                       limit: int = 10) -> List[dict]:
    """Lexical retrieval over the newest KEYWORD_SCAN_CAP cards.

    The client's own keyword filter only sees the loaded feed window (newest
    ~150), so a literal title match older than the window used to be findable
    ONLY if vector search happened to rank it top-20. This server-side scan
    closes that hole for both the search bar (via perform_hybrid_search) and
    ask_brain's retrieval fallback. Scores via keyword_match_score (title hits
    weighted double), returns the best `limit` matches not in `exclude_ids`,
    normalized for rerank/client use.
    """
    tokens = keyword_query_tokens(query_text)
    if not tokens:
        return []
    exclude_ids = exclude_ids or set()

    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    query = links_ref.order_by(
        "createdAt", direction=gc_firestore.Query.DESCENDING
    ).limit(KEYWORD_SCAN_CAP)

    scored = []
    for doc in query.stream():
        if doc.id in exclude_ids:
            continue
        data = doc.to_dict() or {}
        # Mid-flight/failed captures have no settled content to ground an
        # answer in (matches recent_cards/category_cards) — and the anchor
        # rescue PINS its results to the front, so a failed placeholder must
        # never qualify.
        if data.get("status") in ("processing", "failed"):
            continue
        score = keyword_match_score(data, tokens)
        if score > 0:
            scored.append((score, normalize_card_for_search(data, doc.id)))

    scored.sort(key=lambda s: s[0], reverse=True)
    return [d for _, d in scored[:limit]]


def rerank_candidates(question: str, candidates: List[dict], top_k: int = 10) -> List[dict]:
    """Rerank vector-search candidates down to the best `top_k` for the model.

    `candidates` must arrive in vector-distance order (nearest first — the order
    ``find_nearest`` returns). We deepen retrieval (top-30) then rerank so a card
    that the pure vector score buried at rank ~20 but which literally contains
    the query's words is lifted back into the model's context. No new dependency
    and no second embedding call: the score blends

      - vector rank (dominant): 1.0 for the nearest, decaying to ~0 for the last,
      - keyword overlap on title/summary/tags (a boost, with title weighted
        extra) — this is what rescues the buried literal match,
      - recency (a gentle tiebreak; newer saves edge out older on a tie).

    Ties keep the original vector order (stable). Pure, so it's unit-testable
    offline over plain dicts.
    """
    if not candidates:
        return []

    q_tokens = keyword_query_tokens(question)
    # Coerce every timestamp shape defensively (see _to_unix_ms) — rerank must
    # never crash on a legacy card, whatever a caller feeds it.
    times = [_to_unix_ms(c.get("createdAt")) for c in candidates]
    oldest, newest = min(times), max(times)
    span = (newest - oldest) or 1
    n = len(candidates)

    scored = []
    for rank, c in enumerate(candidates):
        vscore = 1.0 - (rank / n)  # rank 0 -> 1.0, decays toward 0
        if q_tokens:
            # Unicode-aware split (matches keyword_query_tokens) — the old
            # ASCII-only split made the overlap boost blind to Hebrew.
            hay_tokens = set(re.split(r"[\W_]+", _card_haystack(c), flags=re.UNICODE))
            title_tokens = set(re.split(r"[\W_]+", str(c.get("title", "")).lower(), flags=re.UNICODE))
            overlap = len(q_tokens & hay_tokens) / len(q_tokens)
            title_overlap = len(q_tokens & title_tokens) / len(q_tokens)
        else:
            overlap = title_overlap = 0.0
        recency = (times[rank] - oldest) / span
        # Vector rank leads (weight 1.0), but a strong literal match is a strong
        # relevance signal — a FULL query-token overlap adds up to 0.75, enough
        # to rescue a card the vector score buried ~half the list down (the "you
        # never saved that" case) while never overturning a clear top-vector hit.
        # Recency (0.1) is only ever a gentle tiebreak.
        total = 1.0 * vscore + 0.50 * overlap + 0.25 * title_overlap + 0.1 * recency
        scored.append((total, rank, c))

    scored.sort(key=lambda s: (-s[0], s[1]))
    return [c for _, _, c in scored[:top_k]]


# ── Ask retrieval guarantees (pure parts unit-tested) ───────────────────────
# The Ask UI's suggestion/follow-up chips send questions that embed the cited
# card's TITLE in quotes (`Walk me through the steps in "Pan con Tomate
# Recipe"`) — that title is the chip's retrieval anchor, and the chip contract
# ("every offered chip actually works") depends on the anchored card reaching
# the model's context AT THE FRONT, where the deep-content window is (see
# ask_brain's slimming). Vector rank usually gets it there; these helpers make
# it a guarantee instead of a likelihood.

# A quoted span (straight/curly double quotes or guillemets), long enough to
# be a title rather than a quoted word. Chip titles are ≤60 chars + a
# truncation ellipsis. Single/curly-single quotes are deliberately NOT
# delimiters: chips always quote with double quotes, and a curly apostrophe
# inside a title ("Rafi’s Pasta") must not split the phrase.
_QUOTED_RE = re.compile(r'["“”«»]([^"“”«»]{3,120}?)["“”«»]')


def extract_quoted_phrases(question: str) -> List[str]:
    """Quoted spans in a question, with any truncation ellipsis trimmed."""
    out = []
    for m in _QUOTED_RE.finditer(question or ""):
        p = m.group(1).strip().rstrip(".").rstrip("…").strip()
        if p:
            out.append(p)
    return out


def _norm_title(s: str) -> str:
    """Case/punctuation/whitespace-insensitive form for title comparison
    (unicode-aware, so Hebrew titles compare correctly)."""
    return re.sub(r"[\W_]+", " ", (s or "").lower(), flags=re.UNICODE).strip()


def _title_match(t: str, p: str) -> bool:
    """Does normalized title `t` match normalized quoted phrase `p`? Exact, or
    a prefix in either direction (truncated quote), with a minimum length on
    the SHORTER side so a stray fragment can never claim an unrelated card —
    in either direction (a card titled just "Pan" must not be claimed by the
    phrase "Pan con Tomate Recipe", nor vice versa)."""
    if t == p:
        return True
    if len(p) >= 6 and t.startswith(p):
        return True
    return len(t) >= 6 and p.startswith(t)


def pin_title_phrases(phrases: List[str], cards: List[dict]):
    """Move cards whose title matches any of the (raw) title `phrases` to the
    FRONT of the list (otherwise stable). Returns (cards, matched).

    Phrases come from quoted titles in the question and/or the client's
    structured `anchorTitles` hint, sometimes truncated with an ellipsis — so
    a match is normalized equality or a prefix in either direction. Prefix
    matching requires a minimum phrase length so a stray short fragment (a
    title's own inner quotes, a quoted word) can never pin an unrelated card.
    `matched` tells the caller whether any phrase found its card."""
    norm = [p for p in (_norm_title(x) for x in phrases or []) if p]
    if not norm or not cards:
        return cards, False
    pinned, rest = [], []
    for c in cards:
        t = _norm_title(str(c.get("title", "")))
        if t and any(_title_match(t, p) for p in norm):
            pinned.append(c)
        else:
            rest.append(c)
    return (pinned + rest, True) if pinned else (cards, False)


def pin_quoted_title_cards(question: str, cards: List[dict]):
    """Question-text convenience wrapper over `pin_title_phrases`."""
    return pin_title_phrases(extract_quoted_phrases(question), cards)


def missing_title_phrases(phrases: List[str], cards: List[dict]) -> List[str]:
    """The (raw) title phrases that match NO card title in `cards`.

    A compare question carries TWO anchors; "did anything pin?" is not enough —
    each anchor the retrieval missed must be rescued individually, or the
    model is asked to compare a card it cannot see."""
    out = []
    for raw in phrases or []:
        p = _norm_title(raw)
        if not p:
            continue
        titles = (_norm_title(str(c.get("title", ""))) for c in cards)
        if not any(t and _title_match(t, p) for t in titles):
            out.append(raw)
    return out


def missing_quoted_phrases(question: str, cards: List[dict]) -> List[str]:
    """Question-text convenience wrapper over `missing_title_phrases`."""
    return missing_title_phrases(extract_quoted_phrases(question), cards)


def anchor_phrases_for(question: str, anchor_titles: List[str] = None,
                       excluded_titles: List[str] = None) -> List[str]:
    """Every title phrase ask_brain must GUARANTEE in context: the question's
    quoted titles plus the client's structured `anchorTitles` hint — minus
    anything the user excluded ("what else … besides X" must not re-pin X).
    Deduped by normalized form, original order kept."""
    raw = extract_quoted_phrases(question) + [
        str(t).strip() for t in (anchor_titles or []) if str(t).strip()
    ]
    excluded = [p for p in (_norm_title(t) for t in (excluded_titles or [])) if p]
    out, seen = [], set()
    for a in raw:
        na = _norm_title(a)
        if not na or na in seen:
            continue
        if any(_title_match(na, e) or _title_match(e, na) for e in excluded):
            continue
        seen.add(na)
        out.append(a)
    return out


# "Besides X" questions: the quoted titles are the ALREADY-KNOWN cards — the
# user explicitly wants OTHER sources. Treating them as anchors (or letting
# retrieval rank them first) re-presents the same card as a "new" find, the
# opposite of the ask. Only EXPLICIT exclusion prepositions qualify: a bare
# "what else can you tell me about 'X'?" means MORE on X (X is the anchor,
# not an exclusion) — chips express real exclusions via hints.excludeTitles,
# never by phrasing.
_EXCLUSION_RE = re.compile(
    r"\b(besides|other than|apart from|aside from|except|excluding)\b",
    re.IGNORECASE,
)


def is_exclusion_question(question: str) -> bool:
    """True when the question EXPLICITLY excludes already-known sources.
    Quoted spans (card titles) are ignored — only the user's own words vote."""
    return bool(_EXCLUSION_RE.search(_strip_quoted(question)))


def demote_cards_by_titles(titles: List[str], cards: List[dict]):
    """Move cards whose title matches any of `titles` to the BACK of the list
    (otherwise stable). They stay in context — the model may reference them
    ("besides X…") — but they can't crowd the front where the deep-content
    window and the model's attention live. Returns (cards, demoted_titles)."""
    norm = [p for p in (_norm_title(t) for t in titles or []) if p]
    if not norm or not cards:
        return cards, []
    front, back = [], []
    for c in cards:
        t = _norm_title(str(c.get("title", "")))
        if t and any(_title_match(t, p) for p in norm):
            back.append(c)
        else:
            front.append(c)
    return front + back, [str(c.get("title", "")) for c in back]


# ── Privacy (Photos-Hidden model) ───────────────────────────────────────────
# A card is EFFECTIVELY private when it carries its own `isPrivate` flag OR
# belongs to a private collection (membership = `collectionIds` on the link;
# the flag lives on the collection doc). The client keeps such cards out of
# the feed, search results, and facets — but Ask answers QUOTE card content,
# so the server must enforce the same promise: a private card must never be
# retrieved into the model's context or cited in an answer.

def private_collection_ids(uid: str) -> set:
    """Ids of the user's private collections (one small read per ask).
    On a read failure returns an empty set — card-level `isPrivate` filtering
    still applies; only collection-inherited privacy degrades, and the error
    is logged so it is visible."""
    try:
        db = get_db()
        docs = (db.collection("users").document(uid).collection("collections")
                .where("isPrivate", "==", True).stream())
        return {d.id for d in docs}
    except Exception as e:
        logger.error(f"private_collection_ids read failed: {e}")
        return set()


def is_effectively_private(data: dict, private_ids: set) -> bool:
    """Card-level flag OR membership in any private collection."""
    if data.get("isPrivate"):
        return True
    ids = data.get("collectionIds")
    return isinstance(ids, list) and any(i in private_ids for i in ids)


def strip_private_cards(cards: List[dict], private_ids: set) -> List[dict]:
    """Drop effectively-private (and degenerate falsy) cards from a retrieval
    result."""
    return [c for c in cards if c and not is_effectively_private(c, private_ids)]


def category_cards(uid: str, category: str, limit: int = 10) -> List[dict]:
    """The newest settled cards in one exact `category` — the ground truth
    behind "my <Category> saves" chips (the client sends the stored category
    string verbatim via hints). Ordered query first (needs the composite
    category+createdAt index); falls back to an unordered equality scan sorted
    in memory while that index is missing/building, so the chip never breaks."""
    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    try:
        docs = list(
            links_ref.where("category", "==", category)
            .order_by("createdAt", direction=gc_firestore.Query.DESCENDING)
            .limit(limit * 2).stream()
        )
    except Exception:
        docs = list(links_ref.where("category", "==", category).limit(120).stream())
    out = []
    for doc in docs:
        data = doc.to_dict() or {}
        if data.get("status") in ("processing", "failed"):
            continue
        out.append(normalize_card_for_search(data, doc.id))
    out.sort(key=lambda c: c.get("createdAt") or 0, reverse=True)
    return out[:limit]


def _strip_quoted(question: str) -> str:
    """The question with its quoted spans removed. Intent regexes must run on
    the user's OWN words only: a card literally titled "The Latest AI News"
    must not flip a question about it into recency retrieval, and a title
    containing "besides" must not read as an exclusion."""
    return _QUOTED_RE.sub(" ", question or "")


# Recency intent: questions the chips (and users) phrase about WHEN something
# was saved, not what it says — "catch me up on this week's saves", "recap my
# recent saves", "what did I save this week?", "what's my latest Tech save
# about?". Pure semantic retrieval on such text returns topically arbitrary
# cards; the ground truth is the createdAt ordering, so ask_brain merges the
# newest cards in front when this matches (see recent_cards).
_RECENCY_RE = re.compile(
    r"\b(this week|past week|last week|this month|past month|last month|"
    r"recent|recently|latest|newest|today|yesterday|last few days|"
    r"past few days|catch me up|recap)\b",
    re.IGNORECASE,
)


def is_recency_question(question: str) -> bool:
    """True when the question is about recently-saved cards (time-anchored).
    Quoted spans (card titles) are ignored — only the user's own words vote."""
    return bool(_RECENCY_RE.search(_strip_quoted(question)))


def recent_cards(uid: str, limit: int = 12) -> List[dict]:
    """The newest `limit` settled cards by createdAt — the ground truth behind
    recency questions. Skips mid-flight/failed captures (nothing to ground an
    answer in), normalized like every other retrieval path."""
    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")
    query = links_ref.order_by(
        "createdAt", direction=gc_firestore.Query.DESCENDING
    ).limit(limit * 2)  # headroom for skipped processing/failed docs
    out = []
    for doc in query.stream():
        data = doc.to_dict() or {}
        if data.get("status") in ("processing", "failed"):
            continue
        out.append(normalize_card_for_search(data, doc.id))
        if len(out) >= limit:
            break
    return out


class EmbeddingService:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
        else:
            logger.warning("GEMINI_API_KEY environment variable not set!")
        self.model = "models/gemini-embedding-001"
        logger.info(f"EmbeddingService initialized with model: {self.model}, client initialized: {self.client is not None}")

    def generate_embedding(self, text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
        """Generate 768-dim embedding for text.

        `task_type` is gemini-embedding-001's asymmetric-retrieval switch:
        stored cards embed as RETRIEVAL_DOCUMENT (the default — every doc-side
        caller inherits it), search queries as RETRIEVAL_QUERY. The pairing is
        what the model is trained on for query→document matching; the untyped
        default we used before leaves ranking quality on the table.
        """
        if not self.client:
            logger.error("Gemini client not initialized - cannot generate embeddings! Set GEMINI_API_KEY environment variable.")
            raise Exception("GEMINI_API_KEY not configured. Please set the GEMINI_API_KEY environment variable in Firebase Cloud Functions.")

        try:
            result = self.client.models.embed_content(
                model=self.model,
                # Guard the model's input limit — the v2 recipe folds in
                # detailedSummary, so the assembled text can be long.
                contents=text[:_EMBED_TEXT_MAX_CHARS],
                config={"output_dimensionality": 768, "task_type": task_type}
            )
            return result.embeddings[0].values
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise Exception(f"Gemini Embedding failed: {str(e)}")


@firestore_fn.on_document_written(document="users/{uid}/links/{linkId}")
def sync_link_embedding(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    """Trigger: keep every link's `embedding_vector` a valid, searchable Vector.

    Fires on any write (create OR update), not just create, so the two paths
    that previously produced un-searchable embeddings are now self-healing:
      - a **retry** re-runs `/api/analyze` and updates the card in place — an
        `update`, which the old create-only trigger never saw, so the retried
        card was left with no (or a client-round-tripped list) embedding.
      - a client-written **list** embedding (schema drift) or a legacy
        **degenerate** vector never got repaired.

    Loop-safe: we only (re)embed when `embedding_needs_repair` says the stored
    vector is missing/list/degenerate or `needsEmbedding` is set. Our own write
    stores a real Vector and clears the flag, so the write it re-fires no-ops.
    """
    try:
        change = event.data
        snapshot = change.after if change else None
        if snapshot is None or not snapshot.exists:
            return  # deletion — nothing to embed

        data = snapshot.to_dict() or {}
        link_id = snapshot.id
        uid = event.params["uid"]

        # Only embed cards in a settled, searchable state. Skip mid-flight
        # (`processing` placeholder / retry optimistic write — content isn't
        # final and the terminal write re-fires this trigger) and `failed` cards
        # (not searchable; they re-embed when a retry flips them to `unread`).
        if data.get("status") in ("processing", "failed"):
            return

        if not (data.get("needsEmbedding") or embedding_needs_repair(data.get("embedding_vector"))):
            return  # already has a valid Vector — no-op (also breaks the loop)

        if not (data.get("title") or data.get("summary")):
            return  # placeholder/empty card — wait for real content before embedding

        # Richer v2 recipe: fold in detailedSummary/takeaway/concepts, not just
        # the headline, so a card is findable by the details it actually holds.
        text_to_embed = build_embedding_text(data)
        if not text_to_embed:
            return

        # Cost backstop (defense-in-depth): this trigger fires on ANY write to
        # users/{uid}/links/** — pre-cutover the live rules leave that path
        # world-writable, so a direct Firestore write (bypassing every HTTP rate
        # limit and quota) reaches this paid embedding call. Cap per uid for
        # fairness AND globally, because a writer minting random uids gets a
        # fresh per-uid bucket each time — only the global ceiling bounds that.
        # Both limits sit far above legitimate flow (saves are capped at
        # ≤60/hr/uid upstream; embeds ≈ saves + retries). Over-limit or
        # limiter error → skip WITHOUT writing: the missing/flagged vector keeps
        # embedding_needs_repair() true so a later write or Settings→Connections
        # rebuild repairs the card, whereas writing a marker here would re-fire
        # this trigger and loop. Fail-closed like every paid bucket (report 3.5);
        # a skipped embed degrades search for one card, never loses data.
        if not check_rate_limit(f"embed-uid:{uid}", 150, 3600, fail_open=False):
            logger.warning("Per-uid embed rate limit hit — deferring embedding")
            return
        if not check_rate_limit("embed-global", 1000, 3600, fail_open=False):
            logger.warning("Global embed rate limit hit — deferring embedding")
            return

        db = get_db()
        doc_ref = db.collection("users").document(uid).collection("links").document(link_id)

        logger.info(f"Generating embedding for link {link_id}...")
        service = EmbeddingService()
        try:
            vector = service.generate_embedding(text_to_embed)
        except Exception as embed_err:
            # Embed failed: flag for backfill and drop any drift/degenerate value
            # rather than leaving something un-searchable in place silently.
            logger.error(f"Embedding failed for {link_id}, flagging needsEmbedding: {embed_err}")
            doc_ref.update({"needsEmbedding": True, "embedding_vector": firestore.DELETE_FIELD})
            return

        if vector:
            logger.info(f"Vector generated (len={len(vector)}). Updating document...")
            doc_ref.update({
                "embedding_vector": Vector(vector),
                "embeddingVersion": EMBED_TEXT_VERSION,
                "needsEmbedding": firestore.DELETE_FIELD,
            })
        else:
            doc_ref.update({"needsEmbedding": True, "embedding_vector": firestore.DELETE_FIELD})

    except Exception as e:
        logger.error(f"Error in sync_link_embedding: {e}")


def perform_search_logic(uid: str, query_text: str, limit: int = 10) -> List[dict]:
    """Core search logic separated from Firebase transport."""
    logger.info(f"Searching for '{query_text}' for user {uid}")

    service = EmbeddingService()
    
    # Check if API key is configured
    if not service.api_key:
        raise Exception("SEMANTIC_SEARCH_NOT_CONFIGURED: GEMINI_API_KEY environment variable not set. Please configure the API key in Firebase Cloud Functions.")
    
    try:
        # RETRIEVAL_QUERY pairs with the stored cards' RETRIEVAL_DOCUMENT
        # vectors (asymmetric retrieval — see generate_embedding).
        query_vector = service.generate_embedding(query_text, task_type="RETRIEVAL_QUERY")
    except Exception as e:
        logger.error(f"Failed to generate query embedding: {e}")
        raise Exception(f"SEMANTIC_SEARCH_ERROR: Failed to generate query embedding - {str(e)}")

    if not query_vector:
        raise Exception("Failed to generate query embedding")

    db = get_db()
    links_ref = db.collection("users").document(uid).collection("links")

    # Does this library have ANY embedded docs to search? Sampling a SINGLE
    # arbitrary doc (the old `limit(1)`) was a correctness bug: if that one doc
    # happened to lack `embedding_vector` (still processing, failed, or flagged
    # needsEmbedding), semantic search AND ask_brain retrieval returned [] for
    # the WHOLE user even when every other doc was fully embedded. Sample a
    # handful instead and treat the library as searchable if ANY of them carries
    # an embedding. This needs no new Firestore index — an
    # `order_by('embedding_vector')` or a `where('embedding_vector', '!=', None)`
    # would each require a scalar index the field doesn't have (it only has the
    # vectorConfig index used by find_nearest), whereas a small scan does not.
    sample_docs = list(links_ref.limit(10).stream())
    has_any_embeddings = any("embedding_vector" in d.to_dict() for d in sample_docs)

    if not has_any_embeddings:
        logger.warning(f"No embeddings found for user {uid}. Use Settings → Connections → Rebuild (or the backfill_related_links admin endpoint) to generate embeddings for existing links.")
        # Don't fail the search, just return empty results with a helpful message
        return []

    try:
        vector_query = links_ref.find_nearest(
            vector_field="embedding_vector",
            query_vector=Vector(query_vector),
            distance_measure=DistanceMeasure.COSINE,
            limit=limit,
            distance_result_field="vector_distance"
        )

        results = vector_query.get()
    except Exception as e:
        logger.error(f"Vector search query failed: {e}")
        # If the vector index isn't ready, return empty with message
        raise Exception(f"VECTOR_SEARCH_ERROR: {str(e)}. Make sure the vector index is deployed in Firestore.")

    links = [normalize_card_for_search(doc.to_dict(), doc.id) for doc in results]

    logger.info(f"Found {len(links)} results.")
    return links


def perform_hybrid_search(uid: str, query_text: str, limit: int = 20) -> List[dict]:
    """Search-bar retrieval: quality-gated vector search + lexical scan, fused.

    This is what the home search bar (web callable + native HTTP twin) serves:

      1. Vector search DEEP (top-30), then `apply_distance_threshold` so
         nearest-neighbour padding never masquerades as results.
      2. `keyword_scan_cards` over the newest 1000 — literal matches the vector
         rank buried (or that live beyond the client's loaded feed window,
         which the client's own keyword filter can't see).
      3. Merge (vector order first, keyword extras deduped after) and
         `rerank_candidates` — vector rank leads, literal overlap boosts,
         recency tiebreaks — down to `limit`.

    Degrades instead of failing: if the vector half errors transiently, the
    lexical half still serves (an outage must not blank the search bar). Only
    the unambiguous config error (no API key) propagates, so the client can
    show its "not configured" notice.
    """
    vector_results: List[dict] = []
    try:
        vector_results = perform_search_logic(uid, query_text, limit=30)
    except Exception as e:
        if "SEMANTIC_SEARCH_NOT_CONFIGURED" in str(e):
            raise
        logger.error(f"Hybrid search: vector half failed, degrading to keyword-only: {e}")

    vector_results = apply_distance_threshold(vector_results)
    # Then trim at the per-query relevance cliff — the absolute gate bounds
    # worst-case junk, the cliff removes the "wall of loosely-related cards"
    # behind the actual matches (owner-reported precision failure).
    vector_results = cut_at_distance_cliff(vector_results)

    try:
        have = {r.get("id") for r in vector_results}
        keyword_hits = keyword_scan_cards(uid, query_text, exclude_ids=have, limit=10)
    except Exception as e:
        logger.error(f"Hybrid search: keyword scan failed: {e}")
        keyword_hits = []

    merged = vector_results + keyword_hits
    ranked = rerank_candidates(query_text, merged, top_k=limit)
    # The distance served its purpose (threshold + rank) — don't leak internals.
    for r in ranked:
        r.pop("vector_distance", None)
    return ranked


@https_fn.on_call(max_instances=10)
def search_links(req: https_fn.CallableRequest) -> Any:
    """
    Callable Function: Perform semantic search.
    Input: { query: string, limit?: number }
    """
    uid = None
    try:
        # Prefer the verified caller; fall back to the client uid only while
        # REQUIRE_AUTH is off (staged rollout).
        from link_service import find_data_uid_by_auth_uid
        from main import REQUIRE_AUTH
        uid = find_data_uid_by_auth_uid(req.auth.uid) if req.auth else None
        if not uid and not REQUIRE_AUTH and req.data:
            uid = req.data.get("uid") or req.data.get("test_uid")
        if not uid:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="User must be authenticated")

        query_text = req.data.get("query")
        limit = req.data.get("limit", 10)

        if not query_text:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Query text is required")

        links = perform_hybrid_search(uid, query_text, limit)
        return {"links": links}

    except https_fn.HttpsError:
        raise
    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        # Durable trail (lazy import — main imports this module at load time).
        # The web search bar calls THIS callable, so a failure here must land in
        # server_errors like every other 5xx or it's invisible in production.
        try:
            from main import _record_server_error
            _record_server_error("search_links", e, uid=uid)
        except Exception:
            pass
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Search failed")

