# Scenarios

Scenarios are data in `js/scenarios.js`. A setup builds a starting rig and mixer state, a baseline captures named numbers from it, and declarative conditions are evaluated live against the current state: `evaluateScenario(def, state, baseline, sourcesById, stems, session)`. Nothing depends on which skin is showing, and no "I did it" button exists. The UI (`js/ui/scenario-view.js`) only displays the result.

`session` carries the one thing about an attempt that is not mixer state: `{ listened: Set }`, the listen destinations the student has selected since the attempt began. `js/app.js` starts it with the scenario's start destination and adds to it whenever the listen selector changes.

## Success philosophy

- **Outcomes, not button presses.** Conditions read the semantic state and the computed routing (`computeMix`, `analyzeRig`), never live meters and never a skin control. The exception is the listening goal, which asks the student to go and audition the right destination (`listenedTo`).
- **Checklist labels describe outcomes without naming the control** ("The change is made on the vocal's own channel", not "Turn up the AUX knob").
- **Two kinds.** `goal` must become true. `keep` must stay true (the audience mix and the other wedge must not move). A scenario is complete when it has at least one condition and every condition is met.
- **Checked live, celebrated once.** The checklist always shows what is true right now. Once a scenario has been solved, its "Solved" banner stays (with a note if the student has since changed things) until the scenario is restarted or switched. The picker's checkmark lives only in memory for the session; nothing is saved. On phones the Scenario tab shows goal progress (e.g. `1/2`, then `✓`).
- **Hints go destination, then bus or path, then exact control**, and reveal one at a time. Text can contain skin placeholders (`{aux1}`, `{aux2}`, `{aux1Master}`, `{aux2Master}`, `{enabled}`, `{level}`, `{main}`) filled by `fillTerms` from the current skin's `terms`. This applies to the prompt, goal, checklist labels, hints and completion text.
- Completion text explains *why*, using the wrong-but-tempting alternative.

## Schema

```js
{
  id, number,                    // number 0 = Free play (no conditions)
  title, who, prompt, goal,      // student-facing text
  setup: {
    devices: ["spk-l", ...],     // keys of PLAYBACK_DEVICES; sources come from the manifest
    patch: "reference" | "none", // reference: each source into channel = its `order`
    cables: [{ from, to, cable }],
    channels: "mixed" | "safe",
    faders: { "<sourceId>": dB }, // "mixed" only; starting fader override in dB
    muted: ["<sourceId>"],       // start with these channels switched off
    patchAlso: ["<sourceId>"],   // patch a source the reference rig normally skips (`reference: false`)
    sends: { aux1: { "<sourceId>": dB }, aux2: { ... } }, // "mixed" only; per bus, missing = off
    masters: { aux2: -26 },      // dB exceptions to the default of unity; omit for none
    listen: "main" | "aux1" | "aux2" | "pfl",   // where the student starts listening
  },
  baseline: { name: { metric, ...params } },
  conditions: [{ id, kind: "goal" | "keep", type, ...params, label }],
  hints: ["..."],
  complete: "text with {placeholders}" | null,
}
```

- **Sources** for a scenario are the manifest entries whose `scenarios` list includes its id (`sourcesForScenario`); see the sequence table. Free play: all seven band sources plus the laptop.
- `channels: "safe"`: gain 0, faders down, sends off, phantom off, pan centre. `"mixed"`: gain at `nominalGainDb` (`-(outputDb + pad)`), phantom on where the source needs it, fader at the source's `mixDb`, pan at its `pan`, send from `sends`.
- **PLAYBACK_DEVICES**: `spk-l`, `spk-r` (powered, house), `pspk-l`, `pspk-r` (passive, house), `wedge` (powered, stage, the lead singer's), `pwedge` (passive, stage, the drummer's), `amp` (2-channel power amp). Each speaker has a `zone` (used by `validChain` and `noBrokenChains`) and a `short` name the listening bar shows: "house left", "house right", "house left (passive)", "house right (passive)", "singer's wedge", "drummer's wedge".
- **Monitor cabling.** Wherever both wedges are on stage, Aux 1 goes to the singer's powered wedge (`wedge`), and Aux 2 goes to the power amp, then the amp to the drummer's passive wedge (`pwedge`) on a speaker cable.
- **Baseline metrics** (`captureBaseline`, evaluated against the start state). Every per-bus metric takes `bus` (`"aux1"` or `"aux2"`):
  - `sendDb`, `monitorDb`, `heardMonitorDb`: one source's send, its contribution to the bus, and that contribution as heard through a working chain (`heardMonitorDb` is -inf without a valid chain on that bus);
  - `busDb`: the bus master in dB;
  - `sendDbByChannel`: one send figure per channel;
  - `monitorByChannel`: each channel's heard contribution to that bus, per channel;
  - `mainDbByChannel`: each channel's Main contribution (no `bus`);
  - `channelSettings`: one source's channel GAIN and fader dB (`source`, no `bus`).

