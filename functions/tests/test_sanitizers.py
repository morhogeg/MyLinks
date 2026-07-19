"""main.py _sanitize_history / _sanitize_tags.

main.py imports the full Cloud Functions stack (firebase_functions, firebase_admin,
google.cloud, requests, plus every service module) and evaluates many
``@https_fn.on_request`` decorators at import time. Importing it offline is
brittle and out of scope for a *pure-logic* test, so instead we load ONLY the two
sanitizer FunctionDefs and the constants they reference straight from main.py's
source via ``ast`` and exec them in an isolated namespace. This exercises the
real, current source of both functions without executing the rest of the module.
See the final report note.
"""

import ast
from pathlib import Path

import pytest

_MAIN = Path(__file__).resolve().parent.parent / "main.py"
_WANTED_FN = {"_sanitize_history", "_sanitize_tags", "_sanitize_hints"}
_WANTED_CONST = {
    "MAX_HISTORY_ITEMS",
    "MAX_HISTORY_CONTENT_LENGTH",
    "MAX_TAGS",
    "MAX_TAG_LENGTH",
    "MAX_HINT_TEXT_LENGTH",
    "MAX_HINT_TITLE_LENGTH",
    "MAX_HINT_TITLES",
}


def _load_sanitizers():
    tree = ast.parse(_MAIN.read_text())
    nodes = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in _WANTED_FN:
            nodes.append(node)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in _WANTED_CONST:
                    nodes.append(node)
    ns: dict = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "<main-sanitizers>", "exec"), ns)
    return ns


_NS = _load_sanitizers()
_sanitize_history = _NS["_sanitize_history"]
_sanitize_tags = _NS["_sanitize_tags"]
MAX_HISTORY_ITEMS = _NS["MAX_HISTORY_ITEMS"]
MAX_HISTORY_CONTENT_LENGTH = _NS["MAX_HISTORY_CONTENT_LENGTH"]
MAX_TAGS = _NS["MAX_TAGS"]
MAX_TAG_LENGTH = _NS["MAX_TAG_LENGTH"]


# ── _sanitize_history ─────────────────────────────────────────────────────

@pytest.mark.parametrize("bad", [None, "string", 123, {"role": "user"}])
def test_history_non_list_becomes_empty(bad):
    assert _sanitize_history(bad) == []


def test_history_keeps_only_last_n_turns():
    history = [{"role": "user", "content": f"m{i}"} for i in range(MAX_HISTORY_ITEMS + 4)]
    out = _sanitize_history(history)
    assert len(out) == MAX_HISTORY_ITEMS
    # The oldest turns are dropped; the newest survive.
    assert out[0]["content"] == "m4"
    assert out[-1]["content"] == f"m{MAX_HISTORY_ITEMS + 3}"


def test_history_drops_non_dict_items():
    history = [{"role": "user", "content": "ok"}, "junk", 42, ["x"]]
    out = _sanitize_history(history)
    assert out == [{"role": "user", "content": "ok"}]


def test_history_whitelists_role_defaulting_to_user():
    out = _sanitize_history([{"role": "system", "content": "x"}])
    assert out[0]["role"] == "user"
    out2 = _sanitize_history([{"role": "assistant", "content": "x"}])
    assert out2[0]["role"] == "assistant"


def test_history_truncates_content_length():
    long = "a" * (MAX_HISTORY_CONTENT_LENGTH + 500)
    out = _sanitize_history([{"role": "user", "content": long}])
    assert len(out[0]["content"]) == MAX_HISTORY_CONTENT_LENGTH


def test_history_coerces_non_string_content():
    out = _sanitize_history([{"role": "user", "content": 123}])
    assert out[0]["content"] == "123"
    out_none = _sanitize_history([{"role": "user", "content": None}])
    assert out_none[0]["content"] == ""


# ── _sanitize_tags ────────────────────────────────────────────────────────

@pytest.mark.parametrize("bad", [None, "notalist", 5, {"a": 1}])
def test_tags_non_list_becomes_empty(bad):
    assert _sanitize_tags(bad) == []


def test_tags_caps_count():
    tags = [f"t{i}" for i in range(MAX_TAGS + 20)]
    out = _sanitize_tags(tags)
    assert len(out) == MAX_TAGS


def test_tags_truncates_per_tag_length():
    out = _sanitize_tags(["x" * (MAX_TAG_LENGTH + 30)])
    assert len(out[0]) == MAX_TAG_LENGTH


def test_tags_drops_empty_and_whitespace_only():
    out = _sanitize_tags(["  ", "", "  keep  "])
    assert out == ["keep"]


def test_tags_coerces_non_strings():
    out = _sanitize_tags([123, "tag"])
    assert out == ["123", "tag"]


# ── _sanitize_hints (structured Ask-chip intent) ──────────────────────────

_sanitize_hints = _NS["_sanitize_hints"]
MAX_HINT_TEXT_LENGTH = _NS["MAX_HINT_TEXT_LENGTH"]
MAX_HINT_TITLE_LENGTH = _NS["MAX_HINT_TITLE_LENGTH"]
MAX_HINT_TITLES = _NS["MAX_HINT_TITLES"]


@pytest.mark.parametrize("bad", [None, "string", 42, ["list"]])
def test_hints_non_dict_becomes_empty(bad):
    assert _sanitize_hints(bad) == {}


def test_hints_keeps_valid_fields():
    out = _sanitize_hints({
        "recency": True,
        "category": " Tech ",
        "concept": "Resilience",
        "anchorTitles": ["Alpha Protocol"],
        "excludeTitles": ["Beta Notes", "Gamma"],
    })
    assert out == {
        "recency": True,
        "category": "Tech",
        "concept": "Resilience",
        "anchorTitles": ["Alpha Protocol"],
        "excludeTitles": ["Beta Notes", "Gamma"],
    }


def test_hints_drops_malformed_fields_silently():
    out = _sanitize_hints({
        "recency": 0,                      # falsy → omitted
        "category": 42,                    # non-str → dropped
        "concept": "   ",                  # blank → dropped
        "anchorTitles": "not-a-list",      # non-list → dropped
        "excludeTitles": [1, None, "  ", "ok"],
    })
    assert out == {"excludeTitles": ["ok"]}


def test_hints_caps_lengths_and_counts():
    out = _sanitize_hints({
        "category": "x" * 500,
        "anchorTitles": ["y" * 500] + [f"t{i}" for i in range(10)],
    })
    assert len(out["category"]) == MAX_HINT_TEXT_LENGTH
    assert len(out["anchorTitles"]) == MAX_HINT_TITLES
    assert len(out["anchorTitles"][0]) == MAX_HINT_TITLE_LENGTH
