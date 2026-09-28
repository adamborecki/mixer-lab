# MUS 248 `mixer-lab` — V1.2 Build Spec

**Status:** implementation spec / ambitious but bounded V1  
**Audience:** Claude Code / Opus working in this standalone `mixer-lab` repository  
**Goal:** build a mobile-friendly interactive live-sound mixer lab with real Web Audio behavior, scenario-based learning, real band stems, and a mixer architecture that can support genuinely different interface skins.

---

## 0. Read first; precedence

1. Read this entire build spec before coding.
2. Read `PROJECT_CONTEXT.md`. It explains the teaching intent, physical-equipment context, and future direction. **This build spec is the implementation authority** if the two documents conflict.
3. This is a new, standalone static GitHub Pages repository. Use **vanilla HTML, CSS, and JavaScript / ES modules**. Do not introduce a framework, bundler, backend, database, accounts, analytics, or a package manager solely for this app.
4. Inspect the current `camera-lab` and `sound-lab` implementations or public pages before designing the UI. Reuse their clean educational visual language and interaction patterns where sensible; do not substitute an unrelated design system merely because those projects are not checked out here.
5. Do not include student names, grades, access codes, or private material. This is a public site.
6. This is an instructional simulator, not a photorealistic product clone. Signal-flow clarity, audibility, touch usability, and transfer of concepts are more important than decorative console realism.

---

## 1. Product purpose

`mixer-lab` helps students reason about an unfamiliar live-sound system rather than memorize one model of mixer.

The central idea is:

> **The same underlying routing and audio concepts can appear through different labels, layouts, controls, and logic.**

Students should be able to identify a source and level, connect it to an appropriate input, gain-stage it, route it to Main and a monitor mix, patch each output to a valid playback chain, and hear what changed at each destination.

V1 must include **two deliberately different generic mixer skins** that drive the same semantic mixer state and the same audio engine. This proves the architecture; it is not decorative variety.

---

## 2. Course alignment and V1 boundary

The app supports a four-part sequence:

1. **Inputs, outputs, levels, and amplification:** mic/instrument/line/speaker level; preamp versus power amplifier; powered versus passive speakers; connector is not signal level.
2. **Mixing:** gain versus channel level, pan, meters, PFL, mute/on logic, Aux sends, and monitor mixes.
3. **Multiple destinations and recording:** audience mix, monitor mix, stereo board feed, direct outs, multitrack feeds, and buses.
4. **Troubleshooting and gig integration:** no-sound cases, faulty routing, power/setup safety, and verification workflows.

V1 provides the foundation, but implements only this slice:

- band sources into a generic mixer;
- Main L/R and one pre-fader monitor/Aux bus;
- valid versus invalid playback chains;
- real audible differences, meters, gain, level, pan, PFL, and channel mute/on;
- three data-defined scenarios plus free play;
- two generic mixer skins.

---

## 3. V1 student experience

At `/`, a student sees a concise introduction and an explicit **Start Audio** button. Do not create or resume audio before a user gesture.

The student can:

1. select and patch sources to appropriate mixer inputs;
2. distinguish connector type from signal level;
3. set preamp gain and channel level;
4. route channels to Main L/R and independently to a pre-fader Aux 1/monitor bus;
5. patch Main and monitor outputs to appropriate playback systems;
6. choose whether to audition Main L/R, Monitor/Aux 1, or PFL;
7. hear and meter genuine state changes;
8. solve short prompts whose success is calculated from routing and audio state;
9. switch between two different generic mixer representations without changing underlying state.

Mobile is a first-class target. On narrow screens, use purposeful sections or tabs such as **Sources**, **Mixer**, **Outputs**, and **Scenario**; never shrink a desktop mixer until controls are unreadable.

---

## 4. Sources, real stems, and audio delivery

### 4.1 Use the real band stems

The repository currently contains seven synchronized Persephone stems. They are stereo, 44.1 kHz, 24-bit WAV files, each approximately 238 seconds and 63 MB. They share a timeline and must remain sample-synchronized.

