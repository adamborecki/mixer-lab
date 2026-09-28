# Mixer Lab — Project Context

## Purpose and precedence

`mixer-lab` is a brand-new, standalone GitHub repository for a small but real interactive live-sound practice lab. It supports a four-part MUS 248 live-sound sequence and the accompanying hands-on mixer activities.

This document supplies teaching intent and future direction. The build spec is the implementation authority: if these documents conflict, follow the build spec. Do not turn every idea below into V1 work.

## Pedagogical goal

Students should learn to reason about signal flow on an unfamiliar mixer and system, not memorize where one manufacturer's blue knob happens to be. The repeatable questions are:

- What is the source, its signal level, and its appropriate input path?
- Where is the preamp? Where is the power amplifier?
- What path reaches the audience, the performer, or the recorder?
- What must be connected physically, and what must be routed internally?
- What should change when a performer asks for a different monitor mix?

The lab is the repeatable practice and retrieval layer after lecture and physical hands-on work. It should reward useful diagnosis and routing decisions with audible results, not merely label controls or animate a console picture.

## Lecture roadmap

This is a working sequence rather than a fixed script. Each class should open with a short retrieval/review moment that reconnects the vocabulary and mental model.

1. **Inputs, outputs, levels, and amplification.** Mic, instrument, line, and speaker level; connector type is not the same thing as signal level; preamp versus power amp; powered versus passive speakers; safe setup and the recurring question, “Where is the amplifier?”
2. **The mixer as a branching signal-flow system.** Inputs/channels, gain versus channel level, main mix versus an Aux/monitor mix, and why the same source can feed more than one destination.
3. **Purpose-built output paths and troubleshooting.** Audience mix, independent performer monitor mix, stereo recording/streaming (board) feed, multitrack/direct-output feed, PFL/Solo/Cue, meters, and systematic fault finding.
4. **Transfer and application.** Plan, build, check, and troubleshoot a small gig-like system; recognize familiar concepts on different mixer types; revisit safe power, cable, provenance, and reset/return habits.

The app need not teach every one of these topics in V1. It should establish the vocabulary and mechanics that later scenarios can reuse.

## Scenario-driven teaching

Scenarios should begin with a credible person, problem, and listening destination—not with “turn this knob.” Students should decide what must change and then locate the appropriate control on the currently selected mixer skin.

Examples include:

- Build a small rig: connect sources, make a safe main system, and prove it is audible.
- “I need more of *my voice* in my monitor.” Change that channel's monitor/Aux send without changing the audience mix.
- “The whole monitor mix is too quiet.” Change the monitor/Aux master or destination path rather than every individual channel send.
- Later: line check, no-sound diagnosis, a stereo board feed versus individual multitrack feeds, and pre-/post-fader consequences.

The desired habit is diagnosis: identify **what destination is wrong**, then identify **which part of the signal path controls it**.

## Real audio stems and input organization

Use the real, aligned band stems in the repository as the normal source material. They are intentionally more musically engaging than synthesized placeholders; a simplified single drum stem is fine because V1 teaches routing and mixing, not drum-mic technique. Treat aligned stems as starting at the same timeline position and keep them synchronized during playback.

Claude should rename the supplied source files to clear web-safe filenames (lowercase, hyphenated, no spaces, `&`, or ambiguous punctuation) and update the asset manifest/references. For example: `persephone-lead-vocal.wav`, `persephone-backing-vocals.wav`, `persephone-drums.wav`. Preserve originals only if the build spec or repository workflow calls for it.

Present sources in a practical small-FOH-band channel order, rather than asset-directory order:

1. Drums / percussion
2. Bass
3. Guitars
4. Keys / piano
5. Horns (for example, trumpets)
6. Backing vocals and vocal doubles
7. Lead vocal

Use the actual available stems within that grouping. The point is a readable, conventional stage/input-list workflow: rhythm section first, then instruments, then horns, then vocals—with the lead vocal easy to find. A future version may add stereo pairs, more detailed drum inputs, DIs, or stage plots.

Because this is a public GitHub Pages project, only place stems in the repo if public download/use is cleared. Web-optimized synchronized derivatives may be preferable to high-resolution masters.

## Why two generic mixer skins matter

The project teaches concepts that transfer across hardware. Two deliberately different **generic** skins in V1 demonstrate that the separation is real:

- an analog-console style with faders, `MUTE`, and `AUX`; and
- a compact/alternate style with rotary channel levels, `ON`, and `MON` in different locations.

They must represent the same semantic mixer/audio state. A lit `MUTE` can mean a disabled channel, while a lit `ON` means an enabled channel; those are different interface mappings, not different underlying concepts. Likewise, fader versus knob, `AUX` versus `MON`, and later `PFL`/`SOLO`/`CUE` should remain skin terminology and layout choices over a shared model.

The goal is not photorealistic product simulation. A student who learns the generic task should be better prepared to find the equivalent feature on a real mixer.

## Existing style references

Before designing, inspect and reference `camera-lab` and `sound-lab` (their current public pages and/or source when available). `mixer-lab` should feel like part of that clean, educational web-app family: conceptually clear and game-like, rather than a dense or photorealistic console emulator. Do not copy their implementation blindly; take visual and interaction cues from the current versions.

## Physical equipment: future reference

The physical inventory informs later scenarios, documentation, and potential skins. It is not a requirement to model every item now. Verify labels and current availability before presenting exact models as facts.

Useful categories already represented in the teaching environment include:

- **Core transfer mixers:** traditional analog, compact analog, browser-controlled digital, and older digital/field mixers (for example, Mackie VLZ/Mix, Yamaha MG/01V, Behringer Xenyx, Soundcraft Ui16, Sound Devices 442).
- **Large digital consoles:** Yamaha CL3 and DM2000; Behringer X32-family equipment. These merit separate console-specific learning activities later.
- **Powered playback:** powered stage wedges and small powered monitors, powered studio-monitor pairs, and compact personal monitors. These make “amplifier inside the speaker/system” visible.
- **Passive playback plus amplification:** passive wedges/speakers with a rack power amp or other external amplifier, useful for distinguishing a line-level mixer output from speaker-level drive.
- **Integrated systems:** Yamaha Stagepas, keyboard/guitar/bass amps, and small all-in-one monitor/amp units, where mixer, amplification, and speaker functions may coexist.
- **Connection and safety examples:** XLR, 1/4-inch, RCA, 3.5 mm, appropriate adapters/DI boxes, IEC and device-specific power supplies, and the rule that special power supplies stay with their device.

Room/location provenance, allowed equipment, and return procedures are valuable for the physical activity. They should become a separate, maintained inventory/reference when ready—not hard-coded assumptions in V1.

## Future expansion (not required for V1)

Potential next steps include more Aux/mix buses, pre/post-fader choices, stereo channels and linked pairs, multiple monitor mixes, recording/direct-out routes, EQ, compression, effects, feedback/noise/polarity lessons, patching and connector/level challenges, stage plots, additional scenarios, and skins mapped to verified campus hardware.

Also deferred: full CL3, DM2000, or X32 simulation; a large multichannel drum recording model; a complete equipment/room database; manufacturer-perfect layouts; and advanced networking/console workflows. Build a polished, functioning conceptual trainer first.

## Working assumptions for the builder

Read the build spec first, inspect the real assets and reference apps before coding, and make reasonable low-risk choices without pausing for cosmetic decisions. Record genuinely consequential assumptions in the repository. Prioritize a coherent, tested V1 over expanding into the deferred work above.
