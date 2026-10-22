"""App Review 1.2 safeguards on public share pages.

  * Every share page carries a Report link that names the page, and the
    contact address as plain text; the not-found page carries contact only.
  * A publish runs the page past share_moderation: a "not allowed" verdict
    (or Gemini refusing the input) refuses it with ShareRefused and writes
    nothing; an outage, a missing key or an unusable reply publishes anyway.
  * An account in `share_bans` can't publish.
  * The check sees exactly what the page would show.

Offline: Gemini and the image fetch are stubbed; Firestore is the in-memory
fake from test_card_share_lifecycle.
"""

import json
import types

import pytest

import share_moderation
import share_service
from tests.test_card_share_lifecycle import FakeDB

SHARE = "c" * 32


def _publish(db, payload=None, share_type="card", card="c1"):
    return share_service._publish_share_logic(
        "u1", share_type, SHARE,
        payload or {"card": {"title": "Sleep", "summary": "Keep it cool."}},
        card={"id": card} if share_type == "card" else None,
    )


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB({"users/u1": {}, "users/u1/links/c1": {"title": "Sleep"}})
    monkeypatch.setattr(share_service, "get_db", lambda: fake)
    return fake


@pytest.fixture
def gemini(monkeypatch):
    """Turn the check on with a stub client. `reply` sets what Gemini says:
    a dict (the JSON verdict), an Exception (raised), or a response object."""
    monkeypatch.setenv("SHARE_MODERATION", "on")
    state = {"reply": {"allowed": True}, "calls": []}

    class _Models:
        def generate_content(self, model, contents, config):
            state["calls"].append(contents)
            r = state["reply"]
            if isinstance(r, Exception):
                raise r
            if isinstance(r, dict):
                return types.SimpleNamespace(text=json.dumps(r), candidates=[], prompt_feedback=None)
            return r

    monkeypatch.setattr(share_moderation, "_client", lambda: types.SimpleNamespace(models=_Models()))
    monkeypatch.setattr(share_moderation, "_fetch_image", lambda url: (b"img", "image/jpeg"))
    return state


# ── Report link ────────────────────────────────────────────────────────────

def test_every_share_page_has_a_report_link_naming_the_page_and_the_contact_address():
    url = f"https://mymachina.app/s?id={SHARE}"
    html = share_service._render_shared_card({"title": "T", "summary": "S"}, url)
    assert "Report this page" in html
    assert "mailto:support@mymachina.app?" in html
    assert f"s%3Fid%3D{SHARE}" in html  # the page's own address rides in the report body
    assert "Contact: support@mymachina.app" in html


def test_collection_and_answer_pages_carry_the_report_link_too():
    col = share_service._render_shared_collection(
        {"name": "Sleep", "cards": [{"title": "A", "url": "https://x.example/a"}]},
        f"https://mymachina.app/c?id={SHARE}")
    ans = share_service._render_shared_answer(
        {"question": "Q?", "answer": "A.", "sources": []}, f"https://mymachina.app/a?id={SHARE}")
    assert "Report this page" in col and "Report this page" in ans


def test_not_found_page_has_contact_but_nothing_to_report():
    html = share_service._share_not_found_html()
    assert "Contact: support@mymachina.app" in html
    assert "Report this page" not in html


# ── Publish-time check ─────────────────────────────────────────────────────

def test_allowed_content_publishes(db, gemini):
    _publish(db)
    assert f"shared_cards/{SHARE}" in db.docs
    assert gemini["calls"], "the check must run on publish"


def test_refused_content_raises_and_writes_nothing(db, gemini):
    gemini["reply"] = {"allowed": False, "category": "harassment"}
    with pytest.raises(share_service.ShareRefused) as e:
        _publish(db)
    assert str(e.value) == share_moderation.REFUSAL_MESSAGE
    assert f"shared_cards/{SHARE}" not in db.docs
    assert f"shared_owners/{SHARE}" not in db.docs
    assert "shareId" not in db.docs["users/u1/links/c1"]


def test_gemini_refusing_the_input_counts_as_refused(db, gemini):
    gemini["reply"] = types.SimpleNamespace(
        text="", candidates=[], prompt_feedback=types.SimpleNamespace(block_reason="PROHIBITED_CONTENT"))
    with pytest.raises(share_service.ShareRefused):
        _publish(db)


@pytest.mark.parametrize("reply", [
    RuntimeError("503 UNAVAILABLE"),
    {"unexpected": "shape"},
    types.SimpleNamespace(text="not json", candidates=[], prompt_feedback=None),
])
def test_outage_or_unusable_reply_publishes_anyway(db, gemini, reply):
    gemini["reply"] = reply
    _publish(db)
    assert f"shared_cards/{SHARE}" in db.docs


