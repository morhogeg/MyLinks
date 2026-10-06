"""See-also connections never touch a private card (GRAPH-PRIV).

`find_related_links` takes the nearest cards to a new save and sends each
candidate's title, summary and concepts to Gemini for verification. Private
cards (their own `isPrivate`, or membership in a private/PIN collection) used
to ride along: their content reached Gemini whenever a card was saved near
them, and a verified one became a relatedLink of an open card, putting the
private title in its Related list. Offline: Firestore and the verifier are
faked; no Gemini call is made.
"""

from types import SimpleNamespace

import pytest

import vector_store
from graph_service import GraphService


class _Doc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)


class _GraphDb:
    """users/{uid}/links answers find_nearest with `links`; users/{uid}/
    collections answers the private-collection query with `private` (or
    raises when `private` is an Exception). Anything else is unreadable, which
    vector_store treats as phase 1 (vectors on the cards)."""

    def __init__(self, links, private):
        self._links, self._private = links, private

    def collection(self, name):
        if name != "users":
            raise RuntimeError("not modelled")
        return SimpleNamespace(document=lambda uid: SimpleNamespace(collection=self._sub))

    def _sub(self, name):
        if name == "collections":
            if isinstance(self._private, Exception):
                raise self._private
            docs = [SimpleNamespace(id=c) for c in self._private]
            return SimpleNamespace(where=lambda filter: SimpleNamespace(stream=lambda: iter(docs)))
        return SimpleNamespace(find_nearest=lambda **kw: SimpleNamespace(get=lambda: list(self._links)))


@pytest.fixture(autouse=True)
def _phase_one_flags():
    vector_store.reset_flag_cache()
    yield
    vector_store.reset_flag_cache()


_NEIGHBOURS = [
    _Doc("pub", {"title": "Sourdough basics", "summary": "Open card", "vector_distance": 0.20}),
    _Doc("flag", {"title": "Fertility diary", "summary": "Private", "isPrivate": True,
                  "vector_distance": 0.21}),
    _Doc("vault", {"title": "Divorce notes", "summary": "In a PIN collection",
                   "collectionIds": ["vault"], "vector_distance": 0.22}),
    _Doc("open", {"title": "Shared folder card", "summary": "In an open collection",
                  "collectionIds": ["open"], "vector_distance": 0.23}),
]


def _related(private):
    svc = GraphService.__new__(GraphService)
    svc.db = _GraphDb(_NEIGHBOURS, private)
    svc.ai = SimpleNamespace(client=None)
    seen = {}

    def fake_verify(title, summary, concepts, candidates):
        seen["prompt_candidates"] = [c["id"] for c in candidates]
        seen["prompt_text"] = repr(candidates)
        # A verifier that confidently relates EVERYTHING it was shown, and
        # the private ids too in case they slipped through some other way.
        return [{"id": i, "similarity": 0.95, "reason": "same topic", "commonConcepts": []}
                for i in ("pub", "flag", "vault", "open")]

    svc._verify_relationships_with_llm = fake_verify
    results = svc.find_related_links(new_link_id="new", title="New", summary="S",
                                     embedding=[0.1] * 4, new_concepts=[], uid="u1")
    return [r["id"] for r in results], seen


def test_private_candidates_never_reach_the_verifier_or_the_relations():
    related, seen = _related(private=["vault"])
    assert seen["prompt_candidates"] == ["pub", "open"]
    assert "Fertility" not in seen["prompt_text"] and "Divorce" not in seen["prompt_text"]
    assert related == ["pub", "open"]


def test_failed_collection_lookup_fails_closed():
    related, seen = _related(private=RuntimeError("collections unreadable"))
    assert seen["prompt_candidates"] == ["pub"]
    assert related == ["pub"]
