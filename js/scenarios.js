// Scenarios are data: a setup (rig + mixer values), named baselines captured
// at the start, and declarative conditions evaluated from state + computed
// signal flow. Nothing here knows which skin is showing, and no condition is
// ever satisfied by a "done" button. See docs/SCENARIOS.md.

import { SONG, SOURCES_BY_ID, STEMS, sourcesForScenario } from "../audio/source-manifest.js";
import { CABLES, DEVICE_TYPES, analyzeRig, cableEndFor, channelPortRef, getPort, plugFitsJack } from "./connection-model.js";
import { BUSES, CHANNEL_LAYOUT, computeMix, createMixerState, dbToLevel, levelToDb, clamp, listenGroupOf, sourcePeakDb } from "./mixer-state.js";
import * as CR1604 from "./cr1604.js";
import { createF8, createPair, createReverb } from "./devices.js";
import { createDaw } from "./dante.js";
import { COMPACT, LAWS as COMPACT_LAWS, channelGainDb, compactModel, levelLaw } from "./compact.js";
import { BOARD_SCENARIOS, MIXER_ORDER } from "./board-scenarios.js";
const LAWS_LEVEL = COMPACT_LAWS.level;

export { MIXER_ORDER };

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
// The Vocal Jazz Ensemble's eleven handhelds (vj-1 … vj-11), all at one send.
const VJ_SENDS = (db) => Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`vj-${i + 1}`, db]));
const REVERB_SENDS = { "lead-vocal": -6, "backing-vocals": -10, "harmony-vocal": -10, trumpets: -14, strings: -14, winds: -16, brass: -16 };

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
  closet: { type: "passive-speaker", label: "Passive speaker from the closet · singer's wedge", short: "closet speaker", zone: "stage", pan: 0 },
  pwedge: { type: "passive-speaker", label: "Passive wedge · drummer", short: "drummer's wedge", zone: "stage", pan: 0 },
  // A third wedge, for scenarios that build a new monitor mix (Ui16 AUX 3).
  gwedge: { type: "powered-speaker", label: "Powered wedge · guitarist", short: "guitarist's wedge", zone: "stage", pan: -0.5 },
  ffill: { type: "powered-speaker", label: "Powered speaker · front fill", short: "front fill", zone: "foh", pan: 0 },
  hwedge: { type: "powered-speaker", label: "Powered wedge · horns", short: "horns' wedge", zone: "stage", pan: 0.4 },
  // A second B207MP3 on stage as a wedge, fed into its MAIN IN from the first one's THRU.
  "b207-wedge": { type: "powered-speaker", label: "Second B207MP3 · MAIN IN, as the singer's wedge", short: "2nd B207 (wedge)", zone: "stage", pan: 0 },
  sub: { type: "powered-speaker", label: "Powered subwoofer", short: "subwoofer", zone: "foh", pan: 0 },
  // The COB gig in Irvine: an SD8 on the stage floor carries the X32 Compact's
  // outputs; a STAGEPAS 600BT is the mains' amp; three B207MP3 wedges share one
  // mix down a THRU chain along the front row.
  sb: { type: "sd8", label: "SD8 · stage floor" },
  stagepas: { type: "stagepas-amp", label: "STAGEPAS 600BT (amp)" },
  "sp6-l": { type: "passive-speaker", label: "STAGEPAS speaker L", short: "main left", zone: "foh", pan: -1 },
  "sp6-r": { type: "passive-speaker", label: "STAGEPAS speaker R", short: "main right", zone: "foh", pan: 1 },
  "cob-w1": { type: "b207-speaker", label: "B207 wedge 1 (left)", short: "wedge 1 (left)", zone: "stage", pan: -0.6 },
  "cob-w2": { type: "b207-speaker", label: "B207 wedge 2 (center)", short: "wedge 2 (center)", zone: "stage", pan: 0 },
  "cob-w3": { type: "b207-speaker", label: "B207 wedge 3 (right)", short: "wedge 3 (right)", zone: "stage", pan: 0.6 },
  // Vocal Jazz in Salmon Recital Hall: an S32 in the stage-side rack on AES50,
  // the NX3000 in the monitor amp rack driving three passive wedges down one
  // speakON chain, and the hall's mains (simplified: a power amp and two passive
  // speakers on MAIN L/R; the real path through the mains rack isn't modelled).
  s32: { type: "s32", label: "S32 · stage-side rack" },
  nx3000: { type: "nx3000", label: "NX3000 · monitor amp rack" },
  "vj-w1": { type: "passive-wedge", label: "Wedge 1 (left)", short: "wedge 1 (left)", zone: "stage", pan: -0.6 },
  "vj-w2": { type: "passive-wedge", label: "Wedge 2 (center)", short: "wedge 2 (center)", zone: "stage", pan: 0 },
  "vj-w3": { type: "passive-wedge", label: "Wedge 3 (right)", short: "wedge 3 (right)", zone: "stage", pan: 0.6 },
  "mains-amp": { type: "power-amp", label: "Mains amp · mains rack" },
  // The electroacoustic showcase: an SD8 on the far side of the stage, chained off the S32's AES50 B, and the bass clarinetist's wedge.
  "ea-sd8": { type: "sd8", label: "SD8 · far side of the stage" },
  "ea-perf": { type: "powered-speaker", label: "Powered wedge · bass clarinetist", short: "performer's wedge", zone: "stage", pan: 0.4 },
  "hall-l": { type: "passive-speaker", label: "Hall main L", short: "hall left", zone: "foh", pan: -1 },
  "hall-r": { type: "passive-speaker", label: "Hall main R", short: "hall right", zone: "foh", pan: 1 },
  // BH 109, the choir room: the room's rack (AUX AUDIO INPUT → the Ashly LX-308B's Ch.1 → a Crown XLi 2500) and its two passive wall speakers.
  "bh109-rack": { type: "bh109-rack", label: "BH 109 rack · Ashly Ch.1 → Crown amp" },
  "bh109-l": { type: "wall-speaker", label: "Wall speaker · left", short: "left wall speaker", zone: "foh", pan: -1 },
  "bh109-r": { type: "wall-speaker", label: "Wall speaker · right", short: "right wall speaker", zone: "foh", pan: 1 },
  lobby: { type: "powered-speaker", label: "Powered speaker · lobby", short: "lobby", zone: "lobby", pan: 0 },
  // A video camera's two XLR audio inputs (each with a MIC/LINE switch, starting at LINE).
  "cam-1": { type: "camera-input", label: "Camera · input 1 (XLR)", short: "camera ch 1", zone: "cam", pan: -1, inputLevel: 1 },
  "cam-2": { type: "camera-input", label: "Camera · input 2 (XLR)", short: "camera ch 2", zone: "cam", pan: 1, inputLevel: 1 },
  daw: { type: "daw-dvs", label: "Laptop · DAW + Dante Virtual Soundcard", short: "DAW laptop", init: createDaw },
  dslr: { type: "dslr-input", label: "Second camera · 3.5 mm mic input", short: "camera B", zone: "cam", pan: 0, inputLevel: 0 },
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
    stage: { silent: true }, // doors: the band isn't on stage yet
    number: 1,
    title: "Preshow music",
    who: "Stage manager",
    prompt: "“Doors open soon and the room is silent. Get the preshow music from the laptop playing through the house speakers.”",
    goal: "Nothing is plugged in yet: start in Stage & patch. The laptop's stereo music heard from both house speakers (Main L and Main R).",
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
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "preshow", stereo: true, explain: true, label: "The music comes out of both house speakers, left and right" },
      { id: "chain", kind: "keep", type: "validChain", output: "main", zone: "foh", label: "The house speakers keep working" },
    ],
    hints: [
      "Start at the source, in Stage & patch. A laptop's headphone jack is one 3.5 mm plug carrying two signals, left and right. Which mixer input takes a left/right pair?",
      "Input 9/10 is the stereo line input: two 1/4″ jacks, L and R. Which cable turns one 3.5 mm plug into two 1/4″ plugs? Once it's in, check the input meter: a laptop is already line level, so it needs little or no GAIN.",
      "Patched and reading Good, but still silent? Follow the 9/10 strip down: its {level} decides how much reaches {main}. The house speakers are powered and already patched, so no amplifier is needed.",
    ],
    complete: "Stereo in, stereo out: one 9/10 strip carries left and right, so the music reaches both house speakers. A laptop is a line-level source: no mic preamp, no +48 V. Phantom power only feeds condenser mics; the house speakers get their power from the wall.",
    quiz: {
      q: "Which of these needs phantom power (+48 V)?",
      options: ["The powered house speakers", "A condenser mic", "The laptop"],
      answer: 1,
      why: "Phantom travels from the mixer up an XLR cable to a condenser mic. Powered speakers plug into the wall, and a laptop has its own battery.",
    },
  },
  {
    id: "build-rig",
    number: 2,
    title: "Get the band into the house",
    who: "Band leader",
    prompt: "“Soundcheck. Get at least two of us into the house speakers so the audience can hear the band.”",
    goal: "Two band sources patched, gain-staged and heard through the house speakers ({main} L/R).",
    music: "excerpt", // any two sources: everyone has to be playing
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
    complete: "Source → preamp (GAIN) → channel ({level}) → {main} → speakers. GAIN sets how hot the signal is going into the mixer; the {level} sets how much of it goes to the house. +48 V is only for the condenser mic: it goes up the mic cable, never out to the speakers.",
  },
  {
    id: "find-amp",
    song: "nostradamus",
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
    complete: "The mixer already puts out line level; the amp's job is to raise that to speaker level, strong enough to move a passive speaker's cone. So it sits between them: mixer line output → amp input → amp speaker output → passive speaker. A powered speaker just has that amp built in.",
    quiz: {
      q: "What does the power amp do to the mixer's signal?",
      options: ["Raises mic level to line level", "Raises line level to speaker level", "Adds phantom power for the speaker"],
      answer: 1,
      why: "The mixer's preamps already brought every mic up to line level. The power amp takes that line-level mix and makes it strong enough to drive a speaker.",
    },
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
    song: "nostradamus",
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
    complete: "The same amplifier rule as the house: the {aux2} output is already line level, and the power amp raises it to speaker level for the passive wedge. Only then does the drummer hear the mix.",
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
    song: "nostradamus",
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
    song: "nostradamus",
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
      // Every band: Persephone's keys and trumpets, NOSTRADAMUS's extra guitars, harmony and pads, FTW's sections and synths, the Vocal Jazz Ensemble's handhelds.
      sends: {
        aux1: { drums: -10, bass: -6, guitars: -6, keys: -5, trumpets: -12, "backing-vocals": -4, "lead-vocal": 0, "lead-guitar": -8, "bridge-guitar": -10, "harmony-vocal": -4, pads: -12, percussion: -14, strings: -10, winds: -12, brass: -14, synths: -10, ...VJ_SENDS(-6) },
        aux2: { drums: -2, bass: 0, guitars: -6, keys: -8, trumpets: -12, "backing-vocals": -8, "lead-vocal": -3, "lead-guitar": -8, "bridge-guitar": -10, "harmony-vocal": -10, pads: -14, percussion: -6, strings: -14, winds: -16, brass: -14, synths: -12, ...VJ_SENDS(-10) },
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
    }[s.id] ||
    s.short ||
    s.title
  );
}

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

// The numbered scenarios (the Canvas assignment) are written for the generic
// mixer (Mixer A / Mixer B). A real mixer has its own practice scenarios
// (js/board-scenarios.js), numbered within that mixer, plus Free play.
export const scenariosFor = (model = "generic") => (model !== "generic" ? [...(BOARD_SCENARIOS[model] || []), SCENARIOS_BY_ID["free-play"]] : SCENARIOS);
export const ALL_BOARD_SCENARIOS = Object.values(BOARD_SCENARIOS).flat();

// ---------- building a scenario's starting state ----------

