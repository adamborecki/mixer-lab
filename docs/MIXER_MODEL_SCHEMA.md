# Mixer model schema

Three layers, kept apart on purpose:

| Layer | Files | Job |
|---|---|---|
| Semantic state | `js/mixer-state.js` | What the mixer *is*: gain, level, sends, enabled, phantom, patch cables |
| Connection model | `js/connection-model.js` | Connectors, cables, signal levels, and whether a patch makes sound |
| Skins | `js/mixer-models.js`, `js/ui/mixer-view.js` | Words, control types, placement, meter style |

The audio engine ([AUDIO_ENGINE.md](AUDIO_ENGINE.md)) and scenario checker ([SCENARIOS.md](SCENARIOS.md)) read only the first two layers. The chosen skin is not in the state; `js/app.js` keeps it (and remembers it in `localStorage` as `mixer-lab-skin`). Switching skins re-renders the mixer surface from the same state, so nothing is lost.

## State

```js
{
  channels: [ // 8 mono channels; index 0-7 = input 1-8
    { index, gainDb, phantom, enabled, pan, level, auxSends: { aux1, aux2 }, pfl }
  ],
  main:       { level },   // Main L/R master
  aux1:       { level },   // Aux 1 master
  aux2:       { level },   // Aux 2 master
  headphones: { level },   // PFL / phones level
  listen: "main" | "aux1" | "aux2" | "pfl",   // LISTEN_DESTINATIONS
  rig: { devices: [ { id, type, label, short?, sourceId?, zone?, pan? } ],
         cables:  [ { id, from: "dev/port", to: "dev/port", cable } ] },
}
```

The Aux buses are listed in `BUSES` (`["aux1", "aux2"]`); the send keys, master keys and listen destinations all follow it. Speakers have a `zone` (`foh` or `stage`, read by scenario conditions) and a `short` name for the listening bar ("singer's wedge", "house left").

| Field | Range | Default | Meaning |
|---|---|---|---|
| `gainDb` | 0-60, 0.5 steps | 0 | Preamp gain; changes meter, Main, both Auxes, PFL |
| `phantom` | bool | false | +48 V for this channel's XLR/mic path |
| `enabled` | bool | true | In the Main path or not (Main only; see below) |
| `pan` | -1...1 | 0 | Main L/R placement, equal-power |
| `level` | 0...1 | 0 | Fader / level-knob position |
| `auxSends.aux1`, `auxSends.aux2` | 0...1 | 0 | Pre-fader send positions, one per Aux bus |
| `pfl` | bool | false | Channel is on the headphone bus |
| `main.level`, `aux1.level`, `aux2.level` | 0...1 | 0.75 | Master positions |
| `headphones.level` | 0...1 | 0.6 | Phones level |
| `listen` | `main`, `aux1`, `aux2`, `pfl` | `main` | Which bus the student is auditioning (see [AUDIO_ENGINE.md](AUDIO_ENGINE.md)) |

Positions (`level`, sends, masters) use one law: 0.75 = 0 dB (unity), 1.0 = +10, 0.5 = -10, 0.25 = -30, 0 = off. `levelToDb` / `dbToLevel` convert; every skin and scenario uses them.

Change state only through `MixerStore`: `setChannel(i, key, value)` (validates, clamps, ignores unknown keys), `setSend`, `setBusLevel` (`main`, each bus in `BUSES`, `headphones`), `setAllPhantom`, `setListen` (any `LISTEN_DESTINATIONS`), `connect(from, to, cable)` (returns `{ ok, reason }`), `disconnect`, and `replace` (new scenario). Each emits a typed change; the engine rewires only on `rig` and `replace`.

## Level model

Scenario checks, hints and the input-meter bands all use these numbers. The audio graph reproduces them ([AUDIO_ENGINE.md](AUDIO_ENGINE.md)).

```text
post-preamp peak (dBFS) = stem.monoPeakDb + source.outputDb + padDb + gainDb + HEADROOM_DB (-8)
```

- A combo input takes XLR on the mic preamp path (`padDb` 0, phantom capable) and 1/4" on the line path (`padDb` -20). `outputDb` in the manifest says how hot each source is, so it decides how much gain it needs.
- Bands from that peak: clip >= 0, hot >= -4, good >= -22, low >= -40, else none.
- Pan is equal-power (-3 dB in the centre). Live meters show real audio; checks use this computed value instead.

