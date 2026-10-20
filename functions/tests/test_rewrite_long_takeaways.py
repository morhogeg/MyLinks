"""The two-row "Do this" task: the shared rule, the fit check, and
tools/rewrite_long_takeaways.py, which shortens tasks saved under the older
20-word rule (owner, 2026-10-20: the Revisit list "looks super busy, make each
item 1-2 rows max", then "not generic").

Offline: the rewrite's Gemini call is replaced by a fake that records prompts.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import ai_service  # noqa: E402
import rewrite_long_takeaways as tool  # noqa: E402

OWNER_EXAMPLES = [
    "Switch your phone to black and white so the screen is easier to put down.",
    "Wait 90 minutes after waking for coffee, and skip caffeine after 2 PM.",
    "Book a Tsukiji sushi-making class before you fly, while spots are still open.",
]
LONG = ("Consider delaying your first cup of coffee by 90 to 120 minutes after waking up "
        "and avoid caffeine late in the afternoon to support better sleep.")


# ── the shared rule ─────────────────────────────────────────────────────────

def test_every_analysis_prompt_carries_the_two_row_rule():
    for prompt in (ai_service.SYSTEM_PROMPT, ai_service.VIDEO_ANALYSIS_PROMPT):
        assert ai_service.TAKEAWAY_RULE_BULLETS in prompt
    rule = ai_service.TAKEAWAY_RULE_BULLETS
    assert "at most 14 words" in rule
    assert "at most 20 words" not in ai_service.SYSTEM_PROMPT
    assert "SPECIFIC, NOT GENERIC" in rule
    for example in OWNER_EXAMPLES:
        assert example in rule


def test_the_rule_never_shows_the_model_an_em_dash():
    assert "—" not in ai_service.TAKEAWAY_RULE_BULLETS


def test_the_owner_examples_pass_the_tools_own_fit_check():
    # If the GOOD examples failed takeaway_fits, the prompt and the tool would
    # disagree about what "short enough" means.
    for example in OWNER_EXAMPLES:
        assert ai_service.takeaway_fits(example), example


def test_fit_is_mostly_about_characters():
    assert not ai_service.takeaway_fits(LONG)
    # 14 words but 86 characters: three rows on a 393pt iPhone.
    assert not ai_service.takeaway_fits(
        "Replace one daily soda with sparkling water flavored with lemon and fresh mint leaves.")
    assert not ai_service.takeaway_fits(" ".join(["Do"] * 16) + ".")
    for blank in ("", "   ", None, 42):
        assert not ai_service.takeaway_fits(blank)


def test_text_script():
    assert ai_service.text_script("Go to bed at 10 PM.") == "latin"
    assert ai_service.text_script("לכו לישון ב-22:00 כל ערב.") == "hebrew"
    assert ai_service.text_script("קראו את Meditations כל בוקר") == "hebrew"
    assert ai_service.text_script("123 - 45") == ""


# ── GeminiService.rewrite_takeaway ──────────────────────────────────────────

def _service(answers):
    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)
    svc.prompts = []

    def fake_generate(contents, what, config_extra=None, model=None, attempts=3):
        svc.prompts.append(contents[0])
        assert config_extra["response_schema"] is ai_service.TakeawayRewrite
        return {"actionableTakeaway": answers.pop(0)}
    svc._generate_json = fake_generate
    return svc


CARD = {"title": "Why your morning coffee should wait", "summary": "Cortisol peaks early.",
        "detailedSummary": "## Key Points\n- Wait **90 minutes**."}


def test_rewrite_returns_a_fitting_answer_and_uses_the_shared_rule():
    svc = _service(['"Wait 90 minutes after waking for coffee, and skip caffeine after 2 PM."'])
    task, reason = svc.rewrite_takeaway(CARD, LONG)
    assert (task, reason) == (OWNER_EXAMPLES[1], "ok")
    assert ai_service.TAKEAWAY_RULE_BULLETS in svc.prompts[0]
    assert LONG in svc.prompts[0] and "90 minutes" in svc.prompts[0]


def test_rewrite_retries_once_then_gives_up_on_a_long_answer():
    svc = _service([LONG, LONG])
    assert svc.rewrite_takeaway(CARD, LONG) == (None, "too_long")
    assert len(svc.prompts) == 2
    assert "breaks a rule" in svc.prompts[1]


def test_rewrite_recovers_on_the_retry():
    svc = _service([LONG, OWNER_EXAMPLES[1]])
    assert svc.rewrite_takeaway(CARD, LONG) == (OWNER_EXAMPLES[1], "ok")


def test_rewrite_keeps_the_card_language():
    hebrew_old = "שמרו על טמפרטורה של 18 עד 20 מעלות בחדר השינה והתקלחו במים חמים כשעה לפני השינה כדי לישון טוב יותר בלילה."
    svc = _service(["Keep your bedroom at 18 to 20 degrees.", "Keep your bedroom at 18 to 20 degrees."])
    assert svc.rewrite_takeaway(CARD, hebrew_old) == (None, "language")
    svc = _service(["שמרו על 18 עד 20 מעלות בחדר השינה."])
    assert svc.rewrite_takeaway(CARD, hebrew_old) == ("שמרו על 18 עד 20 מעלות בחדר השינה.", "ok")


def test_rewrite_rejects_em_dashes_and_honours_a_decline():
    svc = _service(["Wait 90 minutes — then coffee.", "Wait 90 minutes — then coffee."])
    assert svc.rewrite_takeaway(CARD, LONG) == (None, "em_dash")
    assert _service([None]).rewrite_takeaway(CARD, LONG) == (None, "declined")
    assert _service(["  "]).rewrite_takeaway(CARD, LONG) == (None, "declined")


# ── which cards the tool touches ────────────────────────────────────────────

def _card(**over):
    base = {"title": "t", "summary": "s", "detailedSummary": "d", "status": "unread",
            "metadata": {"actionableTakeaway": LONG}}
    base.update(over)
    return base


def test_classify_picks_open_long_tasks_only():
    assert tool.classify(_card(), set()) == "candidate"
    assert tool.classify(_card(metadata={}), set()) == "no_task"
    assert tool.classify(_card(metadata={"actionableTakeaway": "   "}), set()) == "no_task"
    assert tool.classify(_card(metadata={"actionableTakeaway": OWNER_EXAMPLES[0]}), set()) == "fits"


def test_done_and_not_for_me_tasks_keep_their_words():
    assert tool.classify(_card(takeawayDoneAt=1_760_000_000_000), set()) == "closed"
    assert tool.classify(_card(takeawayDismissedAt=1_760_000_000_000), set()) == "closed"
    # Same test as the web reader: only a positive number counts.
    assert tool.classify(_card(takeawayDoneAt=True), set()) == "candidate"
    assert tool.classify(_card(takeawayDoneAt=0), set()) == "candidate"


def test_private_cards_never_reach_the_model():
    assert tool.classify(_card(isPrivate=True), set()) == "private"
    assert tool.classify(_card(collectionIds=["vault"]), {"vault"}) == "private"
    assert tool.classify(_card(collectionIds=["reading"]), {"vault"}) == "candidate"
    # The private-collection read failed: any collection member counts as private.
    assert tool.classify(_card(collectionIds=["reading"]), None) == "private"


def test_other_skips():
    assert tool.classify(_card(captureType="answer"), set()) == "answer"
    assert tool.classify(_card(status="processing"), set()) == "unsettled"
    assert tool.classify(_card(summary="", detailedSummary=""), set()) == "no_source"
    assert tool.classify(_card(actionableTakeaway=LONG), set()) == "top_level"
    marked = _card(metadata={"actionableTakeaway": LONG, "takeawayRewrite": {"prev": "x", "new": "y"}})
    assert tool.classify(marked, set()) == "rewritten_before"


def test_revert_restores_only_what_the_tool_wrote():
    marker = {"prev": LONG, "new": OWNER_EXAMPLES[1], "at": 1}
    assert tool.revert_action({"metadata": {"actionableTakeaway": OWNER_EXAMPLES[1],
                                            "takeawayRewrite": marker}}) == "restore"
    # Re-analyzed after the rewrite: putting the old task back would clobber it.
    assert tool.revert_action({"metadata": {"actionableTakeaway": "Something newer.",
                                            "takeawayRewrite": marker}}) == "changed_since"
    assert tool.revert_action({"metadata": {"actionableTakeaway": LONG}}) == ""


def test_displayed_task_matches_the_web_reader():
    assert tool.displayed_task({"actionableTakeaway": "Top.", "metadata": {"actionableTakeaway": "Nested."}}) == "Top."
    assert tool.displayed_task({"actionableTakeaway": " ", "metadata": {"actionableTakeaway": " Nested. "}}) == "Nested."


def test_stats_are_structural():
    out = tool._stats([LONG, OWNER_EXAMPLES[0]])
    assert out.startswith("n=2 words")
    assert "coffee" not in out and "phone" not in out


def test_selftest_samples_cover_the_cases_that_matter():
    names = {name: expect for name, expect, _ in tool.SAMPLE_ARTICLES}
    assert names["news"] is False  # the rule must still omit a task for news
    assert any(ai_service.text_script(text) == "hebrew" for _, _, text in tool.SAMPLE_ARTICLES)
    for _, _, previous in tool.SAMPLE_LEGACY_CARDS:
        assert not ai_service.takeaway_fits(previous)
