// Scenarios are data: a setup (rig + mixer values), named baselines captured
// at the start, and declarative conditions evaluated from state + computed
// signal flow. Nothing here knows which skin is showing, and no condition is
// ever satisfied by a "done" button. See docs/SCENARIOS.md.

import { SOURCES_BY_ID, STEMS, sourcesForScenario } from "../audio/source-manifest.js";
import { CABLES, DEVICE_TYPES, cableEndFor, channelPortRef, getPort, plugFitsJack } from "./connection-model.js";
import { BUSES, computeMix, createMixerState, dbToLevel, levelToDb, clamp } from "./mixer-state.js";
import * as CR1604 from "./cr1604.js";
import { createF8, createPair, createReverb } from "./devices.js";
import { COMPACT, LAWS as COMPACT_LAWS, channelGainDb, compactModel, levelLaw } from "./compact.js";

// Outboard gear for the CR1604 gig: a reverb on AUX 3 → AUX RETURN 1, and a
// field recorder with a stereo room pair for recording the show.
export const STAGE_GEAR = {
  reverb: () => ({ id: "reverb", type: "reverb", label: "Reverb unit (stereo)", ...createReverb() }),
  recorder: () => ({ id: "rec", type: "zoom-f8", label: "Zoom F8 field recorder", ...createF8() }),
  pair: () => ({ id: "room-pair", type: "stereo-mic-pair", label: "Room pair · stereo bar at FOH", ...createPair() }),
};
const REVERB_CABLES = [
  { from: "mixer/aux3", to: "reverb/in-l", cable: "trs" },
  { from: "reverb/out-l", to: "mixer/ret1-l", cable: "trs" },
  { from: "reverb/out-r", to: "mixer/ret1-r", cable: "trs" },
];
const REVERB_SENDS = { "lead-vocal": -6, "backing-vocals": -10, trumpets: -14 };

// ---------- rig inventory ----------

// Playback gear a scenario can put on stage. zone: who hears it ("foh" =
// audience, "stage" = performers). pan places it for headphone listening.
// `short` is how the listening bar names it.
export const PLAYBACK_DEVICES = {
  "spk-l": { type: "powered-speaker", label: "Powered speaker · house left", short: "house left", zone: "foh", pan: -1 },
  "spk-r": { type: "powered-speaker", label: "Powered speaker · house right", short: "house right", zone: "foh", pan: 1 },
  "pspk-l": { type: "passive-speaker", label: "Passive speaker · house left", short: "house left (passive)", zone: "foh", pan: -1 },
  "pspk-r": { type: "passive-speaker", label: "Passive speaker · house right", short: "house right (passive)", zone: "foh", pan: 1 },
  amp: { type: "power-amp", label: "Power amp (2-channel)" },
  wedge: { type: "powered-speaker", label: "Powered wedge · lead singer", short: "singer's wedge", zone: "stage", pan: 0 },
  // The STAGEPAS 400BT's own speakers: passive, driven by the amp in its mixer.
  "sp-l": { type: "passive-speaker", label: "STAGEPAS 400S speaker · left", short: "STAGEPAS left", zone: "foh", pan: -1 },
  "sp-r": { type: "passive-speaker", label: "STAGEPAS 400S speaker · right", short: "STAGEPAS right", zone: "foh", pan: 1 },
  pwedge: { type: "passive-speaker", label: "Passive wedge · drummer", short: "drummer's wedge", zone: "stage", pan: 0 },
  // A video camera's two XLR audio inputs (each with a MIC/LINE switch, starting at LINE).
  "cam-1": { type: "camera-input", label: "Camera · input 1 (XLR)", short: "camera ch 1", zone: "cam", pan: -1, inputLevel: 1 },
  "cam-2": { type: "camera-input", label: "Camera · input 2 (XLR)", short: "camera ch 2", zone: "cam", pan: 1, inputLevel: 1 },
};

