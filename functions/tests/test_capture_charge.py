"""At most one refund per charge (capture_charge.py), and the worker's final
write keeps what the user did to the card.

Drives the real worker (process_link_background), janitor and share_ingest
against a small stateful in-memory Firestore, so a charge token really moves
job -> card and really disappears when someone refunds it. The interleavings
are the ones the review found:

  * the janitor times out a card whose job was only slow to START, then the
    worker runs anyway (success: a free save, no refund; failure: one refund);
  * the worker started (token on the card) and was hard-killed; the janitor
    refunds it, and a late failure of the same job refunds nothing more;
  * a card deleted while queued is refunded from the job, once, even if the
    trigger is delivered twice;
  * the queue prune refunds an abandoned job's token, once.
"""

import types
from datetime import datetime, timedelta, timezone

import pytest
from google.cloud import firestore as gcf

import main
import scraper
from tests.test_capture_edge_cases import _Req, _json

DELETE = gcf.DELETE_FIELD


# ── Stateful in-memory Firestore ─────────────────────────────────────────────

def _apply(doc: dict, data: dict) -> dict:
    out = dict(doc)
    for key, value in data.items():
        if "." in key:
            head, tail = key.split(".", 1)
            out[head] = _apply(out.get(head) or {}, {tail: value})
        elif value is DELETE:
            out.pop(key, None)
        else:
            out[key] = value
    return out


class _Snap:
    def __init__(self, ref, data):
        self.reference, self.id = ref, ref.id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return None if self._data is None else dict(self._data)


class _Ref:
    def __init__(self, db, path):
        self.db, self.path = db, path
        self.id = path.rsplit("/", 1)[-1]

    @property
    def parent(self):
        return _Coll(self.db, self.path.rsplit("/", 1)[0])

    def collection(self, name):
        return _Coll(self.db, f"{self.path}/{name}")

    def get(self, transaction=None):
        return _Snap(self, self.db.docs.get(self.path))

    def set(self, data, merge=False):
        base = self.db.docs.get(self.path, {}) if merge else {}
        self.db.docs[self.path] = _apply(base, data)

    def update(self, data):
        if self.path not in self.db.docs:
            raise LookupError(f"404 No document to update: {self.path}")
        self.db.docs[self.path] = _apply(self.db.docs[self.path], data)

    def delete(self):
        self.db.docs.pop(self.path, None)


class _Query:
    def __init__(self, db, match, filters=()):
        self.db, self.match, self.filters = db, match, list(filters)

    def where(self, filter=None, **_):
        return _Query(self.db, self.match, self.filters + [filter])

    def limit(self, _n):
        return self

    def stream(self):
        ops = {"==": lambda a, b: a == b, "<": lambda a, b: a is not None and a < b,
               "<=": lambda a, b: a is not None and a <= b}
        out = []
        for path, data in sorted(self.db.docs.items()):
            if not self.match(path):
                continue
            if all(ops.get(f.op_string, lambda a, b: False)(data.get(f.field_path), f.value)
                   for f in self.filters):
                out.append(_Snap(_Ref(self.db, path), data))
        return iter(out)


class _Coll(_Query):
    def __init__(self, db, path):
        self.path = path
        super().__init__(db, lambda p: p.rsplit("/", 1)[0] == path)
        self.n = 0

    @property
    def parent(self):
        return _Ref(self.db, self.path.rsplit("/", 1)[0]) if "/" in self.path else None

    def document(self, doc_id=None):
        if doc_id is None:
            self.db.auto += 1
            doc_id = f"auto{self.db.auto}"
        return _Ref(self.db, f"{self.path}/{doc_id}")


class FakeDB:
    def __init__(self, docs):
        self.docs = {k: dict(v) for k, v in docs.items()}
        self.auto = 0

    def collection(self, name):
        return _Coll(self, name)

    def collection_group(self, name):
        return _Query(self, lambda p: p.rsplit("/", 2)[-2] == name if p.count("/") >= 2 else False)

    def batch(self):
        db = self

        class _B:
            def __init__(self):
                self.ops = []

            def delete(self, ref):
                self.ops.append(ref.delete)

            def commit(self):
                for op in self.ops:
                    op()
        return _B()


