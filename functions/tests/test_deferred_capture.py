"""Saves past the monthly allowance are kept as `waiting` cards and analyzed
later (deferred_capture.py, SOURCE_OF_TRUTH §4 26a / E2).

Drives the real share_ingest, analyze_image, worker, janitor, upgrade hook
and daily sweep against the stateful in-memory Firestore from
test_capture_charge, with the quota counter faked so "the allowance" is a
number the test controls.
"""

import types
from datetime import datetime, timezone

import pytest

import card_cleanup
import deferred_capture
import entitlement
import main
import scraper
from tests.test_capture_charge import FakeDB, _Ref, NOW_MS, OLD_MS  # noqa: F401
from tests.test_capture_edge_cases import _Req, _json

DAY_MS = 24 * 60 * 60 * 1000


class Quota:
    """A per-test monthly `saves` counter with a settable limit."""

    def __init__(self, limit=100, used=0):
        self.limit, self.used, self.refunds = limit, used, 0

    def meter(self, uid, kind, amount=1, plan="free"):
        if self.used + amount > self.limit:
            return {"ok": False, "remaining": max(0, self.limit - self.used), "used": self.used,
                    "limit": self.limit, "plan": plan}
        self.used += amount
        return {"ok": True, "remaining": self.limit - self.used, "used": self.used,
                "limit": self.limit, "plan": plan}

    def refund(self, uid, kind, amount=1):
        self.used = max(0, self.used - amount)
        self.refunds += 1


@pytest.fixture
def world(monkeypatch):
    state = types.SimpleNamespace(stored=[], reminders=[], quota=Quota())

    def make(docs=None, *, limit=100, used=0, plan="free"):
        db = FakeDB({"users/u1": {"storageKey": "k1"}, **(docs or {})})
        state.db = db
        state.quota = Quota(limit, used)
        for mod in (main, deferred_capture, entitlement, card_cleanup):
            monkeypatch.setattr(mod, "get_db", lambda: db)
        monkeypatch.setattr(main, "meter_quota", state.quota.meter)
        monkeypatch.setattr(main, "refund_quota", state.quota.refund)
        monkeypatch.setattr(deferred_capture, "meter_quota", state.quota.meter)
        monkeypatch.setattr(deferred_capture, "refund_quota", state.quota.refund)
        monkeypatch.setattr(deferred_capture, "quota_usage", lambda uid: {"saves": state.quota.used})
        monkeypatch.setattr(deferred_capture, "quota_limit", lambda kind, plan="free": state.quota.limit)
        monkeypatch.setattr(main, "plan_for", lambda uid: plan)
        monkeypatch.setattr(main, "_rate_limited", lambda *a, **k: None)
        monkeypatch.setattr(main, "_require_app_check", lambda *a, **k: True)
        monkeypatch.setattr(main, "_authed_uid", lambda *a, **k: ("u1", None))
        monkeypatch.setattr(main, "link_exists_for_url", lambda uid, url: False)
        monkeypatch.setattr(main, "pending_exists_for_url", lambda uid, url: False)
        monkeypatch.setattr(main, "storage_key_for", lambda uid: "k1")
        monkeypatch.setattr(main, "log_to_firestore", lambda *a, **k: None)
        monkeypatch.setattr(main, "_apply_reminder_intent",
                            lambda uid, link_id, body: state.reminders.append((link_id, body)))

        def _store(path, data, mime):
            state.stored.append(path)
            return f"https://firebasestorage.googleapis.com/v0/b/bkt/o/{path.replace('/', '%2F')}"
        monkeypatch.setattr(main, "_store_image", _store)
        # The worker's paid steps, as in test_capture_charge.
        monkeypatch.setattr(main, "get_user_vocabulary", lambda uid: ([], []))
        monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(embed_text=lambda t: None))
        monkeypatch.setattr(main, "GraphService", lambda db: types.SimpleNamespace(
            find_related_links=lambda **k: []))
        monkeypatch.setattr(main, "_apply_post_thumbnail", lambda *a, **k: None)
        monkeypatch.setattr(main, "_analyze_scraped", lambda ai, s, tags, **kw: {
            "title": "Analyzed", "summary": "S", "concepts": [], "tags": ["ai"], "category": "Tech"})
        monkeypatch.setattr(scraper, "scrape_url", lambda url, body=None: {
            "html": "<p>x</p>", "title": "The Post", "text": "the post body " * 20,
            "source_url": url, "final_url": url})
        return db

    def jobs():
        return {k: v for k, v in state.db.docs.items() if k.startswith("pending_processing/")}

    def cards():
        return {k: v for k, v in state.db.docs.items() if k.startswith("users/u1/links/")}

    def run_job(path):
        data = state.db.docs[path]
        ref = _Ref(state.db, path)
        snap = types.SimpleNamespace(to_dict=lambda: dict(data), reference=ref, id=ref.id)
        main.process_link_background.__wrapped__(types.SimpleNamespace(data=snap))

    state.make, state.jobs, state.cards, state.run_job = make, jobs, cards, run_job
    return state


