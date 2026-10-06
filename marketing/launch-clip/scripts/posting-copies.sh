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
#
# CODEC=hevc10 for the films over ~45s: under that cap their H.264 runs
# below ~4 Mbps and the dark glows band (the encoder smooths away the
# set's dither, leaving 8-bit steps; the lockup's floor glow showed it).
# 10-bit HEVC at the same size keeps them as smooth as the master; it plays
# on Apple devices and uploads to Instagram, TikTok and YouTube (for X or
# LinkedIn, post the H.264 copy).
set -uo pipefail
cd "$(dirname "$0")/../out/final"
mkdir -p share
CODEC=${CODEC:-h264}
PIX=yuv420p; [ "$CODEC" = hevc10 ] && PIX=yuv420p10le
CONV="scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=$PIX"
TAGS=(-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv)
# (pass 1 and 2 differ only in the pass flags)
enc() { # <pass> <log>
  if [ "$CODEC" = hevc10 ]; then
    echo -c:v libx265 -preset slow -profile:v main10 -tag:v hvc1 -x265-params "pass=$1:stats=$2:aq-mode=3:log-level=error"
  else
    echo -c:v libx264 -preset slow -tune film -x264-params aq-mode=3 -pass "$1" -passlogfile "$2"
  fi
}
for n in "$@"; do
  m=$n.mp4
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$m")
  abr=$(ffprobe -v error -select_streams a:0 -show_entries stream=bit_rate -of csv=p=0 "$m")
  # 28.8 MiB in all, 1.5% for the container, the rest after the audio
  vbr=$(python3 -c "d=$dur; a=$abr; print(min(8000, int((28.8*8*1048576*0.985 - a*d)/d/1000)))")
  log=$(mktemp -u "/tmp/x264-$n-XXXX")
  # shellcheck disable=SC2046 (enc's words are the encoder's arguments)
  ffmpeg -v error -y -i "$m" -an -vf "$CONV" $(enc 1 "$log") -b:v "${vbr}k" \
    "${TAGS[@]}" -f mp4 /dev/null &&
  ffmpeg -v error -y -i "$m" -map 0:v:0 -map 0:a:0 -vf "$CONV" $(enc 2 "$log") -b:v "${vbr}k" \
    "${TAGS[@]}" -c:a copy -movflags +faststart "share/$m" &&
  echo "✓ $n ($CODEC): ${vbr}k video, $(stat -c %s "share/$m" | awk '{printf "%.1f", $1/1048576}') MiB" ||
  echo "✗ $n failed"
  rm -f "$log"*
done
