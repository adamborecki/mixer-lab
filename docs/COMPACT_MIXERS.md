# Compact mixers

Four real mixers from Chapman's inventory, built as data: the Mackie Mix8, Mackie 1202-VLZ, Yamaha MG10/2 and Yamaha STAGEPAS 400BT. They're picked from the **Real mixers** menu next to Mixer A and Mixer B, along with the CR1604-VLZ ([CR1604.md](CR1604.md)).

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

| | Mix8 | 1202-VLZ | MG10/2 | STAGEPAS 400BT |
|---|---|---|---|---|
| Channels | 2 mono (MIC/LINE), 2 stereo line | 4 mono, 4 stereo line | 2 mono, 2 stereo with XLR, 2 stereo line (¼″ or RCA) | 2 XLR, 2 combo, 2 stereo line |
| Gain | GAIN 0…+50 (LINE −20) | TRIM +10…+60 (LINE −20) | GAIN +16…+60 (LINE −26) | **MIC/LINE switch only** |
| EQ | 12k / 2.5k / 80 | 12k / 2.5k / 80 | 10k / 2.5k / 100 | 8k / 100 |
| Low cut | — | 75 Hz, 18 dB/oct (1–4) | 80 Hz HPF (mic inputs) | — |
| Monitor send | one AUX, **post-fader** | AUX 1, PRE switch | one knob: **AUX1 pre ← → AUX2 post** | **MONITOR OUT: the whole mix** |
| Effects | AUX RETURN at unity | AUX 2 → reverb → RETURN 1; EFX TO MON on return 2 | AUX2 → reverb → RETURN | built-in reverb, 4 types |
| Mute / solo | — | MUTE/ALT 3-4, PFL SOLO, rude solo | — | — |
| Phantom | 48V, ch 1–2 | ch 1–4 | ch 1, 2, 3/4, 5/6 | +30 V, ch 1–2 |
| Outputs | MAIN, C-R, AUX, TAPE | MAIN XLR (30 dB PAD) + ¼″, ALT, C-R, AUX 1/2, TAPE, inserts | ST, REC, C-R, AUX1/2, inserts | **SPEAKERS L/R (speaker level)**, MONITOR, SUB |

The Free play gig on each one shows its limits:
- **Mix8:** only two mic channels, so only part of the band fits.
- **1202-VLZ:** the wedge on AUX 1 with PRE pressed, the reverb on AUX 2.
- **MG10/2:** each channel feeds the wedge *or* the reverb, never both.
- **STAGEPAS:** the speakers plug straight into the mixer because the amp is inside, and the wedge gets the whole mix.

## Sources

- **Mix8:** Mackie *Mix Series* specification sheet (front panel, block diagram, EQ). The AUX being post-fader is from MusicRadar's review.
- **1202-VLZ:** Mackie MS1202-VLZ service manual (parts list and signal-flow diagram). The owner's manual wasn't reachable, so control ranges follow the CR1604-VLZ, which uses the same circuits (TRIM, LOW CUT, EQ, knob tapers).
- **MG10/2:** Yamaha MG10/2 owner's manual (text version), including its specification tables.
- **STAGEPAS 400BT:** Yamaha STAGEPAS 600BT/400BT owner's manual and block diagram.

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
- **The scenario checks' level model** leaves EQ, low cut and effects out, as everywhere else.