# ── Quota hit → waiting, not failed ──────────────────────────────────────────

def test_web_save_at_the_limit_keeps_the_card_waiting_not_failed(world):
    db = world.make({"users/u1/links/c1": {"status": "processing", "processingStartedAt": NOW_MS,
                                           "url": "https://x.com/a/status/1", "title": "x.com"}},
                    limit=100, used=100)
    resp = main.share_ingest(_Req({"url": "https://x.com/a/status/1", "cardId": "c1",
                                   "note": "remind me tomorrow"}))
    assert resp.status_code == 200
    body = _json(resp)
    assert body["success"] and body["waiting"] and body["upgrade"] is True
    assert body["id"] == "c1" and body["kind"] == "saves"
    assert body["message"] == "Saved. Machina will read it next month, or now with Pro."
    card = db.docs["users/u1/links/c1"]
    assert card["status"] == "waiting" and "error" not in card
    assert "processingStartedAt" not in card and isinstance(card["waitingAt"], int)
    assert world.quota.used == 100  # nothing charged
    # The reminder is set from the moment of saving, not weeks later.
    assert world.reminders == [("c1", "remind me tomorrow")]
    # One scrape-only job (no charge token: scraping costs no quota).
    (job,) = world.jobs().values()
    assert job["snapshotOnly"] is True and job["cardId"] == "c1" and "charge" not in job
    # The share's own fields are kept beside the card for the release job.
    assert db.docs["users/u1/capture_snapshots/c1"]["job"]["source"] == "web"


def test_share_sheet_save_at_the_limit_creates_a_waiting_card(world):
    db = world.make(limit=100, used=100)
    body = _json(main.share_ingest(_Req({"text": "Worth reading https://example.com/post"})))
    assert body["success"] and body["waiting"] and not body.get("duplicate")
    card = db.docs[f"users/u1/links/{body['id']}"]
    assert card["status"] == "waiting" and card["url"] == "https://example.com/post"
    assert card["urlKey"] and card["title"] == "example.com"
    assert db.docs[f"users/u1/capture_snapshots/{body['id']}"]["job"]["userNoteText"] == "Worth reading"


def test_pro_abuse_ceiling_defers_too_without_an_upgrade_offer(world):
    world.make(limit=1000, used=1000, plan="pro")
    body = _json(main.share_ingest(_Req({"url": "https://example.com/p"})))
    assert body["waiting"] and body["upgrade"] is False
    assert body["message"] == "Saved. Machina will read it next month."


def test_under_the_limit_nothing_changes(world):
    world.make(limit=100, used=5)
    body = _json(main.share_ingest(_Req({"url": "https://example.com/p"})))
    assert body["queued"] and not body.get("waiting")
    (job,) = world.jobs().values()
    assert job["charge"] == {"kind": "saves"} and not job.get("snapshotOnly")
    assert world.quota.used == 6