// Two monitor mixes, patched the same way wherever both wedges are on stage:
// Aux 1 → the singer's powered wedge; Aux 2 → power amp → the drummer's passive wedge.
const MONITOR_CABLES = [
  { from: "mixer/aux1", to: "wedge/in", cable: "trs" },
  { from: "mixer/aux2", to: "amp/in-a", cable: "trs" },
  { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
];
const HOUSE_CABLES = [
  { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
  { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
];

export const sourceDeviceId = (sourceId) => `src-${sourceId}`;

// The correct preamp gain for a source on its intended input path.
export function nominalGainDb(source) {
  const pad = source.connector === "xlr" || source.stereo ? 0 : -20; // a stereo line input has no pad
  return clamp(-(source.outputDb + pad), 0, 60);
}

// The cable a tidy stage crew would use for a source.
export function defaultCableFor(source) {
  if (source.stereo) return "mini-dual-ts"; // 3.5 mm laptop out → stereo L/R line input
  return source.connector === "xlr" ? "xlr" : source.connector === "ts14" ? "ts" : "trs";
}

// ---------- scenario definitions ----------

// Condition `kind`: "goal" (must become true) or "keep" (must stay true).
// Text may use {aux1}, {aux2}, {aux1Master}, {aux2Master}, {enabled}, {level},
// {main} — replaced with the current skin's words, so it reads right on either
// mixer. Sends are given per bus in dB ("off" if missing).
export const SCENARIOS = [
  {
    id: "preshow",
    number: 1,
    title: "Preshow music",
    who: "Stage manager",
    prompt: "“Doors open soon and the room is silent. Get the preshow music from the laptop playing through the house speakers.”",
    goal: "The laptop's stereo music heard from both house speakers (Main L and Main R).",
    setup: {
      devices: ["spk-l", "spk-r"],
      patch: "none",
      cables: HOUSE_CABLES,
      channels: "safe", // gain at minimum, faders down
      listen: "main",
    },
    conditions: [
      { id: "patched", kind: "goal", type: "sourcePatched", source: "preshow", label: "The laptop is plugged into the mixer's stereo input" },
      { id: "gain", kind: "goal", type: "sourceGain", source: "preshow", label: "Its input meter shows a healthy level" },
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "preshow", stereo: true, label: "The music comes out of both house speakers, left and right" },
      { id: "chain", kind: "keep", type: "validChain", output: "main", zone: "foh", label: "The house speakers keep working" },
    ],
    hints: [
      "Start at the source. A laptop's headphone jack is a 3.5 mm stereo output: left and right. Which mixer input takes a stereo pair?",
      "Use input 9/10, the stereo line input, with the 3.5 mm → dual 1/4″ breakout cable (one plug into the laptop, two into the L/R pair). Check its input meter reads Good; a laptop is already line level, so it needs little or no GAIN.",
      "Bring up the 9/10 {level}. The house speakers are powered and already patched to {main} L/R, so no amplifier is needed.",
    ],
    complete: "Stereo in, stereo out: one 9/10 strip carries left and right, so the music reaches both house speakers. A laptop is a line-level source: no mic preamp, no +48 V.",
  },
  {
    id: "build-rig",
    number: 2,
    title: "Get the band into the house",
    who: "Band leader",
    prompt: "“Soundcheck. Get at least two of us into the house speakers so the audience can hear the band.”",
    goal: "Two band sources patched, gain-staged and heard through the house speakers ({main} L/R).",
    setup: {
      devices: ["spk-l", "spk-r"],
      patch: "none",
      cables: HOUSE_CABLES,
      channels: "safe",
      listen: "main",
    },
    conditions: [
      { id: "patched", kind: "goal", type: "sourcesPatched", min: 2, label: "Two different sources plugged into proper inputs" },
      { id: "gain", kind: "goal", type: "gainStaged", min: 2, label: "Their input meters show a healthy level, not low and not clipping" },
      { id: "heard", kind: "goal", type: "heardInMain", min: 2, label: "Both sources are heard through the house speakers" },
      { id: "chain", kind: "keep", type: "validChain", output: "main", zone: "foh", label: "The house speakers keep working" },
    ],
    hints: [
      "Each band member needs a mixer input. A condenser mic needs XLR into the mic input, plus +48 V. A keyboard or bass can use a 1/4″ cable into the line input.",
      "Raise each channel's GAIN until its input meter reads Good.",
      "Then bring up each channel's {level}. The house speakers are already patched.",
    ],
    complete: "Source → preamp (GAIN) → channel ({level}) → {main} → speakers. GAIN sets how hot the signal is going into the mixer; the {level} sets how much of it goes to the house.",
  },
  {
    id: "find-amp",
    number: 3,
    title: "Where is the amplifier?",
    who: "Venue tech",
    prompt: "“Tonight's house speakers are a rental pair of passive cabinets. The band is mixed, but we hear nothing. Find the amplifier.”",
    goal: "Main L and Main R both reach a house speaker through a working chain.",
    setup: {
      devices: ["pspk-l", "pspk-r", "amp"],
      patch: "reference",
      // The trap: the mixer's line outputs plugged straight into passive speakers.
      cables: [
        { from: "mixer/main-l", to: "pspk-l/in", cable: "xlr-trs" },
        { from: "mixer/main-r", to: "pspk-r/in", cable: "xlr-trs" },
      ],
      channels: "mixed",
      listen: "main",
    },
    conditions: [
      { id: "left", kind: "goal", type: "validChain", output: "main-l", zone: "foh", label: "Main L reaches a speaker through a working chain" },
      { id: "right", kind: "goal", type: "validChain", output: "main-r", zone: "foh", label: "Main R reaches a speaker through a working chain" },
      { id: "no-broken", kind: "goal", type: "noBrokenChains", zone: "foh", label: "No speaker is left plugged into something that can't drive it" },
      { id: "heard", kind: "goal", type: "heardInMain", min: 2, label: "The band comes out of the speakers" },
    ],
    hints: [
      "Which speakers are silent, and what is each one plugged into? A passive speaker has no amplifier inside.",
      "A mixer output is line level: too weak to move a speaker. A power amp turns line level into speaker level. Path: mixer output → amp input → amp output → speaker.",
      "Unplug Main L and R from the speakers. Main L → amp In A, amp Out A → left speaker; Main R → In B, Out B → right speaker. Use speaker cable from the amp to the speaker.",
    ],
    complete: "Line level can't drive a passive speaker. The amp sits between them: mixer line output → amp input → amp speaker output → passive speaker. A powered speaker just has that amp built in.",
  },
  {
    id: "more-vocal",
    number: 4,
    title: "“More of my voice in the monitor”",
    who: "Lead singer",
    prompt: "“I can't hear myself in my wedge. More of my voice, please — but don't change what the audience hears.”",
    goal: "The singer's wedge ({aux1}) gets more lead vocal. The house mix and the drummer's wedge ({aux2}) stay put.",
    setup: {
      devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
      patch: "reference",
      cables: [...HOUSE_CABLES, ...MONITOR_CABLES],
      channels: "mixed",
      sends: {
        aux1: { bass: -3, guitars: -2, keys: -1, "lead-vocal": -14 },
        aux2: { bass: 0, guitars: -8, keys: -6, "lead-vocal": -4 },
      },
      listen: "main",
    },
    baseline: {
      vocalSendDb: { metric: "sendDb", source: "lead-vocal", bus: "aux1" },
      vocalMonitorDb: { metric: "heardMonitorDb", source: "lead-vocal", bus: "aux1" },
      mainByChannel: { metric: "mainDbByChannel" },
      drummerMix: { metric: "monitorByChannel", bus: "aux2" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux1", label: "Hear what the singer hears: switch Listen to {aux1}" },
      { id: "send", kind: "goal", type: "sendRaised", source: "lead-vocal", bus: "aux1", baseline: "vocalSendDb", minDb: 4, label: "The change is made on the vocal's own channel" },
      { id: "wedge", kind: "goal", type: "monitorRaised", source: "lead-vocal", bus: "aux1", baseline: "vocalMonitorDb", minDb: 4, label: "More vocal actually comes out of the singer's wedge" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "mainByChannel", toleranceDb: 1, label: "The audience (Main) mix stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummerMix", toleranceDb: 1, label: "The drummer's wedge ({aux2}) stays the same" },
    ],
    hints: [
      "Which destination is wrong? Not the house — the singer's wedge. Switch Listen to {aux1} and hear what they hear.",
      "The singer's wedge is fed by the {aux1} bus. Each channel has its own {aux1} send, taken before the channel {level}.",
      "Turn up the lead vocal channel's {aux1} send. Leave its GAIN and {level} alone — those change the house too — and leave {aux2} for the drummer.",
    ],
    complete: "Exactly: the vocal's pre-fader {aux1} send changes only the singer's wedge. GAIN would have changed every mix; the {level} would have changed only the house.",
  },
  {
    id: "drummer-wedge",
    number: 5,
    title: "Build the drummer's wedge",
    who: "Drummer",
    prompt: "“I've got a wedge on my side of the stage and it's dead. Get my monitor mix ({aux2}) into it.”",
    goal: "The {aux2} mix reaches the drummer's passive wedge through the power amp.",
    setup: {
      devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
      patch: "reference",
      // House and the singer's wedge already work; Aux 2 is not patched at all.
      cables: [...HOUSE_CABLES, { from: "mixer/aux1", to: "wedge/in", cable: "trs" }],
      channels: "mixed",
      sends: {
        aux1: { bass: -3, keys: -6, "lead-vocal": 0 },
        aux2: { drums: -2, bass: -3, keys: -8, "lead-vocal": -5 },
      },
      listen: "main",
    },
    baseline: {
      mainByChannel: { metric: "mainDbByChannel" },
      singerMix: { metric: "monitorByChannel", bus: "aux1" },
    },
    conditions: [
      { id: "chain", kind: "goal", type: "validChain", output: "aux2", device: "pwedge", label: "{aux2} reaches the drummer's wedge through a working chain" },
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux2", label: "Check it: switch Listen to {aux2}" },
      { id: "heard", kind: "goal", type: "busAudible", bus: "aux2", label: "The drummer can hear their mix" },
      { id: "no-broken", kind: "keep", type: "noBrokenChains", zone: "stage", label: "No wedge is left on a chain that can't work" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "mainByChannel", toleranceDb: 1, label: "The audience mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singerMix", toleranceDb: 1, label: "The singer's wedge ({aux1}) stays the same" },
    ],
    hints: [
      "Follow {aux2} out of the mixer. The drummer's wedge is passive, so it has no amplifier of its own.",
      "Same as the house speakers earlier: {aux2} out → power amp input → power amp output → passive wedge.",
      "{aux2} out → amp In A. Amp Out A → the wedge, on speaker cable. Then switch Listen to {aux2} to hear it.",
    ],
    complete: "The same amplifier rule as the house: a passive wedge needs a power amp between the mixer's line-level {aux2} output and the speaker. Only then does the drummer hear the mix.",
  },
  {
    id: "more-piano",
    number: 6,
    title: "“More piano”",
    who: "Drummer",
    prompt: "“I can barely hear the piano in my wedge. More keys, please. Nothing else.”",
    goal: "More keys in the drummer's wedge ({aux2}). Everything else stays put.",
    setup: {
      devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
      patch: "reference",
      cables: [...HOUSE_CABLES, ...MONITOR_CABLES],
      channels: "mixed",
      sends: {
        aux1: { bass: -3, keys: -8, "lead-vocal": 0 },
        aux2: { drums: -2, bass: -3, keys: -18, "lead-vocal": -5 },
      },
      listen: "main",
    },
    baseline: {
      keysSendDb: { metric: "sendDb", source: "keys", bus: "aux2" },
      keysMonitorDb: { metric: "heardMonitorDb", source: "keys", bus: "aux2" },
      mainByChannel: { metric: "mainDbByChannel" },
      drummerMix: { metric: "monitorByChannel", bus: "aux2" },
      singerMix: { metric: "monitorByChannel", bus: "aux1" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux2", label: "Hear what the drummer hears: switch Listen to {aux2}" },
      { id: "send", kind: "goal", type: "sendRaised", source: "keys", bus: "aux2", baseline: "keysSendDb", minDb: 4, label: "The change is made on the keys' own channel" },
      { id: "wedge", kind: "goal", type: "monitorRaised", source: "keys", bus: "aux2", baseline: "keysMonitorDb", minDb: 4, label: "More keys actually comes out of the drummer's wedge" },
      { id: "rest", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", except: "keys", baseline: "drummerMix", toleranceDb: 1, label: "The rest of the drummer's mix stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "mainByChannel", toleranceDb: 1, label: "The audience mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singerMix", toleranceDb: 1, label: "The singer's wedge ({aux1}) stays the same" },
    ],
    hints: [
      "Which wedge is this about? Switch Listen to it and hear what the drummer hears.",
      "Change one instrument in one mix: the keys channel's {aux2} send.",
      "Turn up only the keys' {aux2} send. GAIN and the {level} would change the house too.",
    ],
    complete: "One instrument, one mix: the keys' {aux2} send changes only that instrument in the drummer's wedge. GAIN would have changed every mix, and the {level} only the house.",
  },
  {
    id: "monitor-quiet",
    number: 7,
    title: "“My whole monitor mix is too quiet”",
    who: "Drummer",
    prompt: "“The balance in my wedge is fine. It's just all too quiet — I can barely hear any of it back here.”",
    goal: "The drummer's wedge ({aux2}) louder overall, same balance inside it. The singer's wedge ({aux1}) stays put.",
    setup: {
      devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
      patch: "reference",
      cables: [...HOUSE_CABLES, ...MONITOR_CABLES],
      channels: "mixed",
      sends: {
        aux1: { drums: -10, bass: -6, keys: -4, "backing-vocals": -3, "lead-vocal": 0 },
        aux2: { drums: 0, bass: -4, keys: -6, "backing-vocals": -7, "lead-vocal": -3 },
      },
      masters: { aux2: -26 },
      listen: "main",
    },
    baseline: {
      auxMasterDb: { metric: "busDb", bus: "aux2" },
      sendsByChannel: { metric: "sendDbByChannel", bus: "aux2" },
      singerMix: { metric: "monitorByChannel", bus: "aux1" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux2", label: "Hear what the drummer hears: switch Listen to {aux2}" },
      { id: "master", kind: "goal", type: "masterRaised", bus: "aux2", baseline: "auxMasterDb", minDb: 8, label: "The drummer's whole mix comes up together" },
      { id: "balance", kind: "keep", type: "sendBalanceKept", bus: "aux2", baseline: "sendsByChannel", toleranceDb: 1.5, label: "The balance inside the drummer's mix stays the same" },
      { id: "chain", kind: "keep", type: "validChain", output: "aux2", label: "The drummer's wedge chain keeps working" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singerMix", toleranceDb: 1, label: "The singer's wedge ({aux1}) stays the same" },
    ],
    hints: [
      "The complaint is about the whole drummer's mix, not one instrument. Which destination is that? Switch Listen to it.",
      "You could turn up every send one by one, but the balance would drift. Which control affects the whole {aux2} bus at once? Not the {aux1Master}: that's the singer's wedge.",
    ],
    complete: "One control, whole mix: the {aux2Master} sits after every {aux2} send is summed, so it moves the drummer's entire mix without touching its balance — or anyone else's wedge.",
  },
  {
    id: "foh-vocal",
    number: 8,
    title: "“The vocal is too loud in the house”",
    who: "Band leader",
    prompt: "“Out front the lead vocal is way too loud over the band. The singer loves their wedge though. Don't touch that.”",
    goal: "Lead vocal quieter for the audience. The singer's wedge and everything else stay the same.",
    setup: {
      devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
      patch: "reference",
      cables: [...HOUSE_CABLES, ...MONITOR_CABLES],
      channels: "mixed",
      faders: { "lead-vocal": 4 }, // starts pushed up in the house
      sends: {
        aux1: { drums: -10, bass: -3, keys: -6, "lead-vocal": 0 },
        aux2: { drums: -2, bass: -3, keys: -8, "lead-vocal": -5 },
      },
      listen: "main",
    },
    baseline: {
      mainByChannel: { metric: "mainDbByChannel" },
      singerMix: { metric: "monitorByChannel", bus: "aux1" },
      drummerMix: { metric: "monitorByChannel", bus: "aux2" },
    },
    conditions: [
      { id: "lower", kind: "goal", type: "mainLowered", source: "lead-vocal", baseline: "mainByChannel", minDb: 6, label: "The lead vocal is clearly quieter in the house" },
      { id: "audible", kind: "goal", type: "sourceHeardInMain", source: "lead-vocal", label: "It's still in the mix, just quieter" },
      { id: "band", kind: "keep", type: "mainUnchanged", except: "lead-vocal", baseline: "mainByChannel", toleranceDb: 1, label: "The rest of the band in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singerMix", toleranceDb: 1, label: "The singer's wedge ({aux1}) stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummerMix", toleranceDb: 1, label: "The drummer's wedge ({aux2}) stays the same" },
    ],
    hints: [
      "Who is complaining? The audience. Which mix do they hear, and which controls change only that mix?",
      "In this mixer the {aux1} and {aux2} sends are taken before the channel {level}, so the {level} affects the house alone.",
    ],
    complete: "Because the aux sends are pre-fader, the {level} moves only the house mix and the singer's wedge stays put. GAIN would have changed every mix, and the wedge would have followed.",
  },
  {
    id: "missing-guitar",
    number: 9,
    title: "“Where did the guitar go?”",
    who: "Guitarist",
    prompt: "“I'm playing, the band can hear me, but I'm not in the house. Find out why and fix it.”",
    goal: "The guitar is back in the house, and you changed only what was actually wrong.",
    setup: {
      devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
      patch: "reference",
      cables: [...HOUSE_CABLES, ...MONITOR_CABLES],
      channels: "mixed",
      sends: {
        aux1: { drums: -10, bass: -3, guitars: -6, "lead-vocal": 0 },
        aux2: { drums: -2, bass: -3, guitars: -6, "lead-vocal": -5 },
      },
      muted: ["guitars"], // the one fault
      listen: "main",
    },
    baseline: {
      mainByChannel: { metric: "mainDbByChannel" },
      guitarChannel: { metric: "channelSettings", source: "guitars" },
    },
    conditions: [
      { id: "pfl", kind: "goal", type: "listenedTo", dest: "pfl", label: "Check the guitar's own signal with PFL" },
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "guitars", label: "The guitar is heard through the house speakers" },
      { id: "settings", kind: "keep", type: "channelUnchanged", source: "guitars", baseline: "guitarChannel", toleranceDb: 1, label: "The guitar's GAIN and {level} are as they were" },
      { id: "band", kind: "keep", type: "mainUnchanged", except: "guitars", baseline: "mainByChannel", toleranceDb: 1, label: "The rest of the band in the house stays the same" },
    ],
    hints: [
      "First find out whether the guitar reaches the mixer at all. PFL lets you listen to one channel's signal before anything else acts on it.",
      "If the signal is there but the audience can't hear it, check what stands between the channel and Main. Look at the channel's switches, not its knobs.",
    ],
    complete: "PFL showed the guitar arriving fine, so the problem was after the input: the channel was switched off for Main ({enabled}). Change only the actual fault.",
  },
  {
    id: "drummer-mix",
    number: 10,
    title: "Build the drummer a monitor mix",
    who: "Drummer",
    prompt: "“Can I get drums, bass, some lead vocal, and a little piano?”",
    goal: "Build that mix in the drummer's wedge ({aux2}): what they asked for, and nothing else.",
    setup: {
      devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
      patch: "reference",
      cables: [...HOUSE_CABLES, ...MONITOR_CABLES],
      channels: "mixed",
      sends: {
        aux1: { drums: -10, bass: -3, guitars: -6, keys: -6, "lead-vocal": 0 },
        aux2: { guitars: -12 }, // a leftover from soundcheck; everything else is empty
      },
      listen: "main",
    },
    baseline: {
      mainByChannel: { metric: "mainDbByChannel" },
      singerMix: { metric: "monitorByChannel", bus: "aux1" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux2", label: "Hear what the drummer hears: switch Listen to {aux2}" },
      { id: "core", kind: "goal", type: "monitorPresent", bus: "aux2", sources: ["drums", "bass", "lead-vocal"], minDb: -30, label: "Drums, bass and lead vocal are clearly in the wedge" },
      { id: "piano", kind: "goal", type: "monitorLittle", bus: "aux2", source: "keys", below: ["drums", "bass"], byDb: 3, label: "Piano is in there, but quieter than drums and bass" },
      { id: "others", kind: "goal", type: "monitorAbsent", bus: "aux2", sources: ["guitars"], label: "Nothing they didn't ask for" },
      { id: "chain", kind: "keep", type: "validChain", output: "aux2", label: "The drummer's wedge chain keeps working" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "mainByChannel", toleranceDb: 1, label: "The audience mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singerMix", toleranceDb: 1, label: "The singer's wedge ({aux1}) stays the same" },
    ],
    hints: [
      "Switch Listen to the drummer's wedge and build the mix one channel at a time, using each channel's {aux2} send.",
      "Drums and bass are the foundation. The piano should be audible but well behind them. Check the {aux2} bus for anything left over.",
    ],
    complete: "You built a monitor mix from scratch: the {aux2} sends choose who is in the wedge and how loud, the {aux2Master} moves it all together, and the amp and passive wedge make it audible.",
  },
  {
    id: "free-play",
    number: 0,
    title: "Free play",
    who: null,
    prompt: "The whole band is patched and mixed: house speakers on Main, the singer's wedge on {aux1}, the drummer's wedge on {aux2}. Break it, fix it, and listen to each destination.",
    goal: "No objective — try muting a channel while listening to a wedge, or unplugging the amp.",
    setup: {
      devices: ["spk-l", "spk-r", "pspk-l", "pspk-r", "amp", "wedge", "pwedge"],
      patch: "reference",
      cables: [...HOUSE_CABLES, ...MONITOR_CABLES],
      channels: "mixed",
      sends: {
        aux1: { drums: -10, bass: -6, guitars: -6, keys: -5, trumpets: -12, "backing-vocals": -4, "lead-vocal": 0 },
        aux2: { drums: -2, bass: 0, guitars: -6, keys: -8, trumpets: -12, "backing-vocals": -8, "lead-vocal": -3 },
      },
      listen: "main",
      patchAlso: ["preshow"], // the preshow laptop is patched to stereo input 9/10 ...
      muted: ["preshow"], // ... but that channel starts muted
    },
    conditions: [],
    hints: [],
    complete: null,
  },
];

// Short label for pickers and reports (falls back to the full title for new scenarios).
export function shortTitle(s) {
  return (
    {
      preshow: "Preshow music",
      "build-rig": "Band into the house",
      "find-amp": "Find the amp",
      "more-vocal": "Singer's wedge",
      "drummer-wedge": "Drummer's wedge",
      "more-piano": "More piano",
      "monitor-quiet": "Too quiet",
      "foh-vocal": "Vocal too loud",
      "missing-guitar": "Missing guitar",
      "drummer-mix": "Drummer's mix",
      "free-play": "Free play",
    }[s.id] || s.title
  );
}

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

// The numbered scenarios are written for the generic mixer (Mixer A / Mixer B).
// The CR1604-VLZ runs Free play until its own scenarios are written.
export const scenariosFor = (model = "generic") => (model !== "generic" ? SCENARIOS.filter((s) => s.id === "free-play") : SCENARIOS);

// ---------- building a scenario's starting state ----------

export function buildScenarioState(def, sourcesById = SOURCES_BY_ID, model = "generic") {
  if (model === "cr1604") return buildCr1604State(def, sourcesById);
  if (COMPACT[model]) return buildCompactState(model, sourcesById);
  const state = createMixerState();
  const setup = def.setup;
  const sources = sourcesForScenario(def.id).filter((s) => sourcesById[s.id]);

  for (const s of sources) {
    state.rig.devices.push({ id: sourceDeviceId(s.id), type: s.deviceType, sourceId: s.id, label: s.device });
  }
  for (const id of setup.devices) {
    const d = PLAYBACK_DEVICES[id];
    state.rig.devices.push({ id, type: d.type, label: d.label, short: d.short, zone: d.zone, pan: d.pan });
  }

  let n = 0;
  const addCable = (c) => state.rig.cables.push({ id: `c${++n}`, ...c });
  if (setup.patch === "reference") {
    for (const s of sources) {
      if (s.reference === false && !(setup.patchAlso || []).includes(s.id)) continue; // available on stage, but the student patches it
      addCable({ from: `${sourceDeviceId(s.id)}/out`, to: channelPortRef(s.order - 1), cable: defaultCableFor(s) });
    }
  }
  for (const c of setup.cables || []) addCable(c);

  if (setup.channels === "mixed") {
    for (const s of sources) {
      const ch = state.channels[s.order - 1];
      ch.gainDb = nominalGainDb(s);
      ch.phantom = s.phantom === "required";
      ch.level = dbToLevel(setup.faders && s.id in setup.faders ? setup.faders[s.id] : s.mixDb);
      if (!ch.stereo) ch.pan = s.pan;
      for (const bus of BUSES) {
        const sends = (setup.sends && setup.sends[bus]) || {};
        ch.auxSends[bus] = dbToLevel(s.id in sends ? sends[s.id] : -Infinity);
      }
    }
  }
  for (const id of setup.muted || []) {
    const s = SOURCES_BY_ID[id];
    if (s) state.channels[s.order - 1].enabled = false;
  }
  // Masters default to unity; setup.masters gives exceptions in dB.
  for (const [bus, db] of Object.entries(setup.masters || {})) state[bus].level = dbToLevel(db);
  state.listen = setup.listen || "main";
  return state;
}

// The same gig on the Mackie CR1604-VLZ. Its outputs are 1/4" jacks, so a
// setup cable that doesn't fit is swapped for one that does; mics go into MIC
// jacks and line sources into LINE jacks; the laptop goes into TAPE IN.
// Monitors are set up the way the manual recommends: AUX 1 and 2 with PRE down.
function buildCr1604State(def, sourcesById) {
  const state = CR1604.createState();
  const setup = def.setup;
  const sources = sourcesForScenario(def.id).filter((s) => sourcesById[s.id]);
  for (const s of sources) state.rig.devices.push({ id: sourceDeviceId(s.id), type: s.deviceType, sourceId: s.id, label: s.device });
  for (const id of setup.devices) {
    const d = PLAYBACK_DEVICES[id];
    state.rig.devices.push({ id, type: d.type, label: d.label, short: d.short, zone: d.zone, pan: d.pan });
  }
  const sandbox = def.id === "free-play";
  if (sandbox) state.rig.devices.push(STAGE_GEAR.reverb(), STAGE_GEAR.recorder(), STAGE_GEAR.pair());
  const channelOfSource = (s) => (s.stereo ? CR1604.TAPE : s.order - 1);
  let n = 0;
  const addCable = (c) => state.rig.cables.push({ id: `c${++n}`, ...c });
  if (setup.patch === "reference") {
    for (const s of sources) {
      if (s.reference === false && !(setup.patchAlso || []).includes(s.id)) continue;
      const cable = s.stereo ? "mini-rca" : defaultCableFor(s);
      const plug = cableEndFor(cable, DEVICE_TYPES[s.deviceType].ports[0].jack).far;
      addCable({ from: `${sourceDeviceId(s.id)}/out`, to: channelPortRef(channelOfSource(s), { plug, mixerType: "cr1604" }), cable });
    }
  }
  for (const c of setup.cables || []) addCable({ ...c, cable: fittingCable(state.rig, c) });
  if (sandbox) for (const c of REVERB_CABLES) addCable(c);

  if (setup.channels === "mixed") {
    for (const s of sources) {
      const ch = state.channels[channelOfSource(s)];
      if (ch.tape) continue; // TAPE IN stays at U, off the main mix until TAPE TO MAIN MIX
      ch.gainDb = clamp(nominalGainDb(s), CR1604.GAIN_MIN_DB, CR1604.GAIN_MAX_DB);
      ch.level = CR1604.LAWS.fader.toPos(setup.faders && s.id in setup.faders ? setup.faders[s.id] : s.mixDb);
      ch.pan = s.pan;
      ch.pre = true;
      ch.lowCut = !["drums", "bass"].includes(s.id); // the manual: low cut on everything but kick and bass
      ch.assign.lr = true;
      for (const bus of BUSES) {
        const sends = (setup.sends && setup.sends[bus]) || {};
        ch.auxSends[bus] = CR1604.LAWS.send.toPos(s.id in sends ? sends[s.id] : -Infinity);
      }
      if (sandbox && s.id in REVERB_SENDS) ch.auxSends.aux3 = CR1604.LAWS.send.toPos(REVERB_SENDS[s.id]);
    }
    // One PHANTOM switch for the whole board.
    const phantom = sources.some((s) => s.phantom === "required");
    for (const ch of state.channels) if (!ch.tape) ch.phantom = phantom;
    for (const sub of CR1604.SUBS) state[sub].level = CR1604.LAWS.fader.toPos(0);
    state.soloBus.mode = "pfl"; // live sound: LEVEL SET (PFL)
  }
  for (const [bus, db] of Object.entries(setup.masters || {})) state[bus].level = CR1604.LAWS.master.toPos(db);
  state.listen = setup.listen || "main";
  return state;
}

// ---------- the gig on a compact mixer ----------

// Which source goes where on each compact mixer (channel index and jack), the
// stage, the patch and the sends (dB). A small mixer can't take the whole band:
// the sources left over stay on stage, unplugged.
export const COMPACT_GIGS = {
  mix8: {
    prompt: "A duo gig on a Mackie Mix8: two mic channels (both vocals), the keys on stereo channel 3/4, the laptop on TAPE IN. The rest of the band has no channel left. The singer's wedge is on the AUX send, which on this mixer is post-fader.",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], keys: [2, "l"], preshow: ["tape"] },
    devices: ["spk-l", "spk-r", "wedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "trs" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "trs" },
      { from: "mixer/aux1", to: "wedge/in", cable: "trs" },
    ],
    sends: { aux: { "lead-vocal": 0, "backing-vocals": -8, keys: -10 } },
  },
  vlz1202: {
    prompt: "The band on a Mackie 1202-VLZ: drums, bass and both vocals on the four mic channels, keys on 5/6, the laptop on 7/8 (level down). AUX 1 (switched to PRE) feeds the singer's wedge; AUX 2 feeds a reverb that comes back on AUX RETURN 1.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], "lead-vocal": [2, "mic"], "backing-vocals": [3, "mic"], keys: [4, "l"], preshow: [5, "lr"] },
    devices: ["spk-l", "spk-r", "wedge"],
    reverb: { send: "mixer/aux2", ret: "ret1" },
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/aux1", to: "wedge/in", cable: "trs" },
    ],
    sends: { aux1: { drums: -10, bass: -6, "lead-vocal": 0, "backing-vocals": -4, keys: -8 }, aux2: { "lead-vocal": -6, "backing-vocals": -8 } },
  },
  mg102: {
    prompt: "The band on a Yamaha MG10/2: both vocals on 1 and 2, drums and bass on the XLRs of 3/4 and 5/6, keys on 7/8, the laptop on 9/10 (level down). Each channel's one AUX knob feeds either the singer's wedge (AUX1, left) or the reverb (AUX2, right).",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], drums: [2, "mic"], bass: [3, "mic"], keys: [4, "l"], preshow: [5, "rca"] },
    devices: ["spk-l", "spk-r", "wedge"],
    reverb: { send: "mixer/aux2", ret: "ret1" },
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "trs" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "trs" },
      { from: "mixer/aux1", to: "wedge/in", cable: "trs" },
    ],
    // One AUX knob per channel: negative = AUX1 (the wedge, pre), positive = AUX2 (the reverb, post).
    sends: { auxPan: { "lead-vocal": -0, "backing-vocals": 6, drums: -10, bass: -6 } },
    bipolarSides: { "lead-vocal": "left", "backing-vocals": "right", drums: "left", bass: "left" },
  },
  stagepas400bt: {
    prompt: "A small gig on a Yamaha STAGEPAS 400BT: vocals on 1 and 2, guitar and bass on 3 and 4, keys on 5/6, the laptop on 7/8 (level down). SPEAKERS L/R drive the two STAGEPAS speakers directly — the amp is in the mixer — and MONITOR OUT feeds the singer's wedge.",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], guitars: [2, "in"], bass: [3, "in"], keys: [4, "l"], preshow: [5, "mini"] },
    devices: ["sp-l", "sp-r", "wedge"],
    cables: [
      { from: "mixer/spk-l", to: "sp-l/in", cable: "speaker" },
      { from: "mixer/spk-r", to: "sp-r/in", cable: "speaker" },
      { from: "mixer/mon-l", to: "wedge/in", cable: "trs" },
    ],
    sends: { reverb: { "lead-vocal": -8, "backing-vocals": -10 } },
  },
  x1204usb: {
    prompt: "The band on a Behringer Xenyx X1204USB: both vocals, guitar and bass on the four mic channels, keys on 5/6, the laptop on 7/8 (switched to −10 dBV, level down). AUX 1, with PRE pressed on each channel, feeds the singer's wedge; the FX send feeds the built-in effects, which come back on RETURN 2. The lead vocal has a little COMP.",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], guitars: [2, "mic"], bass: [3, "mic"], keys: [4, "l"], preshow: [5, "lr"] },
    devices: ["spk-l", "spk-r", "wedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/aux1", to: "wedge/in", cable: "trs" },
    ],
    sends: { aux1: { "lead-vocal": 0, "backing-vocals": -6, guitars: -10, bass: -10, keys: -8 }, fx: { "lead-vocal": -6, "backing-vocals": -8, keys: -14 } },
    pre: true, // every channel's AUX 1 PRE pressed
    comp: { "lead-vocal": 0.3 },
    minus10: ["preshow"],
  },
  sd442: {
    prompt: "Shooting the band for video with a Sound Devices 442 on a cart: the room pair on channels 1 and 2 (1+2 LINK on, P48 on), the lead vocal on 3 and the backing vocals on 4. The XLR master outs feed the camera's two XLR inputs, both outputs and camera inputs at LINE. Listen in the HEADPHONE (try M to check the pair in mono), or at the camera.",
    patch: { "room-l": [0, "in"], "room-r": [1, "in"], "lead-vocal": [2, "in"], "backing-vocals": [3, "in"] },
    extraSources: ["room-l", "room-r"], // from the stereo mic pair, not the band's own mics
    devices: ["cam-1", "cam-2"],
    cables: [
      { from: "mixer/main-l", to: "cam-1/in", cable: "xlr" },
      { from: "mixer/main-r", to: "cam-2/in", cable: "xlr" },
    ],
    sends: {},
    link: "on",
    hpf: { "lead-vocal": 0.25, "backing-vocals": 0.25 },
    pans: { "lead-vocal": 0, "backing-vocals": 0 },
    listen: "phones",
  },
};