export function buildScenarioState(def, sourcesById = SOURCES_BY_ID, model = "generic") {
  if (def.board) return buildBoardState(def, sourcesById, model);
  if (model === "cr1604") return buildCr1604State(def, sourcesById);
  if (COMPACT[model]) return buildCompactState(model, sourcesById);
  const state = createMixerState();
  const setup = def.setup;
  // A source whose input number has no matching strip (the Vocal Jazz
  // Ensemble's mics 9–11 on Mixer A/B) stays on stage, unplugged.
  const fits = (s) => !!CHANNEL_LAYOUT[s.order - 1] && !!CHANNEL_LAYOUT[s.order - 1].stereo === !!s.stereo;
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
      if (!fits(s)) continue;
      addCable({ from: `${sourceDeviceId(s.id)}/out`, to: channelPortRef(s.order - 1), cable: defaultCableFor(s) });
    }
  }
  for (const c of setup.cables || []) addCable(c);

  if (setup.channels === "mixed") {
    for (const s of sources.filter(fits)) {
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

// ---------- a real mixer's own scenarios ----------

// A board scenario starts from that mixer's Free play gig, then its setup
// `tweak(state, h)` makes the problem (unplugs something, mutes a channel,
// moves a fader), using the helpers below. js/board-scenarios.js.
function buildBoardState(def, sourcesById, model) {
  const state = model === "cr1604" ? buildCr1604State(SCENARIOS_BY_ID["free-play"], sourcesById) : buildCompactState(model, sourcesById);
  if (def.setup.tweak) def.setup.tweak(state, boardHelpers(state, model, sourcesById));
  if (def.setup.listen) state.listen = def.setup.listen;
  return state;
}

function setPath(obj, key, value) {
  const path = key.split(".");
  const k = path.pop();
  path.reduce((o, p) => o[p], obj)[k] = value;
}

export function boardHelpers(state, model, sourcesById = SOURCES_BY_ID) {
  const def = COMPACT[model];
  const faderLaw = model === "cr1604" ? CR1604.LAWS.fader : levelLaw(def);
  const sendLaw = (sid) => (model === "cr1604" ? CR1604.LAWS.send : COMPACT_LAWS[def.sends[sid].law]);
  const rig = () => analyzeRig(state.rig, state.channels, sourcesById);
  const idx = (src) => rig().channels.findIndex((c) => c && c.sourceId === src);
  const ch = (src) => state.channels[idx(src)];
  let n = 0;
  const h = {
    idx,
    ch,
    set: (src, key, value) => setPath(ch(src), key, value),
    faderDb: (src, db) => (ch(src).level = faderLaw.toPos(db)),
    moveFader: (src, dDb) => (ch(src).level = faderLaw.toPos(faderLaw.toDb(ch(src).level) + dDb)),
    sendDb: (src, sid, db) => {
      const c = ch(src);
      if (model === "cr1604") c.auxSends[sid] = sendLaw(sid).toPos(db);
      else c.sends[sid] = sendLaw(sid).toPos(db);
    },
    bus: (name, key, value) => (state[name][key] = value),
    dev: (id, key, value) => (state.rig.devices.find((d) => d.id === id)[key] = value),
    // Pull every cable on a port ("mixer/aux1", "sp-l/in").
    cut: (ref) => (state.rig.cables = state.rig.cables.filter((c) => c.from !== ref && c.to !== ref)),
    unplug: (src) => {
      const info = rig().channels[idx(src)];
      if (info) h.cut(info.fromPort);
    },
    cable: (from, to, cable) => state.rig.cables.push({ id: `t${++n}`, from, to, cable }),
    addGear: (kind) => state.rig.devices.push(STAGE_GEAR[kind]()),
    addDevice: (id) => {
      const d = PLAYBACK_DEVICES[id];
      state.rig.devices.push({ id, type: d.type, label: d.label, short: d.short, zone: d.zone, pan: d.pan, ...(d.init ? d.init() : {}) });
    },
    // Put the band on a stage box: every source on a console channel moves to the
    // box's input of the same number. A digital box (S32, SD8) gets its Cat5 to the
    // console's AES50 A and, with `routed`, the input blocks it feeds set to AES50-A;
    // `stageOuts` moves the stage feeds (wedges, the amp) onto its outputs.
    // An analog snake keeps the console patch: source → snake IN n, tail n → the same jack.
    stagebox: (type, { routed = true, linked = true, stageOuts = true } = {}) => {
      const id = type === "snake" ? "snake" : "sb";
      state.rig.devices.push({ id, type, label: DEVICE_TYPES[type].name });
      const mixer = state.rig.devices.find((d) => d.id === "mixer");
      const ports = DEVICE_TYPES[mixer.type].ports;
      const onStage = (c) => state.rig.devices.find((d) => `${d.id}/` === c.from.slice(0, d.id.length + 1))?.type !== "stereo-mic-pair"; // the room pair stands at FOH
      const into = state.rig.cables.filter((c) => onStage(c) && ports.some((p) => `mixer/${p.id}` === c.to && p.role === "channel-input" && !p.stereo && p.channel < (type === "snake" ? 16 : DEVICE_TYPES[type].ports.filter((q) => q.role === "sb-in").length)));
      for (const c of into) {
        const ch = ports.find((p) => `mixer/${p.id}` === c.to).channel;
        if (type === "snake") {
          // Keys and other line outs reach the snake's XLR on an XLR ↔ 1/4" cable, and the tail does the same into a LINE jack.
          const inCable = getPort(state.rig, c.from).jack === "xlr" ? "xlr" : "xlr-trs";
          const tailCable = getPort(state.rig, c.to).jack === "quarter" ? "xlr-trs" : "xlr";
          state.rig.cables.push({ id: `t${++n}`, from: `snake/tail${ch + 1}`, to: c.to, cable: tailCable });
          c.to = `snake/in${ch + 1}`;
          c.cable = inCable;
        } else {
          c.to = `${id}/in${ch + 1}`;
          if (routed) mixer.inSource[Math.floor(ch / 8)] = 1;
        }
      }
      if (type === "snake") return;
      if (linked) state.rig.cables.push({ id: `t${++n}`, from: `${id}/aes50a`, to: "mixer/aes50a", cable: "cat5" });
      if (!stageOuts) return;
      // Wedges and the amp live on stage: plug them into the box's output with the same number.
      const outs = ports.filter((q) => q.role === "bus-out" && q.jack === "xlr" && !q.panel && q.channel === undefined).map((q) => `mixer/${q.id}`);
      const sbOuts = DEVICE_TYPES[type].ports.filter((q) => q.role === "sb-out").length;
      for (const c of state.rig.cables) {
        const k = outs.indexOf(c.from);
        const dev = state.rig.devices.find((d) => `${d.id}/` === c.to.slice(0, d.id.length + 1));
        if (k < 0 || k >= sbOuts || !(dev?.zone === "stage" || DEVICE_TYPES[dev?.type]?.poweramp)) continue;
        c.from = `${id}/out${k + 1}`;
      }
    },
  };
  return h;
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
  b207mp3: {
    prompt: "A coffee-house set on one Behringer B207MP3: the box is the speaker, the amp and the mixer. The singer on 1, the backing singer on 2, the keys on 3, the laptop on the CD INPUT (level down). THRU feeds a second B207 on stage as the singer's wedge.",
    patch: { "lead-vocal": [0, "in"], "backing-vocals": [1, "in"], keys: [2, "in"], preshow: [3, "rca"] },
    devices: ["b207-wedge"],
    cables: [{ from: "mixer/thru", to: "b207-wedge/in", cable: "xlr" }],
    sends: {},
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
    prompt: "The band on a Behringer Xenyx QX1204USB: both vocals, guitar and bass on the four mic channels, keys on 5/6, the laptop on 7/8 (switched to −10 dBV, level down). AUX 1, with PRE pressed on each channel, feeds the singer's wedge; the FX send feeds the built-in effects, which come back on RETURN 2. The lead vocal has a little COMP.",
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
  l20: {
    prompt: "The whole band on a Zoom LiveTrak L-20: guitar and bass on the Hi-Z inputs 1–2, drums on 3, both vocals on 4 and 5, keys on 6 (PAD on, it is line level), trumpets on 7, the laptop on 17/18 (level down). MASTER OUT feeds the house speakers. MONITOR OUT A is the singer's wedge and B the guitarist's: each is its own mix on FADER MODE A and B. EFX 1 (hall) is on the vocals.",
    patch: { guitars: [0, "in"], bass: [1, "in"], drums: [2, "in"], "backing-vocals": [3, "in"], "lead-vocal": [4, "in"], keys: [5, "in"], trumpets: [6, "in"], preshow: [16, "lr"] },
    padFor: ["keys"],
    devices: ["spk-l", "spk-r", "wedge", "gwedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/outA", to: "wedge/in", cable: "trs" },
      { from: "mixer/outB", to: "gwedge/in", cable: "trs" },
    ],
    sends: {
      monA: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      monB: { guitars: -2, bass: -4, "lead-vocal": -8, drums: -8, keys: -10 },
      fx1: { "lead-vocal": -6, "backing-vocals": -8 },
    },
  },
  f8n: {
    prompt: "Filming the band with a Zoom F8n Pro as the recorder and camera mixer: drums, bass, guitar, keys, backing vocal and lead vocal on inputs 1–6, the room pair on 7/8 (Stereo Link, +48V). Every input records its own track; the track knobs build the L/R mix. MAIN OUT 1/2 (LINE) feed the main camera's two XLR inputs, SUB OUT (MIC level) the second camera's 3.5 mm mic jack. Listen in the HEADPHONE, or at either camera. The trumpets aren't on the recorder.",
    patch: { drums: [0, "in"], bass: [1, "in"], guitars: [2, "in"], keys: [3, "in"], "backing-vocals": [4, "in"], "lead-vocal": [5, "in"], "room-l": [6, "in"], "room-r": [7, "in"] },
    extraSources: ["room-l", "room-r"],
    cableFor: { keys: "xlr-trs" },
    devices: ["cam-1", "cam-2", "dslr"],
    cables: [
      { from: "mixer/out1", to: "cam-1/in", cable: "xlr" },
      { from: "mixer/out2", to: "cam-2/in", cable: "xlr" },
      { from: "mixer/sub-out", to: "dslr/in", cable: "mini" },
    ],
    sends: {},
    link: "on",
    hpf: { "lead-vocal": 0.25, "backing-vocals": 0.25 },
    listen: "phones",
  },
  ui16: {
    prompt: "The whole band on a Soundcraft Ui16 digital mixer: drums, bass, guitar, keys, trumpets and both vocals on inputs 1–7, the laptop on the RCA line in (13/14, level down). AUX 1 feeds the singer's powered wedge, AUX 2 the drummer's wedge through the power amp; REVERB and DELAY are built in. Pick a mix in the bar above the faders, and SEL a channel to edit it.",
    patch: { drums: [0, "in"], bass: [1, "in"], guitars: [2, "in"], keys: [3, "in"], trumpets: [4, "in"], "backing-vocals": [5, "in"], "lead-vocal": [6, "in"], preshow: [12, "rca"] },
    devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/aux1", to: "wedge/in", cable: "xlr" },
      { from: "mixer/aux2", to: "amp/in-a", cable: "xlr" },
      { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
    ],
    sends: {
      aux1: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      aux2: { drums: -8, bass: -3, keys: -12, "lead-vocal": -8 },
      fx1: { "lead-vocal": -10, "backing-vocals": -12, trumpets: -14, keys: -18 },
      fx2: { "lead-vocal": -18 },
    },
    hpf: { guitars: 0.12, trumpets: 0.12, "backing-vocals": 0.15, "lead-vocal": 0.15, keys: 0.05 },
    dyn: { "lead-vocal": { threshold: -16, ratio: 3, makeup: 3 }, bass: { threshold: -14, ratio: 4, makeup: 3 } },
  },
  gdig: {
    prompt: "The whole band on a generic digital mixer: inputs 1–7 on the CH 1-8 layer, the laptop on AUX 1/2 (the AUX / FX layer, fader down). MIX 1 (XLR OUT 1) feeds the singer's wedge, MIX 2 (XLR OUT 2) the drummer's wedge through the amp, MAIN comes out of XLR OUT 5/6. FX 1 is a hall reverb, FX 2 a delay. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], keys: [3, "mic"], trumpets: [4, "mic"], "backing-vocals": [5, "mic"], "lead-vocal": [6, "mic"], preshow: [16, "lr"] },
    cableFor: { keys: "xlr-trs" }, // the stage piano's 1/4" out into an XLR input
    devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/mix1", to: "wedge/in", cable: "xlr" },
      { from: "mixer/mix2", to: "amp/in-a", cable: "xlr" },
      { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
    ],
    sends: {
      mix1: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      mix2: { drums: -8, bass: -3, keys: -12, "lead-vocal": -8 },
      fx1: { "lead-vocal": -10, "backing-vocals": -12, trumpets: -14 },
      fx2: { "lead-vocal": -20 },
    },
    preFor: ["mix1", "mix2"], // the wedge mixes are pre-fader
    hpf: { guitars: 0.1, trumpets: 0.1, "backing-vocals": 0.15, "lead-vocal": 0.15 },
    dyn: { "lead-vocal": { threshold: -16, ratio: 3, makeup: 3 } },
  },
  x32c: {
    prompt: "The whole band on a Behringer X32 Compact: inputs 1–7 on the CH 1-8 layer, the laptop on AUX IN 1/2 (the AUX/FX layer, fader down). MIX 1 (XLR OUT 1) feeds the singer's wedge, MIX 2 (XLR OUT 2) the drummer's wedge through the amp, MAIN LR comes out of XLR OUT 7/8. FX 1 is a hall reverb, FX 2 a delay. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], keys: [3, "mic"], trumpets: [4, "mic"], "backing-vocals": [5, "mic"], "lead-vocal": [6, "mic"], preshow: [16, "lr"] },
    cableFor: { keys: "xlr-trs" }, // the stage piano's 1/4" out into an XLR input
    devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/mix1", to: "wedge/in", cable: "xlr" },
      { from: "mixer/mix2", to: "amp/in-a", cable: "xlr" },
      { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
    ],
    sends: {
      mix1: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      mix2: { drums: -8, bass: -3, keys: -12, "lead-vocal": -8 },
      fx1: { "lead-vocal": -10, "backing-vocals": -12, trumpets: -14 },
      fx2: { "lead-vocal": -20 },
    },
    preFor: ["mix1", "mix2"], // the wedge mixes are pre-fader
    hpf: { guitars: 0.1, trumpets: 0.1, "backing-vocals": 0.15, "lead-vocal": 0.15 },
    dyn: { "lead-vocal": { threshold: -16, ratio: 3, makeup: 3 } },
  },
  x32: {
    prompt: "The whole band on a full-size Behringer X32: inputs 1–7 on the CH 1-16 layer, the room pair on 17 and 18 (CH 17-32), the laptop on AUX IN 1/2 (fader down). XLR OUT 1 carries MIX 1 to the singer's wedge, OUT 2 MIX 2 to the drummer's amp and wedge, OUT 15/16 MAIN L/R to the house: see the ROUTING page. MIX 13–15 feed the FX rack (room, plate, delay). Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], keys: [3, "mic"], trumpets: [4, "mic"], "backing-vocals": [5, "mic"], "lead-vocal": [6, "mic"], "room-l": [16, "mic"], "room-r": [17, "mic"], preshow: [32, "lr"] },
    extraSources: ["room-l", "room-r"],
    cableFor: { keys: "xlr-trs" },
    devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
    cables: [
      { from: "mixer/out15", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/out16", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/out1", to: "wedge/in", cable: "xlr" },
      { from: "mixer/out2", to: "amp/in-a", cable: "xlr" },
      { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
    ],
    sends: {
      mix1: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      mix2: { drums: -8, bass: -3, keys: -12, "lead-vocal": -8 },
      mix13: { "lead-vocal": -12, "backing-vocals": -12, drums: -18 },
      mix14: { trumpets: -12, "backing-vocals": -14 },
      mix15: { "lead-vocal": -22 },
    },
    preFor: ["mix1", "mix2"],
    pans: { "room-l": -1, "room-r": 1 },
    hpf: { guitars: 0.1, trumpets: 0.1, "backing-vocals": 0.15, "lead-vocal": 0.15 },
    dyn: { "lead-vocal": { threshold: -16, ratio: 3, makeup: 3 } },
    // Scene 1 is the gig as it stands; scene 2 the acoustic set (drums, bass and trumpets off, room mics up).
    scenes: [
      { name: "Full band" },
      {
        name: "Acoustic set",
        tweak: (st) => {
          for (const i of [0, 1, 4]) st.channels[i].enabled = false;
          for (const i of [16, 17]) st.channels[i].level = LAWS_LEVEL.toPos(-4);
          st.mix13.level = LAWS_LEVEL.toPos(4);
        },
      },
    ],
  },
  cl3: {
    prompt: "The whole band on a Yamaha CL3: the mics plug into a Rio3224-D stage box (Rio IN 1–7 feed channels 1–7, the room pair 17 and 18), the laptop into OMNI IN 1/2 on ST IN 1 (fader down). The OUTPUT PATCH sends MIX 1 to Rio OUT 1 (the singer's wedge), MIX 2 to Rio OUT 2 (the drummer's amp and wedge) and STEREO to Rio OUT 15/16 (the house). MIX 13–15 feed the effects rack, back on ST IN 2–4. SEL a channel and use the touch screen: OVERVIEW and SELECTED CHANNEL. Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], keys: [3, "mic"], trumpets: [4, "mic"], "backing-vocals": [5, "mic"], "lead-vocal": [6, "mic"], "room-l": [16, "mic"], "room-r": [17, "mic"], preshow: [32, "lr"] },
    extraSources: ["room-l", "room-r"],
    cableFor: { keys: "xlr-trs" },
    devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
    cables: [
      { from: "mixer/out15", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/out16", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/out1", to: "wedge/in", cable: "xlr" },
      { from: "mixer/out2", to: "amp/in-a", cable: "xlr" },
      { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
    ],
    sends: {
      mix1: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      mix2: { drums: -8, bass: -3, keys: -12, "lead-vocal": -8 },
      mix13: { "lead-vocal": -12, "backing-vocals": -12, drums: -18 },
      mix14: { trumpets: -12, "backing-vocals": -14 },
      mix15: { "lead-vocal": -22 },
    },
    preFor: ["mix1", "mix2"],
    pans: { "room-l": -1, "room-r": 1 },
    hpf: { guitars: 0.1, trumpets: 0.1, "backing-vocals": 0.15, "lead-vocal": 0.15 },
    dyn: { "lead-vocal": { threshold: -16, ratio: 3, makeup: 3 } },
    scenes: [
      { name: "Full band" },
      {
        name: "Acoustic set",
        tweak: (st) => {
          for (const i of [0, 1, 4]) st.channels[i].enabled = false;
          for (const i of [16, 17]) st.channels[i].level = LAWS_LEVEL.toPos(-4);
          st.mix13.level = LAWS_LEVEL.toPos(4);
        },
      },
    ],
  },
  dm2000: {
    prompt: "The whole band on a Yamaha DM2000: inputs 1–7 on the top-panel analog inputs (the piano into channel 4's TRS jack with its PAD on), the laptop on 2TR IN, channel 89/90 (layer 73-96, fader down). STEREO OUT feeds the house. The OUTPUT PATCH puts AUX 1 on OMNI OUT 1 (the singer's wedge) and AUX 2 on OMNI OUT 2 (the drummer's amp and wedge). AUX 7 feeds the reverb (back on CH 73/74), AUX 8 the delay (CH 75/76). BUS 1–8 are empty. SEL a channel: the SELECTED CHANNEL section and the display follow it. Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], keys: [3, "line"], trumpets: [4, "mic"], "backing-vocals": [5, "mic"], "lead-vocal": [6, "mic"], preshow: [24, "lr"] },
    padFor: ["keys"],
    devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/out1", to: "wedge/in", cable: "xlr-trs" },
      { from: "mixer/out2", to: "amp/in-a", cable: "xlr-trs" },
      { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
    ],
    sends: {
      aux1: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      aux2: { drums: -8, bass: -3, keys: -12, "lead-vocal": -8 },
      aux7: { "lead-vocal": -10, "backing-vocals": -12, trumpets: -14 },
      aux8: { "lead-vocal": -20 },
    },
    preFor: ["aux1", "aux2"],
    dyn: { "lead-vocal": { threshold: -16, ratio: 3, makeup: 3 } },
    scenes: [
      { name: "Full band" },
      {
        name: "Acoustic set",
        tweak: (st) => {
          for (const i of [0, 1, 4]) st.channels[i].enabled = false;
          st.aux7.level = LAWS_LEVEL.toPos(4);
        },
      },
    ],
  },
  yam01v96: {
    prompt: "The whole band on a Yamaha 01V96i: inputs 1–7 (the piano into channel 4's TRS jack with its PAD on), the laptop on 2TR IN (not yet in the mix). AUX 1 (OMNI OUT 1) feeds the singer's wedge, AUX 2 (OMNI OUT 2) the drummer's wedge through the amp, STEREO OUT the house. AUX 7 feeds the reverb (back on ST IN 1), AUX 8 the delay (ST IN 2). FADER MODE turns the faders into an aux's sends; SEL a channel and page through the display.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], keys: [3, "line"], trumpets: [4, "mic"], "backing-vocals": [5, "mic"], "lead-vocal": [6, "mic"], preshow: ["tape"] },
    padFor: ["keys"],
    devices: ["spk-l", "spk-r", "wedge", "amp", "pwedge"],
    cables: [
      { from: "mixer/main-l", to: "spk-l/in", cable: "xlr" },
      { from: "mixer/main-r", to: "spk-r/in", cable: "xlr" },
      { from: "mixer/aux1", to: "wedge/in", cable: "xlr" },
      { from: "mixer/aux2", to: "amp/in-a", cable: "xlr" },
      { from: "amp/out-a", to: "pwedge/in", cable: "speaker" },
    ],
    sends: {
      aux1: { "lead-vocal": 0, "backing-vocals": -6, keys: -10, guitars: -12 },
      aux2: { drums: -8, bass: -3, keys: -12, "lead-vocal": -8 },
      aux7: { "lead-vocal": -10, "backing-vocals": -12, trumpets: -14 },
      aux8: { "lead-vocal": -20 },
    },
    preFor: ["aux1", "aux2"],
  },
};

// The same gigs with NOSTRADAMUS on stage: the parts both bands have stay on
// the same channels, so a scenario's hints hold for either song; the extra
// guitars, the harmony mic and the pads laptop take the channels Persephone's
// keys, trumpets and preshow laptop had, where they fit. Each entry replaces
// those keys of the Persephone gig.
const NOS_VOX_FX = { "lead-vocal": -10, "backing-vocals": -12, "harmony-vocal": -12 };
const NOS_HPF = { guitars: 0.1, "lead-guitar": 0.1, "bridge-guitar": 0.1, "backing-vocals": 0.15, "lead-vocal": 0.15, "harmony-vocal": 0.15 };
const NOS_DESK_PATCH = { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], "lead-guitar": [3, "mic"], "bridge-guitar": [4, "mic"], "backing-vocals": [5, "mic"], "lead-vocal": [6, "mic"], "harmony-vocal": [7, "mic"] };
const NOS_WEDGES = (a, b) => ({
  [a]: { "lead-vocal": 0, "backing-vocals": -6, "harmony-vocal": -6, guitars: -12 },
  [b]: { drums: -8, bass: -3, "lead-vocal": -8, guitars: -12 },
});
const NOSTRADAMUS_GIGS = {
  mix8: {
    prompt: "A duo set from NOSTRADAMUS on a Mackie Mix8: two mic channels (lead and backing vocal), the pads laptop on stereo channel 3/4. The rest of the band has no channel left. The singer's wedge is on the AUX send, which on this mixer is post-fader.",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], pads: [2, "lr"] },
    sends: { aux: { "lead-vocal": 0, "backing-vocals": -8, pads: -12 } },
  },
  vlz1202: {
    prompt: "NOSTRADAMUS on a Mackie 1202-VLZ: drums, bass and two vocals on the four mic channels, the pads laptop on 5/6. The guitars and the harmony mic have no channel left. AUX 1 (switched to PRE) feeds the singer's wedge; AUX 2 feeds a reverb that comes back on AUX RETURN 1.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], "lead-vocal": [2, "mic"], "backing-vocals": [3, "mic"], pads: [4, "lr"] },
    sends: { aux1: { drums: -10, bass: -6, "lead-vocal": 0, "backing-vocals": -4, pads: -10 }, aux2: { "lead-vocal": -6, "backing-vocals": -8 } },
  },
  mg102: {
    prompt: "NOSTRADAMUS on a Yamaha MG10/2: lead and backing vocal on 1 and 2, drums and bass on the XLRs of 3/4 and 5/6, the pads laptop on 7/8. The guitars and the harmony mic have no channel left. Each channel's one AUX knob feeds either the singer's wedge (AUX1, left) or the reverb (AUX2, right).",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], drums: [2, "mic"], bass: [3, "mic"], pads: [4, "lr"] },
  },
  b207mp3: {
    prompt: "A coffee-house set from NOSTRADAMUS on one Behringer B207MP3: the box is the speaker, the amp and the mixer. The singer on 1, the backing singer on 2, the rhythm guitar's amp mic on 3, the pads laptop on the CD INPUT. THRU feeds a second B207 on stage as the singer's wedge.",
    patch: { "lead-vocal": [0, "in"], "backing-vocals": [1, "in"], guitars: [2, "in"], pads: [3, "rca"] },
  },
  stagepas400bt: {
    prompt: "NOSTRADAMUS on a Yamaha STAGEPAS 400BT: lead and backing vocal on 1 and 2, rhythm guitar and bass on 3 and 4, the pads laptop on 7/8. SPEAKERS L/R drive the two STAGEPAS speakers directly — the amp is in the mixer — and MONITOR OUT feeds the singer's wedge.",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], guitars: [2, "in"], bass: [3, "in"], pads: [5, "mini"] },
  },
  x1204usb: {
    prompt: "NOSTRADAMUS on a Behringer Xenyx QX1204USB: lead and backing vocal, rhythm guitar and bass on the four mic channels, the pads laptop on 5/6 (switched to −10 dBV). AUX 1, with PRE pressed on each channel, feeds the singer's wedge; the FX send feeds the built-in effects, which come back on RETURN 2. The lead vocal has a little COMP.",
    patch: { "lead-vocal": [0, "mic"], "backing-vocals": [1, "mic"], guitars: [2, "mic"], bass: [3, "mic"], pads: [4, "lr"] },
    sends: { aux1: { "lead-vocal": 0, "backing-vocals": -6, guitars: -10, bass: -10, pads: -10 }, fx: { "lead-vocal": -6, "backing-vocals": -8 } },
    minus10: ["pads"],
  },
  l20: {
    prompt: "All of NOSTRADAMUS on a Zoom LiveTrak L-20: rhythm guitar and bass on the Hi-Z inputs 1–2, drums on 3, backing and lead vocal on 4 and 5, lead guitar and bridge guitar on 6 and 7, the harmony mic on 8, the pads laptop on 17/18. MASTER OUT feeds the house speakers. MONITOR OUT A is the singer's wedge and B the guitarist's: each is its own mix on FADER MODE A and B. EFX 1 (hall) is on the vocals.",
    patch: { guitars: [0, "in"], bass: [1, "in"], drums: [2, "in"], "backing-vocals": [3, "in"], "lead-vocal": [4, "in"], "lead-guitar": [5, "in"], "bridge-guitar": [6, "in"], "harmony-vocal": [7, "in"], pads: [16, "lr"] },
    padFor: [],
    sends: {
      monA: { "lead-vocal": 0, "backing-vocals": -6, "harmony-vocal": -6, guitars: -12 },
      monB: { guitars: -2, "lead-guitar": -4, bass: -4, "lead-vocal": -8, drums: -8 },
      fx1: { "lead-vocal": -6, "backing-vocals": -8, "harmony-vocal": -8 },
    },
  },
  f8n: {
    prompt: "Filming NOSTRADAMUS with a Zoom F8n Pro as the recorder and camera mixer: drums, bass, rhythm guitar, lead guitar, backing vocal and lead vocal on inputs 1–6, the room pair on 7/8 (Stereo Link, +48V). Every input records its own track; the track knobs build the L/R mix. MAIN OUT 1/2 (LINE) feed the main camera's two XLR inputs, SUB OUT (MIC level) the second camera's 3.5 mm mic jack. Listen in the HEADPHONE, or at either camera. The bridge guitar, the harmony mic and the pads aren't on the recorder.",
    patch: { drums: [0, "in"], bass: [1, "in"], guitars: [2, "in"], "lead-guitar": [3, "in"], "backing-vocals": [4, "in"], "lead-vocal": [5, "in"], "room-l": [6, "in"], "room-r": [7, "in"] },
    cableFor: {},
  },
  ui16: {
    prompt: "All of NOSTRADAMUS on a Soundcraft Ui16 digital mixer: drums, bass, the three guitars, backing and lead vocal on inputs 1–7, the harmony mic on 8, the pads laptop on the RCA line in (13/14). AUX 1 feeds the singer's powered wedge, AUX 2 the drummer's wedge through the power amp; REVERB and DELAY are built in. Pick a mix in the bar above the faders, and SEL a channel to edit it.",
    patch: { drums: [0, "in"], bass: [1, "in"], guitars: [2, "in"], "lead-guitar": [3, "in"], "bridge-guitar": [4, "in"], "backing-vocals": [5, "in"], "lead-vocal": [6, "in"], "harmony-vocal": [7, "in"], pads: [12, "rca"] },
    sends: { ...NOS_WEDGES("aux1", "aux2"), fx1: { ...NOS_VOX_FX, "lead-guitar": -16 }, fx2: { "lead-vocal": -18 } },
    hpf: { ...NOS_HPF, guitars: 0.12, "lead-guitar": 0.12, "bridge-guitar": 0.12 },
  },
  gdig: {
    prompt: "All of NOSTRADAMUS on a generic digital mixer: inputs 1–8 on the CH 1-8 layer, the pads laptop on AUX 1/2 (the AUX / FX layer). MIX 1 (XLR OUT 1) feeds the singer's wedge, MIX 2 (XLR OUT 2) the drummer's wedge through the amp, MAIN comes out of XLR OUT 5/6. FX 1 is a hall reverb, FX 2 a delay. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: { ...NOS_DESK_PATCH, pads: [16, "lr"] },
    cableFor: {},
    sends: { ...NOS_WEDGES("mix1", "mix2"), fx1: { ...NOS_VOX_FX, "lead-guitar": -16 }, fx2: { "lead-vocal": -20 } },
    hpf: NOS_HPF,
  },
  x32c: {
    prompt: "All of NOSTRADAMUS on a Behringer X32 Compact: inputs 1–8 on the CH 1-8 layer, the pads laptop on AUX IN 1/2 (the AUX/FX layer). MIX 1 (XLR OUT 1) feeds the singer's wedge, MIX 2 (XLR OUT 2) the drummer's wedge through the amp, MAIN LR comes out of XLR OUT 7/8. FX 1 is a hall reverb, FX 2 a delay. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: { ...NOS_DESK_PATCH, pads: [16, "lr"] },
    cableFor: {},
    sends: { ...NOS_WEDGES("mix1", "mix2"), fx1: { ...NOS_VOX_FX, "lead-guitar": -16 }, fx2: { "lead-vocal": -20 } },
    hpf: NOS_HPF,
  },
  x32: {
    prompt: "All of NOSTRADAMUS on a full-size Behringer X32: inputs 1–8 on the CH 1-16 layer, the room pair on 17 and 18 (CH 17-32), the pads laptop on AUX IN 1/2. XLR OUT 1 carries MIX 1 to the singer's wedge, OUT 2 MIX 2 to the drummer's amp and wedge, OUT 15/16 MAIN L/R to the house: see the ROUTING page. MIX 13–15 feed the FX rack (room, plate, delay). Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { ...NOS_DESK_PATCH, "room-l": [16, "mic"], "room-r": [17, "mic"], pads: [32, "lr"] },
    cableFor: {},
    sends: { ...NOS_WEDGES("mix1", "mix2"), mix13: { ...NOS_VOX_FX, drums: -18 }, mix14: { "lead-guitar": -12, "backing-vocals": -14 }, mix15: { "lead-vocal": -22 } },
    hpf: NOS_HPF,
  },
  cl3: {
    prompt: "All of NOSTRADAMUS on a Yamaha CL3: the mics plug into a Rio3224-D stage box (Rio IN 1–8 feed channels 1–8, the room pair 17 and 18), the pads laptop into OMNI IN 1/2 on ST IN 1. The OUTPUT PATCH sends MIX 1 to Rio OUT 1 (the singer's wedge), MIX 2 to Rio OUT 2 (the drummer's amp and wedge) and STEREO to Rio OUT 15/16 (the house). MIX 13–15 feed the effects rack, back on ST IN 2–4. SEL a channel and use the touch screen: OVERVIEW and SELECTED CHANNEL. Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { ...NOS_DESK_PATCH, "room-l": [16, "mic"], "room-r": [17, "mic"], pads: [32, "lr"] },
    cableFor: {},
    sends: { ...NOS_WEDGES("mix1", "mix2"), mix13: { ...NOS_VOX_FX, drums: -18 }, mix14: { "lead-guitar": -12, "backing-vocals": -14 }, mix15: { "lead-vocal": -22 } },
    hpf: NOS_HPF,
  },
  dm2000: {
    prompt: "All of NOSTRADAMUS on a Yamaha DM2000: inputs 1–8 on the top-panel analog inputs, the pads laptop on 2TR IN, channel 89/90 (layer 73-96). STEREO OUT feeds the house. The OUTPUT PATCH puts AUX 1 on OMNI OUT 1 (the singer's wedge) and AUX 2 on OMNI OUT 2 (the drummer's amp and wedge). AUX 7 feeds the reverb (back on CH 73/74), AUX 8 the delay (CH 75/76). BUS 1–8 are empty. SEL a channel: the SELECTED CHANNEL section and the display follow it. Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { ...NOS_DESK_PATCH, pads: [24, "lr"] },
    padFor: [],
    sends: { ...NOS_WEDGES("aux1", "aux2"), aux7: { ...NOS_VOX_FX, "lead-guitar": -16 }, aux8: { "lead-vocal": -20 } },
  },
  yam01v96: {
    prompt: "All of NOSTRADAMUS on a Yamaha 01V96i: inputs 1–8, the pads laptop on 2TR IN (not yet in the mix). AUX 1 (OMNI OUT 1) feeds the singer's wedge, AUX 2 (OMNI OUT 2) the drummer's wedge through the amp, STEREO OUT the house. AUX 7 feeds the reverb (back on ST IN 1), AUX 8 the delay (ST IN 2). FADER MODE turns the faders into an aux's sends; SEL a channel and page through the display.",
    patch: { ...NOS_DESK_PATCH, pads: ["tape"] },
    padFor: [],
    sends: { ...NOS_WEDGES("aux1", "aux2"), aux7: { ...NOS_VOX_FX, "lead-guitar": -16 }, aux8: { "lead-vocal": -20 } },
  },
};