The high-resolution files are source material, not the browser delivery format. Do not make a phone download or decode all seven full-length masters for routine V1 use.

### 4.2 Build web delivery assets

Before implementing final audio loading:

1. Preserve the existing high-resolution originals unchanged in their source folder.
2. Create a short, musically useful, synchronized excerpt for every stem (target roughly 30–60 seconds, all cut from the identical timeline region).
3. Create browser-friendly compressed delivery assets for those excerpts. Favor broad modern-browser compatibility and reasonable mobile download size. Do not require a server or runtime transcoding.
4. Place delivery assets in a clear folder such as `audio/persephone/` and use lowercase, hyphenated, web-safe names. Examples:
   - `persephone-drums.*`
   - `persephone-bass.*`
   - `persephone-guitars.*`
   - `persephone-piano.*`
   - `persephone-trumpets.*`
   - `persephone-backing-vocals.*`
   - `persephone-lead-vocals-doubles.*`
5. Add a short `audio/README.md` documenting the source files, excerpt start/duration, format, and regeneration process.

Do not silently delete, overwrite, or move originals. If the public status of the stems is uncertain, stop and request direction before publishing them.

### 4.3 Manifest and source map

Create a human-editable source manifest/config; do not hard-code audio filenames throughout the app. It must provide, at minimum:

- source id and display name;
- FOH input order;
- source category and expected signal level;
- input connector type;
- delivery-asset path and channel treatment;
- whether it is available in each scenario.

Use this default FOH-oriented order:

1. Drums / percussion
2. Bass
3. Guitars
4. Piano / keys
5. Trumpets / horns
6. Backing vocals and vocal doubles
7. Lead vocal

V1 should expose these seven source strips in that order. The mixer may have an eighth spare/empty strip if it makes the layout clearer, but no source should be silently omitted. Treat each strip as a mono live-sound input for V1: safely derive a mono signal from its stereo stem before applying the channel pan. Preserve the manifest flexibility needed for later linked stereo channels.

Map the band audio to plausible teaching-facing virtual sources. For example, the lead-vocal stem may represent a dynamic vocal microphone (XLR, mic level), while a keyboard/piano stem may represent a line-level source. Include a condenser-mic source/lesson state that requires 48 V; it may use an appropriate available stem or a simple development fallback, but the pedagogical source metadata and phantom behavior must be real.

Load only the buffers needed for the active scenario/free-play selection where feasible. Once selected buffers are decoded, schedule them at the same `AudioContext` time and loop them from the same start/end points. A loading/ready state is required; never start one stem early because another is still decoding.

If an expected delivery asset is missing or fails to load, show a clear non-blocking error and allow a simple generated test tone only as a development fallback. Do not create synthetic music.

---

## 5. Connection, connector, and signal-level model

The V1 connection model must represent both:

1. **physical connector**, and
2. **signal type/level**.

They are related but not interchangeable.

Model at least:

- XLR;
- 1/4-inch TRS;
- 1/4-inch TS;
- RCA;
- 3.5 mm TRS;
- mic, instrument, line, and speaker level.

Keep compatibility rules separate from UI rendering. Illustrative rules:

- XLR dynamic mic → mic input: valid.
- Condenser mic → mic input without required 48 V: physically connected but no useful signal, with teaching feedback.
- Line source → line input: valid.
- Mixer line output → powered speaker line input: valid.
- Mixer line output → passive speaker: incomplete/invalid because there is no power amplifier.
- Mixer line output → power amplifier → passive speaker: valid.

For V1 patching, favor touch-friendly interaction: select a source/output port, select an appropriate cable/adapter when needed, select the destination input, then render a clear visible connection. Support disconnect/repatch. Desktop drag interactions are optional only if touch behavior remains excellent.

---

## 6. Playback and amplification model

The recurring teaching question is: **Where is the amplifier?**

Implement these V1 endpoints:

