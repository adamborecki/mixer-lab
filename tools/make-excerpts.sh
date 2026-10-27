#!/usr/bin/env bash
# Regenerates the browser delivery audio from a song's high-resolution stems.
# The originals are read, never modified. Two products per song:
#   audio/<song>/*.mp3       the 8-bar loop excerpt (scenarios, default)
#   audio/<song>/full/*.mp3  the whole song in 20 s segments (Free play option)
#
#   tools/make-excerpts.sh                          # Persephone, both
#   tools/make-excerpts.sh excerpt                  # Persephone, loop excerpt only
#   tools/make-excerpts.sh full                     # Persephone, full-song segments only
#   SONG=nostradamus tools/make-excerpts.sh         # NOSTRADAMUS (same options)
#   SONG=ftw tools/make-excerpts.sh                 # FTW (same options)
#   SONG=almost-like tools/make-excerpts.sh         # the Vocal Jazz Ensemble's two pieces
#   SONG=love-me tools/make-excerpts.sh
#
# Requires ffmpeg (with libmp3lame) on PATH. Prints a measurement table whose
# numbers belong in audio/source-manifest.js (STEMS[…].normalizeDb /
# monoPeakDb / monoRmsDb, and peakDb for a stereo stem) and audio/README.md.

set -euo pipefail
cd "$(dirname "$0")/.."

SONG="${SONG:-persephone}"
WHAT="${1:-all}"
PRE_ROLL=0.5
POST_ROLL=1.0
TARGET_PEAK_DB=-1.0  # each excerpt is peak-normalized (loudest channel) to this
MP3_QUALITY=4        # LAME VBR -V4 (~165 kb/s stereo)
# Full song: same per-stem gain as the excerpt minus FULL_TRIM_DB (the whole
# song peaks hotter than the excerpt); the app adds it back.
SEGMENT_SECONDS=20
SEGMENT_OVERLAP=0.5  # extra audio before/after each segment for crossfades
FULL_TRIM_DB=2
FULL_QUALITY=5       # LAME VBR -V5 (~90 kb/s on these stems)

