"""What may travel to Gemini — the privacy filters on the two payload builders
that had none (2026-07-27 Gemini privacy audit).

Ask has stripped effectively-private cards out of its prompt since it shipped
(`search.strip_private_cards`). Two other payloads never got the same rule:

  • `digest_service.fetch_candidate_links` — feeds BOTH the curated digest and
    the weekly synthesis. The synthesis sends its window to Gemini and then
    puts the model's generated title into a push notification, so a private
    card's subject could land on a locked phone.
  • `link_service.get_user_tags` — interpolated into EVERY analysis prompt, so
    a private card's tags ("fertility", "layoff") rode along with unrelated
    public saves. It was also uncapped, unlike its client-supplied twin.

Offline: the Firestore reads are faked at each module's ``get_db`` boundary.
"""

import digest_service as ds
import link_service as ls
import search


# ── fake Firestore ────────────────────────────────────────────────────────

class FakeDoc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)


class FakeQuery:
    """Supports the two shapes these paths use: a links collection that may be
    `.limit(n)`-ed before `.get()`, and a collections `.where(...).stream()`."""

    def __init__(self, docs):
        self._docs = docs

    def limit(self, n):
        return FakeQuery(self._docs[:n])

    def get(self):
        return list(self._docs)

    def where(self, filter):
        field, value = filter.field_path, filter.value
        return FakeQuery([d for d in self._docs if d.to_dict().get(field) == value])

    def stream(self):
        return iter(self._docs)


class FakeUserDoc:
    def __init__(self, links, collections):
        self._cols = {"links": links, "collections": collections}

    def collection(self, name):
        return FakeQuery(self._cols.get(name, []))


class FakeDb:
    def __init__(self, links, collections=()):
        self._user = FakeUserDoc(list(links), list(collections))

    def collection(self, _name):
        return self

    def document(self, _uid):
        return self._user


def _install(monkeypatch, module, links, collections=()):
    """Point `module`'s get_db AND search's (private_collection_ids reads
    through its own import) at the same fake."""
    db = FakeDb(links, collections)
    monkeypatch.setattr(module, "get_db", lambda: db)
    monkeypatch.setattr(search, "get_db", lambda: db)
    return db


def _link(doc_id, **fields):
    return FakeDoc(doc_id, fields)


# ── fetch_candidate_links: digest + synthesis ─────────────────────────────

def test_card_level_private_never_reaches_digest_or_synthesis(monkeypatch):
    _install(monkeypatch, ds, [
        _link("public", title="Public", tags=["ai"]),
        _link("secret", title="Secret", tags=["health"], isPrivate=True),
    ])
    ids = [l["id"] for l in ds.fetch_candidate_links("u1")]
    assert ids == ["public"]


def test_private_collection_membership_is_inherited(monkeypatch):
    """The card carries no flag of its own — privacy comes from its collection."""
    _install(
        monkeypatch, ds,
        links=[
            _link("public", title="Public", collectionIds=["open"]),
            _link("inherited", title="Inherited", collectionIds=["vault"]),
        ],
        collections=[
            FakeDoc("vault", {"isPrivate": True}),
            FakeDoc("open", {"isPrivate": False}),
        ],
    )
    ids = [l["id"] for l in ds.fetch_candidate_links("u1")]
    assert ids == ["public"]


def test_archived_exclusion_still_holds(monkeypatch):
    """The privacy filter is additive — it must not displace the old rule."""
    _install(monkeypatch, ds, [
        _link("live", title="Live"),
        _link("gone", title="Gone", status="archived"),
        _link("both", title="Both", status="archived", isPrivate=True),
    ])
    assert [l["id"] for l in ds.fetch_candidate_links("u1")] == ["live"]


def test_embedding_vector_is_still_dropped(monkeypatch):
    _install(monkeypatch, ds, [_link("a", title="A", embedding_vector=[0.1] * 8)])
    assert "embedding_vector" not in ds.fetch_candidate_links("u1")[0]


# ── synthesis_window_cards: the Gemini-bound half ─────────────────────────

def _now_ms():
    from datetime import datetime, timezone
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def test_ask_excluded_card_never_reaches_the_weekly_gemini_call():
    """`askExcluded` marks a card whose text trips Gemini's prompt filter. It
    would otherwise poison the whole weekly synthesis, as it did Ask."""
    recent = _now_ms() - 86_400_000
    cards = ds.synthesis_window_cards([
        {"id": "ok", "createdAt": recent},
        {"id": "poison", "createdAt": recent, "askExcluded": True},
    ])
    assert [c["id"] for c in cards] == ["ok"]


def test_window_cutoff_is_unchanged():
    now = _now_ms()
    cards = ds.synthesis_window_cards([
        {"id": "inside", "createdAt": now - 86_400_000},
        {"id": "outside", "createdAt": now - 30 * 86_400_000},
    ])
    assert [c["id"] for c in cards] == ["inside"]


# ── get_user_tags: the list on EVERY analysis prompt ──────────────────────

def test_tags_only_on_private_cards_are_withheld(monkeypatch):
    _install(monkeypatch, ls, [
        _link("a", tags=["ai", "design"]),
        _link("b", tags=["fertility", "layoff"], isPrivate=True),
    ])
    assert set(ls.get_user_tags("u1")) == {"ai", "design"}


def test_a_tag_shared_with_a_public_card_survives(monkeypatch):
    """Withholding it would fragment the user's open vocabulary for no gain —
    the tag is already on a card that isn't private."""
    _install(monkeypatch, ls, [
        _link("a", tags=["health"]),
        _link("b", tags=["health", "clinic"], isPrivate=True),
    ])
    assert ls.get_user_tags("u1") == ["health"]


def test_private_collection_tags_are_withheld_too(monkeypatch):
    _install(
        monkeypatch, ls,
        links=[
            _link("a", tags=["ai"], collectionIds=["open"]),
            _link("b", tags=["divorce"], collectionIds=["vault"]),
        ],
        collections=[FakeDoc("vault", {"isPrivate": True}),
                     FakeDoc("open", {"isPrivate": False})],
    )
    assert ls.get_user_tags("u1") == ["ai"]


def test_tags_are_ranked_by_use_and_capped(monkeypatch):
    """The old version returned EVERY tag, alphabetically — unbounded prompt
    growth, and an `a`-heavy vocabulary crowded out the tags worth reusing."""
    links = [_link(f"n{i}", tags=[f"tag{i:03d}"])
             for i in range(ls.MAX_PROMPT_TAGS + 20)]
    links.append(_link("hot", tags=["workhorse"]))
    links.append(_link("hot2", tags=["workhorse"]))
    _install(monkeypatch, ls, links)
    tags = ls.get_user_tags("u1")
    assert len(tags) == ls.MAX_PROMPT_TAGS
    # Used twice → ranks above every once-used tag, regardless of alphabet.
    assert tags[0] == "workhorse"


def test_malformed_tag_fields_are_ignored(monkeypatch):
    _install(monkeypatch, ls, [
        _link("a", tags=["ai"]),
        _link("b", tags="not-a-list"),
        _link("c", tags=[None, "", "  ", 42, "real"]),
        _link("d"),
    ])
    assert set(ls.get_user_tags("u1")) == {"ai", "real"}
