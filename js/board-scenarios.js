// Practice scenarios for the real mixers, five or six per board, easiest first.
// Each starts from that mixer's Free play gig (js/scenarios.js COMPACT_GIGS, or
// the CR1604-VLZ's), then `setup.tweak(state, h)` makes the problem; `h` is
// boardHelpers() in js/scenarios.js. Conditions are the usual library
// (docs/SCENARIOS.md) plus `custom` checks written here as outcomes.
//
// These are practice, not the Canvas assignment: the numbered scenarios on
// Mixer A/B are what the submission reports. See docs/SCENARIOS.md.

import { LAWS } from "./compact.js";
import * as CR1604 from "./cr1604.js";

const AUDIBLE = -45; // as AUDIBLE_DB in js/scenarios.js
const OFF = -60;

// ---------- reading the mix ----------

const mc = (ctx, src) => ctx.mix.channels.find((c) => c.sourceId === src) || null;
const sc = (ctx, src) => {
  const c = mc(ctx, src);
  return c ? ctx.state.channels[c.index] : null;
};
const house = (ctx, src) => mc(ctx, src)?.heardMainDb ?? -Infinity;
const wedge = (ctx, bus, src) => mc(ctx, src)?.aux[bus]?.heardDb ?? -Infinity;
const into = (ctx, bus, src) => mc(ctx, src)?.aux[bus]?.monitorDb ?? -Infinity;
const onAlt = (ctx, src) => {
  const a = mc(ctx, src)?.altDb;
  return !!a && Math.max(a.L, a.R) >= AUDIBLE;
};
const endpoint = (ctx, id) => ctx.mix.rig.endpoints.find((e) => e.deviceId === id) || null;
const heard = (ctx, dest) => ctx.state.listen === dest || !!ctx.session.listened?.has(dest);
// Pre-fader: what reaches the bus is the input + send + master, with no fader in it.
function ignoresFader(ctx, bus, src) {
  const c = mc(ctx, src);
  if (!c) return false;
  const a = c.aux[bus];
  return a.monitorDb > -Infinity && Math.abs(a.monitorDb - (c.inputPeakDb + a.sendDb + (ctx.mix.busDb?.[bus] ?? 0))) < 0.25;
}

const goal = (id, label, test) => ({ id, kind: "goal", type: "custom", label, test });
const keep = (id, label, test) => ({ id, kind: "keep", type: "custom", label, test });

// The common "doors open" scenario: the laptop is patched; get it into the house in stereo.
const doors = (board, { who = "Stage manager", prompt, hints, complete }) => ({
  id: `${board}-doors`,
  short: "Doors music",
  title: "Doors music",
  who,
  prompt,
  goal: "The preshow music from the laptop, in stereo, through both house speakers.",
  setup: {},
  conditions: [
    { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "preshow", stereo: true, label: "The music comes out of both house speakers, left and right" },
    { id: "vocal", kind: "keep", type: "sourcePatched", source: "lead-vocal", label: "The singer's mic stays plugged in" },
  ],
  hints,
  complete,
});

// ---------- Mackie Mix8 ----------

