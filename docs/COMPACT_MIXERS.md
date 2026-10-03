# Compact mixers

Six real mixers from Chapman's inventory, built as data: the Mackie Mix8, Mackie 1202-VLZ, Yamaha MG10/2, Yamaha STAGEPAS 400BT, Behringer Xenyx X1204USB and the Sound Devices 442 field mixer (its own section below). The Soundcraft Ui16 digital mixer uses the same definitions with its own surface: [DIGITAL_MIXER.md](DIGITAL_MIXER.md). They're picked from the **Real mixers** menu next to Mixer A and Mixer B, along with the CR1604-VLZ ([CR1604.md](CR1604.md)).

| Layer | File |
|---|---|
| Definitions (channels, jacks, gain, EQ, sends, buses, outputs, layout) | `js/compact-defs.js` |
| State, validation, level model | `js/compact.js` |
| Rear panels | built from the definitions in `js/connection-model.js` (`compactPorts`) |
| Audio graph | `js/graph-compact.js` |
| Surface | `js/ui/mixer-compact-view.js`; skins in `js/mixer-models.js` |
| Free play gigs | `COMPACT_GIGS` in `js/scenarios.js` |
| Tests | `tests/compact.test.mjs` |

**Adding a compact mixer** means a definition, its skin, and a gig. The engine, view and level model read the definition: no new code unless the mixer has a feature none of these have.

## What each one teaches

| | Mix8 | 1202-VLZ | MG10/2 | STAGEPAS 400BT | Xenyx X1204USB |
|---|---|---|---|---|---|
| Channels | 2 mono (MIC/LINE), 2 stereo line | 4 mono, 4 stereo line | 2 mono, 2 stereo with XLR, 2 stereo line (¼″ or RCA) | 2 XLR, 2 combo, 2 stereo line | 4 mono, 2 stereo line |
| Gain | GAIN 0…+50 (LINE −20) | TRIM +10…+60 (LINE −20) | GAIN +16…+60 (LINE −26) | **MIC/LINE switch only** | GAIN +10…+60 (LINE −20); stereo **+4 dBu / −10 dBV** switch |
| EQ | 12k / 2.5k / 80 | 12k / 2.5k / 80 | 10k / 2.5k / 100 | 8k / 100 | 12k / 2.5k / 80 |
| Low cut | — | 75 Hz, 18 dB/oct (1–4) | 80 Hz HPF (mic inputs) | — | 75 Hz, 18 dB/oct (1–4) |
| Dynamics | — | — | — | — | **one-knob COMP** (1–4) |
| Monitor send | one AUX, **post-fader** | AUX 1, PRE switch | one knob: **AUX1 pre ← → AUX2 post** | **MONITOR OUT: the whole mix** | AUX 1, **PRE switch on each channel** |
| Effects | AUX RETURN at unity | AUX 2 → reverb → RETURN 1; EFX TO MON on return 2 | AUX2 → reverb → RETURN | built-in reverb, 4 types | FX (post, **not cut by MUTE**) → built-in effects, 16 presets → RETURN 2; RETURN 1 MON |
| Mute / solo | — | MUTE/ALT 3-4, PFL SOLO, rude solo | — | — | MUTE/ALT 3-4 (own fader), SOLO with **MODE: PFL or in place**, AUX SOLO |
| Phantom | 48V, ch 1–2 | ch 1–4 | ch 1, 2, 3/4, 5/6 | +30 V, ch 1–2 | ch 1–4 |
| Levels | knobs | knobs | knobs | knobs | **60 mm faders** |
| Outputs | MAIN, C-R, AUX, TAPE | MAIN XLR (30 dB PAD) + ¼″, ALT, C-R, AUX 1/2, TAPE, inserts | ST, REC, C-R, AUX1/2, inserts | **SPEAKERS L/R (speaker level)**, MONITOR, SUB | MAIN XLR, ALT 3-4, C-R, AUX 1/2, CD/TAPE |

