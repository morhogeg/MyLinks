"""How `ask_brain` carries CONVERSATION context into a follow-up turn — what it
retrieves for, and which language it answers in.

The pure helpers (`search.followup_retrieval_query`, `conversation_language`)
are unit-tested in test_ask_retrieval.py; these tests cover the WIRING at the
endpoint — that the right text reaches every retrieval-steering call and the
right language reaches the prompt, while the MODEL is still asked the raw
question plus history.

Two owner-reported failures, both from 2026-07-25 and both "the turn was read
in isolation instead of as part of a conversation":
  - an English answer about a saved maple cake recipe, then the follow-up
    "בעברית" ("in Hebrew") — retrieval embedded those two meta words, returned
    topically random cards, and the model said the library holds nothing on the
    recipe it had just cited on screen;
  - a Hebrew thread about a Pardes Hanna café that flipped to English the
    moment a suggestion chip (Machina's own English boilerplate) was tapped;
  - `מי פירסם את זה?` ("who published this?") one turn after an answer that
    cited a LinkedIn card — real content words, so the meta-vocabulary gate
    passed it through, and it retrieved for "who published" and reported the
    card was not in the library;
  - `בעברית, בקצרה` after an answer about a Breaking Bad clip, which came back
    in fluent, brief Hebrew — about an unrelated Operation Entebbe card. That
    one was NOT retrieval: the prompt's standing "follow-ups must add value —
    never restate an earlier answer in different words" rule reads as an
    instruction to go find a different source, and a restate request is exactly
    what it forbids. The model obeyed. Hence `followup` reaching the prompt.

conftest installs the offline fakes so `import main` works with plain pytest;
Firestore, the embedding API, and Gemini are all stubbed at the main boundary.
"""

import json

import pytest

import main


_ASKED = 'Why is "מתכון לעוגת מייפל עסיסית" worth my time?'
_HISTORY = [
    {"role": "user", "content": _ASKED},
    {"role": "assistant", "content": "The maple cake is worth your time because…"},
]

_RECIPE_CARD = {"id": "cake", "title": "מתכון לעוגת מייפל עסיסית",
                "category": "Food", "summary": "A moist maple cake."}
# A card retrieval will NOT return for the follow-up — it only comes back
# because the client said the last answer cited it.
_CITED_CARD = {"id": "linkedin", "title": "Anthropic Introduces Three-Tiered "
               "Claude Certification Program", "category": "Tech",
               "summary": "Three certification tracks.", "sourceName": "Claude for Business"}
_LIBRARY = {c["id"]: c for c in (_RECIPE_CARD, _CITED_CARD)}


class _Resp:
    """Capturing stand-in for https_fn.Response (same shim as test_search_http)."""

    def __init__(self, body="", status=200, headers=None, mimetype=None):
        self.body = body
        self.status = status
        self.headers = headers or {}
        self.mimetype = mimetype


class _Req:
    def __init__(self, method="POST", json_body=None, headers=None, remote_addr="1.2.3.4"):
        self.method = method
        self._json = json_body
        self.headers = headers or {}
        self.remote_addr = remote_addr

    def get_json(self, silent=False):
        return self._json


@pytest.fixture
def seen(monkeypatch):
    """Stub every outward call ask_brain makes and record what retrieval saw."""
    calls = {"search": [], "rerank": [], "keyword": [], "asked": [], "byIds": []}

    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "check_and_increment_quota", lambda *a, **k: (True, 1))

    def fake_search(uid, query_text, limit=30):
        calls["search"].append(query_text)
        return [_RECIPE_CARD]

    def fake_rerank(query_text, candidates, top_k=10):
        calls["rerank"].append(query_text)
        return list(candidates)

    def fake_keyword(uid, query_text, exclude_ids=None, limit=5):
        calls["keyword"].append(query_text)
        return []

    monkeypatch.setattr(main, "perform_search_logic", fake_search)
    monkeypatch.setattr(main, "rerank_candidates", fake_rerank)
    monkeypatch.setattr(main, "keyword_scan_cards", fake_keyword)
    monkeypatch.setattr(main, "apply_distance_threshold", lambda r, **k: r)
    monkeypatch.setattr(main, "private_collection_ids", lambda uid: set())

    def fake_by_ids(uid, ids):
        calls["byIds"].append(list(ids))
        return [_LIBRARY[i] for i in ids if i in _LIBRARY]

    monkeypatch.setattr(main, "cards_by_ids", fake_by_ids)

    class _FakeGemini:
        def answer_from_context_stream(self, question, cards, history=None, **kwargs):
            calls["asked"].append({"question": question, "history": history,
                                   "cardIds": [c["id"] for c in cards],
                                   "answerLanguage": kwargs.get("answer_language"),
                                   "followup": kwargs.get("followup"),
                                   "stream": True})
            yield ("token", "…")
            yield ("citedIds", [c["id"] for c in cards])

        def answer_from_context(self, question, cards, history=None, **kwargs):
            calls["asked"].append({"question": question, "history": history,
                                   "cardIds": [c["id"] for c in cards],
                                   "answerLanguage": kwargs.get("answer_language"),
                                   "followup": kwargs.get("followup")})
            return {"answer": "…", "citedIds": [c["id"] for c in cards]}

    monkeypatch.setattr(main, "GeminiService", _FakeGemini)
    return calls


