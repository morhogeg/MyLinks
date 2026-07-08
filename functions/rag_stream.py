"""Pure helpers for streaming a grounded RAG answer that ends with a machine-
readable citation marker (`[[CITED: id1, id2]]`).

Schema-constrained JSON can't be streamed token-by-token, so the streaming Ask
path has the model write a plain-text answer followed by the marker, and we hold
back the tail of the stream so a half-arrived marker is never shown to the user.
That buffering + parsing is subtle (off-by-one on the marker prefix leaks "[[" to
the UI), so it lives here as stdlib-only pure functions that can be unit-tested
without the Gemini client.
"""

import re

# The opening literal of the citation marker. We only need to guard the OPEN so
# that no prefix of it ("[", "[[", "[[C", …) is ever streamed as visible text.
CITATION_MARKER = "[[CITED:"


def safe_emit_point(buf: str, marker: str = CITATION_MARKER) -> int:
    """How many leading characters of ``buf`` are safe to stream right now — i.e.
    cannot turn out to be part of an as-yet-incomplete marker at the tail.

    - If the full marker is already present, return its start index (the caller
      handles everything from there specially).
    - Otherwise withhold the longest suffix of ``buf`` that equals a prefix of
      the marker (so "answer.[[CI" streams "answer." and keeps "[[CI" buffered).
    """
    idx = buf.find(marker)
    if idx != -1:
        return idx
    for keep in range(min(len(marker) - 1, len(buf)), 0, -1):
        if buf.endswith(marker[:keep]):
            return len(buf) - keep
    return len(buf)


def parse_citation_marker(text: str) -> list:
    """Extract the ids from a ``[[CITED: id1, id2]]`` marker in ``text``.

    Returns a list of trimmed, non-empty ids, or ``[]`` when the marker is
    absent or unparseable.
    """
    try:
        m = re.search(r"\[\[CITED:(.*?)\]\]", text, re.DOTALL)
        if not m:
            return []
        return [t.strip() for t in m.group(1).split(",") if t.strip()]
    except Exception:
        return []