// FTW's gigs: drums, bass, guitar and vocals on Persephone's channels, the
// percussion, string, wind and brass section mics on the next ones (4, 5, 6
// and 8 where there are enough), the synths laptop where Persephone's preshow
// laptop went. Small mixers take what fits; the orchestra waits on stage.
const FTW_FX = { "lead-vocal": -10, strings: -14, winds: -16, brass: -16 };
const FTW_HPF = { guitars: 0.1, percussion: 0.08, strings: 0.08, winds: 0.1, brass: 0.1, "lead-vocal": 0.15 };
const FTW_DESK_PATCH = { drums: [0, "mic"], bass: [1, "mic"], guitars: [2, "mic"], percussion: [3, "mic"], strings: [4, "mic"], winds: [5, "mic"], "lead-vocal": [6, "mic"], brass: [7, "mic"] };
const FTW_WEDGES = (a, b) => ({
  [a]: { "lead-vocal": 0, synths: -10, guitars: -12, strings: -14 },
  [b]: { drums: -8, bass: -3, percussion: -6, "lead-vocal": -8 },
});
const FTW_GIGS = {
  mix8: {
    prompt: "A stripped-down FTW on a Mackie Mix8: the vocal and the guitar amp on the two mic channels, the synths laptop on stereo channel 3/4. The rest of the band and the orchestra have no channel left. The singer's wedge is on the AUX send, which on this mixer is post-fader.",
    patch: { "lead-vocal": [0, "mic"], guitars: [1, "mic"], synths: [2, "lr"] },
    sends: { aux: { "lead-vocal": 0, guitars: -10, synths: -10 } },
  },
  vlz1202: {
    prompt: "FTW on a Mackie 1202-VLZ: drums, bass, the vocal and the guitar on the four mic channels, the synths laptop on 5/6. The percussion and the orchestra have no channel left. AUX 1 (switched to PRE) feeds the singer's wedge; AUX 2 feeds a reverb that comes back on AUX RETURN 1.",
    patch: { drums: [0, "mic"], bass: [1, "mic"], "lead-vocal": [2, "mic"], guitars: [3, "mic"], synths: [4, "lr"] },
    sends: { aux1: { drums: -10, bass: -6, "lead-vocal": 0, guitars: -8, synths: -10 }, aux2: { "lead-vocal": -6 } },
  },
  mg102: {
    prompt: "FTW on a Yamaha MG10/2: the vocal and the guitar on 1 and 2, drums and bass on the XLRs of 3/4 and 5/6, the synths laptop on 7/8. The percussion and the orchestra have no channel left. Each channel's one AUX knob feeds either the singer's wedge (AUX1, left) or the reverb (AUX2, right).",
    patch: { "lead-vocal": [0, "mic"], guitars: [1, "mic"], drums: [2, "mic"], bass: [3, "mic"], synths: [4, "lr"] },
    sends: { auxPan: { "lead-vocal": -0, guitars: -10, drums: -10, bass: -6 } },
    bipolarSides: { "lead-vocal": "left", guitars: "left", drums: "left", bass: "left" },
  },
  b207mp3: {
    prompt: "An acoustic FTW on one Behringer B207MP3: the box is the speaker, the amp and the mixer. The vocal on 1, the guitar amp's mic on 2, the bass DI on 3, the synths laptop on the CD INPUT. THRU feeds a second B207 on stage as the singer's wedge.",
    patch: { "lead-vocal": [0, "in"], guitars: [1, "in"], bass: [2, "in"], synths: [3, "rca"] },
  },
  stagepas400bt: {
    prompt: "FTW on a Yamaha STAGEPAS 400BT: the vocal and the brass mic on 1 and 2, guitar and bass on 3 and 4, the synths laptop on 7/8. SPEAKERS L/R drive the two STAGEPAS speakers directly — the amp is in the mixer — and MONITOR OUT feeds the singer's wedge.",
    patch: { "lead-vocal": [0, "mic"], brass: [1, "mic"], guitars: [2, "in"], bass: [3, "in"], synths: [5, "mini"] },
    sends: { reverb: { "lead-vocal": -8, brass: -12 } },
  },
  x1204usb: {
    prompt: "FTW on a Behringer Xenyx QX1204USB: the vocal, the string section mic, guitar and bass on the four mic channels, the synths laptop on 5/6 (switched to −10 dBV). AUX 1, with PRE pressed on each channel, feeds the singer's wedge; the FX send feeds the built-in effects, which come back on RETURN 2. The vocal has a little COMP.",
    patch: { "lead-vocal": [0, "mic"], strings: [1, "mic"], guitars: [2, "mic"], bass: [3, "mic"], synths: [4, "lr"] },
    sends: { aux1: { "lead-vocal": 0, strings: -12, guitars: -10, bass: -10, synths: -10 }, fx: { "lead-vocal": -6, strings: -12 } },
    minus10: ["synths"],
  },
  sd442: {
    prompt: "Shooting FTW for video with a Sound Devices 442 on a cart: the room pair on channels 1 and 2 (1+2 LINK on, P48 on), the vocal on 3 and the string section mic on 4. The XLR master outs feed the camera's two XLR inputs, both outputs and camera inputs at LINE. Listen in the HEADPHONE (try M to check the pair in mono), or at the camera.",
    patch: { "room-l": [0, "in"], "room-r": [1, "in"], "lead-vocal": [2, "in"], strings: [3, "in"] },
    hpf: { "lead-vocal": 0.25, strings: 0.1 },
    pans: { "lead-vocal": 0, strings: 0 },
  },
  l20: {
    prompt: "All of FTW on a Zoom LiveTrak L-20: guitar and bass on the Hi-Z inputs 1–2, drums on 3, percussion on 4, the vocal on 5, strings, brass and woodwinds on 6, 7 and 8, the synths laptop on 17/18. MASTER OUT feeds the house speakers. MONITOR OUT A is the singer's wedge and B the guitarist's: each is its own mix on FADER MODE A and B. EFX 1 (hall) is on the vocal and the orchestra.",
    patch: { guitars: [0, "in"], bass: [1, "in"], drums: [2, "in"], percussion: [3, "in"], "lead-vocal": [4, "in"], strings: [5, "in"], brass: [6, "in"], winds: [7, "in"], synths: [16, "lr"] },
    padFor: [],
    sends: {
      monA: { "lead-vocal": 0, synths: -10, guitars: -12, strings: -14 },
      monB: { guitars: -2, bass: -4, drums: -8, "lead-vocal": -8 },
      fx1: FTW_FX,
    },
  },
  f8n: {
    prompt: "Filming FTW with a Zoom F8n Pro as the recorder and camera mixer: drums, bass, guitar, percussion, strings and the vocal on inputs 1–6, the room pair on 7/8 (Stereo Link, +48V). Every input records its own track; the track knobs build the L/R mix. MAIN OUT 1/2 (LINE) feed the main camera's two XLR inputs, SUB OUT (MIC level) the second camera's 3.5 mm mic jack. Listen in the HEADPHONE, or at either camera. The winds, brass and synths aren't on the recorder.",
    patch: { drums: [0, "in"], bass: [1, "in"], guitars: [2, "in"], percussion: [3, "in"], strings: [4, "in"], "lead-vocal": [5, "in"], "room-l": [6, "in"], "room-r": [7, "in"] },
    cableFor: {},
    hpf: { "lead-vocal": 0.25, strings: 0.1 },
  },
  ui16: {
    prompt: "All of FTW on a Soundcraft Ui16 digital mixer: drums, bass, guitar, percussion, strings, woodwinds, the vocal and brass on inputs 1–8, the synths laptop on the RCA line in (13/14). AUX 1 feeds the singer's powered wedge, AUX 2 the drummer's wedge through the power amp; REVERB and DELAY are built in. Pick a mix in the bar above the faders, and SEL a channel to edit it.",
    patch: { drums: [0, "in"], bass: [1, "in"], guitars: [2, "in"], percussion: [3, "in"], strings: [4, "in"], winds: [5, "in"], "lead-vocal": [6, "in"], brass: [7, "in"], synths: [12, "rca"] },
    sends: { ...FTW_WEDGES("aux1", "aux2"), fx1: FTW_FX, fx2: { "lead-vocal": -18 } },
    hpf: FTW_HPF,
  },
  gdig: {
    prompt: "All of FTW on a generic digital mixer: inputs 1–8 on the CH 1-8 layer (the band, the vocal, and the percussion, string, wind and brass section mics), the synths laptop on AUX 1/2 (the AUX / FX layer). MIX 1 (XLR OUT 1) feeds the singer's wedge, MIX 2 (XLR OUT 2) the drummer's wedge through the amp, MAIN comes out of XLR OUT 5/6. FX 1 is a hall reverb, FX 2 a delay. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: { ...FTW_DESK_PATCH, synths: [16, "lr"] },
    cableFor: {},
    sends: { ...FTW_WEDGES("mix1", "mix2"), fx1: FTW_FX, fx2: { "lead-vocal": -20 } },
    hpf: FTW_HPF,
  },
  x32c: {
    prompt: "All of FTW on a Behringer X32 Compact: inputs 1–8 on the CH 1-8 layer (the band, the vocal, and the percussion, string, wind and brass section mics), the synths laptop on AUX IN 1/2 (the AUX/FX layer). MIX 1 (XLR OUT 1) feeds the singer's wedge, MIX 2 (XLR OUT 2) the drummer's wedge through the amp, MAIN LR comes out of XLR OUT 7/8. FX 1 is a hall reverb, FX 2 a delay. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: { ...FTW_DESK_PATCH, synths: [16, "lr"] },
    cableFor: {},
    sends: { ...FTW_WEDGES("mix1", "mix2"), fx1: FTW_FX, fx2: { "lead-vocal": -20 } },
    hpf: FTW_HPF,
  },
  x32: {
    prompt: "All of FTW on a full-size Behringer X32: inputs 1–8 on the CH 1-16 layer (the band, the vocal, and the percussion, string, wind and brass section mics), the room pair on 17 and 18 (CH 17-32), the synths laptop on AUX IN 1/2. XLR OUT 1 carries MIX 1 to the singer's wedge, OUT 2 MIX 2 to the drummer's amp and wedge, OUT 15/16 MAIN L/R to the house: see the ROUTING page. MIX 13–15 feed the FX rack (room, plate, delay). Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { ...FTW_DESK_PATCH, "room-l": [16, "mic"], "room-r": [17, "mic"], synths: [32, "lr"] },
    cableFor: {},
    sends: { ...FTW_WEDGES("mix1", "mix2"), mix13: { "lead-vocal": -12, strings: -12, winds: -14, drums: -18 }, mix14: { brass: -12, strings: -16 }, mix15: { "lead-vocal": -22 } },
    hpf: FTW_HPF,
  },
  cl3: {
    prompt: "All of FTW on a Yamaha CL3: the mics plug into a Rio3224-D stage box (Rio IN 1–8 feed channels 1–8: the band, the vocal, and the percussion, string, wind and brass section mics; the room pair 17 and 18), the synths laptop into OMNI IN 1/2 on ST IN 1. The OUTPUT PATCH sends MIX 1 to Rio OUT 1 (the singer's wedge), MIX 2 to Rio OUT 2 (the drummer's amp and wedge) and STEREO to Rio OUT 15/16 (the house). MIX 13–15 feed the effects rack, back on ST IN 2–4. SEL a channel and use the touch screen: OVERVIEW and SELECTED CHANNEL. Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { ...FTW_DESK_PATCH, "room-l": [16, "mic"], "room-r": [17, "mic"], synths: [32, "lr"] },
    cableFor: {},
    sends: { ...FTW_WEDGES("mix1", "mix2"), mix13: { "lead-vocal": -12, strings: -12, winds: -14, drums: -18 }, mix14: { brass: -12, strings: -16 }, mix15: { "lead-vocal": -22 } },
    hpf: FTW_HPF,
  },
  dm2000: {
    prompt: "All of FTW on a Yamaha DM2000: inputs 1–8 on the top-panel analog inputs (the band, the vocal, and the percussion, string, wind and brass section mics), the synths laptop on 2TR IN, channel 89/90 (layer 73-96). STEREO OUT feeds the house. The OUTPUT PATCH puts AUX 1 on OMNI OUT 1 (the singer's wedge) and AUX 2 on OMNI OUT 2 (the drummer's amp and wedge). AUX 7 feeds the reverb (back on CH 73/74), AUX 8 the delay (CH 75/76). BUS 1–8 are empty. SEL a channel: the SELECTED CHANNEL section and the display follow it. Scene 1 is this mix, scene 2 the acoustic set.",
    patch: { ...FTW_DESK_PATCH, synths: [24, "lr"] },
    padFor: [],
    sends: { ...FTW_WEDGES("aux1", "aux2"), aux7: FTW_FX, aux8: { "lead-vocal": -20 } },
  },
  yam01v96: {
    prompt: "All of FTW on a Yamaha 01V96i: inputs 1–8 (the band, the vocal, and the percussion, string, wind and brass section mics), the synths laptop on 2TR IN (not yet in the mix). AUX 1 (OMNI OUT 1) feeds the singer's wedge, AUX 2 (OMNI OUT 2) the drummer's wedge through the amp, STEREO OUT the house. AUX 7 feeds the reverb (back on ST IN 1), AUX 8 the delay (ST IN 2). FADER MODE turns the faders into an aux's sends; SEL a channel and page through the display.",
    patch: { ...FTW_DESK_PATCH, synths: ["tape"] },
    padFor: [],
    sends: { ...FTW_WEDGES("aux1", "aux2"), aux7: FTW_FX, aux8: { "lead-vocal": -20 } },
  },
};

