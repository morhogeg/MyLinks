"""The graph backfill embeds cards exactly like every other embed site
(AI-11, server half).

backfill_batch's 'embed' phase (the client's graph migration) and
backfill_related_links embedded `title + summary` only and stamped no
embeddingVersion: every card they touched sat in vector space as a thinner
card than the trigger/pipeline would make it (no detail, notes, takeaway or
concepts), and looked out of date to backfill_embeddings. Offline fakes; the
embedding call records the text it was given.
"""

from types import SimpleNamespace

import pytest

import search
import vector_store
from graph_service import GraphService


@pytest.fixture(autouse=True)
def _phase_one_flags():
    vector_store.reset_flag_cache()
    yield
    vector_store.reset_flag_cache()


class _Doc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data
        self.updates = []
        self.reference = SimpleNamespace(update=self.updates.append)

    def to_dict(self):
        return dict(self._data)


class _Links:
    def __init__(self, docs):
        self._docs = docs
        self._limit = None

    def order_by(self, field):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def stream(self):
        return iter(self._docs[: self._limit])

    def document(self, doc_id):
        return SimpleNamespace(get=lambda: SimpleNamespace(exists=False))

    def find_nearest(self, **kwargs):
        return SimpleNamespace(get=lambda: [])


def _service(docs, texts):
    links = _Links(docs)
    svc = GraphService.__new__(GraphService)
    svc.db = SimpleNamespace(collection=lambda name: SimpleNamespace(
        document=lambda uid: SimpleNamespace(collection=lambda sub: links)))
    svc.ai = SimpleNamespace(client=None, embed_text=lambda text: texts.append(text) or [0.6, 0.8])
    return svc


_CARD = {"title": "Lemon pasta", "summary": "A bright weeknight pasta.",
         "detailedSummary": "## Steps\n1. Boil the pasta\n2. Toss with lemon",
         "userNote": "my twist: add chili", "concepts": ["Italian cooking"],
         "needsEmbedding": True}


def test_embed_phase_uses_the_shared_recipe_and_stamps_the_version():
    texts = []
    doc = _Doc("c1", _CARD)
    res = _service([doc], texts).backfill_batch("uid", phase="embed", limit=20)

    assert res["embedded"] == 1
    assert texts == [search.build_embedding_text(_CARD)]
    assert "my twist" in texts[0] and "Toss with lemon" in texts[0]
    (update,) = doc.updates
    assert update["embeddingVersion"] == search.EMBED_TEXT_VERSION


def test_whole_library_backfill_uses_the_same_recipe():
    texts = []
    doc = _Doc("c1", _CARD)
    _service([doc], texts).backfill_related_links("uid")

    assert texts[0] == search.build_embedding_text(_CARD)
    assert doc.updates[0]["embeddingVersion"] == search.EMBED_TEXT_VERSION
