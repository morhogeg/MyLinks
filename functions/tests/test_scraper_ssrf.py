"""Tests for the scraper's SSRF guard (SOURCE_OF_TRUTH §11 A1):
  • _host_matches routes on the real registrable domain, not a URL substring, so
    a crafted target can't be steered into a platform branch;
  • validate_public_url rejects private / loopback / metadata addresses.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import scraper
from scraper import _host_matches, validate_public_url, UnsafeURLError, is_pinned_host_url
from urllib.parse import urlparse


def _host(u):
    return urlparse(u).hostname


class TestHostMatches(unittest.TestCase):
    def test_matches_domain_and_subdomains(self):
        self.assertTrue(_host_matches(_host("https://facebook.com/x"), "facebook.com"))
        self.assertTrue(_host_matches(_host("https://www.facebook.com/x"), "facebook.com"))
        self.assertTrue(_host_matches(_host("https://m.facebook.com/x"), "facebook.com"))

    def test_rejects_substring_and_lookalike_tricks(self):
        # metadata IP with the platform name only in the query/fragment
        self.assertFalse(_host_matches(_host("http://169.254.169.254/?x=facebook.com"), "facebook.com"))
        # attacker domain that merely PREFIXES the real one
        self.assertFalse(_host_matches(_host("http://facebook.com.attacker.example/"), "facebook.com"))
        # unrelated host
        self.assertFalse(_host_matches(_host("https://example.com/"), "facebook.com"))

    def test_multiple_domains(self):
        self.assertTrue(_host_matches(_host("https://x.com/a/status/1"), "twitter.com", "x.com"))
        self.assertFalse(_host_matches(_host("https://notx.com/"), "twitter.com", "x.com"))


class TestIsPinnedHostUrl(unittest.TestCase):
    """The credential-carrying Twilio media fetch (main.py) pins to an https
    api.twilio.com URL via this helper."""

    def test_accepts_https_twilio(self):
        self.assertTrue(is_pinned_host_url("https://api.twilio.com/media/x.jpg", "twilio.com"))
        self.assertTrue(is_pinned_host_url("https://media.us1.twilio.com/x", "twilio.com"))

    def test_rejects_http_first_hop_cleartext(self):
        # Hostname is fine but http would leak the Basic-auth creds in cleartext.
        self.assertFalse(is_pinned_host_url("http://api.twilio.com/media/x.jpg", "twilio.com"))

    def test_rejects_lookalike_and_foreign_hosts(self):
        self.assertFalse(is_pinned_host_url("https://api.twilio.com.attacker.example/x", "twilio.com"))
        self.assertFalse(is_pinned_host_url("https://169.254.169.254/?x=twilio.com", "twilio.com"))
        self.assertFalse(is_pinned_host_url("https://evil.example/x", "twilio.com"))

    def test_require_https_can_be_relaxed(self):
        self.assertTrue(is_pinned_host_url("http://api.twilio.com/x", "twilio.com", require_https=False))


class TestValidatePublicUrl(unittest.TestCase):
    def setUp(self):
        self._orig = scraper.socket.getaddrinfo

    def tearDown(self):
        scraper.socket.getaddrinfo = self._orig

    def _stub_resolve(self, ip):
        # Shape mirrors socket.getaddrinfo: (family, type, proto, canonname, sockaddr)
        scraper.socket.getaddrinfo = lambda host, *a, **k: [(2, 1, 6, "", (ip, 0))]

    def test_rejects_non_http_scheme(self):
        with self.assertRaises(UnsafeURLError):
            validate_public_url("file:///etc/passwd")
        with self.assertRaises(UnsafeURLError):
            validate_public_url("ftp://example.com/x")

    def test_rejects_cloud_metadata_and_private(self):
        for ip in ("169.254.169.254", "127.0.0.1", "10.0.0.5", "192.168.1.1"):
            self._stub_resolve(ip)
            with self.assertRaises(UnsafeURLError):
                validate_public_url("http://anything.example/")

    def test_allows_public_ip(self):
        self._stub_resolve("93.184.216.34")  # example.com
        # Should not raise.
        validate_public_url("https://example.com/page")


if __name__ == "__main__":
    unittest.main()
