# Mixer Lab

An educational live-sound mixer simulator for MUS 248. Students patch real band stems into a virtual mixer, set gain, build an audience (Main) mix and a monitor (Aux) mix, and find out where the amplifier is, then hear what changed. It is a static site: vanilla HTML, CSS and ES modules, no framework, no bundler, no backend, no build step.

The idea it teaches: the same routing concepts appear under different labels, layouts and logic on different mixers. Two deliberately different generic mixer skins drive one shared model, so students practice reasoning about an unfamiliar board rather than memorizing one.

## What it teaches

The lab supports a four-part course sequence. V1 covers a slice of it.

| Part | Topic | V1 coverage |
|---|---|---|
| 1 | Inputs, outputs, levels, amplification | Mic, instrument, line and speaker level; connector is not signal level; preamp vs power amp; powered vs passive speakers; condenser mics need +48 V. Scenario 1 |
| 2 | Mixing | Gain vs channel level, pan, meters, PFL, mute/on, Aux sends, monitor mixes. Scenarios 2 and 3 |
| 3 | Multiple destinations and recording | Audience mix plus one monitor mix. Direct outs, multitrack and board feeds are not built |
| 4 | Troubleshooting and gig integration | Plain-language feedback on bad patches and free-play break/fix. No fault injection or power sequencing |

The recurring question is "Where is the amplifier?" The other habit is diagnosis: which destination is wrong, then which part of the signal path controls it.

## Run locally

ES modules do not load from `file://`, so use any static server from the repo root:

```sh
python3 -m http.server 8124
```

Then open <http://localhost:8124/>. There is nothing to install.

- Deep links pick a scenario: `#/build-rig`, `#/more-vocal`, `#/monitor-quiet`, `#/free-play`.
- Add `?debug=1` to expose `window.mixerLab` in the console with `store`, `engine`, `skins`, `evaluate()`, `mix()`, `selectScenario(id)` and `setSkin(id)`.
- Audio starts only after the student presses **Start Audio**. Headphones help.

## Using the lab

Four regions: **Scenario** (prompt, checklist, hints), **Sources** (band inputs), **Mixer**, **Outputs** (amps and speakers). Below about 900 px they become tabs. A bar at the bottom holds the listening selector (**Main L/R**, **Aux 1 / MON**, **PFL**) and Play/Stop. The top bar switches between **Console A** and **Mixer B**; the choice is remembered in the browser.

