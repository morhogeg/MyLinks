"""Unit tests for the SSRF guard and platform-routing in scraper.py.

These are the security-critical pure functions: a hole in `validate_public_url`
is a server-side request forgery vector, and loose host matching mis-routes
scrapers. No network — DNS is monkeypatched.
"""

import socket

import pytest

import scraper
from scraper import (
    UnsafeURLError,
    validate_public_url,
    _host_matches,
)


def _fake_getaddrinfo(ip):
    """Return a getaddrinfo stub that resolves any host to `ip`."""
    def _inner(host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]
    return _inner


# ── validate_public_url (SSRF guard) ──────────────────────────────────────

def test_rejects_non_http_scheme():
    with pytest.raises(UnsafeURLError):
        validate_public_url("ftp://example.com/x")
    with pytest.raises(UnsafeURLError):
        validate_public_url("file:///etc/passwd")


def test_rejects_missing_host():
    with pytest.raises(UnsafeURLError):
        validate_public_url("http://")


@pytest.mark.parametrize("ip", [
    "127.0.0.1",        # loopback
    "10.0.0.5",         # private
    "192.168.1.1",      # private
    "169.254.169.254",  # cloud metadata (link-local)
    "0.0.0.0",          # unspecified
])
def test_rejects_private_and_metadata_targets(monkeypatch, ip):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(ip))
    with pytest.raises(UnsafeURLError):
        validate_public_url("http://malicious.example.com/")


def test_allows_public_target(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
    # Should not raise.
    validate_public_url("https://example.com/article")


def test_rejects_unresolvable_host(monkeypatch):
    def _boom(*a, **k):
        raise socket.gaierror("no such host")
    monkeypatch.setattr(socket, "getaddrinfo", _boom)
    with pytest.raises(UnsafeURLError):
        validate_public_url("https://does-not-resolve.invalid/")


# ── _host_matches (platform routing) ──────────────────────────────────────

def test_host_matches_exact_and_subdomain():
    assert _host_matches("x.com", ("twitter.com", "x.com"))
    assert _host_matches("www.x.com", ("twitter.com", "x.com"))
    assert _host_matches("mobile.twitter.com", ("twitter.com", "x.com"))


def test_host_matches_rejects_lookalikes():
    # The bug this guards: 'x.com' in 'netflix.com' was truthy under substring
    # matching. Hostname matching must NOT fire here.
    assert not _host_matches("netflix.com", ("x.com",))
    assert not _host_matches("notyoutube.com", ("youtube.com",))
    assert not _host_matches("", ("x.com",))
