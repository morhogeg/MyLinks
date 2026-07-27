"""`scraper.safe_get` response-size and wall-clock caps — audit S-7.

Every server-side fetch of a user-supplied URL funnels through `safe_get`, and
`requests` buffers the WHOLE body before any caller-side length check can run
(`main._fetch_post_images` tests `len(resp.content)` — too late). One URL
pointing at a large public file was therefore enough to exhaust a 256 MiB
Cloud Functions instance on any user-supplied URL.

These tests drive `safe_get` against a fake `requests.get` — no sockets, no DNS
(the SSRF guard's resolver is stubbed to a public address).
"""

import socket

import pytest

import scraper
from scraper import ResponseTooLargeError, UnsafeURLError


@pytest.fixture(autouse=True)
def _public_dns(monkeypatch):
    """Resolve every host to a public address so validate_public_url passes."""
    def _getaddrinfo(host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
    monkeypatch.setattr(socket, "getaddrinfo", _getaddrinfo)


class _FakeResponse:
    """Minimal stand-in for a streamed requests.Response."""

    def __init__(self, chunks, headers=None, status_code=200):
        self._chunks = chunks
        self.headers = headers or {}
        self.status_code = status_code
        self.closed = False
        self.is_redirect = False
        self.is_permanent_redirect = False
        self._content = None
        self._content_consumed = False

    # `requests.Response` derives both of these from `_content`, which is what
    # `safe_get` writes back after the capped read — mirror that contract so the
    # tests assert on the same surface real callers use.
    @property
    def content(self):
        return self._content

    @property
    def text(self):
        return (self._content or b"").decode("utf-8")

    def iter_content(self, chunk_size):
        for chunk in self._chunks:
            yield chunk

    def close(self):
        self.closed = True


class _FakeRedirect(_FakeResponse):
    def __init__(self, location):
        super().__init__([b""], headers={"Location": location}, status_code=302)
        self.is_redirect = True


def _install(monkeypatch, responses):
    """Serve `responses` in order from a fake requests.get; record the calls."""
    calls = []
    queue = list(responses)

    def _get(url, **kwargs):
        calls.append((url, kwargs))
        return queue.pop(0)

    monkeypatch.setattr(scraper.requests, "get", _get)
    return calls


def test_body_under_the_cap_is_returned_intact(monkeypatch):
    _install(monkeypatch, [_FakeResponse([b"hello ", b"world"])])
    resp = scraper.safe_get("https://example.com/")
    assert resp.content == b"hello world"
    assert resp.text == "hello world"


def test_streams_and_never_buffers_past_the_cap(monkeypatch):
    """The abort happens mid-transfer: the generator must not be drained."""
    served = []

    def _chunks():
        for _ in range(100):
            served.append(1)
            yield b"x" * 1024

    _install(monkeypatch, [_FakeResponse(_chunks())])
    with pytest.raises(ResponseTooLargeError):
        scraper.safe_get("https://example.com/big", max_bytes=4096)
    # 4 KB cap over 1 KB chunks → stopped at the 5th, not after all 100.
    assert len(served) == 5


def test_oversized_content_length_is_rejected_before_reading(monkeypatch):
    def _never():
        raise AssertionError("body must not be read when Content-Length is over cap")
        yield  # pragma: no cover

    resp = _FakeResponse(_never(), headers={"Content-Length": str(50 * 1024 * 1024)})
    _install(monkeypatch, [resp])
    with pytest.raises(ResponseTooLargeError):
        scraper.safe_get("https://example.com/huge")
    assert resp.closed


def test_oversized_response_is_closed(monkeypatch):
    resp = _FakeResponse([b"y" * 8192])
    _install(monkeypatch, [resp])
    with pytest.raises(ResponseTooLargeError):
        scraper.safe_get("https://example.com/big", max_bytes=1024)
    assert resp.closed


def test_too_large_is_catchable_as_unsafe_url_error(monkeypatch):
    """Scrape paths already handle UnsafeURLError — the new error must ride it
    so an oversized page degrades like a blocked host, not as a 500."""
    _install(monkeypatch, [_FakeResponse([b"z" * 4096])])
    with pytest.raises(UnsafeURLError):
        scraper.safe_get("https://example.com/big", max_bytes=16)


def test_wall_clock_deadline_stops_a_slow_body(monkeypatch):
    """A drip-feed that never exceeds the per-socket timeout still gets cut off."""
    clock = {"t": 0.0}
    monkeypatch.setattr(scraper.time, "monotonic", lambda: clock["t"])

    def _slow():
        for _ in range(10):
            clock["t"] += 20.0  # each chunk "takes" 20s
            yield b"a" * 16

    _install(monkeypatch, [_FakeResponse(_slow())])
    with pytest.raises(ResponseTooLargeError):
        scraper.safe_get("https://example.com/slow")


def test_redirect_bodies_are_dropped_unread(monkeypatch):
    """A 30x hop's body is irrelevant — it must be closed, not buffered."""
    hop = _FakeRedirect("https://example.com/final")
    final = _FakeResponse([b"done"])
    _install(monkeypatch, [hop, final])
    resp = scraper.safe_get("https://example.com/start")
    assert resp.content == b"done"
    assert hop.closed


def test_redirect_chain_is_still_revalidated(monkeypatch):
    """The size cap must not have weakened the SSRF re-validation per hop."""
    calls = _install(monkeypatch, [
        _FakeRedirect("https://example.com/second"),
        _FakeResponse([b"ok"]),
    ])

    seen = []
    real_validate = scraper.validate_public_url

    def _spy(url):
        seen.append(url)
        return real_validate(url)

    monkeypatch.setattr(scraper, "validate_public_url", _spy)
    scraper.safe_get("https://example.com/first")
    assert seen == ["https://example.com/first", "https://example.com/second"]
    assert [c[0] for c in calls] == [
        "https://example.com/first", "https://example.com/second",
    ]


def test_redirect_loop_still_bounded(monkeypatch):
    _install(monkeypatch, [_FakeRedirect("https://example.com/loop")] * 10)
    with pytest.raises(UnsafeURLError):
        scraper.safe_get("https://example.com/loop", max_redirects=3)


def test_fetches_are_never_auto_redirecting(monkeypatch):
    """`allow_redirects` must stay False — that is what forces re-validation."""
    calls = _install(monkeypatch, [_FakeResponse([b"ok"])])
    scraper.safe_get("https://example.com/")
    assert calls[0][1]["allow_redirects"] is False
    assert calls[0][1]["stream"] is True
