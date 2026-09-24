"""
Canonical dedupe key for a saved URL (``urlKey`` on a link doc).

Dedupe used to be an exact string match on ``url``, so the same article saved
as ``http://www.site.com/a/``, ``https://site.com/a?utm_source=x`` and
``https://m.site.com/a#top`` became three cards. ``url_key`` folds those to one
key; the stored ``url`` stays exactly what the user shared.

MIRRORED IN ``web/lib/urlKey.ts`` (``urlKey``). The web form dedupes against the
same field before it writes its placeholder, so the two MUST produce identical
keys. tests/test_url_key.py pins the cases; change both files together.

Rules (in order):
- scheme: http and https are the same page → always ``https``
- host: lower-cased, default port dropped, a leading ``www.`` / ``m.`` /
  ``mobile.`` stripped, ``twitter.com`` → ``x.com``
- YouTube: ``youtu.be/ID``, ``/shorts/ID``, ``/live/ID``, ``/embed/ID`` and
  ``watch?v=ID&…`` all become ``youtube.com/watch?v=ID`` (every other param
  — t, si, feature, list, pp — dropped)
- fragment dropped
- trailing ``/`` dropped (the bare root becomes no path at all)
- tracking params dropped (utm_*, fbclid, gclid, mc_*, igsh, ref, …; ``si`` on
  YouTube/Spotify; ``s``/``t`` on x.com); the rest are kept, sorted, so param
  order doesn't split a page in two
"""

from typing import Optional
from urllib.parse import urlsplit, parse_qsl, urlencode, quote

# Dropped on every host. Exact names; anything starting with a prefix in
# _TRACKING_PREFIXES is dropped too.
_TRACKING_PARAMS = frozenset({
    "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "yclid",
    "twclid", "ttclid", "li_fat_id", "igsh", "igshid", "ref", "ref_src",
    "ref_url", "_ga", "_gl", "mkt_tok", "oly_anon_id", "oly_enc_id",
    "vero_id", "wickedid", "rb_clickid", "s_cid", "__s", "_hsenc", "_hsmi",
    "spm", "share_id", "sharesource", "cmpid",
})
_TRACKING_PREFIXES = ("utm_", "mc_", "pk_", "hsa_")

# Per-host extras: short names that are tracking on these hosts but may be real
# parameters elsewhere (a search site's `s=` is the query).
_HOST_TRACKING = {
    "x.com": frozenset({"s", "t"}),
    "youtube.com": frozenset({"si", "feature", "pp"}),
    "open.spotify.com": frozenset({"si", "context", "nd"}),
    "spotify.com": frozenset({"si"}),
    "instagram.com": frozenset({"img_index"}),
}

_HOST_PREFIXES = ("www.", "m.", "mobile.")
_HOST_ALIASES = {"twitter.com": "x.com"}

_YOUTUBE_HOSTS = ("youtube.com", "youtube-nocookie.com")
_YOUTUBE_PATH_IDS = ("/shorts/", "/live/", "/embed/", "/v/")


def _clean_host(host: str) -> str:
    host = (host or "").strip().lower().rstrip(".")
    for prefix in _HOST_PREFIXES:
        if host.startswith(prefix) and host.count(".") >= 2:
            host = host[len(prefix):]
            break
    return _HOST_ALIASES.get(host, host)


def _valid_yt_id(value: str) -> Optional[str]:
    value = (value or "").strip()
    if 6 <= len(value) <= 20 and all(c.isalnum() or c in "-_" for c in value):
        return value
    return None


def _youtube_id(host: str, path: str, params: list) -> Optional[str]:
    if host == "youtu.be":
        return _valid_yt_id(path.strip("/").split("/", 1)[0])
    if host in _YOUTUBE_HOSTS:
        if path.rstrip("/") == "/watch":
            for k, v in params:
                if k == "v":
                    return _valid_yt_id(v)
        for prefix in _YOUTUBE_PATH_IDS:
            if path.startswith(prefix):
                return _valid_yt_id(path[len(prefix):].split("/", 1)[0])
    return None


def _is_tracking(key: str, host: str) -> bool:
    k = key.lower()
    if k in _TRACKING_PARAMS or k.startswith(_TRACKING_PREFIXES):
        return True
    return k in _HOST_TRACKING.get(host, ())


def url_key(url) -> str:
    """The canonical dedupe key for ``url`` ('' for anything that isn't an
    http(s) URL with a host). Pure, never raises."""
    if not isinstance(url, str):
        return ""
    raw = url.strip()
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
        if parts.scheme.lower() not in ("http", "https"):
            return ""
        host = _clean_host(parts.hostname or "")
        if not host:
            return ""
        port = parts.port
    except ValueError:
        return ""
    if port and port not in (80, 443):
        host = f"{host}:{port}"

    path = parts.path or ""
    params = parse_qsl(parts.query, keep_blank_values=True)

    yt = _youtube_id(host, path, params)
    if yt:
        return f"https://youtube.com/watch?v={yt}"

    # Re-quote so a percent-encoded and a raw path agree, and keep '/' as is.
    path = quote(path, safe="/:@!$&'()*+,;=-._~%")
    path = path.rstrip("/")

    kept = sorted((k, v) for k, v in params if not _is_tracking(k, host))
    query = urlencode(kept)
    return f"https://{host}{path}" + (f"?{query}" if query else "")
