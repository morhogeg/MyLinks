"""Capture & ingestion edge cases (launch-readiness pass).

Covers: fetch failures become FAILED cards (not junk "ready" ones) and refund;
refused / cookie-walled pages become partial reads; article extraction and
charset; direct files; shared text around a URL; the share-sheet note is
written before it is analyzed; quote notes never set reminders; a card deleted
mid-processing is never resurrected; the janitor's queued clock.

Offline: every Firestore/Gemini/network boundary is faked.
"""

import json
import types
from unittest.mock import MagicMock

import pytest
import requests

import main
import scraper


class _Resp:
    """A requests.Response as scrape_url consumes it (bytes body)."""

    def __init__(self, body=b"", content_type="text/html; charset=utf-8", status=200,
                 url=None):
        self.content = body if isinstance(body, bytes) else body.encode("utf-8")
        self.text = self.content.decode("latin-1")  # what requests would guess
        self.headers = {"Content-Type": content_type}
        self.status_code = status
        self.ok = status < 400
        self.url = url


@pytest.fixture(autouse=True)
def _no_ssrf_guard(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)


def _serve(monkeypatch, resp):
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: resp)


def _raise(monkeypatch, exc):
    def _get(*a, **k):
        raise exc
    monkeypatch.setattr(scraper, "safe_get", _get)


# ── 1. fetch failures vs partial reads ───────────────────────────────────────

@pytest.mark.parametrize("status,kind", [(404, "not_found"), (410, "gone"), (503, "server")])
def test_dead_pages_are_fetch_failures(monkeypatch, status, kind):
    _serve(monkeypatch, _Resp(b"<html><body><p>Not found</p></body></html>", status=status))
    r = scraper.scrape_url("https://example.com/gone")
    assert r["fetch_error"] == kind
    assert r["fetch_error_message"] == scraper.FETCH_ERROR_MESSAGES[kind]


def test_timeout_is_a_fetch_failure(monkeypatch):
    _raise(monkeypatch, requests.exceptions.ReadTimeout("read timed out"))
    assert scraper.scrape_url("https://example.com/slow")["fetch_error"] == "timeout"


def test_dns_failure_is_a_fetch_failure(monkeypatch):
    def _no_host(url):
        raise scraper.UnsafeURLError("Could not resolve host: nope.invalid")
    monkeypatch.setattr(scraper, "validate_public_url", _no_host)
    assert scraper.scrape_url("https://nope.invalid/x")["fetch_error"] == "dns"


def test_connection_error_is_a_fetch_failure(monkeypatch):
    _raise(monkeypatch, requests.exceptions.ConnectionError("Connection refused"))
    assert scraper.scrape_url("https://example.com/x")["fetch_error"] == "network"


def test_streaming_timeout_is_a_fetch_failure(monkeypatch):
    _raise(monkeypatch, scraper.ResponseTooLargeError("Response timed out while streaming"))
    assert scraper.scrape_url("https://example.com/x")["fetch_error"] == "timeout"


@pytest.mark.parametrize("status", [403, 429])
def test_refused_page_is_a_partial_read_with_og_tags(monkeypatch, status):
    pytest.importorskip("bs4")
    html = ("<html><head><title>Blocked</title>"
            "<meta property='og:title' content='The real headline'>"
            "<meta property='og:description' content='What the article is about'>"
            "</head><body>Access denied</body></html>")
    _serve(monkeypatch, _Resp(html, status=status))
    r = scraper.scrape_url("https://example.com/paywalled")
    assert "fetch_error" not in r
    assert r["truncated"] is True and r["capture_reason"] == "login_wall"
    assert "The real headline" in r["text"] and "What the article is about" in r["text"]
    assert main._capture_quality(r) == {"captureQuality": "partial", "captureReason": "login_wall"}


def test_refused_page_without_og_is_still_partial_not_failed(monkeypatch):
    _serve(monkeypatch, _Resp(b"", content_type="text/plain", status=403))
    r = scraper.scrape_url("https://example.com/paywalled")
    assert r["truncated"] is True and r["capture_reason"] == "login_wall"
    assert r["text"] == "[no text content available]"


