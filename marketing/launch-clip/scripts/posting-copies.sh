#!/usr/bin/env bash
# Posting copies of rendered films:
#   scripts/posting-copies.sh machina-reel machina-find …   (names in out/final/)
#   → out/final/share/<name>.mp4
#
# Why a second encode: Remotion's masters (JPEG frames, colorSpace "default")
# come out FULL-range BT.601 (yuvj420p). Players and upload pipelines that
# ignore the range tag read them as video range and crush everything under
# ~16/255 to black, and the night look lives down there (the set is #020203,
# the cards #121212). Remotion's own colorSpace "bt709" is no fix with JPEG
# frames: it reads the BT.601 frames as BT.709 and shifts saturated colors.
# So the copy converts properly here (BT.601 full → BT.709 video range,
# tagged), as two-pass H.264 under 28.8 MiB (the size a chat upload takes,
# and plenty for a feed); the master's AAC is copied untouched (its peaks
# were measured in the mp4, audio/mix-vo.mjs).
set -uo pipefail
cd "$(dirname "$0")/../out/final"
mkdir -p share
CONV="scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p"
TAGS=(-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv)
X264=(-c:v libx264 -preset slow -tune film -x264-params aq-mode=3)
for n in "$@"; do
  m=$n.mp4
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$m")
  abr=$(ffprobe -v error -select_streams a:0 -show_entries stream=bit_rate -of csv=p=0 "$m")
  # 28.8 MiB in all, 1.5% for the container, the rest after the audio
  vbr=$(python3 -c "d=$dur; a=$abr; print(min(8000, int((28.8*8*1048576*0.985 - a*d)/d/1000)))")
  log=$(mktemp -u "/tmp/x264-$n-XXXX")
  ffmpeg -v error -y -i "$m" -an -vf "$CONV" "${X264[@]}" -b:v "${vbr}k" -pass 1 -passlogfile "$log" \
    "${TAGS[@]}" -f mp4 /dev/null &&
  ffmpeg -v error -y -i "$m" -map 0:v:0 -map 0:a:0 -vf "$CONV" "${X264[@]}" -b:v "${vbr}k" -pass 2 -passlogfile "$log" \
    "${TAGS[@]}" -c:a copy -movflags +faststart "share/$m" &&
  echo "✓ $n: ${vbr}k video, $(stat -c %s "share/$m" | awk '{printf "%.1f", $1/1048576}') MiB" ||
  echo "✗ $n failed"
  rm -f "$log"*
done
