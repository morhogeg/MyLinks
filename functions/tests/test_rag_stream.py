"""Tests for rag_stream — the streaming-Ask citation-marker buffering/parsing
(SOURCE_OF_TRUTH §11 B3/B7). The subtle bit is that no prefix of the marker
("[[", "[[C", …) may ever be streamed to the user as visible text."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag_stream import CITATION_MARKER, safe_emit_point, parse_citation_marker


class TestSafeEmitPoint(unittest.TestCase):
    def test_plain_text_fully_emittable(self):
        buf = "The answer is 42."
        self.assertEqual(safe_emit_point(buf), len(buf))

    def test_withholds_partial_marker_prefix_at_tail(self):
        # "answer.[[CI" — the "[[CI" tail could be the start of the marker.
        buf = "answer.[[CI"
        self.assertEqual(safe_emit_point(buf), len("answer."))

    def test_single_open_bracket_tail_is_withheld(self):
        buf = "done ["
        self.assertEqual(safe_emit_point(buf), len("done "))

    def test_full_marker_returns_its_start(self):
        buf = "the body [[CITED: a, b]]"
        self.assertEqual(safe_emit_point(buf), len("the body "))

    def test_bracket_in_middle_not_a_marker(self):
        # A "[" that is NOT a marker prefix at the tail is safe to emit.
        buf = "array[0] is first"
        self.assertEqual(safe_emit_point(buf), len(buf))

    def test_never_emits_a_marker_prefix(self):
        # Simulate streaming char-by-char and assert the marker's opening never
        # appears in the visible (emitted) text.
        full = "Here is the answer.\n[[CITED: id1, id2]]"
        emitted = ""
        buffer = ""
        marker_seen = False
        for ch in full:
            buffer += ch
            if marker_seen:
                continue
            idx = buffer.find(CITATION_MARKER)
            if idx != -1:
                emitted += buffer[:idx]
                marker_seen = True
                buffer = ""
                continue
            cut = safe_emit_point(buffer)
            emitted += buffer[:cut]
            buffer = buffer[cut:]
        self.assertNotIn("[[", emitted)
        self.assertNotIn("CITED", emitted)
        self.assertEqual(emitted, "Here is the answer.\n")


class TestParseCitationMarker(unittest.TestCase):
    def test_parses_ids(self):
        self.assertEqual(
            parse_citation_marker("body\n[[CITED: a1, b2 , c3]]"),
            ["a1", "b2", "c3"],
        )

    def test_missing_marker_returns_empty(self):
        self.assertEqual(parse_citation_marker("just an answer, no marker"), [])

    def test_empty_marker_returns_empty(self):
        self.assertEqual(parse_citation_marker("x [[CITED: ]]"), [])

    def test_uses_the_marker_even_across_newlines(self):
        self.assertEqual(parse_citation_marker("a\n\n[[CITED:\nid1,\nid2\n]]"), ["id1", "id2"])


if __name__ == "__main__":
    unittest.main()