def test_cookie_wall_is_a_partial_read(monkeypatch):
    pytest.importorskip("bs4")
    html = ("<html><head><meta property='og:title' content='Budget talks resume'></head><body>"
            "<div>We value your privacy. We use cookies to improve your experience. "
            "Accept all or manage preferences.</div></body></html>")
    _serve(monkeypatch, _Resp(html))
    r = scraper.scrape_url("https://news.example.com/story")
    assert r["truncated"] is True and r["capture_reason"] == "login_wall"
    assert "Budget talks resume" in r["text"]


def test_empty_platform_scrape_is_an_honest_partial_not_junk(monkeypatch):
    monkeypatch.setattr(scraper, "_scrape_twitter_url", lambda url: {"html": "", "title": "", "text": ""})
    r = scraper.scrape_url("https://x.com/someone/status/1")
    assert r["text"] == "[no text content available]"
    assert main._capture_quality(r) == {"captureQuality": "partial", "captureReason": "login_wall"}
    assert "SOURCE URL: https://x.com/someone/status/1" in main._prompt_content(r)


# ── 5. article extraction ────────────────────────────────────────────────────

def test_article_extraction_skips_chrome_and_counts_text_once(monkeypatch):
    pytest.importorskip("bs4")
    para = "Genuine article sentence number {} with enough words to count. "
    body = "".join(f"<p>{para.format(i)}</p>" for i in range(12))
    html = ("<html><head><title>T</title></head><body>"
            "<nav><p>Home About Subscribe Login</p></nav>"
            f"<article><header><h1>The Headline</h1></header>{body}</article>"
            "<aside><p>Most read: something else entirely</p></aside>"
            "<footer><p>Copyright footer text</p></footer></body></html>")
    _serve(monkeypatch, _Resp(html))
    r = scraper.scrape_url("https://example.com/article")
    assert "Subscribe" not in r["text"]
    assert "Most read" not in r["text"]
    assert "Copyright" not in r["text"]
    assert "The Headline" in r["text"]
    # Each paragraph exactly once (the old code appended <article> text again).
    assert r["text"].count("sentence number 3 ") == 1
    assert r["truncated"] is False


def test_long_article_is_capped_and_flagged(monkeypatch):
    pytest.importorskip("bs4")
    body = "".join(f"<p>{'word ' * 200}{i}</p>" for i in range(40))  # ~40k chars
    _serve(monkeypatch, _Resp(f"<html><body><main>{body}</main></body></html>"))
    r = scraper.scrape_url("https://example.com/long")
    assert len(r["text"]) == scraper.MAX_ARTICLE_CHARS
    assert r["text_truncated"] is True
    assert r["truncated"] is False  # read fine — not a partial capture
    assert main._scrape_extras("https://example.com/long", r) == {"contentTruncated": True}


# ── 6. charset ───────────────────────────────────────────────────────────────

def test_hebrew_page_declaring_charset_only_in_meta_decodes(monkeypatch):
    pytest.importorskip("bs4")
    sentence = "זהו משפט בעברית שנכתב כדי לבדוק את הפענוח של הדף. "
    html = ("<html><head><meta charset='utf-8'><title>כותרת</title></head><body>"
            f"<p>{sentence * 4}</p></body></html>")
    # Header without a charset: requests would have decoded this as latin-1.
    _serve(monkeypatch, _Resp(html.encode("utf-8"), content_type="text/html"))
    r = scraper.scrape_url("https://example.co.il/a")
    assert "זהו משפט בעברית" in r["text"]
    assert r["title"] == "כותרת"


# ── 7. direct files ──────────────────────────────────────────────────────────

def test_image_url_routes_to_image_analysis(monkeypatch):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    _serve(monkeypatch, _Resp(png, content_type="image/png"))
    r = scraper.scrape_url("https://cdn.example.com/chart.png")
    assert r["content_type"] == "image_file"
    assert r["image_bytes"] == png and r["image_mime"] == "image/png"

    seen = {}

    class _AI:
        def analyze_image(self, b, mime, **k):
            seen["mime"] = mime
            return {"title": "A chart", "summary": "s"}

    out = main._analyze_scraped(_AI(), r, [])
    assert out["title"] == "A chart" and seen["mime"] == "image/png"
    assert r["_post_thumbnail"] == (png, "image/png")  # the card shows it