## Rig and connections

Connector and signal level are separate. A 1/4" jack can carry line level (keyboard out) or speaker level (passive speaker in).

- Plugs: XLR, 1/4" TRS, 1/4" TS, RCA, 3.5 mm TRS. Jacks: XLR, XLR/1/4" combo, 1/4", RCA, 3.5 mm. Nine cable types, including XLR-TRS, RCA-TS, 3.5 mm-RCA and a speaker cable that looks like a TS cable but is `kind: "speaker"`.
- Levels: mic, instrument, line, speaker.
- Device types: dynamic mic, condenser mic (`needsPhantom`), DI box, line-level instrument, mixer, powered speaker (`amp: "internal"`), passive speaker (`amp: "none"`), 2-channel power amp.
- The mixer has 8 combo inputs, `main-l` / `main-r` (XLR, line), `aux1` and `aux2` (1/4", line) outputs.

`checkConnection` refuses only physical or lab-rule mistakes: cable does not fit, wrong direction, a port already has a cable, a source patched anywhere but the mixer, a non-source patched into a mixer input, mixer into itself, amp speaker output into an input. Wrong-*level* patches are allowed and explained, because making them is the lesson.

`analyzeRig(rig, channels, sources)` returns:

| Result | Statuses |
|---|---|
| `channels[i]` (`connected`, `signal`, `path`, `padDb`, `messages`) | `empty`, `ok`, `weak` (e.g. mic on the 1/4" side), `no-phantom` (condenser without +48 V or not on XLR), `danger` (speaker level into an input) |
| `endpoints[]` (`valid`, `zone`, `output`, `viaAmp`, `chain`, `messages`) | `unpatched`, `ok`, `no-amp`, `amp-no-input`, `invalid`, `danger` |
| `buses` | mixer output port -> ids of speakers it validly reaches |

Only an `ok` chain makes sound. A channel's `signal` is false for `no-phantom` and `danger`.

## computeMix

`computeMix(state, sourcesById, stems)` gives every consumer the same numbers without touching audio. Per channel: `inputPeakDb`, `band`, `faderDb`, `mainDb {L,R}`, `heardMainDb`, `pflDb`, and one entry per bus in `aux`:

```js
aux: { aux1: { sendDb, monitorDb, heardDb }, aux2: { sendDb, monitorDb, heardDb } }
```

`sendDb` is the send position in dB, `monitorDb` is the channel's contribution to that bus (input peak + send + bus master), and `heardDb` is `monitorDb` only if a valid speaker chain exists on that bus, otherwise `-Infinity`. The result also has `busDb` (`{ aux1, aux2 }`, the master dB per bus, which replaced the old single `auxMasterDb`), `mainMasterDb`, `outputs` and `rig`. Scenarios and hints use it instead of live meters.

## Skins

`SKINS` in `js/mixer-models.js` has two entries. Both call the same `MixerStore` actions.

| Semantic | Mixer A (`analog`) | Mixer B (`compact`) |
|---|---|---|
| `enabled` | **MUTE**, lit when `enabled === false` | **ON**, lit when `enabled === true`, placed at the top of the tile |
| `level` | vertical fader | rotary LEVEL knob |
| `auxSends.aux1`, `aux1.level` | "AUX 1", "AUX 1 MASTER" | "MON 1", "MON 1 MASTER" |
| `auxSends.aux2`, `aux2.level` | "AUX 2", "AUX 2 MASTER" | "MON 2", "MON 2 MASTER" |
| `main.level` | MAIN L/R fader | MAIN knob |
| `phantom` | per-channel 48V button | one global +48V button |
| `gainDb`, `pan`, `pfl` | knobs and a PFL button on every strip | same values, different placement |
| meter | vertical ladder, 0 = -18 dBFS (analog style) | horizontal dBFS LEDs, OL at the top |
| touch drag | vertical | horizontal (page still scrolls vertically) |

Layout differs in kind, not just style. A is a classic strip with 48V, GAIN, AUX 1, AUX 2, PAN and PFL at the top and MUTE above a long fader at the bottom; its master section has the AUX 1 and AUX 2 master knobs and the PHONES knob, each beside a meter, then the Main L/R meters and fader. B is a compact tile with ON directly under the name, a full-width LED meter, then GAIN · PAN, then MON 1 · MON 2, the big LEVEL knob, and PFL at the foot; its master section has the +48V switch, MAIN, MON 1, MON 2 and PHONES knobs, and a row of LED meters.

### Mapping functions

- `enabledLit(skin, enabled)`: whether the skin's button is lit. `skin.enabledControl.litWhenEnabled` is `false` for MUTE and `true` for ON.
- `enabledAfterPress(skin, enabled)`: always `!enabled`. The inversion is only in what "lit" means, never in what a press does.
- `enabledStatusText(skin, enabled)`: words for the state ("Muted" / "Off") so it does not rely on colour.
- `globalPhantomState(channels)`: `"off"`, `"on"` or `"mixed"`. Mixer B's single +48V button lights only for `"on"`, shows "Only Ch 1, 2 - press to switch all on" for `"mixed"`, and pressing it calls `setAllPhantom(true)`. Phantom is still stored per channel, so a state set on Mixer A appears as "mixed" on Mixer B.
- `terms`: display words (`aux1`, `aux2`, `aux1Master`, `aux2Master`, `enabled`, `level`, `main`, ...). Scenario text (prompt, goal, checklist labels, hints, completion) uses placeholders such as `{aux1}`, `{aux2Master}` and `{level}`, filled by `fillTerms(text, skin.terms)`. The old `{aux}` and `{auxMaster}` no longer exist. The patch view also names each mixer output from `terms[portId]`, so a bus's term key must match its port id.

Faders and knobs are both `RangeControl` (`js/ui/controls.js`): an ARIA slider over a 0-1 position with the same `levelToDb` law, so a fader and a knob at the same value mean the same dB. Drag, arrow keys, Home/End, focused scroll wheel and double-click reset work everywhere. On touch, a tap opens a large fine-adjust sheet.

### Layout data

Channel-strip placement is data in the skin, read by `js/ui/mixer-view.js`:

```js
layout: "console" | "tiles",          // picks the CSS family and the master-section builder
phantomControl: "per-channel" | "global",
meter: { style, orientation, marks: [{ db, label }] },
strip: [                               // sections, top to bottom
  { className: "strip-top", rows: [["phantom"], ["gain"], ["aux1"], ["aux2"], ["pan"], ["pfl"]] },
  { className: "strip-bottom", rows: [["enabled"], { parts: ["meter", "level"], className: "fader-row" }] },
],
```

A row is a list of part names (`phantom`, `gain`, `aux1`, `aux2`, `pan`, `pfl`, `meter`, `enabled`, `level`); a lone part needs no wrapper. `phantom` is only drawn when `phantomControl` is `"per-channel"`; a `"global"` skin gets one +48V switch in its master section. Reordering a strip is a data change. The master section is still built in code, one builder per `layout`. `tests/skins.test.mjs` covers the mapping functions and checks that every strip part and hint placeholder exists in both skins.

## Adding a real-hardware skin

A new skin should need no change to `audio-engine.js`, `scenarios.js` or `connection-model.js`.

1. Add a `SKINS` entry: `terms` (every placeholder scenario text uses, including `aux1`, `aux2`, `aux1Master` and `aux2Master`), `enabledControl` (label, `litWhenEnabled`, lit/unlit text), `levelControl`, `meter`, `dragAxis`. Express any polarity or naming difference here.
2. Describe the strip in `strip` (sections of rows of parts) and pick a `layout`. Reusing `"console"` or `"tiles"` needs no view code; a new `layout` needs a master-section builder in `js/ui/mixer-view.js` (using only `RangeControl`, `LitButton`, `MeterView` and `MixerStore` actions) and `.skin-<id>` CSS. Add a button in `index.html` (`data-skin`).
3. If the hardware has a concept the state lacks (separate SOLO/AFL, per-channel pre/post switch, an ON that gates sends), add it to the semantic state and engine first, document it here, and only then map it. Do not hide behaviour inside a skin.
4. Add pure tests for the new mapping functions.