def _ask(question, history=None, hints=None, context_ids=None, generated=None):
    body = {"uid": "user1", "question": question, "history": history or []}
    if hints:
        body["hints"] = hints
    if context_ids is not None:
        body["contextIds"] = context_ids
    if generated is not None:
        body["generated"] = generated
    return main.ask_brain(_Req(json_body=body))


def test_context_free_followup_retrieves_for_the_prior_question(seen):
    resp = _ask("בעברית", _HISTORY)

    assert resp.status == 200
    # Every retrieval-steering call sees the topic, not the two meta words.
    assert seen["search"] == [_ASKED]
    assert seen["rerank"] == [_ASKED]
    assert seen["keyword"] == [_ASKED]
    # …so the recipe card is in context and can be cited, which is the whole
    # point: the answer must not contradict the sources shown a turn earlier.
    assert json.loads(resp.body)["citedIds"] == ["cake"]


def test_the_model_is_still_asked_the_raw_question_and_history(seen):
    _ask("בעברית", _HISTORY)

    # Retrieval was steered; GENERATION was not. The model must still see the
    # literal follow-up (it's the instruction — answer in Hebrew) and the
    # conversation, or the swap would silently rewrite the user's request.
    asked = seen["asked"][0]
    assert asked["question"] == "בעברית"
    assert asked["history"] == _HISTORY
    assert asked["cardIds"] == ["cake"]


def test_a_normal_question_retrieves_for_itself_unchanged(seen):
    # The safety property, at the endpoint: a question with a topic of its own
    # is routed EXACTLY as before, whether or not a conversation precedes it.
    _ask("What did I save about Italy?", _HISTORY)
    assert seen["search"] == ["What did I save about Italy?"]
    assert seen["rerank"] == ["What did I save about Italy?"]
    assert seen["asked"][0]["question"] == "What did I save about Italy?"


def test_first_question_of_a_conversation_is_untouched(seen):
    _ask(_ASKED, [])
    assert seen["search"] == [_ASKED]
    assert seen["asked"][0]["question"] == _ASKED


# ── Answer language: a tapped chip must not change the thread's language ────
#
# Owner report (2026-07-25): a Hebrew question about a Pardes Hanna café was
# answered in Hebrew, then the chip 'Give me more detail on "<Hebrew title>"'
# — Machina's own English boilerplate — answered entirely in English.

_HE_ASKED = "אני צריך בית קפה בפרדס חנה"
_HE_HISTORY = [
    {"role": "user", "content": _HE_ASKED},
    {"role": "assistant", "content": 'בפרדס חנה מומלץ לבקר ב"קפה בחורשה"'},
]
_CHIP = 'Give me more detail on "5 מקומות מומלצים בפרדס חנה"'
# Chips always carry their structured intent; typed questions never do, which
# is what makes `hints` a reliable "the app composed this" marker.
_CHIP_HINTS = {"anchorTitles": ["5 מקומות מומלצים בפרדס חנה"]}


def test_chip_in_a_hebrew_thread_is_answered_in_hebrew(seen):
    resp = _ask(_CHIP, _HE_HISTORY, hints=_CHIP_HINTS)

    assert resp.status == 200
    assert seen["asked"][0]["answerLanguage"] == "Hebrew"
    # The chip's own wording still goes to the model verbatim — only the
    # language is pinned, not the request.
    assert seen["asked"][0]["question"] == _CHIP


def test_a_typed_english_question_is_never_pinned(seen):
    # No hints = the user typed it, so their words are a real language choice
    # and the existing judge-from-the-question rule must stay in charge —
    # including switching a Hebrew thread to English.
    _ask("Give me more detail on that", _HE_HISTORY)
    assert seen["asked"][0]["answerLanguage"] is None


def test_chip_in_an_english_thread_is_not_pinned(seen):
    history = [
        {"role": "user", "content": "What did I save about coffee?"},
        {"role": "assistant", "content": "You saved…"},
    ]
    _ask(_CHIP, history, hints=_CHIP_HINTS)
    assert seen["asked"][0]["answerLanguage"] is None