def test_video_and_archives_are_unreadable_files_not_html(monkeypatch):
    for ctype, label in (("video/mp4", "clip.mp4"), ("application/zip", "bundle.zip")):
        _serve(monkeypatch, _Resp(b"\x00\x01binary", content_type=ctype))
        r = scraper.scrape_url(f"https://example.com/{label}")
        assert r["capture_reason"] == "file"
        assert r["text"] == "[no text content available]"
        assert r["title"] == label


def test_pdf_goes_to_the_model_natively(monkeypatch):
    _serve(monkeypatch, _Resp(b"%PDF-1.7 real pdf", content_type="application/pdf"))
    r = scraper.scrape_url("https://example.com/paper.pdf")
    seen = {}

    class _AI:
        def analyze_document(self, b, mime, context_text="", **k):
            seen.update(bytes=b, mime=mime, ctx=context_text)
            return {"title": "Paper", "summary": "About the paper"}

    out = main._analyze_scraped(_AI(), r, [])
    assert out["title"] == "Paper"
    assert seen["mime"] == "application/pdf" and seen["bytes"].startswith(b"%PDF")
    assert "SOURCE URL: https://example.com/paper.pdf" in seen["ctx"]
    assert "[no text content available]" not in seen["ctx"]
    assert main._capture_quality(r) == {}


# ── prompt input when the body is empty ──────────────────────────────────────

def test_empty_body_prompt_carries_url_and_title():
    text = main._prompt_content({"html": "", "title": "Some title", "text": "",
                                 "source_url": "https://example.com/x"})
    assert "SOURCE URL: https://example.com/x" in text
    assert "PAGE TITLE: Some title" in text
    assert "[no text content available]" in text


def test_full_read_prompt_is_unchanged():
    body = "A long real article body. " * 10
    assert main._prompt_content({"text": body, "source_url": "https://e.com"}) == body


# ── 8. shared text ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,url", [
    ("see https://example.com/a).", "https://example.com/a"),
    ("“https://example.com/a”", "https://example.com/a"),
    ("https://example.com/a!?", "https://example.com/a"),
    ("«https://example.com/a»", "https://example.com/a"),
    ("https://en.wikipedia.org/wiki/Foo_(bar)", "https://en.wikipedia.org/wiki/Foo_(bar)"),
    ("(https://en.wikipedia.org/wiki/Foo_(bar))", "https://en.wikipedia.org/wiki/Foo_(bar)"),
])
def test_extract_url_trims_trailing_punctuation(raw, url):
    assert main._extract_url(raw) == url


def test_split_shared_text_keeps_the_words_and_other_links():
    url, rest, extras = main._split_shared_text(
        None, "Worth reading before Sunday https://a.com/one and also https://b.com/two.")
    assert url == "https://a.com/one"
    assert extras == ["https://b.com/two"]
    assert "Worth reading before Sunday" in rest
    assert "https://b.com/two" in rest  # listed in the body, not dropped


def test_split_shared_text_title_dash_url_leaves_just_the_title():
    url, rest, extras = main._split_shared_text(None, "Big Article Title – https://a.com/x")
    assert url == "https://a.com/x" and rest == "Big Article Title" and extras == []


def test_shared_note_entry_skips_the_page_title():
    assert main._shared_note_entry("Big Article Title", {"title": "Big Article Title | Site"}) is None
    entry = main._shared_note_entry("Read the part about pricing", {"title": "Big Article Title"})
    assert entry["text"] == "Read the part about pricing"


# ── share_ingest (web path, no token) ────────────────────────────────────────

class _Req:
    def __init__(self, body):
        self.method = "POST"
        self._body = body
        self.headers = {}
        self.remote_addr = "203.0.113.9"

    def get_json(self, silent=False):
        return self._body


