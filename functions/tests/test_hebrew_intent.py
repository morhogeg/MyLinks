"""Hebrew recency and exclusion questions are recognized (AI-9).

Both intent patterns were English-only. A Hebrew "what did I save this week?"
went to semantic retrieval for the phrase (topically arbitrary cards) instead
of the newest saves, and a Hebrew "what else besides X?" re-presented X as a
new find. Hebrew words carry clitic prefixes, so the patterns match on
clitic-tolerant boundaries.
"""

import pytest

from search import is_recency_question, is_exclusion_question, is_referential_followup


@pytest.mark.parametrize("q", [
    "מה שמרתי השבוע?",
    "מה שמרתי לאחרונה?",
    "מה השמירה האחרונה שלי?",
    "תראה לי את השמירות האחרונות",
    "מה הדבר האחרון ששמרתי?",
    "תסכם לי מה שמרתי בשבוע שעבר",
    "מה שמרתי בשבוע האחרון?",
    "מה שמרתי בחודש האחרון?",
    "מה שמרתי היום?",
    "ומה שמרתי אתמול?",
    "מה יש לי מהשבוע?",
    "מה שמרתי בימים האחרונים?",
])
def test_hebrew_recency_questions(q):
    assert is_recency_question(q) is True


@pytest.mark.parametrize("q", [
    "מה כתוב על שבוע עבודה מקוצר?",          # "a work week", not this week
    "מה קורה בפרק האחרון של הסדרה?",          # "the last chapter"
    "איך מכינים עוגת שוקולד?",
    'מה כתוב ב"החדשות של השבוע"?',            # a quoted title never votes
    "מה שמרתי על אחרונים ראשונים?",
])
def test_hebrew_non_recency_questions(q):
    assert is_recency_question(q) is False


@pytest.mark.parametrize("q", [
    'מה עוד שמרתי חוץ מ"פסטה ברוטב עגבניות"?',
    "מה עוד שמרתי חוץ מהמתכון הזה?",
    'מלבד "המדריך לשינה", מה יש לי על שינה?',
    "מה עוד יש לי, למעט הכתבה ההיא?",
    'מה עוד שמרתי בנוסף ל"עוגת המייפל"?',
    "ומלבד זה?",
])
def test_hebrew_exclusion_questions(q):
    assert is_exclusion_question(q) is True


@pytest.mark.parametrize("q", [
    "מה כתוב על משרד החוץ?",                 # the foreign ministry
    "מה עושים מחוץ לבית בחורף?",               # "outside of"
    "מה עוד אפשר לבשל עם עגבניות?",
    'מה כתוב ב"חוץ מזה הכל טוב"?',             # a quoted title never votes
])
def test_hebrew_non_exclusion_questions(q):
    assert is_exclusion_question(q) is False


def test_english_patterns_are_unchanged():
    assert is_recency_question("What did I save this week?") is True
    assert is_exclusion_question('What else besides "Pasta"?') is True
    assert is_recency_question("How do I make pasta?") is False


def test_this_week_with_a_pointer_word_is_recency_not_a_referential_followup():
    assert is_referential_followup("מה שמרתי השבוע הזה?") is False