def test_a_chip_that_opens_a_conversation_is_not_pinned(seen):
    # Nothing has been established yet — the chip's own language is all there
    # is, exactly as before.
    _ask(_CHIP, [], hints=_CHIP_HINTS)
    assert seen["asked"][0]["answerLanguage"] is None


# ── Referential follow-ups reach the card they point at ────────────────────

_KEY_POINTS = ('Key points from "Anthropic Introduces Three-Tiered Claude '
               'Certification Program"')
_LINKEDIN_HISTORY = [
    {"role": "user", "content": _KEY_POINTS},
    {"role": "assistant", "content": "The new certification program establishes…"},
]


def test_who_published_this_retrieves_for_the_card_being_discussed(seen):
    resp = _ask("מי פירסם את זה?", _LINKEDIN_HISTORY)

    assert resp.status == 200
    # The subject is prepended and the question kept, so retrieval sees the
    # card's title (which also pins it) without losing the user's words.
    for got in (seen["search"][0], seen["rerank"][0]):
        assert got.startswith(_KEY_POINTS)
        assert "מי פירסם את זה?" in got
    # The card is in context, so the answer can name the publisher instead of
    # claiming the library has nothing on it.
    assert json.loads(resp.body)["citedIds"] == ["cake"]


def test_a_question_that_states_its_subject_is_still_untouched(seen):
    # The guard on the rescue above: stating a topic keeps retrieval exactly
    # where it was, conversation or not.
    _ask("What did I save about Italy?", _LINKEDIN_HISTORY)
    assert seen["search"] == ["What did I save about Italy?"]


# ── The conversation guarantee: previously-cited cards are always reachable ─
#
# Everything above infers the subject from the question's prose, which is the
# one thing a follow-up doesn't state. `contextIds` is not an inference — it is
# the exact set of ids the client rendered as source chips — so it holds even
# for follow-ups no heuristic can classify.

_PLAIN_FOLLOWUP_HISTORY = [
    {"role": "user", "content": "What did I save about Claude certifications?"},
    {"role": "assistant", "content": "Three tracks…"},
]


# A conversation whose prior question names no card title, so nothing competes
# with the cited card for the front of the context.
_UNQUOTED_HISTORY = [
    {"role": "user", "content": "What did I save about Claude certifications?"},
    {"role": "assistant", "content": "Three tracks…"},
]


def test_cited_cards_are_pinned_to_the_front_of_a_followup(seen):
    resp = _ask("בעברית", _UNQUOTED_HISTORY, context_ids=["linkedin"])

    assert resp.status == 200
    # Retrieval never returned it; it is here purely because it was cited.
    assert seen["byIds"] == [["linkedin"]]
    # Pinned FIRST — a follow-up is about what was just discussed, and the
    # deep-content window (which carries recipe steps, highlights, detail)
    # only covers the head of the list.
    assert seen["asked"][0]["cardIds"][0] == "linkedin"


def test_an_explicitly_quoted_title_outranks_the_cited_card(seen):
    # Precedence, stated: when the resolved question NAMES a card ("…gist of
    # \"X\"?") that title is the most specific statement of subject there is, so
    # it leads — but the cited card is still in context, which is the guarantee.
    # In practice these are the same card; this pins down what happens when the
    # conversation drifted and they aren't.
    _ask("בעברית", _HISTORY, context_ids=["linkedin"])
    ids = seen["asked"][0]["cardIds"]
    assert ids[0] == "cake"          # the quoted anchor from the prior question
    assert "linkedin" in ids         # the cited card is still reachable


def test_the_guarantee_holds_for_a_followup_no_heuristic_can_classify(seen):
    # "Who published" with no pointer word and no meta vocabulary — it reads as
    # a topical question, so the query is NOT resolved against the conversation.
    # The ids still put the discussed card in context, which is the whole point
    # of sending them: no phrasing can defeat an exact set.
    resp = _ask("who published", _PLAIN_FOLLOWUP_HISTORY, context_ids=["linkedin"])

    assert resp.status == 200
    assert seen["search"] == ["who published"]          # query untouched
    assert "linkedin" in seen["asked"][0]["cardIds"]    # card present anyway


def test_a_new_topic_keeps_cited_cards_at_the_back(seen):
    # Not a follow-up: the discussed card stays available but must not crowd
    # out the cards the new question actually retrieved.
    _ask("What did I save about Italy?", _HISTORY, context_ids=["linkedin"])
    ids = seen["asked"][0]["cardIds"]
    assert ids[0] == "cake"
    assert ids[-1] == "linkedin"


def test_a_cited_card_already_retrieved_is_not_fetched_twice(seen):
    # It's already in context — no extra Firestore read, no duplicate card.
    _ask("בעברית", _HISTORY, context_ids=["cake"])
    assert seen["byIds"] == []
    assert seen["asked"][0]["cardIds"] == ["cake"]


