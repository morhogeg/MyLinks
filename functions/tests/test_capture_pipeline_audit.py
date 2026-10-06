"""Capture-pipeline launch-audit fixes (worker, janitor, share_ingest, enrich).

Drives the real worker (process_link_background), janitor and share_ingest
against the stateful in-memory Firestore from test_capture_charge, so a charge
token really moves job -> card and a job doc really disappears when the janitor
prunes it. Each test names the audit item it pins.
"""

import ast
import types
from datetime import timedelta
from pathlib import Path

import pytest

import main
import tests.test_capture_charge as tcc
from tests.test_capture_charge import FakeDB, _Ref, _iso

# The shared stateful-Firestore harness (a fixture), bound by assignment so
# the tests' `env` parameters don't read as redefinitions of an import.
env = tcc.env

FUNCTIONS = Path(__file__).resolve().parent.parent
REAL_LOG = main.log_to_firestore


def _add(self, data):
    ref = self.document()
    ref.set(data)
    return ref


# ── ACCT-8d: every task_logs row the worker writes names its workspace ───────

def test_log_to_firestore_stores_the_uid_where_account_deletion_looks(monkeypatch):
    db = FakeDB({})
    monkeypatch.setattr(tcc._Coll, "add", _add, raising=False)
    monkeypatch.setattr(main, "get_db", lambda: db)
    REAL_LOG("t1", "Scraping content for: https://example.com/a", data={"x": 1}, uid="u1")
    (row,) = [v for k, v in db.docs.items() if k.startswith("task_logs/")]
    assert row["data"] == {"x": 1, "uid": "u1"}


def test_every_worker_log_call_passes_the_uid():
    tree = ast.parse((FUNCTIONS / "main.py").read_text(encoding="utf-8"))
    calls = [n for n in ast.walk(tree)
             if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "log_to_firestore"]
    assert calls, "the worker logs its steps"
    missing = [n.lineno for n in calls if not any(k.arg == "uid" for k in n.keywords)]
    assert not missing, f"log_to_firestore calls without uid= at main.py lines {missing}"


def test_a_worker_run_writes_no_task_log_without_the_uid(env, monkeypatch):
    db = env.make({"users/u1/links/c1": {"status": "processing", "processingStartedAt": tcc.NOW_MS},
                   tcc.JOB: tcc._job(charge={"kind": "saves"})})
    monkeypatch.setattr(tcc._Coll, "add", _add, raising=False)
    monkeypatch.setattr(main, "log_to_firestore", REAL_LOG)
    env.run_worker()
    rows = [v for k, v in db.docs.items() if k.startswith("task_logs/")]
    assert rows and all(r["data"].get("uid") == "u1" for r in rows)


# ── CAP-1: the queue prune never deletes a job a worker is running ───────────

def test_prune_keeps_a_started_job_that_waited_long_for_a_worker(env):
    db = env.make({"pending_processing/run": tcc._job(cardId="cx", status="analyzing",
                                                      createdAt=_iso(40), startedAt=_iso(1))})
    report = env.janitor()
    assert "pending_processing/run" in db.docs and report["queue_pruned"] == 0


def test_prune_still_removes_a_started_job_that_died(env):
    db = env.make({
        "pending_processing/dead": tcc._job(cardId="cx", status="analyzing",
                                            createdAt=_iso(60), startedAt=_iso(20)),
        # No start stamp at all: aged by createdAt, as before.
        "pending_processing/old": tcc._job(cardId="cy", status="scraping", createdAt=_iso(40)),
    })
    env.janitor()
    assert "pending_processing/dead" not in db.docs and "pending_processing/old" not in db.docs


def test_a_janitor_tick_mid_run_no_longer_fails_a_long_queued_import(env, monkeypatch):
    """The auditor's interleaving: a bulk-import job queued 20 minutes ago is
    picked up now, and the 5-minute janitor tick lands while it scrapes."""
    old = tcc.NOW_MS - 20 * 60 * 1000
    db = env.make({
        "users/u1/links/c1": {"status": "processing", "url": "https://example.com/a",
                              "queuedAt": old, "createdAt": old, "importedAt": old},
        tcc.JOB: tcc._job(source="import", createdAt=_iso(20), charge={"kind": "imports"}),
    })
    ticks = []

    def scrape_during_a_tick(url, body=None):
        ticks.append(env.janitor())
        return {"html": "", "title": "Scraped", "text": "body text " * 20}
    monkeypatch.setattr(tcc.scraper, "scrape_url", scrape_during_a_tick)
    env.run_worker()
    assert ticks and ticks[0]["queue_pruned"] == 0
    card = db.docs["users/u1/links/c1"]
    assert card["status"] == "unread" and "error" not in card
    assert env.refunds == []
    assert tcc.JOB not in db.docs  # the worker cleaned it up itself


def test_a_job_doc_removed_mid_run_does_not_fail_the_capture(env, monkeypatch):
    db = env.make({"users/u1/links/c1": {"status": "processing", "processingStartedAt": tcc.NOW_MS},
                   tcc.JOB: tcc._job(charge={"kind": "saves"})})

    def scrape_then_lose_the_job(url, body=None):
        db.docs.pop(tcc.JOB, None)  # an operator cleared the queue, say
        return {"html": "", "title": "Scraped", "text": "body text " * 20}
    monkeypatch.setattr(tcc.scraper, "scrape_url", scrape_then_lose_the_job)
    env.run_worker()
    assert db.docs["users/u1/links/c1"]["status"] == "unread"
    assert env.refunds == []