def test_missing_key_or_switch_off_skips_the_check(db, monkeypatch):
    monkeypatch.setenv("SHARE_MODERATION", "on")
    monkeypatch.setattr(share_moderation, "_client", lambda: None)
    _publish(db)
    assert f"shared_cards/{SHARE}" in db.docs


def test_check_sees_the_page_text_and_its_hero_image(db, gemini):
    _publish(db, {"card": {"title": "Sleep", "summary": "Keep it cool.", "tags": ["rest"],
                           "thumbnailUrl": "https://cdn.example/hero.jpg"}})
    contents = gemini["calls"][0]
    text = contents[1]
    assert "Sleep" in text and "Keep it cool." in text and "rest" in text
    assert len(contents) == 3  # prompt, text, one image part


def test_hidden_image_is_never_fetched():
    doc = {"card": {"title": "T", "sourceType": "image", "url": "https://cdn.example/s.png",
                    "hideThumbnail": True}}
    assert share_moderation.shown_image_urls("card", doc) == []


def test_collection_check_takes_the_cover_mosaic_only():
    cards = [{"title": f"t{i}", "thumbnailUrl": f"https://cdn.example/{i}.jpg"} for i in range(9)]
    urls = share_moderation.shown_image_urls("collection", {"name": "N", "cards": cards})
    assert urls == [f"https://cdn.example/{i}.jpg" for i in range(4)]


def test_answer_text_includes_question_answer_and_sources():
    text = share_moderation.page_text("answer", {
        "question": "Q?", "answer": "The answer.", "sources": [{"title": "Src"}]})
    assert "Q?" in text and "The answer." in text and "Src" in text


# ── Ban ────────────────────────────────────────────────────────────────────

def test_banned_account_cannot_publish(db, gemini):
    db.docs["share_bans/u1"] = {"bannedAt": 1}
    with pytest.raises(share_service.ShareRefused) as e:
        _publish(db)
    assert "Public sharing is turned off" in str(e.value)
    assert f"shared_cards/{SHARE}" not in db.docs
    assert not gemini["calls"], "a banned account is refused before any Gemini spend"


# ── Operator takedown tool ─────────────────────────────────────────────────

def _tool_env(monkeypatch, docs):
    import firebase_admin.storage as fb_storage
    from tests.test_card_share_lifecycle import FakeBucket
    from tools import takedown_share
    fake = FakeDB(docs)
    monkeypatch.setattr(share_service, "get_db", lambda: fake)
    monkeypatch.setattr(takedown_share, "get_db", lambda: fake)
    monkeypatch.setattr(fb_storage, "bucket", lambda *a, **k: FakeBucket(()))
    return fake, takedown_share


def _live_docs():
    other = "d" * 32
    return other, {
        "users/u1": {}, "users/u1/links/c1": {"title": "T", "shareId": SHARE},
        f"shared_cards/{SHARE}": {"card": {"title": "T"}},
        f"shared_owners/{SHARE}": {"ownerUid": "u1", "type": "card", "cardId": "c1"},
        f"shared_answers/{other}": {"question": "Q", "answer": "A"},
        f"shared_owners/{other}": {"ownerUid": "u1", "type": "answer"},
    }


def test_takedown_dry_run_writes_nothing(monkeypatch):
    _, docs = _live_docs()
    fake, tool = _tool_env(monkeypatch, docs)
    before = {k: dict(v) for k, v in fake.docs.items()}
    assert tool.main([SHARE, "--ban"]) == 0
    assert fake.docs == before


def test_takedown_removes_the_page_like_stop_sharing(monkeypatch):
    other, docs = _live_docs()
    fake, tool = _tool_env(monkeypatch, docs)
    assert tool.main([SHARE, "--apply"]) == 0
    assert f"shared_cards/{SHARE}" not in fake.docs
    assert fake.docs[f"shared_owners/{SHARE}"].get("unpublishedAt")
    assert fake.docs["users/u1/links/c1"].get("shareId") is None
    assert f"shared_answers/{other}" in fake.docs, "without --ban, other pages stay"
    assert "share_bans/u1" not in fake.docs


def test_ban_takes_down_every_live_page_and_blocks_publishing(monkeypatch):
    other, docs = _live_docs()
    fake, tool = _tool_env(monkeypatch, docs)
    assert tool.main([SHARE, "--ban", "--apply"]) == 0
    assert f"shared_cards/{SHARE}" not in fake.docs
    assert f"shared_answers/{other}" not in fake.docs
    assert "share_bans/u1" in fake.docs
    with pytest.raises(share_service.ShareRefused):
        _publish(fake)
    assert tool.main([SHARE, "--unban", "--apply"]) == 0
    assert "share_bans/u1" not in fake.docs