def test_malformed_context_ids_are_dropped_not_errored(seen):
    for bad in ("not a list", [None, 7, ""], [{"id": "x"}]):
        resp = _ask("בעברית", _HISTORY, context_ids=bad)
        assert resp.status == 200
    assert seen["byIds"] == []


def test_the_explicit_generated_flag_pins_the_language(seen):
    # Newer clients say outright that the app composed the question, instead of
    # the backend inferring it from the presence of chip hints.
    _ask(_CHIP, _HE_HISTORY, generated=True)
    assert seen["asked"][0]["answerLanguage"] == "Hebrew"


def test_marked_typed_turns_let_the_user_switch_language(seen):
    # With per-turn markers the backend can see that the user's LAST typed turn
    # was English, so a chip after it must not drag the thread back to Hebrew.
    history = [
        {"role": "user", "content": "אני צריך בית קפה בפרדס חנה"},
        {"role": "assistant", "content": "…"},
        {"role": "user", "content": "Actually, what did I save about coffee?"},
        {"role": "assistant", "content": "…"},
    ]
    _ask(_CHIP, history, generated=True)
    assert seen["asked"][0]["answerLanguage"] is None


# ── The prompt is told what the follow-up is about ─────────────────────────

def test_a_restate_followup_reaches_the_prompt_as_one(seen):
    # Retrieval was never the whole story here: the prompt's standing
    # "follow-ups must add value" rule reads as "find a different source", so
    # the model must be told this turn wants the SAME source restated.
    _ask("בעברית, בקצרה", _HISTORY)
    f = seen["asked"][0]["followup"]
    assert f["subject"] == _ASKED
    assert f["restate"] is True


def test_a_referential_followup_is_not_marked_restate(seen):
    _ask("מי פירסם את זה?", _HISTORY)
    f = seen["asked"][0]["followup"]
    assert f["subject"] == _ASKED
    assert f["restate"] is False


def test_an_ordinary_question_carries_no_subject(seen):
    _ask("What did I save about Italy?", _HISTORY)
    f = seen["asked"][0]["followup"]
    assert f["subject"] is None
    assert f["restate"] is False


# ── "What else" must not be answered with what was just discussed ──────────

def test_what_else_does_not_pin_the_just_discussed_cards(seen):
    # A follow-up AND an exclusion at once. Round 3's front-pin and the
    # exclusion demote pull in opposite directions; the exclusion has to win,
    # or "what else" re-presents the card the user is trying to move past.
    _ask("what else besides this?", _HISTORY, context_ids=["linkedin"])
    ids = seen["asked"][0]["cardIds"]
    assert ids[0] != "linkedin", "just-discussed card must not headline a what-else answer"


def test_what_else_chip_hints_still_win_over_the_pin(seen):
    # The chip states the exclusion explicitly; same requirement.
    _ask("what else?", _HISTORY, context_ids=["linkedin"],
         hints={"excludeTitles": ["Anthropic Introduces Three-Tiered Claude Certification Program"]})
    ids = seen["asked"][0]["cardIds"]
    assert ids[0] != "linkedin"


# ── The streaming path (what the WEB client uses) gets the same treatment ──
#
# Native asks for buffered JSON (SSE is unreliable in WKWebView), so every test
# above exercises the JSON branch only. The browser streams — and generation is
# the one place the two paths diverge, so each new prompt input has to be
# checked on both or the web could silently lose it.

def _ask_streaming(question, history=None, context_ids=None, generated=None):
    body = {"uid": "user1", "question": question, "history": history or [],
            "stream": True}
    if context_ids is not None:
        body["contextIds"] = context_ids
    if generated is not None:
        body["generated"] = generated
    resp = main.ask_brain(_Req(json_body=body))
    # Drain the generator so the stubbed stream actually runs.
    body_iter = resp.body
    if hasattr(body_iter, "__iter__") and not isinstance(body_iter, (str, bytes)):
        list(body_iter)
    return resp


def test_streaming_gets_the_same_followup_and_language_inputs(seen):
    _ask_streaming("בעברית, בקצרה", _HISTORY)
    asked = seen["asked"][0]
    assert asked["stream"] is True
    assert asked["followup"]["subject"] == _ASKED
    assert asked["followup"]["restate"] is True


def test_streaming_gets_the_pinned_context_cards(seen):
    _ask_streaming("בעברית", _UNQUOTED_HISTORY, context_ids=["linkedin"])
    assert seen["asked"][0]["cardIds"][0] == "linkedin"


def test_streaming_pins_the_conversation_language_for_a_chip(seen):
    _ask_streaming(_CHIP, _HE_HISTORY, generated=True)
    assert seen["asked"][0]["answerLanguage"] == "Hebrew"