# ── Harness ──────────────────────────────────────────────────────────────────

NOW_MS = int(datetime.now(timezone.utc).timestamp() * 1000)
OLD_MS = NOW_MS - 20 * 60 * 1000
CARD = "users/u1/links/c1"
JOB = "pending_processing/j1"


def _iso(minutes_ago=0):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


@pytest.fixture
def env(monkeypatch):
    refunds = []
    state = {}

    def make(docs, *, scraped=None, analysis=None):
        db = FakeDB({"users/u1": {}, **docs})
        state["db"] = db
        monkeypatch.setattr(main, "get_db", lambda: db)
        monkeypatch.setattr(main, "refund_quota", lambda uid, kind, amount=1: refunds.append(kind))
        monkeypatch.setattr(main, "log_to_firestore", lambda *a, **k: None)
        monkeypatch.setattr(main, "get_user_vocabulary", lambda uid: ([], []))
        monkeypatch.setattr(main, "GeminiService", lambda: types.SimpleNamespace(embed_text=lambda t: None))
        monkeypatch.setattr(main, "GraphService", lambda db: types.SimpleNamespace(
            find_related_links=lambda **k: []))
        monkeypatch.setattr(main, "_apply_post_thumbnail", lambda *a, **k: None)
        monkeypatch.setattr(main, "_apply_reminder_intent", lambda *a, **k: None)
        monkeypatch.setattr(main, "_analyze_scraped", lambda ai, s, tags, **kw: dict(analysis or {
            "title": "Read", "summary": "S", "concepts": [], "tags": ["ai"], "category": "Tech"}))
        set_scrape(scraped)
        return db

    def set_scrape(scraped):
        monkeypatch.setattr(scraper, "scrape_url", lambda url, body=None: dict(scraped or {
            "html": "", "title": "Scraped", "text": "body text " * 20}))

    def run_worker(job_path=JOB):
        db = state["db"]
        data = db.docs.get(job_path)
        assert data is not None, "the trigger only fires for a written job"
        ref = _Ref(db, job_path)
        snap = types.SimpleNamespace(to_dict=lambda: dict(data), reference=ref, id=ref.id)
        main.process_link_background.__wrapped__(types.SimpleNamespace(data=snap))

    return types.SimpleNamespace(make=make, refunds=refunds, run_worker=run_worker,
                                 set_scrape=set_scrape, janitor=main.run_processing_janitor)


def _job(**extra):
    return {"uid": "u1", "url": "https://example.com/a", "cardId": "c1", "source": "web",
            "status": "queued", "createdAt": _iso(), "body": "", **extra}


FAIL = scraper._fetch_failure("not_found")


# ── Janitor vs a job that was only slow to start ─────────────────────────────

def test_janitor_times_out_a_waiting_card_then_the_late_worker_finishes_it_free(env):
    db = env.make({
        CARD: {"status": "processing", "processingStartedAt": OLD_MS, "createdAt": 111},
        JOB: _job(charge={"kind": "saves"}),
    })
    env.janitor()
    assert db.docs[CARD]["status"] == "failed"
    assert env.refunds == []  # the token is still on the job: nobody was refunded

    env.run_worker()
    card = db.docs[CARD]
    assert card["status"] == "unread" and card["title"] == "Read"
    assert "charge" not in card and "error" not in card
    assert card["createdAt"] == 111
    assert env.refunds == []   # the charge bought this card
    assert JOB not in db.docs


def test_janitor_times_out_a_waiting_card_then_the_late_worker_fails_once(env):
    db = env.make({
        CARD: {"status": "processing", "processingStartedAt": OLD_MS, "createdAt": 111},
        JOB: _job(charge={"kind": "saves"}),
    }, scraped=FAIL)
    env.janitor()
    env.run_worker()
    assert db.docs[CARD]["status"] == "failed"
    assert env.refunds == ["saves"]
    env.janitor()  # a failed card is not processing: nothing more
    assert env.refunds == ["saves"]


