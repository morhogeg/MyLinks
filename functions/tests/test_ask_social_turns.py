""""Thanks" is not a question (AI-4).

Politeness words sat in the follow-up meta vocabulary, so a bare "thanks",
"ok" or "תודה" read as a context-free follow-up, i.e. a RESTATE request: the
model re-sent the previous answer and the user paid an ask for it. Now a
social turn gets a one-line reply before the quota meter, retrieval or any
model call, and politeness never implies a restate.
"""

import json

import pytest

import main
from search import is_social_turn, social_reply, resolve_followup, is_context_free_followup
from tests.test_search_http import _Req, _Resp

_EN_HISTORY = [{"role": "user", "content": "How do I make the maple cake?"},
               {"role": "assistant", "content": "Mix, then bake for 40 minutes."}]
_HE_HISTORY = [{"role": "user", "content": "איך מכינים את עוגת המייפל?"},
               {"role": "assistant", "content": "מערבבים ואופים 40 דקות."}]


@pytest.mark.parametrize("text", [
    "thanks", "Thank you!", "thanks a lot", "thank you so much", "ok", "Okay, thanks.",
    "great, thanks!", "got it", "that helps a lot", "perfect", "👍", "🙏🙏",
    "תודה", "תודה רבה!", "אוקיי", "סבבה, תודה", "מעולה", "תודה רבה לך",
])
def test_social_turns(text):
    assert is_social_turn(text) is True


@pytest.mark.parametrize("text", [
    "thanks, what about the pasta?", "ok so how do I make it", "is it good",
    "Thanks?", "yes", "sure", "yes please", "great recipe ideas", "", "   ",
    "thanks " * 20, "תודה, ומה עם הפסטה?", "מה שמרתי השבוע", "?",
])
def test_not_social_turns(text):
    assert is_social_turn(text) is False


def test_politeness_never_implies_a_restate():
    for text in ("thanks", "ok", "ok please", "תודה", "אוקיי"):
        assert is_context_free_followup(text) is False, text
        assert resolve_followup(text, _EN_HISTORY)["restate"] is False, text


def test_real_restate_requests_still_restate():
    for text in ("shorter please", "in Hebrew please", "again", "בעברית בבקשה"):
        out = resolve_followup(text, _EN_HISTORY)
        assert out["restate"] is True and out["subject"] == _EN_HISTORY[0]["content"], text


def test_reply_language():
    assert social_reply("thanks") == "You're welcome."
    assert social_reply("תודה רבה") == "בשמחה."
    assert social_reply("👍", _HE_HISTORY) == "בשמחה."
    assert social_reply("👍", _EN_HISTORY) == "You're welcome."


@pytest.fixture
def endpoint(monkeypatch):
    monkeypatch.setattr(main.https_fn, "Response", _Resp)
    monkeypatch.setattr(main, "check_rate_limit", lambda *a, **k: True)
    monkeypatch.setattr(main, "REQUIRE_AUTH", False)
    monkeypatch.setattr(main, "APPCHECK_ENFORCE", False)
    monkeypatch.setattr(main, "meter_quota", lambda *a, **k: pytest.fail("a social turn was metered"))
    monkeypatch.setattr(main, "plan_for", lambda uid: pytest.fail("a social turn read the plan"))
    monkeypatch.setattr(main, "perform_search_logic", lambda *a, **k: pytest.fail("a social turn retrieved"))
    monkeypatch.setattr(main, "GeminiService", lambda *a, **k: pytest.fail("a social turn called the model"))


def test_endpoint_answers_thanks_without_retrieval_model_or_charge(endpoint):
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "thanks!", "history": _EN_HISTORY}))
    body = json.loads(resp.body)
    assert resp.status == 200
    assert body == {"success": True, "answer": "You're welcome.", "citedIds": [],
                    "sources": [], "ungrounded": False}


def test_endpoint_streams_the_hebrew_reply(endpoint):
    resp = main.ask_brain(_Req(json_body={"uid": "u1", "question": "תודה רבה", "history": _HE_HISTORY,
                                          "stream": True}))
    events = [json.loads(line[len("data: "):]) for line in "".join(resp.body).split("\n\n") if line]
    assert events == [{"type": "token", "text": "בשמחה."},
                      {"type": "sources", "sources": []},
                      {"type": "done"}]
