"""POST /api/import — bringing a bookmarks export, a Pocket export, or a pasted
list of links into the library.

Two halves: the pure per-link validators (which decide what a bookmarks file's
junk turns into), and the endpoint itself, driven through a fake request with
Firestore, auth, App Check, and the rate limiter stubbed at ``main``'s own
boundaries. What the endpoint is asserted to do is what makes an import safe:
one placeholder card and one queue doc per link on the SAME pipeline the share
sheet uses, duplicates skipped and never charged, the whole batch charged once
to the LIFETIME import allowance (never the monthly saves quota), and a refusal
that carries the upgrade hint the client turns into the paywall.
"""

import json

import main


# ── _import_url ──────────────────────────────────────────────────────────────

def test_import_url_accepts_http_and_https():
    assert main._import_url("https://example.com/a") == "https://example.com/a"
    assert main._import_url("  http://example.com/b  ") == "http://example.com/b"


def test_import_url_rejects_the_junk_a_bookmarks_file_is_full_of():
    for bad in (
        "javascript:void(0)",                 # a bookmarklet
        "place:sort=8&maxResults=10",         # a Firefox smart folder
        "chrome://bookmarks/",                # a browser internal page
        "file:///Users/me/notes.html",        # a local file
        "ftp://example.com/x",
        "data:text/html,<h1>hi</h1>",
        "https://",                           # no host
        "not a url",
        "",
        "   ",
        None,
        42,
    ):
        assert main._import_url(bad) is None, bad


def test_import_url_rejects_an_over_long_url():
    assert main._import_url("https://e.com/" + "x" * main.MAX_URL_LENGTH) is None


# ── _import_added_at ─────────────────────────────────────────────────────────

def test_added_at_accepts_seconds_and_milliseconds():
    # A Netscape ADD_DATE and a Pocket time_added are both seconds.
    assert main._import_added_at(1_600_000_000) == 1_600_000_000_000
    assert main._import_added_at(1_600_000_000_000) == 1_600_000_000_000


def test_added_at_rejects_junk_and_impossible_dates():
    for bad in (None, "2020", True, 0, -5, 1, 99_999_999_999_999):
        assert main._import_added_at(bad) is None


# ── _import_tags ─────────────────────────────────────────────────────────────

def test_import_tags_are_trimmed_deduplicated_and_bounded():
    tags = main._import_tags(["  Reading  ", "Reading", "x" * 100, ""] + [f"t{i}" for i in range(20)])
    assert tags[0] == "Reading"
    assert tags.count("Reading") == 1
    assert all(len(t) <= main.MAX_IMPORT_TAG_LENGTH for t in tags)
    assert len(tags) <= main.MAX_IMPORT_TAGS


def test_import_tags_of_a_non_list_is_empty():
    assert main._import_tags("Reading") == []
    assert main._import_tags(None) == []


# ── the endpoint ─────────────────────────────────────────────────────────────

class FakeRequest:
    def __init__(self, body, method="POST"):
        self.method = method
        self._body = body
        self.headers = {}
        self.remote_addr = "203.0.113.9"

    def get_json(self, silent=False):
        return self._body


class FakeDocRef:
    def __init__(self, sink, col, doc_id):
        self.sink, self.col, self.id = sink, col, doc_id

    def set(self, data):
        self.sink.append((self.col, self.id, dict(data)))

    def collection(self, name):
        return FakeCollection(self.sink, name)


class FakeCollection:
    def __init__(self, sink, name):
        self.sink, self.name = sink, name
        self._n = 0

    def document(self, doc_id=None):
        if doc_id is None:
            self._n += 1
            doc_id = f"{self.name}-{self._n}"
        return FakeDocRef(self.sink, self.name, doc_id)

    def collection(self, name):
        return FakeCollection(self.sink, name)


class FakeDB:
    """Just enough to serve ``db.collection('users').document(uid)
    .collection('links')`` and ``db.collection('pending_processing')``."""

    def __init__(self):
        self.writes = []
        self._cols = {}

    def collection(self, name):
        return self._cols.setdefault(name, FakeCollection(self.writes, name))


