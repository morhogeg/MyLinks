# Look up real YouTube videos for the capture's demo saves: the step
# .github/workflows/video-facts.yml runs on GitHub, where YouTube and the repo's
# GEMINI_API_KEY secret are reachable (cloud sessions reach neither).
#
# capture/video-request.json:
#   `channels`  channel video tabs to list: every upload's id, title, views
#               and length, most viewed first
#   `videos`    watch URLs to look up: YouTube's own oEmbed (title, channel)
#               and yt-dlp's page facts (length, upload date, chapters,
#               description; YouTube may refuse these to a runner)
#   `analyze`   watch URLs to run through Machina's own video analysis
#               (functions/ai_service.py GeminiService.analyze_youtube): the
#               exact call a Pro save makes, so a demo card says what the
#               app itself would say about that video
#   `clips`     [url, "M:SS", "M:SS"] spans to transcribe (Gemini is given
#               only that span), to check a key moment against what is said
#               there
#
# Results land in capture/video-facts/ (one file per video, updated in place)
# and are committed by the workflow.

import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "video-facts")
req = json.load(open(os.path.join(HERE, "video-request.json")))
os.makedirs(OUT, exist_ok=True)
today = date.today().isoformat()
ok = True


def ytdlp_json(*args):
    r = subprocess.run([sys.executable, "-m", "yt_dlp", "--no-warnings", *args], capture_output=True, text=True)
    if r.returncode != 0:
        return None, r.stderr.strip()[-600:]
    return json.loads(r.stdout), None


def video_id(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", url)
    return m.group(1) if m else None


def seconds(stamp):
    return sum(int(x) * 60**i for i, x in enumerate(reversed(stamp.split(":"))))


def save(name, data):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


for url in req.get("channels", []):
    data, err = ytdlp_json("--flat-playlist", "--dump-single-json", url)
    handle = re.sub(r"[^\w-]", "", url.split("@")[-1].split("/")[0]) or "channel"
    if err:
        ok = False
        save(f"channel-{handle}.json", {"url": url, "fetched": today, "error": err})
        continue
    videos = [
        {
            "id": e.get("id"),
            "title": e.get("title"),
            "views": e.get("view_count"),
            "seconds": e.get("duration"),
        }
        for e in data.get("entries") or []
    ]
    videos.sort(key=lambda v: -(v["views"] or 0))
    save(f"channel-{handle}.json", {
        "url": url,
        "fetched": today,
        "channel": data.get("channel") or data.get("uploader"),
        "channel_id": data.get("channel_id"),
        "videos": videos,
    })

analyze = set(req.get("analyze", []))
clips = {}
for url, start, end in req.get("clips", []):
    clips.setdefault(url, []).append((start, end))

ai = None


def gemini():
    """functions/ai_service.py and ONE GeminiService, kept: its client closes
    when the service is collected"""
    global ai
    if ai is None:
        sys.path.insert(0, os.path.join(REPO, "functions"))
        import ai_service
        ai = (ai_service, ai_service.GeminiService())
    return ai


for url in dict.fromkeys([*req.get("videos", []), *analyze, *clips]):
    vid = video_id(url)
    if not vid:
        ok = False
        continue
    watch = f"https://www.youtube.com/watch?v={vid}"
    path = os.path.join(OUT, f"{vid}.json")
    facts = json.load(open(path)) if os.path.exists(path) else {"id": vid, "url": watch}
    facts["fetched"] = today
    try:
        q = urllib.parse.urlencode({"url": watch, "format": "json"})
        with urllib.request.urlopen(f"https://www.youtube.com/oembed?{q}", timeout=15) as r:
            o = json.load(r)
        facts["oembed"] = {k: o.get(k) for k in ("title", "author_name", "author_url")}
    except Exception as e:
        facts["oembed"] = {"error": str(e)}
    if "error" in facts.get("page", {"error": True}):
        page, err = ytdlp_json("--skip-download", "--dump-json", watch)
        facts["page"] = {"error": err} if err else {
            k: page.get(k)
            for k in ("title", "channel", "channel_id", "uploader_id", "duration", "duration_string",
                      "upload_date", "view_count", "chapters", "description")
        }
    if url in analyze:
        try:
            m, service = gemini()
            facts["analysis"] = {"model": m.GEMINI_ANALYSIS_MODEL, **service.analyze_youtube(watch)}
        except Exception as e:
            ok = False
            facts["analysis"] = {"error": f"{type(e).__name__}: {e}"[:600]}
    for start, end in clips.get(url, []):
        try:
            m, service = gemini()
            from google.genai import types

            model = req.get("clip_model") or m.GEMINI_FALLBACK_MODEL
            part = types.Part(
                file_data=types.FileData(file_uri=watch),
                video_metadata=types.VideoMetadata(start_offset=f"{seconds(start)}s", end_offset=f"{seconds(end)}s"),
            )
            r = service.client.models.generate_content(
                model=model,
                contents=[part, "Transcribe verbatim everything said in this clip, in order. No commentary, no timestamps."],
            )
            text = r.text
        except Exception as e:
            ok = False
            model, text = None, f"error: {type(e).__name__}: {e}"[:600]
        facts.setdefault("clips", {})[f"{start}-{end}"] = {"model": model, "text": text}
    save(f"{vid}.json", facts)

sys.exit(0 if ok else 1)
