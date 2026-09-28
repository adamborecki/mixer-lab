# Audio engine

`js/audio-engine.js` owns the `AudioContext` and the node graph. It reads the semantic mixer state ([MIXER_MODEL_SCHEMA.md](MIXER_MODEL_SCHEMA.md)), never touches the DOM, and knows nothing about skins. `js/meters.js` only draws the levels the engine reads. Asset details are in [../audio/README.md](../audio/README.md).

## Signal graph

Per channel (there are 8; 7 have sources):

```text
stem player (mono) -> channel input -> preamp gain -> clipper (WaveShaper) -> tap
tap -> input meter (AnalyserNode)
tap -> enabled -> fader -> pan -> Main bus -> Main master -> Main L / Main R outs
tap -> Aux 1 send (pre-fader) -> Aux 1 bus -> Aux 1 master -> Aux 1 out
tap -> PFL switch -> PFL bus -> phones level
```

Outputs to ears:

```text
mixer out (main-l | main-r | aux1) -> [only through a valid chain] -> speaker endpoint -> zone (house | stage)
listen selector: house zone | stage zone | phones -> +4 dB trim -> safety limiter -> destination
```

| Node | Notes |
|---|---|
| preamp gain | `outputDb + padDb + gainDb + HEADROOM_DB` (below), silent if the channel has no usable signal |
| clipper | `WaveShaper`, curve `[-1, 1]`: identity inside +/-1, hard clip outside. Over-gain is audible and shows on the meter |
| pan | `StereoPannerNode`, equal-power (-3 dB centre) |
| Main bus | 2-channel; splits to mono `main-l` / `main-r` after the Main master |
| Aux 1, PFL | mono buses |
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

The reference patch sets gain to `-(outputDb + pad)`, which puts every peak 8 dB under the stem peak (about -9 to -13 dBFS, "good").

## V1 conventions

These are deliberate teaching choices, shown in the in-app signal-flow explainer (`js/ui/flow.js`). Real mixers vary.

- **Aux 1 is pre-fader.** The send is taken before `enabled` and the fader. Channel level does not change the monitor mix.
- **PFL is post-preamp, pre-fader.** It is a mono sum of every channel with PFL on, scaled only by the PHONES level. It does not alter Main or Aux, and pressing PFL does not move the listen selector; the student picks PFL there.
- **`channel.enabled` affects the Main path only.** A muted/off channel keeps feeding pre-fader Aux and PFL. Skin A renders it as MUTE (lit means `enabled === false`); Skin B renders it as ON (lit means `enabled === true`).
- **Clipping** is applied after the preamp and before every tap, so over-gain distorts Main, Aux and PFL alike.

## Speakers, zones and listening

Every speaker is an *endpoint* with a zone: `foh` (house) or `stage`. `analyzeRig` (`js/connection-model.js`) walks upstream from each speaker to a mixer output:

- powered speaker <- mixer output: valid;
- passive speaker <- power amp <- mixer output: valid;
- passive speaker <- mixer output, an empty amp input, or speaker level into a powered speaker: not valid.

`rewire()` connects a mixer output to a speaker node only when the chain is valid. There is no bypass, even though the browser could play the audio.

| Listen setting | You hear | Needs |
|---|---|---|
| Main L/R | all house-zone speakers | a valid chain into a house speaker |
| Aux 1 / MON | all stage-zone speakers | a valid chain into a stage speaker |
| PFL | engineer's headphones (phones bus) | no speakers |

The selector chooses a place to stand, not a bus. If a student patches Aux 1 into a house speaker, the audience hears the monitor mix; patching Main into a wedge puts Main on stage. That is intentional. Speaker nodes are panned to `pan * 0.8` so house-left and house-right separate on headphones.

The +4 dB fixed listening trim and the limiter sit before the destination to keep a typical mix comfortable and protect ears. They are not mix tools.

## Metering

