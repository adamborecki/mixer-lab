# Digital mixer: Soundcraft Ui16

The first digital mixer in the lab, kept deliberately small. It teaches the two habits every digital desk shares, whatever the brand:

1. **The faders mean what the mix bar says.** On MIX they are channel levels into the MASTER. On AUX 1 they are each channel's send into AUX 1 (sends on faders). On REVERB they are the sends into the reverb. On GAIN they are the preamps. The fader on the right is always the master of the mix you picked.
2. **SEL, then edit.** A channel has no knobs of its own. SEL it, and one panel shows its input (GAIN, 48V, Ø, Hi-Z), HPF, 4-band parametric EQ, compressor, pan and every send.

Picked from the **Real mixers** menu ("Soundcraft Ui16 (digital)"). It opens a Free play gig with the whole band, both wedges and the built-in effects.

## How it's built

The Ui16 is a compact-mixer definition (`ui16` in `js/compact-defs.js`, `digital: true`), so state, the level model and the audio graph are shared with the analog compact mixers ([COMPACT_MIXERS.md](COMPACT_MIXERS.md)). What's new:

| Piece | Where |
|---|---|
| The surface: mix bar, fader bank with SEL, master strip, SEL panel | `js/ui/mixer-digital-view.js` (skin layout `"digital"`) |
| Which page and which channel are selected | the view's own `view.digital` (not mixer state, not saved) |
| 4-band parametric EQ (`peq`), compressor (`dyn`) | `PEQ_BANDS`, `DYN` in `js/compact.js`; biquads and a `DynamicsCompressorNode` in `js/graph-compact.js` |
| AUX PRE/POST per channel and per send (tap `"each"`, `ch.pres`) | `js/compact.js` `computeMix`, `js/graph-compact.js` |
| MUTE cuts pre-fader sends too (`muteCutsPre`) | same |
| REVERB / DELAY / CHORUS as buses with `fx`: send → effects unit → return level → MASTER | `js/graph-compact.js` (`buildFxUnit`, shared with the Xenyx) |
| AUX 1–4 XLR outs (`auxOut: "xlr"`) | `compactPorts` |

`MixerStore.setChannel` now takes keys of any depth ("peq.hiMid.gain").

## What the Ui16 has

- Inputs: 1–8 XLR/¼″ combo (1 and 2 with Hi-Z), 9–12 XLR, a stereo RCA line in (13/14 here).
- Per input: GAIN, 48V, Ø, HPF, 4-band PEQ, compressor, pan, MUTE, SOLO, AUX 1–4 sends (each PRE or POST, PRE to start), REVERB / DELAY / CHORUS sends.
- Outputs: MASTER L/R and AUX 1–4 on XLR, two headphone outs.
- Three Lexicon effects: reverb, delay, chorus.

## Sources

Soundcraft's Ui16 product description (inputs, 4 aux sends, 3 Lexicon effects, 4-band PEQ, HPF, compressor, de-esser, gate, 31-band GEQ on outputs) and excerpts of the Ui16 user manual (AUX sends: PRE by default per channel, PRE/POST per send, AUX mute per send, copy the MIX to an aux; the GAIN page with gain faders, 48V and PHASE). The full manual PDF couldn't be downloaded, so these are worth checking on the unit.

## Left out, or guessed

- **Gain range** −6…+57 dB is assumed; ¼″ line inputs are 20 dB lower, as on the other mixers.
- **Not built:** noise gate, de-esser, DigiTech amp models (Hi-Z switches but changes nothing, as on the STAGEPAS), 31-band graphic EQ and AFS on outputs, mute and view groups, subgroups, the USB player, AUX send mute per channel, copying the MIX to an aux, MOREME, a second headphone out.
- **Effects** are the lab's generic units (one preset each), not Lexicon algorithms; there are no effect parameters yet.
- **HPF** sweeps 20–600 Hz here.
- **EQ and compression** are heard but, as on every mixer, the scenario level model leaves them out.
- **Meters** show each channel after its EQ, and the master meters the main mix (or the solo).

## Where this could grow

The same surface can carry a "proper" digital desk later: fader layers (1–16, 17–32), a central screen that changes with SEL, scenes, and mute groups. The Yamaha 01V96 and the Behringer X32 would be the next steps up; both are SEL + central-screen desks.