# Per song: where the masters are (a local, untracked "stems …/high res wav"
# folder), the loop (seconds on the original, shared by every stem) and the
# stems ("original file name|web-safe delivery name").
case "$SONG" in
  persephone)
    MASTERS="stems for gio Persephone/high res wav"
    # The loop is the 8-bar phrase where the trumpets play (the only stretch of
    # the song where all seven stems are active).
    LOOP_START=157.970   # the 16th-note pickup where vocals and trumpets enter (downbeat 158.204)
    LOOP_LENGTH=28.405   # 8 bars at ~67.6 bpm, pickup to pickup, tuned on the drums
    NORM_SPAN=excerpt    # every stem plays in the excerpt, so normalize and measure there
    STEMS=(
      "Persephone DRUMS.wav|persephone-drums"
      "Persephone BASS.wav|persephone-bass"
      "Persephone GUITARS.wav|persephone-guitars"
      "Persephone PIANO.wav|persephone-piano"
      "Persephone TRUMPETS.wav|persephone-trumpets"
      "Persephone BACKING VOCALS.wav|persephone-backing-vocals"
      "Persephone LEAD VOX & DOUBLES.wav|persephone-lead-vocals-doubles"
    )
    ;;
  nostradamus)
    MASTERS="stems for will NOSTRADAMUS/high res wav"
    # 94 bpm exactly (bar 2.553191 s), first downbeat at 0.324 s. The loop is
    # bars 10-17, the lead guitar's eight bars over the band, starting 20 ms
    # before the downbeat (23.303 s) so the first hit isn't clipped.
    LOOP_START=23.283
    LOOP_LENGTH=20.425532  # 8 bars at 94 bpm
    # No 8 bars have everyone (the bridge guitar only plays in bars 26-33), so
    # each stem is normalized and measured over the whole song. Its peak is
    # then never above TARGET_PEAK_DB, and the full song needs no trim.
    NORM_SPAN=song
    FULL_TRIM_DB=0
    STEMS=(
      "NOSTRADAMUS Drums.wav|nostradamus-drums"
      "NOSTRADAMUS Bass.wav|nostradamus-bass"
      "NOSTRADAMUS Guitar (Rhythm).wav|nostradamus-guitar-rhythm"
      "NOSTRADAMUS Guitar (Lead).wav|nostradamus-guitar-lead"
      "NOSTRADAMUS Guitar (Bridge).wav|nostradamus-guitar-bridge"
      "NOSTRADAMUS Vox (BGV).wav|nostradamus-vox-bgv"
      "NOSTRADAMUS Vox (Main).wav|nostradamus-vox-main"
      "NOSTRADAMUS Vox (Harmony).wav|nostradamus-vox-harmony"
      "NOSTRADAMUS Pads & FX.wav|nostradamus-pads-fx"
    )
    ;;
  ftw)
    MASTERS="stems for caleb FTW/high res wav"
    # 70 bpm 4/4 (bar 3.428571 s), bar 1 at 1.1216 s, found from the drums and
    # checked against the percussion's entries. The loop is 6 bars (24 beats:
    # two turns of the drums' 12-beat pattern), bars 40-45: everyone but the
    # brass. It starts 20 ms before bar 40's downbeat.
    LOOP_START=134.816
    LOOP_LENGTH=20.571429  # 6 bars at 70 bpm
    # The brass plays for two bars only, the winds very quietly: normalize and
    # measure each stem over the whole song.
    NORM_SPAN=song
    FULL_TRIM_DB=0
    SONG_END=256  # the files run to 275.4 s; the last ring dies away by about 255 s
    STEMS=(
      "FTW_MIXED_v4.5_DRUMS STEM.wav|ftw-drums"
      "FTW_MIXED_v4.5_BASS STEM.wav|ftw-bass"
      "FTW_MIXED_v4.5_GUITAR STEM.wav|ftw-guitar"
      "FTW_MIXED_v4.5_PERCUSSION STEM.wav|ftw-percussion"
      "FTW_MIXED_v4.5_STRINGS STEM.wav|ftw-strings"
      "FTW_MIXED_v4.5_WINDS STEM.wav|ftw-winds"
      "FTW_MIXED_v4.5_VOCALS STEM.wav|ftw-vocals"
      "FTW_MIXED_v4.5_BRASS STEM.wav|ftw-brass"
      "FTW_MIXED_v4.5_SYNTHS STEM.wav|ftw-synths"
    )
    ;;
  almost-like | love-me)
    # The Chapman Vocal Jazz Ensemble live (2026-10-23): eleven mono handheld
    # tracks per piece, track n = the nth singer in the program. Recorded low
    # (peaks -11 to -21 dBFS), so every track of both pieces gets the same
    # +10 dB: the loudest peak lands near -1 dBFS and the singers keep their
    # own balance. No limiting. The song skips the dead air before the first
    # note and the applause after the last (SONG_START / SONG_END, seconds
    # on the original). Live tempo drifts, so each loop runs breath to breath
    # (every singer silent at both ends) and its length is the section's own
    # (`length` in the manifest); this is the excerpt's.
    NORM_SPAN=song
    SHARED_GAIN_DB=10
    FULL_TRIM_DB=0
    SINGERS=(allie karmyn magnolia abbey nina shayne paola jessica brandon michael silas)
    if [ "$SONG" = almost-like ]; then
      # "Almost Like Being in Love" (piece 1): a rubato intro, then swing at
      # about 124 bpm from 60.3 s. A mic check runs 0-11.5 s. The excerpt is
      # bars 64-78 (everyone), about 30 s from breath to breath.
      MASTERS="audio/VOCAL JAZZ NEW/VJ concert at MAN piece 1"
      PIECE=1
      SONG_START=20.0
      SONG_END=242.5
      LOOP_START=180.91
      LOOP_LENGTH=29.49
    else
      # "Love Me or Leave Me" (piece 2): a piano intro the vocal mics barely
      # hear, then swing at about 177 bpm. The excerpt is bars 40-71
      # (everyone), a whole 32-bar chorus from breath to breath.
      MASTERS="audio/VOCAL JAZZ NEW/VJ concert at MAN piece 2"
      PIECE=2
      SONG_START=45.0
      SONG_END=269.0
      LOOP_START=95.48
      LOOP_LENGTH=43.80
    fi
    STEMS=()
    for n in "${!SINGERS[@]}"; do
      STEMS+=("261023 MAN vocal jazz_$((n + 1))#02.$PIECE.wav|$SONG-$(printf %02d $((n + 1)))-${SINGERS[$n]}")
    done
    ;;
  *) echo "Unknown SONG '$SONG' (persephone, nostradamus, ftw, almost-like or love-me)." >&2; exit 1 ;;
esac

SRC_DIR="${SRC_DIR:-$MASTERS}"
[ -d "$SRC_DIR" ] || { echo "Set SRC_DIR to the folder holding the $SONG WAV stems." >&2; exit 1; }
OUT_DIR="audio/$SONG"
FULL_DIR="$OUT_DIR/full"

EXCERPT_START=$(echo "$LOOP_START - $PRE_ROLL" | bc -l)
EXCERPT_LENGTH=$(echo "$PRE_ROLL + $LOOP_LENGTH + $POST_ROLL" | bc -l)

mkdir -p "$OUT_DIR"

# Normalize and measure on the excerpt, or on the whole song (NORM_SPAN).
SONG_START="${SONG_START:-0}"
if [ "$NORM_SPAN" = song ]; then
  SPAN=(-ss "$SONG_START")
  [ -n "${SONG_END:-}" ] && SPAN+=(-t "$(echo "$SONG_END - $SONG_START" | bc -l)")
else SPAN=(-ss "$EXCERPT_START" -t "$EXCERPT_LENGTH"); fi

