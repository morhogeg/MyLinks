"""A question typed into the search bar is searched as the lookup it stands
for (owner report 2026-09-19: "What the best breastfeeding position" found
nothing while Ask surfaced the card instantly). All offline.

  - looks_like_question: the server twin of web/lib/searchIntent.ts.
  - search_topic_of: leading question scaffolding and the trailing "?" go,
    content words stay, lookups are untouched, and an all-framing question
    falls back to itself.
  - apply_same_script_gate(exempt_nearest=True): the judge-approved nearest
    card survives the absolute ceiling for a question query; the cards behind
    it still obey the margin.
  - perform_hybrid_search: the embedding, the keyword scan and the judge all
    receive the TOPIC, and the judge is told the query is a question.
"""

import search as search_mod
from search import (
    apply_same_script_gate,
    looks_like_question,
    perform_hybrid_search,
    search_topic_of,
)


def test_looks_like_question_matches_client_rules():
    assert looks_like_question("What the best breastfeeding position")
    assert looks_like_question("focus tips?")
    assert looks_like_question("מה למדתי על שינה")
    assert not looks_like_question("how")            # one word is a lookup
    assert not looks_like_question("pasta recipe")
    assert not looks_like_question("Breastfeeding positioning")


def test_topic_strips_question_scaffolding():
    assert search_topic_of("What the best breastfeeding position") == "breastfeeding position"
    assert search_topic_of("What is the best breastfeeding position?") == "breastfeeding position"
    assert search_topic_of("how do I focus at work?") == "focus at work"
    assert search_topic_of("Can you tell me about sourdough starter") == "sourdough starter"
    assert search_topic_of("מה למדתי על שינה") == "שינה"


def test_topic_keeps_content_words_in_the_middle():
    # "best" is framing at the front, content in the middle.
    assert search_topic_of("What is the best of both worlds") == "both worlds"
    assert search_topic_of("Why does Gordon Ramsay shout?") == "Gordon Ramsay shout"


def test_topic_strips_leading_framing_from_lookups_too():
    # Not a question, but "best" is on no card and the AND would sink it.
    assert search_topic_of("Best breastfeeding positions") == "breastfeeding positions"
    assert search_topic_of("best pasta recipe") == "pasta recipe"
    assert search_topic_of("הכי טוב מתכון פסטה") == "מתכון פסטה"


def test_topic_leaves_plain_lookups_alone():
    assert search_topic_of("Breastfeeding positioning") == "Breastfeeding positioning"
    assert search_topic_of("pasta recipe?") == "pasta recipe"   # only the "?" goes
    assert search_topic_of("גורדון") == "גורדון"
    assert search_topic_of("Gordon Ramsay") == "Gordon Ramsay"


def test_topic_falls_back_when_a_lookup_is_all_framing():
    assert search_topic_of("the best") == "the best"


def test_token_matches_inflected_forms_of_long_words():
    from search import token_in_text
    assert token_in_text("positions", "Breastfeeding Positioning and Latching")
    assert token_in_text("position", "Breastfeeding Positioning and Latching")
    assert token_in_text("sleep", "sleeping well")
    assert token_in_text("train", "trained hard")     # 5 letters: -ed allowed
    assert not token_in_text("art", "the artist")     # short tokens stay exact
    assert not token_in_text("ערב", "התערבות")         # Hebrew rule untouched


def test_topic_falls_back_when_nothing_is_left():
    assert search_topic_of("What is the best?") == "What is the best?"
    assert search_topic_of("how do I?") == "how do I?"


def _cands(*dists):
    return [{"id": f"c{i}", "vector_distance": d} for i, d in enumerate(dists)]


def test_same_script_gate_exempts_nearest_only_for_questions():
    # Best hit sits over the 0.68 ceiling — the shape of a sentence query.
    cands = _cands(0.71, 0.74, 0.90)
    verdict = [(0, "Breastfeeding Positioning"), (1, "Latching"), (2, "Newborn sleep")]
    # Lookup rule: the ceiling drops everything.
    assert apply_same_script_gate("breastfeeding position", cands, verdict) == []
    # Question rule: the nearest survives; the rest still obey margin + ceiling.
    assert apply_same_script_gate("breastfeeding position", cands, verdict,
                                  exempt_nearest=True) == [0]


def test_same_script_gate_exemption_needs_a_judge_verdict():
    cands = _cands(0.71, 0.74)
    # The judge kept only card 2: the nearest is NOT exempt unless it was kept.
    assert apply_same_script_gate("x", cands, [(1, "far")], exempt_nearest=True) == []


def test_hybrid_search_feeds_the_topic_to_every_half(monkeypatch):
    seen = {}

    def fake_vector(uid, query_text, limit):
        seen["vector"] = query_text
        return [{"id": "card", "title": "Breastfeeding Positioning", "vector_distance": 0.6}]

    def fake_keyword(uid, query_text, exclude_ids, limit, fields):
        seen["keyword"] = query_text
        return []

    def fake_judge(query_text, candidates, **kw):
        seen["judge"] = query_text
        seen["exempt"] = kw.get("exempt_nearest")
        return list(candidates)

    monkeypatch.setattr(search_mod, "perform_search_logic", fake_vector)
    monkeypatch.setattr(search_mod, "keyword_scan_cards", fake_keyword)
    monkeypatch.setattr(search_mod, "judge_relevance", fake_judge)

    out = perform_hybrid_search("u", "What the best breastfeeding position")
    assert [r["id"] for r in out] == ["card"]
    assert seen == {"vector": "breastfeeding position", "keyword": "breastfeeding position",
                    "judge": "breastfeeding position", "exempt": True}

    seen.clear()
    perform_hybrid_search("u", "pasta")
    assert seen["vector"] == seen["keyword"] == seen["judge"] == "pasta"
    assert seen["exempt"] is False

    seen.clear()
    perform_hybrid_search("u", "Best breastfeeding positions")
    assert seen["vector"] == "breastfeeding positions"
    assert seen["exempt"] is False   # a lookup: no ceiling exemption


# ── 2026-09-19 round 4: "Latching tips" ─────────────────────────────────────
from search import content_tokens


def test_content_tokens_drop_descriptors_anywhere():
    assert content_tokens("Latching tips") == {"latching"}
    assert content_tokens("sourdough starter guide") == {"sourdough", "starter"}
    assert content_tokens("טיפים להנקה") == {"להנקה"}
    # Nothing left → the framing words themselves are the lookup.
    assert content_tokens("best tips") == {"best", "tips"}


def test_hybrid_literal_extra_ignores_descriptor_words(monkeypatch):
    # The judge kept nothing (or was down); the literal scan must still
    # return the card whose title carries the one content word.
    monkeypatch.setattr(search_mod, "judge_relevance", lambda q, c, **kw: [])
    monkeypatch.setattr(search_mod, "perform_search_logic", lambda uid, q, limit: [])
    monkeypatch.setattr(search_mod, "keyword_scan_cards",
                        lambda uid, q, exclude_ids=None, limit=10, fields=None: [
                            {"id": "card", "title": "Breastfeeding Positioning and Latching Techniques",
                             "tags": ["latching"], "createdAt": 1}])
    out = [c["id"] for c in perform_hybrid_search("u", "Latching tips", limit=20)]
    assert out == ["card"]
    monkeypatch.setattr(search_mod, "judge_relevance", lambda q, c, **kw: None)
    out = [c["id"] for c in perform_hybrid_search("u", "Latching tips", limit=20)]
    assert out == ["card"]