// Free play on a real mixer describes that mixer's gig (the shared text names
// Mixer A/B's two wedges).
export function scenarioFor(def, model = "generic") {
  if (def.id !== "free-play" || !COMPACT_GIGS[model]) return def;
  return { ...def, prompt: COMPACT_GIGS[model].prompt, goal: "No objective — try a monitor mix, the reverb, or plugging in what has no channel yet." };
}

function buildCompactState(model, sourcesById) {
  const def = COMPACT[model];
  const gig = COMPACT_GIGS[model];
  const state = compactModel(model).createState();
  const sources = sourcesForScenario("free-play").filter((s) => sourcesById[s.id]);
  for (const s of sources) state.rig.devices.push({ id: sourceDeviceId(s.id), type: s.deviceType, sourceId: s.id, label: s.device });
  for (const id of gig.devices) {
    const d = PLAYBACK_DEVICES[id];
    state.rig.devices.push({ id, type: d.type, label: d.label, short: d.short, zone: d.zone, pan: d.pan, ...(d.inputLevel !== undefined ? { inputLevel: d.inputLevel } : {}) });
  }
  if (gig.reverb) state.rig.devices.push(STAGE_GEAR.reverb());
  // The room pair's two mics are sources too (442).
  for (const id of gig.extraSources || []) if (sourcesById[id]) sources.push(sourcesById[id]);
  if (sources.some((s) => s.room && gig.patch[s.id])) state.rig.devices.push(STAGE_GEAR.pair());
  let n = 0;
  const addCable = (c) => state.rig.cables.push({ id: `c${++n}`, ...c });
  const tape = def.channels.length;
  for (const s of sources) {
    const where = gig.patch[s.id];
    if (!where) continue; // no channel left for this one
    const [index, jack] = where[0] === "tape" ? [tape, "tape-in"] : where;
    const port = index === tape ? "tape-in" : `ch${index + 1}-${jack}`;
    const cable = s.stereo ? { lr: "mini-dual-ts", rca: "mini-rca", mini: "mini", "tape-in": "mini-rca" }[jack] : s.room ? "xlr" : defaultCableFor(s);
    const from = s.room ? `room-pair/out-${s.id === "room-l" ? "l" : "r"}` : `${sourceDeviceId(s.id)}/out`;
    addCable({ from, to: `mixer/${port}`, cable });
  }
  for (const c of gig.cables) addCable(c);
  if (gig.reverb) {
    addCable({ from: gig.reverb.send, to: "reverb/in-l", cable: "trs" });
    addCable({ from: "reverb/out-l", to: `mixer/${gig.reverb.ret}-l`, cable: "trs" });
    addCable({ from: "reverb/out-r", to: `mixer/${gig.reverb.ret}-r`, cable: "trs" });
  }

  // Gain-stage and mix what is patched.
  const mix = compactModel(model).computeMix(state, sourcesById, STEMS, (src) => (src && src.stem ? STEMS[src.stem]?.monoPeakDb ?? null : src?.peakDb ?? null));
  for (const s of sources) {
    const where = gig.patch[s.id];
    if (!where || where[0] === "tape") continue;
    const ch = state.channels[where[0]];
    const c = def.channels[where[0]];
    const input = mix.channels[where[0]].input;
    if (c.gain.minus10) ch.minus10 = (gig.minus10 || []).includes(s.id);
    if (gig.pre) ch.pre = true;
    if (c.comp && gig.comp?.[s.id]) ch.comp = gig.comp[s.id];
    if (c.hpf && gig.hpf?.[s.id]) ch.hpf = gig.hpf[s.id];
    if (s.room && def.phantom.perChannel) ch.phantom = true;
    if (c.gain.switch) ch.micLine = s.signalLevel === "line" ? "line" : "mic";
    else if (c.gain.min !== undefined) ch.gainDb = clamp(-s.outputDb - (channelGainDb(def, { ...ch, gainDb: 0 }, input)), c.gain.min, c.gain.max);
    ch.level = levelLaw(def).toPos(s.mixDb);
    if (!ch.stereo) ch.pan = gig.pans?.[s.id] ?? s.pan;
    if (c.lowCut && !["drums", "bass"].includes(s.id)) ch.lowCut = true;
    for (const [sid, levels] of Object.entries(gig.sends)) {
      if (!(sid in ch.sends) || !(s.id in levels)) continue;
      const send = def.sends[sid];
      const pos = COMPACT_LAWS[send.law].toPos(levels[s.id]);
      ch.sends[sid] = send.bipolar ? (gig.bipolarSides[s.id] === "left" ? -pos : pos) : pos;
    }
  }
  // The preshow laptop is patched but kept out of the house, as in the generic Free play.
  const laptop = gig.patch.preshow;
  if (laptop && laptop[0] === "tape") state.channels[tape].toCr = def.tape.routing === "toMainOrCr";
  else if (laptop) state.channels[laptop[0]].level = 0;
  if (!def.phantom.perChannel && sources.some((s) => gig.patch[s.id] && s.phantom === "required")) for (const i of def.phantom.channels) state.channels[i].phantom = true;
  for (const b of Object.keys(def.buses)) if (state[b].pre !== undefined) state[b].pre = true; // monitors pre-fader
  if (state.reverb) state.reverb.on = true;
  if (state.monitor) state.monitor.level = 0.5;
  if (gig.link && state.link) {
    state.link.mode = gig.link;
    state.channels[def.link.pair[0]].pan = 0; // the balance, centred
  }
  if (gig.listen) state.listen = gig.listen;
  return state;
}

