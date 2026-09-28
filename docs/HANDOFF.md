# Handoff: continuing Mixer Lab

For a fresh coding agent picking this up. Read this, then the spec (`MIXER_LAB_BUILD_SPEC_V1_2.md`, the original authority) and the three docs it links. Where this file and the spec disagree, this file reflects decisions the course owner made after V1 (a second Aux bus, public stems, the full song, the planned scenario list).

## Ground rules

- Static GitHub Pages site: vanilla HTML/CSS/ES modules. No framework, bundler, backend or dependencies. `package.json` exists only so Node treats `js/` as ES modules for tests.
- Pure logic (state, connections, scenarios, manifest) must stay free of DOM and Web Audio so `node --test` covers it.
- Behaviour lives in semantic state and the engine; skins only present it. Never put a skin-specific rule in the engine or in a scenario check.
- Public site: no student names, grades or private material. Band/music credits are the exception, given with permission (see Credits).

## Map

| File | Role |
|---|---|
| `index.html`, `styles.css` | Page shell (start overlay, tabs, regions, dialogs) and all styling |
| `audio/source-manifest.js` | Stems, virtual sources, FOH order, levels, scenario availability, full-song segments, `PRESHOW`, `CREDITS` |
| `js/connection-model.js` | Plugs, jacks, cables, signal levels, device types/ports, `checkConnection`, `analyzeRig` (chain validity) |
| `js/mixer-state.js` | Semantic state, `BUSES`, level/pan laws, `computeMix`, `MixerStore` actions |
| `js/scenarios.js` | Scenario data, playback-device inventory, baselines (`METRICS`), `CONDITIONS`, `evaluateScenario` |
| `js/mixer-models.js` | Skins: words, control types, layout data, MUTE/ON mapping |
| `js/transport.js` | Stem playback: excerpt loop and streamed full song, sync, keep-alive |
| `js/loop-player.js` | Independent looping stereo playback (preshow laptop), own timeline, keep-alive |
| `js/audio-engine.js` | Web Audio graph: channel strips, Main/Aux/PFL buses, speaker gating, listening, meters |
| `js/app.js` | Wiring: store ↔ engine ↔ scenario checks ↔ views; session (listen history); Free play music mode; credits |
| `js/progress.js`, `js/submission.js` | Solved-scenario tracking and per-scenario active time and action counts (localStorage) and the plain-text Canvas submission with its check code; pure, tested in `tests/submission.test.mjs`. `tools/verify-submission.mjs < file` re-checks a pasted submission |
| `js/ui/*.js` | `submission-view` (Canvas Submission dialog), `mixer-view` (renders a skin), `patch-view` (Sources/Outputs + patch dialog), `scenario-view`, `listen-bar`, `controls` (knob/fader/fine sheet), `flow` (signal-flow explainer) |
| `js/meters.js` | Meter drawing and ballistics (levels come from AnalyserNodes) |
| `tests/*.test.mjs` | `routing`, `scenarios`, `skins` (node:test) |
| `tools/make-excerpts.sh` | Regenerates delivery audio from the local WAV masters |

## Audio transport and the sync invariant

**All Persephone stems share one timeline. Nothing may restart, pause or independently advance a single stem.** Patching, unpatching, muting, switching skins or switching the listen destination must never touch playback; they only change gains and connections downstream of the stem outputs.

How it's enforced (`js/transport.js`):

- Each active source has one persistent output `GainNode` (`transport.outs`). The engine patches those into channel inputs; patching never creates a player.
- Every output is also wired, at zero gain, to the destination (`keepAlive`). Chrome only advances a source that something pulls; without this an unpatched stem froze and came back late when plugged in (the original sync bug).
- Excerpt mode: one looping `AudioBufferSourceNode` per stem, all started at the same `when` with the same offset and loop points (8 bars, 0.5 → 28.905 s in each file).
- Full-song mode (Free play only): 20 s segments per stem, scheduled on one song clock (`anchor`), joined with 20 ms crossfades, decoded one segment ahead; late starts skip ahead to stay aligned.
- Only `transport.load()` (new source set / mode) and `play()`/`stop()`/`seek()` start or stop players, and they always do so for all stems at once.
- Listening is the listen-group gain after the speakers; switching destination never touches the transport.
- Verified in Chromium with an AudioWorklet capture cross-correlated against the original WAVs: 0 samples offset after staggered patching and across segment joins. Re-run that kind of check if you touch the transport.

Anything new that plays audio should get its own persistent output with the same keep-alive, and must not share or disturb the band's timeline. The preshow laptop does exactly this: `LoopPlayer` (`js/loop-player.js`) starts once at `engine.start()`, loops the whole file on its own, and is never touched by the band transport, patching, muting or the Stop button. `engine.setSources` passes only stem sources (`source.stem`) to the transport.