The Free play gig on each one shows its limits:
- **Mix8:** only two mic channels, so only part of the band fits.
- **1202-VLZ:** the wedge on AUX 1 with PRE pressed, the reverb on AUX 2.
- **MG10/2:** each channel feeds the wedge *or* the reverb, never both.
- **STAGEPAS:** the speakers plug straight into the mixer because the amp is inside, and the wedge gets the whole mix.
- **X1204USB:** PRE is pressed on every channel for the wedge; the FX send feeds the built-in effects with nothing to patch; the laptop needs the −10 dBV switch; the lead vocal has a little COMP. Drums and trumpets have no channel.

## Sources

- **Mix8:** Mackie *Mix Series* specification sheet (front panel, block diagram, EQ). The AUX being post-fader is from MusicRadar's review.
- **1202-VLZ:** Mackie MS1202-VLZ service manual (parts list and signal-flow diagram). The owner's manual wasn't reachable, so control ranges follow the CR1604-VLZ, which uses the same circuits (TRIM, LOW CUT, EQ, knob tapers).
- **MG10/2:** Yamaha MG10/2 owner's manual (text version), including its specification tables.
- **STAGEPAS 400BT:** Yamaha STAGEPAS 600BT/400BT owner's manual and block diagram.
- **X1204USB:** Behringer XENYX X1204USB/1204USB user manual (chapter 2, control elements; chapter 5, specifications). The preset count (16) is from Thomann's spec list.

## Simplifications and guesses to check against the real units

- **MG10/2 channels 7/8 and 9/10:** the manual doesn't say what EQ they have. The lab gives them the same 3-band EQ.
- **MG10/2 3/4 and 5/6:** a mic in the XLR appears on both sides (PAN), and the HPF acts only on that mic, as the manual says.
- **STAGEPAS:**
  - **Hi-Z (ch 4):** switches, but changes nothing, since there are no passive pickups in the lab.
  - **FEEDBACK SUPPRESSOR:** switches, but there is no feedback to suppress.
  - **MASTER EQ** is modelled as a low shelf (cut for SPEECH, boost toward BASS BOOST).
  - **Fixed gain:** the MIC/LINE switch is +35 dB / +12 dB, chosen so the band's mics land in the Good band.
  - **SUBWOOFER OUT** high-passes the speakers at 120 Hz once it's patched.
  - **The 600BT** adds a mid band and a third stereo channel; not built.
- **Mix8 AUX RETURN:** goes into the main mix at unity, since the panel has no return knob.
- **1202-VLZ:** TAPE IN is heard through the C-R/PHONES SOURCE only. EFX TO MON sends AUX RETURN 2 into AUX 1.
- **Inserts** are send taps only, as on the 1604.
- **Meters** read the main mix (or PFL solo) with 0 at −18 dBFS. The STAGEPAS meter reads the amp's output and lights LIMITER near full scale.
- **X1204USB:**
  - **Effects presets:** the manual lists them only as a picture, so the 16 names and settings here are stand-ins in the right families (reverbs, delays, chorus, flanger, two combinations). Check them against the panel.
  - **FX TO MON:** the effects chapter mentions FX TO MAIN / FX TO MON, but the control chapter describes STEREO AUX RETURN 1 + MON and RETURN 2 (FX). The lab follows the control chapter: RETURN 2 is the effects level, RETURN 1's MON knob feeds AUX 1.
  - **Internal effects off:** a plug in either RETURN 2 jack mutes the built-in effects, as the manual says.
  - **COMP:** a Web Audio compressor: threshold −6 → −36 dBFS and ratio 1:1 → 8:1 as the knob turns, with some make-up gain. The LED lights above 1 dB of gain reduction.
  - **USB** audio and the footswitch aren't modelled. CD/TAPE TO MAIN doesn't break the tape-out link.
- **The scenario checks' level model** leaves EQ, low cut, compression and effects out, as everywhere else.

## Sound Devices 442 (field mixer)

