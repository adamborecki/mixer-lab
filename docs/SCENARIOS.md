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

- **Sources** for a scenario are the manifest entries whose `scenarios` list includes its id (`sourcesForScenario`). Build rig: drums, bass, keys, lead vocal. More vocal: bass, guitars, keys, lead vocal. Monitor quiet: drums, bass, keys, backing vocals, lead vocal. Free play: all seven.
- `channels: "safe"`: gain 0, faders down, sends off, phantom off, pan centre. `"mixed"`: gain at `nominalGainDb` (`-(outputDb + pad)`), phantom on where the source needs it, fader at the source's `mixDb`, pan at its `pan`, send from `sends`.
- **PLAYBACK_DEVICES**: `spk-l`, `spk-r` (powered, house), `pspk-l`, `pspk-r` (passive, house), `wedge` (powered, stage, the lead singer's), `pwedge` (passive, stage, the drummer's), `amp` (2-channel power amp). Each speaker has a `zone` (used by `validChain` and `noBrokenChains`) and a `short` name the listening bar shows: "house left", "house right", "house left (passive)", "house right (passive)", "singer's wedge", "drummer's wedge".
- **Monitor cabling.** Wherever both wedges are on stage, Aux 1 goes to the singer's powered wedge (`wedge`), and Aux 2 goes to the power amp, then the amp to the drummer's passive wedge (`pwedge`) on a speaker cable.
- **Baseline metrics** (`captureBaseline`, evaluated against the start state). Every per-bus metric takes `bus` (`"aux1"` or `"aux2"`):
  - `sendDb`, `monitorDb`, `heardMonitorDb`: one source's send, its contribution to the bus, and that contribution as heard through a working chain (`heardMonitorDb` is -inf without a valid chain on that bus);
  - `busDb`: the bus master in dB;
  - `sendDbByChannel`: one send figure per channel;
  - `monitorByChannel`: each channel's heard contribution to that bus, per channel;
  - `mainDbByChannel`: each channel's Main contribution (no `bus`).

## Condition types and tolerances

All levels are peak estimates in dBFS. `AUDIBLE_DB` = -45 (you would hear it at a speaker). A contribution below `OFF_DB` = -60 counts as off.

| Type | Params | Met when |
|---|---|---|
| `sourcesPatched` | `min` | at least `min` different sources are on working inputs (connected, signal, status `ok`: right path, phantom present) |
| `gainStaged` | `min` | at least `min` working channels read Good or Hot (post-preamp peak -22 to 0 dBFS) |
| `validChain` | `output`, `zone?` | some speaker in that zone has a valid chain from the output; `"main"` means `main-l` or `main-r`, otherwise a port id (`"aux1"`, `"aux2"`) |
| `noBrokenChains` | `zone?` | no speaker in that zone has a cable but an invalid chain (unpatched speakers are ignored) |
| `heardInMain` | `min` | at least `min` Good/Hot channels reach a valid speaker via Main at >= -45 dBFS |
| `listenedTo` | `dest` | the student has selected that listen destination (`main`, `aux1`, `aux2` or `pfl`) at some point in this attempt. The start destination counts, and it stays met after they move on; "Start over" clears it |
| `sendRaised` | `bus`, `source`, `baseline`, `minDb` | that bus's send dB now minus baseline >= `minDb` (one-sided) |
| `monitorRaised` | `bus`, `source`, `baseline`, `minDb` | heard dB on that bus now minus baseline >= `minDb`, and now >= -45 |
| `monitorMixUnchanged` | `bus`, `baseline`, `toleranceDb` | every channel's heard contribution to that bus is within +/-`toleranceDb` of baseline; two "off" values match. It measures what reaches a working wedge, so unplugging that wedge's chain also fails it |
| `mainUnchanged` | `baseline`, `toleranceDb` | every channel's Main contribution (max of L/R, including fader, mute, pan and master) is within +/-`toleranceDb` of baseline; two "off" values match |
| `masterRaised` | `bus`, `baseline`, `minDb` | that master's dB now minus baseline >= `minDb` |
| `sendBalanceKept` | `bus`, `baseline`, `toleranceDb` | every send on that bus moved by the same amount: each channel's change is within +/-`toleranceDb` of the median change; a send that was off stays off and one that was on stays on |

