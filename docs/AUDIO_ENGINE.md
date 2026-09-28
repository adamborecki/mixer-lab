# Audio engine

Two modules share the audio work. `js/audio-engine.js` owns the `AudioContext` and the mixer node graph. `js/transport.js` (`StemTransport`) owns stem playback: loading, looping, streaming the full song, and keeping the stems in sync. The engine reads the semantic mixer state ([MIXER_MODEL_SCHEMA.md](MIXER_MODEL_SCHEMA.md)), never touches the DOM, and knows nothing about skins. `js/meters.js` only draws the levels the engine reads. Asset details are in [../audio/README.md](../audio/README.md).

## Signal graph

Per channel (there are 8; 7 have sources):

```text
stem player(s) -> source output (persistent) -> channel input   (only while patched)
                                            \-> keepAlive (gain 0) -> destination   (always)

channel input -> preamp gain -> clipper (WaveShaper) -> tap
tap -> input meter (AnalyserNode)
tap -> enabled -> fader -> pan -> Main bus -> Main master -> Main L / Main R outs
tap -> Aux 1 send (pre-fader) -> Aux 1 bus -> Aux 1 master -> Aux 1 out
tap -> Aux 2 send (pre-fader) -> Aux 2 bus -> Aux 2 master -> Aux 2 out
tap -> PFL switch -> PFL bus -> phones level
```

The keepAlive branch is not part of the mix; it is what keeps the stems in sync (see "Stem playback and synchronization").

Outputs to ears:

```text
mixer out (main-l | main-r | aux1 | aux2) -> [only through a valid chain] -> speaker node (panned to its place)
speaker node -> listen group of the bus that feeds it (main | aux1 | aux2)
phones level -> pfl listen group
listen selector opens one group -> +4 dB trim -> safety limiter -> destination
```

| Node | Notes |
|---|---|
| preamp gain | `outputDb + padDb + gainDb + HEADROOM_DB` (below), silent if the channel has no usable signal |
| clipper | `WaveShaper`, curve `[-1, 1]`: identity inside +/-1, hard clip outside. Over-gain is audible and shows on the meter |
| pan | `StereoPannerNode`, equal-power (-3 dB centre) |
| Main bus | 2-channel; splits to mono `main-l` / `main-r` after the Main master |
| Aux 1, Aux 2, PFL | mono buses; each Aux has its own per-channel send, bus, master, out and meter |
| limiter | `DynamicsCompressor`, threshold -3 dB, ratio 20, knee 0, attack 2 ms, release 200 ms |

All parameter changes use `setTargetAtTime` with a 12 ms time constant, so controls do not click.

## Level model

Stems arrive at the channel input at their measured mono peak. A source's `outputDb` says how hot it is relative to line level, so the node graph and `computeMix` (in `js/mixer-state.js`) agree on:

```text
post-preamp peak (dBFS) = stem.monoPeakDb + source.outputDb + padDb + gainDb + HEADROOM_DB (-8)
```

- Combo input: XLR goes to the mic preamp path (phantom capable, `padDb` 0). A 1/4" plug goes to the line path with a **-20 dB pad**, so line sources still need gain (the keys reference gain is +30 dB).
- Gain is 0-60 dB in 0.5 dB steps.
- Input bands from the post-preamp peak: clip >= 0, hot >= -4, good >= -22, low >= -40, otherwise none.
- One control law, `levelToDb` / `dbToLevel`, for faders, level knobs, sends and masters: position 0.75 = 0 dB (unity), 1.0 = +10, 0.5 = -10, 0.25 = -30, 0 = off (steep tail below 0.02).
- Pan is equal-power. Speakers have no sensitivity or room model.
- The same levels apply to the loop and the full song: full-song files are encoded 2 dB quieter and `toMono` adds `trimDb` back (see "Full song").

The reference patch sets gain to `-(outputDb + pad)`, which puts every peak 8 dB under the stem peak (about -9 to -13 dBFS, "good").

## V1 conventions

These are deliberate teaching choices, shown in the in-app signal-flow explainer (`js/ui/flow.js`). Real mixers vary.

