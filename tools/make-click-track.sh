#!/usr/bin/env bash
# Builds the electroacoustic showcase's click track: a metronome on FTW's own
# beat grid (70 bpm, 4/4), so it plays sample-locked with the FTW stems that
# stand in for the showcase's sources (audio/source-manifest.js, song "ea").
#
#   tools/make-click-track.sh
#
# The grid was measured from FTW's drums: a downbeat at song time 134.846 s
# (0.03 s after the excerpt's loop start), then one every 4 × 60/70 s. A
# 1600 Hz blip on each downbeat, 1000 Hz on the other beats, 40 ms long, for
# the whole 256 s song. Cut like tools/make-excerpts.sh cuts a stem: the
# excerpt (same start and length as FTW's) and sample-exact 20 s segments with
# 0.5 s of overlap. Prints the measurements for the manifest.
#
# Requires ffmpeg (with libmp3lame) on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=audio/ftw
NAME=ftw-click
RATE=44100
SONG_SECONDS=256
BEAT=0.857142857142857     # 60/70 s
DOWNBEAT=134.846           # a measured downbeat, song time
EXCERPT_START=134.316      # FTW_SET.excerpt.originalStart
EXCERPT_LENGTH=22.071429   # FTW_SET.excerpt.duration
SEGMENT_SECONDS=20
SEGMENT_OVERLAP=0.5
MP3_QUALITY=4
FULL_QUALITY=5

mkdir -p "$OUT/full"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# The first beat at or after 0 s, and which beat number the downbeat is.
read -r T0 DOWN <<<"$(awk -v d="$DOWNBEAT" -v b="$BEAT" 'BEGIN { n = int(d / b); printf "%.6f %d\n", d - n * b, n % 4 }')"
# x: time since the latest beat; k: that beat's number.
X="(t-$T0-$BEAT*floor((t-$T0)/$BEAT))"
K="floor((t-$T0)/$BEAT)"
F="if(eq(mod($K\,4)\,$DOWN)\,1600\,1000)"
EXPR="gte(t\,$T0)*lt($X\,0.04)*0.89*sin(2*PI*$F*$X)*exp(-$X/0.009)"

ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc=exprs=$EXPR|$EXPR:s=$RATE:d=$SONG_SECONDS" -c:a pcm_s16le "$TMP/click.wav"

ffmpeg -hide_banner -loglevel error -y -ss "$EXCERPT_START" -t "$EXCERPT_LENGTH" -i "$TMP/click.wav" \
  -map_metadata -1 -c:a libmp3lame -q:a "$MP3_QUALITY" "$OUT/$NAME.mp3"

total=$((SONG_SECONDS * RATE))
seg=$((SEGMENT_SECONDS * RATE))
pad=$(printf "%.0f" "$(echo "$SEGMENT_OVERLAP * $RATE" | bc -l)")
k=0
while [ $((k * seg)) -lt "$total" ]; do
  a=$((k * seg - pad)); [ $a -lt 0 ] && a=0
  b=$(((k + 1) * seg + pad)); [ $b -gt "$total" ] && b=$total
  ffmpeg -hide_banner -loglevel error -y -i "$TMP/click.wav" \
    -af "atrim=start_sample=$a:end_sample=$b,asetpts=PTS-STARTPTS" \
    -map_metadata -1 -c:a libmp3lame -q:a "$FULL_QUALITY" "$OUT/full/$NAME-$(printf %02d $k).mp3"
  k=$((k + 1))
done

stats() {
  ffmpeg -hide_banner -nostats -i "$OUT/$NAME.mp3" -af "$1astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level" -f null - 2>&1 |
    awk -F': ' '/Peak level dB/ {p=$2} /RMS level dB/ {r=$2} END {print p, r}'
}
read -r peak _ <<<"$(stats "")"
read -r monopk monorms <<<"$(stats "pan=mono|c0=0.5*c0+0.5*c1,")"
echo "$NAME: first beat $T0 s, downbeats on beat n % 4 = $DOWN; $k segments"
echo "  manifest: peakDb $peak, monoPeakDb $monopk, monoRmsDb $monorms, normalizeDb 0"