## Condition types and tolerances

All levels are peak estimates in dBFS. `AUDIBLE_DB` = -45 (you would hear it at a speaker). A contribution below `OFF_DB` = -60 counts as off.

| Type | Params | Met when |
|---|---|---|
| `sourcesPatched` | `min` | at least `min` different sources are on working inputs (connected, signal, status `ok`: right path, phantom present) |
| `gainStaged` | `min` | at least `min` working channels read Good or Hot (post-preamp peak -22 to 0 dBFS) |
| `validChain` | `output`, `zone?`, `device?` | some speaker in that zone has a valid chain from the output; `"main"` means `main-l` or `main-r`, otherwise a port id (`"aux1"`, `"aux2"`) |
| `noBrokenChains` | `zone?` | no speaker in that zone has a cable but an invalid chain (unpatched speakers are ignored) |
| `heardInMain` | `min` | at least `min` Good/Hot channels reach a valid speaker via Main at >= -45 dBFS |
| `listenedTo` | `dest` | the student has selected that listen destination (`main`, `aux1`, `aux2` or `pfl`) at some point in this attempt. The start destination counts, and it stays met after they move on; "Start over" clears it |
| `sourcePatched` / `sourceGain` | `source` | that source's channel is on a working input / reads Good or Hot |
| `sourceHeardInMain` | `source`, `stereo?` | that source is Good/Hot and audible through Main; `stereo: true` needs Main L and Main R both working and audible |
| `busAudible` | `bus` | some channel is audible (>= -45 dBFS) through a working chain on that bus |
| `mainLowered` | `source`, `baseline`, `minDb` | that source's Main contribution is at least `minDb` below the baseline |
| `channelUnchanged` | `source`, `baseline`, `toleranceDb` | that channel's GAIN and fader are within tolerance of the `channelSettings` baseline |
| `monitorPresent` | `bus`, `sources`, `minDb` | every listed source is at least `minDb` in the wedge (through a working chain) |
| `monitorLittle` | `bus`, `source`, `below`, `byDb` | the source is audible in the wedge and at least `byDb` under each source in `below` |
| `monitorAbsent` | `bus`, `sources` | none of the listed sources is audible in the wedge |
| `sendRaised` | `bus`, `source`, `baseline`, `minDb` | that bus's send dB now minus baseline >= `minDb` (one-sided) |
| `monitorRaised` | `bus`, `source`, `baseline`, `minDb` | heard dB on that bus now minus baseline >= `minDb`, and now >= -45 |
| `monitorMixUnchanged` | `bus`, `baseline`, `toleranceDb`, `except?` | every channel's heard contribution to that bus is within +/-`toleranceDb` of baseline; two "off" values match. It measures what reaches a working wedge, so unplugging that wedge's chain also fails it |
| `mainUnchanged` | `baseline`, `toleranceDb`, `except?` | every channel's Main contribution (max of L/R, including fader, mute, pan and master) is within +/-`toleranceDb` of baseline; two "off" values match |
| `masterRaised` | `bus`, `baseline`, `minDb` | that master's dB now minus baseline >= `minDb` |
| `sendBalanceKept` | `bus`, `baseline`, `toleranceDb` | every send on that bus moved by the same amount: each channel's change is within +/-`toleranceDb` of the median change; a send that was off stays off and one that was on stays on |

`minDb` thresholds are one-sided ("at least this much"). `toleranceDb` is two-sided. Note `heardInMain` is not zone-restricted; pair it with `validChain` or `noBrokenChains` when the zone matters.

## The ten-scenario sequence

One imaginary gig throughout: Main L/R are the house speakers, Aux 1 is the lead singer's powered wedge, Aux 2 is the drummer's passive wedge through the power amp, and stereo input 9/10 is the laptop playing preshow music. Early scenarios are explicit and forgiving (three hints, patched-for-you parts); later ones have shorter text and fewer, more general hints. Picker labels come from `shortTitle()` in `js/scenarios.js`, which the Canvas report also uses.