def test_shared_image_at_the_limit_is_stored_and_waits(world):
    import base64
    db = world.make(limit=100, used=100)
    img = base64.b64encode(b"\x89PNG fake image bytes").decode()
    body = _json(main.share_ingest(_Req({"image": img, "mimeType": "image/png"})))
    assert body["waiting"] and body["image"]
    card = db.docs[f"users/u1/links/{body['id']}"]
    assert card["status"] == "waiting" and card["sourceType"] == "image"
    assert card["url"].startswith("https://firebasestorage.googleapis.com/")
    assert world.stored and world.jobs() == {}  # an image needs no scrape job
    assert world.quota.used == 100


def test_web_screenshots_at_the_limit_fill_the_placeholder_and_wait(world):
    import base64
    db = world.make({"users/u1/links/c9": {"status": "processing", "url": "", "sourceType": "image",
                                           "title": "Reading 2 screenshots…"}},
                    limit=100, used=100)
    img = base64.b64encode(b"jpegbytes").decode()
    body = _json(main.share_ingest(_Req({"images": [{"data": img, "mimeType": "image/jpeg"}] * 2,
                                         "cardId": "c9"})))
    assert body["waiting"] and body["count"] == 2
    card = db.docs["users/u1/links/c9"]
    assert card["status"] == "waiting" and len(card["imageUrls"]) == 2
    assert card["title"] == "2 screenshots"


def test_single_image_tab_at_the_limit_returns_a_waiting_card(world):
    import base64
    db = world.make(limit=100, used=100)
    resp = main.analyze_image(_Req({"imageBytes": base64.b64encode(b"img").decode(),
                                    "mimeType": "image/jpeg"}))
    body = _json(resp)
    assert resp.status_code == 200 and body["waiting"] and "link" not in body
    assert db.docs[f"users/u1/links/{body['id']}"]["status"] == "waiting"


def test_shared_note_at_the_limit_is_saved_verbatim_and_marked_pending(world, monkeypatch):
    db = world.make(limit=100, used=100)
    monkeypatch.setattr(main, "_enrich_shared_note",
                        lambda *a, **k: pytest.fail("no Gemini call past the allowance"))
    body = _json(main.share_ingest(_Req({"text": "buy oat milk and call Dana"})))
    assert body["saved"] and body["note"] and body["enriched"] is False
    card = db.docs[f"users/u1/links/{body['id']}"]
    # A complete, visible, searchable note: not a waiting card. Only its AI
    # organization waits.
    assert card["status"] == "unread" and card["summary"] == "buy oat milk and call Dana"
    assert card["noteEnrichPending"] is True and isinstance(card["noteEnrichWaitingAt"], int)
    assert world.quota.used == 100


class _FakeAI:
    """GeminiService stand-in for the note-enrichment path."""
    calls = 0

    def __init__(self, fail=False):
        self.fail = fail

    def analyze_text(self, text, **kw):
        _FakeAI.calls += 1
        if self.fail:
            raise main.AnalysisError("model down")
        return {"title": "Groceries and a call", "summary": "S", "tags": ["errands"],
                "category": "Personal", "concepts": ["shopping"], "language": "en",
                "actionableTakeaway": "Call Dana tonight"}

    def embed_text(self, t):
        return None


def _pending_note(card_id, at, **extra):
    return {f"users/u1/links/{card_id}": {
        "url": "", "sourceType": "note", "status": "unread", "title": "buy oat milk",
        "summary": "", "tags": [], "category": "", "createdAt": at,
        "noteEnrichPending": True, "noteEnrichWaitingAt": at, **extra}}


def test_upgrade_organizes_a_pending_shared_note(world, monkeypatch):
    db = world.make(_pending_note("n1", NOW_MS - DAY_MS, captureType="text",
                                  summary="buy oat milk and call Dana"),
                    limit=1000, used=100, plan="pro")
    monkeypatch.setattr(main, "GeminiService", lambda: _FakeAI())
    report = deferred_capture.release_on_entitlement_write("u1", {"plan": "pro", "proUntil": None})
    assert report["released"] == 1 and world.quota.used == 101
    card = db.docs["users/u1/links/n1"]
    # Still a normal card while queued; only the flag moved.
    assert card["status"] == "unread" and "noteEnrichPending" not in card
    (path, job) = next(iter(world.jobs().items()))
    assert job["noteEnrich"] is True and job["charge"] == {"kind": "saves"}
    world.run_job(path)
    card = db.docs["users/u1/links/n1"]
    assert card["title"] == "Groceries and a call" and card["tags"] == ["errands"]
    assert card["summary"] == "buy oat milk and call Dana"  # the user's words, untouched
    assert card["status"] == "unread" and "noteEnrichQueuedAt" not in card
    assert world.jobs() == {} and world.quota.refunds == 0


