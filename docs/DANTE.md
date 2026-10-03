# Dante (virtual soundcheck)

The first Dante exercise: play the band's multitrack from a laptop into the Yamaha CL3 over the network, the way a virtual soundcheck works. Scenario "Virtual soundcheck over Dante" (`cl3-dante`).

## The three hops

| Hop | Real world | In the lab |
|---|---|---|
| 1. DAW | Each track's output is a Dante Virtual Soundcard (DVS) channel | The laptop card in Sources → **Open the DAW**: an output per track (`daw.outs[t]`, 0 = none) |
| 2. Dante Controller | A receiver channel subscribes to one transmitter channel | **Open Dante Controller**: a grid, DVS TX across, CL3 RX down; a tick subscribes (`mixer.danteRx[m]`) |
| 3. Console | The input patch puts Dante RX n on channel n | Fixed: RX n is channel n's `dante` jack (`ch{n}-dante`) |

No cables are involved. `danteLinks(rig)` (`js/dante.js`) turns the two settings into cable-like links (DAW track → channel's Dante input). `analyzeRig` and the audio engine's `rewire()` add them to the real cables, so levels, meters, the patch view and scenario checks all work unchanged. Changing a DAW output or a subscription rewires the audio at once.

Playback arrives at line level (`DANTE.levelDb`, −10), not at the stem's mic level, so a Dante channel needs far less gain than the mic it replaces (`digitalDb` in the input analysis, added by `channelGainDb`). Phantom power doesn't apply to it.

## Pieces

- `js/dante.js`: `DANTE`, `DAW_TRACKS` (the session's track order: the band's input list), `createDaw`, `danteLinks`, `dvsChannelNames`.
- `js/connection-model.js`: the `daw-dvs` device (a source with one port per track, jack `dante`); Dante links in `analyzeRig`.
- `js/compact-defs.js`: CL3 channels have a `dante` jack; `dante: { rx: 32 }` gives the mixer device its `danteRx` subscriptions.
- `js/ui/dante-view.js`: the DAW and Dante Controller windows. `js/ui/patch-view.js` `dawCard`: where each track lands.

## Next steps

- The console's input patch as a real choice (Rio or Dante per channel), so switching back from the virtual soundcheck is part of the exercise.
- More Dante devices: a second console or a Dante-enabled recorder (the F8n with a Dante adapter, or a Dante-to-analog box), and clock / latency / sample-rate mismatches as faults to find.
- A DAW transport and record-arm: record the console's direct outs back into the DAW over Dante (the other half of a virtual soundcheck).
