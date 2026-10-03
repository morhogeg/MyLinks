# Run a narration request (audio/narration-request.json) with Gemini TTS: the
# step .github/workflows/narration-tts.yml runs on GitHub, where the repo's
# GEMINI_API_KEY secret and Google's API are reachable. New takes land in
# audio/vo-takes/ (committed by the workflow); lines already there are re-used.

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
req = json.load(open(os.path.join(HERE, "narration-request.json")))

ok = True
if req.get("audition"):
    r = subprocess.run([sys.executable, os.path.join(HERE, "vo-audition.py"), *req["audition"]])
    ok = ok and r.returncode == 0
if req.get("takes"):
    r = subprocess.run([sys.executable, os.path.join(HERE, "vo-audition.py"), "--takes"])
    ok = ok and r.returncode == 0
for script in req.get("scripts", []):
    env = {**os.environ, "VO_ENGINE": "gemini", "GEMINI_VOICE": req.get("voice", "Sulafat")}
    # synth-vo exits 1 when a line overruns its caption window: the takes are
    # still kept (the picture is re-timed to them afterwards), so only a crash
    # counts as a failure here
    r = subprocess.run([sys.executable, os.path.join(HERE, "synth-vo.py"), script], env=env)
    ok = ok and r.returncode in (0, 1)
sys.exit(0 if ok else 1)
