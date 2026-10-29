"""Cut the App Preview's clips from the simulator takes.

  python3 capture/preview-cut.py TAKES_DIR public/clips/preview
      ->  save.mp4 revisit.mp4 askType.mp4 askAnswer.mp4 graph.mp4 + cuts.json

TAKES_DIR holds the simulator takes as 60fps CFR masters, recorded with
`xcrun simctl io <device> recordVideo --codec=h264` on the iPhone 17 Pro Max
simulator (1320 x 2868), signed into the review account, and made CFR with
`ffmpeg -i T.mp4 -vf fps=60 -crf 8 T60.mp4` (the recorder writes a frame only
on change; fps=60 repeats the still ones). Not in git (out/preview-takes/):
  T60  the clean feed (reminder and weekly strip dismissed), + -> the link ->
       Save -> the card built live -> landed -> opened on its key moments
  U60  Revisit (its Do this list), then the card's See in graph, settled
  R60  Ask: "Is my attention span really 8 seconds?" -> the answer

Smoothness (owner, rounds 3 and 4):
  - no scroll footage (the simulator's web view scrolls at ~15fps);
  - the graph only once settled (its build is what read as jitter);
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
TAKES = {k: TAKES_DIR / f"{k}60.mp4" for k in ("T", "U", "R")}

# R60: the question, one more character in each of these 60fps frames
TYPED_AT = 8910  # 148.50s
TYPING = [(TYPED_AT + i, 2) for i in (4, 6, 7, 8, 10, 12, 15, 16, 17, 19, 20, 24, 25)] + [(TYPED_AT + 26, 19)]

CLIPS = {
    # the save, the card built live, opened (+10 frames under the dissolve)
    "save": [
        ("seg", "T", 10.65, 11.45),    # the clean feed
        ("seg", "T", 11.45, 12.45),    # + : Add to Machina slides up
        ("seg", "T", 30.30, 31.10),    # the link in the field
        ("seg", "T", 68.45, 69.35),    # Save: the sheet turns to "Fetching the video..."
        ("seg", "T", 77.90, 79.97),    # "Watching the video..." 43-46%; the sheet hands over to the feed
        ("seg", "T", 83.40, 83.90),    # "Writing the summary..." 71%
        ("seg", "T", 105.62, 107.05),  # "Searching connections..." 80%; the card lands; "Saved to Machina"
        ("seg", "T", 124.95, 128.28),  # the tap that opens it: its key moments
    ],
    # Revisit: the Do this list (+10 under the dissolve)
    "revisit": [("seg", "U", 0.50, 3.83)],
    # Ask: the empty screen, the question typed
    "askType": [
        ("seg", "R", 147.25, 148.25),
        ("frames", "R", TYPING),
    ],
    # "Reviewing relevant cards...", then the answer and its source (+10)
    "askAnswer": [
        ("seg", "R", 160.20, 160.80),
        ("seg", "R", 161.80, 165.03),
    ],
    # the card's graph, settled (+12 under the Signature's paper)
    "graph": [("seg", "U", 50.70, 55.10)],
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
