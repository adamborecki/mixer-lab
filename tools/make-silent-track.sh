#!/usr/bin/env bash
# Builds the COB gig's backing track: silence. COB's headsets carry the Vocal
# Jazz Ensemble's "Love Me or Leave Me" (audio/source-manifest.js, song "cob"),
# which has no accompaniment track, so the laptop on AUX IN 1/2 plays nothing.
# It still needs files on the song's timeline, cut like tools/make-excerpts.sh
# cuts a stem: the excerpt (same length as love-me's) and the 20 s segments
# with 0.5 s of overlap.
#
#   tools/make-silent-track.sh
#
# Requires ffmpeg (with libmp3lame) on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=audio/love-me
NAME=cob-track-silent
SONG_SECONDS=224          # LOVE_ME_SET.full.duration
EXCERPT_LENGTH=23.61      # LOVE_ME_SET.excerpt.duration
SEGMENT_SECONDS=20
SEGMENT_OVERLAP=0.5

# Mono at 22.05 kHz, 8 kb/s: silence needs no more (the browser resamples it,
# and a stereo channel takes one side for both).
silence() { ffmpeg -hide_banner -loglevel error -y -f lavfi -i "anullsrc=r=22050:cl=mono" -t "$1" -c:a libmp3lame -b:a 8k "$2"; }

mkdir -p "$OUT/full"
silence "$EXCERPT_LENGTH" "$OUT/$NAME.mp3"
k=0
while [ "$(echo "$k * $SEGMENT_SECONDS < $SONG_SECONDS" | bc)" = 1 ]; do
  a=$(echo "a = $k * $SEGMENT_SECONDS - $SEGMENT_OVERLAP; if (a < 0) a = 0; a" | bc)
  b=$(echo "b = ($k + 1) * $SEGMENT_SECONDS + $SEGMENT_OVERLAP; if (b > $SONG_SECONDS) b = $SONG_SECONDS; b" | bc)
  silence "$(echo "$b - $a" | bc)" "$OUT/full/$NAME-$(printf %02d $k).mp3"
  k=$((k + 1))
done
echo "$NAME: excerpt and $k segments"
du -ch "$OUT/$NAME.mp3" "$OUT"/full/$NAME-*.mp3 | tail -1