Patching is tap-based: tap a port, pick a cable, pick the other end. Bad choices are allowed when they are instructive (a mic on the 1/4" side, a passive speaker on a line output) and are explained in words.

## V1 scope

- Seven band sources in FOH order (drums, bass, guitars, keys, trumpets, backing vocals, lead vocal) plus a spare eighth input.
- Dynamic mic, condenser mic (needs +48 V), DI box and line-level source, with XLR, 1/4" TRS/TS, RCA and 3.5 mm connectors kept separate from signal levels.
- Per-channel gain, level, pan, phantom power, enabled (mute/on) and PFL; a pre-fader Aux 1 send; Main and Aux 1 masters; headphone level.
- Powered speakers, passive speakers and a 2-channel power amp. Sound is heard only through a valid chain.
- Real Web Audio with metering from actual audio, and an audible clipper.
- Three data-defined scenarios plus Free Play, with success computed from state and routing.
- Two generic mixer skins. Switching keeps state, patching, scenario progress and audio.

## V1 conventions

These are teaching choices, not claims about every mixer:

- Aux 1 is **pre-fader**. Moving a channel's level does not change its monitor contribution.
- **PFL** is post-preamp and pre-fader. It does not change Main or Aux.
- `channel.enabled` affects the **Main path only**. A muted channel still feeds pre-fader Aux 1 and PFL. Console A shows it as MUTE (lit = not enabled); Mixer B shows it as ON (lit = enabled).
- The listening selector picks a place to stand: house speakers, stage speakers, or the engineer's headphones.

Details: [docs/AUDIO_ENGINE.md](docs/AUDIO_ENGINE.md).

## Limitations

- One Aux bus. No EQ, dynamics, effects or feedback.
- Every channel is mono; stereo stems are folded to mono. No stereo or linked channels.
- The electrical model is simplified: levels are labels plus dB arithmetic, with no impedance, cable length or noise.
- Phantom power works only on XLR into the mic path.
- Sources must go into the mixer first; they cannot be patched straight to a speaker.
- One cable per port.
- The loop is one 28-second phrase from one song.
- Nothing is saved except the skin choice: no accounts, progress or analytics.
- On iPhone, the hardware silent switch mutes Web Audio and there is no workaround.
- The page loads one web font from Google Fonts; system fonts are the fallback.

## File layout

```text
index.html                 page shell: start overlay, tabs, regions
styles.css
package.json               only so Node treats js/ as ES modules for tests; no dependencies, no build
audio/
  README.md                asset source, excerpt, format, regeneration
  source-manifest.js       stems, sources, FOH order, connectors, levels, scenario availability
  persephone/*.mp3         web delivery excerpts
js/
  app.js                   bootstrap: wires store, engine, scenarios, views
  audio-engine.js          Web Audio graph, stem loading, metering
  mixer-state.js           semantic state, level law, computeMix, MixerStore
  mixer-models.js          skins and skin-to-state mappings
  connection-model.js      connectors, cables, signal levels, chain analysis
  scenarios.js             scenario data, baselines, conditions
  meters.js                meter ballistics and drawing
  ui/                      UI modules (instead of one ui.js): controls, flow,
                           listen-bar, mixer-view, patch-view, scenario-view
docs/                      AUDIO_ENGINE.md, MIXER_MODEL_SCHEMA.md, SCENARIOS.md
tests/                     routing, scenarios and skins tests (node --test)
tools/make-excerpts.sh     regenerates the audio excerpts
MIXER_LAB_BUILD_SPEC_V1_2.md, PROJECT_CONTEXT.md   spec and teaching context
```

The pure logic (`connection-model`, `mixer-state`, `scenarios`, the manifest) has no DOM or Web Audio dependency, so it runs under Node.

## Audio assets

The band is "Persephone". The seven source masters are stereo 44.1 kHz 24-bit WAV files (about 63 MB each). They stay on disk and are gitignored. The site ships a synchronized 29.9 s excerpt of each as stereo MP3 (LAME VBR `-V4`, about 3.8 MB total), with an 8-bar loop inside. The app folds each to mono at load, loads only the stems the active scenario needs, and starts them together. Regenerate with `tools/make-excerpts.sh` (needs `ffmpeg` with `libmp3lame`).

Before publishing to a public GitHub Pages site, the course owner must confirm the stems are cleared for public use; that is not confirmed here. See [audio/README.md](audio/README.md).

## Tests

```sh
npm test            # or: node --test tests/
```

Node 18 or newer. The tests cover connectors, chain validation, the level law, computed mix behavior, the store, the skin mappings, and each scenario's start state and solutions. They do not need a browser. Audio, layout and touch behavior are checked by hand.

## Documentation

| Doc | Covers |
|---|---|
| [docs/AUDIO_ENGINE.md](docs/AUDIO_ENGINE.md) | Signal graph, Main/Aux/PFL, mute convention, metering, stem loading and sync, adding a bus |
| [docs/MIXER_MODEL_SCHEMA.md](docs/MIXER_MODEL_SCHEMA.md) | Semantic state vs skins, ON/MUTE inversion, control mapping, adding a skin |
| [docs/SCENARIOS.md](docs/SCENARIOS.md) | Scenario schema, conditions, tolerances, the V1 scenarios, authoring |
| [audio/README.md](audio/README.md) | Stems, excerpts, format, regeneration |
| [MIXER_LAB_BUILD_SPEC_V1_2.md](MIXER_LAB_BUILD_SPEC_V1_2.md) | Implementation spec (authority) |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Teaching intent and direction |

## Future expansion

Hooks exist for these; none are built. Where noted, the code needs changes beyond adding data.

- More Aux/mix buses: `BUSES` in `js/mixer-state.js` is a marker only; many places name `aux1`. See "Adding a bus" in [docs/AUDIO_ENGINE.md](docs/AUDIO_ENGINE.md).
- Pre/post-fader choice per send.
- Stereo and linked channels: the stereo excerpts and per-stem `treatment` in the manifest are kept for this.
- Direct outs, board feeds and recording: add output ports to `DEVICE_TYPES.mixer`.
- EQ, compression and effects between the preamp and the taps.
- Connector and adapter challenges: the cable, jack and level tables in `js/connection-model.js`.
- Fault injection and troubleshooting scenarios: `analyzeRig` already reports per-input and per-speaker statuses.
- More skins, including real-hardware layouts: [docs/MIXER_MODEL_SCHEMA.md](docs/MIXER_MODEL_SCHEMA.md).
- Integrated PA systems (for example a Stagepas) and powered mini monitors as new endpoint device types.
- Power sequencing and safe-setup checks.
- Course-specific scenarios: scenarios are data; see [docs/SCENARIOS.md](docs/SCENARIOS.md).