- **Powered/active speaker:** `mixer line output → powered speaker line input → sound`; the power amplifier is inside the speaker.
- **Passive speaker:** must not produce normal output from a mixer line output alone.
- **Power amplifier:** accepts line level and emits speaker level; inserting it before a passive speaker creates a valid chain.

The browser listening selector represents the currently monitored virtual endpoint. It must honor connection validity:

- **Main L/R** is audible only through a valid Main playback chain.
- **Monitor/Aux 1** is audible only through a valid monitor playback chain.
- **PFL** is a headphone-monitoring path and remains auditionable without a speaker-chain patch.

Do not bypass an invalid physical chain merely because the browser itself can play audio.

Keep architecture open for later integrated systems such as Stagepas, keyboard amps, powered mini monitors, and one-powered/one-passive monitor pairs.

---

## 7. Semantic mixer state and signal behavior

### 7.1 Channel and bus state

Each mono channel needs semantic state for:

- source/input connection;
- preamp gain;
- phantom-power state/capability;
- input meter and clip state;
- `enabled` state;
- pan;
- channel level;
- Aux 1 send;
- PFL state.

Global state needs:

- Main L/R master;
- Aux 1 master;
- headphone level;
- selected listening destination.

### 7.2 Required V1 topology

```text
source → preamp gain → input meter → split
                                      ├─ main path: enabled → channel level → pan → Main L/R → Main master → valid Main destination
                                      ├─ monitor path: Aux 1 send (pre-fader) → Aux 1 bus → Aux master → valid monitor destination
                                      └─ PFL: post-preamp, pre-fader isolated headphone monitor
```

Required behavior:

- Gain changes audio and metering before the channel-level control.
- Channel level changes Main L/R contribution.
- Aux 1 is pre-fader in V1: moving channel level does not change its monitor contribution.
- Aux send changes that channel’s monitor contribution.
- Aux master changes the entire monitor mix.
- Pan changes Main L/R placement.
- PFL is post-preamp and pre-fader; it does not change Main or Aux routing.
- PFL is the V1 behavior. Do not implement conflicting Solo/AFL/Cue variants now; later skins may map related terminology through the model.
- Meters use actual audio, not random animation.
- Excessive input gain visibly indicates clipping. Audible clipping is optional.

### 7.3 Mute/On convention

`channel.enabled` is the semantic state. Skin A renders it with an inverted **MUTE** control; Skin B renders it with a direct **ON** control.

For V1, changing `enabled` affects the Main path only. The pre-fader Aux 1 and PFL taps remain active. This is intentional and must be visible in the signal-flow explanation; it demonstrates that a pre-fader monitor send can continue while a channel is removed from the audience mix. Do not generalize this behavior to every real mixer.

Use Web Audio API nodes, keep audio nodes independent from DOM controls, and use a lightweight browser-safe metering approach such as `AnalyserNode` plus RMS/peak calculations.

---

## 8. Two required generic mixer skins

The audio engine and scenario system operate on semantic state. A skin maps that state to labels, controls, placement, and display logic. Do not put manufacturer-specific behavior into the core engine.

Example semantic state:

```js
channel.enabled = true;
channel.level = 0.75;
channel.gainDb = 18;
channel.auxSends.aux1 = 0.4;
channel.pan = 0;
```

Implement both of the following against that same state and audio graph:

### Skin A — Generic Analog Console

- vertical channel faders;
- `MUTE` control: lit/active means `enabled === false`;
- `AUX 1` terminology;
- conventional channel-strip layout;
- gain and pan pots;
- console-like Main and Aux masters.

### Skin B — Generic Compact / Alternate Mixer

- rotary channel level controls rather than long faders;
- `ON` control: lit/active means `enabled === true`;
- `MON` terminology for the same Aux 1 bus;
- materially different control placement/order and compact layout.

Provide a clear skin selector. Switching skins preserves mixer state, scenario state, patching, and audio behavior. Scenario evaluation must never depend on which skin is selected.