# ── CAP-3: one run per job (triggers are delivered at least once) ────────────

def _count_analyses(monkeypatch):
    calls = []

    def analyze(ai, scraped, tags, **kw):
        calls.append(1)
        return {"title": "Read", "summary": "S", "concepts": [], "tags": ["ai"], "category": "Tech"}
    monkeypatch.setattr(main, "_analyze_scraped", analyze)
    return calls


def _deliver(db, path, data):
    ref = _Ref(db, path)
    snap = types.SimpleNamespace(to_dict=lambda: dict(data), reference=ref, id=ref.id)
    main.process_link_background.__wrapped__(types.SimpleNamespace(data=snap))


def _cards(db):
    return {k: v for k, v in db.docs.items() if k.startswith("users/u1/links/")}


def test_a_share_job_delivered_twice_makes_one_card_and_one_analysis(env, monkeypatch):
    db = env.make({tcc.JOB: tcc._job(cardId=None, source="share", charge={"kind": "saves"})})
    db.docs[tcc.JOB].pop("cardId")
    event = dict(db.docs[tcc.JOB])  # the trigger's payload: the doc as created
    calls = _count_analyses(monkeypatch)
    _deliver(db, tcc.JOB, event)
    _deliver(db, tcc.JOB, event)
    cards = _cards(db)
    assert len(cards) == 1 and next(iter(cards.values()))["status"] == "unread"
    assert len(calls) == 1 and env.refunds == []


def test_overlapping_deliveries_run_the_job_once(env, monkeypatch):
    db = env.make({tcc.JOB: tcc._job(cardId=None, source="share", charge={"kind": "saves"})})
    db.docs[tcc.JOB].pop("cardId")
    event = dict(db.docs[tcc.JOB])
    calls = _count_analyses(monkeypatch)
    nested = []

    def scrape_while_a_duplicate_arrives(url, body=None):
        if not nested:
            nested.append(1)
            _deliver(db, tcc.JOB, event)  # the second delivery, mid-run
        return {"html": "", "title": "Scraped", "text": "body text " * 20}
    monkeypatch.setattr(tcc.scraper, "scrape_url", scrape_while_a_duplicate_arrives)
    _deliver(db, tcc.JOB, event)
    assert len(_cards(db)) == 1 and len(calls) == 1


def test_redelivery_after_success_leaves_the_web_card_ready(env, monkeypatch):
    db = env.make({"users/u1/links/c1": {"status": "processing", "processingStartedAt": tcc.NOW_MS,
                                         "url": "https://example.com/a", "createdAt": 111},
                   tcc.JOB: tcc._job(charge={"kind": "saves"})})
    event = dict(db.docs[tcc.JOB])
    calls = _count_analyses(monkeypatch)
    _deliver(db, tcc.JOB, event)
    _deliver(db, tcc.JOB, event)
    card = db.docs["users/u1/links/c1"]
    assert card["status"] == "unread" and card["title"] == "Read" and "error" not in card
    assert len(calls) == 1 and env.refunds == []


@pytest.mark.parametrize("token_on_job", [False, True])
def test_a_late_job_never_overwrites_a_card_the_users_retry_finished(env, token_on_job):
    """The janitor times out a card whose job was slow to start, the user's
    Retry completes it, THEN the original job runs and hits a transient error."""
    old = tcc.NOW_MS - 20 * 60 * 1000
    job = tcc._job(createdAt=_iso(20))
    if token_on_job:
        job["charge"] = {"kind": "saves"}
    db = env.make({"users/u1/links/c1": {"url": "https://example.com/a", "status": "processing",
                                         "createdAt": old, "processingStartedAt": old,
                                         "charge": {"kind": "saves"}},
                   tcc.JOB: job}, scraped=tcc.scraper._fetch_failure("timeout"))
    env.janitor()
    assert db.docs["users/u1/links/c1"]["status"] == "failed"
    # The user's Retry lands first and finishes the card.
    db.docs["users/u1/links/c1"].update({"status": "unread", "title": "Great article",
                                         "summary": "Real summary"})
    db.docs["users/u1/links/c1"].pop("error")
    env.refunds.clear()
    env.run_worker()
    card = db.docs["users/u1/links/c1"]
    assert card["status"] == "unread" and card["title"] == "Great article"
    assert card["summary"] == "Real summary" and "error" not in card
    # The late job did no paid work: a token it still carried is given back.
    assert env.refunds == (["saves"] if token_on_job else [])
    assert tcc.JOB not in db.docs


def test_a_second_job_for_a_card_another_job_is_running_is_refused(env, monkeypatch):
    db = env.make({"users/u1/links/c1": {"status": "processing", "processingStartedAt": tcc.NOW_MS,
                                         "charge": {"kind": "saves"}},
                   tcc.JOB: tcc._job(charge={"kind": "saves"})})
    calls = _count_analyses(monkeypatch)
    env.run_worker()
    assert calls == [] and env.refunds == ["saves"]
    assert db.docs["users/u1/links/c1"]["charge"] == {"kind": "saves"}  # the running job's
    assert tcc.JOB not in db.docs


# Screenshot enrich and released-note jobs get the same claim.

class _Img:
    content = b"\x89PNGfake"
    headers = {"Content-Type": "image/png"}

    def raise_for_status(self):
        return None


