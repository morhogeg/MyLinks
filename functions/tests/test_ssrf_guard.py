"""SSRF guard tests for scraper.validate_public_url.

The guard must reject any user-supplied URL that resolves to a non-globally-
routable address (cloud metadata, private/RFC1918, loopback, link-local, and —
since the is_global tightening — CGNAT/shared address space), while allowing a
normal public host. DNS is mocked so these run offline.
"""

import socket
import pytest

import scraper
from scraper import validate_public_url, UnsafeURLError


def _fake_resolution(ip: str):
    """A socket.getaddrinfo stand-in that resolves every host to `ip`."""
    def _getaddrinfo(host, *args, **kwargs):
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", (ip, 0))]
    return _getaddrinfo


# (label, ip) pairs that MUST be rejected as non-public.
_BLOCKED = [
    ("cloud-metadata", "169.254.169.254"),   # link-local (AWS/GCP metadata)
    ("rfc1918-10", "10.0.0.5"),
    ("rfc1918-192", "192.168.1.1"),
    ("loopback", "127.0.0.1"),
    ("cgnat", "100.64.1.1"),                 # shared address space — the is_global win
    ("unspecified", "0.0.0.0"),
    ("ipv6-loopback", "::1"),
    ("ipv6-ula", "fd00::1"),                 # unique-local (private)
]


@pytest.mark.parametrize("label,ip", _BLOCKED, ids=[c[0] for c in _BLOCKED])
def test_blocks_non_public_addresses(monkeypatch, label, ip):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolution(ip))
    with pytest.raises(UnsafeURLError):
        validate_public_url("https://evil.example.com/path")


@pytest.mark.parametrize("ip", ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])
def test_allows_public_addresses(monkeypatch, ip):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolution(ip))
    # Should not raise.
    validate_public_url("https://example.com/")


def test_rejects_non_http_scheme():
    with pytest.raises(UnsafeURLError):
        validate_public_url("file:///etc/passwd")
    with pytest.raises(UnsafeURLError):
        validate_public_url("gopher://example.com/")


def test_rejects_missing_host():
    with pytest.raises(UnsafeURLError):
        validate_public_url("https:///nohost")


@pytest.mark.parametrize("url", [
    # `urlparse` reads the host as example.com; urllib3 (what `requests` dials)
    # ends the authority at the backslash and connects to the loopback /
    # metadata address. The guard must refuse rather than validate the wrong
    # host.
    "http://127.0.0.1\\@example.com/",
    "http://169.254.169.254\\@example.com/computeMetadata/v1/",
    "https://10.0.0.5\\.example.com/",
])
def test_rejects_backslash_in_authority(monkeypatch, url):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolution("93.184.216.34"))
    with pytest.raises(UnsafeURLError):
        validate_public_url(url)


def test_rejects_host_that_urllib3_would_dial_differently(monkeypatch):
    """Belt and braces: any divergence between the two parsers fails closed."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_resolution("93.184.216.34"))
    import urllib3.util

    class _Parsed:
        host = "127.0.0.1"

    monkeypatch.setattr(urllib3.util, "parse_url", lambda u: _Parsed())
    with pytest.raises(UnsafeURLError):
        validate_public_url("https://example.com/")


def test_userinfo_host_is_dialled_as_parsed(monkeypatch):
    """A userinfo form both parsers agree on still validates the REAL host."""
    seen = []

    def _getaddrinfo(host, *a, **k):
        seen.append(host)
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _getaddrinfo)
    validate_public_url("https://x.com@evil.test/")
    assert seen == ["evil.test"]


def test_rejects_unresolvable_host(monkeypatch):
    def _boom(*a, **k):
        raise socket.gaierror("nope")
    monkeypatch.setattr(socket, "getaddrinfo", _boom)
    with pytest.raises(UnsafeURLError):
        validate_public_url("https://does-not-resolve.invalid/")
