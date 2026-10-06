"""The analysis prompt's tag/category vocabulary is built on the server
(launch audit PRIV-1).

The app used to send it, read from its newest cards including private ones,
and /api/analyze and /api/analyze-image put it into the Gemini prompt
unfiltered: a tag that exists only on a private card reached Google. With a
known caller the server now builds it (private cards left out) and ignores the
client's lists.
"""

import inspect

import main


def test_a_known_caller_gets_the_server_vocabulary(monkeypatch):
    monkeypatch.setattr(main, "get_user_vocabulary", lambda uid: (["baking"], ["Food"]))
    tags, cats = main._prompt_vocabulary("ws-1", ["divorce-lawyer"], ["Legal"])
    assert (tags, cats) == (["baking"], ["Food"])


def test_a_failed_read_sends_no_vocabulary_never_the_clients(monkeypatch):
    def boom(uid):
        raise RuntimeError("UNAVAILABLE")
    monkeypatch.setattr(main, "get_user_vocabulary", boom)
    assert main._prompt_vocabulary("ws-1", ["divorce-lawyer"], ["Legal"]) == ([], [])


def test_without_a_caller_the_sanitized_client_lists_stand():
    assert main._prompt_vocabulary(None, ["a"], ["B"]) == (["a"], ["B"])


def test_every_synchronous_analysis_uses_it():
    """Each sync analyze path resolves the vocabulary through _prompt_vocabulary
    before calling Gemini."""
    link_src = inspect.getsource(main.analyze_link)
    image_src = inspect.getsource(main.analyze_image)
    for src, call in ((link_src, "ai.analyze_text(note_text"), (link_src, "_analyze_scraped(ai, scraped"),
                      (image_src, "ai.analyze_image(image_bytes")):
        at = src.index(call)
        assert "_prompt_vocabulary(" in src[max(0, at - 400):at], call


def test_a_heading_only_note_refresh_skips_the_vocabulary_read():
    """The app's note EDIT only takes the new heading, so it sends
    skipVocabulary and the server reads no cards for it (WEB-21)."""
    src = inspect.getsource(main.analyze_link)
    at = src.index("ai.analyze_text(note_text")
    window = src[max(0, at - 600):at]
    assert "data.get('skipVocabulary') is True" in window
    assert "note_tags, note_cats = [], []" in window
