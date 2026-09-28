# Scenarios

Scenarios are data in `js/scenarios.js`. A setup builds a starting rig and mixer state, a baseline captures named numbers from it, and declarative conditions are evaluated live against the current state. Nothing depends on which skin is showing, and no "I did it" button exists. The UI (`js/ui/scenario-view.js`) only displays the result.

## Success philosophy

- **Outcomes, not button presses.** Conditions read the semantic state and the computed routing (`computeMix`, `analyzeRig`), never live meters and never a skin control.
- **Checklist labels describe outcomes without naming the control** ("The change is made on the vocal's own channel", not "Turn up the AUX knob").
- **Two kinds.** `goal` must become true. `keep` must stay true (the audience mix must not move). A scenario is complete when it has at least one condition and every condition is met.
- **Checked live, celebrated once.** The checklist always shows what is true right now. Once a scenario has been solved, its "Solved" banner stays (with a note if the student has since changed things) until the scenario is restarted or switched. The picker's checkmark lives only in memory for the session; nothing is saved. On phones the Scenario tab shows goal progress (e.g. `1/2`, then `✓`).
- **Hints go destination, then bus or path, then exact control**, and reveal one at a time. Text can contain skin placeholders (`{aux}`, `{auxMaster}`, `{enabled}`, `{level}`, `{main}`) filled by `fillTerms` from the current skin's `terms`.
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
    sends: { "<sourceId>": dB }, // "mixed" only; missing = off
    main, aux1,                  // master positions 0..1 (dbToLevel(-26) for a dB value)
    listen: "main" | "aux1" | "pfl",
  },
  baseline: { name: { metric, ...params } },
  conditions: [{ id, kind: "goal" | "keep", type, ...params, label }],
  hints: ["..."],
  complete: "text with {placeholders}" | null,
}
```

- **Sources** for a scenario are the manifest entries whose `scenarios` list includes its id (`sourcesForScenario`). Build rig: drums, bass, keys, lead vocal. More vocal: bass, guitars, keys, lead vocal. Monitor quiet: drums, bass, keys, backing vocals, lead vocal. Free play: all seven.
- `channels: "safe"`: gain 0, faders down, sends off, phantom off, pan centre. `"mixed"`: gain at `nominalGainDb` (`-(outputDb + pad)`), phantom on where the source needs it, fader at the source's `mixDb`, pan at its `pan`, send from `sends`.
- **PLAYBACK_DEVICES**: `spk-l`, `spk-r` (powered, house), `pspk-l`, `pspk-r` (passive, house), `wedge` (powered, stage), `pwedge` (passive, stage), `amp` (2-channel power amp).
- **Baseline metrics** (`captureBaseline`, evaluated against the start state): `sendDb`, `monitorDb`, `heardMonitorDb` (a source's Aux figure; `heardMonitorDb` is -inf without a valid monitor chain), `busDb` (a master in dB), `mainDbByChannel` and `sendDbByChannel` (one number per channel).

## Condition types and tolerances

All levels are peak estimates in dBFS. `AUDIBLE_DB` = -45 (you would hear it at a speaker). A contribution below `OFF_DB` = -60 counts as off.

| Type | Params | Met when |
|---|---|---|
| `sourcesPatched` | `min` | at least `min` different sources are on working inputs (connected, signal, status `ok`: right path, phantom present) |
| `gainStaged` | `min` | at least `min` working channels read Good or Hot (post-preamp peak -22 to 0 dBFS) |
| `validChain` | `output`, `zone?` | some speaker in that zone has a valid chain from the output; `"main"` means `main-l` or `main-r`, otherwise a port id |
| `noBrokenChains` | `zone?` | no speaker in that zone has a cable but an invalid chain (unpatched speakers are ignored) |
| `heardInMain` | `min` | at least `min` Good/Hot channels reach a valid speaker via Main at >= -45 dBFS |
| `sendRaised` | `source`, `baseline`, `minDb` | send dB now minus baseline >= `minDb` (one-sided) |
| `monitorRaised` | `source`, `baseline`, `minDb` | heard monitor dB now minus baseline >= `minDb`, and now >= -45 |
| `mainUnchanged` | `baseline`, `toleranceDb` | every channel's Main contribution (max of L/R, including fader, mute, pan and master) is within +/-`toleranceDb` of baseline; two "off" values match |
| `masterRaised` | `bus`, `baseline`, `minDb` | master dB now minus baseline >= `minDb` |
| `sendBalanceKept` | `baseline`, `toleranceDb` | every send moved by the same amount: each channel's change is within +/-`toleranceDb` of the median change; a send that was off stays off and one that was on stays on |

`minDb` thresholds are one-sided ("at least this much"). `toleranceDb` is two-sided. Note `heardInMain` is not zone-restricted; pair it with `validChain` or `noBrokenChains` when the zone matters.

## V1 scenarios

### 1. Build the rig (`build-rig`, band leader)

- **Start:** drums, bass, keys and lead vocal unplugged; the rig has powered house speakers (`spk-l`, `spk-r`), a passive house speaker (`pspk-l`), a power amp and a wedge. **Main L is deliberately already run to the passive speaker** (XLR-TRS cable, no amp). Gain 0, faders down, masters at unity, listening to Main.
- **Conditions (all goals):** `patched` >= 2 sources; `gain` >= 2 channels Good or Hot; `chain` a valid house chain from Main; `heard` >= 2 sources at >= -45 dBFS through Main; `no-broken` no house speaker left on a chain that cannot work.
- **Solve:** patch two sources on the right cables (a condenser needs XLR and +48 V; a mic on the 1/4" side reads weak and does not count), raise gain into Good, bring up the faders, then either patch Main L/R into the powered speakers or run Main to the amp and the amp to the passive speaker.
- **Not enough:** leaving Main L on the passive speaker fails `no-broken` even when Main R works.

### 2. More of my voice in the monitor (`more-vocal`, lead singer)

- **Start:** reference patch, mixed. Main L/R to powered house speakers, Aux 1 to the powered wedge. Sends: bass -3, guitars -2, keys -1, lead vocal -14 dB. Listening to Aux 1.
- **Baseline:** `vocalSendDb`, `vocalMonitorDb`, `mainByChannel`.
- **Conditions:** `send` goal, lead-vocal send up >= **+4 dB**; `wedge` goal, heard wedge level up >= **+4 dB** and >= -45 dBFS; `house` keep, Main per channel within **+/-1 dB**.
- **Solve:** raise the lead-vocal Aux send by 4 dB or more.
- **Fails on purpose:** raising GAIN (moves Main), raising the fader (Main moves, pre-fader Aux does not), a 3 dB nudge, muting the vocal (Main changes; the pre-fader send would still pass), or unplugging the wedge.

### 3. The whole monitor mix is too quiet (`monitor-quiet`, drummer)

- **Start:** reference patch, mixed. Aux 1 goes to the amp, and the amp to the **passive** wedge on a speaker cable. Sends: drums 0, bass -4, keys -6, backing vocals -7, lead vocal -3 dB. Aux 1 master starts at **-26 dB**. Listening to Aux 1.
- **Baseline:** `auxMasterDb`, `sendsByChannel`.
- **Conditions:** `master` goal, Aux 1 master up >= **+8 dB**; `balance` keep, sends move together within **+/-1.5 dB** of the median change with none added or dropped; `chain` keep, the Aux 1 chain (amp to passive wedge) stays valid.
- **Solve:** raise the Aux 1 master.
- **Fails on purpose:** raising every send but not the master (balance holds, `master` fails), moving one send alone, zeroing a send, unplugging the amp-to-wedge cable.

### Free play (`free-play`)

All seven sources on the reference patch, Main to the powered house speakers, Aux 1 to the powered wedge; the passive speakers, power amp and passive wedge are present but unpatched. No conditions, so it never completes. Buttons: Reset the band, Unplug everything.

## Runtime

`selectScenario(id)` in `js/app.js` builds the state, calls `store.replace`, captures the baseline, and evaluates. Deep links `#/build-rig`, `#/more-vocal`, `#/monitor-quiet`, `#/free-play` select one; an unknown hash at load opens Free play. "Start over" rebuilds the state and recaptures the baseline. Changing scenarios reuses cached stems ([AUDIO_ENGINE.md](AUDIO_ENGINE.md)).

