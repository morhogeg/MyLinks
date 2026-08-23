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


# ── "reward for finding something" prompts (2026-08-23 audit) ────────────────
# The related-cards prompt had to be rewritten into an adversarial gatekeeper
# where EMPTY is a valid answer. These contracts pin that posture — on the
# graph verifier and on the weekly synthesis's theme-finding — so a wording
# edit can't silently drift either back into rewarding forced abstractions.

def test_graph_verifier_prompt_stays_an_adversarial_gatekeeper():
    from types import SimpleNamespace
    from graph_service import GraphService

    svc = GraphService.__new__(GraphService)
    captured = {}

    class _Models:
        def generate_content(self, model=None, contents=None, config=None):
            captured["prompt"] = contents
            return SimpleNamespace(text="[]")

    svc.ai = SimpleNamespace(client=SimpleNamespace(models=_Models()))
    svc._verify_relationships_with_llm("T", "S", [], [{"id": "a"}])
    p = captured["prompt"]
    assert "skeptical gatekeeper" in p
    assert "An empty result is a good result" in p
    assert "NEVER connect on" in p
    assert "both use benchmarks" in p  # the concrete forced-abstraction example
    assert "When in doubt, EXCLUDE" in p


def test_synthesis_prompt_licenses_an_honest_no_theme_answer():
    import ai_service

    svc = ai_service.GeminiService.__new__(ai_service.GeminiService)
    svc.client = object()
    captured = {}

    def fake_generate_json(contents, what, config_extra=None, model=None, attempts=3):
        captured["prompt"] = contents[0]
        return {"title": "T", "narrative": "n", "themes": []}

    svc._generate_json = fake_generate_json
    svc.synthesize_week([{"id": "a", "title": "Card", "summary": "s"}])
    p = captured["prompt"]
    # A theme must be a real throughline, never a shared format or a zoomed-out
    # abstraction — and fewer (or zero) themes is an allowed, honest outcome.
    assert "never a shared format" in p
    assert "one theme, or none, is a valid answer" in p
    assert "a forced connection is not" in p
