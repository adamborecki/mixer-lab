#!/usr/bin/env bash
# Regenerates the browser delivery excerpts in audio/persephone/ from the
# high-resolution Persephone stems. The originals are read, never modified.
#
#   tools/make-excerpts.sh
#
# Requires ffmpeg (with libmp3lame) on PATH. Prints a measurement table whose
# numbers belong in audio/source-manifest.js (STEMS[…].normalizeDb /
# monoPeakDb / monoRmsDb) and audio/README.md.

set -euo pipefail
cd "$(dirname "$0")/.."

# The high-res masters live in a local, untracked "stems …/high res wav" folder.
SRC_DIR="${SRC_DIR:-$(ls -d stems*/"high res wav" 2>/dev/null | head -n 1)}"
[ -d "$SRC_DIR" ] || { echo "Set SRC_DIR to the folder holding the Persephone WAV stems." >&2; exit 1; }
OUT_DIR="audio/persephone"

# Timeline (seconds on the original, shared by every stem).
# The loop is the 8-bar phrase where the trumpets play (the only stretch of the
# song where all seven stems are active). Pre-roll / post-roll are extra audio
# around the loop so the browser loop points never touch the file edges, even
# if a decoder does not trim MP3 encoder delay.
LOOP_START=157.970   # downbeat where the trumpets enter
LOOP_LENGTH=28.405   # 8 bars at ~67.6 bpm, tuned so the seam lines up on the drums
PRE_ROLL=0.5
POST_ROLL=1.0

TARGET_PEAK_DB=-1.0  # each excerpt is peak-normalized (loudest channel) to this
MP3_QUALITY=4        # LAME VBR -V4 (~165 kb/s stereo)

EXCERPT_START=$(echo "$LOOP_START - $PRE_ROLL" | bc -l)
EXCERPT_LENGTH=$(echo "$PRE_ROLL + $LOOP_LENGTH + $POST_ROLL" | bc -l)

# original file name | web-safe delivery name
STEMS=(
  "Persephone DRUMS.wav|persephone-drums"
  "Persephone BASS.wav|persephone-bass"
  "Persephone GUITARS.wav|persephone-guitars"
  "Persephone PIANO.wav|persephone-piano"
  "Persephone TRUMPETS.wav|persephone-trumpets"
  "Persephone BACKING VOCALS.wav|persephone-backing-vocals"
  "Persephone LEAD VOX & DOUBLES.wav|persephone-lead-vocals-doubles"
)

mkdir -p "$OUT_DIR"

# Prints "<overall peak dB> <mono-sum peak dB> <mono-sum RMS dB>" for a filter chain.
measure() {
  local file="$1" pre="$2"
  local stereo mono
  stereo=$(ffmpeg -hide_banner -nostats -ss "$EXCERPT_START" -t "$EXCERPT_LENGTH" -i "$file" \
    -af "${pre}astats=measure_perchannel=none:measure_overall=Peak_level" -f null - 2>&1 |
    awk -F': ' '/Peak level dB/ {v=$2} END {print v}')
  mono=$(ffmpeg -hide_banner -nostats -ss "$EXCERPT_START" -t "$EXCERPT_LENGTH" -i "$file" \
    -af "${pre}pan=mono|c0=0.5*c0+0.5*c1,astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level" -f null - 2>&1 |
    awk -F': ' '/Peak level dB/ {p=$2} /RMS level dB/ {r=$2} END {print p, r}')
  echo "$stereo $mono"
}

printf "%-34s %9s %9s %9s %9s\n" "file" "normDb" "peakDb" "monoPk" "monoRms"
for entry in "${STEMS[@]}"; do
  src="${entry%%|*}"
  name="${entry##*|}"
  in="$SRC_DIR/$src"
  out="$OUT_DIR/$name.mp3"

  read -r peak _ _ <<<"$(measure "$in" "")"
  norm=$(echo "$TARGET_PEAK_DB - ($peak)" | bc -l)

  ffmpeg -hide_banner -loglevel error -y \
    -ss "$EXCERPT_START" -t "$EXCERPT_LENGTH" -i "$in" \
    -af "volume=${norm}dB,afade=t=in:d=0.02,afade=t=out:st=$(echo "$EXCERPT_LENGTH - 0.05" | bc -l):d=0.05" \
    -map_metadata -1 -c:a libmp3lame -q:a "$MP3_QUALITY" "$out"

  read -r _ monopk monorms <<<"$(measure "$in" "volume=${norm}dB,")"
  printf "%-34s %9.2f %9.2f %9.2f %9.2f\n" "$name.mp3" "$norm" "$TARGET_PEAK_DB" "$monopk" "$monorms"
done

echo
echo "excerpt: start ${EXCERPT_START}s, length ${EXCERPT_LENGTH}s"
echo "loop (in file): ${PRE_ROLL}s → $(echo "$PRE_ROLL + $LOOP_LENGTH" | bc -l)s"
ls -l "$OUT_DIR"
