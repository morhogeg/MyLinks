"""Code that keeps two promises the privacy policy makes (web/app/privacy):
section 4, a saved page's address reaches Gemini without its query string or
fragment; section 9, diagnostic error records are gone after 14 days."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import main


def test_url_for_prompt_drops_query_and_fragment():
    assert main._url_for_prompt("https://docs.example.com/d/abc/edit?usp=sharing&token=SECRET#heading=h.1") \
        == "https://docs.example.com/d/abc/edit"
    assert main._url_for_prompt("https://example.com/post") == "https://example.com/post"
    for bad in (None, "", "   ", "not a url", "/relative/path", 42):
        assert main._url_for_prompt(bad) == ""


def test_thin_read_prompt_header_carries_no_query_string():
    text = main._prompt_content({
        "text": "",
        "truncated": True,
        "source_url": "https://www.instagram.com/p/XYZ/?igsh=SESSIONTOKEN&utm_source=share",
        "title": "A post",
    })
    assert "SOURCE URL: https://www.instagram.com/p/XYZ/" in text
    assert "SESSIONTOKEN" not in text and "utm_source" not in text


class _Ref:
    def __init__(self, store, path):
        self._store, self.path = store, path

    def delete(self):
        self._store.pop(self.path, None)


class _Snap:
    def __init__(self, store, path):
        self.reference = _Ref(store, path)


class _ErrorsQuery:
    def __init__(self, store, cutoff=None, n=None):
        self._store, self._cutoff, self._n = store, cutoff, n

    def where(self, filter=None, **_kw):
        assert filter.field_path == "createdAt" and filter.op_string == "<="
        return _ErrorsQuery(self._store, filter.value, self._n)

    def limit(self, n):
        return _ErrorsQuery(self._store, self._cutoff, n)

    def stream(self):
        hits = [p for p, d in self._store.items()
                if "/client_errors/" in p and d["createdAt"] <= self._cutoff]
        return [_Snap(self._store, p) for p in hits[: self._n]]


class _JanitorDb:
    """Only the client_errors sweep is exercised; every other janitor query
    sees an empty collection."""

    def __init__(self, store):
        self.store = store

    def collection_group(self, name):
        if name == "client_errors":
            return _ErrorsQuery(self.store)
        return _Empty()

    def collection(self, name):
        return _Empty()

    def batch(self):
        class _B:
            def __init__(self):
                self.refs = []

            def delete(self, ref):
                self.refs.append(ref)

            def commit(self):
                for ref in self.refs:
                    ref.delete()
        return _B()


class _Empty:
    def where(self, *a, **k):
        return self

    def limit(self, n):
        return self

    def order_by(self, *a, **k):
        return self

    def select(self, *a, **k):
        return self

    def stream(self):
        return []

    def get(self):
        return []

    def document(self, *a):
        return self

    def collection(self, *a):
        return self


def test_janitor_prunes_client_errors_older_than_14_days(monkeypatch):
    now = datetime.now(timezone.utc)
    store = {
        "users/a/client_errors/old": {"createdAt": now - timedelta(days=15)},
        "users/b/client_errors/older": {"createdAt": now - timedelta(days=40)},
        "users/a/client_errors/fresh": {"createdAt": now - timedelta(days=2)},
    }
    monkeypatch.setattr(main, "get_db", lambda: _JanitorDb(store))
    report = main.run_processing_janitor()
    assert report["client_errors_pruned"] == 2
    assert list(store) == ["users/a/client_errors/fresh"]


def test_client_errors_created_at_has_a_collection_group_index():
    """A collection-group range query needs a COLLECTION_GROUP index; the
    default single-field one is COLLECTION-scoped (SOURCE_OF_TRUTH §4 4c)."""
    root = Path(__file__).resolve().parents[2]
    overrides = json.loads((root / "firestore.indexes.json").read_text())["fieldOverrides"]
    entry = next(o for o in overrides
                 if o["collectionGroup"] == "client_errors" and o["fieldPath"] == "createdAt")
    assert {"order": "ASCENDING", "queryScope": "COLLECTION_GROUP"} in entry["indexes"]
