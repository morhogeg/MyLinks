"""Category canonicalisation: Title Case, case-insensitive merge, and the
TS/Python mirror staying in step.

WHY: categories were stored exactly as written, so `sports` and `Sports` were
two categories with two counts and two chips in the filter sheet — the owner's
2026-08-05 screenshot had `international relations 1` sitting directly above
`International Relations 1`. Matching is case-insensitive now and the stored
form is always canonical.

The parity test at the bottom is the load-bearing one. Two implementations
write categories — Python when analysis produces one, TypeScript when the user
edits one — and if their word lists drift, each will re-split what the other
merged. Same trick `test_web_client_hygiene.py` uses: read the TS source.
"""

import re
from pathlib import Path

import pytest

from link_service import canonical_category, category_key

_TS = Path(__file__).resolve().parent.parent.parent / "web" / "lib" / "category.ts"


# ── Title Case ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("sports", "Sports"),
    ("Sports", "Sports"),
    ("SPORTS", "Sports"),
    ("literature", "Literature"),
    ("international relations", "International Relations"),
    ("International Relations", "International Relations"),
    ("  real   estate  ", "Real Estate"),
    ("consumer goods", "Consumer Goods"),
    ("Recipe", "Recipe"),
])
def test_canonical_title_cases(raw, expected):
    assert canonical_category(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("tv series", "TV Series"),
    ("TV series", "TV Series"),
    ("ai", "AI"),
    ("ai tools", "AI Tools"),
    ("us politics", "US Politics"),
    ("diy", "DIY"),
])
def test_acronyms_stay_upper(raw, expected):
    """Plain title-casing gives "Tv Series", which reads as a typo."""
    assert canonical_category(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("cost of living", "Cost of Living"),
    ("science and technology", "Science and Technology"),
    ("the arts", "The Arts"),          # a minor word LEADING still capitalises
    ("war and peace in europe", "War and Peace in Europe"),
])
def test_minor_words_stay_lower_unless_leading(raw, expected):
    assert canonical_category(raw) == expected


def test_hyphenated_compounds_capitalise_each_part():
    assert canonical_category("sci-fi") == "Sci-Fi"


@pytest.mark.parametrize("empty", ["", "   ", None])
def test_empty_returns_empty_not_a_category(empty):
    """Callers own the 'General' fallback — this must never invent a category."""
    assert canonical_category(empty) == ""


def test_canonical_is_idempotent():
    """The migration re-runs safely only if applying twice changes nothing."""
    for raw in ["sports", "tv series", "cost of living", "sci-fi", "AI tools"]:
        once = canonical_category(raw)
        assert canonical_category(once) == once


# ── Case-insensitive identity ─────────────────────────────────────────────

def test_case_variants_share_a_key():
    for a, b in [("sports", "Sports"), ("SPORTS", "sports"),
                 ("international relations", "International Relations")]:
        assert category_key(a) == category_key(b)


def test_whitespace_variants_share_a_key():
    assert category_key("real   estate") == category_key("Real Estate")


def test_different_categories_do_not_share_a_key():
    assert category_key("Sports") != category_key("Society")


def test_case_variants_converge_on_one_spelling():
    """The actual merge: everything in a group lands on the same string."""
    group = ["sports", "Sports", "SPORTS", "  sports  "]
    assert len({canonical_category(g) for g in group}) == 1


# ── The two implementations must agree ────────────────────────────────────

def _ts_set(name: str) -> set:
    """Pull a quoted-string set out of the TS source by const name."""
    src = _TS.read_text()
    m = re.search(rf"const {name} = new Set\(\[(.*?)\]\)", src, re.S)
    assert m, f"{name} not found in {_TS.name}"
    return set(re.findall(r"'([^']+)'", m.group(1)))


def test_acronym_lists_match_between_python_and_typescript():
    from link_service import _CATEGORY_ACRONYMS
    assert _ts_set("ACRONYMS") == _CATEGORY_ACRONYMS


def test_minor_word_lists_match_between_python_and_typescript():
    from link_service import _CATEGORY_MINOR_WORDS
    assert _ts_set("MINOR_WORDS") == _CATEGORY_MINOR_WORDS


def test_typescript_mirror_points_back_at_python():
    """A future editor must be told the other copy exists."""
    src = _TS.read_text()
    assert "link_service.py" in src


# ── The migration ─────────────────────────────────────────────────────────
#
# The part that rewrites real cards, so its bounds matter more than its
# happy path: it must be idempotent (it rides a 5-minute scheduled tick), it
# must not touch cards that are already correct, and one broken workspace must
# not stop the rest.

class _Ref:
    def __init__(self, store, key):
        self._store, self._key = store, key

    def update(self, patch):
        self._store[self._key].update(patch)


class _Doc:
    def __init__(self, store, key):
        self._store, self._key = store, key
        self.reference = _Ref(store, key)

    def to_dict(self):
        return dict(self._store[self._key])


def _fake_links(monkeypatch, cards: dict):
    """cards: {docId: {"category": ...}} — mutated in place so assertions can
    read what the migration wrote."""
    import link_service as ls

    class _Links:
        def stream(self):
            return [_Doc(cards, k) for k in list(cards)]

    class _DB:
        def collection(self, name):
            return self

        def document(self, _):
            return self

    db = _DB()
    db.collection = lambda name: (_Links() if name == "links" else db)
    monkeypatch.setattr(ls, "get_db", lambda: db)
    return cards


def test_migration_merges_case_variants(monkeypatch):
    import link_service as ls
    cards = _fake_links(monkeypatch, {
        "a": {"category": "sports"},
        "b": {"category": "Sports"},
        "c": {"category": "international relations"},
        "d": {"category": "International Relations"},
    })
    report = ls.migrate_user_categories("u")
    assert cards["a"]["category"] == "Sports"
    assert cards["b"]["category"] == "Sports"
    assert cards["c"]["category"] == "International Relations"
    assert cards["d"]["category"] == "International Relations"
    # Only the two that were actually wrong got written.
    assert report["cardsUpdated"] == 2


def test_migration_leaves_correct_cards_untouched(monkeypatch):
    import link_service as ls
    _fake_links(monkeypatch, {"a": {"category": "Sports"}, "b": {"category": "TV Series"}})
    assert ls.migrate_user_categories("u")["cardsUpdated"] == 0


def test_migration_is_idempotent(monkeypatch):
    import link_service as ls
    cards = _fake_links(monkeypatch, {"a": {"category": "tv series"}})
    assert ls.migrate_user_categories("u")["cardsUpdated"] == 1
    assert cards["a"]["category"] == "TV Series"
    # Second pass must be a no-op — it rides a 5-minute tick.
    assert ls.migrate_user_categories("u")["cardsUpdated"] == 0


def test_migration_skips_blank_and_non_string_categories(monkeypatch):
    import link_service as ls
    _fake_links(monkeypatch, {
        "a": {"category": ""}, "b": {"category": "   "},
        "c": {"category": None}, "d": {"category": 7}, "e": {},
    })
    assert ls.migrate_user_categories("u")["cardsUpdated"] == 0


def test_migration_reports_what_it_merged(monkeypatch):
    """The audit trail — a surprising result has to be explainable later."""
    import link_service as ls
    _fake_links(monkeypatch, {"a": {"category": "sports"}, "b": {"category": "literature"}})
    merges = ls.migrate_user_categories("u")["merges"]
    assert merges["Sports"] == ["sports"]
    assert merges["Literature"] == ["literature"]
