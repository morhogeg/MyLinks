"""temporal_window_days — the pure detector behind ask_brain's temporal leg.

A time-scoped ask ("catch me up on this week's saves") must retrieve the cards
literally saved in that window; vector search retrieves by meaning and can miss
them entirely. These tests pin the phrasings the suggestion chips actually send
plus the tie-break rule (smallest matching window wins).
"""

from search import temporal_window_days


def test_week_chip_phrasings_map_to_seven_days():
    # The exact texts buildAskSuggestions offers for the 'week' chip.
    assert temporal_window_days("Catch me up on this week's saves") == 7
    assert temporal_window_days("What did I save this week?") == 7


def test_recap_chip_maps_to_recent_window():
    assert temporal_window_days("Recap my recent saves") == 14
    assert temporal_window_days("What did I save recently?") == 14
    assert temporal_window_days("What's my latest Tech save about?") == 14


def test_today_yesterday_month():
    assert temporal_window_days("What did I save today?") == 1
    assert temporal_window_days("What did I save yesterday?") == 2
    assert temporal_window_days("Summarize what I saved this month") == 31


def test_smallest_matching_window_wins():
    assert temporal_window_days("Recap my recent saves from this week") == 7


def test_case_insensitive():
    assert temporal_window_days("CATCH ME UP on THIS WEEK") == 7


def test_non_temporal_questions_return_none():
    assert temporal_window_days('Walk me through the steps in "Shakshuka"') is None
    assert temporal_window_days("What ingredients do I need for the pie?") is None
    assert temporal_window_days("") is None
    assert temporal_window_days(None) is None


def test_weekly_adjective_alone_is_not_a_window():
    # "weekly newsletter" is content, not a time scope.
    assert temporal_window_days("What did the weekly newsletter say?") is None
