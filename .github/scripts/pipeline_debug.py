"""Screenshot-provenance probe (2026-09-09, branch trigger/pipeline-debug only).

Owner report: a screenshot of an X post saved on build 1319 still reads
"Screenshot". This runner has the production GEMINI_API_KEY and Firestore
access, so it answers the one question the sandbox cannot: what does the
vision call return for that exact image, and what did the backend store?

Public repo ⇒ stdout prints structural findings only: masked ids, field
presence, the model's platform/handle answer (a public account handle, not
user data). No card text, no URLs.
"""

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "functions"))

import requests  # noqa: E402
from google.cloud import firestore  # noqa: E402

PROJECT = "secondbrain-app-94da2"
report = {"generatedAt": datetime.now(timezone.utc).isoformat()}


def mask(uid):
    return (uid[:4] + "…" + uid[-2:]) if isinstance(uid, str) and len(uid) > 8 else "?"


def main():
    db = firestore.Client(project=PROJECT)

    # 1. Newest screenshot cards: did the backend store the fields?
    print("=== NEWEST SCREENSHOT CARDS (stored fields) ===")
    newest = None
    for u in db.collection("users").stream():
        q = (u.reference.collection("links")
             .order_by("createdAt", direction=firestore.Query.DESCENDING).limit(8))
        for d in q.stream():
            c = d.to_dict() or {}
            if c.get("sourceType") != "image":
                continue
            row = {
                "user": mask(u.id), "card": d.id[:6], "createdAt": c.get("createdAt"),
                "status": c.get("status"),
                "sourceName": c.get("sourceName"),
                "sourceHandle": c.get("sourceHandle"),
                "sourcePlatform": c.get("sourcePlatform"),
                "hasImageUrl": bool(c.get("url")),
                "keys": sorted(c.keys()),
            }
            print(json.dumps(row, default=str))
            if newest is None or str(row["createdAt"] or "") > str(newest[0]["createdAt"] or ""):
                newest = (row, c)
    report["newest"] = newest[0] if newest else None
    if not newest:
        print("no screenshot card found")
        return 0

    # 2. Re-run the production vision call on that exact image.
    print("\n=== VISION PROBE on the newest screenshot ===")
    card = newest[1]
    img = requests.get(card["url"], timeout=30)
    img.raise_for_status()
    mime = img.headers.get("Content-Type") or "image/jpeg"
    print(f"image bytes={len(img.content)} mime={mime}")

    from ai_service import GeminiService
    svc = GeminiService()
    analysis = svc.analyze_images([(img.content, mime)])
    got = {k: analysis.get(k) for k in ("sourcePlatform", "sourceHandle", "sourceName")}
    print("model returned:", json.dumps(got))
    print("all keys returned:", sorted(analysis.keys()))
    print("follow-up classify_screenshot_platform:", repr(svc.classify_screenshot_platform([(img.content, mime)])))
    import re
    raw = str(analysis.get("sourceHandle") or "").strip()
    print("handle starts with @:", raw.startswith("@"), "| matches X rule:",
          bool(re.fullmatch(r"@?[A-Za-z0-9_]{1,15}", raw)))
    report["probe"] = got
    with open("pipeline-debug-report.json", "w") as f:
        json.dump(report, f, indent=2, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