def _enrich_world(env, monkeypatch, *, fail=False):
    db = env.make({"users/u1/links/c1": {"status": "unread", "url": "https://facebook.com/p/1",
                                         "sourceType": "web", "title": "Partial", "summary": "teaser",
                                         "captureQuality": "partial", "enrichStatus": "processing"},
                   "pending_processing/e1": {"uid": "u1", "url": "https://s/a.png", "imageUrls": ["https://s/a.png"],
                                             "isImage": True, "enrich": True, "cardId": "c1",
                                             "status": "queued", "createdAt": _iso(),
                                             "charge": {"kind": "saves"}}})
    monkeypatch.setattr(tcc.scraper, "safe_get", lambda url, **k: _Img())
    monkeypatch.setattr(main, "mirror_vector_write", lambda *a, **k: None)
    monkeypatch.setattr(main, "card_payload", lambda fields, db=None: fields)

    def read(*a, **k):
        if fail:
            raise main.AnalysisError("vision down")
        return {"title": "Full post", "summary": "Whole post", "tags": ["x"], "category": "Tech",
                "concepts": []}
    monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(
        embed_text=lambda t: None, analyze_text_with_images=read))
    return db


def test_a_redelivered_enrich_job_never_fails_the_card_it_completed(env, monkeypatch):
    db = _enrich_world(env, monkeypatch)
    event = dict(db.docs["pending_processing/e1"])
    _deliver(db, "pending_processing/e1", event)
    _deliver(db, "pending_processing/e1", event)
    card = db.docs["users/u1/links/c1"]
    assert card["title"] == "Full post" and "enrichStatus" not in card and "enrichError" not in card
    assert env.refunds == []


def test_a_redelivered_failed_enrich_job_refunds_once(env, monkeypatch):
    db = _enrich_world(env, monkeypatch, fail=True)
    event = dict(db.docs["pending_processing/e1"])
    _deliver(db, "pending_processing/e1", event)
    _deliver(db, "pending_processing/e1", event)
    assert env.refunds == ["saves"]
    assert db.docs["users/u1/links/c1"]["enrichStatus"] == "failed"


def test_a_redelivered_note_job_does_not_put_the_organized_note_back(env, monkeypatch):
    db = env.make({"users/u1/links/n1": {"status": "unread", "sourceType": "note", "captureType": "text",
                                         "title": "my words", "summary": "my words about a thing",
                                         "noteEnrichQueuedAt": 1},
                   "pending_processing/n1": {"uid": "u1", "cardId": "n1", "noteEnrich": True,
                                             "source": "deferred", "status": "queued",
                                             "createdAt": _iso(), "charge": {"kind": "saves"}}})
    monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(
        analyze_text=lambda *a, **k: {"title": "Organized", "summary": "S", "tags": ["t"],
                                      "category": "Tech", "concepts": []}))
    event = dict(db.docs["pending_processing/n1"])
    _deliver(db, "pending_processing/n1", event)
    _deliver(db, "pending_processing/n1", event)
    note = db.docs["users/u1/links/n1"]
    assert note["title"] == "Organized" and "noteEnrichPending" not in note
    assert env.refunds == []


# ── CAP-7: nothing after the card write can fail a finished capture ──────────

def _boom(*a, **k):
    raise RuntimeError("sibling is the only copy and its write failed")


def _web_job_world(env):
    return env.make({"users/u1/links/c1": {"status": "processing", "processingStartedAt": tcc.NOW_MS,
                                           "url": "https://example.com/a"},
                     tcc.JOB: tcc._job(charge={"kind": "saves"}, reminderText="remind me tomorrow")})


def test_a_failed_vector_mirror_flags_the_card_instead_of_failing_it(env, monkeypatch):
    db = _web_job_world(env)
    monkeypatch.setattr(main, "mirror_vector_write", _boom)
    env.run_worker()
    card = db.docs["users/u1/links/c1"]
    assert card["status"] == "unread" and card["title"] == "Read" and "error" not in card
    assert card["needsEmbedding"] is True
    assert env.refunds == [] and tcc.JOB not in db.docs


def test_a_failed_bookkeeping_write_keeps_the_card_and_still_sets_the_reminder(env, monkeypatch):
    db = _web_job_world(env)
    db.docs.pop("users/u1")  # the lastSavedLinkId stamp now raises NotFound
    reminders = []
    monkeypatch.setattr(main, "_apply_reminder_intent", lambda uid, lid, body: reminders.append(body))
    env.run_worker()
    assert db.docs["users/u1/links/c1"]["status"] == "unread"
    assert reminders == ["remind me tomorrow"] and env.refunds == []


def test_a_failed_job_cleanup_keeps_the_card(env, monkeypatch):
    db = _web_job_world(env)
    real_delete = _Ref.delete

    def delete(self):
        if self.path == tcc.JOB:
            raise RuntimeError("deadline exceeded")
        return real_delete(self)
    monkeypatch.setattr(_Ref, "delete", delete)
    env.run_worker()
    assert db.docs["users/u1/links/c1"]["status"] == "unread" and env.refunds == []


def test_a_failed_vector_mirror_never_fails_a_completed_screenshot_read(env, monkeypatch):
    db = _enrich_world(env, monkeypatch)
    monkeypatch.setattr(main, "mirror_vector_write", _boom)
    _deliver(db, "pending_processing/e1", dict(db.docs["pending_processing/e1"]))
    card = db.docs["users/u1/links/c1"]
    assert card["title"] == "Full post" and "enrichStatus" not in card
    assert card["needsEmbedding"] is True and env.refunds == []