def _stub(monkeypatch, db, *, existing=(), plan="free", meter=None):
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "_rate_limited", lambda *a, **k: None)
    monkeypatch.setattr(main, "_require_app_check", lambda *a, **k: True)
    monkeypatch.setattr(main, "_authed_uid", lambda *a, **k: ("ws-1", None))
    monkeypatch.setattr(main, "link_exists_for_url", lambda uid, url: url in existing)
    monkeypatch.setattr(main, "pending_exists_for_url", lambda uid, url: False)
    monkeypatch.setattr(main, "plan_for", lambda uid: plan)
    charges = []

    def _meter(uid, kind, amount=1, plan="free"):
        charges.append((kind, amount))
        if meter is not None:
            return meter(uid, kind, amount, plan)
        return {"ok": True, "remaining": 500 - amount, "used": amount, "limit": 500, "plan": plan}

    monkeypatch.setattr(main, "meter_quota", _meter)
    monkeypatch.setattr(main, "refund_quota", lambda *a, **k: None)
    return charges


def _body(resp):
    return json.loads(resp.get_data(as_text=True))


def _cards(db):
    return [w for w in db.writes if w[0] == "links"]


def _queue(db):
    return [w for w in db.writes if w[0] == "pending_processing"]


def test_import_writes_one_placeholder_card_and_one_queue_doc_per_link(monkeypatch):
    db = FakeDB()
    _stub(monkeypatch, db)
    resp = main.import_links_http(FakeRequest({"links": [
        {"url": "https://example.com/a", "title": "Alpha", "addedAt": 1_600_000_000,
         "tags": ["Reading", "Later"]},
        {"url": "https://example.com/b"},
    ]}))
    assert resp.status_code == 200
    assert _body(resp) == {"success": True, "queued": 2, "duplicates": 0,
                           "invalid": 0, "received": 2}

    cards = _cards(db)
    assert len(cards) == 2
    first = cards[0][2]
    assert first["status"] == "processing"
    assert first["title"] == "Alpha"
    # createdAt is NOW, so an import lands at the top of the feed; the original
    # bookmark date is kept beside it rather than back-dating the card.
    assert first["createdAt"] == first["processingStartedAt"] == first["importedAt"]
    assert first["importedFromAt"] == 1_600_000_000_000
    assert first["importedTags"] == ["Reading", "Later"]
    # A link with no title falls back to the host, like every other capture.
    assert cards[1][2]["title"] == "example.com"
    assert "importedFromAt" not in cards[1][2]

    queue = _queue(db)
    assert len(queue) == 2
    q = queue[0][2]
    assert q["uid"] == "ws-1" and q["status"] == "queued" and q["source"] == "import"
    # The cardId is what makes the shared trigger finalize THIS card in place
    # instead of creating a second one.
    assert q["cardId"] == cards[0][1]
    assert q["importedFromAt"] == 1_600_000_000_000


def test_duplicates_are_skipped_and_never_charged(monkeypatch):
    db = FakeDB()
    charges = _stub(monkeypatch, db, existing={"https://example.com/a"})
    resp = main.import_links_http(FakeRequest({"links": [
        {"url": "https://example.com/a"},          # already in the library
        {"url": "https://example.com/b"},
        {"url": "https://example.com/b"},          # repeated inside the file
        {"url": "javascript:void(0)"},             # junk
    ]}))
    body = _body(resp)
    assert body["queued"] == 1 and body["duplicates"] == 1 and body["invalid"] == 1
    assert len(_cards(db)) == 1
    # One charge, for the one genuinely new link.
    assert charges == [("imports", 1)]


def test_an_import_charges_the_lifetime_import_quota_not_monthly_saves(monkeypatch):
    db = FakeDB()
    charges = _stub(monkeypatch, db)
    main.import_links_http(FakeRequest(
        {"links": [{"url": f"https://example.com/{i}"} for i in range(12)]}))
    # Exactly one batch charge, on the `imports` kind. A new user filling an
    # empty library must not walk into the monthly saves paywall doing it.
    assert charges == [("imports", 12)]


def test_nothing_new_returns_zero_without_charging(monkeypatch):
    db = FakeDB()
    charges = _stub(monkeypatch, db, existing={"https://example.com/a"})
    body = _body(main.import_links_http(FakeRequest({"links": [{"url": "https://example.com/a"}]})))
    assert body == {"success": True, "queued": 0, "duplicates": 1, "invalid": 0, "received": 1}
    assert charges == []
    assert db.writes == []


def test_over_quota_refuses_the_whole_batch_with_the_upgrade_hint(monkeypatch):
    db = FakeDB()
    _stub(monkeypatch, db, meter=lambda uid, kind, amount, plan: {
        "ok": False, "remaining": 5, "used": 495, "limit": 500, "plan": "free"})
    resp = main.import_links_http(FakeRequest(
        {"links": [{"url": f"https://example.com/{i}"} for i in range(20)]}))
    assert resp.status_code == 429
    body = _body(resp)
    assert body["upgrade"] is True and body["kind"] == "imports"
    assert body["used"] == 495 and body["limit"] == 500
    assert "—" not in body["error"]
    # Nothing was written: the batch is all-or-nothing.
    assert db.writes == []


