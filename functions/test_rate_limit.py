"""Unit tests for the spoof-resistant identity helpers in rate_limit.py.

`check_rate_limit` needs Firestore and is covered by integration; here we lock
down the pure helpers that decide WHAT to rate-limit on — the part an attacker
manipulates to evade limits.
"""

from rate_limit import client_ip, rate_limit_identity


class _Req:
    def __init__(self, headers=None, remote_addr=None):
        self.headers = headers or {}
        self.remote_addr = remote_addr


def test_client_ip_uses_rightmost_forwarded_hop():
    # The leftmost value is attacker-controlled; the platform appends the real
    # hop on the right. We must key on the rightmost.
    req = _Req(headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8, 9.9.9.9"})
    assert client_ip(req) == "9.9.9.9"


def test_client_ip_single_value():
    req = _Req(headers={"X-Forwarded-For": "203.0.113.7"})
    assert client_ip(req) == "203.0.113.7"


def test_client_ip_falls_back_to_remote_addr():
    req = _Req(headers={}, remote_addr="198.51.100.2")
    assert client_ip(req) == "198.51.100.2"


def test_client_ip_unknown_when_nothing_available():
    assert client_ip(_Req()) == "unknown"


def test_client_ip_ignores_blank_hops():
    req = _Req(headers={"X-Forwarded-For": "1.1.1.1, , "})
    assert client_ip(req) == "1.1.1.1"


def test_identity_prefers_uid():
    req = _Req(headers={"X-Forwarded-For": "1.2.3.4"})
    assert rate_limit_identity(req, uid="+16465550123") == "uid:+16465550123"


def test_identity_falls_back_to_ip_when_anonymous():
    req = _Req(headers={"X-Forwarded-For": "1.2.3.4"})
    assert rate_limit_identity(req, uid=None) == "ip:1.2.3.4"