# ── CAP-8: one stored copy per screenshot, removed with its card ─────────────

BUCKET = "bkt"


class _Blob:
    def __init__(self, bucket, path):
        self.bucket, self.path = bucket, path

    def delete(self):
        if self.bucket.blobs.pop(self.path, None) is None:
            raise LookupError("404 No such object")


class _Bucket:
    name = BUCKET

    def __init__(self):
        self.blobs = {}

    def blob(self, path):
        return _Blob(self, path)


def _storage_url(path):
    from urllib.parse import quote
    return f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/{quote(path, safe='')}?alt=media&token=t"


def _share_stubs(monkeypatch, charges=None):
    monkeypatch.setattr(main, "_rate_limited", lambda *a, **k: None)
    monkeypatch.setattr(main, "_require_app_check", lambda *a, **k: True)
    monkeypatch.setattr(main, "_authed_uid", lambda *a, **k: ("u1", None))
    monkeypatch.setattr(main, "_quota_blocked",
                        lambda uid, kind, *a, **k: charges.append(kind) if charges is not None else None)
    monkeypatch.setattr(main, "link_exists_for_url", lambda uid, url: False)
    monkeypatch.setattr(main, "pending_exists_for_url", lambda uid, url: False)


@pytest.fixture
def storage_world(env, monkeypatch):
    """The env harness plus a fake bucket that every Storage path writes to
    and reads from: share_ingest's store, the worker's download, the card
    cleanup's delete."""
    import firebase_admin.storage as fb_storage
    from urllib.parse import unquote
    bucket = _Bucket()
    stores = []

    def store(path, data, mime):
        stores.append(path)
        bucket.blobs[path] = data
        return _storage_url(path)

    def safe_get(url, **k):
        path = unquote(url.split("/o/")[1].split("?")[0])
        return types.SimpleNamespace(content=bucket.blobs[path], headers={"Content-Type": "image/jpeg"},
                                     raise_for_status=lambda: None)

    def make(docs):
        db = env.make({**docs, "users/u1": {"storageKey": "KEY"}})
        monkeypatch.setattr(main, "_store_image", store)
        monkeypatch.setattr(main, "storage", types.SimpleNamespace(bucket=lambda *a, **k: bucket))
        monkeypatch.setattr(fb_storage, "bucket", lambda *a, **k: bucket, raising=False)
        monkeypatch.setattr(main, "storage_key_for", lambda uid: "KEY")
        monkeypatch.setattr(tcc._Query, "get", lambda self, *a, **k: list(self.stream()), raising=False)
        monkeypatch.setattr(tcc.scraper, "safe_get", safe_get)
        monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(
            embed_text=lambda t: None,
            analyze_image=lambda b, m, **k: {"title": "Shot", "summary": "S", "tags": ["a"],
                                             "category": "Tech", "concepts": []}))
        _share_stubs(monkeypatch)
        return db

    return types.SimpleNamespace(make=make, bucket=bucket, stores=stores, env=env)


def _run_job_of(db, body):
    _deliver(db, f"pending_processing/{body['id']}", dict(db.docs[f"pending_processing/{body['id']}"]))


@pytest.mark.parametrize("shape", ["image", "images"])
def test_a_shared_screenshot_is_stored_once_and_leaves_with_its_card(storage_world, shape, monkeypatch):
    import base64
    import card_cleanup
    from tests.test_capture_edge_cases import _Req, _json
    db = storage_world.make({})
    b64 = base64.b64encode(b"\xff\xd8\xff" + b"x" * 64).decode()
    payload = ({"image": b64, "mimeType": "image/jpeg"} if shape == "image"
               else {"images": [{"data": b64, "mimeType": "image/jpeg"}]})
    body = _json(main.share_ingest(_Req(payload)))
    _run_job_of(db, body)
    assert len(storage_world.stores) == 1  # share_ingest's copy, reused by the worker
    (card_path, card), = _cards(db).items()
    assert card["status"] == "unread" and card["url"] == _storage_url(storage_world.stores[0])

    db.docs.pop(card_path)  # the user deletes the card
    monkeypatch.setattr(card_cleanup, "get_db", main.get_db)  # the same fake db
    report = card_cleanup.cleanup_deleted_card_logic("u1", card_path.rsplit("/", 1)[1], card)
    assert report["deleted_blobs"] == 1 and storage_world.bucket.blobs == {}


def test_a_card_deleted_mid_run_takes_its_stored_screenshot_with_it(storage_world, monkeypatch):
    path = "screenshots/KEY/abc.jpg"
    db = storage_world.make({
        "users/u1/links/c1": {"status": "processing", "processingStartedAt": tcc.NOW_MS, "url": "",
                              "sourceType": "image"},
        tcc.JOB: tcc._job(url=_storage_url(path), isImage=True, imageUrls=[_storage_url(path)],
                          charge={"kind": "saves"})})
    storage_world.bucket.blobs[path] = b"\xff\xd8\xffimg"
    real_vocab = main.get_user_vocabulary

    def delete_card_then_continue(uid):
        db.docs.pop("users/u1/links/c1", None)  # deleted while it was being read
        return real_vocab(uid)
    monkeypatch.setattr(main, "get_user_vocabulary", delete_card_then_continue)
    storage_world.env.run_worker()
    assert "users/u1/links/c1" not in db.docs and storage_world.bucket.blobs == {}