def test_a_pro_workspace_is_told_to_upgrade_to_nothing(monkeypatch):
    db = FakeDB()
    _stub(monkeypatch, db, plan="pro", meter=lambda uid, kind, amount, plan: {
        "ok": False, "remaining": 0, "used": 10000, "limit": 10000, "plan": "pro"})
    body = _body(main.import_links_http(FakeRequest({"links": [{"url": "https://e.com/1"}]})))
    assert body["upgrade"] is False


def test_over_the_per_request_cap_is_rejected(monkeypatch):
    db = FakeDB()
    _stub(monkeypatch, db)
    resp = main.import_links_http(FakeRequest(
        {"links": [{"url": f"https://example.com/{i}"}
                   for i in range(main.MAX_IMPORT_LINKS + 1)]}))
    assert resp.status_code == 400
    assert str(main.MAX_IMPORT_LINKS) in _body(resp)["error"]
    assert db.writes == []


def test_empty_or_malformed_bodies_are_rejected(monkeypatch):
    db = FakeDB()
    _stub(monkeypatch, db)
    assert main.import_links_http(FakeRequest({})).status_code == 400
    assert main.import_links_http(FakeRequest({"links": []})).status_code == 400
    assert main.import_links_http(FakeRequest({"links": "https://e.com"})).status_code == 400


def test_non_post_is_rejected(monkeypatch):
    db = FakeDB()
    _stub(monkeypatch, db)
    assert main.import_links_http(FakeRequest({}, method="GET")).status_code == 405


def test_titles_are_bounded(monkeypatch):
    db = FakeDB()
    _stub(monkeypatch, db)
    main.import_links_http(FakeRequest(
        {"links": [{"url": "https://e.com/1", "title": "t" * 5000}]}))
    assert len(_cards(db)[0][2]["title"]) == main.MAX_IMPORT_TITLE_LENGTH


# ── The janitor must not eat an import that is still waiting its turn ────────
#
# A 200-link import enqueues far more work than process_link_background's
# max_instances can run at once, so its tail legitimately sits in the queue for
# longer than a card is allowed to sit in `processing`. The two clocks are
# therefore separate: a card's 15 minutes are measured from when work actually
# STARTED, and a queue doc that has never started gets a much longer rope.

class _JanitorDoc:
    def __init__(self, doc_id, data, deleted):
        self.id = doc_id
        self._data = data
        self._deleted = deleted
        self.reference = self

    def to_dict(self):
        return dict(self._data)

    def delete(self):
        self._deleted.append(self.id)

    def update(self, _fields):
        pass


def _run_janitor(monkeypatch, jobs):
    """Run the janitor with no stuck cards and `jobs` in the queue; return the
    ids it deleted, the run time, and its report."""
    from datetime import datetime, timezone
    deleted = []
    now = datetime.now(timezone.utc)

    class _Query:
        def __init__(self, docs):
            self.docs = docs

        def where(self, **_kw):
            return self

        def limit(self, _n):
            return self

        def stream(self):
            return iter(self.docs)

    class _DB:
        def collection_group(self, _name):
            return _Query([])

        def collection(self, name):
            # The janitor also prunes task_logs and server_errors; only the
            # queue matters here, so the others get an empty result.
            if name != "pending_processing":
                return _Query([])
            return _Query([_JanitorDoc(j["id"], j, deleted) for j in jobs])

    monkeypatch.setattr(main, "get_db", lambda: _DB())
    report = main.run_processing_janitor()
    return deleted, now, report


def _ago(minutes):
    from datetime import datetime, timezone, timedelta
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


def test_a_queued_import_job_is_not_pruned_while_it_waits(monkeypatch):
    deleted, _now, report = _run_janitor(monkeypatch, [
        {"id": "waiting", "status": "queued", "createdAt": _ago(40), "source": "import"},
    ])
    assert deleted == []
    assert report["queue_pruned"] == 0


def test_a_job_that_started_and_died_is_still_pruned(monkeypatch):
    deleted, _now, _report = _run_janitor(monkeypatch, [
        {"id": "dead", "status": "analyzing", "createdAt": _ago(40), "source": "share"},
    ])
    assert deleted == ["dead"]


def test_a_queued_job_is_pruned_once_it_is_truly_abandoned(monkeypatch):
    deleted, _now, _report = _run_janitor(monkeypatch, [
        {"id": "abandoned", "status": "queued", "createdAt": _ago(5 * 60), "source": "import"},
    ])
    assert deleted == ["abandoned"]