// The COB gig in Irvine (MUS 248's COB Gig Checklist), its own rig: twelve
// wireless headsets on X32 inputs 1–12 (receiver channel A → 1 … L → 12), the
// backing-track laptop on AUX IN 1/2. The console sits in the booth; an SD8 on
// the stage floor carries its outputs down one Cat5e: SD8 OUT 1 (MIX 1) → the
// wedges, daisy-chained on THRU; OUT 7/8 (MAIN L/R) → the STAGEPAS 600BT's line
// input 5/6, whose amp drives its two passive speakers. Inputs stay LOCAL.
const COB_HEADSETS = "abcdefghijkl".split("").map((l) => `hs-${l}`);
const COB_ENSEMBLE = COB_HEADSETS.slice(2);
const each = (ids, v) => Object.fromEntries(ids.map((id) => [id, v]));
const COB_GIGS = {
  x32c: {
    prompt: "COB in Irvine, a musical on a Behringer X32 Compact in the booth: twelve wireless headsets on inputs 1–12 (bodypack A on 1 … L on 12; A sings the lead, B the harmony, C–L the ensemble), the backing tracks from a laptop on AUX IN 1/2. An SD8 stage box on the stage floor carries the outputs down one Cat5e cable: SD8 OUT 1 is MIX 1, the performers' wedges, chained from one B207MP3 to the next on THRU; OUT 7/8 are MAIN L/R into the STAGEPAS 600BT's line input 5/6, whose amp drives its two speakers. The mics stay on LOCAL: the SD8 is only for outputs.",
    patch: { ...Object.fromEntries(COB_HEADSETS.map((id, i) => [id, [i, "mic"]])), track: [16, "lr"] },
    cableFor: {},
    devices: ["sb", "stagepas", "sp6-l", "sp6-r", "cob-w1", "cob-w2", "cob-w3"],
    cables: [
      { from: "sb/aes50a", to: "mixer/aes50a", cable: "cat5" },
      { from: "sb/out7", to: "stagepas/in-a", cable: "xlr-ts" },
      { from: "sb/out8", to: "stagepas/in-b", cable: "xlr-ts" },
      { from: "stagepas/out-a", to: "sp6-l/in", cable: "speaker" },
      { from: "stagepas/out-b", to: "sp6-r/in", cable: "speaker" },
      { from: "sb/out1", to: "cob-w1/in", cable: "xlr" },
      { from: "cob-w1/thru", to: "cob-w2/in", cable: "xlr" },
      { from: "cob-w2/thru", to: "cob-w3/in", cable: "xlr" },
    ],
    sends: {
      mix1: { "hs-a": 0, "hs-b": -3, ...each(COB_ENSEMBLE, -20), track: -4 },
      fx1: { "hs-a": -12, "hs-b": -14, ...each(COB_ENSEMBLE, -24) },
    },
    preFor: ["mix1"], // the wedge mix is pre-fader
    hpf: each(COB_HEADSETS, 0.15),
    dyn: { "hs-a": { threshold: -16, ratio: 3, makeup: 3 } },
  },
};