def test_a_placeholder_deleted_while_queued_takes_its_screenshots_with_it(storage_world):
    paths = ["screenshots/KEY/a.jpg", "screenshots/KEY/b.jpg"]
    storage_world.make({tcc.JOB: tcc._job(url=_storage_url(paths[0]), isImage=True,
                                               imageUrls=[_storage_url(p) for p in paths],
                                               charge={"kind": "saves"}),
                             # Another card that shows the second image keeps it.
                             "users/u1/links/other": {"status": "unread", "url": _storage_url(paths[1])}})
    for p in paths:
        storage_world.bucket.blobs[p] = b"img"
    storage_world.env.run_worker()
    assert list(storage_world.bucket.blobs) == [paths[1]]
    assert storage_world.env.refunds == ["saves"]


# ── CAP-13: the card janitor finds dead cards by age ─────────────────────────

@pytest.fixture
def honest_limit(monkeypatch):
    """Make the fake honour .limit(n) the way Firestore does."""
    def limit(self, n):
        q = tcc._Query(self.db, self.match, self.filters)
        q.n = n
        return q
    real_stream = tcc._Query.stream

    def stream(self):
        out = list(real_stream(self))
        n = getattr(self, "n", None)
        return iter(out[:n] if n else out)
    monkeypatch.setattr(tcc._Query, "limit", limit)
    monkeypatch.setattr(tcc._Query, "stream", stream)


def test_a_big_healthy_import_no_longer_hides_a_dead_card(env, honest_limit):
    now = tcc.NOW_MS
    docs = {f"users/a-importer/links/c{i:03d}": {"status": "processing", "queuedAt": now - 60_000,
                                                 "createdAt": now} for i in range(200)}
    docs["users/z-user/links/stuck"] = {"status": "processing", "processingStartedAt": now - 40 * 60_000,
                                        "createdAt": now - 40 * 60_000, "charge": {"kind": "saves"}}
    db = env.make(docs)
    report = env.janitor()
    assert db.docs["users/z-user/links/stuck"]["status"] == "failed"
    assert report["failed_out"] == 1 and env.refunds == ["saves"]
    assert all(db.docs[f"users/a-importer/links/c{i:03d}"]["status"] == "processing" for i in range(200))


def test_the_janitor_falls_back_to_the_status_scan_while_the_index_builds(env, monkeypatch):
    db = env.make({"users/u1/links/stuck": {"status": "processing",
                                            "processingStartedAt": tcc.NOW_MS - 40 * 60_000}})
    real_stream = tcc._Query.stream

    def stream(self):
        if len([f for f in self.filters if f is not None]) > 1:
            raise RuntimeError("400 The query requires an index")
        return real_stream(self)
    monkeypatch.setattr(tcc._Query, "stream", stream)
    report = env.janitor()
    assert db.docs["users/u1/links/stuck"]["status"] == "failed"
    assert any("age query" in e for e in report["errors"])


def test_the_janitor_age_queries_have_collection_group_indexes():
    import json
    indexes = json.loads((FUNCTIONS.parent / "firestore.indexes.json").read_text())["indexes"]
    pairs = {tuple(f["fieldPath"] for f in ix["fields"]) for ix in indexes
             if ix["collectionGroup"] == "links" and ix["queryScope"] == "COLLECTION_GROUP"}
    assert ("status", "processingStartedAt") in pairs and ("status", "queuedAt") in pairs


# ── CAP-14: "Add screenshots" times out, and refunds at most once ────────────

def test_an_enrich_request_queues_a_charged_job_the_card_names(storage_world):
    import base64
    from tests.test_capture_edge_cases import _Req, _json
    db = storage_world.make({"users/u1/links/c1": {"status": "unread", "sourceType": "web",
                                                   "url": "https://facebook.com/p/1"}})
    b64 = base64.b64encode(b"\xff\xd8\xff" + b"x" * 64).decode()
    body = _json(main.share_ingest(_Req({"images": [{"data": b64, "mimeType": "image/jpeg"}],
                                         "enrichCardId": "c1"})))
    job = db.docs[f"pending_processing/{body['id']}"]
    assert job["enrich"] is True and job["charge"] == {"kind": "saves"}
    card = db.docs["users/u1/links/c1"]
    assert card["enrichStatus"] == "processing" and card["enrichJobId"] == body["id"]


OLD_ENRICH = tcc.NOW_MS - 20 * 60 * 1000


def _stuck_enrich(env, *, job=None, job_id="e1", asked=OLD_ENRICH):
    docs = {"users/u1/links/c1": {"status": "unread", "sourceType": "web", "url": "https://facebook.com/p/1",
                                  "title": "Partial", "enrichStatus": "processing",
                                  "enrichStartedAt": asked, **({"enrichJobId": job_id} if job_id else {})}}
    if job is not None:
        docs[f"pending_processing/{job_id}"] = {"uid": "u1", "cardId": "c1", "enrich": True, "isImage": True,
                                                "url": "https://s/a.png", "imageUrls": ["https://s/a.png"],
                                                "charge": {"kind": "saves"}, **job}
    return env.make(docs)


def test_the_janitor_times_out_a_dead_screenshot_read_and_refunds_once(env):
    db = _stuck_enrich(env, job={"status": "analyzing_image", "createdAt": _iso(20), "startedAt": _iso(19)})
    report = env.janitor()
    card = db.docs["users/u1/links/c1"]
    assert card["enrichStatus"] == "failed" and "took too long" in card["enrichError"]
    assert report["enrich_failed_out"] == 1 and env.refunds == ["saves"]
    env.janitor()  # the prune removes the dead job: nothing to refund twice
    assert env.refunds == ["saves"] and "pending_processing/e1" not in db.docs