def test_monthly_release_organizes_a_typed_note_in_age_order(world, monkeypatch):
    base = NOW_MS - 20 * DAY_MS
    db = world.make({
        **_pending_note("n1", base + 1),
        "users/u1/links/w1": {"status": "waiting", "waitingAt": base + 2, "url": "https://e.com/w"},
    }, limit=10, used=4)  # mid-month: reserve 5, so room for exactly 1 more
    monkeypatch.setattr(main, "GeminiService", lambda: _FakeAI())
    report = deferred_capture.run_waiting_release(plan_for=lambda uid: "free", now=MID_MONTH)
    assert report["released"] == 1  # the older one: the note
    assert db.docs["users/u1/links/w1"]["status"] == "waiting"
    (path,) = world.jobs()
    world.run_job(path)
    card = db.docs["users/u1/links/n1"]
    # A short typed note keeps its own words as its title; it gains the rest.
    assert card["title"] == "buy oat milk" and card["category"] == "Personal"
    assert card["tags"] == ["errands"] and card["needsEmbedding"] is True


def test_a_failed_note_enrichment_refunds_its_unit(world, monkeypatch):
    db = world.make(_pending_note("n1", NOW_MS), limit=1000, used=0, plan="pro")
    monkeypatch.setattr(main, "GeminiService", lambda: _FakeAI(fail=True))
    deferred_capture.release_waiting("u1", "pro")
    (path,) = world.jobs()
    world.run_job(path)
    assert world.quota.used == 0 and world.quota.refunds == 1
    assert db.docs["users/u1/links/n1"]["title"] == "buy oat milk"


def test_a_long_typed_note_gets_the_ai_heading_only_while_its_title_is_derived(world, monkeypatch):
    long_text = "Notes from the planning call\nWe agreed on three things."
    db = world.make({
        **_pending_note("n1", NOW_MS, title="Notes from the planning call", summary=long_text),
        **_pending_note("n2", NOW_MS + 1, title="My own title", summary=long_text),
    }, limit=1000, used=0, plan="pro")
    monkeypatch.setattr(main, "GeminiService", lambda: _FakeAI())
    deferred_capture.release_waiting("u1", "pro")
    for path in list(world.jobs()):
        world.run_job(path)
    assert db.docs["users/u1/links/n1"]["title"] == "Groceries and a call"
    assert db.docs["users/u1/links/n2"]["title"] == "My own title"


def test_enrich_screenshots_still_refuse_at_the_limit(world):
    """Repairing an existing card is not a new save: nothing to keep."""
    import base64
    world.make({"users/u1/links/w1": {"status": "unread", "sourceType": "web",
                                      "url": "https://example.com/a"}}, limit=100, used=100)
    resp = main.share_ingest(_Req({"images": [{"data": base64.b64encode(b"x").decode()}],
                                   "enrichCardId": "w1"}))
    assert resp.status_code == 429


def test_a_non_save_429_is_not_mistaken_for_the_save_wall():
    asks = main.https_fn.Response('{"kind": "asks", "upgrade": true}', status=429)
    limited = main.https_fn.Response('{"error": "Too many requests"}', status=429)
    assert main._over_save_allowance(asks) is None
    assert main._over_save_allowance(limited) is None
    assert main._over_save_allowance(None) is None


# ── The snapshot ─────────────────────────────────────────────────────────────

