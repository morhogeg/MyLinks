"""A brand-new workspace is born at the current graph version (§4 11b, E5).

`web/lib/rebuildConnections.ts` `ensureGraphVersion` runs on every app open and
recomputes the whole library (the `rebuild_connections` callable, embed then
relate) whenever the user doc's `graphVersion` is below the client's
`GRAPH_VERSION`. `create_workspace` used to leave the field off, so every signup
spent a cold function start "migrating" an empty library. These tests pin the
stamp, keep it off the re-link path (a legacy library may really need the
migration), and fail if the Python and TypeScript constants drift apart.
"""

import re
from pathlib import Path

import pytest

import link_service

REBUILD_TS = Path(__file__).resolve().parent.parent.parent / "web" / "lib" / "rebuildConnections.ts"


def _fake_db(monkeypatch, existing=None):
    """users/{id} store with just enough of the Firestore client for create_workspace."""
    store = {"users": dict(existing or {})}

    class _Snap:
        def __init__(self, d):
            self._d = d
            self.exists = d is not None

        def to_dict(self):
            return self._d

    class _Ref:
        def __init__(self, coll, id):
            self.coll, self.id = coll, id

        def get(self):
            return _Snap(store.setdefault(self.coll, {}).get(self.id))

        def set(self, data, merge=False):
            coll = store.setdefault(self.coll, {})
            if merge:
                coll.setdefault(self.id, {}).update(data)
            else:
                coll[self.id] = dict(data)

    class _Coll:
        def __init__(self, name):
            self.name = name

        def document(self, id):
            return _Ref(self.name, id)

    class _Db:
        def collection(self, name):
            return _Coll(name)

    monkeypatch.setattr(link_service, "get_db", lambda: _Db())
    monkeypatch.setattr(link_service, "ensure_ingest_token", lambda uid: "t" * 32)
    monkeypatch.setattr(link_service, "inherited_created_at", lambda email, now: now)
    return store


def test_new_workspace_is_stamped_with_the_current_graph_version(monkeypatch):
    store = _fake_db(monkeypatch)
    link_service.create_workspace("new-uid", "a@example.com")
    doc = store["users"]["new-uid"]
    assert doc["graphVersion"] == link_service.GRAPH_VERSION
    # The rest of the birth shape is unchanged.
    assert doc["authUids"] == ["new-uid"]
    assert doc["onboarded"] is False


def test_relinking_an_existing_doc_does_not_stamp(monkeypatch):
    """The re-link branch can be a legacy library computed under an older graph:
    stamping it would skip the migration it genuinely needs."""
    store = _fake_db(monkeypatch, existing={"legacy": {"authUids": [], "createdAt": 1}})
    link_service.create_workspace("legacy", "a@example.com")
    assert "graphVersion" not in store["users"]["legacy"]


def test_graph_version_matches_the_web_client():
    if not REBUILD_TS.is_file():
        pytest.skip("web/ not present")
    m = re.search(r"export const GRAPH_VERSION\s*=\s*(\d+)\s*;", REBUILD_TS.read_text())
    assert m, "GRAPH_VERSION not found in web/lib/rebuildConnections.ts"
    assert int(m.group(1)) == link_service.GRAPH_VERSION, (
        "link_service.GRAPH_VERSION and web/lib/rebuildConnections.ts GRAPH_VERSION "
        "must match: a lower server value makes every new workspace run the graph "
        "migration on first open; a higher one would skip a real migration."
    )
