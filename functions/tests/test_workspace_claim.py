"""The legacy workspace-claim gate (`_owner_email_matches`) — audit S-8.

`_claim_workspace_logic` step 2 links a signed-in account to the first
``users/`` doc that has no ``authUids`` — which, in this project, is the owner's
entire phone-keyed library. That step used to be gated by

    if not owner_email or email == owner_email:

so with ``OWNER_EMAIL`` unset (its state in prod today — SOURCE_OF_TRUTH §4
task 5) the gate was OPEN: any account that reached `claim_workspace` /
`claim_workspace_http` claimed the workspace. These tests pin the fail-CLOSED
behaviour, the case-insensitive match, and the unverified-email refusal.

No Firestore is touched: every case that should be denied never reaches
`get_db()`, and the one allow-case asserts on `_owner_email_matches` directly.
"""

import pytest

import main


@pytest.fixture(autouse=True)
def _clear_owner_email(monkeypatch):
    monkeypatch.delenv("OWNER_EMAIL", raising=False)


def test_unset_owner_email_denies_the_claim(monkeypatch):
    """The regression: unset OWNER_EMAIL must DENY, not wave everyone through."""
    assert main._owner_email_matches("anyone@example.com") is False


def test_blank_owner_email_denies_the_claim(monkeypatch):
    """A whitespace-only value is a misconfiguration, not an allowlist."""
    monkeypatch.setenv("OWNER_EMAIL", "   ")
    assert main._owner_email_matches("anyone@example.com") is False


def test_matching_owner_email_is_allowed(monkeypatch):
    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")
    assert main._owner_email_matches("owner@example.com") is True


def test_match_is_case_insensitive_and_trims(monkeypatch):
    monkeypatch.setenv("OWNER_EMAIL", "Owner@Example.com")
    assert main._owner_email_matches("  owner@example.COM  ") is True


def test_non_owner_email_is_denied(monkeypatch):
    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")
    assert main._owner_email_matches("attacker@example.com") is False


def test_missing_email_is_denied(monkeypatch):
    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")
    assert main._owner_email_matches(None) is False
    assert main._owner_email_matches("") is False


def test_provider_flagged_unverified_email_is_denied(monkeypatch):
    """An address the IdP explicitly marked unverified can't claim the owner doc."""
    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")
    claims = {"email": "owner@example.com", "email_verified": False}
    assert main._owner_email_matches("owner@example.com", claims) is False


def test_absent_email_verified_claim_still_allowed(monkeypatch):
    """Some Apple ID tokens omit `email_verified` — omission must not brick the
    owner's own claim (only an explicit False is a refusal)."""
    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")
    assert main._owner_email_matches("owner@example.com", {"email": "owner@example.com"}) is True


def test_claim_logic_skips_the_scan_when_the_gate_denies(monkeypatch):
    """End-to-end through `_claim_workspace_logic`: a denied gate must not even
    scan `users/` (the scan is what performs the takeover)."""
    monkeypatch.setattr(main, "find_data_uid_by_auth_uid", lambda _uid: None)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)

    def _boom():
        raise AssertionError("get_db() must not be reached when the gate denies")

    monkeypatch.setattr(main, "get_db", _boom)

    result = main._claim_workspace_logic("attacker-auth-uid", "attacker@example.com")
    assert result == {"uid": None, "created": False}


def test_claim_logic_returns_an_already_linked_workspace(monkeypatch):
    """Step 1 is unaffected by the gate — a linked account still resolves."""
    monkeypatch.setattr(main, "find_data_uid_by_auth_uid", lambda _uid: "+15551234567")
    assert main._claim_workspace_logic("auth-uid", None) == {
        "uid": "+15551234567", "created": False,
    }
