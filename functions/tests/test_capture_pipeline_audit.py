"""Capture-pipeline launch-audit fixes (worker, janitor, share_ingest, enrich).

Drives the real worker (process_link_background), janitor and share_ingest
against the stateful in-memory Firestore from test_capture_charge, so a charge
token really moves job -> card and a job doc really disappears when the janitor
prunes it. Each test names the audit item it pins.
"""

import ast
import types
from pathlib import Path

import pytest

import main
import tests.test_capture_charge as tcc
from tests.test_capture_charge import FakeDB, _Ref, _iso, env  # noqa: F401  (env is a fixture)

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