def test_scrape_only_job_snapshots_the_page_and_keeps_the_card_waiting(world, monkeypatch):
    db = world.make(limit=100, used=100)
    monkeypatch.setattr(scraper, "scrape_url", lambda url, body=None: {
        "html": "<huge/>" * 10, "title": "A post about tides", "text": "Tides are " * 50,
        "image_urls": ["https://cdn.example/1.jpg"], "image_primary": True,
        "final_url": "https://www.instagram.com/p/abc/", "source_url": url})
    monkeypatch.setattr(main, "_fetch_post_images", lambda urls: [(b"jpg", "image/jpeg")] if urls else [])
    body = _json(main.share_ingest(_Req({"text": "my take https://instagram.com/p/abc"})))
    (path,) = world.jobs()
    world.run_job(path)

    cid = body["id"]
    card = db.docs[f"users/u1/links/{cid}"]
    assert card["status"] == "waiting"
    assert card["title"] == "A post about tides"
    assert card["sourcePlatform"] == "instagram"
    assert [n["text"] for n in card["userNotes"]] == ["my take"]
    snap = db.docs[f"users/u1/capture_snapshots/{cid}"]
    assert snap["scrape"]["text"].startswith("Tides are")
    assert "html" not in snap["scrape"]
    # The expiring CDN image was copied into our own Storage.
    assert snap["scrape"]["image_urls"][0].startswith("https://firebasestorage.googleapis.com/")
    assert world.stored == [f"post_thumbs/k1/snap-{cid}-0.jpg"]
    assert world.jobs() == {} and world.quota.refunds == 0


def test_a_snapshot_that_lands_after_the_release_is_dropped(world, monkeypatch):
    """Upgrade raced the scrape: the card is already queued (it will be read
    live), so the late snapshot and its copied images are not kept."""
    db = world.make(limit=100, used=100)
    monkeypatch.setattr(main, "_fetch_post_images", lambda urls: [(b"jpg", "image/jpeg")] if urls else [])
    monkeypatch.setattr(scraper, "scrape_url", lambda url, body=None: {
        "title": "T", "text": "body " * 50, "image_urls": ["https://cdn.example/1.jpg"]})
    deleted = []
    monkeypatch.setattr(main, "_owned_blob_deleter", lambda uid: deleted.append)
    body = _json(main.share_ingest(_Req({"url": "https://example.com/race"})))
    (path,) = world.jobs()
    db.docs[f"users/u1/links/{body['id']}"]["status"] = "processing"  # released first
    world.run_job(path)
    assert "scrape" not in db.docs.get(f"users/u1/capture_snapshots/{body['id']}", {})
    assert len(deleted) == 1 and deleted[0].startswith("https://firebasestorage.googleapis.com/")
    assert db.docs[f"users/u1/links/{body['id']}"]["status"] == "processing"


def test_a_pdf_or_a_dead_page_is_not_snapshotted():
    assert deferred_capture.snapshot_from_scrape({"document_bytes": b"%PDF", "title": "x"}) is None
    assert deferred_capture.snapshot_from_scrape(scraper._fetch_failure("not_found")) is None
    snap = deferred_capture.snapshot_from_scrape({"title": "t", "text": "x" * 200_000,
                                                  "youtube_metadata": {"video_id": "v", "x": object()}})
    assert len(snap["text"]) == deferred_capture._MAX_SNAPSHOT_TEXT
    assert snap["youtube_metadata"] == {"video_id": "v"}


# ── The janitor never touches a waiting card ─────────────────────────────────

def test_janitor_ignores_waiting_cards_of_any_age(world):
    ancient = NOW_MS - 40 * DAY_MS
    db = world.make({
        "users/u1/links/w1": {"status": "waiting", "waitingAt": ancient, "createdAt": ancient,
                              "url": "https://example.com/a"},
        # Waiting with a stale processing stamp left over from its placeholder.
        "users/u1/links/w2": {"status": "waiting", "waitingAt": ancient, "processingStartedAt": OLD_MS},
    })
    report = main.run_processing_janitor()
    assert report["failed_out"] == 0
    assert db.docs["users/u1/links/w1"]["status"] == "waiting"
    assert db.docs["users/u1/links/w2"]["status"] == "waiting"
    assert world.quota.refunds == 0