// The setup's cable if it fits both ends, else the first signal cable that does.
function fittingCable(rig, c) {
  const from = getPort(rig, c.from);
  const to = getPort(rig, c.to);
  const fits = (id) => {
    const ends = cableEndFor(id, from.jack);
    return ends && plugFitsJack(ends.far, to.jack);
  };
  if (fits(c.cable)) return c.cable;
  return ["trs", "xlr-trs", "ts", "xlr", "speaker"].find((id) => fits(id) && CABLES[id].kind === CABLES[c.cable].kind) || c.cable;
}

// ---------- baselines ----------

const channelOf = (mix, sourceId) => mix.channels.find((c) => c.sourceId === sourceId) || null;

// Every per-bus metric takes `bus` ("aux1", "aux2").
const METRICS = {
  sendDb: (ctx, p) => channelOf(ctx.mix, p.source)?.aux[p.bus].sendDb ?? -Infinity,
  monitorDb: (ctx, p) => channelOf(ctx.mix, p.source)?.aux[p.bus].monitorDb ?? -Infinity,
  heardMonitorDb: (ctx, p) => channelOf(ctx.mix, p.source)?.aux[p.bus].heardDb ?? -Infinity,
  busDb: (ctx, p) => levelToDb(ctx.state[p.bus].level),
  mainDbByChannel: (ctx) => ctx.mix.channels.map((c) => Math.max(c.mainDb.L, c.mainDb.R)),
  sendDbByChannel: (ctx, p) => ctx.mix.channels.map((c) => (c.sourceId ? c.aux[p.bus].sendDb : -Infinity)),
  // A channel's own GAIN and fader (dB), for "fix only the fault" scenarios.
  channelSettings: (ctx, p) => {
    const ch = ctx.state.channels[ctx.sourcesById[p.source].order - 1];
    return { gainDb: ch.gainDb, faderDb: levelToDb(ch.level) };
  },
  // What each channel contributes to a wedge that actually makes sound.
  monitorByChannel: (ctx, p) => ctx.mix.channels.map((c) => c.aux[p.bus].heardDb),
};

