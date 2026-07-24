"""Raw phone-number uids must never reach the log stream — audit H-4 residue.

The data-doc uid IS the user's E.164 phone number, so `logger.info(f"… {uid}")`
writes PII into Cloud Logging. The 2026-07-14 sweep added a masker to `main.py`
only; the service modules kept interpolating the raw uid, so the leak survived
in the digest / reminder / graph / search / link paths.

Two layers here: unit tests for the shared `log_safe.mask_uid`, and a source
scan that fails if any module reintroduces a raw `{uid}` in a log call — the
part that actually stops this regressing a third time.
"""

import ast
import re
from pathlib import Path

import pytest

from log_safe import mask_uid

FUNCTIONS_DIR = Path(__file__).resolve().parent.parent

# Every module that logs while holding a workspace uid.
_SCANNED = [
    "main.py",
    "digest_service.py",
    "reminder_service.py",
    "graph_service.py",
    "link_service.py",
    "search.py",
    "push_service.py",
    "quota.py",
]

_LOG_METHODS = {"debug", "info", "warning", "error", "exception", "critical"}

# f-string placeholders that would interpolate an unmasked identifier.
_RAW_UID = re.compile(r"\{\s*(uid|user_id|owner_uid|ownerUid|phone|query_text)\b[^}]*\}")


def test_mask_uid_is_stable_and_non_reversible():
    tag = mask_uid("+15551234567")
    assert tag == mask_uid("+15551234567")          # stable for correlation
    assert "+1555" not in tag and "1234567" not in tag
    assert tag.startswith("uid#") and len(tag) == len("uid#") + 8


def test_mask_uid_separates_distinct_users():
    assert mask_uid("+15551234567") != mask_uid("+15557654321")


def test_mask_uid_handles_empty_values():
    assert mask_uid(None) == "uid#none"
    assert mask_uid("") == "uid#none"


def test_main_mask_uid_delegates_to_log_safe():
    """main._mask_uid is kept as an alias — both must emit the same tag."""
    import main
    assert main._mask_uid("+15551234567") == mask_uid("+15551234567")


def _raw_uid_log_calls(path: Path):
    """Yield (lineno, source) for every logger.<level>(...) call in `path`
    whose message interpolates a raw uid-ish name."""
    tree = ast.parse(path.read_text())
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (isinstance(func, ast.Attribute) and func.attr in _LOG_METHODS):
            continue
        if not (isinstance(func.value, ast.Name) and func.value.id == "logger"):
            continue
        for arg in node.args:
            src = ast.unparse(arg)
            # A masked call reads `{mask_uid(uid)}` / `{_mask_uid(uid)}`, which
            # the regex's `\b` after the name will not match.
            if _RAW_UID.search(src):
                yield node.lineno, src


@pytest.mark.parametrize("module", _SCANNED)
def test_no_module_logs_a_raw_uid(module):
    offenders = list(_raw_uid_log_calls(FUNCTIONS_DIR / module))
    assert not offenders, (
        f"{module} logs an unmasked identifier — wrap it in mask_uid(): "
        + "; ".join(f"line {ln}: {src}" for ln, src in offenders)
    )