def test_janitor_prunes_a_dead_scrape_only_job_without_refunding(world):
    from tests.test_capture_charge import _iso
    db = world.make({
        "users/u1/links/w1": {"status": "waiting", "waitingAt": NOW_MS},
        "pending_processing/s1": {"uid": "u1", "url": "https://example.com/a", "cardId": "w1",
                                  "snapshotOnly": True, "status": "scraping",
                                  "createdAt": _iso(40)},
    })
    report = main.run_processing_janitor()
    assert report["queue_pruned"] == 1 and world.quota.refunds == 0
    assert db.docs["users/u1/links/w1"]["status"] == "waiting"


# ── Upgrade → every waiting card is enqueued ─────────────────────────────────

def _waiting(n, base=NOW_MS - 10 * DAY_MS):
    return {f"users/u1/links/w{i}": {"status": "waiting", "waitingAt": base + i * 1000,
                                     "createdAt": base + i * 1000,
                                     "url": f"https://example.com/{i}", "sourceType": "web"}
            for i in range(n)}


def test_upgrade_enqueues_every_waiting_card_on_the_queue(world):
    db = world.make({**_waiting(3),
                     "users/u1/links/r1": {"status": "unread", "url": "https://example.com/r"},
                     "users/u1/capture_snapshots/w1": {"job": {"userNoteText": "mine"},
                                                       "scrape": {"title": "T", "text": "x"}}},
                    limit=1000, used=100, plan="pro")
    pro = {"plan": "pro", "source": "revenuecat", "proUntil": NOW_MS + 30 * DAY_MS}
    report = deferred_capture.release_on_entitlement_write("u1", pro)
    assert report == {"released": 3, "waiting": 0, "stopped": None}
    assert world.quota.used == 103  # the backlog counts toward the Pro ceiling
    for i in range(3):
        card = db.docs[f"users/u1/links/w{i}"]
        assert card["status"] == "processing" and isinstance(card["queuedAt"], int)
        assert "waitingAt" not in card and "processingStartedAt" not in card
    assert db.docs["users/u1/links/r1"]["status"] == "unread"
    jobs = sorted(world.jobs().values(), key=lambda j: j["cardId"])
    assert [j["cardId"] for j in jobs] == ["w0", "w1", "w2"]
    for j in jobs:
        assert j["charge"] == {"kind": "saves"} and j["source"] == "deferred"
        assert j["status"] == "queued" and j["reminderText"] == ""
    assert jobs[1]["fromSnapshot"] is True and jobs[1]["userNoteText"] == "mine"
    assert "fromSnapshot" not in jobs[0]


def test_a_free_or_lapsed_entitlement_releases_nothing(world):
    db = world.make(_waiting(2), limit=100, used=100)
    assert deferred_capture.release_on_entitlement_write("u1", {"plan": "free"}) is None
    lapsed = {"plan": "pro", "proUntil": NOW_MS - DAY_MS}
    assert deferred_capture.release_on_entitlement_write("u1", lapsed) is None
    assert all(c["status"] == "waiting" for c in world.cards().values())
    assert world.jobs() == {}


def test_upgrade_trigger_reads_the_doc_and_the_uid(world):
    world.make(_waiting(1), limit=1000, used=0, plan="pro")
    after = types.SimpleNamespace(to_dict=lambda: {"plan": "pro", "proUntil": None})
    event = types.SimpleNamespace(params={"uid": "u1"},
                                  data=types.SimpleNamespace(after=after, before=None))
    main.release_waiting_on_upgrade.__wrapped__(event)
    assert len(world.jobs()) == 1


def test_a_card_released_twice_is_enqueued_once_and_refunded(world):
    db = world.make(_waiting(1), limit=1000, used=0, plan="pro")
    cards = deferred_capture.waiting_cards(db, "u1")
    deferred_capture.release_waiting("u1", "pro")
    # A second release that read the card before the first flipped it.
    report = deferred_capture.release_waiting("u1", "pro", cards=cards)
    assert report["released"] == 0
    assert len(world.jobs()) == 1
    assert world.quota.used == 1 and world.quota.refunds == 1


