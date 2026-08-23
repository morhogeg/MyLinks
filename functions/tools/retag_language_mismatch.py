"""One-off cleanup: re-tag cards whose tags are in the wrong language.

Until 2026-07-28 the analysis prompt's "PREFER REUSING EXISTING TAGS" clause
could override its own "tags in the content's language" rule, so an English
card could inherit Hebrew tags from the user's vocabulary (e.g. an English
recipe tagged אוכל/מטבח/מתכונים). The prompt is fixed for new saves; this
script repairs the cards already written.

For every card whose tag script disagrees with its title's language (both
directions: Hebrew tags on an English card, Latin-only tags on a Hebrew card),
it asks Gemini for replacement tags in the card's language — preferring the
user's existing same-language vocabulary so filters stay consolidated — and
writes them back.

Owner-run, needs prod credentials:
    GEMINI_API_KEY=... GOOGLE_APPLICATION_CREDENTIALS=... \
        python tools/retag_language_mismatch.py <uid>            # dry run
    python tools/retag_language_mismatch.py <uid> --apply        # write

Public repo ⇒ stdout stays structural (ids + counts); card text is never
printed.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google import genai  # noqa: E402
from google.cloud import firestore  # noqa: E402

from ai_service import GEMINI_ANALYSIS_MODEL  # noqa: E402

PROJECT = "secondbrain-app-94da2"
# Re-tag on the SAME model that analysed the cards in the first place — this
# script rewrites fields Gemini authored, so a different tier would give the
# repaired cards a different voice from every card around them. Imported, not
# copied: ai_service is the one place the model id lives.
RETAG_MODEL = GEMINI_ANALYSIS_MODEL

_RETAG_PROMPT = """The item below is saved in a personal knowledge library. Its tags are in the
wrong language: tags must be written in the SAME language as the item itself.

Item language: {lang}
Title: {title}
Summary: {summary}
Category: {category}
Current (wrong-language) tags: {current_tags}

The user's existing {lang} tag vocabulary (STRONGLY prefer reusing these when
they fit, to keep filters consolidated): {vocab}

Return ONLY a JSON array of 3 to 5 lowercase tags in {lang}, e.g.
["tag one", "tag two", "tag three"]. No prose, no markdown fence."""


def is_hebrew(text: str) -> bool:
    return any("\u0590" <= ch <= "\u05FF" for ch in (text or ""))


def card_lang(data: dict) -> str:
    """'he' or 'en' by title script — same signal reminder_service uses."""
    return "he" if is_hebrew(str(data.get("title", ""))) else "en"


def tag_matches_lang(tag: str, lang: str) -> bool:
    return is_hebrew(tag) == (lang == "he")


def main() -> None:
    argv = [a for a in sys.argv[1:] if a != "--apply"]
    apply = "--apply" in sys.argv
    if len(argv) != 1:
        sys.exit("usage: python tools/retag_language_mismatch.py <uid> [--apply]")
    uid = argv[0]

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    db = firestore.Client(project=PROJECT)
    links = db.collection("users").document(uid).collection("links")

    # Build per-language vocabulary from correctly-tagged cards only.
    vocab = {"he": {}, "en": {}}
    cards = [(doc.id, doc.to_dict() or {}) for doc in links.get()]
    for _, data in cards:
        lang = card_lang(data)
        for tag in data.get("tags") or []:
            if isinstance(tag, str) and tag.strip() and tag_matches_lang(tag, lang):
                vocab[lang][tag] = vocab[lang].get(tag, 0) + 1
    top_vocab = {
        lang: [t for t, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:60]]
        for lang, counts in vocab.items()
    }

    mismatched = [
        (doc_id, data) for doc_id, data in cards
        if (data.get("tags") or [])
        and any(isinstance(t, str) and not tag_matches_lang(t, card_lang(data))
                for t in data.get("tags") or [])
    ]
    print(f"{len(cards)} cards scanned, {len(mismatched)} with wrong-language tags")

    fixed = failed = 0
    for doc_id, data in mismatched:
        lang_name = "Hebrew" if card_lang(data) == "he" else "English"
        prompt = _RETAG_PROMPT.format(
            lang=lang_name,
            title=str(data.get("title", ""))[:300],
            summary=str(data.get("summary", ""))[:1000],
            category=str(data.get("category", "General"))[:60],
            current_tags=json.dumps(data.get("tags") or [], ensure_ascii=False),
            vocab=json.dumps(top_vocab[card_lang(data)], ensure_ascii=False),
        )
        try:
            resp = client.models.generate_content(model=RETAG_MODEL, contents=prompt)
            raw = (resp.text or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            new_tags = json.loads(raw)
            assert (isinstance(new_tags, list) and 1 <= len(new_tags) <= 5
                    and all(isinstance(t, str) and t.strip()
                            and tag_matches_lang(t, card_lang(data)) for t in new_tags))
        except Exception as e:
            failed += 1
            print(f"  {doc_id}: FAILED ({type(e).__name__})")
            continue
        new_tags = [t.strip().lower() for t in new_tags]
        if apply:
            links.document(doc_id).update({"tags": new_tags})
        fixed += 1
        print(f"  {doc_id}: {len(data.get('tags') or [])} tags -> {len(new_tags)} "
              f"({'written' if apply else 'dry run'})")

    print(f"done: {fixed} retagged, {failed} failed{'' if apply else ' (dry run — rerun with --apply)'}")


if __name__ == "__main__":
    main()