| # | id | Picker label | The skill | Start |
|---|---|---|---|---|
| 1 | `preshow` | Preshow music | Full stereo signal flow: laptop → breakout → 9/10 → Main L/R | Only the laptop on stage; powered house speakers already on Main; channel at safe defaults |
| 2 | `build-rig` | Band into the house | Input-to-Main basics: proper inputs, gain into Good, faders up | Two-plus band sources unplugged; house speakers already patched |
| 3 | `find-amp` | Find the amp | Line vs speaker level: mixer out → amp in → amp out → passive speaker | Band mixed; Main L/R plugged straight into passive cabinets (silent); amp loose |
| 4 | `more-vocal` | Singer's wedge | Listen to Aux 1, raise one send; Main and Aux 2 unchanged | Working rig, listening to Main |
| 5 | `drummer-wedge` | Drummer's wedge | The amp/passive rule again, on Aux 2 | House and Aux 1 work; Aux 2 unpatched |
| 6 | `more-piano` | More piano | Listen to Aux 2, raise the keys' send only | Working rig, keys buried in Aux 2 |
| 7 | `monitor-quiet` | Too quiet | Whole-wedge level is the Aux 2 master, not every send | Aux 2 master at -26 dB |
| 8 | `foh-vocal` | Vocal too loud | Pre-fader consequence: the fader changes only the house | Lead vocal fader pushed to +4 dB |
| 9 | `missing-guitar` | Missing guitar | One fault (channel off), diagnosed with PFL, fixed without touching anything else | Guitar channel switched off |
| 10 | `drummer-mix` | Drummer's mix | Integration: build an Aux 2 mix from a spoken request | Aux 2 empty except a leftover guitar send |

Auxes stay fixed pre-fader; nothing here needs new mixer features. Sources per scenario are the manifest `scenarios` lists (`BAND`, `without()`, `only()` helpers at the top of the source list): `preshow` has only the laptop; the other band scenarios mostly use drums, bass, keys and lead vocal (guitars appear in 4, 9 and 10, backing vocals in 7).

### Details per scenario

