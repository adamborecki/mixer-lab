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

## Behringer X32 Compact

The second digital mixer, laid out like a full console rather than a tablet app (X32 COMPACT user manual). Definition `x32c` in `js/compact-defs.js`; surface `js/ui/mixer-x32-view.js` (skin layout `"x32"`), which reuses the Ui16's channel panel and widgets.

| On the desk | In the lab |
|---|---|
| Channel strip (CONFIG/PREAMP, GATE, DYNAMICS, EQ, MAIN BUS, BUS SENDS) for the selected channel | The left panel: GAIN, 48V, Ø, LOW CUT, 4-band EQ, compressor, PAN, **MAIN LR**, sends to MIX 1–6 (each PRE/POST) and FX 1–2 |
| Input section: 8 faders on layers CH 1-8, 9-16, 17-24, 25-32, AUX IN/USB, FX RET | Layers CH 1-8, CH 9-16, AUX / FX (AUX 1/2 stereo strip, FX 1 and FX 2 returns) |
| Group section: 8 faders on layers DCA 1-8, BUS 1-8, BUS 9-16, MATRIX; MAIN LR fader | Layers DCA 1-8 and BUS 1-8 (MIX 1–6 masters with MUTE); MAIN LR with MUTE and the PHONES level |
| SENDS ON FADERS | SEL a MIX: the input faders are sends to it. SEL a channel: the BUS faders are its sends |
| DCA groups: hold a DCA's SEL, press channels' SEL | Press a DCA's SEL to start assigning, press channels' SEL, press it again to finish. A DCA adds its fader (dB) to its channels' faders; a muted DCA mutes them |
| 6 mute groups, assigned with MUTE GRP | MUTE GRP on: pick a group, press channels' SEL. Off: the buttons mute their groups |
| Default routing: XLR OUT 1–6 = MIX 1–6, 7–8 = MAIN L/R | The same, fixed (no routing pages) |
| 16 local XLR inputs (mic or line), 6 aux in/out | Inputs 1–16 (XLR); AUX IN 1/2 as one stereo strip |

**Assumptions to check on a real X32:** a channel's MUTE (and its mute groups, and a muted DCA) silences its bus sends too, pre-fader ones included; new mix-bus sends start POST; the effects are the lab's generic reverb and delay on two dedicated buses, not the X32's FX rack on buses 13–16. **Not built:** gate, inserts, matrices, MAIN C/MONO, layers 17-32 and BUS 9-16, scenes, routing pages, talkback, USB recording, the main display's pages (the display panel only reports what the faders are doing).

## Where this could grow

The same surface can carry a "proper" digital desk later: fader layers (1–16, 17–32), a central screen that changes with SEL, scenes, and mute groups. The Yamaha 01V96 would be the next step: the same SEL + central-screen idea, with fader layers and a fader mode for the aux sends.