# ── Janitor vs a job that started and was hard-killed ────────────────────────

def test_hard_killed_job_is_refunded_by_the_janitor_and_never_again(env):
    db = env.make({
        # The worker already moved the token onto the card, then died.
        CARD: {"status": "processing", "processingStartedAt": OLD_MS, "createdAt": 111,
               "charge": {"kind": "saves"}},
        JOB: _job(status="analyzing"),
    }, scraped=FAIL)
    env.janitor()
    assert db.docs[CARD]["status"] == "failed" and "charge" not in db.docs[CARD]
    assert env.refunds == ["saves"]

    # The same job's late failure (e.g. a re-delivered trigger) refunds nothing.
    env.run_worker()
    assert env.refunds == ["saves"]


def test_janitor_refunds_the_kind_that_was_charged(env):
    env.make({
        CARD: {"status": "processing", "processingStartedAt": OLD_MS, "importedAt": 1,
               "charge": {"kind": "imports"}},
        "users/u1/links/c2": {"status": "processing", "processingStartedAt": OLD_MS,
                              "charge": {"kind": "saves"}},
        # An imported card re-run through /api/analyze: no token (that endpoint
        # refunds its own failures), so the janitor refunds nothing for it.
        "users/u1/links/c3": {"status": "processing", "processingStartedAt": OLD_MS, "importedAt": 1},
    })
    env.janitor()
    assert sorted(env.refunds) == ["imports", "saves"]


def test_janitor_never_refunds_an_offline_placeholder_that_was_never_enqueued(env):
    db = env.make({CARD: {"status": "processing", "pendingEnqueue": True,
                          "queuedAt": NOW_MS - 7 * 60 * 60 * 1000}})
    env.janitor()
    assert db.docs[CARD]["status"] == "failed"
    assert env.refunds == []


def test_janitor_leaves_a_card_the_worker_just_finished(env):
    # Queried as processing, finished before the janitor's write: the
    # transactional re-check sees `unread` and backs off.
    db = env.make({CARD: {"status": "unread", "charge": {"kind": "saves"}}})
    failed, kind = main.capture_charge.fail_if_processing(db, _Ref(db, CARD), {"status": "failed"})
    assert (failed, kind) == (False, None)
    assert db.docs[CARD]["status"] == "unread"


# ── Deleted while queued / abandoned in the queue ────────────────────────────

def test_card_deleted_while_queued_is_refunded_once_from_the_job(env):
    db = env.make({JOB: _job(charge={"kind": "saves"})})
    job = dict(db.docs[JOB])
    env.run_worker()
    assert env.refunds == ["saves"] and JOB not in db.docs and CARD not in db.docs
    # A duplicate delivery of the same trigger: the job is gone, no refund.
    db.docs[JOB] = {k: v for k, v in job.items() if k != "charge"}
    env.run_worker()
    assert env.refunds == ["saves"]


def test_queue_prune_refunds_an_abandoned_job_once(env):
    db = env.make({
        "pending_processing/old": _job(cardId="cx", createdAt=_iso(7 * 60), source="import",
                                       charge={"kind": "imports"}),
        # Started and died: its token already moved to its card.
        "pending_processing/dead": _job(cardId="cy", createdAt=_iso(40), status="analyzing"),
    })
    env.janitor()
    assert env.refunds == ["imports"]
    assert "pending_processing/old" not in db.docs and "pending_processing/dead" not in db.docs


def test_share_path_placeholder_takes_the_token(env):
    db = env.make({JOB: _job(cardId=None, source="share", charge={"kind": "saves"})}, scraped=FAIL)
    db.docs[JOB].pop("cardId")
    env.run_worker()
    cards = [v for k, v in db.docs.items() if k.startswith("users/u1/links/")]
    assert len(cards) == 1 and cards[0]["status"] == "failed" and "charge" not in cards[0]
    assert env.refunds == ["saves"]


# ── The worker's write keeps the user's own fields (retry of a card) ─────────