// Vocal Jazz in Salmon Recital Hall (MUS 248's Vocal Jazz Gig Checklist and
// Vocal Jazz Reset), on the hall's full-size X32: the ensemble's eleven
// wireless handhelds on LOCAL inputs 1–11 (mic n → receiver channel n → input n). The reset leaves
// ROUTING with CH 1-8, 9-16 and 17-24 on LOCAL and only 25-32 on AES50-A (the
// S32), every handheld at the same GAIN (30 dB), LOW CUT on, and no
// dynamics. MIX 1 is the wedges: XLR OUT 1 → S32 OUT 1 → the NX3000's CH A,
// whose speakON output feeds wedge 1, linked on to 2 and 3.
const VJ_MICS = Array.from({ length: 11 }, (_, i) => `vj-${i + 1}`);
const VJ_GIGS = {
  x32: {
    prompt: "Vocal Jazz in Salmon Recital Hall, on the hall's full-size X32: eleven singers on wireless handhelds, mic n on receiver channel n on input n (mic 1 is Allie, mic 11 Silas: the program's order). ROUTING: CH 1-8, 9-16 and 17-24 listen to LOCAL (the receivers plug into the console's rear panel); only 25-32 come from AES50-A, the S32 in the stage-side rack. Every handheld has the same GAIN, LOW CUT on, no compressor. MIX 1 is the wedges: XLR OUT 1 reaches S32 OUT 1, into the NX3000's CH A, whose speakON output feeds three passive wedges linked one to the next. MAIN L/R go to the hall's mains.",
    patch: Object.fromEntries(VJ_MICS.map((id, i) => [id, [i, "mic"]])),
    cableFor: {},
    gainDb: 30,
    inSource: [0, 0, 0, 1],
    devices: ["s32", "nx3000", "vj-w1", "vj-w2", "vj-w3", "mains-amp", "hall-l", "hall-r"],
    cables: [
      { from: "s32/aes50a", to: "mixer/aes50a", cable: "cat5" },
      { from: "s32/out1", to: "nx3000/in-a", cable: "xlr" },
      { from: "nx3000/out-a", to: "vj-w1/in", cable: "speakon" },
      { from: "vj-w1/link", to: "vj-w2/in", cable: "speakon" },
      { from: "vj-w2/link", to: "vj-w3/in", cable: "speakon" },
      { from: "mixer/out15", to: "mains-amp/in-a", cable: "xlr" },
      { from: "mixer/out16", to: "mains-amp/in-b", cable: "xlr" },
      { from: "mains-amp/out-a", to: "hall-l/in", cable: "speaker" },
      { from: "mains-amp/out-b", to: "hall-r/in", cable: "speaker" },
    ],
    sends: { mix1: each(VJ_MICS, -8) },
    preFor: ["mix1"],
    hpf: each(VJ_MICS, 0.2), // 80 Hz: low enough for a bass voice (recommended 2026-10-20; the instructor considered 100)
    dyn: {},
    scenes: [{ name: "Vocal Jazz" }],
  },
};

