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