Do not spend V1 time cloning Mackie, Yamaha, Behringer, X32, CL3, or DM2000 layouts.

---

## 9. Scenarios and free play

Build scenarios as data, not hard-coded screen flow. Each scenario definition should include:

- id, title, student-facing prompt, and optional progressive hints;
- starting patch/state, including available sources/devices, source buffers, initial gain/level/send/master values, and listening destination;
- success conditions evaluated from state and computed signal/path validity;
- named baseline values/tolerances for conditions that compare against the initial state;
- completion text and reset behavior.

Hints should guide thought before giving away the answer: destination first, then relevant bus/path, then exact control.

### Scenario A — Build the rig

Starting state: at least two available sources, unpatched or deliberately incomplete Main destination, and safe initial levels.

Success requires actual state showing:

- two different appropriate sources connected to mixer inputs;
- usable gain and audible channel signal;
- both contributing to Main L/R;
- a valid Main chain ending in a powered speaker, or in a power amp plus passive speaker.

Completion is automatic; no “I did it” checkbox.

### Scenario B — “More of my voice in the monitor”

Starting state: lead vocal and at least one other source are audible in Main and Monitor; the monitor chain is valid; store baseline Main energy/level and vocal Aux send.

Success requires:

- the lead-vocal Aux 1 send rises meaningfully from baseline;
- Main contribution/level remains within documented tolerance of baseline;
- the valid monitor mix has increased lead-vocal contribution.

### Scenario C — “The whole monitor mix is too quiet”

Starting state: a valid, balanced monitor mix with two or more sources and a deliberately low Aux master; store each channel-send ratio and Aux-master baseline.

Success requires:

- Aux master rises meaningfully from baseline;
- relative channel-send balance stays within documented tolerance;
- the monitor chain remains valid.

### Free Play

Include a simple Free Play mode. Students can patch, mix, audition Main/Aux/PFL, and intentionally break/fix routing without an objective.

---

## 10. UI and accessibility

Match the general feel of `camera-lab` and `sound-lab`: clean, visual, educational, and game-like—not a dense manual or photorealistic console.

Requirements:

- touch-friendly controls and no tiny hit targets;
- readable on phones and classroom laptops;
- concise instructional language, not walls of prose;
- values and state readable without color alone;
- semantic HTML controls and reasonable keyboard accessibility;
- clear source, mixer, destination, and scenario regions at desktop width;
- visual patch/status feedback and a clear listening-destination selector.

Do not force desktop-width channel strips onto a phone. Different responsive structures are allowed as long as both skins still visibly express their distinct control conventions.

---

## 11. Code and file organization

Use the repository root; do not create an unnecessary nested `mixer-lab/` folder.

Suggested structure, adjusted only when a clearer equivalent is warranted:

```text
index.html
styles.css
README.md
PROJECT_CONTEXT.md
MIXER_LAB_BUILD_SPEC_V1_2.md
audio/
  README.md
  persephone/
  source-manifest.js
js/
  app.js
  audio-engine.js
  mixer-state.js
  mixer-models.js
  connection-model.js
  scenarios.js
  meters.js
  ui.js
docs/
  AUDIO_ENGINE.md
  MIXER_MODEL_SCHEMA.md
  SCENARIOS.md
tests/
  routing.test.mjs
  scenarios.test.mjs
```

Keep pure routing/state/scenario logic testable without a browser. Node’s built-in test runner is appropriate if tests are added.

---

## 12. Documentation to create

Create and maintain:

- **`README.md`:** what the lab teaches, local run instructions, current V1 scope, limitations, audio asset process, and future expansion areas.
- **`docs/AUDIO_ENGINE.md`:** signal graph; Main/Aux/PFL behavior; mute convention; metering; real-stem delivery/loading/synchronization; how additional buses can be added.
- **`docs/MIXER_MODEL_SCHEMA.md`:** semantic state versus skin mappings; ON/MUTE inversion; fader/pot mapping; approach for future real-hardware skins without changing core audio behavior.
- **`docs/SCENARIOS.md`:** schema, scenario baselines/tolerances, success-condition philosophy, V1 scenarios, and authoring guidance.

