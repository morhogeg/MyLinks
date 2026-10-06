"""Scraper resource limits (launch audit CAP-4).

BeautifulSoup costs ~80 MB of memory per MB of dense markup, and the fetch
cap is 10 MB: parsing whole pages ran the functions out of memory, which
skips the refund. Only the first MAX_PARSE_BYTES are parsed, cut on a UTF-8
boundary so a Hebrew page never turns into mojibake.
"""

import pytest

import scraper


class _FakeResponse:
    def __init__(self, content: bytes, content_type="text/html; charset=utf-8"):
        self.content = content
        self.text = content.decode("utf-8", errors="replace")
        self.headers = {"Content-Type": content_type}
        self.status_code = 200
        self.ok = True
        self.url = "https://example.com/big"

    def raise_for_status(self):
        return None


@pytest.fixture(autouse=True)
def _no_ssrf_guard(monkeypatch):
    monkeypatch.setattr(scraper, "validate_public_url", lambda url: None)


def test_parse_slice_cuts_on_a_utf8_character_boundary(monkeypatch):
    content = ("a" + "א" * 20).encode("utf-8")   # 'a' then 2-byte letters
    # A cut inside a letter drops that letter...
    monkeypatch.setattr(scraper, "MAX_PARSE_BYTES", 12)
    assert scraper._parse_slice(content) == ("a" + "א" * 5).encode("utf-8")
    # ...a cut on a boundary keeps every byte.
    monkeypatch.setattr(scraper, "MAX_PARSE_BYTES", 11)
    assert scraper._parse_slice(content) == ("a" + "א" * 5).encode("utf-8")
    # 3- and 4-byte characters too.
    for ch in ("例", "😀"):
        text = ("ab" + ch * 10).encode("utf-8")
        for n in range(3, 20):
            monkeypatch.setattr(scraper, "MAX_PARSE_BYTES", n)
            cut = scraper._parse_slice(text)
            assert len(cut) <= n and len(cut) > n - len(ch.encode())
            cut.decode("utf-8")                  # strict: never a split character
    assert scraper._parse_slice(b"short") == b"short"


def test_only_the_first_slice_of_a_huge_page_is_parsed(monkeypatch):
    bs4 = pytest.importorskip("bs4")
    seen = []
    real = bs4.BeautifulSoup

    def spy(markup, *a, **k):
        seen.append(len(markup))
        return real(markup, *a, **k)

    monkeypatch.setattr(bs4, "BeautifulSoup", spy)
    # A smaller cap keeps the test fast; the mechanism is the same at 2 MB.
    monkeypatch.setattr(scraper, "MAX_PARSE_BYTES", 300_000)
    article = "<p>" + ("A real sentence with plenty of words in it. " * 40) + "</p>"
    page = ("<html><head><title>Big list</title></head><body>" + article
            + "<ul>" + "<li>x</li>" * 100_000 + "</ul></body></html>").encode("utf-8")
    assert len(page) > 3 * scraper.MAX_PARSE_BYTES
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(page))
    result = scraper.scrape_url("https://example.com/big")
    assert seen and max(seen) <= scraper.MAX_PARSE_BYTES
    assert result["title"] == "Big list"
    assert "A real sentence" in result["text"]
    assert len(result["html"]) <= scraper._MAX_RETURNED_HTML


def test_a_hebrew_page_cut_mid_character_still_reads_as_hebrew(monkeypatch):
    pytest.importorskip("bs4")
    body = "<p>" + ("זהו משפט אמיתי עם הרבה מילים בתוכו. " * 30) + "</p>"
    page = ('<html><head><meta charset="utf-8"><title>כותרת</title></head><body>'
            + body * 4 + "</body></html>").encode("utf-8")
    # Put the cut inside a two-byte letter.
    cut_at = page.index("משפט".encode("utf-8"), 2000) + 1
    monkeypatch.setattr(scraper, "MAX_PARSE_BYTES", cut_at)
    monkeypatch.setattr(scraper, "safe_get", lambda *a, **k: _FakeResponse(page))
    result = scraper.scrape_url("https://example.co.il/post")
    assert "זהו משפט אמיתי" in result["text"]
    assert "×" not in result["text"]             # windows-1252 mojibake marker