## Stage conventions

| Bus | Feeds | Chain |
|---|---|---|
| Main L/R | House left/right | Mixer XLR outs → powered speakers (`spk-l`, `spk-r`) |
| Aux 1 | Lead singer's wedge | Aux 1 → **powered** wedge (`wedge`) |
| Aux 2 | Drummer's wedge | Aux 2 → **power amp** in A → amp out A → **passive** wedge (`pwedge`) |

Both auxes are pre-fader. `channel.enabled` affects Main only (the auxes and PFL keep running when a channel is muted/off). Keep this stage layout stable across scenarios so students build one mental model. Devices and their `short` names live in `PLAYBACK_DEVICES` (`js/scenarios.js`).

## Connections are semantic

A port is not just a shape. Every port in `DEVICE_TYPES` (`js/connection-model.js`) has a **jack** (what physically fits), a **direction**, a **signal level** (mic / instrument / line / speaker) and a **role** (channel-input, bus-out, amp-in, amp-out). `checkConnection` decides only physical fit and hard lab rules; `analyzeRig` walks each speaker upstream and decides whether the chain can make sound:

- Aux line out → powered wedge: valid
- Aux line out → amp line in → amp speaker out → passive wedge: valid
- Aux line out → passive wedge: `no-amp` (fits, silent, explained)
- Amp speaker out → any line input: `danger`

Icons and visuals must never be the source of truth; new equipment (SpeakON, IEC power, 3.5 mm breakouts, stereo inputs) should add port metadata here first.

## Scenarios

Scenarios are data in `SCENARIOS` (`js/scenarios.js`); the UI and checker are generic. Full schema and condition list: [SCENARIOS.md](SCENARIOS.md). To add one:

1. Add an entry: `id`, `number`, `title`, `who`, `prompt`, `goal`, `setup` (devices, `patch: "reference" | "none"`, cables, `channels: "mixed" | "safe"`, `sends: { aux1: {sourceId: dB}, aux2: {...} }`, `masters: { aux2: dB }`, `listen`), `baseline` (named metrics), `conditions` (`goal` must become true, `keep` must stay true), three `hints` (destination → path → control), `complete`.
2. Add the scenario id to each source's `scenarios` list in the manifest.
3. Add a short picker label in `shortTitle()` (`js/scenarios.js`); it is also the name used in the Canvas submission. Completion tracking and the submission list read `SCENARIOS`, so a new numbered scenario appears there automatically.
4. If a check needs new logic, add a function to `CONDITIONS` (and a `METRICS` entry for a new baseline). Conditions read state + `computeMix`, never meters or skins; `session.listened` is available for "go listen to X" goals.
5. Add tests in `tests/scenarios.test.mjs`: starts unsolved, the right fix completes it, the tempting wrong fixes don't.

Text can use `{aux1}`, `{aux2}`, `{aux1Master}`, `{aux2Master}`, `{level}`, `{enabled}`, `{main}` so it reads correctly on either skin.

Things a setup can't express yet (add to the schema rather than special-casing): per-channel overrides (e.g. "guitar starts muted" for a fault scenario), pre-set faults, and starting with a cable on the wrong device.

## Stereo input 9/10

Input 9/10 is **one** channel strip (`CHANNEL_LAYOUT[8]`, `stereo: true`, label `"9/10"`), not two mono channels: one gain, one level, one enable, one set of aux sends and PFL.

- **Connectors:** the source is `stereo-laptop` (port `out`: jack `mini`, level `line`, `stereo`). The mixer port `ch9-10` is jack `linepair` (a left + right ¼″ pair patched as one), `stereo: true`, `pad: false`. The only cable that fits both is `mini-dual-ts` (3.5 mm TRS ↔ `dualts14` breakout). It does not fit the mono combo jacks, and mono sources do not fit 9/10.
- **Source data:** `preshow` in `SOURCES` has `stereo: true`, `asset: "preshow"`, a measured `peakDb` (no mono fold-down) and `reference: false`, so it is outside the band's reference rig, but Free play's `patchAlso`/`muted` setup options patch it to 9/10 (breakout cable, gain-staged) with the channel **muted**. Other scenarios don't include it.
- **Signal:** the strip carries L and R at every stage (`stereoGain` nodes in the engine) and skips the panner, so left goes to Main L and right to Main R. Aux and PFL feeds fold to mono. `computeMix` treats it as 0 dB pan law per side (a centred mono strip is −3 dB).
- **State rules:** phantom and pan are ignored on a stereo strip; `setAllPhantom` and the global +48 V state skip it.
- **Skins:** each skin has `stereoStrip` (same shape as `strip`, minus phantom and pan) plus `terms.stereo`. A future skin can draw stereo differently (two meters, a balance knob, or a linked pair of strips) by changing that data. Behaviour stays in state and engine.