- **Aux 1 and Aux 2 are pre-fader.** Each send is taken before `enabled` and the fader. Channel level does not change either monitor mix.
- **PFL is post-preamp, pre-fader.** It is a mono sum of every channel with PFL on, scaled only by the PHONES level. It does not alter Main or Aux, and pressing PFL does not move the listen selector; the student picks PFL there.
- **`channel.enabled` affects the Main path only.** A muted/off channel keeps feeding pre-fader Aux 1, Aux 2 and PFL. Skin A renders it as MUTE (lit means `enabled === false`); Skin B renders it as ON (lit means `enabled === true`).
- **Clipping** is applied after the preamp and before every tap, so over-gain distorts Main, both Auxes and PFL alike.
- **Each Aux is its own mix.** In the scenarios and Free play, Aux 1 goes to the lead singer's powered wedge and Aux 2 goes through the power amp to the drummer's passive wedge. Nothing in the engine depends on that; it is just how the rigs are patched. (The build spec lists a second Aux bus as a V1 non-goal; it was added at the course owner's request.)

## Speakers and listening

Every speaker is an *endpoint*. `analyzeRig` (`js/connection-model.js`) walks upstream from each speaker to a mixer output:

- powered speaker <- mixer output: valid;
- passive speaker <- power amp <- mixer output: valid;
- passive speaker <- mixer output, an empty amp input, or speaker level into a powered speaker: not valid.

`rewire()` connects a mixer output to a speaker node only when the chain is valid. There is no bypass, even though the browser could play the audio. A speaker node is panned to `pan * 0.8` (house left and right separate on headphones; the wedges sit in the centre) and feeds the *listen group* of the bus that reaches it: `main-l` and `main-r` share the `main` group, `aux1` and `aux2` each have their own.

The listen selector (`LISTEN_DESTINATIONS`: `main`, `aux1`, `aux2`, `pfl`) opens one group and closes the rest:

| Listen setting | You hear | Needs |
|---|---|---|
| Main L/R | Main through every speaker that `main-l` / `main-r` validly reach, panned by speaker position | a valid chain from Main to at least one speaker |
| Aux 1 | the Aux 1 mix through the speaker(s) `aux1` validly reaches | a valid chain from Aux 1 to a speaker |
| Aux 2 | the Aux 2 mix through the speaker(s) `aux2` validly reaches | a valid chain from Aux 2 to a speaker |
| PFL | engineer's headphones (phones bus) | no speakers |

The selector picks a bus to audition, not a place to stand. If a bus has no valid chain, nothing plays and the listening bar says so. If a student patches Aux 1 into a house speaker, then Aux 1 is what comes out of that speaker; where a speaker physically sits is not modelled. Speakers still carry a `zone` (`foh` or `stage`), but the engine ignores it. Only scenario conditions read it (`validChain` and `noBrokenChains` take a `zone` parameter). Each device also has a `short` name ("singer's wedge", "drummer's wedge", "house left", ...) that the listening bar uses to say which speakers a bus reaches.

The +4 dB fixed listening trim and the limiter sit before the destination to keep a typical mix comfortable and protect ears. They are not mix tools.

## Metering

- Every meter is an `AnalyserNode` (`fftSize` 1024, no smoothing). `readAnalyser` computes peak and RMS from `getFloatTimeDomainData` once per animation frame.
- Channel meters tap after the clipper (post-preamp, pre-`enabled`). Main L/R, Aux 1 and Aux 2 meters tap after their masters; the PFL meter taps the PFL bus before the phones level; a "what you hear" meter taps the limiter output.
- `MeterView` adds ballistics: instant attack, 24 dB/s release, 1 s peak hold, floor -48 dB, a clip latch of 1.5 s when a peak reaches -0.05 dBFS, and a text readout every 180 ms. Channel meters also expose the input band (`data-band`).
- Skin A scales its ladder so 0 = -18 dBFS (analog style); Skin B shows dBFS LEDs.
- Scenario checks do **not** read meters. They use `computeMix`, which is deterministic and does not fluctuate with the music. The meters are real audio, not animation, but they are for the student's eyes.

## Stem playback and synchronization

`StemTransport` (`js/transport.js`) plays the stems. `AudioEngine.start()` creates it inside the Start Audio click, so no audio exists before a user gesture. The engine only patches the transport's per-source outputs into channel inputs.

### Why every stem is always connected

Chrome advances an `AudioBufferSourceNode` only while something downstream is pulling it. The first version connected a stem to the graph only when the student patched it in, so an unpatched stem (for example in Scenario 1, before the student plugs it in) was not pulled: it froze, and resumed late when it was finally patched. Stems patched at different times drifted out of sync.

The fix is structural. `prepare(sourceIds)` gives every active source one persistent output `GainNode`, and every output is connected through a shared zero-gain `keepAlive` node to the destination, whether or not it is patched. Every stem is therefore pulled from the moment it starts, and patching or unpatching only adds or removes the link from that output to a channel input. `rewire()` disconnects only those channel links and never the keepAlive one. Do not remove the keepAlive connection when refactoring, and connect any new consumer of a stem to the source output, not to a player.

This was verified in Chromium by capturing each stem with an `AudioWorklet` and cross-correlating it with the original WAV: 0 samples of offset after patching sources at different times. That is a manual check, not one of the Node tests.

### Delivery and loading

- Excerpt: seven stereo 44.1 kHz MP3s (29.905 s each, about 3.8 MB in total) in `audio/persephone/`. Every file is the same span of the same song, so one loop (0.5 s to 28.905 s in the file, 8 bars) serves all of them.
- Full song: 12 segments per stem in `audio/persephone/full/` (about 18 MB in total), used only in Free play. Details below.
- The 24-bit WAV masters are never loaded by the app. See [../audio/README.md](../audio/README.md).
- `setSources(ids, { mode })` on the engine calls `prepare(ids)`, `rewire()`, `load(mode)` and then `play()`. Only stems for sources in the active scenario are fetched. Each buffer is folded to mono in `toMono` (`"sum"` = (L+R)/2, or `"left"` / `"right"`, plus `trimDb`). Decoded excerpt buffers are cached by stem id for later scenario switches.
- Nothing plays until the requested audio is decoded (all excerpt buffers, or the first full-song segment). Every `load`, `play` and `stop` takes a new token and async work that finds the token changed just returns, so a newer request cancels a stale one.
- If a stem fails, the transport substitutes a plain sine test tone for that stem (or segment) and reports the error; `js/app.js` shows a dismissible banner. It is a development fallback; a failed excerpt stays a tone until reload.
- Events (from `engine.on`): `loading {done,total,what?}`, `ready {errors}`, `transport {playing}`, `buffering {on}`. Engine API: `start`, `setSources`, `play`, `stop`, `seek(t)`, `position()` (`{ t, duration }`), and the `started`, `playing` and `mode` getters.
- iPhone: the hardware silent switch mutes Web Audio in Safari and the app has no workaround. The start screen warns about it.

### Excerpt mode (scenarios, and Free play's "8-bar loop")

`play()` creates one `AudioBufferSourceNode` per stem, all started at the same `AudioContext` time (now + 100 ms) with the same offset (`loop.start`) and the same `loopStart` / `loopEnd`, so the stems are sample-locked. Each goes through an 8 ms fade-in envelope into its source output. Stop then Play restarts the loop from its start.

The loop is the 8 bars from the 16th-note pickup at 157.970 s (downbeat 158.204 s) to the matching pickup 8 bars later. The song is about 67.6 bpm in 4/4 with a 16th-note feel. The loop points were re-checked with beat analysis and are unchanged.

### Full song (Free play only)

Free play's "Band audio" control switches between the 8-bar loop (28 s) and the full song (3:58, with a seek slider). Every other scenario always plays the loop. The full song is not decoded up front, so a phone never holds seven full-length stems:

- Each stem is 12 segments of 20 s (`STEM_SET.full`), each with 0.5 s of extra audio on both sides (none at the song's start or end).
- The transport keeps only the segment that is playing and the next one decoded. Every 250 ms (`TICK_MS`) it checks the clock; when the next segment starts within 8 s (`LOOKAHEAD`) and is decoded, it schedules it. The next segment is requested as soon as the current one is scheduled, so it normally arrives well before it is due.
- Segments join with 20 ms linear crossfades over the overlap audio. The song's start, the song's end, a fresh start and a seek use 8 ms edge fades instead.
- Seek: dragging the slider and releasing calls `seek(t)`; while playing it restarts from `t`, while stopped it just moves the resume point.
- Loop: when the song ends it wraps to 0:00 and keeps playing.
- Stop remembers the position in full mode; Play resumes from there. Changing scenario or mode reloads from 0:00.
- Buffering: if the next segment is not decoded when it is due (or a seek lands on an unloaded segment), the band goes quiet, the transport emits `buffering {on: true}`, and the listening bar shows "Buffering the next part of the song…". It re-anchors and carries on when the segment arrives.
- Late-start compensation: if a segment's start time has already passed when it is scheduled (a busy main thread), it starts now but skips ahead by the same amount, so it stays on the song clock instead of drifting.
- Levels: the whole song peaks up to about 1.6 dB hotter than the excerpt, so the segment files are encoded 2 dB quieter than the excerpt gain and the app adds `trimDb` (2) back in `toMono`. Measured stem gains matched the excerpt's `normalizeDb`, so gain staging is the same on the loop and the song.
- `position()` returns the song time, which the frame loop reads to move the seek slider (and the loop time in excerpt mode).

## State to graph

`MixerStore` emits typed changes. `rig` and `replace` (patching, scenario reset) trigger `rewire()`, which rebuilds source-output-to-channel links and mixer-output-to-speaker links; everything then goes through `applyAll()`. `applyAll` re-runs `analyzeRig` each time because toggling phantom power changes whether a channel has signal. Other changes only call `applyAll`, which also sets the listen groups from `state.listen`.

## Adding a bus

`BUSES` in `js/mixer-state.js` (now `["aux1", "aux2"]`) drives most of the plumbing. Adding `aux3` is mostly listing it there, plus the places that name buses by hand.

Handled by looping over `BUSES`:

- `js/mixer-state.js`: `auxSends` on every channel, `state.aux3`, the per-bus figures in `computeMix` (`channel.aux.aux3`, `busDb.aux3`, `outputs.aux3`), `setSend`, `setBusLevel`, and `LISTEN_DESTINATIONS`.
- `js/audio-engine.js`: per-channel send gain, bus -> master -> out chain, meter, listen group, and the `applyAll` settings. `rewire()` uses the output port id as the listen group.
- `js/scenarios.js`: `setup.sends` and `setup.masters` accept the new bus key, and the per-bus metrics and conditions take a `bus` parameter.

Still manual:

1. `js/connection-model.js`: an output port in `DEVICE_TYPES.mixer` with `role: "bus-out"` and `bus: "aux3"`. `analyzeRig` treats every `bus-out` port generically.
2. Skins (`js/mixer-models.js`): `aux3` and `aux3Master` terms in each `SKINS[...].terms`, and an `aux3` part in each skin's `strip` rows. The patch view labels the output from `terms[portId]`, so the term name must equal the port id.
3. `js/ui/mixer-view.js`: an `aux3` entry in the strip `parts` map, a master knob and meter for the bus in both `buildMaster` layouts, and the `updateMeters` line.
4. `js/ui/listen-bar.js`: a button, and the bus in the arrow-key `order`, `ends`, `subs` and `busName` maps.
5. `js/ui/flow.js`: another monitor branch and mention in the notes.
6. `styles.css`: a `.tone-aux3 .knob` colour, and its `.skin-compact` override.
7. Scenario data and tests: cables to the new output, sends and masters in the setups, and a speaker device if it needs its own.

For a pre/post choice, put the tap either before `enabled` (pre) or after `fader` (post), and store the choice per channel or per bus in the semantic state.

## Limits

Two Aux buses (both pre-fader), no EQ/dynamics/effects, no feedback, no stereo channels, and no per-speaker level model. The Aux and PFL paths are mono. Full-song playback exists only in Free play.