---

## 13. V1 non-goals

Do not delay V1 for:

- photorealistic real-console skins;
- X32, CL3, DM2000, or other named-console simulations;
- more than one Aux bus;
- matrices, subgroups, or multitrack recorder UI;
- Dante or other networked-audio workflows;
- full effects, EQ, compression, gates, or feedback simulation;
- exact impedance/electrical simulation;
- exhaustive departmental cable/adapter inventory;
- room/provenance game;
- multiplayer, accounts, saved progress, backend, or analytics.

Keep clean expansion hooks for additional buses, configurable pre/post taps, stereo/linked channels, recording/direct outs, processing, connector/adapter challenges, fault injection, future skins, integrated PA systems, power sequencing, and Salmon-specific scenarios.

---

## 14. Acceptance criteria

V1 is complete when all of the following are true:

1. The repository root runs as a static GitHub Pages site with no build step.
2. The app works at desktop and phone-sized viewports.
3. Audio initializes only after a user gesture.
4. Real Persephone delivery assets are documented, web-safe, manifest-driven, and synchronized; the app does not routinely load all full-resolution masters.
5. The seven named sources appear in configurable FOH order and are not hard-coded throughout the app.
6. At least two simultaneous real sources can be heard and metered.
7. Gain changes actual source audio/meter behavior before channel level.
8. Channel level changes Main without changing the pre-fader Aux send.
9. Aux send independently changes monitor mix; Aux master changes its overall level.
10. Main, Monitor/Aux, and PFL can be auditioned separately, with virtual speaker listening blocked by invalid patch chains.
11. A powered speaker chain works; passive speaker directly from a mixer line output is clearly incomplete; inserting a power amp makes it valid.
12. XLR, 1/4-inch TRS/TS, RCA, and 3.5 mm concepts exist in the connection model, separate from signal levels.
13. Dynamic and condenser microphone concepts exist; condenser behavior accounts for 48 V.
14. The explicit V1 PFL and enabled/mute conventions are audible and documented.
15. All three scenarios auto-detect success from state and computed routing/audio conditions, not a completion checkbox.
16. Both generic skins use the same semantic state and Web Audio graph.
17. The skins visibly demonstrate MUTE/ON inversion, fader/pot level control, and AUX/MON terminology while retaining identical underlying behavior.
18. Changing skins preserves state and does not break audio, patches, or scenarios.
19. Documentation exists and pure routing/scenario tests pass if added.
20. Claude manually inspects the finished app in Chromium at desktop and phone widths before committing.

---

## 15. Recommended implementation sequence

1. Inspect reference labs, repository documents, and stem metadata; decide/create web delivery excerpts and manifest.
2. Build and test semantic mixer state plus pure connection/compatibility and scenario-evaluation logic.
3. Build Web Audio playback, synchronized loading, Main/Aux/PFL routing, metering, and the explicit mute convention.
4. Implement source/input and output/destination patching, including valid/invalid amplification chains.
5. Render Skin A, then render Skin B through the mapping layer—never duplicate the audio or scenario logic.
6. Implement the three scenarios and Free Play.
7. Complete documentation, tests, and manual desktop/mobile browser review.

---

## 16. Final instruction

Build the **smallest genuinely useful functioning V1**, not a mockup.

The core success is a student hearing real routing differences using real band stems, patching sources and destinations, distinguishing Main from a pre-fader monitor send, recognizing powered versus passive output chains, solving short scenarios, and switching between two meaningful generic mixer skins—while semantic mixer behavior remains cleanly independent from skin-specific labels and controls.

Make reasonable low-risk implementation decisions without pausing for cosmetic questions. Record consequential assumptions in documentation. If a feature threatens core routing accuracy, mobile usability, or the static-site architecture, defer it and document the expansion hook.
