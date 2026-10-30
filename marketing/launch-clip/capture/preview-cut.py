"""Cut the App Preview's clips from the simulator takes.

  python3 capture/preview-cut.py out/preview-takes public/clips/preview
      ->  save.mp4 revisit.mp4 askType.mp4 askAnswer.mp4 graph.mp4 + cuts.json

TAKES_DIR holds the simulator takes as 60fps CFR masters, recorded with
`xcrun simctl io <device> recordVideo --codec=h264` on the iPhone 17 Pro Max
simulator (1320 x 2868), signed into the review account, and made CFR with
`ffmpeg -i W.mp4 -vf fps=60 -crf 8 W60.mp4` (the recorder writes a frame only
on change; fps=60 repeats the still ones). Not in git (out/preview-takes/):
  W60  round 5: the feed opening on Kurzgesagt and TED (the Manson test
       cards archived), + -> a Wait But Why article's link -> Save -> the
       analysis stepper (Fetching the link, Reading the page, Writing the
       summary, Searching connections, Organizing & tagging) -> the card on
       the feed -> Revisit, its new Do this on top
  X60  round 5: Ask: "Briefly, how is procrastination linked to phone
       addiction?" -> an answer citing three saves from three channels ->
       its Graph chip -> the three cited cards, linked
  (T60, U60, R60: round 4's takes)

Smoothness (owner, rounds 3 and 4):
  - no scroll footage (the simulator's web view scrolls at ~15fps);
  - the graph only once settled (its build is what read as jitter), and
    as ONE held frame (round 5: the "settled" graph still twitches, ~50/255
    jumps every few frames; held, it is perfectly still and the camera
    carries the motion);
  - only the stepper's forward steps (in W it reached "Searching
    connections" at 63.0s, fell back to "Writing the summary" at 70.4s, and
    advanced again at 73.2s: the cut skips the fall-back);
  - every other 60fps frame, crisp (round 4: a two-frame mean doubled the
    text of fast UI moves, the sheet's morph, instead of blurring it);
  - joins are hard cuts where the screen is still on both sides (a fade
    between two different texts ghosts them); the composition dissolves
    between clips.

An item is ("seg", take, t0, t1), a run of real time, or
("frames", take, [(frame60, n), ...]), single 60fps frames each shown n
output frames (the typing: the simulator lands several characters a frame).
"""
import json
import subprocess
import sys
from pathlib import Path

TAKES_DIR = Path(sys.argv[1])
TAKES = {k: TAKES_DIR / f"{k}60.mp4" for k in ("W", "X")}

# X60: the question; each of these 60fps frames shows more of it
# ("Brie", "Briefl", "Briefly,", ... "addiction?")
TYPED = (9669, 9672, 9674, 9675, 9677, 9680, 9682, 9685, 9689, 9692, 9694, 9698,
         9701, 9704, 9705, 9707, 9708, 9709, 9710, 9714, 9715, 9716)
TYPING = [(f, 2) for f in TYPED[:-1]] + [(TYPED[-1], 14)]

# X60: the settled graph, held (255.55s, a frame between two of its twitches)
GRAPH_FRAME = 15333

CLIPS = {
    # the save: the feed, +, the link, Save, the stepper's five beats, the
    # card on the feed (+10 frames under the dissolve)
    "save": [
        ("seg", "W", 12.62, 13.42),    # the feed: Kurzgesagt, TED
        ("seg", "W", 13.42, 14.15),    # + : Add to Machina slides up
        ("seg", "W", 31.58, 32.50),    # the link pasted; Save turns on
        ("seg", "W", 47.05, 48.40),    # Save: the stepper, "Fetching the link", the site's icon
        ("seg", "W", 50.80, 51.40),    # "Reading the page"
        ("seg", "W", 55.80, 56.40),    # "Writing the summary"
        ("seg", "W", 62.80, 63.40),    # "Searching connections"
        ("seg", "W", 74.55, 76.15),    # every step done, "Saved to Machina", the sheet closes
        ("seg", "W", 76.15, 77.65),    # the new card on top of the feed
    ],
    # Revisit: the Do this list, the new save's task on top (+10)
    "revisit": [("seg", "W", 128.00, 131.40)],
    # Ask: the empty screen, the question typed
    "askType": [
        ("seg", "X", 160.20, 161.10),
        ("frames", "X", TYPING),
    ],
    # "Reviewing relevant cards...", "Writing your answer...", the answer and
    # its three sources, settled (+10)
    "askAnswer": [
        ("seg", "X", 186.45, 187.05),
        ("seg", "X", 189.00, 189.50),
        ("seg", "X", 197.95, 202.12),
    ],
    # the three cited cards, linked: one held frame (+14 under the Signature's paper)
    "graph": [("frames", "X", [(GRAPH_FRAME, 116)])],
}

FPS = 30
TAIL = "fps=30,scale=1080:-2:flags=lanczos,format=yuv420p,settb=1/30,setpts=N/30/TB"


def build(name, items, out):
    inputs, chains, idx = [], [], {}

    def src(take):
        if take not in idx:
            idx[take] = len(inputs) // 2
            inputs.extend(["-i", str(TAKES[take])])
        return idx[take]

    lens = []
    for k, it in enumerate(items):
        i = src(it[1])
        if it[0] == "seg":
            _, _, t0, t1 = it
            chains.append(f"[{i}:v]trim=start={t0}:end={t1},setpts=PTS-STARTPTS,{TAIL}[s{k}]")
            lens.append(round((t1 - t0) * FPS))
        else:
            _, _, frames = it
            for j, (fr, hold) in enumerate(frames):
                chains.append(f"[{i}:v]trim=start_frame={fr}:end_frame={fr + 1},setpts=PTS-STARTPTS,fps=30,loop=loop={hold - 1}:size=1:start=0,setpts=N/30/TB,scale=1080:-2:flags=lanczos,format=yuv420p,settb=1/30[f{k}_{j}]")
            chains.append("".join(f"[f{k}_{j}]" for j in range(len(frames))) + f"concat=n={len(frames)}:v=1:a=0,settb=1/30,setpts=N/30/TB[s{k}]")
            lens.append(sum(h for _, h in frames))
    # hard cuts throughout
    chains.append("".join(f"[s{k}]" for k in range(len(items))) + f"concat=n={len(items)}:v=1:a=0,settb=1/30,setpts=N/30/TB[v]")
    starts = [sum(lens[:k]) for k in range(len(lens))]
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(chains), "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "8", "-g", "15", "-r", "30", str(out / f"{name}.mp4")]
    subprocess.run(cmd, check=True)
    got = int(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(out / f"{name}.mp4")], capture_output=True, text=True, check=True).stdout.strip().split(",")[0])
    return {"frames": got, "planned": sum(lens), "starts": starts, "lengths": lens}


if __name__ == "__main__":
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, items in CLIPS.items():
        report[name] = build(name, items, out)
        r = report[name]
        print(f"{name}: {r['frames']} frames (planned {r['planned']}), segments start at {r['starts']}")
    (out / "cuts.json").write_text(json.dumps(report, indent=2))
