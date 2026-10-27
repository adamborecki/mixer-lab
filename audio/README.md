# Audio assets

Mixer Lab has three bands, each a set of synchronized stems: "Persephone" (Giovanna, seven stems), "NOSTRADAMUS" (Will Tulip, nine stems) and "FTW" (after juno, nine instrument-group stems), and the Vocal Jazz Ensemble live in two pieces (eleven handheld mics each, [described at the end](#the-vocal-jazz-ensemble-live)). A scenario names its band (`song`, Persephone if none); Free play lets the student pick. Each plays a short looping section in the scenarios, and the whole song in Free play. This folder holds the web delivery files and the manifest that maps them to mixer inputs. For how the app loads, streams and schedules them, see [../docs/AUDIO_ENGINE.md](../docs/AUDIO_ENGINE.md). NOSTRADAMUS and FTW are described [at the end](#nostradamus-will-tulip); everything before them is Persephone.

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

## Announcement (voice)

`audio/voice/announcement-adam.mp3`: Adam Borecki making an announcement, 14.7 s, mono MP3 (`-q:a 4`). It stands in for the lead vocal mic in the speech and MC scenarios (`VOICES` in the manifest, `stage.voice` on a scenario). From the original `new talking - announcement - adam borecki.m4a` (kept locally, untracked, in the masters folder under `voice masters/`): leading silence trimmed, 70 Hz high-pass, gentle compression (3:1 from −26 dB), +16.5 dB and a limiter, so its average matches the sung lead vocal and its peak sits at about the lead vocal stem's (−1.9 dBFS vs −1.73). A 3 s pause is padded on the end so it repeats like someone pausing between announcements.

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

## Other 8-bar sections

So the scenarios don't all play the same 28 seconds, the app also loops other 8-bar stretches of the song (`STEM_SET.sections`). Each is stitched in the browser from the 2–3 full-song segments under it into a buffer laid out like an excerpt file (0.5 s pre-roll, the 8 bars, 1 s post-roll), so the same loop points work. A 30 ms crossfade into the pre-roll is baked in at the loop end, so the wrap is seamless. Stitching the excerpt's own span this way matches the excerpt file sample for sample, at the same level.

Sections start on the excerpt's bar grid (downbeat 158.204 s, bar 3.550625 s, loop starting 0.234 s before a downbeat). Which stems play in each was measured per bar from the segments (RMS above −48 dBFS):

| Section | Starts | Playing | Partly or not at all |
|---|---|---|---|
| bars 5–12 | 0:15.9 | bass, guitars, piano, lead vocal | no drums, backing vocals or trumpets |
| bars 17–24 | 0:58.6 | drums, bass, guitars, lead vocal | backing vocals in some bars; no piano or trumpets |
| bars 25–32 | 1:27.0 | drums, bass, guitars, piano, lead vocal | backing vocals in some bars; no trumpets |
| bars 37–44 | 2:09.6 | drums, bass, guitars, backing vocals, lead vocal | no piano or trumpets |
| bars 45–52 (the excerpt) | 2:38.0 | everyone, trumpets too | |
| bars 53–60 | 3:06.4 | everyone but the trumpets | |

Each scenario loops a section where every instrument it mentions (in its checks or its text) plays, chosen by its id so the choice is stable (`js/music.js`). A scenario can pin one with `music: "<section id>"`. Free play lets the student choose. The scenario card says which bars are looping and who sits out.

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
SONG=nostradamus tools/make-excerpts.sh   # the other bands (same options)
SONG=ftw tools/make-excerpts.sh
```

The karaoke gig's backing track (NOSTRADAMUS without its vocals; COB used it until 2026-10-26) is built from the delivered mp3s, not the masters: `tools/make-backing-track.sh` sums the instrument files side by side, peak-normalizes over the whole song, writes `audio/nostradamus/nostradamus-backing-track.mp3` and its segments, and prints the numbers for its `KARAOKE_STEMS` entry.

It reads the masters and writes `audio/persephone/*.mp3` (excerpt) and `audio/persephone/full/*-NN.mp3` (segments). The excerpt pass prints a table (`normDb`, `monoPk`, `monoRms`); paste those into `normalizeDb`, `monoPeakDb` and `monoRmsDb` in `source-manifest.js`. The full pass prints one line per stem with its segment count and gain.

- If you change `LOOP_START`, `LOOP_LENGTH` or the pre/post-roll in the script, update `STEM_SET.loop` and `STEM_SET.excerpt` to match.
- If you change `SEGMENT_SECONDS`, `SEGMENT_OVERLAP` or `FULL_TRIM_DB`, update `segmentSeconds`, `overlap` and `trimDb` in `STEM_SET.full`; `duration` and `segments` follow from the master's length.
- Filenames come from the script's `STEMS` list; keep them in step with `STEMS` in the manifest.

## Preshow music

`preshow/joth-bossa-nova.mp3` is "Bossa Nova" by Joth ([OpenGameArt](https://opengameart.org/content/bossa-nova), CC0; original filename `8bit Bossa.mp3`): stereo, 44.1 kHz, 160 kb/s, 59.6 s. It is listed as `PRESHOW` in the manifest but not yet used by the app; the plan is a stereo input 9/10 fed by a laptop on its own loop, independent of the band timeline (see [../docs/HANDOFF.md](../docs/HANDOFF.md)).

## NOSTRADAMUS (Will Tulip)

Nine stems from Will Tulip's band, cleared by the course owner for public use (excerpt and full song), so `audio/nostradamus/` is committed like Persephone's. The masters (stereo, 48 kHz, 24-bit, 109.787 s, about 32 MB each) stay local and gitignored in `stems for will NOSTRADAMUS/high res wav/`.

| File | Stem | Source (input) | Notes |
|---|---|---|---|
| `nostradamus-drums.mp3` | `drums` | `drums` (1) | |
| `nostradamus-bass.mp3` | `bass` | `bass` (2) | silent in the bridge, bars 26–33 |
| `nostradamus-guitar-rhythm.mp3` | `guitar-rhythm` | `guitars` (3) | |
| `nostradamus-guitar-lead.mp3` | `guitar-lead` | `lead-guitar` (4) | bars 10–17 and the outro |
| `nostradamus-guitar-bridge.mp3` | `guitar-bridge` | `bridge-guitar` (5) | only in the bridge, bars 26–33 |
| `nostradamus-vox-bgv.mp3` | `vox-bgv` | `backing-vocals` (6) | never a full 8 bars |
| `nostradamus-vox-main.mp3` | `vox-main` | `lead-vocal` (7) | stops at the outro |
| `nostradamus-vox-harmony.mp3` | `vox-harmony` | `harmony-vocal` (8) | |
| `nostradamus-pads-fx.mp3` | `pads-fx` | `pads` (9/10, stereo) | kept stereo (`treatment: "stereo"`) |

The parts both bands have (drums, bass, guitars, backing-vocals, lead-vocal) use the same source ids and input numbers, so scenarios written for those work with either band. Eight mono inputs and a stereo 9/10 is exactly Mixer A and B.

- **Timeline.** 94 bpm exactly, 4/4: bar 1's downbeat is at 0.324 s and a bar is 2.553191 s (found from the drums' onsets and the kick's beat-in-bar energy). 43 bars, counting the pickup as bar 0.
- **Loops.** Every 8-bar loop is 20.425532 s and starts 20 ms before its downbeat. The excerpt file is bars 10–17 (song time 22.783 s to 44.709 s, with the same 0.5 s pre-roll and 1 s post-roll as Persephone's), so the same loop points (0.5 s to 20.926 s in the file) apply.
- **Normalization.** No 8 bars have the whole band (the bridge guitar only plays in bars 26–33), so each stem is peak-normalized to −1 dBFS over the whole song, and its `monoPeakDb` / `monoRmsDb` are measured over the whole song too (`NORM_SPAN=song` in the script). The masters already peaked at −0.1 dBFS, so every stem's gain is −0.9 to −1.0 dB: equal faders give the band's own balance. The full song therefore needs no trim (`trimDb: 0`).
- **Stereo pads.** The pads and effects have very different sides (L/R correlation −0.15; a mono sum would lose 3.7 dB), so they stay stereo all the way to stereo input 9/10, in time with the band. `peakDb` is the louder side's peak. The backing vocals are wide too (−4.7 dB in mono), but they are a vocal mic and fold to mono like the rest.
- **Sizes.** Excerpt about 2.9 MB for all nine; full song 6 segments per stem, 54 files, about 11 MB.

Sections (`STEM_SET.sections`), measured per bar from the masters (RMS above −48 dBFS):

| Section | Starts | Playing | Partly |
|---|---|---|---|
| bars 2–9 | 0:02.9 | drums, bass, lead and harmony vocal, pads | rhythm guitar, backing vocals |
| bars 10–17 (the excerpt) | 0:23.3 | drums, bass, lead and rhythm guitar, pads | the three vocals |
| bars 18–25 | 0:43.7 | drums, bass, lead and harmony vocal | rhythm guitar, pads, backing vocals |
| bars 26–33 | 1:04.1 | bridge and rhythm guitar, lead vocal | drums, pads, harmony |
| bars 35–42 | 1:27.1 | bass, lead and rhythm guitar, pads | drums, backing vocals, harmony |

Regenerate with `SONG=nostradamus tools/make-excerpts.sh` (same `excerpt` / `full` options).

Musicians: it's Will's studio recording, not a live performance. He played, sang and recorded every part (the pads and effects are digital and analog recordings with heavy post-production), produced it, and mixed and mastered it, so every channel's `musician` is Will Tulip.

## FTW (after juno)

after juno's first single (September 2026). Nine instrument-group stems from Caleb Cox's mix (`FTW_MIXED_v4.5_… STEM.wav`), cleared by the course owner for public use, so `audio/ftw/` is committed. The masters (stereo, 48 kHz, 24-bit, 275.4 s) stay local and gitignored in `stems for caleb FTW/high res wav/`. Each stem is a whole section, so on stage each is one section mic or line:

| Stem | Source (input) | On stage | Notes |
|---|---|---|---|
| `drums` | `drums` (1) | overhead condenser | only bars 37–56 |
| `bass` | `bass` (2) | DI | |
| `guitar` | `guitars` (3) | amp mic | from bar 37 |
| `percussion` | `percussion` (4) | overhead condenser | |
| `strings` | `strings` (5) | section condenser | |
| `winds` | `winds` (6) | section condenser | very quiet: its fader sits about 22 dB under the drums' |
| `vocals` | `lead-vocal` (7) | vocal mic | |
| `brass` | `brass` (8) | section dynamic | two bars only, 16–17 |
| `synths` | `synths` (9/10, stereo) | laptop | kept stereo |

- **Timeline.** 70 bpm 4/4: bar 1's downbeat is at 1.1216 s, a bar is 3.428571 s. Fitted on the drums (70.00 bpm; their second half lands within 12 ms of the first half's grid) and checked against the percussion, whose entries fall on bar lines (bar 20) and whose strongest windows share the drums' beat phase. The song has died away by 256 s, so the full song ends there (`SONG_END` in the script); the files run on to 275.4 s.
- **Loops.** The drums' pattern repeats every 12 beats, so every loop is **6 bars** (24 beats, 20.571 s: two turns of it), starting 20 ms before its downbeat. The excerpt file is bars 40–45, everyone but the brass. Seam check: the drums and percussion just after each loop's end line up with those just after its start within about ±20 ms either way, which is the players' own timing; the loop's 30 ms crossfade covers it.
- **Levels.** Each stem is peak-normalized to −1 dBFS over the song (`normalizeDb` 6 to 21 dB for the quieter groups), so each section mic gain-stages like any other. Each source's `mixDb` then restores Caleb's balance: the gain its stem got relative to the drums, 3 dB under unity. The full song needs no trim.
- **Sizes.** Excerpt about 3.3 MB for all nine; full song 13 segments per stem, 117 files, about 21 MB.

| Section | Starts | Playing | Partly |
|---|---|---|---|
| bars 9–14 | 0:28.5 | bass, synths, vocals | strings |
| bars 13–18 | 0:42.2 | bass, strings, synths, vocals | brass |
| bars 32–37 | 1:47.4 | bass, percussion, strings, synths, vocals, winds | guitar |
| bars 40–45 (the excerpt) | 2:14.8 | everyone but the brass | |
| bars 46–51 | 2:35.4 | bass, drums, guitar, percussion, synths, vocals, winds | strings |
| bars 58–63 | 3:16.5 | guitar, percussion, vocals, winds | bass, synths |

Regenerate with `SONG=ftw tools/make-excerpts.sh`.

Musicians (from Caleb): Nathan Acupan recorded the drums and Elliot Shneider the bass and guitar, in a studio; Caleb Cox did everything else in the production (the vocals, and the mostly sampled percussion, strings, woodwinds, brass and synths). Mixed and mastered by Mitchell Oeth.

## The Vocal Jazz Ensemble, live

Two pieces from the Vocal Jazz Ensemble's concert of October 23, 2026, from the board's multitrack: eleven wireless handhelds, one per singer, cleared by the course owner for public use with the singers credited by name. Track n is the nth singer in the concert program (Allie Hulbert, Karmyn Trufant, Magnolia Bycott, Abbey Sourov, Nina Brown, Shayne Sayre, Paola Morales, Jessica Kaber, Brandon Borlaza, Michael Rogachefsky, Silas Arora), and source `vj-n` is mic n. There is no piano track: Celine You's piano is heard only faintly through the vocal mics. The masters (mono, 44.1 kHz, 24-bit, about 34 MB each) stay local and gitignored in `audio/VOCAL JAZZ NEW/`. Piece 1 of the folder is taken to be the program's first piece.

| Song | Id, files | Song time 0 = master | Ends at | Tempo |
|---|---|---|---|---|
| “Almost Like Being in Love” (Loewe and Lerner, arr. Darmon Meader) | `almost-like`, `audio/almost-like/almost-like-NN-<singer>.mp3` | 20.0 s (a mic check runs 0–11.5 s) | 242.5 s (222.5 s long) | rubato intro, then swing at about 124 bpm from 40.3 s |
| “Love Me or Leave Me” (Donaldson and Kahn, arr. Rosana Eckert) | `love-me`, `audio/love-me/love-me-NN-<singer>.mp3` | 45.0 s (the piano intro, which the mics barely hear) | 269.0 s (224 s long) | swing at about 177 bpm |

- **Levels.** The tracks were recorded low (peaks −11 to −21 dBFS). Every track of both pieces gets the same +10 dB (`normalizeDb: 10`, `SHARED_GAIN_DB` in the script), so the loudest peak sits at −1.07 dBFS and each singer keeps their own level: the meters differ because the singers do. No limiting or compression. `monoPeakDb` / `monoRmsDb` are measured over the whole song.
- **Mono.** The files are mono MP3s (`channels: 1`), −V4 for the excerpt (about 80 kb/s) and −V5 for the segments. Excerpts are about 3.0 MB (piece 1) and 4.5 MB (piece 2) for all eleven; full songs 12 segments per stem, 132 files, about 18 MB each.
- **Loops, breath to breath.** With no drummer the tempo drifts by a few percent, so a loop cut on a bar grid would stumble at the seam. Every loop starts and ends in a breath where all eleven mics are below −52 dBFS on the master, the two breaths found the same number of bars apart on a beat tracker's grid. Each section therefore has its own `length`; `loopPoints()` in `js/transport.js` uses it, and the stitched buffer is laid out as usual (0.5 s pre-roll, the loop, 1 s post-roll). Piece 1's sections loop 8 bars (about 15.5 s; the intro two rubato phrases), piece 2's 16 bars (about 21.7 s). The excerpts are longer, so a scenario has time to listen: 15 bars of piece 1 (29.5 s) and a whole 32-bar chorus of piece 2 (43.8 s). Bar numbers count from the first bar in tempo; the downbeats come from beat tracking, not from the score.
- **Who sings.** Per bar, each mic's RMS above −50 dBFS on the master (the bleed from the other singers sits below that).

“Almost Like Being in Love”:

| Section | Starts | Length | Singing | Partly |
|---|---|---|---|---|
| the intro | 0:00.7 | 16.85 s | everyone else | Karmyn, Silas |
| bars 15–22 | 1:06.0 | 15.55 s | everyone but Nina | Nina |
| bars 45–52 | 2:04.1 | 15.59 s | the soli: Nina, Shayne, Paola, Brandon, Silas | the other six |
| bars 53–60 | 2:19.6 | 15.51 s | the same five | the other six |
| bars 64–78 (the excerpt) | 2:40.9 | 29.49 s | everyone | |

“Love Me or Leave Me”:

| Section | Starts | Length | Singing | Partly |
|---|---|---|---|---|
| bars 3–18 | 0:01.8 | 21.47 s | Abbey's solo | the ensemble comes in |
| bars 40–71 (the excerpt) | 0:50.5 | 43.80 s | everyone | |
| bars 72–87 | 1:34.3 | 21.67 s | Silas's solo | nobody else |
| bars 88–103 | 1:56.5 | 21.61 s | Silas | the ensemble behind |
| bars 119–134 | 2:39.0 | 21.88 s | | everyone, in short bursts |
| bars 150–165 | 3:20.9 | 21.63 s | everyone, the ending | |

Regenerate with `SONG=almost-like tools/make-excerpts.sh` and `SONG=love-me tools/make-excerpts.sh`.

**Where they play.** Both pieces are in Free play on every console. Where a console has fewer mic inputs than singers, it takes the two soloists (Abbey, mic 4, and Silas, mic 11), a quartet (mics 1, 4, 9, 11) or six of them on the F8n, and the rest stay on stage, unplugged (`JAZZ_GIGS` in `js/scenarios.js`; on Mixer A and B, mics 1–8). The Vocal Jazz in Salmon gig puts both on its eleven handhelds, taking turns scenario by scenario (`vj` is “Almost Like Being in Love”, `vj-love` “Love Me or Leave Me”), with the preshow “Bossa Nova” as the crew's test music on AUX IN 1/2. The COB gig (`cob`) puts “Love Me or Leave Me” on its eleven headsets, A–K; its backing-track laptop plays silence (`audio/love-me/cob-track-silent.mp3` and its segments, mono 22.05 kHz at 8 kb/s, about 300 kB, from `tools/make-silent-track.sh`), because the ensemble's recording has no accompaniment track.

## The electroacoustic showcase (stand-ins and a click)

The `ea` song (`SONGS.ea` in `source-manifest.js`) has no recordings of its own: it puts FTW's stems on stage as stand-ins for the showcase's sources, and adds one generated file, a click track on FTW's own timeline, so it stays sample-locked with them: `ftw/ftw-click.mp3` (the excerpt) and `ftw/full/ftw-click-00.mp3` … `-12.mp3` (the segments, cut like the stems). `tools/make-click-track.sh` makes them with ffmpeg: 70 bpm, 1600 Hz on each downbeat and 1000 Hz on the other beats, 40 ms each, from a downbeat measured in FTW's drums at song time 134.846 s (0.03 s after the excerpt's loop start). No permissions needed: it's a synthesized metronome.

## Credits

“Almost Like Being in Love” (Frederick Loewe and Alan Jay Lerner, arr. Darmon Meader) and “Love Me or Leave Me” (Walter Donaldson and Gus Kahn, arr. Rosana Eckert): the Vocal Jazz Ensemble, Allie Hulbert, Karmyn Trufant, Magnolia Bycott, Abbey Sourov, Nina Brown, Shayne Sayre, Paola Morales, Jessica Kaber, Brandon Borlaza, Michael Rogachefsky and Silas Arora; Alex Robinson, director; Celine You, piano. Recorded live in concert, October 23, 2026. Used with permission for this educational project.

FTW: after juno. Drums Nathan Acupan; bass and guitar Elliot Shneider; vocals and production Caleb Cox; mixing and mastering Mitchell Oeth. Used with permission for this educational project.

NOSTRADAMUS: Will Tulip (every part, production, mixing and mastering). Used with permission for this educational project.

Persephone: music and lyrics Giovanna; guitars Caiden Craig; bass Tyler Fraser; background vocals Jake Flaa and Victoria Nguyen; drums Eli Furie; trumpets Kaizo Hall and Takazo Hall; piano Julian Berger; recording engineers Braedon Martin and Julian Berger; mixing and mastering Eli Furie. Used with permission for this educational project.

## Missing or failed files

If a file fails to fetch or decode (the excerpt, or any full-song segment), that stem plays a plain sine test tone for that stretch so routing can still be tested, and a non-blocking error banner names the file. This is a development fallback only; the app never synthesizes music.
