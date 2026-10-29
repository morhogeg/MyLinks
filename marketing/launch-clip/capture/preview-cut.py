"""Cut the App Preview's three clips from the simulator takes.

  python3 capture/preview-cut.py TAKES_DIR public/clips/preview
      ->  save.mp4 ask.mp4 graph.mp4 (1080 wide, 30fps) + cuts.json

TAKES_DIR holds the simulator takes as 60fps CFR masters: S60.mp4 (the save
through the card, then its "See in graph") and R60.mp4 (Ask). They were
recorded with `xcrun simctl io <device> recordVideo --codec=h264` on the
iPhone 17 Pro Max simulator (1320 x 2868), signed into the review account,
and made CFR with `ffmpeg -i S.mp4 -vf fps=60 -crf 8 S60.mp4` (the recorder
writes a frame only on change; fps=60 repeats the still ones). Not in git.

Round 3 (owner: "improve jitter and smoothness"):
  - the simulator's web view scrolls at ~15fps (frame gaps of 50-70ms in
    the takes), so NO scroll is used: the card goes from its key moments to
    its Do this under a crossfade and a rendered whip (Preview.tsx);
  - everything else the app animates was captured at a steady 60fps; each
    output frame is the mean of two 60fps frames (tmix), a 180 degree
    shutter's motion blur, instead of dropping every other frame;
  - joins crossfade (`xf` frames, 1 = a cut) instead of jump-cutting;
  - the typing plays the 60fps character steps the take caught.

An item is ("seg", take, t0, t1, xf), a run of real time, or
("frames", take, [(frame60, n), ...], xf), single 60fps frames each shown n
output frames (the typing).
"""
import json
import subprocess
import sys
from pathlib import Path

TAKES_DIR = Path(sys.argv[1])
TAKES = {"S": TAKES_DIR / "S60.mp4", "R": TAKES_DIR / "R60.mp4"}

# the typed question, in the 60fps frames that each show one more character
TYPED_AT = 8910  # R60 frame of 148.50s
TYPING = [(TYPED_AT + i, 2) for i in (4, 6, 7, 8, 10, 12, 15, 16, 17, 19, 20, 24, 25)] + [(TYPED_AT + 26, 12)]

CLIPS = {
    # one continuous use: the link in Add to Machina, Save, the card built
    # live (fetch -> read -> summary -> connections), opened on its key
    # moments, then its Do this
    "save": [
        ("seg", "S", 17.35, 17.85, 0),    # the link in the field
        ("seg", "S", 23.45, 25.00, 1),    # Save; the sheet turns into "Fetching the video..." over its thumbnail
        ("seg", "S", 27.00, 28.45, 6),    # the sheet hands over to the feed, "Reading the page..."
        ("seg", "S", 30.20, 30.60, 5),    # "Writing the summary..."
        ("seg", "S", 40.22, 40.60, 5),    # ... 73%
        ("seg", "S", 44.80, 46.60, 5),    # "Searching connections...", the card lands, "Saved to Machina"
        ("seg", "S", 71.25, 74.00, 1),    # the tap that opens it; its key moments
        ("seg", "S", 104.20, 106.60, 8),  # its Do this (a still state: no scroll)
    ],
    # Ask: the field, the question typed, "Reviewing relevant cards...", the
    # answer with its source, all on one screen
    "ask": [
        ("seg", "R", 147.55, 148.55, 0),
        ("frames", "R", TYPING, 1),
        ("seg", "R", 161.00, 161.45, 6),
        ("seg", "R", 161.75, 165.20, 1),
    ],
    # the card's "See in graph": the graph builds around it, its links lit
    "graph": [
        ("seg", "S", 131.30, 136.60, 0),
    ],
}

FPS = 30
TAIL = "tmix=frames=2,fps=30,scale=1080:-2:flags=lanczos,format=yuv420p,settb=1/30,setpts=N/30/TB"


def build(name, items, out):
    inputs, chains, idx = [], [], {}

    def src(take):
        if take not in idx:
            idx[take] = len(inputs) // 2
            inputs.extend(["-i", str(TAKES[take])])
        return idx[take]

    lens, xfs = [], []
    for k, it in enumerate(items):
        kind, take = it[0], it[1]
        i = src(take)
        if kind == "seg":
            _, _, t0, t1, xf = it
            chains.append(f"[{i}:v]trim=start={t0}:end={t1},setpts=PTS-STARTPTS,{TAIL}[s{k}]")
            n = round((t1 - t0) * FPS)
        else:
            _, _, frames, xf = it
            parts = []
            for j, (fr, hold) in enumerate(frames):
                parts.append(f"[{i}:v]trim=start_frame={fr}:end_frame={fr + 1},setpts=PTS-STARTPTS,fps=30,loop=loop={hold - 1}:size=1:start=0,setpts=N/30/TB,scale=1080:-2:flags=lanczos,format=yuv420p,settb=1/30[f{k}_{j}]")
            chains.extend(parts)
            chains.append("".join(f"[f{k}_{j}]" for j in range(len(frames))) + f"concat=n={len(frames)}:v=1:a=0,settb=1/30,setpts=N/30/TB[s{k}]")
            n = sum(h for _, h in frames)
        lens.append(n)
        xfs.append(xf)

    # chain the segments: a crossfade of xf frames at each join
    starts, cur, total = [0], "[s0]", lens[0]
    for k in range(1, len(items)):
        xf = max(1, xfs[k])
        off = (total - xf) / FPS
        chains.append(f"{cur}[s{k}]xfade=transition=fade:duration={xf / FPS:.4f}:offset={off:.4f}[x{k}]")
        cur = f"[x{k}]"
        starts.append(total - xf)
        total += lens[k] - xf
    fc = ";".join(chains)
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", cur, "-c:v", "libx264", "-preset", "slow", "-crf", "8", "-g", "15", "-r", "30", str(out / f"{name}.mp4")]
    subprocess.run(cmd, check=True)
    got = int(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(out / f"{name}.mp4")], capture_output=True, text=True, check=True).stdout.strip().split(",")[0])
    return {"frames": got, "planned": total, "starts": starts, "lengths": lens}


if __name__ == "__main__":
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, items in CLIPS.items():
        report[name] = build(name, items, out)
        r = report[name]
        print(f"{name}: {r['frames']} frames (planned {r['planned']}), segments start at {r['starts']}")
    (out / "cuts.json").write_text(json.dumps(report, indent=2))