const MIX8 = [
  doors("mix8", {
    prompt: "“Doors in five minutes and the room is silent. The laptop is already plugged into TAPE IN — get the music into the house.”",
    hints: [
      "The laptop is on TAPE IN, the RCA pair in the master section. Where does TAPE IN go right now?",
      "TAPE IN has one switch: TO MAIN, or TO CR/PHONES only. At the moment only your headphones get it.",
      "Switch TO CR/PHONES off, so TAPE IN goes into the MAIN MIX.",
    ],
    complete: "On the Mix8, TAPE IN goes either into the MAIN MIX or only to CR/PHONES. That second position is for cueing music in headphones before the audience hears it.",
  }),
  {
    id: "mix8-keys-wedge",
    short: "Keys in the wedge",
    title: "Keys in the wedge",
    who: "Lead singer",
    prompt: "“I can't find my pitch — I can't hear the piano. Put some keys in my wedge, but I still need to be the loudest thing in it.”",
    goal: "The keys audible in the singer's wedge, at least 3 dB under the vocal, with the house mix unchanged.",
    setup: { tweak: (st, h) => h.sendDb("keys", "aux", -Infinity) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux1", label: "You listened to the singer's wedge" },
      { id: "keys", kind: "goal", type: "monitorLittle", bus: "aux1", source: "keys", below: ["lead-vocal"], byDb: 3, label: "The keys are in the wedge, under the vocal" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: [
      "Listen to the AUX (the singer's wedge) first. What's in it?",
      "Each channel's AUX knob sets how much of it goes to the wedge. The keys are on stereo channel 3/4.",
      "Turn up channel 3/4's AUX knob until the keys are there, but quieter than the vocal. Leave its LEVEL alone: that's the house.",
    ],
    complete: "The AUX knob builds the wedge mix; the channel LEVEL builds the house. Two knobs on one channel, two destinations.",
  },
  {
    id: "mix8-speech",
    short: "Cue it in the phones",
    title: "Cue it in your headphones",
    who: "MC",
    prompt: "“I'm about to talk. Take the music out of the house, but keep it in your headphones so you can bring it straight back when I'm done.”",
    goal: "The music out of the house speakers, still in your headphones, the MC's mic still live.",
    setup: { tweak: (st, h) => (st.channels[st.channels.length - 1].toCr = false) },
    conditions: [
      goal("out", "The music is out of the house speakers", (ctx) => house(ctx, "preshow") < AUDIBLE),
      goal("cue", "The music still reaches your headphones", (ctx) => !!ctx.mix.phones?.sources.includes("tape")),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "phones", label: "You listened in your headphones" },
      { id: "mic", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The mic on channel 1 stays in the house" },
    ],
    hints: [
      "Don't pull the MAIN MIX down: that takes the MC's mic out too.",
      "TAPE IN's one switch sends the laptop either to the MAIN MIX or to CR/PHONES only.",
      "Press TO CR/PHONES, then switch Listen to the PHONES to check the music is still there.",
    ],
    complete: "TO CR/PHONES moved the music off the house and into your headphones in one press. When the MC finishes, one more press puts it back.",
  },
  {
    id: "mix8-ballad",
    short: "The ballad",
    title: "The ballad",
    who: "Lead singer",
    prompt: "“For the ballad you pulled my vocal down in the house — and my wedge went quiet too! Keep the house as it is, but give me my voice back.”",
    goal: "The vocal back up in the wedge (by at least 9 dB) while the house mix stays exactly as it is.",
    setup: { tweak: (st, h) => h.moveFader("lead-vocal", -12), listen: "aux1" },
    baseline: {
      vox: { metric: "heardMonitorDb", bus: "aux1", source: "lead-vocal" },
      main: { metric: "mainDbByChannel" },
      wedge: { metric: "monitorByChannel", bus: "aux1" },
    },
    conditions: [
      { id: "vox", kind: "goal", type: "monitorRaised", bus: "aux1", source: "lead-vocal", baseline: "vox", minDb: 9, label: "The vocal is back up in the wedge" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1.5, label: "The house mix stays as it is (the vocal stays down for the ballad)" },
      { id: "others", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "wedge", except: "lead-vocal", toleranceDb: 1, label: "Everything else in the wedge stays the same" },
    ],
    hints: [
      "On the Mix8, the AUX is post-fader: it's taken after the channel LEVEL. So turning the vocal down in the house turned it down in the wedge.",
      "You can't move the vocal LEVEL back up: the house would change. What else sets how much vocal the wedge gets?",
      "Turn channel 1's AUX knob up by about as much as the LEVEL went down.",
    ],
    complete: "A post-fader send follows the fader. That's right for effects, awkward for wedges; with only a post-fader AUX, every house move needs a matching AUX move. Boards with a PRE switch avoid this.",
  },
  {
    id: "mix8-guest",
    short: "Guest guitarist",
    title: "The guest guitarist",
    who: "Guest guitarist",
    prompt: "“I'm sitting in for one song. My amp's mic is on stage — get it into the house. Your backing singer is taking a break.”",
    goal: "The guitar amp mic heard in the house, with the lead vocal still there.",
    setup: {},
    conditions: [
      { id: "gtr", kind: "goal", type: "sourceHeardInMain", source: "guitars", label: "The guitar is heard in the house at a healthy level" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The lead vocal stays in the house" },
      { id: "chain", kind: "keep", type: "validChain", output: "main", zone: "foh", label: "The house speakers keep working" },
    ],
    hints: [
      "The guitar amp has a dynamic mic: mic level, XLR. Which Mix8 channels have a mic preamp?",
      "Only channels 1 and 2 take a mic; 3/4 and 5/6 are line inputs, far too quiet for a mic. Both mic channels are in use.",
      "The backing singer is on a break: unplug their mic from channel 2 and plug the guitar mic in. Check the input level.",
    ],
    complete: "A small mixer is a channel budget. Two mic preamps means two mics at a time, however many stereo line channels are free.",
  },
];

// ---------- Mackie 1202-VLZ ----------

const VLZ = [
  doors("vlz1202", {
    prompt: "“House open in five. The laptop is plugged into stereo channel 7/8 — let's hear the preshow music.”",
    hints: [
      "The laptop is already patched to channel 7/8, a stereo line channel. What's stopping it?",
      "Look at channel 7/8's LEVEL knob.",
      "Bring 7/8's LEVEL up towards U. The stereo channel keeps left and right apart, so both speakers play.",
    ],
    complete: "A stereo line channel takes a laptop or player as one strip: one LEVEL, left and right to the two sides of the MAIN MIX.",
  }),
  {
    id: "vlz1202-pfl",
    short: "Check the singer first",
    title: "Check the singer first",
    who: "Lead singer (side of stage)",
    prompt: "“Can you check my mic before I walk on? Don't let the audience hear it yet — it's muted for now.”",
    goal: "The vocal mic in your headphones while it stays out of the house.",
    setup: { tweak: (st, h) => h.set("lead-vocal", "enabled", false) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("solo", "The vocal mic is in your headphones", (ctx) => !!sc(ctx, "lead-vocal")?.solo && ctx.mix.phones.solo),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "phones", label: "You listened in your headphones" },
      keep("muted", "The vocal stays out of the house", (ctx) => house(ctx, "lead-vocal") < AUDIBLE),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix doesn't change" },
    ],
    hints: [
      "You want to hear one channel on its own, in your headphones only.",
      "That's the channel's SOLO button: it puts the channel into C-R/PHONES (and the meters), before its LEVEL.",
      "Press SOLO on channel 3 and switch Listen to the PHONES. Leave MUTE/ALT pressed.",
    ],
    complete: "SOLO on the 1202 is PFL: it listens before the MUTE and the LEVEL, so you can check a muted mic without the audience hearing a thing.",
  },
  {
    id: "vlz1202-reverb",
    short: "Reverb on the harmonies",
    title: "Reverb on the harmonies",
    who: "Band leader",
    prompt: "“The vocals sound bone dry tonight. Bring the reverb back, and put the harmonies in it too.”",
    goal: "The reverb return back in the main mix, with the backing vocals sent to it as well as the lead.",
    setup: {
      tweak: (st, h) => {
        h.bus("ret1", "level", 0);
        h.sendDb("backing-vocals", "aux2", -Infinity);
      },
    },
    baseline: { main: { metric: "mainDbByChannel" }, wedge: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      goal("return", "The reverb comes back into the main mix", (ctx) => LAWS.ret20.toDb(ctx.state.ret1.level) >= -10),
      goal("bv", "The backing vocals are sent to the reverb", (ctx) => into(ctx, "aux2", "backing-vocals") >= -40),
      keep("vox", "The lead vocal stays in the reverb", (ctx) => into(ctx, "aux2", "lead-vocal") >= -40),
      { id: "wedge", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "wedge", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
    ],
    hints: [
      "The reverb unit is fed from AUX 2 and comes back on AUX RETURN 1. Two things are missing: what goes in, and what comes back.",
      "What comes back: the RET 1 knob in the master section. What goes in: each channel's AUX 2 knob.",
      "Turn RET 1 up to about U, and turn channel 4's AUX 2 knob up. Leave AUX 1 alone: that's the wedge.",
    ],
    complete: "An effects loop has two halves: the AUX send decides who is in the reverb, the RETURN decides how much reverb is in the mix.",
  },
  {
    id: "vlz1202-prefader",
    short: "Wedge follows the faders",
    title: "The wedge follows the faders",
    who: "Lead singer",
    prompt: "“Every time you ride my vocal in the house, my wedge goes up and down with it! Make my wedge stay put.”",
    goal: "The singer's wedge independent of the house faders, without changing the house mix.",
    setup: {
      tweak: (st, h) => {
        h.bus("aux1", "pre", false);
        h.moveFader("lead-vocal", -6);
      },
      listen: "aux1",
    },
    baseline: { main: { metric: "mainDbByChannel" }, sends: { metric: "sendDbByChannel", bus: "aux1" } },
    conditions: [
      goal("pre", "The vocal in the wedge no longer follows its LEVEL knob", (ctx) => ignoresFader(ctx, "aux1", "lead-vocal")),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1.5, label: "The house mix stays the same" },
      { id: "balance", kind: "keep", type: "sendBalanceKept", bus: "aux1", baseline: "sends", toleranceDb: 1, label: "The AUX 1 sends keep their balance" },
    ],
    hints: [
      "If the wedge moves when a house LEVEL moves, the wedge is being fed after the LEVEL: post-fader.",
      "AUX 1 on the 1202 can be taken before the LEVEL. There's one switch for the whole AUX 1 bus, by its master knob.",
      "Press AUX 1's PRE switch in the master section.",
    ],
    complete: "PRE takes AUX 1 before every channel's LEVEL, so the house can be mixed freely and the wedge stays put. It also brought the vocal back up in the wedge, because its LEVEL was 6 dB down.",
  },
  {
    id: "vlz1202-alt",
    short: "Drums for the video crew",
    title: "Drums and bass for the video crew",
    who: "Video crew",
    prompt: "“We need just the drums and bass on a separate output for the drum-cam recorder. Keep them in the house as they are.”",
    goal: "Drums and bass on the ALT 3-4 bus (and nothing else), still heard in the house at the same level.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("alt", "The drums and bass are on the ALT 3-4 outputs", (ctx) => onAlt(ctx, "drums") && onAlt(ctx, "bass")),
      keep("house", "The drums and bass stay in the house", (ctx) => house(ctx, "drums") >= AUDIBLE && house(ctx, "bass") >= AUDIBLE),
      keep("only", "Nothing else goes to ALT 3-4", (ctx) => !["lead-vocal", "backing-vocals", "keys"].some((s) => onAlt(ctx, s))),
      { id: "mix", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1.5, label: "The house mix stays the same" },
    ],
    hints: [
      "The 1202 has a second stereo bus with its own outputs: ALT 3-4. How does a channel get onto it?",
      "MUTE/ALT 3-4 takes a channel off MAIN and onto ALT 3-4. That would take it out of the house... unless ALT 3-4 comes back into MAIN.",
      "Press MUTE/ALT on channels 1 and 2, then press ASSIGN TO MAIN in the ALT 3-4 section.",
    ],
    complete: "MUTE/ALT plus ASSIGN TO MAIN turns ALT 3-4 into a subgroup: the drums and bass reach the house through it and also come out of the ALT outputs for the recorder.",
  },
];

// ---------- Yamaha MG10/2 ----------

const MG = [
  doors("mg102", {
    prompt: "“House open in five. The laptop is on channel 9/10 with an RCA cable — let's hear it.”",
    hints: [
      "The laptop is patched to stereo channel 9/10. What's stopping it?",
      "Look at channel 9/10's LEVEL.",
      "Bring 9/10's LEVEL up. 9/10 is built for consumer (−10) gear like a laptop, so it needs no gain.",
    ],
    complete: "Channels 7/8 and 9/10 are stereo line channels with RCA jacks: one strip for a laptop or player.",
  }),
  {
    id: "mg102-phantom",
    short: "Silent overhead",
    title: "The silent overhead",
    who: "Drummer",
    prompt: "“Somebody pressed a button and my overhead mic went dead.”",
    goal: "The drum overhead heard in the house again.",
    setup: { tweak: (st) => st.channels.forEach((c) => (c.phantom = false)) },
    conditions: [
      { id: "drums", kind: "goal", type: "sourceHeardInMain", source: "drums", label: "The drums are heard in the house" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays in the house" },
    ],
    hints: [
      "The overhead is a condenser mic. What does a condenser need that a dynamic mic doesn't?",
      "Phantom power. On the MG10/2 it's one switch for all the XLR inputs.",
      "Press PHANTOM +48V in the master section. (Expect a thump.)",
    ],
    complete: "A condenser mic is silent without phantom power. The MG10/2's one +48V switch feeds every XLR input; dynamic mics and DIs don't mind it.",
  },
  {
    id: "mg102-less-drums",
    short: "Too much drums",
    title: "Too much drums in my wedge",
    who: "Lead singer",
    prompt: "“My wedge is all drums. I can barely hear myself.”",
    goal: "The drums at least 10 dB under the vocal in the singer's wedge, with the house unchanged.",
    setup: { tweak: (st, h) => h.set("drums", "sends.auxPan", -1) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux1", label: "You listened to the singer's wedge" },
      goal("drums", "The drums are well under the vocal in the wedge", (ctx) => wedge(ctx, "aux1", "drums") <= wedge(ctx, "aux1", "lead-vocal") - 10),
      keep("vox", "The vocal stays in the wedge", (ctx) => wedge(ctx, "aux1", "lead-vocal") >= -30),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: [
      "Listen to AUX1 (the wedge). Which channel is pouring into it?",
      "On the MG10/2 each channel's AUX knob feeds AUX1 (the wedge) when it's turned left of centre.",
      "Turn the drums' AUX knob (channel 3/4) back towards the centre.",
    ],
    complete: "The drums' AUX knob was turned all the way left, full into AUX1. The house LEVEL wouldn't have helped: AUX1 is pre-fader.",
  },
  {
    id: "mg102-one-knob",
    short: "One knob, two jobs",
    title: "One knob, two jobs",
    who: "Backing singer",
    prompt: "“I can't hear myself in the wedge at all.”",
    goal: "The backing vocal clearly in the singer's wedge, with the house unchanged.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux1", label: "You listened to the wedge" },
      { id: "bv", kind: "goal", type: "monitorPresent", bus: "aux1", sources: ["backing-vocals"], minDb: -30, label: "The backing vocal is in the wedge" },
      keep("vox", "The lead vocal stays in the wedge", (ctx) => wedge(ctx, "aux1", "lead-vocal") >= -30),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: [
      "Look at channel 2's AUX knob. Which way is it turned?",
      "Right of centre feeds AUX2, the reverb. Left of centre feeds AUX1, the wedge. One knob can't do both.",
      "Turn channel 2's AUX knob left of centre. The backing vocal loses its reverb: that's the trade on this mixer.",
    ],
    complete: "The MG10/2 has one AUX knob per channel: AUX1 (pre, the wedge) to the left, AUX2 (post, the reverb) to the right. Each channel goes to the wedge or the reverb, never both.",
  },
  {
    id: "mg102-rumble",
    short: "Stage rumble",
    title: "Stage rumble",
    who: "Venue tech",
    prompt: "“There's low rumble from the stage coming through the vocal mics. Clean them up, but the kick and bass have to stay full.”",
    goal: "The 80 Hz high-pass on both vocal mics, and off on the drums and bass.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "lowCut", false);
        h.set("backing-vocals", "lowCut", false);
        h.set("drums", "lowCut", true);
        h.set("bass", "lowCut", true);
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("vox", "Both vocal mics lose the rumble below 80 Hz", (ctx) => !!sc(ctx, "lead-vocal")?.lowCut && !!sc(ctx, "backing-vocals")?.lowCut),
      goal("low", "The drums and bass keep their low end", (ctx) => !sc(ctx, "drums")?.lowCut && !sc(ctx, "bass")?.lowCut),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels in the house stay the same" },
    ],
    hints: [
      "Rumble is very low frequency. A voice has almost nothing down there; a kick drum and a bass guitar have a lot.",
      "Each mic channel has an 80 Hz high-pass filter button.",
      "Turn the 80 Hz button on for channels 1 and 2, and off for 3/4 and 5/6. Listen to the drums with it on and off.",
    ],
    complete: "A high-pass (low cut) on every vocal mic is standard: it removes rumble and handling noise the voice doesn't need. On kick and bass it would take away the music.",
  },
];

// ---------- Yamaha STAGEPAS 400BT ----------

const SP = [
  doors("stagepas400bt", {
    prompt: "“Doors in five. The laptop's on channel 7/8 — can we have the preshow music?”",
    hints: [
      "The laptop is patched to stereo channel 7/8 with a 3.5 mm cable. What's stopping it?",
      "Look at channel 7/8's LEVEL.",
      "Bring 7/8's LEVEL up. The speakers are already working.",
    ],
    complete: "Channel 7/8 takes a phone or laptop on 3.5 mm (or Bluetooth on the real unit). One LEVEL for the pair.",
  }),
  {
    id: "stagepas400bt-micline",
    short: "Weak bass",
    title: "The weak bass",
    who: "Bassist",
    prompt: "“Why am I so quiet? My DI's plugged into channel 4.”",
    goal: "The bass at a healthy input level and heard in the house, with the rest of the mix unchanged.",
    setup: { tweak: (st, h) => h.set("bass", "micLine", "line") },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "gain", kind: "goal", type: "sourceGain", source: "bass", label: "The bass reaches a healthy input level" },
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "bass", label: "The bass is heard in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "bass", toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: [
      "The STAGEPAS has no GAIN knob. What sets how much the input is amplified?",
      "Each channel's MIC/LINE switch: MIC adds a lot of gain, LINE very little. A DI box puts out mic level.",
      "Set channel 4's switch to MIC. Turning its LEVEL up instead only turns up a weak signal.",
    ],
    complete: "Gain comes first. A mic-level DI on a LINE setting stays weak however far you turn the LEVEL. Here the MIC/LINE switch is the only gain control.",
  },
  {
    id: "stagepas400bt-monitor",
    short: "Silent monitor",
    title: "The silent monitor",
    who: "Lead singer",
    prompt: "“My monitor's plugged in, but it's silent.”",
    goal: "The wedge on MONITOR OUT playing, with the house unchanged.",
    setup: { tweak: (st, h) => h.bus("monitor", "level", 0) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "monitor", label: "You listened to the monitor" },
      goal("up", "MONITOR OUT is up", (ctx) => LAWS.master.toDb(ctx.state.monitor.level) >= -10),
      { id: "chain", kind: "keep", type: "validChain", output: "mon-l", device: "wedge", label: "The wedge stays plugged into MONITOR OUT" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: [
      "Listen to the MONITOR. Where is the wedge plugged in?",
      "MONITOR OUT has its own LEVEL knob, and MASTER LEVEL doesn't affect it.",
      "Turn MONITOR OUT's LEVEL up.",
    ],
    complete: "On the STAGEPAS, MONITOR OUT carries the whole mix at its own level: no per-channel monitor sends. Turning MASTER up would only have made the house louder.",
  },
  {
    id: "stagepas400bt-speakers",
    short: "Silent speakers",
    title: "The silent speakers",
    who: "Venue tech",
    prompt: "“We set up the two STAGEPAS speakers, but neither is making a sound.”",
    goal: "Both STAGEPAS speakers working from the mixer, nothing wired wrong.",
    setup: {
      tweak: (st, h) => {
        h.cut("mixer/spk-l");
        h.cut("mixer/spk-r");
        h.cable("mixer/mon-r", "sp-l/in", "speaker");
      },
    },
    conditions: [
      goal("both", "Both STAGEPAS speakers are driven by the mixer", (ctx) => ["sp-l", "sp-r"].every((id) => endpoint(ctx, id)?.valid)),
      { id: "broken", kind: "goal", type: "noBrokenChains", zone: "foh", label: "No speaker is hooked up wrong" },
      { id: "heard", kind: "goal", type: "heardInMain", min: 3, label: "The band is heard in the house" },
      { id: "wedge", kind: "keep", type: "validChain", output: "mon-l", device: "wedge", label: "The wedge keeps working" },
    ],
    hints: [
      "The STAGEPAS speakers are passive: no amp inside. Where is the amplifier?",
      "Inside the mixer. Its SPEAKERS L/R jacks carry speaker level; MONITOR OUT is only line level.",
      "Unplug MONITOR OUT R, then run speaker cables from SPEAKERS L and R to the two speakers.",
    ],
    complete: "On a powered mixer the amp is in the mixer, so the speakers plug into its SPEAKERS jacks with speaker cable. MONITOR OUT is line level, for a powered wedge.",
  },
  {
    id: "stagepas400bt-reverb",
    short: "Reverb on the voices",
    title: "Reverb on the voices only",
    who: "Band leader",
    prompt: "“Everything's washy. The guitar and bass are swimming in reverb. Keep it on the voices only.”",
    goal: "No reverb on the guitar and bass; both voices keep theirs.",
    setup: {
      tweak: (st, h) => {
        h.sendDb("guitars", "reverb", 0);
        h.sendDb("bass", "reverb", 0);
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("dry", "The guitar and bass have no reverb", (ctx) => ["guitars", "bass"].every((s) => LAWS.send15.toDb(sc(ctx, s)?.sends.reverb ?? 0) <= -40)),
      keep("voices", "Both voices keep their reverb", (ctx) => ctx.state.reverb.on && ["lead-vocal", "backing-vocals"].every((s) => LAWS.send15.toDb(sc(ctx, s)?.sends.reverb ?? 0) >= -20)),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry mix stays the same" },
    ],
    hints: [
      "Don't switch the reverb off: the voices need it.",
      "Each channel has its own REVERB knob.",
      "Turn the REVERB knobs on channels 3 and 4 all the way down.",
    ],
    complete: "The REVERB switch and TYPE/TIME are for the whole mixer; each channel's REVERB knob decides who's in it. Low instruments usually stay dry.",
  },
];

// ---------- Behringer Xenyx X1204USB ----------

const XEN = [
  doors("x1204usb", {
    prompt: "“House open in five. The laptop's on stereo channel 7/8 — preshow music, please.”",
    hints: [
      "The laptop is patched to channel 7/8, and its LEVEL switch is already at −10 dBV for consumer gear. What's stopping it?",
      "Look at channel 7/8's fader.",
      "Push channel 7/8's fader up towards U.",
    ],
    complete: "A stereo channel takes the laptop as one strip. Its −10 dBV switch adds 12 dB for consumer-level gear like laptops and phones.",
  }),
  {
    id: "x1204usb-fx",
    short: "Reverb on the vocal",
    title: "Reverb on the vocal",
    who: "Lead singer",
    prompt: "“My voice sounds dry tonight. Where's the reverb?”",
    goal: "The vocal sent to the built-in effects, and the effects back in the main mix.",
    setup: {
      tweak: (st, h) => {
        h.sendDb("lead-vocal", "fx", -Infinity);
        h.bus("ret2", "level", 0);
      },
    },
    baseline: { main: { metric: "mainDbByChannel" }, wedge: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      goal("send", "The vocal is sent to the effects", (ctx) => into(ctx, "aux2", "lead-vocal") >= -40),
      goal("return", "The effects come back into the MAIN MIX", (ctx) => LAWS.ret20.toDb(ctx.state.ret2.level) >= -10 && !ctx.state.ret2.toAlt),
      { id: "wedge", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "wedge", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
    ],
    hints: [
      "The Xenyx has effects built in. Signal goes in from each channel's FX knob and comes back somewhere in the master section.",
      "In: channel 1's FX knob. Back: STEREO AUX RETURN 2 (FX), the RET 2 knob.",
      "Turn up channel 1's FX knob and RET 2. Pick a reverb with PROGRAM.",
    ],
    complete: "FX is the Xenyx's AUX 2, wired straight to its effects. The effect comes back on RETURN 2: the FX knobs choose who gets reverb, RET 2 sets how much.",
  },
  {
    id: "x1204usb-wedge",
    short: "What's in my wedge?",
    title: "What's in my wedge?",
    who: "Lead singer",
    prompt: "“Something is way too loud in my wedge. I can't hear myself.”",
    goal: "Find it and pull it at least 6 dB under the vocal in the wedge, with the house unchanged.",
    setup: { tweak: (st, h) => h.sendDb("keys", "aux1", 10) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("listen", "You listened to the wedge mix (or soloed AUX 1 in your headphones)", (ctx) => heard(ctx, "aux1") || (ctx.state.aux1.solo && heard(ctx, "phones"))),
      { id: "keys", kind: "goal", type: "monitorLittle", bus: "aux1", source: "keys", below: ["lead-vocal"], byDb: 6, label: "The keys sit under the vocal in the wedge" },
      { id: "vox", kind: "keep", type: "monitorPresent", bus: "aux1", sources: ["lead-vocal"], minDb: -30, label: "The vocal stays in the wedge" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: [
      "First find it. You can listen to AUX 1, or press SOLO by the AUX SEND 1 master to hear the wedge mix in your headphones.",
      "Look along the AUX 1 knobs. One is turned up much further than the rest.",
      "Turn channel 5/6's AUX 1 knob down until the keys sit under the vocal. Leave the faders alone.",
    ],
    complete: "AUX SOLO lets you hear any wedge mix in your headphones without walking to the stage. Diagnose with your ears, then fix the one send.",
  },
  {
    id: "x1204usb-pre",
    short: "Guitar vanishes",
    title: "The guitar vanishes",
    who: "Lead singer",
    prompt: "“Whenever you turn the guitar down in the house it vanishes from my wedge, and I need it there to stay in tune!”",
    goal: "The guitar in the wedge no longer following its fader, with the house mix unchanged.",
    setup: {
      tweak: (st, h) => {
        h.set("guitars", "pre", false);
        h.moveFader("guitars", -12);
      },
      listen: "aux1",
    },
    baseline: {
      gtr: { metric: "heardMonitorDb", bus: "aux1", source: "guitars" },
      main: { metric: "mainDbByChannel" },
      wedge: { metric: "monitorByChannel", bus: "aux1" },
    },
    conditions: [
      goal("pre", "The guitar in the wedge ignores its fader", (ctx) => ignoresFader(ctx, "aux1", "guitars")),
      { id: "back", kind: "goal", type: "monitorRaised", bus: "aux1", source: "guitars", baseline: "gtr", minDb: 8, label: "The guitar is back in the wedge" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1.5, label: "The house mix stays the same" },
      { id: "others", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "wedge", except: "guitars", toleranceDb: 1, label: "The rest of the wedge stays the same" },
    ],
    hints: [
      "If the wedge follows the house fader, that channel's AUX 1 is taken after the fader.",
      "On the Xenyx each channel has its own PRE switch beside its AUX 1 knob.",
      "Press PRE on channel 3.",
    ],
    complete: "PRE moves channel 3's AUX 1 before its fader: the singer's guitar level is now set only by the AUX 1 knob. The Xenyx lets each channel choose, so check them one by one.",
  },
  {
    id: "x1204usb-alt",
    short: "The MC break",
    title: "The MC break",
    who: "MC",
    prompt: "“While I talk between songs, take the band out of the house, but keep them ready in your headphones so each one comes back with a single press.”",
    goal: "Guitar, bass and keys out of the house and onto ALT 3-4, which you hear in your headphones; the MC's mic stays live.",
    setup: {},
    conditions: [
      goal("out", "Guitar, bass and keys are out of the house", (ctx) => ["guitars", "bass", "keys"].every((s) => house(ctx, s) < AUDIBLE)),
      goal("alt", "They're waiting on the ALT 3-4 bus", (ctx) => ["guitars", "bass", "keys"].every((s) => onAlt(ctx, s))),
      goal("cue", "Your headphones hear ALT 3-4", (ctx) => !!ctx.mix.phones?.sources.includes("alt") && heard(ctx, "phones")),
      { id: "mic", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The MC's mic (channel 1) stays in the house" },
    ],
    hints: [
      "Pulling the faders down would lose your levels. Which button takes a channel out of the MAIN MIX and puts it somewhere else?",
      "MUTE/ALT 3-4 moves a channel to the ALT 3-4 bus. The PHONES/CTRL R section can listen to ALT 3-4.",
      "Press MUTE/ALT on channels 3, 4 and 5/6, press ALT 3-4 in the PHONES/CTRL R SOURCE, and switch Listen to the PHONES.",
    ],
    complete: "MUTE/ALT 3-4 parks a channel on a second bus instead of silencing it, faders untouched. Listening to ALT 3-4 lets you check the band is ready before you bring it back.",
  },
];

// ---------- Sound Devices 442 ----------

const camerasOk = (ctx) => ["cam-1", "cam-2"].every((id) => endpoint(ctx, id)?.status === "ok");
const camerasFed = (ctx) => ["cam-1", "cam-2"].every((id) => endpoint(ctx, id)?.valid);

const SD = [
  {
    id: "sd442-camera",
    short: "Distorted camera",
    title: "The distorted camera",
    who: "Camera operator",
    prompt: "“The audio on my camera is completely distorted. Turning my levels down doesn't help.”",
    goal: "Both camera inputs getting the level they're set for.",
    setup: { tweak: (st, h) => ["cam-1", "cam-2"].forEach((id) => h.dev(id, "inputLevel", 0)) },
    conditions: [
      goal("match", "Both camera inputs match the level they're fed", camerasOk),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "main", label: "You listened to what the camera records" },
      keep("fed", "The camera stays connected to the XLR outs", camerasFed),
    ],
    hints: [
      "Distortion that doesn't go away when you turn down suggests a level mismatch, not a loudness problem. Look at the Outputs.",
      "The 442's XLR outs are set to LINE. The camera inputs are set to MIC, which adds about 40 dB of gain.",
      "Set both camera inputs to LINE on their cards in the Outputs (or set the 442's XLR OUTPUT LEVEL to MIC).",
    ],
    complete: "Line level into a mic input is about 40 dB too hot, and the camera's preamp clips before any level control can help. Match the type of level first, then set the volume.",
  },
  {
    id: "sd442-tone",
    short: "Line up with tone",
    title: "Line up with tone",
    who: "Camera operator",
    prompt: "“Before we roll, send me tone so I can set my levels.”",
    goal: "The 442's tone oscillator on the outputs, heard at the camera.",
    setup: {},
    conditions: [
      goal("tone", "1 kHz tone is on the outputs", (ctx) => !!ctx.state.tone.on),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "main", label: "You listened at the camera" },
      keep("ok", "The camera inputs match the level they're fed", camerasOk),
    ],
    hints: [
      "Tone is a steady reference: everyone down the line sets their meters to it.",
      "The 442 has a TONE switch in its TONE / SLATE section.",
      "Switch TONE on and Listen to MAIN (the camera). Turn it off before you roll!",
    ],
    complete: "The 442 sends 1 kHz at 0 dBu: the camera op sets their meter to its reference mark, and the two devices agree on levels. The headphones get it 20 dB down to save your ears.",
  },
  {
    id: "sd442-phantom",
    short: "Silent room mics",
    title: "The silent room mics",
    who: "Producer",
    prompt: "“The room mics are dead. I've got the vocals, but no audience sound at all.”",
    goal: "Both room mics heard at the camera again.",
    setup: {
      tweak: (st, h) => {
        h.set("room-l", "phantom", false);
        h.set("room-r", "phantom", false);
      },
    },
    conditions: [
      { id: "l", kind: "goal", type: "sourceHeardInMain", source: "room-l", label: "The left room mic is heard" },
      { id: "r", kind: "goal", type: "sourceHeardInMain", source: "room-r", label: "The right room mic is heard" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays on the camera" },
      keep("cam", "The camera inputs match the level they're fed", camerasOk),
    ],
    hints: [
      "The room pair is two condenser mics. What do they need?",
      "Phantom power. On the 442 it's set per channel.",
      "Press P48 on channels 1 and 2.",
    ],
    complete: "The 442 powers each input separately (P48 or DYN), so condensers get phantom and dynamic mics don't need it. On batteries, phantom only where it's needed saves power.",
  },
  {
    id: "sd442-mono",
    short: "Mono check",
    title: "The mono check",
    who: "Producer",
    prompt: "“On a phone speaker the room sounds thin and hollow. Something's wrong with the pair.”",
    goal: "Listen to the pair in mono, then fix what makes it hollow.",
    setup: { tweak: (st, h) => h.set("room-r", "polarity", true) },
    conditions: [
      goal("mono", "You're listening in mono (HEADPHONE: M)", (ctx) => ctx.state.cr.src === "M" && heard(ctx, "phones")),
      goal("phase", "The two room mics are back in polarity", (ctx) => !sc(ctx, "room-r")?.polarity),
      { id: "l", kind: "keep", type: "sourceHeardInMain", source: "room-l", label: "Both room mics stay on" },
      { id: "r", kind: "keep", type: "sourceHeardInMain", source: "room-r", label: "Both room mics stay on" },
    ],
    hints: [
      "A phone speaker plays left + right summed: mono. Listen the same way.",
      "Set the HEADPHONE selector to M. A pair with one side flipped cancels itself in mono, so it sounds thin.",
      "Channel 2's Ø (polarity) switch is on. Switch it off and listen to the room fill out in M.",
    ],
    complete: "Flipping one mic's polarity makes the two mics cancel when they're summed, and phone speakers sum them. Always check a stereo pair in mono.",
  },
  {
    id: "sd442-iso",
    short: "Two tracks",
    title: "Two tracks for the editor",
    who: "Editor",
    prompt: "“Put both vocal mics on camera channel 1 and the room pair on channel 2, so I can balance them later.”",
    goal: "Vocals only on the left output (camera 1), the room pair only on the right (camera 2), limiters treating them separately.",
    setup: {},
    conditions: [
      goal("vox", "Both vocal mics go only to camera channel 1", (ctx) => ["lead-vocal", "backing-vocals"].every((s) => mc(ctx, s)?.mainDb.L >= AUDIBLE && mc(ctx, s)?.mainDb.R < OFF)),
      goal("room", "Both room mics go only to camera channel 2", (ctx) => ["room-l", "room-r"].every((s) => mc(ctx, s)?.mainDb.R >= AUDIBLE && mc(ctx, s)?.mainDb.L < OFF)),
      goal("lim", "The limiters act on each camera channel separately", (ctx) => ctx.state.lim.mode === "on"),
      keep("cam", "The camera inputs match the level they're fed", camerasOk),
    ],
    hints: [
      "The 442 has two outputs, L and R. Used as two mono tracks, each mic's PAN chooses its track.",
      "Channels 1 and 2 are linked as a stereo pair (1+2 LINK), so 1 is stuck on the left. Unlink them first. With two separate tracks, the limiters shouldn't be linked either.",
      "Turn 1+2 LINK off, pan both room mics hard right and both vocal mics hard left, and set LIM to ON.",
    ],
    complete: "Two mono tracks keep the editor's options open. LIM LINK is for one stereo picture; with separate tracks ON lets each limiter work alone.",
  },
];

// ---------- Soundcraft Ui16 ----------

const UI = [
  doors("ui16", {
    prompt: "“Doors in five. The laptop is on the RCA line input (13/14) — preshow music, please.”",
    hints: [
      "Everything on the Ui16 is on screen. The laptop's channel is 13/14, at the right of the fader bank.",
      "On the MIX page the faders send each channel into the MASTER. Look at 13/14's fader.",
      "On the MIX page, push channel 13/14's fader up.",
    ],
    complete: "The MIX page is the house: each fader is a channel's level into the MASTER. The other pages use the same faders for other jobs.",
  }),
  {
    id: "ui16-gain",
    short: "Tiny vocal",
    title: "The tiny vocal",
    who: "Lead singer",
    prompt: "“Can you even hear me? I sound tiny.”",
    goal: "The vocal at a healthy input level and heard in the house, with the rest of the mix unchanged.",
    setup: { tweak: (st, h) => h.set("lead-vocal", "gainDb", -6) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "gain", kind: "goal", type: "sourceGain", source: "lead-vocal", label: "The vocal reaches a healthy input level" },
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal is heard in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "lead-vocal", toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: [
      "Gain first: a weak input stays weak whatever the fader does. Where's the input gain on a digital mixer?",
      "The GAIN page turns the faders into preamp gains. Or SEL the channel and use GAIN in its panel.",
      "Bring channel 7's GAIN up until its meter sits around the middle.",
    ],
    complete: "On the Ui16 the preamp is remote-controlled: the GAIN page, or the SEL panel. Same gain staging as any analog desk.",
  },
  {
    id: "ui16-more-keys",
    short: "More keys, drummer",
    title: "More keys for the drummer",
    who: "Drummer",
    prompt: "“I can't hear the piano. Give me more keys in my wedge.”",
    goal: "The keys at least 4 dB louder in the drummer's wedge (AUX 2), with everything else unchanged.",
    setup: {},
    baseline: {
      send: { metric: "sendDb", bus: "aux2", source: "keys" },
      keys: { metric: "heardMonitorDb", bus: "aux2", source: "keys" },
      drummer: { metric: "monitorByChannel", bus: "aux2" },
      singer: { metric: "monitorByChannel", bus: "aux1" },
      main: { metric: "mainDbByChannel" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux2", label: "You listened to the drummer's wedge" },
      { id: "send", kind: "goal", type: "sendRaised", bus: "aux2", source: "keys", baseline: "send", minDb: 4, label: "The keys' send to the drummer's wedge is up" },
      { id: "heard", kind: "goal", type: "monitorRaised", bus: "aux2", source: "keys", baseline: "keys", minDb: 4, label: "The drummer hears more keys" },
      { id: "rest", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", except: "keys", toleranceDb: 1, label: "The rest of the drummer's wedge stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: [
      "The drummer's wedge is AUX 2. Listen to it first.",
      "Pick AUX 2 in the bar above the faders: now every fader is that channel's send into AUX 2.",
      "On the AUX 2 page, push the keys' fader (channel 4) up. Then go back to MIX and check nothing moved there.",
    ],
    complete: "\"Sends on faders\": on the AUX 2 page the faders are the drummer's mix. The same fader means something different on every page, so always check which page you're on.",
  },
  {
    id: "ui16-trumpet-reverb",
    short: "Reverb on the horns",
    title: "Reverb on the horns",
    who: "Trumpet player",
    prompt: "“Our solo sounds like we're in a closet. Can we have some reverb?”",
    goal: "The trumpets sent to the built-in REVERB, with the dry mix and the wedges unchanged.",
    setup: { tweak: (st, h) => h.sendDb("trumpets", "fx1", -Infinity) },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" }, drummer: { metric: "monitorByChannel", bus: "aux2" } },
    conditions: [
      goal("send", "The trumpets are sent to the reverb", (ctx) => into(ctx, "fx1", "trumpets") >= -40),
      keep("return", "The reverb comes back into the MASTER", (ctx) => (ctx.mix.busDb?.fx1 ?? -Infinity) >= -20),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
    ],
    hints: [
      "The effects are built in. Each one has a page in the bar above the faders.",
      "On the REVERB page the faders are sends into the reverb; the fader on the right is how much reverb comes back.",
      "Pick REVERB and push channel 5's fader up. (Or SEL channel 5 and turn up REVERB in its panel.)",
    ],
    complete: "A built-in effect works like an analog effects loop with no cables: the sends choose who's in it, the return sets how much comes back. Effects sends are post-fader, so the reverb follows the trumpets' fader.",
  },
  {
    id: "ui16-out-of-house",
    short: "Out of the house",
    title: "Out of the house, still in the wedge",
    who: "Bassist",
    prompt: "“The venue's subs are booming, so take the bass out of the house for this song — but the drummer still needs me in his wedge.”",
    goal: "The bass out of the house, still in the drummer's wedge, with everything else unchanged.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      goal("out", "The bass is out of the house", (ctx) => house(ctx, "bass") < AUDIBLE),
      { id: "wedge", kind: "keep", type: "monitorPresent", bus: "aux2", sources: ["bass"], minDb: -30, label: "The drummer still hears the bass" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "bass", toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: [
      "Try MUTE first and listen to the drummer's wedge (AUX 2). What happens?",
      "On the Ui16, MUTE takes a channel out of every mix, wedges too. The aux sends are pre-fader, though.",
      "Leave MUTE off and pull the bass's fader all the way down on the MIX page.",
    ],
    complete: "On this desk MUTE means out of everything, wedges included. Pre-fader aux sends ignore the MIX fader, so the fader is the way to take a channel out of the house only. (On the CR1604, MUTE spares the PRE sends: check how each desk does it.)",
  },
  {
    id: "ui16-guitar-mix",
    short: "Guitarist's mix",
    title: "A mix for the guitarist",
    who: "Guitarist",
    prompt: "“I've got my own wedge now, on AUX 3. Give me lots of me, the vocal, and a bit of drums.”",
    goal: "A new mix on AUX 3: guitar and vocal clear, drums at least 3 dB under the guitar; the other wedges and the house unchanged.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("gwedge");
        h.cable("mixer/aux3", "gwedge/in", "xlr");
      },
    },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" }, drummer: { metric: "monitorByChannel", bus: "aux2" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux3", label: "You listened to the guitarist's wedge" },
      { id: "core", kind: "goal", type: "monitorPresent", bus: "aux3", sources: ["guitars", "lead-vocal"], minDb: -30, label: "Guitar and vocal are clear in the new wedge" },
      { id: "drums", kind: "goal", type: "monitorLittle", bus: "aux3", source: "drums", below: ["guitars"], byDb: 3, label: "A bit of drums, under the guitar" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: [
      "Pick AUX 3 in the bar above the faders. Every send starts at off.",
      "Build it like any monitor mix: the most important sources first, then a little of the rest. Listen to AUX 3 as you go.",
      "On the AUX 3 page: guitar (3) and vocal (7) faders up near U, drums (1) lower than the guitar.",
    ],
    complete: "A new mix from nothing, on a page of its own, without touching anyone else's. That's the everyday job of a monitor engineer on a digital desk.",
  },
];

// ---------- Mackie CR1604-VLZ ----------

const C16 = [
  doors("cr1604", {
    prompt: "“House open in five. The laptop is plugged into TAPE INPUT — preshow music, please.”",
    hints: [
      "The laptop is on TAPE INPUT, the RCA pair. Is TAPE INPUT going anywhere yet?",
      "TAPE INPUT reaches the house only when TAPE TO MAIN MIX is pressed.",
      "Press TAPE TO MAIN MIX in the master section (and keep TAPE IN's level near U).",
    ],
    complete: "On the 1604, TAPE INPUT is a stereo input with no channel strip: one level and one switch into the MAIN MIX.",
  }),
  {
    id: "cr1604-assign",
    short: "Missing vocal",
    title: "The missing vocal",
    who: "Lead singer",
    prompt: "“Everything's in the house except me!”",
    goal: "The vocal in the house, with the rest of the mix and the wedges unchanged.",
    setup: { tweak: (st, h) => h.set("lead-vocal", "assign.lr", false) },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal is heard in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "lead-vocal", toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: [
      "The singer is in the wedge, so the mic, GAIN and channel all work. What stands between the fader and the house?",
      "On the 1604 a channel reaches the MAIN MIX only if its L-R assign switch (beside the fader) is down.",
      "Press L-R on channel 7.",
    ],
    complete: "The fader sets the level, but the assign switches decide where it goes: L-R, SUB 1-2, SUB 3-4. With none pressed, a channel reaches only the auxes.",
  },
  {
    id: "cr1604-mute-pre",
    short: "Mute, keep the wedges",
    title: "Mute it, keep the wedges",
    who: "Guitarist",
    prompt: "“Take me out of the house while I retune between songs, but both wedges still need me.”",
    goal: "The guitar out of the house, still in both wedges, with everything else unchanged.",
    setup: { tweak: (st, h) => h.set("guitars", "pre", false) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("out", "The guitar is out of the house", (ctx) => house(ctx, "guitars") < AUDIBLE),
      { id: "w1", kind: "keep", type: "monitorPresent", bus: "aux1", sources: ["guitars"], minDb: -35, label: "The guitar stays in the singer's wedge" },
      { id: "w2", kind: "keep", type: "monitorPresent", bus: "aux2", sources: ["guitars"], minDb: -35, label: "The guitar stays in the drummer's wedge" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "guitars", toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: [
      "Try MUTE on channel 3 and listen to a wedge. Is the guitar still there?",
      "On the 1604, MUTE cuts L-R, the subgroups and the post-fader sends. PRE sends keep working.",
      "Press channel 3's PRE switch (AUX 1 and 2 before the fader), then MUTE it.",
    ],
    complete: "On the 1604 MUTE spares pre-fader sends, so a muted channel can still be in the wedges: that's why monitors are run PRE. (The Ui16 is different: MUTE there cuts everything.)",
  },
  {
    id: "cr1604-reverb",
    short: "Lost reverb",
    title: "The lost reverb",
    who: "Lead singer",
    prompt: "“My reverb's gone. I sound like I'm singing in a cupboard.”",
    goal: "The vocal sent to the reverb on AUX 3, and AUX RETURN 1 bringing it back.",
    setup: {
      tweak: (st, h) => {
        h.bus("ret1", "level", 0);
        h.sendDb("lead-vocal", "aux3", -Infinity);
      },
    },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" }, drummer: { metric: "monitorByChannel", bus: "aux2" } },
    conditions: [
      goal("send", "The vocal is sent to the reverb", (ctx) => into(ctx, "aux3", "lead-vocal") >= -40),
      goal("return", "The reverb comes back into the MAIN MIX", (ctx) => CR1604.LAWS.tape.toDb(ctx.state.ret1.level) >= -10),
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
    ],
    hints: [
      "Follow the loop: which AUX feeds the reverb unit, and which return does it come back on? The Outputs show the cables.",
      "AUX SEND 3 feeds the reverb; it comes back on STEREO AUX RETURN 1.",
      "Turn up channel 7's AUX 3 knob, and turn RETURN 1 up to about U.",
    ],
    complete: "Send and return: AUX 3 decides who goes into the reverb, RETURN 1 decides how much reverb is in the mix. Both were down.",
  },
  {
    id: "cr1604-subgroup",
    short: "Rhythm section sub",
    title: "One fader for the rhythm section",
    who: "Band leader",
    prompt: "“In the quiet verse, bring the drums and bass down together, about 6 dB, with one fader.”",
    goal: "Drums and bass reaching the house through SUB 1-2 only, at least 4 dB lower, everything else unchanged.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" }, drummer: { metric: "monitorByChannel", bus: "aux2" } },
    conditions: [
      goal("sub", "Drums and bass reach the house only through SUB 1-2", (ctx) =>
        ["drums", "bass"].every((s) => !sc(ctx, s)?.assign.lr && sc(ctx, s)?.assign.s12 && Math.max(mc(ctx, s).subs.sub1, mc(ctx, s).subs.sub2) > -Infinity && house(ctx, s) >= AUDIBLE),
      ),
      { id: "drums", kind: "goal", type: "mainLowered", source: "drums", baseline: "main", minDb: 4, label: "The drums are down at least 4 dB in the house" },
      { id: "bass", kind: "goal", type: "mainLowered", source: "bass", baseline: "main", minDb: 4, label: "The bass is down at least 4 dB in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: ["drums", "bass"], toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
    ],
    hints: [
      "A subgroup is a fader for several channels at once. The 1604 has four, in pairs: SUB 1-2 and SUB 3-4.",
      "On channels 1 and 2: release L-R, press 1-2. Then SUB 1 and SUB 2 have to reach the MAIN MIX: their ASSIGN TO MAIN MIX switches (SUB 1 left, SUB 2 right).",
      "With SUB 1 and 2 at U the mix sounds the same. Then pull both SUB faders down about 6 dB.",
    ],
    complete: "Channels → subgroup → MAIN: one pair of faders now rides the whole rhythm section. Releasing L-R matters, or the channels reach the house twice and the subgroup can't turn them down.",
  },
];

// Number each board's list from 1 and tag it with its mixer.
const number = (board, list) => list.map((s, i) => ({ board, number: i + 1, ...s }));

export const BOARD_SCENARIOS = {
  mix8: number("mix8", MIX8),
  vlz1202: number("vlz1202", VLZ),
  mg102: number("mg102", MG),
  stagepas400bt: number("stagepas400bt", SP),
  x1204usb: number("x1204usb", XEN),
  sd442: number("sd442", SD),
  ui16: number("ui16", UI),
  cr1604: number("cr1604", C16),
};