// The Vocal Jazz Ensemble's two pieces (Free play) on every console: eleven
// wireless handhelds, a channel each where there are enough. A small mixer
// takes a few: Abbey and Silas (mics 4 and 11, the soloists in "Love Me or
// Leave Me"), or a quartet with Allie and Brandon (1 and 9). The other
// handhelds stay on stage, unplugged. MIX/AUX 1 is the singers' wedge, 2 the
// pianist's (the singers, a little lower).
const JZ = Array.from({ length: 11 }, (_, i) => `vj-${i + 1}`);
const JZ_DUO = ["vj-4", "vj-11"];
const JZ_QUARTET = ["vj-1", "vj-4", "vj-9", "vj-11"];
const JZ_REC = ["vj-1", "vj-3", "vj-4", "vj-7", "vj-9", "vj-11"];
const jzPatch = (ids, jack, from = 0) => Object.fromEntries(ids.map((id, i) => [id, [from + i, jack]]));
const JZ_WEDGES = (a, b) => ({ [a]: each(JZ, -6), [b]: each(JZ, -10) });
const JZ_DESK = {
  cableFor: {},
  sends: { ...JZ_WEDGES("mix1", "mix2"), fx1: each(JZ, -14) },
  hpf: each(JZ, 0.2),
  dyn: {},
};
const JAZZ_GIGS = {
  mix8: {
    prompt: "Two singers from the Vocal Jazz Ensemble on a Mackie Mix8: Abbey and Silas (mics 4 and 11, the soloists in “Love Me or Leave Me”) on the two mic channels. The other nine handhelds have no channel left. The singers' wedge is on the AUX send, which on this mixer is post-fader.",
    patch: jzPatch(JZ_DUO, "mic"),
    sends: { aux: each(JZ_DUO, -4) },
  },
  vlz1202: {
    prompt: "A quartet from the Vocal Jazz Ensemble on a Mackie 1202-VLZ: Allie, Abbey, Brandon and Silas (mics 1, 4, 9 and 11) on the four mic channels. The other seven handhelds have no channel left. AUX 1 (switched to PRE) feeds the singers' wedge; AUX 2 feeds a reverb that comes back on AUX RETURN 1.",
    patch: jzPatch(JZ_QUARTET, "mic"),
    sends: { aux1: each(JZ_QUARTET, -4), aux2: each(JZ_QUARTET, -8) },
  },
  mg102: {
    prompt: "A quartet from the Vocal Jazz Ensemble on a Yamaha MG10/2: Allie and Abbey (mics 1 and 4) on 1 and 2, Brandon and Silas (9 and 11) on the XLRs of 3/4 and 5/6. The other seven handhelds have no channel left. Each channel's one AUX knob feeds either the singers' wedge (AUX1, left) or the reverb (AUX2, right).",
    patch: jzPatch(JZ_QUARTET, "mic"),
    sends: { auxPan: each(JZ_QUARTET, -4) },
    bipolarSides: each(JZ_QUARTET, "left"),
  },
  b207mp3: {
    prompt: "A trio from the Vocal Jazz Ensemble on one Behringer B207MP3: the box is the speaker, the amp and the mixer. Allie, Abbey and Silas (mics 1, 4 and 11) on its three inputs; the other eight handhelds have no channel left. THRU feeds a second B207 on stage as the singers' wedge.",
    patch: jzPatch(["vj-1", "vj-4", "vj-11"], "in"),
  },
  stagepas400bt: {
    prompt: "A quartet from the Vocal Jazz Ensemble on a Yamaha STAGEPAS 400BT: Allie and Abbey (mics 1 and 4) on 1 and 2, Brandon and Silas (9 and 11) on the combo jacks of 3 and 4. The other seven handhelds have no channel left. SPEAKERS L/R drive the two STAGEPAS speakers directly — the amp is in the mixer — and MONITOR OUT feeds the singers' wedge.",
    patch: { "vj-1": [0, "mic"], "vj-4": [1, "mic"], "vj-9": [2, "in"], "vj-11": [3, "in"] },
    sends: { reverb: each(JZ_QUARTET, -10) },
  },
  x1204usb: {
    prompt: "A quartet from the Vocal Jazz Ensemble on a Behringer Xenyx QX1204USB: Allie, Abbey, Brandon and Silas (mics 1, 4, 9 and 11) on the four mic channels. The other seven handhelds have no channel left. AUX 1, with PRE pressed on each channel, feeds the singers' wedge; the FX send feeds the built-in effects, which come back on RETURN 2. No COMP: the singers balance themselves.",
    patch: jzPatch(JZ_QUARTET, "mic"),
    sends: { aux1: each(JZ_QUARTET, -4), fx: each(JZ_QUARTET, -8) },
    comp: {},
    minus10: [],
  },
  sd442: {
    prompt: "Shooting the Vocal Jazz Ensemble for video with a Sound Devices 442 on a cart: the room pair on channels 1 and 2 (1+2 LINK on, P48 on), the two soloists' handhelds on 3 and 4 (Abbey, mic 4; Silas, mic 11). The XLR master outs feed the camera's two XLR inputs, both outputs and camera inputs at LINE. Listen in the HEADPHONE (try M to check the pair in mono), or at the camera.",
    patch: { "room-l": [0, "in"], "room-r": [1, "in"], "vj-4": [2, "in"], "vj-11": [3, "in"] },
    hpf: each(JZ_DUO, 0.25),
    pans: each(JZ_DUO, 0),
  },
  l20: {
    prompt: "The whole Vocal Jazz Ensemble on a Zoom LiveTrak L-20: the eleven handhelds on inputs 1–11 (mic n on input n). MASTER OUT feeds the house speakers. MONITOR OUT A is the singers' wedge and B the pianist's: each is its own mix on FADER MODE A and B. EFX 1 (hall) is on the voices.",
    patch: jzPatch(JZ, "in"),
    padFor: [],
    sends: { monA: each(JZ, -6), monB: each(JZ, -10), fx1: each(JZ, -12) },
  },
  f8n: {
    prompt: "Filming the Vocal Jazz Ensemble with a Zoom F8n Pro as the recorder and camera mixer: six of the handhelds on inputs 1–6 (mics 1, 3, 4, 7, 9 and 11: Allie, Magnolia, Abbey, Paola, Brandon and Silas), the room pair on 7/8 (Stereo Link, +48V) for everyone. Every input records its own track; the track knobs build the L/R mix. MAIN OUT 1/2 (LINE) feed the main camera's two XLR inputs, SUB OUT (MIC level) the second camera's 3.5 mm mic jack. Listen in the HEADPHONE, or at either camera.",
    patch: { ...jzPatch(JZ_REC, "in"), "room-l": [6, "in"], "room-r": [7, "in"] },
    cableFor: {},
    hpf: each(JZ_REC, 0.25),
  },
  ui16: {
    prompt: "The whole Vocal Jazz Ensemble on a Soundcraft Ui16 digital mixer: the eleven handhelds on inputs 1–11 (mic n on input n). AUX 1 feeds the singers' powered wedge, AUX 2 the pianist's wedge through the power amp; REVERB and DELAY are built in. Pick a mix in the bar above the faders, and SEL a channel to edit it.",
    patch: jzPatch(JZ, "in"),
    sends: { ...JZ_WEDGES("aux1", "aux2"), fx1: each(JZ, -14) },
    hpf: each(JZ, 0.15),
    dyn: {},
  },
  gdig: {
    prompt: "The whole Vocal Jazz Ensemble on a generic digital mixer: the eleven handhelds on inputs 1–11 (mic n on input n; CH 9-16 is the second layer). MIX 1 (XLR OUT 1) feeds the singers' wedge, MIX 2 (XLR OUT 2) the pianist's wedge through the amp, MAIN comes out of XLR OUT 5/6. FX 1 is a hall reverb. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: jzPatch(JZ, "mic"),
    ...JZ_DESK,
  },
  x32c: {
    prompt: "The whole Vocal Jazz Ensemble on a Behringer X32 Compact: the eleven handhelds on inputs 1–11 (mic n on input n; CH 9-16 is the second layer). MIX 1 (XLR OUT 1) feeds the singers' wedge, MIX 2 (XLR OUT 2) the pianist's wedge through the amp, MAIN LR comes out of XLR OUT 7/8. FX 1 is a hall reverb. SEL a channel to edit it in the channel strip; SEL a MIX and press SENDS ON FADERS to mix that wedge on the input faders.",
    patch: jzPatch(JZ, "mic"),
    ...JZ_DESK,
  },
  x32: {
    prompt: "The whole Vocal Jazz Ensemble on a full-size Behringer X32: the eleven handhelds on inputs 1–11 (CH 1-16), the room pair on 17 and 18 (CH 17-32). XLR OUT 1 carries MIX 1 to the singers' wedge, OUT 2 MIX 2 to the pianist's amp and wedge, OUT 15/16 MAIN L/R to the house: see the ROUTING page. MIX 13 feeds the FX rack's room reverb.",
    patch: { ...jzPatch(JZ, "mic"), "room-l": [16, "mic"], "room-r": [17, "mic"] },
    ...JZ_DESK,
    sends: { ...JZ_WEDGES("mix1", "mix2"), mix13: each(JZ, -14) },
    scenes: [{ name: "Vocal Jazz" }],
  },
  cl3: {
    prompt: "The whole Vocal Jazz Ensemble on a Yamaha CL3: the handhelds' receivers plug into a Rio3224-D stage box (Rio IN 1–11 feed channels 1–11, the room pair 17 and 18). The OUTPUT PATCH sends MIX 1 to Rio OUT 1 (the singers' wedge), MIX 2 to Rio OUT 2 (the pianist's amp and wedge) and STEREO to Rio OUT 15/16 (the house). MIX 13 feeds the effects rack's reverb. SEL a channel and use the touch screen: OVERVIEW and SELECTED CHANNEL.",
    patch: { ...jzPatch(JZ, "mic"), "room-l": [16, "mic"], "room-r": [17, "mic"] },
    ...JZ_DESK,
    sends: { ...JZ_WEDGES("mix1", "mix2"), mix13: each(JZ, -14) },
    scenes: [{ name: "Vocal Jazz" }],
  },
  dm2000: {
    prompt: "The whole Vocal Jazz Ensemble on a Yamaha DM2000: the eleven handhelds on the top-panel analog inputs 1–11. STEREO OUT feeds the house. The OUTPUT PATCH puts AUX 1 on OMNI OUT 1 (the singers' wedge) and AUX 2 on OMNI OUT 2 (the pianist's amp and wedge). AUX 7 feeds the reverb (back on CH 73/74). SEL a channel: the SELECTED CHANNEL section and the display follow it.",
    patch: jzPatch(JZ, "mic"),
    padFor: [],
    sends: { ...JZ_WEDGES("aux1", "aux2"), aux7: each(JZ, -14) },
    dyn: {},
    scenes: [{ name: "Vocal Jazz" }],
  },
  yam01v96: {
    prompt: "The whole Vocal Jazz Ensemble on a Yamaha 01V96i: the eleven handhelds on inputs 1–11. AUX 1 (OMNI OUT 1) feeds the singers' wedge, AUX 2 (OMNI OUT 2) the pianist's wedge through the amp, STEREO OUT the house. AUX 7 feeds the reverb (back on ST IN 1). FADER MODE turns the faders into an aux's sends; SEL a channel and page through the display.",
    patch: jzPatch(JZ, "mic"),
    padFor: [],
    sends: { ...JZ_WEDGES("aux1", "aux2"), aux7: each(JZ, -14) },
  },
};