export function captureBaseline(def, state, sourcesById = SOURCES_BY_ID, stems = STEMS) {
  const mix = computeMix(state, sourcesById, stems);
  const out = {};
  for (const [name, spec] of Object.entries(def.baseline || {})) out[name] = METRICS[spec.metric]({ state, mix, sourcesById }, spec);
  return out;
}

// ---------- conditions ----------

// Threshold for "you'd hear it": estimated peak at a speaker, dBFS.
export const AUDIBLE_DB = -45;
const OFF_DB = -60; // a send/contribution below this counts as off

// A source's channel by the source id it is patched from (null if unplugged).
const chanFor = (ctx, sourceId) => ctx.mix.channels.find((c) => c.sourceId === sourceId) || null;
// Index of the channel a source belongs on, whether or not it is plugged in.
const indexOf = (ctx, sourceId) => (ctx.sourcesById[sourceId] ? ctx.sourcesById[sourceId].order - 1 : -1);
const isWorking = (ch) => !!ch && ch.input.connected && ch.input.signal && ch.input.status === "ok";
const isGood = (ch) => isWorking(ch) && (ch.band === "good" || ch.band === "hot");

const usableChannels = (mix) => mix.channels.filter((c) => c.input.connected && c.input.signal && c.input.status === "ok");

