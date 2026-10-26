#!/usr/bin/env bash
# Builds the karaoke gig's backing track (COB's until 2026-10-26): NOSTRADAMUS without its vocals, one
# stereo file per delivery file (the 8-bar excerpt and every full-song
# segment), so it plays sample-locked with the vocal stems it leaves out.
#
#   tools/make-backing-track.sh
#
# Works from the delivered mp3s in audio/nostradamus/ (not the WAV masters):
# each instrument file is summed side by side (L with L, R with R) at equal
# gain, which is the band's own balance because the stems were normalized
# alike (see audio/source-manifest.js). The sum is peak-normalized over the
# whole song to TARGET_PEAK_DB, and the excerpt and segments get the same gain,
# as make-excerpts.sh does with a song's stems. Prints the gain and the
# excerpt's measurements for the manifest.
#
# Requires ffmpeg (with libmp3lame) on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

DIR=audio/nostradamus
NAME=nostradamus-backing-track
PARTS=(drums bass guitar-rhythm guitar-lead guitar-bridge pads-fx)
TARGET_PEAK_DB=-1.0
MP3_QUALITY=4  # as the excerpts
FULL_QUALITY=5 # as the full-song segments
SEGMENTS=6

# ffmpeg arguments that sum PARTS of one file kind ("" = excerpt, "-NN" = a segment).
sum_args() {
  local suffix="$1" sub="$2" i=0 left="" right=""
  ARGS=()
  for p in "${PARTS[@]}"; do
    ARGS+=(-i "$DIR/$sub$NAME_PREFIX$p$suffix.mp3")
    left+="${left:++}c$((2 * i))"
    right+="${right:++}c$((2 * i + 1))"
    i=$((i + 1))
  done
  FILTER="amerge=inputs=${#PARTS[@]},pan=stereo|c0=$left|c1=$right,aformat=sample_fmts=fltp"
}
NAME_PREFIX=nostradamus-

peak_of() { # overall peak (dB) of the summed parts, before any gain
  sum_args "$1" "$2"
  ffmpeg -hide_banner -nostats "${ARGS[@]}" -filter_complex "$FILTER,astats=measure_perchannel=none:measure_overall=Peak_level" -c:a pcm_f32le -f null - 2>&1 |
    awk -F': ' '/Peak level dB/ {v=$2} END {print v}'
}

# The whole song's peak: the loudest segment.
song_peak=-200
for k in $(seq 0 $((SEGMENTS - 1))); do
  p=$(peak_of "-$(printf %02d "$k")" full/)
  song_peak=$(echo "if ($p > $song_peak) $p else $song_peak" | bc -l)
done
gain=$(echo "$TARGET_PEAK_DB - ($song_peak)" | bc -l)
printf "song peak %.2f dB → gain %.2f dB\n" "$song_peak" "$gain"

sum_args "" ""
ffmpeg -hide_banner -loglevel error -y "${ARGS[@]}" -filter_complex "$FILTER,volume=${gain}dB" \
  -map_metadata -1 -c:a libmp3lame -q:a "$MP3_QUALITY" "$DIR/$NAME.mp3"
for k in $(seq 0 $((SEGMENTS - 1))); do
  kk=$(printf %02d "$k")
  sum_args "-$kk" full/
  ffmpeg -hide_banner -loglevel error -y "${ARGS[@]}" -filter_complex "$FILTER,volume=${gain}dB" \
    -map_metadata -1 -c:a libmp3lame -q:a "$FULL_QUALITY" "$DIR/full/$NAME-$kk.mp3"
done

# Measurements for the manifest, over the whole song (as NOSTRADAMUS's stems).
song_files=()
for k in $(seq 0 $((SEGMENTS - 1))); do song_files+=(-i "$DIR/full/$NAME-$(printf %02d "$k").mp3"); done
concat="concat=n=$SEGMENTS:v=0:a=1,aformat=sample_fmts=flt"
ffmpeg -hide_banner -nostats "${song_files[@]}" -filter_complex "$concat,astats=measure_perchannel=none:measure_overall=Peak_level" -c:a pcm_f32le -f null - 2>&1 |
  awk -F': ' '/Peak level dB/ {v=$2} END {printf "peakDb %.2f\n", v}'
ffmpeg -hide_banner -nostats "${song_files[@]}" -filter_complex "$concat,pan=mono|c0=0.5*c0+0.5*c1,astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level" -c:a pcm_f32le -f null - 2>&1 |
  awk -F': ' '/Peak level dB/ {p=$2} /RMS level dB/ {r=$2} END {printf "monoPeakDb %.2f monoRmsDb %.2f\n", p, r}'
