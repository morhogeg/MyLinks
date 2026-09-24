"""url_key: the canonical dedupe key (functions/url_key.py, mirrored in
web/lib/urlKey.ts). Each pair below must fold to the same key; the
`distinct` cases must NOT."""

import pytest

from url_key import url_key

SAME = [
    # scheme / host / slash / fragment
    ("http://www.example.com/a/", "https://example.com/a"),
    ("https://EXAMPLE.com/a#section", "https://example.com/a"),
    ("https://m.example.com/a", "https://example.com/a"),
    ("https://mobile.example.com/a", "https://example.com/a"),
    ("https://example.com:443/a", "https://example.com/a"),
    ("https://example.com/", "https://example.com"),
    # tracking params
    ("https://example.com/a?utm_source=x&utm_medium=y", "https://example.com/a"),
    ("https://example.com/a?fbclid=abc", "https://example.com/a"),
    ("https://example.com/a?gclid=1&mc_cid=2&mc_eid=3", "https://example.com/a"),
    ("https://example.com/a?ref=hn", "https://example.com/a"),
    ("https://example.com/a?b=2&a=1", "https://example.com/a?a=1&b=2"),
    ("https://example.com/a?id=5&utm_campaign=z", "https://example.com/a?id=5"),
    # X / Twitter
    ("https://twitter.com/jack/status/20", "https://x.com/jack/status/20"),
    ("https://mobile.twitter.com/jack/status/20?s=20&t=abc", "https://x.com/jack/status/20"),
    ("https://x.com/jack/status/20?s=46", "https://x.com/jack/status/20"),
    # Instagram
    ("https://www.instagram.com/p/ABC123/?igsh=xyz", "https://instagram.com/p/ABC123"),
    # YouTube
    ("https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ?si=abc&t=30", "https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ("https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ("https://www.youtube.com/watch?feature=x&v=dQw4w9WgXcQ&list=PL1", "https://youtube.com/watch?v=dQw4w9WgXcQ"),
    # Spotify si
    ("https://open.spotify.com/track/123?si=abc", "https://open.spotify.com/track/123"),
]

DISTINCT = [
    ("https://example.com/a", "https://example.com/b"),
    ("https://example.com/A", "https://example.com/a"),  # paths are case-sensitive
    ("https://example.com/a?id=1", "https://example.com/a?id=2"),
    ("https://example.com/search?s=cats", "https://example.com/search"),  # s is real off x.com
    ("https://youtu.be/dQw4w9WgXcQ", "https://youtu.be/aaaaaaaaaaa"),
    ("https://example.com:8080/a", "https://example.com/a"),
]


@pytest.mark.parametrize("a,b", SAME)
def test_equivalent_urls_share_a_key(a, b):
    assert url_key(a) == url_key(b)
    assert url_key(a)


@pytest.mark.parametrize("a,b", DISTINCT)
def test_distinct_urls_keep_distinct_keys(a, b):
    assert url_key(a) != url_key(b)


def test_exact_shapes():
    assert url_key("http://www.Example.com/Path/?utm_source=a#x") == "https://example.com/Path"
    assert url_key("https://youtu.be/dQw4w9WgXcQ") == "https://youtube.com/watch?v=dQw4w9WgXcQ"
    assert url_key("https://example.com/a?b=hello world") == "https://example.com/a?b=hello+world"


@pytest.mark.parametrize("bad", [None, "", "   ", "ftp://example.com/x", "javascript:alert(1)",
                                 "not a url", "https://", 42])
def test_non_urls_have_no_key(bad):
    assert url_key(bad) == ""


def test_hebrew_path_is_stable():
    raw = "https://www.ynet.co.il/כתבה/1"
    encoded = "https://ynet.co.il/%D7%9B%D7%AA%D7%91%D7%94/1"
    assert url_key(raw) == url_key(encoded) == encoded


def test_ts_mirror_lists_match():
    """The TS mirror carries the same tracking-param list (drift guard)."""
    import os
    import re
    ts_path = os.path.join(os.path.dirname(__file__), "..", "..", "web", "lib", "urlKey.ts")
    with open(ts_path, encoding="utf-8") as f:
        ts = f.read()
    from url_key import _TRACKING_PARAMS, _TRACKING_PREFIXES
    block = re.search(r"TRACKING_PARAMS = new Set\(\[(.*?)\]\)", ts, re.S).group(1)
    ts_params = set(re.findall(r"'([^']+)'", block))
    assert ts_params == set(_TRACKING_PARAMS)
    prefixes = re.search(r"TRACKING_PREFIXES = \[(.*?)\]", ts, re.S).group(1)
    assert set(re.findall(r"'([^']+)'", prefixes)) == set(_TRACKING_PREFIXES)


# Hash routes and IDN hosts. The same (input, key) pairs are pinned in
# web/lib/__tests__/urlKey.test.ts so the two normalizers cannot drift.
ROUTE_AND_IDN_CASES = [
    ("https://app.example.com/#/inbox/42", "https://app.example.com#/inbox/42"),
    ("https://app.example.com/#!/post/7/", "https://app.example.com#!/post/7"),
    ("https://example.com/a#/x?y=1", "https://example.com/a#/x?y=1"),
    ("https://example.com/a#/", "https://example.com/a"),
    ("https://example.com/a#!", "https://example.com/a"),
    ("https://example.com/a#top", "https://example.com/a"),
    ("https://example.com/#/a b", "https://example.com#/a%20b"),
    ("https://www.bücher.de/a", "https://xn--bcher-kva.de/a"),
    ("https://xn--bcher-kva.de/a", "https://xn--bcher-kva.de/a"),
]


@pytest.mark.parametrize("raw,key", ROUTE_AND_IDN_CASES)
def test_hash_routes_and_idn_hosts(raw, key):
    assert url_key(raw) == key


def test_distinct_hash_routes_are_distinct_pages():
    assert url_key("https://app.example.com/#/inbox/1") != url_key("https://app.example.com/#/inbox/2")


def test_unencodable_idn_host_never_raises():
    # Python's IDNA 2003 codec rejects a label over 63 chars; the key falls
    # back to the host as given instead of raising.
    assert url_key("https://" + "\u00fc" * 70 + ".de/a").startswith("https://")