const same = (a, b, tol) => (a === -Infinity && b === -Infinity) || (a <= OFF_DB && b <= OFF_DB) || Math.abs(a - b) <= tol;

export const CONDITIONS = {
  sourcesPatched(ctx, c) {
    const ids = new Set(usableChannels(ctx.mix).map((ch) => ch.sourceId));
    return { met: ids.size >= c.min, detail: `${ids.size} of ${c.min}` };
  },
  gainStaged(ctx, c) {
    const good = usableChannels(ctx.mix).filter((ch) => ch.band === "good" || ch.band === "hot");
    return { met: good.length >= c.min, detail: `${good.length} of ${c.min}` };
  },
  // `device`: a specific speaker (e.g. the drummer's passive wedge) must be the one on the chain.
  validChain(ctx, c) {
    const ports = c.output === "main" ? ["main-l", "main-r"] : [c.output];
    const ends = ctx.mix.rig.endpoints.filter((e) => e.valid && ports.includes(e.output) && (!c.zone || e.zone === c.zone) && (!c.device || e.deviceId === c.device));
    return { met: ends.length > 0 };
  },
  noBrokenChains(ctx, c) {
    const broken = ctx.mix.rig.endpoints.filter((e) => e.status !== "unpatched" && !e.valid && (!c.zone || e.zone === c.zone));
    return { met: broken.length === 0, detail: broken.length ? `${broken.length} broken` : undefined };
  },
  heardInMain(ctx, c) {
    const heard = usableChannels(ctx.mix).filter((ch) => (ch.band === "good" || ch.band === "hot") && ch.heardMainDb >= AUDIBLE_DB);
    return { met: heard.length >= c.min, detail: `${heard.length} of ${c.min}` };
  },
  // One named source: plugged in properly / gain in the Good band / heard through Main.
  // `stereo: true` also needs both sides (Main L and Main R) working and audible.
  sourcePatched(ctx, c) {
    return { met: isWorking(chanFor(ctx, c.source)) };
  },
  sourceGain(ctx, c) {
    return { met: isGood(chanFor(ctx, c.source)) };
  },
  sourceHeardInMain(ctx, c) {
    const ch = chanFor(ctx, c.source);
    if (!isGood(ch)) return { met: false };
    if (!c.stereo) return { met: ch.heardMainDb >= AUDIBLE_DB };
    const { buses } = ctx.mix.rig;
    const both = buses["main-l"].length > 0 && buses["main-r"].length > 0;
    return { met: both && ch.mainDb.L >= AUDIBLE_DB && ch.mainDb.R >= AUDIBLE_DB };
  },
  // Some channel is audible through a working chain on that bus.
  busAudible(ctx, c) {
    return { met: ctx.mix.channels.some((ch) => ch.aux[c.bus].heardDb >= AUDIBLE_DB) };
  },
  // A source's Main contribution dropped by at least `minDb` from the baseline.
  mainLowered(ctx, c) {
    const i = indexOf(ctx, c.source);
    const now = METRICS.mainDbByChannel(ctx)[i];
    const base = ctx.baseline[c.baseline][i];
    return { met: base - now >= c.minDb, detail: delta(now, base) };
  },
  // A channel's GAIN and fader are where they started ("fix only the fault").
  channelUnchanged(ctx, c) {
    const now = METRICS.channelSettings(ctx, c);
    const base = ctx.baseline[c.baseline];
    return { met: Math.abs(now.gainDb - base.gainDb) <= c.toleranceDb && same(now.faderDb, base.faderDb, c.toleranceDb) };
  },
  // Every listed source is at least `minDb` in the wedge (heard through a working chain).
  monitorPresent(ctx, c) {
    return { met: c.sources.every((id) => (chanFor(ctx, id)?.aux[c.bus].heardDb ?? -Infinity) >= c.minDb) };
  },
  // In the wedge (audible) but at least `byDb` quieter than each source in `below`.
  monitorLittle(ctx, c) {
    const heard = (id) => chanFor(ctx, id)?.aux[c.bus].heardDb ?? -Infinity;
    const mine = heard(c.source);
    return { met: mine >= AUDIBLE_DB && c.below.every((id) => mine <= heard(id) - c.byDb) };
  },
  // None of the listed sources is audible in the wedge.
  monitorAbsent(ctx, c) {
    return { met: c.sources.every((id) => (chanFor(ctx, id)?.aux[c.bus].heardDb ?? -Infinity) < AUDIBLE_DB) };
  },
  sendRaised(ctx, c) {
    const now = METRICS.sendDb(ctx, c);
    const base = ctx.baseline[c.baseline];
    return { met: now - base >= c.minDb, detail: delta(now, base) };
  },
  // Needs the student to have actually selected that listening position at
  // some point in this attempt (tracked by the app as session.listened).
  listenedTo(ctx, c) {
    const heard = ctx.session.listened ? ctx.session.listened.has(c.dest) : ctx.state.listen === c.dest;
    return { met: heard || ctx.state.listen === c.dest };
  },
  // `except`: a source that is allowed to change (the one the student is meant to adjust).
  monitorMixUnchanged(ctx, c) {
    const base = ctx.baseline[c.baseline];
    const skip = c.except ? indexOf(ctx, c.except) : -1;
    const now = METRICS.monitorByChannel(ctx, c);
    return { met: now.every((v, i) => i === skip || same(v, base[i], c.toleranceDb)) };
  },
  monitorRaised(ctx, c) {
    const now = METRICS.heardMonitorDb(ctx, c);
    const base = ctx.baseline[c.baseline];
    return { met: now - base >= c.minDb && now >= AUDIBLE_DB, detail: delta(now, base) };
  },
  mainUnchanged(ctx, c) {
    const base = ctx.baseline[c.baseline];
    const now = METRICS.mainDbByChannel(ctx);
    const skip = c.except ? indexOf(ctx, c.except) : -1;
    const moved = now.map((v, i) => i !== skip && !same(v, base[i], c.toleranceDb));
    return { met: !moved.some(Boolean), moved: moved.map((m, i) => (m ? i : -1)).filter((i) => i >= 0) };
  },
  masterRaised(ctx, c) {
    const now = levelToDb(ctx.state[c.bus].level);
    const base = ctx.baseline[c.baseline];
    return { met: now - base >= c.minDb, detail: delta(now, base) };
  },
  sendBalanceKept(ctx, c) {
    const base = ctx.baseline[c.baseline];
    const now = METRICS.sendDbByChannel(ctx, c);
    // Compare each send's change to the typical change: equal moves keep the balance.
    const deltas = [];
    let broken = false;
    now.forEach((v, i) => {
      const b = base[i];
      if (b <= OFF_DB) {
        if (v > OFF_DB) broken = true; // a new source crept into the mix
        return;
      }
      if (v <= OFF_DB) broken = true; // a source dropped out
      else deltas.push(v - b);
    });
    if (deltas.length) {
      const sorted = [...deltas].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (deltas.some((d) => Math.abs(d - median) > c.toleranceDb)) broken = true;
    }
    return { met: !broken };
  },
};

