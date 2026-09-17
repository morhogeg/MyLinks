"""Regex scans over raw page HTML must stay linear on hostile input.

A LinkedIn short link (lnkd.in/…) redirects wherever its creator points it, so
`_scrape_linkedin_url` runs its og/meta/JSON-LD scans on attacker HTML up to
the 10 MB body cap. The original patterns (`<meta[^>]+…`, a lazy
`(.*?)</script>`, `"owner"\\s*:\\s*\\{[^}]*?`) were quadratic in the number of
half-open tags: ~24 s at 180 KB, hours at 10 MB, one instance pinned per URL.
"""

import time

import pytest

import scraper


def _timed(fn, *args, budget=1.0):
    t0 = time.monotonic()
    out = fn(*args)
    assert time.monotonic() - t0 < budget, f"{fn.__name__} took too long"
    return out


def test_unclosed_meta_tags_are_linear():
    html = "<meta " * 200_000  # 1.2 MB of half-open tags
    _timed(scraper._linkedin_wrapped_name, html)
    _timed(scraper._linkedin_ldjson_fields, html)


def test_unclosed_ldjson_scripts_are_linear():
    html = '<script type="application/ld+json">' * 30_000
    _timed(scraper._linkedin_ldjson_fields, html)
    _timed(scraper._linkedin_wrapped_name, html)


def test_unclosed_owner_objects_are_linear():
    html = '"owner":{' * 100_000
    _timed(scraper._extract_instagram_handle, "https://www.instagram.com/p/abc/", html)


def test_ten_megabyte_body_is_sliced_before_scanning():
    html = "<meta " * 1_700_000  # ~10 MB, the safe_get cap
    _timed(scraper._linkedin_wrapped_name, html)


def test_real_ldjson_still_parses():
    html = (
        '<html><head><meta property="og:title" content="Jane Doe on LinkedIn: hi">'
        '<script type="application/ld+json">'
        '{"author":{"name":"Jane Doe"},"articleBody":"Body text"}</script>'
        '<script type="application/ld+json">[{"x":1}]</script></head></html>'
    )
    assert scraper._linkedin_ldjson_fields(html) == ("Jane Doe", "Body text")
    assert len(scraper._ldjson_blocks(html)) == 2


def test_ldjson_walk_stops_at_first_unclosed_script():
    html = ('<script type="application/ld+json">{"a":1}</script>'
            '<script type="application/ld+json">{"never closed"')
    assert scraper._ldjson_blocks(html) == ['{"a":1}']