class _Doc:
    def __init__(self, store, path):
        self.store, self.path, self.id = store, path, path.rsplit("/", 1)[-1]

    def set(self, data):
        self.store[self.path] = dict(data)

    def update(self, data):
        if self.path not in self.store:
            raise RuntimeError("NotFound")
        self.store[self.path].update(data)

    def get(self):
        return types.SimpleNamespace(exists=self.path in self.store,
                                     to_dict=lambda: dict(self.store.get(self.path) or {}))

    def collection(self, name):
        return _Col(self.store, f"{self.path}/{name}")


class _Col:
    def __init__(self, store, path):
        self.store, self.path, self.n = store, path, 0

    def document(self, doc_id=None):
        if doc_id is None:
            self.n += 1
            doc_id = f"d{self.n}"
        return _Doc(self.store, f"{self.path}/{doc_id}")


class _DB:
    def __init__(self):
        self.store = {}
        self._cols = {}

    def collection(self, name):
        return self._cols.setdefault(name, _Col(self.store, name))


def _stub_share(monkeypatch, db):
    refunds = []
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "_rate_limited", lambda *a, **k: None)
    monkeypatch.setattr(main, "_require_app_check", lambda *a, **k: True)
    monkeypatch.setattr(main, "_authed_uid", lambda *a, **k: ("ws-1", None))
    monkeypatch.setattr(main, "_quota_blocked", lambda *a, **k: None)
    monkeypatch.setattr(main, "refund_quota", lambda uid, kind, amount=1: refunds.append(kind))
    monkeypatch.setattr(main, "link_exists_for_url", lambda uid, url: False)
    monkeypatch.setattr(main, "pending_exists_for_url", lambda uid, url: False)
    monkeypatch.setattr(main, "get_user_vocabulary", lambda uid: ([], []))
    return refunds


def _json(resp):
    return json.loads(resp.get_data(as_text=True))


def test_share_text_with_url_keeps_the_text_and_reports_extra_links(monkeypatch):
    db = _DB()
    _stub_share(monkeypatch, db)
    resp = main.share_ingest(_Req({"text": "Great thread https://a.com/1 plus https://b.com/2"}))
    body = _json(resp)
    assert body["queued"] and body["url"] == "https://a.com/1"
    assert body["savedFirstOf"] == 2 and body["otherUrls"] == ["https://b.com/2"]
    q = next(v for k, v in db.store.items() if k.startswith("pending_processing/"))
    assert "Great thread" in q["body"] and "https://b.com/2" in q["body"]
    assert q["userNoteText"].startswith("Great thread")
    assert q["reminderText"] == ""  # ride-along text is never a reminder
    assert q["urlKey"] == "https://a.com/1"


def test_extension_selection_is_a_quote(monkeypatch):
    db = _DB()
    _stub_share(monkeypatch, db)
    main.share_ingest(_Req({"url": "https://a.com/1", "note": "see you tomorrow", "noteKind": "quote"}))
    q = next(v for k, v in db.store.items() if k.startswith("pending_processing/"))
    assert q["noteKind"] == "quote"


def test_share_note_is_written_before_analysis_and_refunded_on_failure(monkeypatch):
    db = _DB()
    refunds = _stub_share(monkeypatch, db)

    class _AI:
        def analyze_text(self, *a, **k):
            raise main.AnalysisError("gemini down")

    monkeypatch.setattr(main, "GeminiService", lambda: _AI())
    resp = main.share_ingest(_Req({"text": "A thought worth keeping, no link here."}))
    body = _json(resp)
    assert resp.status_code == 200 and body["saved"] and body["enriched"] is False
    card = db.store[f"users/ws-1/links/{body['id']}"]
    assert card["summary"] == "A thought worth keeping, no link here."  # kept verbatim
    assert card["needsEmbedding"] is True
    assert refunds == ["saves"]


def test_share_note_enrichment_updates_the_written_card(monkeypatch):
    db = _DB()
    refunds = _stub_share(monkeypatch, db)
    monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(
        analyze_text=lambda *a, **k: {"title": "Heading", "summary": "AI gist",
                                      "tags": ["idea"], "category": "personal"}))
    body = _json(main.share_ingest(_Req({"text": "Long thought\nwith two lines"})))
    card = db.store[f"users/ws-1/links/{body['id']}"]
    assert body["enriched"] is True and refunds == []
    assert card["title"] == "Heading" and card["aiSummary"] == "AI gist"
    assert card["summary"] == "Long thought\nwith two lines"