def test_the_janitor_leaves_a_read_whose_job_still_waits_for_a_worker(env):
    db = _stuck_enrich(env, job={"status": "queued", "createdAt": _iso(20)})
    env.janitor()
    assert db.docs["users/u1/links/c1"]["enrichStatus"] == "processing" and env.refunds == []


def test_the_janitor_leaves_a_fresh_read_alone(env):
    db = _stuck_enrich(env, job={"status": "queued", "createdAt": _iso(1)}, asked=tcc.NOW_MS - 60_000)
    env.janitor()
    assert db.docs["users/u1/links/c1"]["enrichStatus"] == "processing" and env.refunds == []


def test_a_read_from_before_job_ids_is_only_marked(env):
    db = _stuck_enrich(env, job_id=None)
    env.janitor()
    assert db.docs["users/u1/links/c1"]["enrichStatus"] == "failed" and env.refunds == []


def test_the_janitor_refund_and_a_redelivered_job_never_both_happen(env, monkeypatch):
    db = _enrich_world(env, monkeypatch, fail=True)
    db.docs["users/u1/links/c1"].update({"enrichStartedAt": OLD_ENRICH, "enrichJobId": "e1"})
    event = dict(db.docs["pending_processing/e1"])
    # Its worker started 19 minutes ago and was killed: the janitor times
    # the read out and refunds it (and prunes the dead job).
    db.docs["pending_processing/e1"].update({"status": "analyzing_image", "createdAt": _iso(20),
                                             "startedAt": _iso(19)})
    env.janitor()
    assert env.refunds == ["saves"]
    _deliver(db, "pending_processing/e1", event)  # a late redelivery of the trigger
    assert env.refunds == ["saves"]


def test_the_worker_refund_and_the_janitor_never_both_happen(env, monkeypatch):
    db = _enrich_world(env, monkeypatch, fail=True)
    db.docs["users/u1/links/c1"].update({"enrichStartedAt": OLD_ENRICH, "enrichJobId": "e1"})
    _deliver(db, "pending_processing/e1", dict(db.docs["pending_processing/e1"]))
    assert env.refunds == ["saves"]
    env.janitor()
    assert env.refunds == ["saves"]


def test_a_superseded_read_never_marks_the_newer_one_failed(env, monkeypatch):
    db = _enrich_world(env, monkeypatch, fail=True)
    db.docs["users/u1/links/c1"]["enrichJobId"] = "newer"  # the user sent more screenshots since
    _deliver(db, "pending_processing/e1", dict(db.docs["pending_processing/e1"]))
    card = db.docs["users/u1/links/c1"]
    assert card["enrichStatus"] == "processing" and card["enrichJobId"] == "newer"
    assert env.refunds == ["saves"]  # its own unit still comes back


def test_a_screenshot_read_is_clamped_like_any_new_card(env, monkeypatch):
    """CAP-19: the enrich path wrote the model's fields raw."""
    db = _enrich_world(env, monkeypatch)
    huge = {"title": "T" * 5000, "summary": "S", "tags": [f"tag{i}-" + "x" * 500 for i in range(40)],
            "concepts": [f"c{i}" + "y" * 500 for i in range(100)], "category": "Z" * 500,
            "language": "l" * 100, "actionableTakeaway": "a" * 5000}
    monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(
        embed_text=lambda t: None, analyze_text_with_images=lambda *a, **k: dict(huge)))
    _deliver(db, "pending_processing/e1", dict(db.docs["pending_processing/e1"]))
    card = db.docs["users/u1/links/c1"]
    assert 0 < len(card["title"]) <= 300
    assert len(card["tags"]) <= main.MAX_CARD_TAGS and all(len(t) <= main.MAX_TAG_LENGTH for t in card["tags"])
    assert len(card["concepts"]) == main.MAX_CARD_CONCEPTS
    assert all(len(c) <= main.MAX_TAG_LENGTH for c in card["concepts"])
    assert len(card["category"]) <= main.MAX_CATEGORY_LENGTH and len(card["language"]) <= 16
    assert len(card["metadata"]["actionableTakeaway"]) == main.MAX_TAKEAWAY_LENGTH


# ── CAP-15: a trial's video budget is spent on videos only ───────────────────