USER_FIELDS = {
    "createdAt": 111, "collectionIds": ["col1"], "tags": ["mine"],
    "userNotes": [{"id": "n1", "text": "my note", "createdAt": 5}],
    "isPrivate": True, "hideThumbnail": True, "shareId": "s" * 32, "sharePublishedAt": 7,
    "reminderStatus": "pending", "nextReminderAt": 9, "reminderCount": 1,
    "importedAt": 3, "importedFromAt": 2, "importedTags": ["Folder"],
}


@pytest.mark.parametrize("outcome", ["ready", "failed"])
def test_retry_keeps_user_owned_fields(env, outcome):
    db = env.make({
        CARD: {"status": "processing", "processingStartedAt": NOW_MS, "error": "old",
               **USER_FIELDS},
        JOB: _job(charge={"kind": "saves"}, userNoteText="Read the pricing part"),
    }, scraped=FAIL if outcome == "failed" else None)
    env.run_worker()
    card = db.docs[CARD]
    for key, value in USER_FIELDS.items():
        if key not in ("tags", "userNotes"):
            assert card[key] == value, key
    assert card["tags"][0] == "mine"
    assert card["userNotes"][0]["text"] == "my note"
    if outcome == "ready":
        assert card["status"] == "unread" and "error" not in card
        assert "ai" in card["tags"]
        assert [n["text"] for n in card["userNotes"]] == ["my note", "Read the pricing part"]
    else:
        assert card["status"] == "failed"


def test_success_never_resurrects_a_card_deleted_mid_processing(env, monkeypatch):
    db = env.make({CARD: {"status": "processing"}, JOB: _job(charge={"kind": "saves"})})
    real = main._analyze_scraped

    def _delete_then_analyze(*a, **k):
        db.docs.pop(CARD, None)
        return real(*a, **k)
    monkeypatch.setattr(main, "_analyze_scraped", _delete_then_analyze)
    env.run_worker()
    assert CARD not in db.docs and JOB not in db.docs


# ── share_ingest: the token is written with the job; offline enqueue ─────────

def _stub_share(monkeypatch, charges):
    monkeypatch.setattr(main, "_rate_limited", lambda *a, **k: None)
    monkeypatch.setattr(main, "_require_app_check", lambda *a, **k: True)
    monkeypatch.setattr(main, "_authed_uid", lambda *a, **k: ("u1", None))
    monkeypatch.setattr(main, "_quota_blocked", lambda uid, kind, *a, **k: charges.append(kind))
    monkeypatch.setattr(main, "link_exists_for_url", lambda uid, url: False)
    monkeypatch.setattr(main, "pending_exists_for_url", lambda uid, url: False)


def test_share_ingest_writes_the_charge_token_with_the_job(env, monkeypatch):
    db = env.make({})
    charges = []
    _stub_share(monkeypatch, charges)
    body = _json(main.share_ingest(_Req({"url": "https://example.com/a"})))
    assert body["queued"] and charges == ["saves"]
    job = db.docs[f"pending_processing/{body['id']}"]
    assert job["charge"] == {"kind": "saves"}


def test_offline_save_is_enqueued_exactly_once(env, monkeypatch):
    db = env.make({CARD: {"status": "processing", "pendingEnqueue": True, "queuedAt": NOW_MS,
                          "url": "https://example.com/a"}})
    charges = []
    _stub_share(monkeypatch, charges)
    req = {"url": "https://example.com/a", "cardId": "c1", "offlineEnqueue": True}
    first = _json(main.share_ingest(_Req(dict(req))))
    second = _json(main.share_ingest(_Req(dict(req))))
    assert first["queued"] and second.get("duplicate") is True
    assert charges == ["saves"]  # the duplicate is never metered
    assert "pendingEnqueue" not in db.docs[CARD]
    assert len([k for k in db.docs if k.startswith("pending_processing/")]) == 1

    missing = main.share_ingest(_Req({**req, "cardId": "gone"}))
    assert missing.status_code == 404 and charges == ["saves"]