## Skins

`SKINS` (`js/mixer-models.js`) map semantic state to presentation: `terms`, `enabledControl`, `levelControl` (fader vs knob), `phantomControl` (per-channel vs global), `meter` scale, `layout` (`console` / `tiles`) and `strip` (rows of parts). Both call the same `MixerStore` actions.

- `channel.enabled` is the only truth. Mixer A's **MUTE** is lit when `enabled === false`; Mixer B's **ON** is lit when `enabled === true`. Pressing either toggles `enabled` (`enabledAfterPress`). The inversion is presentation only.
- Faders and knobs share one position law (`levelToDb`: 0.75 = unity).
- A global +48V switch shows a "mixed" state if channels were set individually.
- Details: [MIXER_MODEL_SCHEMA.md](MIXER_MODEL_SCHEMA.md).

## Audio assets

- `audio/persephone/*.mp3`: 8-bar loop excerpt per stem (scenarios, default).
- `audio/persephone/full/*-NN.mp3`: whole song, 12 × 20 s segments per stem (Free play "Full song").
- `audio/preshow/joth-bossa-nova.mp3`: preshow music (stereo, 59.6 s). In the manifest as `PRESHOW` and `LOOP_ASSETS.preshow`; feeds the `preshow` source on stereo input 9/10.
- The manifest holds per-stem measurements (`monoPeakDb`, `normalizeDb`) that drive the gain-staging model. Regenerate with `tools/make-excerpts.sh [excerpt|full]`; WAV masters are local and gitignored. Details: [../audio/README.md](../audio/README.md).

## Tests and QA

```sh
npm test            # or: node --test tests/   (Node 18+, 121 tests)
python3 -m http.server 8124   # then http://localhost:8124/?debug=1
```

`?debug=1` exposes `window.mixerLab` (`store`, `engine`, `evaluate()`, `mix()`, `selectScenario(id)`, `setSkin(id)`). Before committing UI or audio changes, check in Chromium at desktop (~1280–1440 px) and phone (375 px) widths, in both skins: no console errors, no horizontal page overflow, controls reachable by touch, every scenario solvable through the UI. Note: an unfocused preview pane throttles `requestAnimationFrame`, so DOM updates can lag there; verify state with `mixerLab.evaluate()`.

## Known limitations / deferred

One stereo input (9/10), no balance control on it, and its meter reads a mono fold-down of L/R; two aux buses (a stereo strip sums to mono into them); no EQ, dynamics, effects or feedback; simplified electrical model; one cable per port; sources must go into the mixer; solved scenarios are remembered in this browser's localStorage (ids plus active seconds and action counts per scenario; the submission name and reflection are never stored); iPhone silent switch mutes Web Audio. Free play remembers its last music choice for the session.

## Next planned work

1. ~~Preshow input 9/10~~ — done, see Stereo input below. Still to do: a Preshow scenario.
2. **About 10 beginner scenarios**, alternating build / use / diagnose: Preshow music; More of my voice (Aux 1); Line check; Whole wedge too quiet (Aux 2); Build the drummer wedge (Aux 2 → amp → passive); More piano please (one Aux 2 send); Too much vocal in the house; Where did the guitar go?; Singer can't hear themself; Build a monitor mix. The current "Build the rig" becomes smaller build steps.
3. **SVG equipment/connector icons** as a reusable, themeable library (`icon("passive-wedge")`), not per-scenario drawings: active PA speaker, active wedge, passive wedge, rack amp, laptop, mic, mixer, XLR M/F, 1/4" TRS/TS, 3.5 mm, RCA, SpeakON, IEC.
4. **More physical-routing exercises** built on the semantic port model.
5. Later: more aux buses and more skins.

## Credits

Persephone: music and lyrics Giovanna; guitars Caiden Craig; bass Tyler Fraser; background vocals Jake Flaa and Victoria Nguyen; drums Eli Furie; trumpets Kaizo Hall and Takazo Hall; piano Julian Berger; recording engineers Braedon Martin and Julian Berger; mixing and mastering Eli Furie. Used with permission for this educational project.

Preshow music: "Bossa Nova" by Joth, [OpenGameArt](https://opengameart.org/content/bossa-nova), CC0 (original file `8bit Bossa.mp3`).

The in-app Credits dialog reads `CREDITS` from the manifest; update both places together.
