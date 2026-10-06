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
    "ומלבד זה?",
])
def test_hebrew_exclusion_questions(q):
    assert is_exclusion_question(q) is True


@pytest.mark.parametrize("q", [
    "מה כתוב על משרד החוץ?",                 # the foreign ministry
    "מה עושים מחוץ לבית בחורף?",               # "outside of"
    "מה עוד אפשר לבשל עם עגבניות?",
    'מה כתוב ב"חוץ מזה הכל טוב"?',             # a quoted title never votes
    # RV-6: "in addition to" adds, it doesn't exclude (English has no such
    # rule either).
    "בנוסף לזה, איך מכינים את הרוטב?",
    'מה עוד שמרתי בנוסף ל"עוגת המייפל"?',
])
def test_hebrew_non_exclusion_questions(q):
    assert is_exclusion_question(q) is False


def test_english_patterns_are_unchanged():
    assert is_recency_question("What did I save this week?") is True
    assert is_exclusion_question('What else besides "Pasta"?') is True
    assert is_recency_question("How do I make pasta?") is False


def test_this_week_with_a_pointer_word_is_recency_not_a_referential_followup():
    assert is_referential_followup("מה שמרתי השבוע הזה?") is False


# ── RV-6: "the week / the month / the day" is not "this week" ───────────────
# Hebrew uses the same word for both, so a bare השבוע / החודש / היום counts as
# recency only when it reads as "this week / this month / today" about saves.

@pytest.mark.parametrize("q", [
    "מה שמרתי על השבוע הראשון עם תינוק?",       # the first week with a newborn
    "מה כתוב על החודש התשיעי להריון?",           # the ninth month of pregnancy
    "טיפים ליום הראשון בעבודה חדשה, מה היה במאמר על היום הראשון?",
    "מה כתוב על השבוע ה-20 להריון?",             # week 20
    "איך לבנות סדר היום לילדים?",                # the daily schedule
    "מה לעשות בסוף השבוע?",                      # the weekend
    "בסוף היום, מה עדיף?",                        # at the end of the day
    "מה כתוב על השבוע של אופנה בפריז?",          # Paris fashion week
])
def test_the_week_or_the_day_in_a_topic_is_not_recency(q):
    assert is_recency_question(q) is False


@pytest.mark.parametrize("q", [
    "מה שמרתי השבוע?",
    "מה הוספתי היום",
    "מה הוספתי היום?",
    "מה שמרתי החודש?",
    "השבוע שמרתי משהו על פסטה?",
    "מה קראתי השבוע?",
    "מה יש לי מהשבוע?",
    "מה שמרנו היום",
])
def test_this_week_and_today_about_saves_are_recency(q):
    assert is_recency_question(q) is True