function delta(now, base) {
  if (now === -Infinity) return "off";
  if (base === -Infinity) return "new";
  const d = now - base;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} dB`;
}

// session: facts about this attempt that aren't mixer state, e.g.
// { listened: Set of listen destinations the student has selected }.
export function evaluateScenario(def, state, baseline = {}, sourcesById = SOURCES_BY_ID, stems = STEMS, session = {}) {
  const mix = computeMix(state, sourcesById, stems);
  const ctx = { state, mix, baseline, sourcesById, session };
  const items = def.conditions.map((c) => {
    const fn = CONDITIONS[c.type];
    const r = fn ? fn(ctx, c) : { met: false, detail: `unknown condition ${c.type}` };
    return { id: c.id, kind: c.kind, label: c.label, ...r };
  });
  return { items, complete: items.length > 0 && items.every((i) => i.met), mix };
}

// Fill {aux}-style placeholders from a skin's terminology.
export function fillTerms(text, terms) {
  return text ? text.replace(/\{(\w+)\}/g, (m, k) => terms[k] ?? m) : text;
}

// Sanity check used by tests: every device type named in setups exists.
export function validateScenarios() {
  const problems = [];
  for (const s of SCENARIOS) {
    for (const d of s.setup.devices) if (!PLAYBACK_DEVICES[d] || !DEVICE_TYPES[PLAYBACK_DEVICES[d].type]) problems.push(`${s.id}: device ${d}`);
    for (const c of s.conditions) if (!CONDITIONS[c.type]) problems.push(`${s.id}: condition ${c.type}`);
    for (const c of s.conditions) if (c.baseline && !(s.baseline && s.baseline[c.baseline])) problems.push(`${s.id}: baseline ${c.baseline}`);
  }
  return problems;
}