## Authoring a scenario

1. Start with a person, a problem and a destination, not "turn this knob".
2. Pick baselines that describe the start state, then compare against them instead of hard-coding numbers.
3. Use a `goal` for the change and a `keep` for what must not move. Make the tempting wrong fix fail (gain instead of send, every send instead of the master).
4. Choose thresholds larger than a casual nudge and tolerances wider than control rounding (at least 1 dB).
5. Start with every goal unmet and every `keep` met; the tests enforce it.
6. Write labels as outcomes. Write three hints: destination, path, control.
7. Add source availability in the manifest `scenarios` lists and use `dbToLevel` for dB starting values.
8. New logic goes in `CONDITIONS` (and `METRICS` for a new baseline). `validateScenarios()` reports unknown devices, condition types and baselines. The picker's short titles are a small map in `js/ui/scenario-view.js`.
9. Metrics indexed by channel assume sources stay on their channels; re-patching a source elsewhere reads as a change.

## Tests

```sh
npm test            # or: node --test tests/
```

Node 18 or newer. `tests/scenarios.test.mjs` checks data integrity, that each scenario starts unsolved with `keep` conditions holding, and that each is solved (or not) by the state changes described above (no audio or UI). `tests/routing.test.mjs` covers connectors, chains, the level law, `computeMix` and the store. `tests/skins.test.mjs` covers the MUTE/ON mapping, the global phantom state, strip layout data and hint placeholders. No browser is needed.