- Every meter is an `AnalyserNode` (`fftSize` 1024, no smoothing). `readAnalyser` computes peak and RMS from `getFloatTimeDomainData` once per animation frame.
- Channel meters tap after the clipper (post-preamp, pre-`enabled`). Main L/R and Aux 1 meters tap after their masters; the PFL meter taps the PFL bus before the phones level; a "what you hear" meter taps the limiter output.
- `MeterView` adds ballistics: instant attack, 24 dB/s release, 1 s peak hold, floor -48 dB, a clip latch of 1.5 s when a peak reaches -0.05 dBFS, and a text readout every 180 ms. Channel meters also expose the input band (`data-band`).
- Skin A scales its ladder so 0 = -18 dBFS (analog style); Skin B shows dBFS LEDs.
- Scenario checks do **not** read meters. They use `computeMix`, which is deterministic and does not fluctuate with the music. The meters are real audio, not animation, but they are for the student's eyes.

## Stem loading and synchronization

- Delivery: seven stereo 44.1 kHz MP3 excerpts (29.905 s each, about 3.8 MB in total) in `audio/persephone/`, named in `audio/source-manifest.js`. Every file is the same span of the same song, so one loop (0.5 s to 28.905 s in the file, 8 bars) serves all of them. The 24-bit WAV masters are never loaded by the app. See [../audio/README.md](../audio/README.md).
- `engine.start()` runs synchronously inside the Start Audio click, so no audio exists before a user gesture.
- `setSources(ids)` loads only the stems for the sources in the active scenario, fetches and decodes them, and caches them by stem id for later scenario switches.
- Each buffer is folded to mono in `toMono` (`"sum"` = (L+R)/2, or `"left"` / `"right"`).
- Nothing plays until every requested buffer is decoded. A newer request cancels a stale one (`loadToken`).
- `play()` schedules all players at the same `AudioContext` time (now + 80 ms) with the same offset (`loop.start`) and the same `loopStart` / `loopEnd`, so the stems are sample-locked. Stop then Play restarts them together.
- If a stem fails, the engine substitutes a plain sine test tone for that stem and emits the error; `js/app.js` shows a dismissible banner. It is a development fallback and is cached until reload.
- Events: `loading {done,total}`, `ready {errors}`, `transport {playing}`.
- iPhone: the hardware silent switch mutes Web Audio in Safari and the app has no workaround. The start screen warns about it.

## State to graph

`MixerStore` emits typed changes. `rig` and `replace` (patching, scenario reset) trigger `rewire()`, which rebuilds source-to-channel links and mixer-output-to-speaker links; everything then goes through `applyAll()`. `applyAll` re-runs `analyzeRig` each time because toggling phantom power changes whether a channel has signal. Other changes only call `applyAll`.

## Adding a bus

`BUSES` in `js/mixer-state.js` is currently a declaration only; no other module reads it. Adding `aux2` means touching each place that names `aux1`:

1. `js/mixer-state.js`: add to `BUSES`; add `auxSends.aux2` in `createChannel`; add `state.aux2` in `createMixerState`; allow it in `setBusLevel`; add its send, bus dB and output to `computeMix`; add a listen destination if it has its own speakers.
2. `js/audio-engine.js` `buildGraph`: a per-channel send gain (tap or pre-fader position), an `aux2Bus` -> master -> out chain, an analyser, an entry in `outputs`, and a zone or listen gain. Set them in `applyAll`.
3. `js/connection-model.js`: an output port in `DEVICE_TYPES.mixer` with `role: "bus-out"` and `bus: "aux2"`. `analyzeRig` already treats every `bus-out` port generically.
4. Skins: a term in each `SKINS[...].terms`, a send control per strip and a master control in `js/ui/mixer-view.js`, and names in `js/ui/listen-bar.js` and `js/ui/patch-view.js`.
5. Scenarios: new setup and baseline entries; `busDb` and `masterRaised` already take a `bus` parameter.

For a pre/post choice, put the tap either before `enabled` (pre) or after `fader` (post), and store the choice per channel or per bus in the semantic state.

## Limits

One Aux bus, no EQ/dynamics/effects, no feedback, no stereo channels, and no per-speaker level model. The Aux and PFL paths are mono.