# ── 2/3/10. the worker ───────────────────────────────────────────────────────

def _drive_worker(monkeypatch, *, queue, card_exists=True, scraped=None, analysis=None):
    """Run process_link_background on `queue`; return (card_ref, queue_ref, refunds, reminders)."""
    refunds, reminders = [], []
    card_ref = MagicMock()
    card_ref.get.return_value = types.SimpleNamespace(
        exists=card_exists, to_dict=lambda: {"status": "processing"})
    user_doc = MagicMock()
    user_doc.collection.return_value.document.return_value = card_ref
    db = MagicMock()
    db.collection.return_value.document.return_value = user_doc
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "log_to_firestore", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_user_vocabulary", lambda uid: ([], []))
    monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(embed_text=lambda t: None))
    monkeypatch.setattr(main, "_analyze_scraped", lambda ai, s, tags, **kw: analysis or {
        "title": "T", "summary": "S", "concepts": [], "tags": [], "category": "Tech"})
    monkeypatch.setattr(main, "GraphService", lambda db: types.SimpleNamespace(
        find_related_links=lambda **k: []))
    monkeypatch.setattr(main, "_apply_post_thumbnail", lambda *a, **k: None)
    monkeypatch.setattr(main, "refund_quota", lambda uid, kind, amount=1: refunds.append(kind))
    monkeypatch.setattr(main, "_apply_reminder_intent", lambda uid, lid, body: reminders.append(body))
    monkeypatch.setattr(scraper, "scrape_url", lambda url, body=None: dict(scraped or {
        "html": "", "title": "Scraped", "text": "body text " * 20}))
    snap = MagicMock()
    snap.to_dict.return_value = queue
    snap.reference.get.return_value = types.SimpleNamespace(exists=True, to_dict=lambda: dict(queue))
    snap.id = "task-1"
    main.process_link_background.__wrapped__(types.SimpleNamespace(data=snap))
    return card_ref, snap.reference, refunds, reminders


def test_fetch_failure_writes_a_failed_card_with_the_reason_and_refunds(monkeypatch):
    card_ref, qref, refunds, _ = _drive_worker(
        monkeypatch,
        queue={"uid": "u1", "url": "https://example.com/gone", "cardId": "c1", "body": "",
               "charge": {"kind": "saves"}},
        scraped=scraper._fetch_failure("not_found"))
    written = card_ref.set.call_args[0][0]
    assert written["status"] == "failed"
    assert written["error"] == scraper.FETCH_ERROR_MESSAGES["not_found"]
    assert written["urlKey"] == "https://example.com/gone"
    assert refunds == ["saves"]
    qref.delete.assert_called_once()


def test_failed_import_refunds_the_import_unit(monkeypatch):
    _, _, refunds, _ = _drive_worker(
        monkeypatch,
        queue={"uid": "u1", "url": "https://example.com/gone", "cardId": "c1", "source": "import",
               "charge": {"kind": "imports"}},
        scraped=scraper._fetch_failure("timeout"))
    assert refunds == ["imports"]


def test_card_deleted_while_queued_drops_the_job(monkeypatch):
    card_ref, qref, _, _ = _drive_worker(
        monkeypatch, card_exists=False,
        queue={"uid": "u1", "url": "https://example.com/a", "cardId": "c1"})
    card_ref.set.assert_not_called()
    qref.delete.assert_called_once()


def test_success_never_resurrects_a_card_deleted_mid_processing(monkeypatch):
    # Stub every dependency once, then re-run against a card that exists when
    # the job starts and is gone by the final write.
    _drive_worker(monkeypatch, queue={"uid": "u1", "url": "https://example.com/a", "cardId": "c1"})
    states = iter([True, False])
    card_ref = MagicMock()
    card_ref.get.side_effect = lambda **k: types.SimpleNamespace(exists=next(states), to_dict=dict)
    user_doc = MagicMock()
    user_doc.collection.return_value.document.return_value = card_ref
    db = MagicMock()
    db.collection.return_value.document.return_value = user_doc
    monkeypatch.setattr(main, "get_db", lambda: db)
    snap = MagicMock()
    snap.to_dict.return_value = {"uid": "u1", "url": "https://example.com/a", "cardId": "c1"}
    main.process_link_background.__wrapped__(types.SimpleNamespace(data=snap))
    card_ref.set.assert_not_called()
    snap.reference.delete.assert_called_once()