1. **`preshow`.** Goals: `sourcePatched`, `sourceGain` (Good/Hot), `sourceHeardInMain` with `stereo: true` (both Main sides have a working chain and are audible). Keep: a house chain works. The laptop is line level and reads Good even at minimum gain, so the hint is "check the meter", not "raise GAIN a lot". Fails on purpose: fader down, clipping gain, Main R unplugged, channel muted.
2. **`build-rig`.** Goals: `sourcesPatched` >= 2, `gainStaged` >= 2, `heardInMain` >= 2; keep: house chain valid. Wrong paths (mic on a 1/4" jack, condenser without +48 V, gain too low or clipping) don't count.
3. **`find-amp`.** Goals: `validChain` for `main-l` and for `main-r`, `noBrokenChains` (foh), `heardInMain` >= 2. Both Mains start run straight into passive speakers (`no-amp`). Each side needs Main → amp In → amp Out (speaker cable) → speaker.
4. **`more-vocal`.** Unchanged from V1: `listenedTo aux1`, lead-vocal Aux 1 send up >= 4 dB, heard in the wedge up >= 4 dB; keep Main and Aux 2 within 1 dB.
5. **`drummer-wedge`.** Goals: `validChain` from `aux2` **to `pwedge`** (`device` param), `listenedTo aux2`, `busAudible aux2`. Keep: no stage chain broken, Main and Aux 1 unchanged. Aux 2 straight into the wedge, or taking the singer's powered wedge for Aux 2, both fail.
6. **`more-piano`.** Like scenario 4 but on Aux 2 for `keys`: send up >= 4 dB, heard up >= 4 dB. `monitorMixUnchanged` with `except: "keys"` keeps every other Aux 2 contribution within 1 dB (so master, GAIN or another send all fail); Main and Aux 1 unchanged.
7. **`monitor-quiet`.** Unchanged from V1: `listenedTo aux2`, Aux 2 master up >= 8 dB, sends keep their balance within 1.5 dB, chain valid, Aux 1 unchanged. Raising every send instead of the master fails `master`.
8. **`foh-vocal`.** Goals: `mainLowered` (lead vocal's Main contribution down >= 6 dB), `sourceHeardInMain` (still audible, so muting fails). Keep: `mainUnchanged` `except: "lead-vocal"`, Aux 1 and Aux 2 unchanged. Lowering GAIN drags both wedges down and fails; the main master fails `band`. `setup.faders` starts the vocal fader at +4 dB.
9. **`missing-guitar`.** `setup.muted: ["guitars"]` is the one fault. Goals: `listenedTo pfl`, `sourceHeardInMain guitars`. Keep: `channelUnchanged` (GAIN and fader within 1 dB of start) and `mainUnchanged` except guitars. PFL works on a muted channel, which is what shows the input is fine.
10. **`drummer-mix`.** Goals: `listenedTo aux2`, `monitorPresent` (drums, bass, lead vocal each >= -30 dBFS in the wedge), `monitorLittle` (keys audible and >= 3 dB below drums and bass), `monitorAbsent` (guitars, a leftover send at -12 dB, must be inaudible). Keep: chain valid, Main and Aux 1 unchanged.

### Free play (`free-play`)

All seven sources on the reference patch. Main goes to the powered house speakers, Aux 1 to the singer's powered wedge, and Aux 2 through the amp to the drummer's passive wedge. The passive house speakers are present but unpatched. No conditions, so it never completes. Buttons: Reset the band, Unplug everything.

Free play also has a **Band audio** control: the 8-bar loop (28 s) or the **Full song** (3:58, with a seek slider). The choice only applies in Free play; every other scenario plays the loop, so leaving Free play returns to it. The setting is held in memory, so coming back to Free play shows and plays the choice you last made. How the full song is streamed is in [AUDIO_ENGINE.md](AUDIO_ENGINE.md).

## Runtime

`selectScenario(id)` in `js/app.js` builds the state, calls `store.replace`, captures the baseline, starts a fresh `session` (`listened` holds the start destination), and evaluates. A store subscriber adds each new listen destination to `session.listened`. Deep links `#/<scenario id>` (for example `#/find-amp`, `#/free-play`) select one; an unknown hash at load opens Free play. "Start over" rebuilds the state, recaptures the baseline and clears `session`. Changing scenarios reuses cached stems ([AUDIO_ENGINE.md](AUDIO_ENGINE.md)).

## Authoring a scenario

1. Start with a person, a problem and a destination, not "turn this knob".
2. Pick baselines that describe the start state, then compare against them instead of hard-coding numbers.
3. Use a `goal` for the change and a `keep` for what must not move, including the *other* wedge. Make the tempting wrong fix fail (gain instead of send, the wrong bus's send or master, every send instead of the master). If the fix only makes sense after hearing the right destination, start on a different listen destination and add a `listenedTo` goal.
4. Choose thresholds larger than a casual nudge and tolerances wider than control rounding (at least 1 dB).
5. Start with every goal unmet and every `keep` met; the tests enforce it.
6. Write labels as outcomes. Write three hints: destination, path, control.
7. Add source availability in the manifest `scenarios` lists. Give starting sends per bus in `setup.sends` and master exceptions in `setup.masters`, both in dB (`buildScenarioState` converts with `dbToLevel`).
8. New logic goes in `CONDITIONS` (and `METRICS` for a new baseline); per-bus logic takes a `bus` parameter. `validateScenarios()` reports unknown devices, condition types and baselines. The picker's short titles are a small map in `shortTitle()` in `js/scenarios.js`.
9. Metrics indexed by channel assume sources stay on their channels; re-patching a source elsewhere reads as a change.

## Tests

```sh
npm test            # or: node --test tests/
```

Node 18 or newer. `tests/scenarios.test.mjs` checks data integrity, that each scenario starts unsolved with `keep` conditions holding (and scenarios 2 and 3 start on Main), and that each is solved (or not) by the state changes described above, including the listening objectives, the wrong-wedge cases and the tempting wrong fixes (no audio or UI). It passes a `session` the way `js/app.js` does. `tests/routing.test.mjs` covers connectors, chains, the level law, `computeMix` (including Aux 1 and Aux 2 independence) and the store. `tests/skins.test.mjs` covers the MUTE/ON mapping, the global phantom state, strip layout data (`aux1` and `aux2` parts), the AUX 1/AUX 2 and MON 1/MON 2 terms, and hint placeholders. No browser is needed.
