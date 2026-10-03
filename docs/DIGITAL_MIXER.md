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

## Behringer X32 (full size)

The whole console, sharing the X32 Compact's model and surface (definition `x32`; the surface is data-driven through `def.surface`). What the Compact doesn't have:

| On the desk | In the lab |
|---|---|
| 32 local XLR inputs; 16 input faders on layers CH 1-16, 17-32, AUX IN/USB, FX RETURNS, BUS MASTER | The same layers (the room pair lives on 17/18) |
| Group faders: DCA 1-8, BUS 1-8, BUS 9-16, MATRIX 1-6 + MAIN C | The same four layers; MATRIX strips and M/C are selectable |
| 16 mix buses; a bus can be a subgroup (its master assigned to MAIN LR with a PAN) | MIX 1–12 with MAIN LR and PAN on the bus master (`busToMain`): the model adds the bus path to the channel's main contribution in amplitude |
| MONO/CENTER bus: a send per channel, its own fader | `ch.mc` (post-fader) and the M/C master |
| 6 matrices, fed from MAIN LR, M/C and the buses | `mtx1`–`mtx6`, each with a send level per source and a fader; SEL MAIN, a MIX or M/C to see its matrix sends, or SEL a matrix to see its sources |
| 8-slot FX rack, usually fed by MIX 13–16 and returning on FX RTN | MIX 13–16 feed FX 1–4 (room, plate, delay, chorus), back on the FX RETURNS layer |
| ROUTING / analog out: any internal signal on any XLR OUT | The ROUTING page: XLR OUT 1–16, each OFF, MAIN L/R, M/C, MIX 1–12 or MATRIX 1–6 (`state.routing`). What a speaker hears follows the routing |
| SCENES: store and recall | The SCENES page: 8 slots, STORE (with a name) and RECALL. A scene holds every setting but the cables, the listening position and the scenes |

The lab's starting patch is MIX 1–8 on OUT 1–8 and MAIN L/R on OUT 15/16 (not necessarily the factory default). Scenes 1 (Full band) and 2 (Acoustic set) come preloaded.

**Not built:** MAIN C/LCR panning, matrix pairing, bus-to-matrix taps other than post-fader, scene safes and recall filters, the rest of the FX models, AES50, talkback, user-assign controls.

## Yamaha 01V96i

The third digital desk, and the classic "SEL + central screen" console (01V96i Reference Manual). Definition `yam01v96` in `js/compact-defs.js`; surface `js/ui/mixer-01v96-view.js` (skin layout `"01v96"`).

| On the desk | In the lab |
|---|---|
| INPUT 1–12 (XLR A / TRS B), PAD 20 dB, GAIN (sensitivity −60…−16 dB), PEAK/SIGNAL; INPUT 13–16 line (−26…+4) | The INPUT row: GAIN +16…+60 on 1–12 with PAD, −4…+26 on 13–16 |
| Rear-panel PHANTOM +48V: CH1–4, 5–8, 9–12 | Three group switches in REAR PANEL |
| 16 faders with SEL, SOLO, ON (lit = on); LAYER 1–16, 17–32, MASTER | LAYER 1–16 and MASTER (AUX 1–6 masters with ON) |
| FADER MODE AUX 1–8, HOME | The same: AUX n turns the faders into that aux's sends |
| SELECTED CHANNEL: PAN, band keys HIGH / HIGH-MID / LOW-MID / LOW, Q, FREQUENCY, GAIN | The same: one band at a time |
| Display + DISPLAY ACCESS keys | Pages STATUS, PAN/ROUTING (TO ST, Ø, PAN), EQ (all four bands), DYNAMICS (THRESHOLD, RATIO, OUT GAIN), AUX (eight sends with PRE/POST), AUX SETUP (PRE POINT), PATCH (read only) |
| AUX SETUP PRE POINT: PRE ON / POST ON | `auxSetup.prePoint`: with POST ON, a channel switched OFF also leaves its pre-fader sends |
| ST IN 1–2 (effects returns), STEREO fader and ON, 2TR IN (AD 15/16 selector) | The same |

**Patching (not the factory default):** the manual's default sends AUX 1–4 to both OMNI OUT 1–4 and effects 1–4. The lab uses the usual working patch instead: AUX 1–4 → OMNI OUT 1–4 only, AUX 7 → effect 1 (reverb) → ST IN 1, AUX 8 → effect 2 (delay) → ST IN 2. **Assumed:** sends start POST, PRE POINT starts POST ON. **Not built:** layer 17–32, buses 1–8, GATE, ATT, input delay, inserts, pairing, scenes, user-defined keys, the 2TR IN monitor selector.

## Yamaha DM2000

The 01V96's big brother (DM2000 V2 Quick Start Guide). Definition `dm2000` in `js/compact-defs.js`; surface `js/ui/mixer-dm2000-view.js` (skin layout `"dm2000"`).