`minDb` thresholds are one-sided ("at least this much"). `toleranceDb` is two-sided. Note `heardInMain` is not zone-restricted; pair it with `validChain` or `noBrokenChains` when the zone matters.

## V1 scenarios

### 1. Build the rig (`build-rig`, band leader)

- **Start:** drums, bass, keys and lead vocal unplugged; the rig has powered house speakers (`spk-l`, `spk-r`), a passive house speaker (`pspk-l`), a power amp and a wedge. **Main L is deliberately already run to the passive speaker** (XLR-TRS cable, no amp). Gain 0, faders down, masters at unity, listening to Main.
- **Conditions (all goals):** `patched` >= 2 sources; `gain` >= 2 channels Good or Hot; `chain` a valid house chain from Main; `heard` >= 2 sources at >= -45 dBFS through Main; `no-broken` no house speaker left on a chain that cannot work.
- **Solve:** patch two sources on the right cables (a condenser needs XLR and +48 V; a mic on the 1/4" side reads weak and does not count), raise gain into Good, bring up the faders, then either patch Main L/R into the powered speakers or run Main to the amp and the amp to the passive speaker.
- **Not enough:** leaving Main L on the passive speaker fails `no-broken` even when Main R works.

### 2. More of my voice in the monitor (`more-vocal`, lead singer)

The picker calls it "Singer's wedge".

- **Start:** reference patch, mixed. Main L/R to powered house speakers, Aux 1 to the singer's powered wedge, Aux 2 to the amp and the drummer's passive wedge. Aux 1 sends: bass -3, guitars -2, keys -1, lead vocal -14 dB. Aux 2 sends: bass 0, guitars -8, keys -6, lead vocal -4 dB. **Listening to Main**, so the student has to go and hear the wedge.
- **Baseline:** `vocalSendDb` (Aux 1 send), `vocalMonitorDb` (heard in the singer's wedge), `mainByChannel`, `drummerMix` (`monitorByChannel` on Aux 2).
- **Conditions:** `listen` goal, has listened to Aux 1; `send` goal, lead-vocal Aux 1 send up >= **+4 dB**; `wedge` goal, heard level in the singer's wedge up >= **+4 dB** and >= -45 dBFS; `house` keep, Main per channel within **+/-1 dB**; `drummer` keep, the drummer's wedge (Aux 2) per channel within **+/-1 dB**.
- **Solve:** switch Listen to Aux 1 and raise the lead-vocal Aux 1 send by 4 dB or more.
- **Fails on purpose:** raising GAIN (moves Main and the drummer's wedge), raising the fader (Main moves; pre-fader Aux does not), a 3 dB nudge, raising the vocal's Aux 2 send (the wrong wedge: `send` fails and the drummer's mix moves), muting the vocal (Main changes; the pre-fader send would still pass), unplugging the singer's wedge, or never listening to Aux 1.

### 3. The whole monitor mix is too quiet (`monitor-quiet`, drummer)

The picker calls it "Drummer's wedge".

- **Start:** reference patch, mixed; the same rig as scenario 2. Aux 2 goes to the amp, and the amp to the **passive** drummer's wedge on a speaker cable. Aux 2 sends: drums 0, bass -4, keys -6, backing vocals -7, lead vocal -3 dB. Aux 1 sends (the singer's wedge): drums -10, bass -6, keys -4, backing vocals -3, lead vocal 0 dB. The **Aux 2 master starts at -26 dB**; the Aux 1 master is at unity. **Listening to Main.**
- **Baseline:** `auxMasterDb` (Aux 2 master), `sendsByChannel` (Aux 2 sends), `singerMix` (`monitorByChannel` on Aux 1).
- **Conditions:** `listen` goal, has listened to Aux 2; `master` goal, Aux 2 master up >= **+8 dB**; `balance` keep, Aux 2 sends move together within **+/-1.5 dB** of the median change with none added or dropped; `chain` keep, the Aux 2 chain (amp to passive wedge) stays valid; `singer` keep, the singer's wedge (Aux 1) per channel within **+/-1 dB**.
- **Solve:** switch Listen to Aux 2 and raise the Aux 2 master.
- **Fails on purpose:** raising every Aux 2 send but not the master (balance holds, `master` fails), raising the Aux 1 master instead (`master` fails and the singer's wedge moves), moving one send alone, zeroing a send, unplugging the amp-to-wedge cable, or never listening to Aux 2.

### Free play (`free-play`)

All seven sources on the reference patch. Main goes to the powered house speakers, Aux 1 to the singer's powered wedge, and Aux 2 through the amp to the drummer's passive wedge. The passive house speakers are present but unpatched. No conditions, so it never completes. Buttons: Reset the band, Unplug everything.

Free play also has a **Band audio** control: the 8-bar loop (28 s) or the **Full song** (3:58, with a seek slider). The choice only applies in Free play; every other scenario plays the loop, so leaving Free play returns to it. The setting is held in memory, so coming back to Free play shows and plays the choice you last made. How the full song is streamed is in [AUDIO_ENGINE.md](AUDIO_ENGINE.md).

## Runtime

`selectScenario(id)` in `js/app.js` builds the state, calls `store.replace`, captures the baseline, starts a fresh `session` (`listened` holds the start destination), and evaluates. A store subscriber adds each new listen destination to `session.listened`. Deep links `#/build-rig`, `#/more-vocal`, `#/monitor-quiet`, `#/free-play` select one; an unknown hash at load opens Free play. "Start over" rebuilds the state, recaptures the baseline and clears `session`. Changing scenarios reuses cached stems ([AUDIO_ENGINE.md](AUDIO_ENGINE.md)).

## Authoring a scenario

1. Start with a person, a problem and a destination, not "turn this knob".
2. Pick baselines that describe the start state, then compare against them instead of hard-coding numbers.
3. Use a `goal` for the change and a `keep` for what must not move, including the *other* wedge. Make the tempting wrong fix fail (gain instead of send, the wrong bus's send or master, every send instead of the master). If the fix only makes sense after hearing the right destination, start on a different listen destination and add a `listenedTo` goal.
4. Choose thresholds larger than a casual nudge and tolerances wider than control rounding (at least 1 dB).
5. Start with every goal unmet and every `keep` met; the tests enforce it.
6. Write labels as outcomes. Write three hints: destination, path, control.
7. Add source availability in the manifest `scenarios` lists. Give starting sends per bus in `setup.sends` and master exceptions in `setup.masters`, both in dB (`buildScenarioState` converts with `dbToLevel`).
8. New logic goes in `CONDITIONS` (and `METRICS` for a new baseline); per-bus logic takes a `bus` parameter. `validateScenarios()` reports unknown devices, condition types and baselines. The picker's short titles are a small map in `js/ui/scenario-view.js`.
9. Metrics indexed by channel assume sources stay on their channels; re-patching a source elsewhere reads as a change.

## Tests

```sh
npm test            # or: node --test tests/
```

Node 18 or newer. `tests/scenarios.test.mjs` checks data integrity, that each scenario starts unsolved with `keep` conditions holding (and scenarios 2 and 3 start on Main), and that each is solved (or not) by the state changes described above, including the listening objectives and the wrong-wedge cases (no audio or UI). It passes a `session` the way `js/app.js` does. `tests/routing.test.mjs` covers connectors, chains, the level law, `computeMix` (including Aux 1 and Aux 2 independence) and the store. `tests/skins.test.mjs` covers the MUTE/ON mapping, the global phantom state, strip layout data (`aux1` and `aux2` parts), the AUX 1/AUX 2 and MON 1/MON 2 terms, and hint placeholders. No browser is needed.
