"""Source-scan guards for two web-client security invariants (audit S-10, S-11).

`web/` has no JavaScript test runner (SOURCE_OF_TRUTH §4 item 18 tracks adding
one), so these invariants live here — the same shape as the `test_log_masking.py`
AST scan, and they run in the existing "Python tests" CI job.

They are SOURCE invariants, not behavioural tests: they prove the guard is
wired at every site that needs it, not that it behaves correctly at runtime.
That is exactly the failure mode both findings had — the guard existed and two
call sites simply never got it.
"""

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
WEB = REPO_ROOT / "web"

pytestmark = pytest.mark.skipif(not WEB.is_dir(), reason="web/ not present")


def _sources():
    """Every first-party .ts/.tsx file in web/, excluding the native iOS shell."""
    for sub in ("app", "components", "lib"):
        root = WEB / sub
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.suffix in (".ts", ".tsx") and "node_modules" not in path.parts:
                yield path


# ── S-11: the stored-URL scheme guard ────────────────────────────────────────
#
# `link.url` is untrusted and stored verbatim. Rendering it as an href, or
# handing it to window.open(), without proving it is http(s) lets a stored
# `javascript:` value run in the app's own origin. The guard was copy-pasted at
# five sites and missing at two (Card.tsx's placeholder footer link,
# CardActionSheet's "Open source" row) until 2026-07-25.

_DANGEROUS_URL_SINK = re.compile(r"href=\{link\.url\}|window\.open\(\s*link\.url")


def test_every_stored_url_sink_imports_the_scheme_guard():
    offenders = []
    for path in _sources():
        text = path.read_text(encoding="utf-8")
        if _DANGEROUS_URL_SINK.search(text) and "isHttpUrl" not in text:
            offenders.append(path.relative_to(REPO_ROOT).as_posix())
    assert not offenders, (
        "These files put link.url into an href or window.open() without "
        f"importing the isHttpUrl guard from lib/url.ts: {offenders}"
    )


def test_the_scheme_guard_is_not_reimplemented_inline():
    """One guard, one place — an inline regex copy is how a site gets missed."""
    inline = re.compile(r"https\?:\\/\\/[^\n]{0,40}test\(\s*link\.url")
    offenders = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in _sources()
        if inline.search(path.read_text(encoding="utf-8"))
    ]
    assert not offenders, (
        f"Inline copies of the URL-scheme regex — use isHttpUrl(): {offenders}"
    )


def test_the_scheme_guard_exists_and_is_anchored():
    src = (WEB / "lib" / "url.ts").read_text(encoding="utf-8")
    assert "export function isHttpUrl" in src
    # Anchored at the start of the string: an unanchored test would accept
    # `javascript:void(location='https://')`.
    assert "/^https?:" in src


# ── S-10: local data is destroyed on sign-out ────────────────────────────────
#
# Firestore runs with persistentLocalCache(), so IndexedDB mirrors the user's
# whole library. Neither Firebase sign-out nor server-side account deletion
# clears it, so a sign-out on a shared browser — and every "Delete my account"
# — used to leave the full library readable on the device.


def test_sign_out_purges_the_local_firestore_cache():
    src = (WEB / "lib" / "auth.ts").read_text(encoding="utf-8")
    body = src.split("export async function signOutUser")[1]
    assert "purgeLocalUserData" in body, (
        "signOutUser() must purge the local Firestore cache — it is the single "
        "choke point shared by the sign-out and delete-account flows."
    )
    assert "location.reload" in body, (
        "terminate() makes the Firestore instance permanently unusable, so the "
        "page must reload after the purge."
    )


def test_purge_clears_indexeddb_and_storage():
    src = (WEB / "lib" / "localData.ts").read_text(encoding="utf-8")
    assert "clearIndexedDbPersistence" in src
    assert "terminate" in src          # required before the cache can be cleared
    assert "localStorage.removeItem" in src


def test_local_storage_purge_is_an_allowlist_not_a_denylist():
    """A denylist silently forgets keys added by future features."""
    src = (WEB / "lib" / "localData.ts").read_text(encoding="utf-8")
    assert "DEVICE_PREFERENCE_KEYS" in src
    kept = re.search(r"DEVICE_PREFERENCE_KEYS = new Set\(\[(.*?)\]\)", src, re.S)
    assert kept, "expected an explicit keep-allowlist"
    # Only device-level preferences may survive; nothing user- or content-scoped.
    assert set(re.findall(r"'([^']+)'", kept.group(1))) == {"theme"}