def test_quote_notes_never_set_reminders(monkeypatch):
    _, _, _, reminders = _drive_worker(
        monkeypatch, queue={"uid": "u1", "url": "https://example.com/a", "cardId": "c1",
                            "body": "see you tomorrow", "noteKind": "quote"})
    assert reminders == []
    _, _, _, reminders = _drive_worker(
        monkeypatch, queue={"uid": "u1", "url": "https://example.com/a", "cardId": "c1",
                            "body": "remind me tomorrow", "reminderText": "remind me tomorrow"})
    assert reminders == ["remind me tomorrow"]


def test_shared_text_becomes_the_cards_note(monkeypatch):
    card_ref, _, _, _ = _drive_worker(
        monkeypatch, queue={"uid": "u1", "url": "https://example.com/a", "cardId": "c1",
                            "body": "Read the pricing section", "userNoteText": "Read the pricing section"})
    written = card_ref.set.call_args[0][0]
    assert written["userNotes"][0]["text"] == "Read the pricing section"
    assert written["urlKey"] == "https://example.com/a"


# ── 3. janitor: queued vs started ────────────────────────────────────────────

def _janitor(monkeypatch, cards):
    updated, refunds = [], []

    class _Doc:
        def __init__(self, i, d):
            self.id, self._d = i, d
            self.reference = types.SimpleNamespace(
                update=lambda f: updated.append(i),
                get=lambda **k: types.SimpleNamespace(exists=True, to_dict=lambda: dict(d)),
                parent=types.SimpleNamespace(parent=types.SimpleNamespace(id="u1")))

        def to_dict(self):
            return dict(self._d)

    class _Q:
        def __init__(self, docs):
            self.docs = docs

        def where(self, **k):
            return self

        def limit(self, n):
            return self

        def stream(self):
            return iter(self.docs)

    class _DBJ:
        def collection_group(self, name):
            return _Q([_Doc(i, d) for i, d in cards.items()])

        def collection(self, name):
            return _Q([])

    monkeypatch.setattr(main, "get_db", lambda: _DBJ())
    monkeypatch.setattr(main, "refund_quota", lambda uid, kind, amount=1: refunds.append(kind))
    main.run_processing_janitor()
    return updated, refunds


def test_janitor_leaves_a_queued_import_alone_and_fails_a_stuck_one(monkeypatch):
    import time
    now = int(time.time() * 1000)
    updated, refunds = _janitor(monkeypatch, {
        "waiting": {"status": "processing", "queuedAt": now - 60 * 60 * 1000, "importedAt": now},
        "ancient": {"status": "processing", "queuedAt": now - 7 * 60 * 60 * 1000, "importedAt": now},
        "started": {"status": "processing", "queuedAt": now - 60 * 60 * 1000,
                    "processingStartedAt": now - 20 * 60 * 1000, "importedAt": now,
                    "charge": {"kind": "imports"}},
        "web": {"status": "processing", "processingStartedAt": now - 20 * 60 * 1000,
                "charge": {"kind": "saves"}},
        "fresh": {"status": "processing", "processingStartedAt": now - 60 * 1000},
        # No charge token: an /api/analyze retry (refunds itself) and an
        # offline placeholder that was never enqueued (never charged).
        "analyze": {"status": "processing", "processingStartedAt": now - 20 * 60 * 1000,
                    "importedAt": now},
        "offline": {"status": "processing", "queuedAt": now - 7 * 60 * 60 * 1000,
                    "pendingEnqueue": True},
    })
    assert sorted(updated) == ["analyze", "ancient", "offline", "started", "web"]
    # Refunded only where a token was on the card, as the kind charged. The
    # never-started "ancient" import's token is still on its queue doc; the
    # queue prune refunds it (test_capture_charge).
    assert sorted(refunds) == ["imports", "saves"]