def test_released_card_is_analyzed_from_its_snapshot_not_the_live_page(world, monkeypatch):
    db = world.make({**_waiting(1),
                     "users/u1/capture_snapshots/w0": {
                         "job": {}, "storedImageUrls": [],
                         "scrape": {"title": "Saved title", "text": "what the post said " * 10}}},
                    limit=1000, used=0, plan="pro")
    deferred_capture.release_waiting("u1", "pro")
    (path,) = world.jobs()
    monkeypatch.setattr(scraper, "scrape_url",
                        lambda *a, **k: pytest.fail("the live page must not be read"))
    seen = {}

    def _analyze(ai, scraped, tags, **kw):
        seen.update(scraped)
        return {"title": "Read later", "summary": "S", "concepts": [], "tags": [], "category": "Tech"}
    monkeypatch.setattr(main, "_analyze_scraped", _analyze)
    world.run_job(path)
    card = db.docs["users/u1/links/w0"]
    assert card["status"] == "unread" and card["title"] == "Read later"
    assert seen["text"].startswith("what the post said")
    assert "charge" not in card and world.quota.refunds == 0
    # Analyzed: the snapshot has done its job.
    assert "users/u1/capture_snapshots/w0" not in db.docs


def test_released_image_card_becomes_an_image_job(world):
    db = world.make({"users/u1/links/i1": {"status": "waiting", "waitingAt": NOW_MS,
                                           "sourceType": "image", "mimeType": "image/png",
                                           "url": "https://firebasestorage.googleapis.com/a",
                                           "imageUrls": ["https://firebasestorage.googleapis.com/a",
                                                         "https://firebasestorage.googleapis.com/b"]}},
                    limit=1000, plan="pro")
    deferred_capture.release_waiting("u1", "pro")
    (job,) = world.jobs().values()
    assert job["isImage"] is True and job["imageUrls"][1].endswith("/b")
    assert job["mimeType"] == "image/png" and job["cardId"] == "i1"


# ── The daily sweep: oldest first, a reserve kept for fresh saves ────────────

MID_MONTH = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)
LAST_DAYS = datetime(2026, 10, 29, 0, 30, tzinfo=timezone.utc)   # Oct has 31 days
FIRST = datetime(2026, 11, 1, 0, 15, tzinfo=timezone.utc)


def _five_out_of_order():
    base = NOW_MS - 20 * DAY_MS
    return {
        # Out of order on purpose: the sweep sorts by when each card was saved.
        "users/u1/links/c": {"status": "waiting", "waitingAt": base + 3, "url": "https://e.com/c"},
        "users/u1/links/a": {"status": "waiting", "waitingAt": base + 1, "url": "https://e.com/a"},
        "users/u1/links/e": {"status": "waiting", "waitingAt": base + 5, "url": "https://e.com/e"},
        "users/u1/links/b": {"status": "waiting", "waitingAt": base + 2, "url": "https://e.com/b"},
        "users/u1/links/d": {"status": "waiting", "waitingAt": base + 4, "url": "https://e.com/d"},
    }


def _statuses(world):
    return {k.rsplit("/", 1)[1]: v["status"] for k, v in world.cards().items()}


def test_on_the_1st_the_backlog_gets_only_the_allowance_above_the_reserve(world):
    world.make(_five_out_of_order(), limit=6, used=0)  # reserve 3 for new saves
    report = deferred_capture.run_waiting_release(plan_for=lambda uid: "free", now=FIRST)
    assert report["released"] == 3 and report["still_waiting"] == 2
    assert _statuses(world) == {"a": "processing", "b": "processing", "c": "processing",
                                "d": "waiting", "e": "waiting"}
    assert world.quota.used == 3  # they count toward the month they are read in


def test_mid_month_the_reserve_holds_even_with_allowance_left(world):
    # 6-save plan, 3 already used by fresh saves: 3 left, but all 3 are the
    # reserve, so the backlog waits.
    world.make(_five_out_of_order(), limit=6, used=3)
    report = deferred_capture.run_waiting_release(plan_for=lambda uid: "free", now=MID_MONTH)
    assert report["released"] == 0 and report["still_waiting"] == 5
    assert world.jobs() == {} and world.quota.used == 3