A four-input location mixer, in the lab because it's in the inventory and because it teaches what a live board hides: **two gain stages**, **output level matching**, and **checking a stereo pair in mono**. Same framework (definition `sd442` in `js/compact-defs.js`), with these options:

| Feature | On the 442 | In the lab |
|---|---|---|
| Inputs | 4 transformer-balanced XLR, MIC/LINE switch per input | `jacks: ["xlrMicLine"]`; LINE takes 40 dB off (`gain.lineSwitch`) |
| Gain | GAIN +22…+60 dB (pop-up knob), then the fader | GAIN knob, then a rotary FADER: off … 0 at the centre … +15 (`levelLaw: "sdFader"`) |
| Powering | P48 / DYN / T per input; 48 V or 12 V | one P48 button per channel (`phantom.perChannel`); no T-power or 12 V |
| HPF | sweepable 80–240 Hz, off at the detent | `hpf`: a 12 dB/oct high-pass that sweeps 80–240 Hz |
| Limiters | input limiters + output limiters, LIM switch OFF / ON / LINK | input limiter per channel (LED); output limiter as two mono limiters (ON) or one stereo limiter (LINK) |
| 1+2 LINK, Ø | LINK ON: one stereo pair on channel 1's fader, PAN becomes balance; Ø on channel 2 | `link`, `polarity`. LINK MS isn't built |
| Master | MASTER off … 0 … +6 | `master6` law |
| Outputs | XLR masters at MIC / −10 / LINE; TA3 masters; Hirose; tape out; mono mic out; direct outs | XLR masters with the OUTPUT LEVEL switch (stored on the mixer's rig device as `outLevel`), 3.5 mm tape out. No TA3, Hirose, mono mic or direct outs (the lab has no TA3 jacks yet) |
| Tone / slate | 1 kHz at 0 dBu to the outputs; headphones 20 dB down ("ear-saver") | TONE replaces the mix on the outputs; the phones drop 20 dB. No slate mic |
| Headphones | source rotary OFF / L / R / M / ST / A / B / A\|B / MS…; PFL takes over | OFF / L / R / M / ST and PFL (mono, before the fader). No returns |
| Meter | 40-segment peak/VU, dBu | 20 LEDs a side, peak only |

### The camera input

`camera-input` (`js/connection-model.js`) is a new endpoint: one XLR input with a MIC/LINE switch (`inputLevel`, set on its Outputs card). The gig uses two, `cam-1` and `cam-2`, for a camera's two channels. `analyzeCamera` compares the level arriving (`outputLevelOf`: the 442's switch, or a port's fixed level) with the switch:

- LINE into MIC: **hot**, still recorded, but the camera's 40 dB of gain clips it (the engine adds a hard clip to camera inputs).
- MIC into LINE: **weak**, 40 dB too quiet.
- −10 into LINE: works, with a note that it's 14 dB low.
- Speaker level: **danger**.

What the camera hears is in the MAIN listening group, so **Listen → MAIN** is "what the camera records".

### The gig

Shooting the band for video: the room pair (ORTF bar at FOH) on 1+2 linked with P48, the lead and backing vocals on 3 and 4 with a little HPF, the XLR outs at LINE into the camera at LINE. Listening starts on the HEADPHONE (ST). Things to try: switch the camera to MIC and hear it distort; set the headphones to M and flip Ø on channel 2; turn on TONE and watch the meters.

### Sources

Sound Devices *442 & 442 Nordic Field Mixer User Guide and Technical Information* (2003–2007): front, input and output panel descriptions, input channels, outputs, output limiters, metering, headphone monitoring, tone/slate.

### Guesses to check against the real unit

- The HPF slope is a plain 12 dB/oct at every setting (the real one eases to 6 dB/oct at higher corners).
- Limiter thresholds: input −4 dBFS, output −3 dBFS here; the real output limiter is set in the Setup Menu (+4…+20 dBu, factory +20).
- Tone at 0 dBu is −18 dBFS in the lab's scale.
- The camera's MIC input is modelled as +40 dB with a hard clip; real cameras vary.