# Prints "<overall peak dB> <mono-sum peak dB> <mono-sum RMS dB>" for a filter chain.
measure() {
  local file="$1" pre="$2"
  local stereo mono fold="pan=mono|c0=0.5*c0+0.5*c1"
  [ "$(ffprobe -v error -show_entries stream=channels -of csv=p=0 "$file")" = 1 ] && fold="anull"
  stereo=$(ffmpeg -hide_banner -nostats ${SPAN[@]+"${SPAN[@]}"} -i "$file" \
    -af "${pre}astats=measure_perchannel=none:measure_overall=Peak_level" -f null - 2>&1 |
    awk -F': ' '/Peak level dB/ {v=$2} END {print v}')
  mono=$(ffmpeg -hide_banner -nostats ${SPAN[@]+"${SPAN[@]}"} -i "$file" \
    -af "${pre}$fold,astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level" -f null - 2>&1 |
    awk -F': ' '/Peak level dB/ {p=$2} /RMS level dB/ {r=$2} END {print p, r}')
  echo "$stereo $mono"
}

printf "%-34s %9s %9s %9s %9s\n" "file" "normDb" "peakDb" "monoPk" "monoRms"
mkdir -p "$FULL_DIR"
for entry in "${STEMS[@]}"; do
  src="${entry%%|*}"
  name="${entry##*|}"
  in="$SRC_DIR/$src"
  out="$OUT_DIR/$name.mp3"

  read -r peak _ _ <<<"$(measure "$in" "")"
  norm=$(echo "$TARGET_PEAK_DB - ($peak)" | bc -l)
  # One gain for every stem (SHARED_GAIN_DB) instead of peak-normalizing each.
  [ -n "${SHARED_GAIN_DB:-}" ] && norm=$SHARED_GAIN_DB

  if [ "$WHAT" != "full" ]; then
    ffmpeg -hide_banner -loglevel error -y \
      -ss "$EXCERPT_START" -t "$EXCERPT_LENGTH" -i "$in" \
      -af "volume=${norm}dB,afade=t=in:d=0.02,afade=t=out:st=$(echo "$EXCERPT_LENGTH - 0.05" | bc -l):d=0.05" \
      -map_metadata -1 -c:a libmp3lame -q:a "$MP3_QUALITY" "$out"
    read -r _ monopk monorms <<<"$(measure "$in" "volume=${norm}dB,")"
    printf "%-34s %9.2f %9.2f %9.2f %9.2f\n" "$name.mp3" "$norm" "$TARGET_PEAK_DB" "$monopk" "$monorms"
  fi

  if [ "$WHAT" != "excerpt" ]; then
    # Sample-exact segments: segment k covers song time [20k, 20k+20) plus
    # SEGMENT_OVERLAP on each side (none before 0 or after the end).
    rate=$(ffprobe -v error -show_entries stream=sample_rate -of csv=p=0 "$in")
    total=$(ffprobe -v error -show_entries stream=duration_ts -of csv=p=0 "$in")
    # A song can end before its files do (SONG_END, seconds), and start after
    # they do (SONG_START): song time 0 is SONG_START on the original.
    if [ -n "${SONG_END:-}" ]; then end=$(printf "%.0f" "$(echo "$SONG_END * $rate" | bc -l)"); [ "$end" -lt "$total" ] && total=$end; fi
    s0=$(printf "%.0f" "$(echo "$SONG_START * $rate" | bc -l)")
    total=$((total - s0))
    seg=$((SEGMENT_SECONDS * rate))
    pad=$(printf "%.0f" "$(echo "$SEGMENT_OVERLAP * $rate" | bc -l)")
    fullgain=$(echo "$norm - $FULL_TRIM_DB" | bc -l)
    k=0
    while [ $((k * seg)) -lt "$total" ]; do
      a=$((k * seg - pad)); [ $a -lt 0 ] && a=0
      b=$(((k + 1) * seg + pad)); [ $b -gt "$total" ] && b=$total
      ffmpeg -hide_banner -loglevel error -y -i "$in" \
        -af "atrim=start_sample=$((s0 + a)):end_sample=$((s0 + b)),asetpts=PTS-STARTPTS,volume=${fullgain}dB" \
        -map_metadata -1 -c:a libmp3lame -q:a "$FULL_QUALITY" "$FULL_DIR/$name-$(printf %02d $k).mp3"
      k=$((k + 1))
    done
    echo "  full: $k segments, gain $(printf %.2f "$fullgain") dB, $total samples @ $rate Hz"
  fi
done

echo
echo "excerpt: start ${EXCERPT_START}s, length ${EXCERPT_LENGTH}s"
echo "loop (in file): ${PRE_ROLL}s → $(echo "$PRE_ROLL + $LOOP_LENGTH" | bc -l)s"
du -sh "$OUT_DIR"/*.mp3 "$FULL_DIR" 2>/dev/null | tail -n 10