def test_in_the_last_three_days_the_backlog_may_use_the_reserve(world):
    world.make(_five_out_of_order(), limit=6, used=3)
    report = deferred_capture.run_waiting_release(plan_for=lambda uid: "free", now=LAST_DAYS)
    assert report["released"] == 3
    assert _statuses(world) == {"a": "processing", "b": "processing", "c": "processing",
                                "d": "waiting", "e": "waiting"}
    assert world.quota.used == 6


def test_the_end_of_month_window_is_exactly_the_last_three_utc_days():
    w = deferred_capture.in_end_of_month_window
    assert not w(datetime(2026, 10, 28, 23, 59, tzinfo=timezone.utc))
    assert w(datetime(2026, 10, 29, 0, 0, tzinfo=timezone.utc))
    assert w(datetime(2026, 10, 31, 23, 59, tzinfo=timezone.utc))
    assert not w(datetime(2026, 2, 25, tzinfo=timezone.utc))
    assert w(datetime(2026, 2, 26, tzinfo=timezone.utc))  # 28-day February
    assert deferred_capture.BACKLOG_RESERVE_FRACTION == 0.5
    assert deferred_capture.END_OF_MONTH_DAYS == 3


def test_upgrade_ignores_the_reserve(world):
    world.make(_five_out_of_order(), limit=1000, used=0, plan="pro")
    report = deferred_capture.release_on_entitlement_write("u1", {"plan": "pro", "proUntil": None})
    assert report["released"] == 5


def test_monthly_sweep_is_a_no_op_for_a_workspace_at_its_cap(world):
    db = world.make(_waiting(4), limit=100, used=100)
    report = deferred_capture.run_waiting_release(plan_for=lambda uid: "free", now=LAST_DAYS)
    assert report["released"] == 0 and report["still_waiting"] == 4
    assert world.jobs() == {} and world.quota.used == 100


def test_monthly_sweep_serves_each_workspace_on_its_own_plan(world):
    db = world.make({
        **_waiting(2),
        "users/u2": {},
        "users/u2/links/x": {"status": "waiting", "waitingAt": NOW_MS, "url": "https://e.com/x"},
    }, limit=100, used=0)
    plans = []
    deferred_capture.run_waiting_release(plan_for=lambda uid: plans.append(uid) or "free", now=FIRST)
    assert sorted(plans) == ["u1", "u2"]
    assert len(world.jobs()) == 3


def test_a_waiting_card_with_nothing_to_read_becomes_an_ordinary_card(world):
    db = world.make({"users/u1/links/n1": {"status": "waiting", "waitingAt": NOW_MS,
                                           "sourceType": "note", "url": ""}},
                    limit=100, used=0)
    report = deferred_capture.release_waiting("u1", "free")
    assert report["released"] == 0
    assert db.docs["users/u1/links/n1"]["status"] == "unread"
    assert world.quota.used == 0


# ── Counting, cleanup ────────────────────────────────────────────────────────

def test_entitlement_summary_reports_the_waiting_count(world, monkeypatch):
    world.make({**_waiting(3), **_pending_note("n1", NOW_MS)}, limit=100, used=100)
    monkeypatch.setattr(entitlement, "get_entitlement", lambda uid: {"plan": "free"})
    import quota
    monkeypatch.setattr(quota, "quota_usage", lambda uid: {"saves": 100, "asks": 0, "imports": 0})
    # Three waiting cards plus one note whose AI organization waits.
    assert entitlement.entitlement_summary("u1")["waiting"] == 4


def test_deleting_a_waiting_card_deletes_its_snapshot(world):
    from card_cleanup import cleanup_deleted_card_logic
    db = world.make({"users/u1/capture_snapshots/w1": {"scrape": {"text": "x"},
                                                       "storedImageUrls": []}})
    report = cleanup_deleted_card_logic("u1", "w1", {"status": "waiting", "url": "https://e.com/a"})
    assert report["snapshot_deleted"] is True
    assert "users/u1/capture_snapshots/w1" not in db.docs
