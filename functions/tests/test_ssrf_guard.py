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


def test_rejects_unresolvable_host(monkeypatch):
    def _boom(*a, **k):
        raise socket.gaierror("nope")
    monkeypatch.setattr(socket, "getaddrinfo", _boom)
    with pytest.raises(UnsafeURLError):
        validate_public_url("https://does-not-resolve.invalid/")