// The Chapman Faculty Electroacoustic Showcase in Salmon Recital Hall
// (2026-10-18; the Salmon Simulator's showcase signal flow and MUS 248's
// Electroacoustic Showcase Gig Checklist), on the hall's full-size X32. The
// S32 in the stage-side rack is on the X32's AES50 A; an SD8 on the far side
// of the stage hangs off the S32's AES50 B, so its inputs arrive as AES50
// A33-40. ROUTING: CH 25-32 ← AES50 A25-32 (the S32, Salmon's default),
// CH 17-24 ← AES50 A33-40 (the SD8). The Mac mini at FOH plays the
// electronics into AUX IN 1/2 and a click into LOCAL 1 (in the hall it was an
// AUX IN; the lab's X32 has AUX IN 1/2 only). MIX 3 is the bass clarinetist's
// wedge: click, track and a little of the clarinet, XLR OUT 3 → AES50 → SD8
// OUT 3 (OUTPUT switch on 1-8). The click is off MAIN LR. MAIN L/R go to the
// hall's mains. TUNNEL's own 8-channel system isn't here: it never touched the X32.
const EA_GIGS = {
  x32: {
    prompt: "The electroacoustic showcase in Salmon Recital Hall, on the hall's full-size X32. On stage, the S32 (on the X32's AES50 A) takes the bass clarinet mic on IN 25, the condenser inside the grand piano on IN 26 and the guitarist's rig on IN 27: ROUTING has CH 25-32 on AES50 A25-32. On the far side of the stage, an SD8 hangs off the S32's AES50 B (a daisy chain), so its inputs arrive as AES50 A33-40: the flower-pot mic on SD8 IN 1 and the MalletKAT rig on IN 2, heard on CH 17-18 because ROUTING puts CH 17-24 on AES50 A33-40. At FOH the Mac mini plays the electronics into AUX IN 1/2 and a click into LOCAL 1. MIX 3 is the bass clarinetist's wedge (click, track and a little clarinet): XLR OUT 3 reaches SD8 OUT 3 with the SD8's OUTPUT switch on 1-8. The click is off MAIN LR: the audience never hears it. MAIN L/R go to the hall's mains. The audio stands in for the pieces: FTW's woodwinds, strings, guitar, percussion, vocals and synths, and a click.",
    patch: { "ea-click": [0, "mic"], "ea-track": [32, "lr"] },
    // Sources on a stage box: [box, its input number, the console channel that hears it].
    boxPatch: { "ea-pots": ["ea-sd8", 1, 16], "ea-kat": ["ea-sd8", 2, 17], "ea-bcl": ["s32", 25, 24], "ea-piano": ["s32", 26, 25], "ea-guitar": ["s32", 27, 26] },
    cableFor: { "ea-click": "xlr-trs", "ea-kat": "xlr-trs" },
    inSource: [0, 0, 3 + 4, 1],
    devices: ["s32", "ea-sd8", "ea-perf", "mains-amp", "hall-l", "hall-r"],
    cables: [
      { from: "s32/aes50a", to: "mixer/aes50a", cable: "cat5" },
      { from: "ea-sd8/aes50a", to: "s32/aes50b", cable: "cat5" },
      { from: "ea-sd8/out3", to: "ea-perf/in", cable: "xlr" },
      { from: "mixer/out15", to: "mains-amp/in-a", cable: "xlr" },
      { from: "mixer/out16", to: "mains-amp/in-b", cable: "xlr" },
      { from: "mains-amp/out-a", to: "hall-l/in", cable: "speaker" },
      { from: "mains-amp/out-b", to: "hall-r/in", cable: "speaker" },
    ],
    sends: { mix3: { "ea-click": 0, "ea-track": -4, "ea-bcl": -8 } },
    preFor: ["mix3"],
    lrOff: ["ea-click"],
    hpf: { "ea-pots": 0.15, "ea-bcl": 0.1, "ea-piano": 0.1, "ea-guitar": 0.1 },
    dyn: {},
    scenes: [{ name: "Showcase" }],
  },
};

// Karaoke in BH 109, the choir room (MUS 248's BH 109 Karaoke Gig Checklist),
// on a Behringer Xenyx: two SM58s on CH 1 and 2 (LOW CUT on, COMP about
// 3 o'clock), the karaoke laptop on LINE IN 5/6, an SM58 through a Zoom V3 on
// 7/8 L (MONO), both stereo channels at −10. The four mics' FX sends feed the
// built-in effects (the room's DLY + REV, a COMBINATION FX preset), back on RETURN 2 at unity
// into the MAIN MIX. MAIN OUTPUTS L/R → XLR-to-TRS → the rack's AUX AUDIO INPUT
// L/R → the Ashly's Ch.1 (on LINE) → the Crown → the two passive wall speakers.
// AUX 1 isn't used. Which COMBINATION FX preset is the room's DLY + REV isn't
// confirmed: the gig starts on the first one.
const KARAOKE_GIGS = {
  x1204usb: {
    prompt: "Karaoke in BH 109, the choir room, on a Behringer Xenyx: two singers on SM58s on CH 1 and 2 (LOW CUT on, COMP about 3 o'clock), the karaoke laptop on LINE IN 5/6, and a third singer's SM58 through a Zoom V3 vocal processor, its OUTPUT L into 7/8 L (MONO). Both stereo channels are switched to −10. The singers' FX knobs feed the built-in effects (DLY + REV, a COMBINATION FX preset), which come back on RETURN 2 into the MAIN MIX. The PA is the room's own: MAIN OUTPUTS L/R on XLR-to-TRS cables into the rack's AUX AUDIO INPUT, through the Ashly line mixer's Ch.1 (on LINE) to the Crown amp and the two passive wall speakers. AUX 1 isn't used.",
    patch: { "ky-mic1": [0, "mic"], "ky-mic2": [1, "mic"], "ky-track": [4, "lr"], "ky-v3": [5, "l"] },
    cableFor: { "ky-v3": "ts" },
    devices: ["bh109-rack", "bh109-l", "bh109-r"],
    cables: [
      { from: "mixer/main-l", to: "bh109-rack/in-a", cable: "xlr-trs" },
      { from: "mixer/main-r", to: "bh109-rack/in-b", cable: "xlr-trs" },
      { from: "bh109-rack/out-a", to: "bh109-l/in", cable: "speaker" },
      { from: "bh109-rack/out-b", to: "bh109-r/in", cable: "speaker" },
    ],
    sends: { fx: { "ky-mic1": -6, "ky-mic2": -6 } },
    pre: false,
    comp: { "ky-mic1": 0.8, "ky-mic2": 0.8 },
    minus10: ["ky-track", "ky-v3"],
    // The effects on a COMBINATION FX preset (the room's DLY + REV), RETURN 2 at unity.
    tweak: (state) => {
      state.fx.program = COMPACT.x1204usb.fx.presets.findIndex((p) => p.group === "COMBINATION FX");
      state.ret2.level = COMPACT_LAWS.ret20.toPos(0);
    },
  },
};

// Each band's version of the gigs, over Persephone's.
const SONG_GIGS = { nostradamus: NOSTRADAMUS_GIGS, ftw: FTW_GIGS, "almost-like": JAZZ_GIGS, "love-me": JAZZ_GIGS, cob: COB_GIGS, vj: VJ_GIGS, ea: EA_GIGS, karaoke: KARAOKE_GIGS };

// A mixer's Free play gig for the band on stage.
export function gigFor(model) {
  const base = COMPACT_GIGS[model];
  const over = SONG_GIGS[SONG]?.[model];
  return base && over ? { ...base, ...over } : base;
}

// Free play on a real mixer describes that mixer's gig (the shared text names
// Mixer A/B's two wedges).
export function scenarioFor(def, model = "generic") {
  if (def.id !== "free-play" || !COMPACT_GIGS[model]) return def;
  return { ...def, prompt: gigFor(model).prompt, goal: "No objective — try a monitor mix, the reverb, or plugging in what has no channel yet." };
}

