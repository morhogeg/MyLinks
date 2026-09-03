"""The actionable takeaway — where it is written, and where it is read from.

The analysis produces `actionableTakeaway` only when the content genuinely
supports a concrete action, and until now nothing ever showed it to the user.
These tests pin the two halves of making it visible:

  - WRITE: every save path funnels through `_build_link_data`, so the takeaway
    lands in `metadata.actionableTakeaway` on a link card, an image card, a note
    and a verbatim text card — and the YouTube / social-post metadata appliers,
    which mutate that same dict afterwards, must not knock it out.
  - READ: `_card_takeaway` looks in `metadata` FIRST. ask_brain's card slimmer
    used to read only the top-level key, which no save path writes, so no
    takeaway had ever reached the Ask prompt.

Pure: only the document-shaping helpers, no Firestore/Gemini/network.
"""

import main


def _analysis(**over):
    base = {
        "title": "Sleep and deep work",
        "summary": "Two sentences of gist.",
        "detailedSummary": "## Key Points\n- something",
        "category": "Health",
        "tags": ["sleep"],
        "language": "en",
        "actionableTakeaway": "Block the first 90 minutes of your day.",
    }
    base.update(over)
    return base


def _link_data(analysis):
    return main._build_link_data(
        url="https://example.com/post",
        title="Sleep and deep work",
        summary="Two sentences of gist.",
        detailed_summary="## Key Points\n- something",
        source_type="web",
        source_name="Example",
        original_title="Sleep and deep work",
        estimated_read_time=4,
        analysis=analysis,
    )


# ── WRITE: the takeaway survives every save path ──────────────────────────

def test_link_card_stores_the_takeaway_in_metadata():
    data = _link_data(_analysis())
    assert data["metadata"]["actionableTakeaway"] == "Block the first 90 minutes of your day."


def test_image_card_stores_the_takeaway_in_metadata():
    # analyze_image's shape: no url of its own, a screenshot byline, 1 min read.
    data = main._build_link_data(
        url="https://storage.example/screenshots/a.jpg",
        title="Image Analysis",
        summary="What the screenshot says.",
        detailed_summary="",
        source_type="image",
        source_name="Screenshot",
        original_title="Image Upload",
        estimated_read_time=1,
        analysis=_analysis(),
        confidence=0.9,
        key_entities=[],
    )
    assert data["metadata"]["actionableTakeaway"] == "Block the first 90 minutes of your day."


def test_note_card_stores_the_takeaway_in_metadata():
    data = main._note_link_data(_analysis(), "A thought I typed.")
    assert data["metadata"]["actionableTakeaway"] == "Block the first 90 minutes of your day."


def test_verbatim_text_card_stores_the_takeaway_in_metadata():
    # A shared paragraph keeps the user's words as its body; the takeaway is
    # Machina's, and rides along in metadata like on any other card.
    data = main._note_link_data(_analysis(), "The paragraph I shared.", verbatim=True)
    assert data["captureType"] == "text"
    assert data["summary"] == "The paragraph I shared."
    assert data["metadata"]["actionableTakeaway"] == "Block the first 90 minutes of your day."


def test_missing_takeaway_is_written_as_none_not_invented():
    analysis = _analysis()
    del analysis["actionableTakeaway"]
    assert _link_data(analysis)["metadata"]["actionableTakeaway"] is None


def test_youtube_metadata_does_not_clobber_the_takeaway():
    # _apply_youtube_metadata rewrites link_data["metadata"] key by key. If it
    # ever replaced the dict wholesale, every video card would silently lose it.
    data = _link_data(_analysis())
    main._apply_youtube_metadata(
        data,
        {"video_id": "abc", "watch_url": "https://youtu.be/abc",
         "thumbnail_url": "https://img/abc.jpg", "channel": "Some Channel"},
        _analysis(videoHighlights=["2:15 - the point"], speakers=["A"]),
        12,
    )
    assert data["metadata"]["actionableTakeaway"] == "Block the first 90 minutes of your day."
    assert data["metadata"]["youtubeChannel"] == "Some Channel"


def test_post_thumbnail_does_not_clobber_the_takeaway():
    # Same guarantee for the X/Instagram cover path. No bytes stashed on the
    # scrape ⇒ it returns early, which is exactly the no-op we want to hold.
    data = _link_data(_analysis())
    main._apply_post_thumbnail(data, {}, uid="+15550000000")
    assert data["metadata"]["actionableTakeaway"] == "Block the first 90 minutes of your day."


def test_embedding_text_still_folds_in_the_takeaway():
    # The vector recipe reads the takeaway off a synthetic metadata dict; a card
    # is findable BY its action, not just its headline.
    text = main._embedding_text_from_analysis(_analysis())
    assert "Block the first 90 minutes of your day." in text


# ── READ: _card_takeaway, the reader Ask's slimmer uses ───────────────────

def test_card_takeaway_reads_the_stored_metadata_shape():
    # The regression this fixes: a real stored card keeps it under metadata, and
    # the top-level-only read returned "" for every single one.
    card = {"title": "x", "metadata": {"actionableTakeaway": "Call the clinic."}}
    assert main._card_takeaway(card) == "Call the clinic."


def test_card_takeaway_prefers_a_top_level_value():
    card = {
        "actionableTakeaway": "Top level wins.",
        "metadata": {"actionableTakeaway": "Nested loses."},
    }
    assert main._card_takeaway(card) == "Top level wins."


def test_card_takeaway_falls_back_to_top_level_when_metadata_has_none():
    assert main._card_takeaway({"actionableTakeaway": "Flat card."}) == "Flat card."
    assert main._card_takeaway({"actionableTakeaway": "Flat card.", "metadata": {}}) == "Flat card."


def test_card_takeaway_trims_and_treats_blank_as_absent():
    assert main._card_takeaway({"metadata": {"actionableTakeaway": "  Do it.  "}}) == "Do it."
    assert main._card_takeaway({"metadata": {"actionableTakeaway": "   "}}) == ""


def test_card_takeaway_is_empty_when_the_card_has_none():
    assert main._card_takeaway({}) == ""
    assert main._card_takeaway({"metadata": None}) == ""
    assert main._card_takeaway({"metadata": {"actionableTakeaway": None}}) == ""


def test_card_takeaway_tolerates_a_malformed_card():
    # Card docs are up to 1 MB of whatever a client wrote; a non-dict metadata
    # or a non-string takeaway must degrade to "", never raise into an ask.
    assert main._card_takeaway({"metadata": "not a dict"}) == ""
    assert main._card_takeaway({"metadata": {"actionableTakeaway": 42}}) == ""
    assert main._card_takeaway({"actionableTakeaway": ["a list"]}) == ""