def test_analyze_link_reads_the_video_budget_only_for_a_video(monkeypatch):
    from tests.test_capture_edge_cases import _Req, _json
    _share_stubs(monkeypatch)
    monkeypatch.setattr(main, "plan_for", lambda uid: "pro")
    monkeypatch.setattr(main, "entitlement_source", lambda uid: "trial")
    spent = []

    def rate_limit(key, limit, window, fail_open=False):
        if key.startswith("video-trial-uid"):
            spent.append(key)
            return len(spent) <= 3
        return True
    monkeypatch.setattr(main, "check_rate_limit", rate_limit)
    monkeypatch.setattr(main, "refund_quota", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_db", lambda: None)
    monkeypatch.setattr(main, "GraphService", lambda d: types.SimpleNamespace(find_related_links=lambda **k: []))
    watched = []

    class AI:
        def analyze_text(self, *a, **k):
            return {"title": "T", "summary": "S", "tags": [], "category": "Tech", "concepts": []}

        def analyze_youtube(self, *a, **k):
            watched.append(1)
            return {"title": "V", "summary": "S", "tags": [], "category": "Tech", "concepts": []}

        def embed_text(self, t):
            return None
    monkeypatch.setattr(main, "GeminiService", AI)

    def scrape(url, body=None):
        if "youtube" in url:
            return {"html": "x", "text": "YOUTUBE VIDEO", "title": "V", "content_type": "youtube",
                    "youtube_metadata": {"video_id": "abcdefghijk", "length_seconds": 600,
                                         "watch_url": "https://www.youtube.com/watch?v=abcdefghijk"}}
        return {"html": "", "title": "A", "text": "article body " * 20}
    monkeypatch.setattr(tcc.scraper, "scrape_url", scrape)
    for u in ["https://a.com/1", "https://b.com/2", "https://c.com/3",
              "https://www.youtube.com/watch?v=abcdefghijk"]:
        assert _json(main.analyze_link(_Req({"url": u})))["success"]
    assert len(spent) == 1 and watched == [1]


# ── CAP-2: Retry and the Image tab go through the durable queue ──────────────

def _share(body):
    from tests.test_capture_edge_cases import _Req
    return main.share_ingest(_Req(body))


def _jobs(db):
    return {k: v for k, v in db.docs.items() if k.startswith("pending_processing/")}


@pytest.mark.parametrize("status", ["failed", "processing"])
def test_url_retry_enqueues_the_failed_card_itself(env, monkeypatch, status):
    """`processing`: the client flipped the card before asking (it does);
    `failed`: that optimistic write never landed."""
    from tests.test_capture_edge_cases import _json
    charges = []
    _share_stubs(monkeypatch, charges)
    db = env.make({"users/u1/links/c1": {"status": status, "url": "https://example.com/a",
                                         "error": "timed out"}})
    resp = _share({"url": "https://example.com/a", "cardId": "c1"})
    body = _json(resp)
    assert resp.status_code == 200 and body["queued"] is True
    (job,) = _jobs(db).values()
    assert job["cardId"] == "c1" and job["url"] == "https://example.com/a"
    assert job["charge"] == {"kind": "saves"} and job["source"] == "web"
    assert charges == ["saves"]


@pytest.mark.parametrize("cards,code", [
    # Another user's card: it simply isn't in the caller's workspace.
    ({"users/u2/links/c1": {"status": "failed", "url": "https://example.com/a"}}, 404),
    # A finished card is not retryable: no second charge, no second read.
    ({"users/u1/links/c1": {"status": "unread", "url": "https://example.com/a"}}, 409),
    ({"users/u1/links/c1": {"status": "waiting", "url": "https://example.com/a"}}, 409),
])
def test_url_retry_refuses_a_card_that_is_not_the_callers_or_not_retryable(env, monkeypatch, cards, code):
    charges = []
    _share_stubs(monkeypatch, charges)
    db = env.make(cards)
    resp = _share({"url": "https://example.com/a", "cardId": "c1"})
    assert resp.status_code == code
    assert charges == [] and _jobs(db) == {}


def test_a_retried_import_keeps_its_folder_tags(env, monkeypatch):
    _share_stubs(monkeypatch)
    db = env.make({"users/u1/links/c1": {"status": "failed", "url": "https://example.com/a", "tags": [],
                                         "importedAt": 1, "importedTags": ["Reading/Longform"],
                                         "collectionIds": ["col1"]}})
    _share({"url": "https://example.com/a", "cardId": "c1"})
    (path, job), = _jobs(db).items()
    _deliver(db, path, job)
    card = db.docs["users/u1/links/c1"]
    assert card["status"] == "unread" and card["tags"] == ["ai", "Reading/Longform"]
    assert card["collectionIds"] == ["col1"] and card["importedTags"] == ["Reading/Longform"]


def test_an_image_capture_for_a_missing_placeholder_stores_nothing(storage_world):
    import base64
    db = storage_world.make({})
    b64 = base64.b64encode(b"\xff\xd8\xff" + b"x" * 64).decode()
    resp = _share({"images": [{"data": b64, "mimeType": "image/jpeg"}], "cardId": "gone"})
    assert resp.status_code == 404
    assert storage_world.stores == [] and _jobs(db) == {}


def test_a_single_image_capture_completes_its_placeholder_in_the_background(storage_world):
    """The web Image tab's new path: placeholder first, then /api/share."""
    import base64
    from tests.test_capture_edge_cases import _json
    db = storage_world.make({"users/u1/links/c1": {"status": "processing", "processingStartedAt": tcc.NOW_MS,
                                                   "url": "", "sourceType": "image", "createdAt": 111}})
    b64 = base64.b64encode(b"\xff\xd8\xff" + b"x" * 64).decode()
    body = _json(_share({"images": [{"data": b64, "mimeType": "image/jpeg"}], "cardId": "c1"}))
    assert body["queued"] is True
    _run_job_of(db, body)
    card = db.docs["users/u1/links/c1"]
    assert card["status"] == "unread" and card["sourceType"] == "image" and card["createdAt"] == 111
    assert card["url"] == _storage_url(storage_world.stores[0]) and len(storage_world.stores) == 1


def test_the_sync_analyze_endpoints_get_a_gigabyte():
    for fn in (main.analyze_link, main.analyze_image):
        endpoint = getattr(fn, "__firebase_endpoint__", None)
        if endpoint is None:
            pytest.skip("firebase-functions SDK not installed (offline fakes)")
        assert endpoint.availableMemoryMb == 1024


def _ts_code(text):
    """TypeScript source with its comments removed (string contents here never
    hold `//` or `/*`, so a plain regex is enough for these scans)."""
    import re
    return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", text, flags=re.S))


def _ts_function(path, name):
    """The code of one top-level `export async function name(...)`."""
    text = (FUNCTIONS.parent / path).read_text(encoding="utf-8")
    start = text.index(f"export async function {name}(")
    nxt = text.find("\nexport ", start + 1)
    return _ts_code(text[start: nxt if nxt != -1 else len(text)])


def test_retry_never_calls_the_sync_analyze_endpoints():
    """A Retry used to POST /api/analyze (cut at 60 s by every caller while
    the function ran on, charged and discarded the result)."""
    retry = _ts_function("web/lib/storage.ts", "retryFailedLink")
    assert "/api/analyze" not in retry
    assert "apiUrl('/api/share')" in retry
    assert "url: link.url" in retry and "cardId: link.id" in retry


def test_the_image_tab_never_calls_the_sync_image_endpoint():
    form = _ts_code((FUNCTIONS.parent / "web/components/AddLinkForm.tsx").read_text(encoding="utf-8"))
    assert "/api/analyze-image" not in form and "createImagePlaceholder(" in form


# ── CAP-6: the waiting-saves backlog is released in slices ───────────────────

import deferred_capture  # noqa: E402
import tests.test_deferred_capture as tdc  # noqa: E402

world = tdc.world  # the deferred-capture harness (a fixture), bound like `env`
DAY_MS = 24 * 60 * 60 * 1000


def _waiting(uid, n, base):
    return {f"users/{uid}/links/w{i:03d}": {"status": "waiting", "waitingAt": base + i, "createdAt": base + i,
                                            "url": f"https://e.com/{uid}/{i}", "sourceType": "web"}
            for i in range(n)}


def test_the_daily_release_queues_one_slice_and_the_janitor_tick_the_rest(world, monkeypatch):
    base = tcc.NOW_MS - 20 * DAY_MS
    world.make({**_waiting("u1", 70, base), "users/u2": {}, **_waiting("u2", 50, base + 1000)},
               limit=1000, used=0, plan="pro")
    report = deferred_capture.run_waiting_release(plan_for=lambda uid: "pro", now=tdc.FIRST)
    jobs = list(world.jobs().values())
    assert len(jobs) == 50 and all(j["cardId"].startswith("w") for j in jobs)
    assert report["planned"] == 120 and report["slices"] == 3 and report["released"] == 50
    assert report["still_waiting"] == 70
    # The oldest backlog goes first: all 50 are u1's oldest cards.
    assert {j["uid"] for j in jobs} == {"u1"}

    # The 5-minute janitor tick releases one more slice each time.
    monkeypatch.setattr(main, "run_category_migration", lambda: None)
    main.sweep_stuck_processing.__wrapped__(None)
    assert len(world.jobs()) == 100
    main.sweep_stuck_processing.__wrapped__(None)
    assert len(world.jobs()) == 120 and world.quota.used == 120
    assert deferred_capture.release_next_slice()["slice"] is None  # plan done


def test_a_planned_card_the_allowance_no_longer_fits_keeps_waiting(world):
    world.make(_waiting("u1", 60, tcc.NOW_MS - 20 * DAY_MS), limit=1000, used=0, plan="pro")
    deferred_capture.run_waiting_release(plan_for=lambda uid: "pro", now=tdc.FIRST)
    world.quota.used = world.quota.limit  # fresh saves used up the month meanwhile
    report = deferred_capture.release_next_slice()
    assert report["released"] == 0 and report["kept"] == 10
    waiting = [c for c in world.cards().values() if c["status"] == "waiting"]
    assert len(waiting) == 10 and world.quota.refunds == 0


def test_a_planned_card_deleted_before_its_slice_costs_nothing(world):
    db = world.make(_waiting("u1", 51, tcc.NOW_MS - 20 * DAY_MS), limit=1000, used=0, plan="pro")
    deferred_capture.run_waiting_release(plan_for=lambda uid: "pro", now=tdc.FIRST)
    db.docs.pop("users/u1/links/w050")  # the user deleted it
    used = world.quota.used
    report = deferred_capture.release_next_slice()
    assert report == {"released": 0, "gone": 1, "kept": 0, "slice": report["slice"]}
    assert world.quota.used == used and world.quota.refunds == 0


def test_a_new_daily_plan_replaces_an_unfinished_one(world):
    db = world.make(_waiting("u1", 60, tcc.NOW_MS - 20 * DAY_MS), limit=1000, used=0, plan="pro")
    deferred_capture.run_waiting_release(plan_for=lambda uid: "pro", now=tdc.FIRST)
    deferred_capture.run_waiting_release(plan_for=lambda uid: "pro", now=tdc.FIRST + timedelta(days=1))
    slices = [k for k in db.docs if k.startswith(deferred_capture.SLICE_COLLECTION + "/")]
    assert slices == []  # the second run planned (and released) only the 10 still waiting
    assert len(world.jobs()) == 60 and world.quota.used == 60


def test_the_enrich_sweep_has_a_collection_group_index():
    import json
    overrides = json.loads((FUNCTIONS.parent / "firestore.indexes.json").read_text())["fieldOverrides"]
    entry = next(o for o in overrides if o["collectionGroup"] == "links" and o["fieldPath"] == "enrichStatus")
    assert {"order": "ASCENDING", "queryScope": "COLLECTION_GROUP"} in entry["indexes"]
