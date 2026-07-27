"""Prompt fidelity — the analysis prompts must forbid NARROWING the subject.

Owner report (2026-07-27): an X post whose body was a screenshot of a Hebrew
rant about the **Japan** travel trend came back titled "ביקורת על חופשות
בטוקיו" — a critique of vacations in **Tokyo**. The post never says Tokyo. The
model silently substituted a city for the country, and the same failure mode
invents a company for an industry, a brand for a product, or a date for a vague
time reference. A wrong-but-plausible specific is a fabrication exactly like an
invented statistic, and it also pollutes tags/concepts (a "tokyo" tag on a Japan
post) and therefore related-card matching.

These assertions are deliberately about the SHARED constants, so they run
offline with no ``google.genai`` stubbing: every analysis path composes its
prompt from ``SYSTEM_PROMPT`` (text/note, image, and both text+image variants)
or from ``VIDEO_ANALYSIS_PROMPT`` (native YouTube). Guarding the constants is
what stops the behaviour diverging by capture type the next time one of the
per-path addenda is edited.
"""

import ai_service


def test_system_prompt_forbids_substituting_a_narrower_entity():
    p = ai_service.SYSTEM_PROMPT
    assert "SAME LEVEL OF GENERALITY" in p
    # The rule must name the concrete substitutions, not just gesture at
    # "be accurate" — the model already had a grounding clause and narrowed anyway.
    for phrase in ("a city for a country", "a company for its industry",
                   "a specific date for a vague time reference"):
        assert phrase in p, f"missing from the generality rule: {phrase}"


def test_generality_rule_covers_the_fields_that_leak_false_specifics():
    # Not just the summary: the TITLE is where the bug was visible, and
    # tags/concepts feed the knowledge graph and related-card matching.
    p = ai_service.SYSTEM_PROMPT
    for field in ("title", "summary", "tags", "concepts"):
        assert field in p.split("SAME LEVEL OF GENERALITY")[1].split("\n")[0]


def test_title_instruction_pins_the_source_level_of_generality():
    p = ai_service.SYSTEM_PROMPT
    assert "**SCOPE**" in p
    # And it must not have been rebalanced back toward catchy specificity.
    assert "not clickbait" in p


def test_video_prompt_qualifies_its_be_specific_licence():
    # The video addendum actively tells the model to be "specific and concrete"
    # because it really watched the video — that licence has to be bounded, or
    # it reads as permission to concretize beyond what was said.
    p = ai_service.VIDEO_ANALYSIS_PROMPT
    assert "never narrower than it" in p


def test_video_prompt_still_inherits_the_shared_rule():
    assert "SAME LEVEL OF GENERALITY" in ai_service.VIDEO_ANALYSIS_PROMPT


def test_language_handling_is_untouched():
    # The app is heavily Hebrew: the summary/title/tags are generated in the
    # SOURCE language while category/concepts/sourceName stay English. The
    # grounding additions must not have disturbed that split.
    p = ai_service.SYSTEM_PROMPT
    assert "Write the title in the SAME language as the input content." in p
    assert "Write the summary in the SAME language as the input content." in p
    assert "The category MUST ALWAYS be in English" in p
