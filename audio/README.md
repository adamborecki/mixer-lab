# Audio assets

Mixer Lab plays a short, looping excerpt of seven synchronized band stems ("Persephone"). This folder holds the web delivery files and the manifest that maps them to mixer inputs. For how the app loads and schedules them, see [../docs/AUDIO_ENGINE.md](../docs/AUDIO_ENGINE.md).

## Publication clearance (read before pushing)

The stems are a real band's recordings. The build spec requires confirming they are cleared for public use before they are published. **That has not been confirmed in this repository.** The course owner must confirm clearance before `audio/persephone/` is pushed to a public GitHub Pages site. If it is not cleared, keep the repo private or replace the files.

## Source and delivery

| | Source masters | Delivery files |
|---|---|---|
| Location | local, untracked `stems …/high res wav/` folder (see `.gitignore`) | `audio/persephone/*.mp3` |
| Format | stereo, 44.1 kHz, 24-bit WAV | stereo, 44.1 kHz, MP3, LAME VBR `-V4` |
| Length | ~238 s each | 29.905 s each |
| Size | ~63 MB each | ~3.8 MB for all seven |
| In git | No (gitignored for size, ~440 MB; kept on disk as masters) | Not ignored; committed with the site |

The masters are only ever read, never modified. MP3 was chosen because `decodeAudioData` supports it in every current browser. Bitrates run about 150-176 kb/s; the bass file is lower (about 79 kb/s) because VBR spends fewer bits on it.

| File | Manifest stem | Input | Size |
|---|---|---|---|
| `persephone-drums.mp3` | `drums` | 1 | 565 kB |
| `persephone-bass.mp3` | `bass` | 2 | 296 kB |
| `persephone-guitars.mp3` | `guitars` | 3 | 656 kB |
| `persephone-piano.mp3` | `piano` | 4 | 596 kB |
| `persephone-trumpets.mp3` | `trumpets` | 5 | 576 kB |
| `persephone-backing-vocals.mp3` | `backing-vocals` | 6 | 571 kB |
| `persephone-lead-vocals-doubles.mp3` | `lead-vocals` | 7 | 562 kB |

## Excerpt and loop

All seven files are cut from the same span of the original timeline, so they stay sample-locked.

| | In the original | In each file |
|---|---|---|
| File | 157.470 s to 187.375 s | 0 to 29.905 s |
| Loop | 157.970 s to 186.375 s (28.405 s) | 0.5 s to 28.905 s |

- The loop is 8 bars at about 67.6 bpm. It is the only stretch of the song where all seven stems, including the trumpets, play, which is why it is slightly under the 30-60 s target.
- The loop length was tuned by cross-correlating drum transients so the seam lines up.
- The file has 0.5 s of pre-roll and 1.0 s of post-roll so loop points never touch the file edges, even if a browser does not trim MP3 encoder delay. Every file has the same offset, so they stay locked either way.
- A 20 ms fade-in and 50 ms fade-out exist only at the file edges; they are never heard inside the loop.
- The app starts playback at the loop start (0.5 s) and loops 0.5 s to 28.905 s. These numbers live in `STEM_SET` in `source-manifest.js`.

## Levels

Each excerpt is peak-normalized (loudest channel) to -1 dBFS. `normalizeDb` is the gain that was applied; subtract it to recover the band's recorded balance. `monoPeakDb` and `monoRmsDb` are measured after the mono fold-down and feed the app's level model. Values below are from the manifest, which is authoritative.

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

Each mixer channel is mono. At load time `toMono` in `js/audio-engine.js` folds the stereo file with `treatment: "sum"`, which is (L+R)/2. `"left"` and `"right"` are available per stem in the manifest. Measured loss against stereo RMS is at most about 1.7 dB, except trumpets (about 3.3 dB, two uncorrelated parts). No phase cancellation was found. The files stay stereo so linked stereo channels can be added later.

## Regenerate

Requires `ffmpeg` (with `libmp3lame`) and `bc`. From the repo root:

```sh
tools/make-excerpts.sh
```

It reads the masters, writes `audio/persephone/*.mp3`, and prints a table (`normDb`, `monoPk`, `monoRms`). Paste those into `normalizeDb`, `monoPeakDb` and `monoRmsDb` in `source-manifest.js`. If you change `LOOP_START`, `LOOP_LENGTH` or the pre/post-roll in the script, update `STEM_SET.loop` and `STEM_SET.excerpt` to match. Filenames come from the script's `STEMS` list; keep them in step with `STEMS` in the manifest.

## Missing or failed files

If a file fails to fetch or decode, that channel plays a plain sine test tone so routing can still be tested, and a non-blocking error banner names the file. This is a development fallback only; the app never synthesizes music.
