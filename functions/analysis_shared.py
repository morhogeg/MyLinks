"""Shared link-analysis transforms.

Used by both the synchronous endpoints in main.py (analyze_link,
analyze_image, share_ingest) and the background processor in background.py,
so neither has to import the other.
"""

import logging

from firebase_admin import storage

from ai_service import AnalysisError

logger = logging.getLogger(__name__)


def _estimate_read_time(text: str, words_per_minute: int = 200) -> int:
    """Estimate read time in minutes from word count.

    Counts words rather than characters so the estimate holds for non-Latin
    scripts (e.g. Hebrew), where the old `len(text) // 1500` heuristic was off.
    """
    if not text:
        return 1
    words = len(text.split())
    return max(1, round(words / words_per_minute))


def _analyze_scraped(ai, scraped: dict, existing_tags: list):
    """Run the right analysis for scraped content.

    For YouTube, use Gemini native video ingestion; if that fails (private /
    unlisted / over-quota / region-blocked), fall back to an honest
    metadata-only text analysis rather than fabricating a summary.
    """
    content_type = scraped.get("content_type")
    if content_type == "youtube":
        watch_url = scraped.get("youtube_metadata", {}).get("watch_url")
        if watch_url:
            try:
                return ai.analyze_youtube(watch_url, existing_tags=existing_tags)
            except AnalysisError as e:
                logger.warning(f"Native YouTube analysis failed, using metadata-only fallback: {e}")
        # Fallback: analyze the lightweight oEmbed metadata text honestly.
        return ai.analyze_text(scraped.get("text") or scraped.get("html", ""), existing_tags=existing_tags)

    return ai.analyze_text(scraped.get("text") or scraped.get("html", ""), existing_tags=existing_tags, content_type=content_type)


def _format_duration(minutes: int) -> str:
    """Render a watch-time label, e.g. 12 -> '12 min', 75 -> '1h 15m'."""
    if not minutes or minutes < 1:
        return ""
    if minutes < 60:
        return f"{minutes} min"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins:02d}m"


def _store_image(blob_path: str, image_bytes: bytes, mime_type: str) -> str:
    """Upload an image to Storage and return a public Firebase download URL.

    Uses a Firebase download token (firebaseStorageDownloadTokens) rather than
    blob.make_public(): make_public() sets a legacy object ACL, which raises on
    buckets with uniform bucket-level access enabled. The token URL is served
    publicly by Firebase regardless of ACL mode — the same format the web SDK's
    getDownloadURL() returns.
    """
    import uuid
    from urllib.parse import quote
    bucket = storage.bucket()
    blob = bucket.blob(blob_path)
    token = uuid.uuid4().hex
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(image_bytes, content_type=mime_type)
    encoded = quote(blob_path, safe="")
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{encoded}?alt=media&token={token}"


def _apply_youtube_metadata(link_data: dict, yt_meta: dict, analysis: dict, minutes: int):
    """Attach video-shaped metadata (thumbnail, channel, highlights, speakers)
    to a link document so the frontend can render a proper video card."""
    meta = link_data["metadata"]
    meta["videoId"] = yt_meta.get("video_id")
    meta["watchUrl"] = yt_meta.get("watch_url")
    meta["thumbnailUrl"] = yt_meta.get("thumbnail_url")
    # Prefer the REAL channel from YouTube oEmbed over the AI's guess — the model
    # sometimes returns a thematic phrase ("It's a mindset") instead of the
    # creator's channel. Fall back to the AI value, then the generic default.
    _yt_channel = yt_meta.get("channel")
    _real_channel = _yt_channel if (_yt_channel and _yt_channel.strip().lower() != "youtube") else None
    meta["youtubeChannel"] = _real_channel or analysis.get("sourceName") or _yt_channel
    meta["durationDisplay"] = _format_duration(minutes)
    meta["videoHighlights"] = analysis.get("videoHighlights", [])
    meta["speakers"] = analysis.get("speakers", [])