function buildCompactState(model, sourcesById) {
  const def = COMPACT[model];
  const gig = gigFor(model);
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
    // A source on a stage box input (the console hears it over AES50).
    const box = gig.boxPatch?.[s.id];
    if (box) {
      addCable({ from: `${sourceDeviceId(s.id)}/out`, to: `${box[0]}/in${box[1]}`, cable: gig.cableFor?.[s.id] || defaultCableFor(s) });
      continue;
    }
    const where = gig.patch[s.id];
    if (!where) continue; // no channel left for this one
    const [index, jack] = where[0] === "tape" ? [tape, "tape-in"] : where;
    const port = index === tape ? "tape-in" : `ch${index + 1}-${jack}`;
    const cable = gig.cableFor?.[s.id] || (s.stereo ? { lr: "mini-dual-ts", rca: "mini-rca", mini: "mini", "tape-in": "mini-rca" }[jack] : s.room ? "xlr" : defaultCableFor(s));
    const from = s.room ? `room-pair/out-${s.id === "room-l" ? "l" : "r"}` : `${sourceDeviceId(s.id)}/out`;
    addCable({ from, to: `mixer/${port}`, cable });
  }
  for (const c of gig.cables) addCable(c);
  if (gig.reverb) {
    addCable({ from: gig.reverb.send, to: "reverb/in-l", cable: "trs" });
    addCable({ from: "reverb/out-l", to: `mixer/${gig.reverb.ret}-l`, cable: "trs" });
    addCable({ from: "reverb/out-r", to: `mixer/${gig.reverb.ret}-r`, cable: "trs" });
  }

  // Input routing first: a stage box's sources only reach their channels through it.
  if (gig.inSource) state.rig.devices.find((d) => d.id === "mixer").inSource = [...gig.inSource];
  // Gain-stage and mix what is patched.
  const mix = compactModel(model).computeMix(state, sourcesById, STEMS, (src) => sourcePeakDb(src, STEMS));
  for (const s of sources) {
    const where = gig.patch[s.id] || (gig.boxPatch?.[s.id] && [gig.boxPatch[s.id][2], "aes"]);
    if (!where || where[0] === "tape") continue;
    const ch = state.channels[where[0]];
    const c = def.channels[where[0]];
    const input = mix.channels[where[0]].input;
    if (c.gain.minus10) ch.minus10 = (gig.minus10 || []).includes(s.id);
    if (c.gain.pad) ch.pad = (gig.padFor || []).includes(s.id);
    if (gig.pre) ch.pre = true;
    for (const b of gig.preFor || []) if (ch.pres && b in ch.pres) ch.pres[b] = true;
    if (c.comp && gig.comp?.[s.id]) ch.comp = gig.comp[s.id];
    if (c.hpf && gig.hpf?.[s.id]) ch.hpf = gig.hpf[s.id];
    if (c.dyn && gig.dyn?.[s.id]) {
      ch.dyn = { ...gig.dyn[s.id] };
      ch.compOn = true;
    }
    if (def.phantom.perChannel && s.phantom === "required") ch.phantom = true;
    if (c.gain.switch) ch.micLine = s.signalLevel === "line" ? "line" : "mic";
    else if (c.gain.min !== undefined) ch.gainDb = clamp(gig.gainDb ?? -s.outputDb - channelGainDb(def, { ...ch, gainDb: 0 }, input), c.gain.min, c.gain.max);
    // A LEVEL that is also the gain (B207MP3) has to make up the source's level as well.
    ch.level = levelLaw(def).toPos(def.levelIsGain ? s.mixDb - s.outputDb - channelGainDb(def, ch, input) : s.mixDb);
    if (!ch.stereo && !def.mono) ch.pan = gig.pans?.[s.id] ?? s.pan;
    if ((gig.lrOff || []).includes(s.id)) ch.lr = false; // MAIN LR switch off: in its mixes, not the house
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
  // Phantom switched in groups (01V96: CH1–4, 5–8, 9–12): one powered channel powers its group.
  for (const g of def.phantom.groups || []) if (g.some((i) => state.channels[i].phantom)) for (const i of g) state.channels[i].phantom = true;
  for (const b of Object.keys(def.buses)) if (state[b].pre !== undefined) state[b].pre = true; // monitors pre-fader
  if (state.reverb) state.reverb.on = true;
  if (state.monitor) state.monitor.level = 0.5;
  if (gig.link && state.link) {
    state.link.mode = gig.link;
    state.channels[def.link.pair[0]].pan = 0; // the balance, centred
  }
  if (gig.listen) state.listen = gig.listen;
  if (gig.inSource) state.rig.devices.find((d) => d.id === "mixer").inSource = [...gig.inSource];
  gig.tweak?.(state);
  // Preloaded scenes (full X32): each a copy of this gig, perhaps with changes.
  for (const [n, sc] of (gig.scenes || []).entries()) {
    const copy = structuredClone(state);
    sc.tweak?.(copy);
    const { rig, listen, scenes, ...settings } = copy;
    state.scenes[n] = { name: sc.name, settings };
  }
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
  busDb: (ctx, p) => ctx.mix.busDb?.[p.bus] ?? levelToDb(ctx.state[p.bus].level),
  mainDbByChannel: (ctx) => ctx.mix.channels.map((c) => Math.max(c.mainDb.L, c.mainDb.R)),
  sendDbByChannel: (ctx, p) => ctx.mix.channels.map((c) => (c.sourceId ? c.aux[p.bus].sendDb : -Infinity)),
  // A channel's own GAIN and fader (dB), for "fix only the fault" scenarios.
  channelSettings: (ctx, p) => {
    const i = indexOf(ctx, p.source);
    const ch = ctx.state.channels[i];
    return { gainDb: ch.gainDb, faderDb: ctx.mix.channels[i].faderDb ?? levelToDb(ch.level) };
  },
  // What each channel contributes to a wedge that actually makes sound.
  monitorByChannel: (ctx, p) => ctx.mix.channels.map((c) => c.aux[p.bus].heardDb),
  // Every channel fader (dB), for "use the master, not the faders".
  fadersByChannel: (ctx) => ctx.mix.channels.map((c) => c.faderDb ?? -Infinity),
  // Every channel fader's own position (a DCA doesn't move these).
  channelLevels: (ctx) => ctx.state.channels.map((c) => c.level),
  // Every channel's input gain (TRIM): what a recorder's isos are recorded at.
  channelGains: (ctx) => ctx.state.channels.map((c) => c.gainDb),
};

export function captureBaseline(def, state, sourcesById = SOURCES_BY_ID, stems = STEMS) {
  const mix = computeMix(state, sourcesById, stems);
  const out = {};
  // Where each source sat at the start, so "the same channel" survives a re-patch on a real mixer.
  const patch = Object.fromEntries(mix.channels.filter((c) => c.sourceId).map((c) => [c.sourceId, c.index]));
  for (const [name, spec] of Object.entries(def.baseline || {})) out[name] = METRICS[spec.metric]({ state, mix, sourcesById, patch }, spec);
  if ((state.model || "generic") !== "generic") Object.defineProperty(out, "__patch", { value: patch, enumerable: false });
  return out;
}

// ---------- conditions ----------

// Threshold for "you'd hear it": estimated peak at a speaker, dBFS.
export const AUDIBLE_DB = -45;
const OFF_DB = -60; // a send/contribution below this counts as off

// A source's channel by the source id it is patched from (null if unplugged).
const chanFor = (ctx, sourceId) => ctx.mix.channels.find((c) => c.sourceId === sourceId) || null;
// Index of the channel a source belongs on, whether or not it is plugged in.
// Mixer A/B: the input list (`order`). A real mixer: wherever its gig patched it,
// read from the baseline's patch (`ctx.patch`), else from the current one.
function indexOf(ctx, sourceId) {
  if ((ctx.state.model || "generic") === "generic") return ctx.sourcesById[sourceId] ? ctx.sourcesById[sourceId].order - 1 : -1;
  if (ctx.patch && sourceId in ctx.patch) return ctx.patch[sourceId];
  return ctx.mix.channels.findIndex((c) => c.sourceId === sourceId);
}
const isWorking = (ch) => !!ch && ch.input.connected && ch.input.signal && ch.input.status === "ok";
const isGood = (ch) => isWorking(ch) && (ch.band === "good" || ch.band === "hot");

const usableChannels = (mix) => mix.channels.filter((c) => c.input.connected && c.input.signal && c.input.status === "ok");

const same = (a, b, tol) => (a === -Infinity && b === -Infinity) || (a <= OFF_DB && b <= OFF_DB) || Math.abs(a - b) <= tol;

export const CONDITIONS = {
  // A board scenario's own outcome check: `test(ctx)` returns true when met.
  custom(ctx, c) {
    return { met: !!c.test(ctx) };
  },
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
    // A routed output (full X32) counts by what it carries: "main", "mix1", "mtx1"…
    const ports = c.output === "main" ? ["main-l", "main-r"] : [c.output];
    const fits = (port) => ports.includes(port) || (ctx.state.routing?.[port] && listenGroupOf(ctx.state, port) === c.output);
    const ends = ctx.mix.rig.endpoints.filter((e) => e.valid && fits(e.output) && (!c.zone || e.zone === c.zone) && (!c.device || e.deviceId === c.device));
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
  // An input with no meter of its own (a TAPE IN strip, the B207MP3's LEVEL
  // knobs) can't be checked for a Good band, so it counts by ear: audible in
  // the house, short of clipping. `explain: true` adds a short note on what is
  // still wrong once the signal is on its way (never before: that's the puzzle).
  sourceHeardInMain(ctx, c) {
    const ch = chanFor(ctx, c.source);
    if (!isWorking(ch)) return { met: false };
    const meterless = !!ctx.state.channels[ctx.mix.channels.indexOf(ch)]?.tape || COMPACT[ctx.state.model]?.meter === null;
    const why = (detail) => ({ met: false, detail: c.explain ? detail : undefined });
    if (ch.band === "clip") return why(meterless ? "Too hot: it's clipping the main mix. Watch the main meters." : "Too hot: its input meter is clipping.");
    if (!meterless && !isGood(ch)) return why("Too quiet going in: look at its input meter.");
    const loudest = Math.max(ch.mainDb.L, ch.mainDb.R);
    const quiet = () => why(loudest <= OFF_DB ? undefined : loudest < AUDIBLE_DB ? "It's in the house mix, but too quiet to hear." : "It's in the mix, but the house speakers aren't playing it.");
    if (!c.stereo) return ch.heardMainDb >= AUDIBLE_DB ? { met: true } : quiet();
    // Main L and R: "main-l"/"main-r", or a powered mixer's speaker outs (STAGEPAS).
    const { buses } = ctx.mix.rig;
    const works = (side) => Object.entries(buses).some(([p, ends]) => ends.length > 0 && (p === `main-${side}` || p === `spk-${side}` || ctx.state.routing?.[p] === `main-${side}`));
    const plays = { L: works("l") && ch.mainDb.L >= AUDIBLE_DB, R: works("r") && ch.mainDb.R >= AUDIBLE_DB };
    if (plays.L && plays.R) return { met: true };
    if (plays.L || plays.R) return why(`Only the ${plays.L ? "left" : "right"} house speaker plays it.`);
    return quiet();
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
    const skip = exceptIndexes(ctx, c.except);
    const now = METRICS.monitorByChannel(ctx, c);
    return { met: now.every((v, i) => skip.includes(i) || same(v, base[i], c.toleranceDb)) };
  },
  monitorRaised(ctx, c) {
    const now = METRICS.heardMonitorDb(ctx, c);
    const base = ctx.baseline[c.baseline];
    return { met: now - base >= c.minDb && now >= AUDIBLE_DB, detail: delta(now, base) };
  },
  mainUnchanged(ctx, c) {
    const base = ctx.baseline[c.baseline];
    const now = METRICS.mainDbByChannel(ctx);
    const skip = exceptIndexes(ctx, c.except);
    const moved = now.map((v, i) => !skip.includes(i) && !same(v, base[i], c.toleranceDb));
    return { met: !moved.some(Boolean), moved: moved.map((m, i) => (m ? i : -1)).filter((i) => i >= 0) };
  },
  masterRaised(ctx, c) {
    const now = METRICS.busDb(ctx, c);
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

// `except`: one source id or a list of them.
const exceptIndexes = (ctx, except) => (except ? [].concat(except).map((id) => indexOf(ctx, id)) : []);

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
  const ctx = { state, mix, baseline, sourcesById, session, patch: baseline.__patch };
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
  for (const s of ALL_BOARD_SCENARIOS) {
    for (const c of s.conditions) if (!CONDITIONS[c.type]) problems.push(`${s.id}: condition ${c.type}`);
    for (const c of s.conditions) if (c.baseline && !(s.baseline && s.baseline[c.baseline])) problems.push(`${s.id}: baseline ${c.baseline}`);
    for (const c of s.conditions) if (c.type === "custom" && typeof c.test !== "function") problems.push(`${s.id}: ${c.id} has no test`);
  }
  for (const s of SCENARIOS) {
    for (const d of s.setup.devices) if (!PLAYBACK_DEVICES[d] || !DEVICE_TYPES[PLAYBACK_DEVICES[d].type]) problems.push(`${s.id}: device ${d}`);
    for (const c of s.conditions) if (!CONDITIONS[c.type]) problems.push(`${s.id}: condition ${c.type}`);
    for (const c of s.conditions) if (c.baseline && !(s.baseline && s.baseline[c.baseline])) problems.push(`${s.id}: baseline ${c.baseline}`);
  }
  return problems;
}
