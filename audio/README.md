# Audio assets

Mixer Lab plays seven synchronized band stems ("Persephone"): a short looping excerpt in the scenarios, and the whole song in Free play. This folder holds the web delivery files and the manifest that maps them to mixer inputs. For how the app loads, streams and schedules them, see [../docs/AUDIO_ENGINE.md](../docs/AUDIO_ENGINE.md).

## Public use

The stems are a real band's recordings. The course owner has confirmed that they may be used publicly, both the excerpt and the full mix, so `audio/persephone/` (including `full/`) is committed with the site. Only the high-resolution WAV masters stay local and gitignored, because of their size (about 440 MB), not because of permissions.

## Source and delivery

| | Source masters | Loop excerpt | Full-song segments |
|---|---|---|---|
| Location | local, untracked `stems …/high res wav/` folder (see `.gitignore`) | `audio/persephone/*.mp3` | `audio/persephone/full/*.mp3` |
| Format | stereo, 44.1 kHz, 24-bit WAV | stereo, 44.1 kHz, MP3, LAME VBR `-V4` | same, LAME VBR `-V5` |
| Length | ~238 s each | 29.905 s each | 12 segments per stem, 84 files |
| Size | ~63 MB each | ~3.8 MB for all seven | ~18 MB for all 84 (19.0 million bytes) |
| Used by | nothing at run time | every scenario, and Free play's "8-bar loop" | Free play's "Full song" only |
| In git | No (gitignored for size, ~440 MB; kept on disk as masters) | Not ignored; committed with the site | Not ignored; committed with the site |

The masters are only ever read, never modified. MP3 was chosen because `decodeAudioData` supports it in every current browser. Excerpt bitrates run about 150-176 kb/s; the bass file is lower (about 79 kb/s) because VBR spends fewer bits on it. The `-V5` segments average roughly 90 kb/s.

| File | Manifest stem | Input | Size |
|---|---|---|---|
| `persephone-drums.mp3` | `drums` | 1 | 565 kB |
| `persephone-bass.mp3` | `bass` | 2 | 296 kB |
| `persephone-guitars.mp3` | `guitars` | 3 | 656 kB |
| `persephone-piano.mp3` | `piano` | 4 | 596 kB |
| `persephone-trumpets.mp3` | `trumpets` | 5 | 576 kB |
| `persephone-backing-vocals.mp3` | `backing-vocals` | 6 | 571 kB |
| `persephone-lead-vocals-doubles.mp3` | `lead-vocals` | 7 | 562 kB |

### Full-song segments

Each stem is cut into 20 s segments so the app can stream the song one segment ahead instead of holding seven full-length stems in memory. Segment `k` covers song time `[20k, 20k + 20)` plus 0.5 s of overlap on each side (none before 0:00 or after the end), so neighbouring segments can be crossfaded. There are 12 per stem (`STEM_SET.full.segments`); the last covers 220 s to the end at 238.222 s, so it is shorter (18.72 s with its overlap). Files are named `<stem file without .mp3>-NN.mp3`, for example `persephone-drums-00.mp3` to `persephone-drums-11.mp3`. Cuts are sample-exact, so every stem's segments line up on the same song clock.

## Excerpt and loop

All seven files are cut from the same span of the original timeline, so they stay sample-locked.

| | In the original | In each file |
|---|---|---|
| File | 157.470 s to 187.375 s | 0 to 29.905 s |
| Loop | 157.970 s to 186.375 s (28.405 s) | 0.5 s to 28.905 s |

- The song is about 67.6 bpm in 4/4 with a 16th-note feel. The loop is exactly 8 bars, from the 16th-note pickup at 157.970 s (the downbeat follows at 158.204 s) to the matching pickup 8 bars later. It is the only stretch of the song where all seven stems, including the trumpets, play, which is why it is slightly under the 30-60 s target.
- The loop length was tuned by cross-correlating drum transients so the seam lines up, and the loop points were re-checked with beat analysis. They are unchanged.
- The file has 0.5 s of pre-roll and 1.0 s of post-roll so loop points never touch the file edges, even if a browser does not trim MP3 encoder delay. Every file has the same offset, so they stay locked either way.
- A 20 ms fade-in and 50 ms fade-out exist only at the file edges; they are never heard inside the loop.
- The app starts playback at the loop start (0.5 s) and loops 0.5 s to 28.905 s. These numbers live in `STEM_SET` in `source-manifest.js`.

## Levels

Each excerpt is peak-normalized (loudest channel) to -1 dBFS. `normalizeDb` is the gain that was applied; subtract it to recover the band's recorded balance. `monoPeakDb` and `monoRmsDb` are measured after the mono fold-down and feed the app's level model. Values below are from the manifest, which is authoritative.

The full-song segments use the same per-stem gain minus `trimDb` (2 dB, `FULL_TRIM_DB` in the script), because the whole song peaks up to about 1.6 dB hotter than the excerpt and would otherwise exceed full scale. The app adds `trimDb` back when it folds a segment to mono, so the level model, gain staging and meters behave the same on the loop and on the full song. Measured stem gains matched the excerpt's `normalizeDb`.

| Stem | normalizeDb | monoPeakDb | monoRmsDb |
|---|---|---|---|
| drums | 6.56 | -1.07 | -19.40 |
| bass | 10.15 | -1.00 | -17.81 |
| guitars | 10.49 | -2.52 | -15.42 |
| piano | 18.71 | -3.04 | -15.92 |
| trumpets | 15.05 | -4.60 | -22.71 |
| backing-vocals | 10.34 | -2.80 | -17.58 |
| lead-vocals | 9.75 | -1.73 | -14.26 |

## Mono

Each mixer channel is mono. At load time `toMono` in `js/transport.js` folds the stereo file with `treatment: "sum"`, which is (L+R)/2 (and applies `trimDb` to full-song segments). `"left"` and `"right"` are available per stem in the manifest. Measured loss against stereo RMS is at most about 1.7 dB, except trumpets (about 3.3 dB, two uncorrelated parts). No phase cancellation was found. The files stay stereo so linked stereo channels can be added later.

## Regenerate

Requires `ffmpeg` (with `libmp3lame`), `ffprobe` and `bc`. From the repo root:

```sh
tools/make-excerpts.sh            # both
tools/make-excerpts.sh excerpt    # loop excerpt only
tools/make-excerpts.sh full       # full-song segments only
```

It reads the masters and writes `audio/persephone/*.mp3` (excerpt) and `audio/persephone/full/*-NN.mp3` (segments). The excerpt pass prints a table (`normDb`, `monoPk`, `monoRms`); paste those into `normalizeDb`, `monoPeakDb` and `monoRmsDb` in `source-manifest.js`. The full pass prints one line per stem with its segment count and gain.

- If you change `LOOP_START`, `LOOP_LENGTH` or the pre/post-roll in the script, update `STEM_SET.loop` and `STEM_SET.excerpt` to match.
- If you change `SEGMENT_SECONDS`, `SEGMENT_OVERLAP` or `FULL_TRIM_DB`, update `segmentSeconds`, `overlap` and `trimDb` in `STEM_SET.full`; `duration` and `segments` follow from the master's length.
- Filenames come from the script's `STEMS` list; keep them in step with `STEMS` in the manifest.

## Missing or failed files

If a file fails to fetch or decode (the excerpt, or any full-song segment), that stem plays a plain sine test tone for that stretch so routing can still be tested, and a non-blocking error banner names the file. This is a development fallback only; the app never synthesizes music.
