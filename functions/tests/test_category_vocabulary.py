"""Category reuse: the vocabulary builder and the prompt contract.

WHY THIS EXISTS: categories drifted because the analysis prompt was never told
which ones already existed. Tags always had an "Existing Tags" list plus a reuse
rule; categories had neither, so every card invented one from scratch — a Hebrew
article on what it costs a household to raise children landed in "Business"
while comparable cards sat elsewhere (owner, device QA 2026-08-05).

Two halves are covered here:
  - `get_user_vocabulary` returns tags AND categories from ONE scan, ranked by
    use, capped, and with effectively-private cards excluded — the same privacy
    contract `get_user_tags` has, because this list rides into every prompt.
  - `GeminiService._categories_context` renders the reuse block, and the system
    prompt actually carries the rule that block depends on.
"""

import ast
from pathlib import Path

import pytest

import link_service


class _Doc:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return self._data


def _install_cards(monkeypatch, cards, private_ids=None):
    """Point link_service at a fake links collection."""
    class _Links:
        def get(self):
            return [_Doc(c) for c in cards]

    class _DB:
        def collection(self, _):
            return self

        def document(self, _):
            return self

        def collection_(self, _):
            return _Links()

    db = _DB()
    db.collection = lambda name: (_Links() if name == 'links' else db)
    db.document = lambda _: db
    monkeypatch.setattr(link_service, "get_db", lambda: db)

    import search
    monkeypatch.setattr(search, "private_collection_ids", lambda uid: private_ids or set())
    monkeypatch.setattr(
        search, "is_effectively_private",
        lambda data, ids: bool(data.get("isPrivate")),
    )


def test_returns_tags_and_categories_from_one_scan(monkeypatch):
    _install_cards(monkeypatch, [
        {"tags": ["israel"], "category": "Society"},
        {"tags": ["ai"], "category": "Tech"},
    ])
    tags, cats = link_service.get_user_vocabulary("u")
    assert set(tags) == {"israel", "ai"}
    assert set(cats) == {"Society", "Tech"}


def test_categories_ranked_by_use_then_alphabetically(monkeypatch):
    _install_cards(monkeypatch, [
        {"category": "Tech"}, {"category": "Tech"}, {"category": "Tech"},
        {"category": "Society"}, {"category": "Society"},
        {"category": "Health"},
    ])
    _, cats = link_service.get_user_vocabulary("u")
    assert cats == ["Tech", "Society", "Health"]


def test_private_only_categories_are_excluded(monkeypatch):
    """A category that exists ONLY on a private card must not ride into the
    prompt of an unrelated public save — same promise as tags."""
    _install_cards(monkeypatch, [
        {"category": "Society"},
        {"category": "Fertility", "isPrivate": True},
    ])
    _, cats = link_service.get_user_vocabulary("u")
    assert cats == ["Society"]
    assert "Fertility" not in cats


def test_category_shared_with_a_public_card_survives(monkeypatch):
    _install_cards(monkeypatch, [
        {"category": "Health"},
        {"category": "Health", "isPrivate": True},
    ])
    _, cats = link_service.get_user_vocabulary("u")
    assert cats == ["Health"]


def test_categories_are_capped(monkeypatch):
    _install_cards(monkeypatch, [
        {"category": f"C{i}"} for i in range(link_service.MAX_PROMPT_CATEGORIES + 15)
    ])
    _, cats = link_service.get_user_vocabulary("u")
    assert len(cats) == link_service.MAX_PROMPT_CATEGORIES


def test_blank_and_non_string_categories_are_ignored(monkeypatch):
    _install_cards(monkeypatch, [
        {"category": "Society"}, {"category": "   "}, {"category": ""},
        {"category": None}, {"category": 7}, {},
    ])
    _, cats = link_service.get_user_vocabulary("u")
    assert cats == ["Society"]


def test_categories_are_trimmed(monkeypatch):
    _install_cards(monkeypatch, [{"category": "  Society  "}])
    _, cats = link_service.get_user_vocabulary("u")
    assert cats == ["Society"]


# ── The prompt side ───────────────────────────────────────────────────────

def _categories_context(values):
    """Load ONLY the static helper from ai_service source — importing the module
    pulls in google.genai. Same ast trick as tests/test_sanitizers.py."""
    src = (Path(__file__).resolve().parent.parent / "ai_service.py").read_text()
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_categories_context":
            fn = ast.FunctionDef(
                name=node.name, args=node.args, body=node.body,
                decorator_list=[], returns=None, type_params=[],
            )
            ast.fix_missing_locations(fn)
            ns: dict = {}
            exec(compile(ast.Module(body=[fn], type_ignores=[]), "<ctx>", "exec"), ns)
            return ns["_categories_context"](values)
    raise AssertionError("_categories_context not found in ai_service.py")


@pytest.mark.parametrize("empty", [None, []])
def test_context_is_empty_without_categories(empty):
    """A brand-new workspace must not get a dangling 'Existing Categories:' header."""
    assert _categories_context(empty) == ""


def test_context_lists_the_categories_and_asks_for_reuse():
    out = _categories_context(["Society", "Tech"])
    assert "Society, Tech" in out
    assert "REUSE" in out


def test_system_prompt_carries_the_reuse_and_subject_rules():
    """The context block is inert without the rule that reads it."""
    src = (Path(__file__).resolve().parent.parent / "ai_service.py").read_text()
    assert "Existing Categories" in src
    assert "REUSE FIRST" in src
    # The specific misfire that prompted this: an economic angle pulling an
    # everyday-life subject into Business.
    assert "CHOOSE BY SUBJECT, NOT BY ANGLE" in src
