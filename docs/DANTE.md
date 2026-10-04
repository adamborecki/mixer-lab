# Dante (virtual soundcheck)

The first Dante exercise: play the band's multitrack from a laptop into the Yamaha CL3 over the network, the way a virtual soundcheck works. Scenario "Virtual soundcheck over Dante" (`cl3-dante`).

## The three hops

| Hop | Real world | In the lab |
|---|---|---|
| 1. DAW | Each track's output is a Dante Virtual Soundcard (DVS) channel | The laptop card in Sources → **Open the DAW**: an output per track (`daw.outs[t]`, 0 = none) |
| 2. Dante Controller | A receiver channel subscribes to one transmitter channel | **Open Dante Controller**: a grid, DVS TX across, CL3 RX down; a tick subscribes (`mixer.danteRx[m]`) |
| 3. Console | The INPUT PATCH puts Dante RX n (or the Rio input) on channel n | The touch screen's INPUT PATCH page: RIO or DANTE per channel (`mixer.inPatch[m]`, 0 = Rio, 1 = Dante); RX n is channel n's `dante` jack (`ch{n}-dante`) |

No cables are involved. `danteLinks(rig)` (`js/dante.js`) turns the two settings into cable-like links (DAW track → channel's Dante input). `analyzeRig` and the audio engine's `rewire()` add them to the real cables, so levels, meters, the patch view and scenario checks all work unchanged. Changing a DAW output or a subscription rewires the audio at once.

Playback arrives at the level it was recorded at, after the preamp (`DANTE.levelDb`), so a Dante-patched channel's GAIN knob (the Rio preamp) doesn't change it: `channelGainDb` returns the input's `digitalDb` for a digital input. Phantom power doesn't apply either. The analysis honours the INPUT PATCH (the other jack is ignored even if cabled), and the engine only wires the jack in use.

Scenarios on the CL3: "Virtual soundcheck over Dante" (DAW outputs, Dante Controller, INPUT PATCH to DANTE), "The band is here" (INPUT PATCH back to RIO), "The keys are on the trumpet channel" (Dante Controller subscriptions off by one).

## Pieces

- `js/dante.js`: `DANTE`, `DAW_TRACKS` (the session's track order: the band's input list), `createDaw`, `danteLinks`, `dvsChannelNames`.
- `js/connection-model.js`: the `daw-dvs` device (a source with one port per track, jack `dante`); Dante links in `analyzeRig`.
- `js/compact-defs.js`: CL3 channels have a `dante` jack; `dante: { rx: 32 }` gives the mixer device its `danteRx` subscriptions.
- `js/ui/dante-view.js`: the DAW and Dante Controller windows. `js/ui/patch-view.js` `dawCard`: where each track lands.

## Next steps

- More Dante devices: a second console or a Dante-enabled recorder (the F8n with a Dante adapter, or a Dante-to-analog box), and clock / latency / sample-rate mismatches as faults to find.
- A DAW transport and record-arm: record the console's direct outs back into the DAW over Dante (the other half of a virtual soundcheck).