| On the desk | In the lab |
|---|---|
| 24 analog inputs: GAIN, PAD, INSERT and +48V on the top panel | GAIN, PAD and +48V for inputs 1–24 (no insert) |
| 9 fader layers: 1-24, 25-48, 49-72, 73-96, MASTER (BUS 1-8, AUX 1-12, MATRIX 1-4), 4 remote | LAYER 1–24 (the analog inputs), 73–96 (effects returns 73–76 and 2TR IN on 89/90), MASTER (BUS 1–8, AUX 1–8, MATRIX 1–4) |
| Each strip: encoder, SEL, SOLO, ON, fader, a name display | The same. ENCODER MODE PAN or AUX, FADER MODE FADER or AUX, AUX SELECT picks which aux; the display line shows routing and groups |
| SELECTED CHANNEL: EQUALIZER (4 bands), DYNAMICS, AUX/MATRIX SEND with BANK, PAN, ROUTING keys 1–8, STEREO | The same, with EQ ON and COMP ON keys; AUX SEND banks 1–4 / 5–8 with PRE |
| LCD + DISPLAY ACCESS | EQUALIZER (curve), DYNAMICS (graph), AUX SEND, ROUTING (BUS TO ST with pan), MATRIX, OUTPUT PATCH, GROUP, SCENE |
| Buses 1–8 are routed to STEREO on the BUS TO ST page (subgroups) | `sends.busN` (0/1, the `assign` law) plus `busN.lr` / `busN.pan` |
| Only STEREO OUT has its own jacks; AUX, BUS and MATRIX reach OMNI OUT 1–8 through the OUTPUT PATCH | STEREO OUT L/R, and OMNI OUT 1–8 routed (`outputs: ["stereoRouted"]`); AUX 1–6 start on OMNI 1–6 |
| Fader groups A–H, mute groups I–P: no masters, the members' faders and ON keys are linked | `ch.fgrp`, `ch.mgrp` store membership; the surface moves the linked faders (same travel) and ON keys |
| 8 effects, AUX 1–8 into FX 1–8, returns on channels 73–88 | AUX 7 → REV-X Hall → CH 73/74, AUX 8 → delay → CH 75/76 |

**Assumed / not built:** channels 25–72, AUX 9–12, matrix sends from individual buses on the surface (the MATRIX page has them all), the LOW band as HPF (no separate high-pass), GATE, inserts, delay, pairing, surround and the joystick, automix, GEQs, recall safe, the input patch. Sends start POST; the ON key cuts pre-fader sends too. On the real desk the default patch sends AUX 1–8 to both OMNI 1–8 and the effects.

## Yamaha CL3

A touring console (CL5/CL3/CL1 Reference Manual), built on the X32's model and strips. Definition `cl3` in `js/compact-defs.js`; surface `js/ui/mixer-cl-view.js` (skin layout `"cl"`), which reuses the X32 view's strips and panels with Yamaha words (`def.surface.terms`).

| On the desk | In the lab |
|---|---|
| Rio3224-D stage boxes over Dante; the head amps (GAIN −6…+66 dB, +48V) are controlled from the console | Inputs are named RIO IN 1–32, and Rio IN n feeds channel n (no input patch) |
| SELECTED CHANNEL section, left of the touch screen: GAIN, HPF, PAN, Q / FREQUENCY / GAIN for four EQ bands, DYNAMICS THRESHOLD | The same knobs. They keep moving the EQ while it's off, so the section warns "EQ is OFF" / "DYNAMICS is OFF" |
| Touch screen: OVERVIEW (eight channels with gain, dynamics and EQ fields), SELECTED CHANNEL VIEW (one channel's every field) | OVERVIEW shows the eight channels on Centralogic with their compressor and EQ graphs (tap a name to open it). SELECTED CHANNEL holds the SEL panel plus the DCA and MUTE GROUP assignment fields |
| INPUT section faders with SEL, CUE, ON (lit = on) | 16 faders, banks CH 1-16, CH 17-32, ST IN (the laptop on ST IN 1 and the effects returns) |
| Centralogic: 8 faders under the screen; Bank Select keys load channels, DCAs, MIX or MATRIX | Banks CH 1-8, 9-16, 17-24, DCA 1-8, DCA 9-16, MIX 1-8, MIX 9-16, MATRIX |
| Master section: STEREO, SENDS ON FADER, USER DEFINED keys | STEREO with ON, SENDS ON FADER, eight USER DEFINED keys set up as mute group masters |
| OUTPUT PATCH; SCENE MEMORY | The OUTPUT PATCH page (Rio OUT 1–16) and the SCENE page (8 slots) |

**Assumed / not built:** 32 of the 64 mono channels, 16 of the 24 MIX buses (MIX 13–16 feed a 4-unit effects rack returning on ST IN 2–5), no MONO bus or LCR mode, no input patch, Dante or second Rio, no per-send ON buttons, no gate (DYNAMICS 1), Premium Rack or inserts, no recall safe or focus, no GEQ. Sends start POST; the ON key cuts pre-fader sends too.

## EQ ON, COMP ON and the graphs

Every digital desk here has an ON switch for each channel's EQ and compressor (`ch.eqOn`, `ch.compOn`). Both start off. That's a teaching choice: many real desks start with a flat EQ switched in. It means every EQ move needs EQ ON as well, which is the habit to build. Dialling in an EQ or compressor that's switched off is an easy mistake, and three scenarios on each desk teach it: "The muddy guitar" (EQ from scratch), "The EQ that does nothing" and "The compressor that does nothing". Switched off, the EQ's filters go flat and the compressor goes dry, but the settings stay.

The desks draw what the processing is doing (`js/ui/viz.js`), in roughly their own style:

- **EQ curve.** The frequency response of the four bands, plus the high-pass when it is in, worked out with the same biquad maths the Web Audio filters use. It has numbered band handles (on the 01V96, the selected band is filled in) and goes grey and dashed, marked EQ OFF, when the EQ is switched out.
- **Compressor graph.** Input level across and output level up, with the threshold marked, and a GR bar plus readout that move with the music.
- **Where the graphs appear.** On the Ui16 and the X32s, in the SEL panel next to the knobs. On both X32s, also on the main display's HOME screen (DYN and EQ thumbnails, like the console's home view). On the 01V96, on the display's EQ page (with EQ ON) and DYNAMICS page (with DYNAMICS ON).

## Where this could grow

The same surface can carry a "proper" digital desk later: fader layers (1–16, 17–32), a central screen that changes with SEL, scenes, and mute groups. Next steps up would be a Yamaha CL or a full X32 with scenes and matrices.
