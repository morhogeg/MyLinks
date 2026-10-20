"""The card page's link-preview image is built on the page's first view
(share_service.ensure_card_og_preview), never inside the publish.

Why it matters: the app waits for the publish before opening the share sheet,
so the publish must stay a bare Firestore write; and the copy a view builds
must only ever be attached to the snapshot it was built from.
"""

import types

import pytest

import share_service
from share_service import _og_image_meta, ensure_card_og_preview
from tests.test_share_page import _FakeDb

OWNER = "+15551234567"
SHARE_ID = "3f2a9c1d4e5b6a7f8c9d0e1f2a3b4c5d"
THUMB = "https://example.com/thumb.jpg"
PREVIEW = {"url": "https://firebasestorage.googleapis.com/v0/b/b/o/p?alt=media&token=t",
           "width": 1000, "height": 667}


@pytest.fixture
def env(monkeypatch):
    db = _FakeDb()
    monkeypatch.setattr(share_service, "get_db", lambda: db)
    calls = types.SimpleNamespace(generated=0, deleted_blobs=[], swept=[], result=None, raises=None)

    def fake_generate(share_type, doc, share_id):
        calls.generated += 1
        if calls.raises:
            raise calls.raises
        return dict(calls.result) if calls.result else None

    monkeypatch.setattr(share_service, "_generate_og_preview", fake_generate)
    monkeypatch.setattr(share_service, "_delete_blob_quietly", calls.deleted_blobs.append)
    monkeypatch.setattr(share_service, "_delete_share_previews",
                        lambda sid, keep=None: calls.swept.append((sid, keep)))
    return db, calls


def _put_card(db, **card):
    data = {"card": {"title": "T", "summary": "S", **card}, "shareId": SHARE_ID}
    db.store[("shared_cards", SHARE_ID)] = data
    return data


class TestPublishStaysFast:
    def test_publish_builds_no_preview_and_drops_a_client_copy(self, env):
        db, calls = env
        share_service._publish_share_logic(OWNER, "card", SHARE_ID, {
            "card": {"title": "T", "summary": "S", "thumbnailUrl": THUMB},
            "ogPreview": {"url": "https://evil.example/x.jpg"},
        })
        assert calls.generated == 0
        assert "ogPreview" not in db.store[("shared_cards", SHARE_ID)]


class TestFirstView:
    def test_existing_preview_is_reused(self, env):
        db, calls = env
        data = _put_card(db, thumbnailUrl=THUMB)
        data["ogPreview"] = PREVIEW
        assert ensure_card_og_preview(db, SHARE_ID, data, object()) == PREVIEW
        assert calls.generated == 0

    def test_imageless_card_builds_nothing(self, env):
        db, calls = env
        data = _put_card(db)
        assert ensure_card_og_preview(db, SHARE_ID, data, object()) is None
        assert calls.generated == 0
        assert "ogPreview" not in db.store[("shared_cards", SHARE_ID)]

    def test_first_view_builds_records_and_sweeps_older_copies(self, env):
        db, calls = env
        calls.result = {**PREVIEW, "path": f"share_previews/{SHARE_ID}/new.jpg"}
        data = _put_card(db, thumbnailUrl=THUMB)
        assert ensure_card_og_preview(db, SHARE_ID, data, object()) == PREVIEW
        assert db.store[("shared_cards", SHARE_ID)]["ogPreview"] == PREVIEW  # no blob path stored
        assert calls.swept == [(SHARE_ID, f"share_previews/{SHARE_ID}/new.jpg")]
        img, w, h, typ = _og_image_meta(PREVIEW, THUMB)
        assert (img, w, h, typ) == (PREVIEW["url"], 1000, 667, "image/jpeg")

    def test_unusable_image_is_marked_so_later_views_skip_it(self, env):
        db, calls = env
        calls.raises = RuntimeError("source 404")
        data = _put_card(db, thumbnailUrl=THUMB)
        assert ensure_card_og_preview(db, SHARE_ID, data, object()) is None
        marker = db.store[("shared_cards", SHARE_ID)]["ogPreview"]
        assert "failed" in marker and "url" not in marker
        # Next view reads the marker and does not refetch; the page falls back
        # to the raw image.
        assert ensure_card_og_preview(db, SHARE_ID, db.store[("shared_cards", SHARE_ID)], object()) == marker
        assert calls.generated == 1
        assert _og_image_meta(marker, THUMB) == (THUMB, None, None, None)

    def test_losing_the_race_discards_this_copy(self, env, monkeypatch):
        db, calls = env
        calls.result = {**PREVIEW, "path": f"share_previews/{SHARE_ID}/mine.jpg"}
        data = _put_card(db, thumbnailUrl=THUMB)

        def refuse(*a, **k):
            raise RuntimeError("FAILED_PRECONDITION")
        monkeypatch.setattr(type(db.collection("shared_cards").document(SHARE_ID)), "update", refuse)
        # This view still renders with its copy...
        assert ensure_card_og_preview(db, SHARE_ID, data, object()) == PREVIEW
        # ...but the copy is attached to nothing, so it is removed, and nothing
        # else is swept.
        assert calls.deleted_blobs == [f"share_previews/{SHARE_ID}/mine.jpg"]
        assert calls.swept == []

    def test_write_is_conditioned_on_the_snapshot_read(self, env, monkeypatch):
        db, calls = env
        calls.result = {**PREVIEW, "path": "p"}
        data = _put_card(db, thumbnailUrl=THUMB)
        seen = {}
        db.write_option = lambda **kw: ("opt", kw)
        doc_type = type(db.collection("shared_cards").document(SHARE_ID))

        def update(self, fields, option=None):
            seen["option"] = option
        monkeypatch.setattr(doc_type, "update", update)
        snap = types.SimpleNamespace(update_time="T1")
        ensure_card_og_preview(db, SHARE_ID, data, snap)
        assert seen["option"] == ("opt", {"last_update_time": "T1"})
