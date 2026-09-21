#!/usr/bin/env python3
"""Check CAMPAIGN.md against its own house rules.

Run from anywhere: `python3 marketing/x-launch/verify.py`. Exit 1 on any
violation. Checks: every tweet (thread parts split on a `~` line) and every
first comment under 280 characters; no em dash anywhere in the file; no banned
phrase in any tweet, first comment, or reply-playbook reply; "finally" only in
the three places the tagline is allowed; "bookmarks" only as the name of a file
you import from.
"""
import re
import sys
from pathlib import Path

DOC = Path(__file__).with_name("CAMPAIGN.md")
LIMIT = 280
BANNED = ("Machina AI", "second brain", "AI-powered", "bookmark manager")
TAGLINE = "Everything you save, finally useful."


def main() -> int:
    text = DOC.read_text(encoding="utf-8")
    errors = []

    if "\u2014" in text:
        for n, line in enumerate(text.splitlines(), 1):
            if "\u2014" in line:
                errors.append(f"line {n}: em dash")

    tweets = []
    for i, block in enumerate(re.findall(r"```tweet\n(.*?)```", text, re.S), 1):
        for j, part in enumerate(block.split("\n~\n"), 1):
            tweets.append((f"tweet block {i} part {j}", part.strip()))

    comments = [
        (f"first comment {i}", m)
        for i, m in enumerate(re.findall(r"\*\*First comment[^:]*:\*\* `([^`]+)`", text), 1)
    ]
    playbook = text.split("**The reply playbook.**", 1)[1].split("**After T31.**", 1)[0]
    replies = [
        (f"playbook reply {i}", m)
        for i, m in enumerate(re.findall(r"^\| [^|]+ \| `([^`]+)` \|$", playbook, re.M), 1)
    ]

    posts = tweets + comments + replies
    for name, body in posts:
        n = len(body)
        if n > LIMIT:
            errors.append(f"{name}: {n} chars (limit {LIMIT})")
        low = body.lower()
        for b in BANNED:
            if b.lower() in low:
                errors.append(f"{name}: banned phrase {b!r}")
        if "bookmark" in low and "browser bookmarks" not in low and "bookmarks (.html)" not in low and "chrome bookmarks" not in low:
            errors.append(f"{name}: 'bookmark' outside the import-file sense")
        if "finally" in low and TAGLINE not in body:
            errors.append(f"{name}: 'finally' outside the tagline")

    what_it_is = (
        "everything you save", "everything you saved", "one place", "your saves",
        "what you saved", "your own saves", "everything you have saved",
        "everything you have kept", "everything you have already kept",
    )
    for name, body in tweets:
        low = body.lower()
        if "machina" not in low:
            errors.append(f"{name}: does not name Machina")
        if not any(w in low for w in what_it_is):
            errors.append(f"{name}: does not say what Machina is")

    tagline_posts = [name for name, body in posts if TAGLINE in body]
    if len(tagline_posts) != 2:
        errors.append(f"tagline should appear in exactly 2 posts (thread close + T31), found {tagline_posts}")

    for e in errors:
        print("FAIL", e)
    print(f"checked {len(tweets)} tweets, {len(comments)} first comments, {len(replies)} playbook replies")
    if not errors:
        longest = max(posts, key=lambda p: len(p[1]))
        print(f"OK, longest is {longest[0]} at {len(longest[1])} chars")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
