// Practice scenarios for the real mixers, nine to fifteen per board, in teaching
// order (ORDER at the end), so every control gets a real job.
// Each starts from that mixer's Free play gig (js/scenarios.js COMPACT_GIGS, or
// the CR1604-VLZ's), then `setup.tweak(state, h)` makes the problem; `h` is
// boardHelpers() in js/scenarios.js. Conditions are the usual library
// (docs/SCENARIOS.md) plus `custom` checks written here as outcomes.
//
// These are practice, not the Canvas assignment: the numbered scenarios on
// Mixer A/B are what the submission reports. See docs/SCENARIOS.md.

import { COMPACT, LAWS, fxPreset, reverbSetting } from "./compact.js";
import * as CR1604 from "./cr1604.js";
import { DAW_TRACKS } from "./dante.js";

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

// Digital desks: the EQ (or compressor) was set up at soundcheck but never
// switched on. Its knobs all look right; only the ON button and the graph
// give it away. `hints` are the desk's own steps (after a common first one).
const eqOff = (board, { hints, complete }) => ({
  id: `${board}-eq-on`,
  short: "EQ does nothing",
  title: "The EQ that does nothing",
  who: "Lead singer",
  prompt: "“At soundcheck we took the boom and the harshness out of my vocal. Tonight it sounds exactly like it did before we started.”",
  goal: "The vocal's EQ switched on, with the soundcheck settings kept.",
  setup: {
    tweak: (st, h) => {
      h.set("lead-vocal", "peq.low.gain", -6);
      h.set("lead-vocal", "peq.hiMid.gain", -5);
      h.set("lead-vocal", "peq.hiMid.freq", 3000);
      h.set("lead-vocal", "eqOn", false);
    },
  },
  baseline: { main: { metric: "mainDbByChannel" } },
  conditions: [
    goal("on", "The vocal's EQ is switched on", (ctx) => sc(ctx, "lead-vocal")?.eqOn === true),
    keep("kept", "The soundcheck EQ stays (LOW and the 3 kHz band still cut)", (ctx) => {
      const p = sc(ctx, "lead-vocal")?.peq;
      return !!p && p.low.gain <= -3 && p.hiMid.gain <= -3;
    }),
    { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels stay the same" },
  ],
  hints: ["The settings might be fine. Is the EQ actually doing anything? Look at its curve.", ...hints],
  complete,
});

// EQ from scratch: the channel's EQ starts off and flat, so the cut only
// counts (and is only heard) once EQ ON is pressed too.
const eqMud = (board, { hints, complete }) => ({
  id: `${board}-mud`,
  short: "Muddy guitar",
  title: "The muddy guitar",
  who: "Guitarist",
  prompt: "“My guitar sounds muddy and thick, like a blanket over the band.”",
  goal: "The guitar's EQ switched on, with a cut of at least 3 dB in the LOW-MID band between 150 and 500 Hz.",
  setup: {},
  baseline: { main: { metric: "mainDbByChannel" } },
  conditions: [
    goal("cut", "Mud cut: LOW-MID at least 3 dB down, between 150 and 500 Hz", (ctx) => {
      const b = sc(ctx, "guitars")?.peq.lowMid;
      return !!b && b.gain <= -3 && b.freq >= 150 && b.freq <= 500;
    }),
    goal("on", "The guitar's EQ is switched on", (ctx) => sc(ctx, "guitars")?.eqOn === true),
    { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels stay the same" },
  ],
  hints: ["Mud lives in the low mids, roughly 200–400 Hz. Cut, don't boost.", ...hints],
  complete,
});

const compOff = (board, { hints, complete }) => ({
  id: `${board}-comp-on`,
  short: "Comp does nothing",
  title: "The compressor that does nothing",
  who: "Lead singer",
  prompt: "“My loud lines still jump right out over the band. I thought you put a compressor on my vocal?”",
  goal: "The vocal's compressor switched on, with its soundcheck settings kept.",
  setup: {
    tweak: (st, h) => {
      h.set("lead-vocal", "dyn", { threshold: -18, ratio: 4, makeup: 4 });
      h.set("lead-vocal", "compOn", false);
    },
  },
  baseline: { main: { metric: "mainDbByChannel" } },
  conditions: [
    goal("on", "The vocal's compressor is switched on", (ctx) => sc(ctx, "lead-vocal")?.compOn === true),
    keep("kept", "Its settings stay (threshold −10 dB or lower, ratio 2:1 or more)", (ctx) => {
      const d = sc(ctx, "lead-vocal")?.dyn;
      return !!d && d.threshold <= -10 && d.ratio >= 2;
    }),
    { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels stay the same" },
  ],
  hints: ["Threshold, ratio and make-up are all set. So why is nothing being turned down? Watch the GR meter.", ...hints],
  complete,
});

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

// ---------- more scenarios: one for every control that matters ----------
//
// Students reach these after Mixer A/B, so they know GAIN, faders, AUX sends and
// Main. Each board's list (ORDER, below) goes: get sound, gain and tone, the
// wedges, that board's own buttons, then fault-finding and bigger jobs.

// A channel's input level is too hot: bring it into Good with GAIN, change nothing else.
const gainFix = ({ id, short, title, who, prompt, source, gainDb, tweak, label, hints, complete }) => ({
  id,
  short,
  title,
  who,
  prompt,
  goal: "That channel's input in the Good band (not Hot, not clipping), still in the house, nothing else changed.",
  setup: { tweak: tweak || ((st, h) => h.set(source, "gainDb", gainDb)) },
  baseline: { main: { metric: "mainDbByChannel" } },
  conditions: [
    goal("good", label, (ctx) => mc(ctx, source)?.band === "good"),
    keep("heard", "It stays in the house", (ctx) => house(ctx, source) >= AUDIBLE && mc(ctx, source)?.input.status === "ok"),
    { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: source, toleranceDb: 1, label: "Everything else in the house stays the same" },
  ],
  hints,
  complete,
});

// An EQ problem on one channel. The level model leaves EQ out, so the house "levels" can't move.
const eqFix = ({ id, short, title, who, prompt, goalText, source, start, label, check, hints, complete }) => ({
  id,
  short,
  title,
  who,
  prompt,
  goal: goalText,
  setup: { tweak: (st, h) => Object.entries(start).forEach(([k, v]) => h.set(source, k, v)) },
  baseline: { main: { metric: "mainDbByChannel" } },
  conditions: [
    goal("eq", label, (ctx) => !!sc(ctx, source) && check(sc(ctx, source))),
    { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels in the house stay the same (EQ, not faders)" },
  ],
  hints,
  complete,
});

// "Turn the whole wedge down/up" with its master, keeping the balance.
const masterFix = ({ id, short, title, who, prompt, bus, startDb, raise, listenAlt, hints, complete, setLevel }) => ({
  id,
  short,
  title,
  who,
  prompt,
  goal: `The whole wedge ${raise ? "up" : "down"} by at least 8 dB, its balance unchanged.`,
  setup: { tweak: (st, h) => h.bus(bus, "level", setLevel(startDb)) },
  baseline: { master: { metric: "busDb", bus }, sends: { metric: "sendDbByChannel", bus }, main: { metric: "mainDbByChannel" } },
  conditions: [
    goal("listen", listenAlt ? "You listened to the wedge (or soloed its master in your headphones)" : "You listened to the wedge", (ctx) => heard(ctx, bus) || (listenAlt && ctx.state[bus].solo && heard(ctx, "phones"))),
    goal("master", raise ? "The whole wedge is louder" : "The whole wedge is quieter", (ctx) => (raise ? 1 : -1) * ((ctx.mix.busDb?.[bus] ?? 0) - ctx.baseline.master) >= 8),
    { id: "balance", kind: "keep", type: "sendBalanceKept", bus, baseline: "sends", toleranceDb: 1, label: "The balance inside the wedge stays the same" },
    { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
  ],
  hints,
  complete,
});

// A condenser mic moves to a channel that can power it.
const swapToPhantom = ({ id, short, title, who, prompt, out, cable = "xlr", wrongPort, extra, hints, complete, keepSource = "lead-vocal" }) => ({
  id,
  short,
  title,
  who,
  prompt,
  goal: "The drum overhead (a condenser) heard in the house, the lead vocal still there.",
  setup: {
    tweak: (st, h) => {
      if (out) h.unplug(out);
      if (wrongPort) h.cable("src-drums/out", wrongPort, cable);
      if (extra) extra(st, h);
    },
  },
  conditions: [
    { id: "drums", kind: "goal", type: "sourceHeardInMain", source: "drums", label: "The overhead is heard in the house" },
    { id: "vox", kind: "keep", type: "sourceHeardInMain", source: keepSource, label: "The lead vocal stays in the house" },
  ],
  hints,
  complete,
});

const hpfHz = (board, i, pos) => {
  const c = COMPACT[board].channels[i].hpf;
  return pos <= 0.02 ? 0 : c.min + (c.max - c.min) * Math.max(0, (pos - 0.05) / 0.95);
};
const fadersKept = (ctx) => {
  const now = ctx.mix.channels.map((c) => c.faderDb ?? -Infinity);
  return now.every((v, i) => (v === -Infinity && ctx.baseline.faders[i] === -Infinity) || Math.abs(v - ctx.baseline.faders[i]) <= 1);
};
const cableFrom = (ctx, from) => ctx.state.rig.cables.find((c) => c.from === from) || null;

// ----- Mix8 -----

MIX8.push(
  {
    id: "mix8-phones",
    short: "Silent headphones",
    title: "Silent headphones",
    who: "You",
    prompt: "“Your headphones are plugged into CR/PHONES, but you hear nothing.”",
    goal: "The main mix in your headphones.",
    setup: { tweak: (st) => (st.cr.level = 0) },
    conditions: [
      goal("level", "The CR/PHONES level is up", (ctx) => LAWS.master.toDb(ctx.state.cr.level) >= -10),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "phones", label: "You listened in your headphones" },
    ],
    hints: ["The headphones have their own level, separate from MAIN.", "It's in the CR / PHONES section of the master.", "Turn CR / PHONES LEVEL up, and switch Listen to PHONES."],
    complete: "CR/PHONES has its own level: what you hear in the headphones never changes what the audience hears.",
  },
  gainFix({
    id: "mix8-ol",
    short: "OL light",
    title: "The OL light",
    who: "You",
    prompt: "“The backing singer went home, so the keyboard moved to channel 2's LINE input. Now the OL light is on and the piano sounds crunchy.”",
    source: "keys",
    tweak: (st, h) => {
      h.unplug("backing-vocals");
      h.unplug("keys");
      h.cable("src-keys/out", "mixer/ch2-line", "ts");
    },
    label: "The keys' input sits in Good, under the OL light",
    hints: ["OL means the input is close to clipping. Channel 2's GAIN is still where the backing singer's mic needed it.", "A keyboard is line level, far hotter than a mic. Which knob sets how hot the input is?", "Turn channel 2's GAIN down until the meter sits in Good; leave its LEVEL alone."],
    complete: "OL warns you before the preamp clips. Fix it at the GAIN, the first knob, not with the LEVEL: the LEVEL comes after the distortion.",
  }),
  eqFix({
    id: "mix8-boomy",
    short: "Boomy vocal",
    title: "The boomy vocal",
    who: "Lead singer",
    prompt: "“My voice sounds boomy and muddy in the house.”",
    goalText: "Take the boom out of the vocal with its EQ: LOW at or below 0 dB.",
    source: "lead-vocal",
    start: { "eq.low": 12 },
    label: "The vocal's LOW EQ isn't boosting any more",
    check: (c) => c.eq.low <= 0,
    hints: ["Boom is low frequencies. Which part of the channel shapes the tone?", "The 3-band EQ: HI (12 kHz), MID (2.5 kHz), LOW (80 Hz).", "Turn channel 1's LOW back to the centre or below."],
    complete: "Boom lives in the LOW band. Cutting what's too much usually sounds better than boosting what's missing.",
  }),
  {
    id: "mix8-pan",
    short: "Spread the stage",
    title: "Spread the stage",
    who: "Band leader",
    prompt: "“The backing singer stands stage left and the piano stage right. Make the house sound like that.”",
    goal: "The backing vocal clearly left of centre, the keys clearly right, in the house.",
    setup: {},
    conditions: [
      goal("bv", "The backing vocal is left of centre", (ctx) => mc(ctx, "backing-vocals")?.mainDb.L - mc(ctx, "backing-vocals")?.mainDb.R >= 6),
      goal("keys", "The keys are right of centre", (ctx) => mc(ctx, "keys")?.mainDb.R - mc(ctx, "keys")?.mainDb.L >= 6),
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The lead vocal stays in the house" },
    ],
    hints: ["Left and right in the house are set per channel.", "Mono channel 2 has PAN; stereo channel 3/4 has BAL.", "Turn channel 2's PAN left and channel 3/4's BAL right."],
    complete: "PAN places a mono channel between the speakers; BAL tips a stereo channel one way. Both only touch the main mix.",
  },
  masterFix({
    id: "mix8-wedge-loud",
    short: "Wedge too loud",
    title: "The wedge is too loud",
    who: "Lead singer",
    prompt: "“My whole wedge is way too loud. The balance is fine, it's just too much.”",
    bus: "aux1",
    startDb: 12,
    raise: false,
    setLevel: (db) => LAWS.send15.toPos(db),
    hints: ["Every channel's AUX would have to move by the same amount. Is there one control for the whole wedge?", "The AUX MASTER in the master section.", "Turn AUX MASTER down; leave the channel AUX knobs alone."],
    complete: "The AUX MASTER moves the whole wedge without changing what's in it. Channel knobs set the balance, the master sets the level.",
  }),
  swapToPhantom({
    id: "mix8-overhead",
    short: "Acoustic set",
    title: "The acoustic set",
    who: "Band leader",
    prompt: "“Acoustic set: no backing vocals. Put the drum overhead mic on, to catch the cajón.”",
    out: null,
    hints: ["The overhead is a condenser mic: XLR, mic level, and it needs phantom power. Which channels have a mic preamp?", "Only 1 and 2. The backing singer is off, so channel 2 is free. 48V on the Mix8 is one switch for 1 and 2.", "Unplug the backing vocal, plug the overhead into channel 2's MIC, press 48V and check its GAIN."],
    complete: "A condenser needs a mic preamp and phantom power; on the Mix8 only channels 1 and 2 have either.",
  }),
);

// ----- STAGEPAS 400BT -----

SP.push(
  {
    id: "stagepas400bt-speech",
    short: "Speech mode",
    title: "Speech mode",
    who: "Event host",
    prompt: "“Before the band, the principal gives a speech. Make the PA sound clear for talking.”",
    goal: "The whole PA set for speech (MASTER EQ towards SPEECH), the mic still live.",
    setup: {},
    conditions: [
      goal("eq", "The PA is voiced for speech", (ctx) => ctx.state.masterEq.pos <= 0.35),
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The mic on channel 1 stays in the house" },
    ],
    hints: ["Speech needs clarity, not bass. There's a knob for the whole PA's tone.", "MASTER EQ, in the MASTER section: SPEECH at one end, MUSIC in the middle, more bass at the other.", "Turn MASTER EQ towards SPEECH."],
    complete: "MASTER EQ shapes everything at once: SPEECH trims the lows that make talking boomy. Turn it back to MUSIC for the band.",
  },
  {
    id: "stagepas400bt-hall",
    short: "A long hall",
    title: "A long hall for the ballad",
    who: "Lead singer",
    prompt: "“For the ballad I want a big, long hall on my voice.”",
    goal: "The reverb set to a HALL of at least 3 seconds, still on the vocals.",
    setup: {},
    conditions: [
      goal("hall", "The reverb is a long HALL", (ctx) => {
        const r = reverbSetting(COMPACT.stagepas400bt, ctx.state.reverb.type);
        return r.type === "HALL" && r.seconds >= 3;
      }),
      keep("on", "The vocals keep their reverb", (ctx) => ctx.state.reverb.on && LAWS.send15.toDb(sc(ctx, "lead-vocal")?.sends.reverb ?? 0) >= -20),
    ],
    hints: ["The STAGEPAS reverb has one knob for its type and length.", "TYPE/TIME: four types (HALL, PLATE, ROOM, ECHO), each from short to long.", "Turn TYPE/TIME towards the long end of HALL (about 3 s or more)."],
    complete: "One knob chooses both the kind of space and its length. Long halls suit ballads; short rooms and plates suit busy songs.",
  },
  {
    id: "stagepas400bt-mono",
    short: "Mono laptop",
    title: "Half the song is missing",
    who: "Audience member (stage left)",
    prompt: "“Over here by the left speaker, half the music is missing — I only hear the drums.”",
    goal: "The laptop's music the same from both speakers (mono), still playing.",
    setup: { tweak: (st, h) => h.faderDb("preshow", -4) },
    conditions: [
      goal("mono", "The laptop channel is summed to mono", (ctx) => !!sc(ctx, "preshow")?.stMono),
      keep("heard", "The music keeps playing", (ctx) => house(ctx, "preshow") >= AUDIBLE),
    ],
    hints: ["Some songs are mixed hard left and right. Near one speaker you only hear one side.", "Stereo channels 5/6 and 7/8 have an ST/MONO switch.", "Press MONO on channel 7/8."],
    complete: "In a room, people near one speaker hear mostly that side. MONO sends both sides everywhere, which is often right for background music.",
  },
  swapToPhantom({
    id: "stagepas400bt-overhead",
    short: "Overhead on ch 3",
    title: "The overhead on channel 3",
    who: "Drummer",
    prompt: "“I plugged my overhead mic into channel 3 and pressed PHANTOM, but it's silent.”",
    out: "guitars",
    wrongPort: "mixer/ch3-in",
    extra: (st) => [0, 1].forEach((i) => (st.channels[i].phantom = true)), // PHANTOM (CH1/2) is on
    keepSource: "backing-vocals",
    hints: ["Phantom is on. Does it reach channel 3?", "On the STAGEPAS, PHANTOM only powers channels 1 and 2. The backing singer's dynamic mic doesn't need it.", "Swap them: overhead into channel 2, backing vocal mic into channel 3."],
    complete: "Not every channel gets phantom. On the STAGEPAS it's only CH1/2, so condensers go there and dynamic mics go anywhere.",
  }),
  {
    id: "stagepas400bt-sub",
    short: "Add the sub",
    title: "Add the subwoofer",
    who: "Venue tech",
    prompt: "“We brought a powered subwoofer for the dance set. Hook it up.”",
    goal: "The subwoofer working from the mixer's SUBWOOFER OUT, the main speakers still working.",
    setup: { tweak: (st, h) => h.addDevice("sub") },
    conditions: [
      { id: "sub", kind: "goal", type: "validChain", output: "sub-out", device: "sub", label: "The subwoofer is fed from SUBWOOFER OUT" },
      keep("main", "Both STAGEPAS speakers keep working", (ctx) => ["sp-l", "sp-r"].every((id) => endpoint(ctx, id)?.valid)),
      { id: "wedge", kind: "keep", type: "validChain", output: "mon-l", device: "wedge", label: "The wedge keeps working" },
    ],
    hints: ["A powered sub has its own amp, so it takes line level.", "The STAGEPAS has a SUBWOOFER OUT; with something plugged in, the speakers stop reproducing below 120 Hz.", "Run a cable from SUBWOOFER OUT to the subwoofer's input."],
    complete: "SUBWOOFER OUT carries the lows; with it patched, the main speakers hand everything under 120 Hz to the sub (a crossover) and get cleaner.",
  },
  {
    id: "stagepas400bt-feedback",
    short: "Squealing wedge",
    title: "The squealing wedge",
    who: "Lead singer",
    prompt: "“My wedge squeals when I step back from the mic during the loud chorus.”",
    goal: "The feedback suppressor on, the wedge still loud enough.",
    setup: {},
    conditions: [
      goal("fbs", "The feedback suppressor is on", (ctx) => !!ctx.state.fbs.on),
      keep("wedge", "The wedge stays up", (ctx) => LAWS.master.toDb(ctx.state.monitor.level) >= -10),
    ],
    hints: ["Feedback is a loop: speaker into mic into speaker. Turning the wedge down works but the singer loses it.", "The STAGEPAS has a FEEDBACK SUPPRESSOR.", "Press FEEDBACK SUPP. in the MASTER section."],
    complete: "A feedback suppressor finds a ringing frequency and notches it out. It helps, but mic placement and wedge level matter more.",
  },
);

// ----- MG10/2 -----

MG.push(
  gainFix({
    id: "mg102-peak",
    short: "PEAK light",
    title: "The flashing PEAK light",
    who: "You",
    prompt: "“The drum channel's PEAK light is flashing on every hit.”",
    source: "drums",
    gainDb: 52,
    label: "The drums' input sits in Good, under the PEAK light",
    hints: ["PEAK lights before the preamp clips. Where is the preamp's level set?", "The GAIN knob at the top of channel 3/4.", "Turn channel 3/4's GAIN down until the drums sit in Good."],
    complete: "Fix a hot input at the GAIN. The LEVEL and the master come after the preamp, so they can't fix distortion that's already happened.",
  }),
  eqFix({
    id: "mg102-thin-bass",
    short: "Thin bass",
    title: "The thin bass",
    who: "Bassist",
    prompt: "“My bass sounds thin and small. Somebody cut all my low end.”",
    goalText: "Give the bass its low end back with its EQ: LOW at 0 dB or above.",
    source: "bass",
    start: { "eq.low": -12 },
    label: "The bass's LOW EQ is back to flat or boosted",
    check: (c) => c.eq.low >= 0,
    hints: ["Thin means missing lows. Which band is that?", "Channel 5/6's EQ: HIGH 10 kHz, MID 2.5 kHz, LOW 100 Hz.", "Bring channel 5/6's LOW back up to the centre or a little above."],
    complete: "The LOW band at 100 Hz is where a bass's weight lives. A big cut there turns a bass into a guitar.",
  }),
  {
    id: "mg102-reverb-loud",
    short: "Too much reverb",
    title: "Too much reverb",
    who: "Band leader",
    prompt: "“The backing vocals sound like they're in a cathedral. Way too much reverb.”",
    goal: "The reverb return down to a normal level (U or below), still audible.",
    setup: { tweak: (st) => (st.ret1.level = 1) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("ret", "The reverb return is back to U or below", (ctx) => LAWS.ret20.toDb(ctx.state.ret1.level) <= 0),
      keep("on", "There's still some reverb", (ctx) => LAWS.ret20.toDb(ctx.state.ret1.level) >= -30),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry mix stays the same" },
    ],
    hints: ["The reverb unit comes back into the mixer somewhere. Find where.", "The RETURN knob in the master section sets how much reverb is in the mix.", "Turn RETURN down towards U."],
    complete: "The RETURN level is the overall amount of reverb; the channel's AUX knob (turned right) decides who's in it.",
  },
  {
    id: "mg102-2tr",
    short: "Laptop to 2TR IN",
    title: "Free up channel 9/10",
    who: "Keyboard player",
    prompt: "“I need channel 9/10 for my second keyboard. Move the walk-in music somewhere else.”",
    goal: "The laptop playing through the house from 2TR IN, with channel 9/10 left empty.",
    setup: { tweak: (st, h) => h.unplug("preshow") },
    conditions: [
      goal("2tr", "The laptop is on 2TR IN", (ctx) => mc(ctx, "preshow")?.index === COMPACT.mg102.channels.length),
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "preshow", stereo: true, label: "The music plays through both house speakers" },
    ],
    hints: ["Besides the channels, the MG10/2 has a stereo input in the master section.", "2TR IN: an RCA pair that goes straight into the stereo mix, with its own level knob.", "Plug the laptop into 2TR IN with the 3.5 mm ↔ RCA cable and set the 2TR IN level."],
    complete: "2TR IN adds a stereo source without using a channel: no EQ or AUX, just a level into the mix. Perfect for walk-in music.",
  },
);

// ----- 1202-VLZ -----

VLZ.push(
  gainFix({
    id: "vlz1202-trim",
    short: "Hot kick",
    title: "The clipping drums",
    who: "You",
    prompt: "“The drum channel's OL light is lit on every hit, and it sounds crunchy.”",
    source: "drums",
    gainDb: 52,
    label: "The drums' input sits in Good",
    hints: ["Crunchy plus a red light means the preamp is overloaded.", "The TRIM knob at the top of channel 1.", "Turn channel 1's TRIM down until the meter sits in Good."],
    complete: "TRIM sets the preamp. Fix overload there: nothing after it can remove distortion.",
  }),
  eqFix({
    id: "vlz1202-nasal",
    short: "Nasal vocal",
    title: "The nasal vocal",
    who: "Lead singer",
    prompt: "“I sound honky and nasal, like I'm singing through a phone.”",
    goalText: "Take the honk out of the vocal with its MID EQ (at or below 0 dB).",
    source: "lead-vocal",
    start: { "eq.mid": 12 },
    label: "The vocal's MID isn't boosting any more",
    check: (c) => c.eq.mid <= 0,
    hints: ["Honky, telephone-like tone sits in the middle frequencies.", "Channel 3's EQ: HI 12 kHz, MID 2.5 kHz, LOW 80 Hz.", "Turn channel 3's MID back to the centre or a little below."],
    complete: "A big MID boost makes voices honky and phone-like. Small cuts in the mids often make a voice sound more natural.",
  }),
  {
    id: "vlz1202-pad",
    short: "Quiet house",
    title: "The quiet house",
    who: "Venue tech",
    prompt: "“The house is barely audible, even with MAIN MIX all the way up.”",
    goal: "The house at full level again, with the mix untouched.",
    setup: { tweak: (st) => (st.xlrPad.on = true) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("pad", "The XLR main outputs aren't padded down", (ctx) => !ctx.state.xlrPad.on),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The mix stays the same" },
    ],
    hints: ["The mix is fine, so look at the very last thing before the speakers: the XLR main outputs.", "The XLR outs have a −30 dB PAD, for feeding a mic input (a camera, another mixer).", "Release the −30 dB PAD in the XLR OUT section."],
    complete: "The XLR output PAD drops 30 dB: right for a mic input, nearly silent for powered speakers. When everything looks right but it's quiet, check the last switch in the chain.",
  },
  masterFix({
    id: "vlz1202-wedge-quiet",
    short: "Wedge too quiet",
    title: "The quiet wedge",
    who: "Lead singer",
    prompt: "“My whole wedge is too quiet. The balance is right, I just need more of all of it.”",
    bus: "aux1",
    startDb: -20,
    raise: true,
    setLevel: (db) => LAWS.send15.toPos(db),
    hints: ["Turning up every channel's AUX 1 would take ages and change the balance.", "AUX 1 has a master knob in the AUX SENDS section.", "Turn AUX 1 MASTER up."],
    complete: "One master moves the whole wedge. Keep the channel AUX knobs for the balance.",
  }),
  {
    id: "vlz1202-lowcut",
    short: "Low cut",
    title: "Rumble through the vocals",
    who: "Venue tech",
    prompt: "“The stage is rumbling through the vocal mics. Fix it without thinning out the drums and bass.”",
    goal: "LOW CUT on both vocal channels, off on the drums and bass.",
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
      goal("vox", "Both vocal mics lose the rumble", (ctx) => !!sc(ctx, "lead-vocal")?.lowCut && !!sc(ctx, "backing-vocals")?.lowCut),
      goal("low", "The drums and bass keep their low end", (ctx) => !sc(ctx, "drums")?.lowCut && !sc(ctx, "bass")?.lowCut),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels stay the same" },
    ],
    hints: ["Rumble is very low. Voices don't need it; kick and bass do.", "Channels 1–4 have a LOW CUT button: 75 Hz, steep (18 dB/octave).", "LOW CUT on 3 and 4, off on 1 and 2."],
    complete: "LOW CUT on every vocal mic is a habit worth keeping. The 1202's is steep, so it removes rumble without thinning the voice.",
  },
  {
    id: "vlz1202-efx",
    short: "Reverb in the wedge",
    title: "Reverb in the wedge",
    who: "Lead singer",
    prompt: "“The house has lovely reverb on my voice, but my wedge is bone dry. I sing flat without it.”",
    goal: "The reverb (now on AUX RETURN 2) in the singer's wedge as well as the house.",
    setup: {
      tweak: (st, h) => {
        h.cut("mixer/ret1-l");
        h.cut("mixer/ret1-r");
        h.cable("reverb/out-l", "mixer/ret2-l", "trs");
        h.cable("reverb/out-r", "mixer/ret2-r", "trs");
      },
      listen: "aux1",
    },
    baseline: { main: { metric: "mainDbByChannel" }, wedge: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      goal("efx", "The reverb is in the singer's wedge", (ctx) => !!ctx.state.ret2.efx),
      keep("house", "The reverb stays in the house", (ctx) => LAWS.ret20.toDb(ctx.state.ret2.level) >= -10),
      { id: "wedge", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "wedge", toleranceDb: 1, label: "The dry wedge mix stays the same" },
    ],
    hints: ["The reverb comes back on AUX RETURN 2. Can a return reach a wedge?", "AUX RETURN 2 has an EFX TO MON switch: it sends the return into AUX 1.", "Press EFX TO MON in the AUX RETURNS section."],
    complete: "EFX TO MON feeds the effect into the monitor mix too: singers often pitch better with a little reverb in the wedge.",
  },
  {
    id: "vlz1202-tape",
    short: "Cue the next song",
    title: "Cue the next song",
    who: "Stage manager",
    prompt: "“The intro track for the next set is on the laptop, now plugged into TAPE IN. Check it's cued up — in your headphones only.”",
    goal: "The laptop in your headphones through the C-R/PHONES SOURCE, never in the house.",
    setup: {
      tweak: (st, h) => {
        h.unplug("preshow");
        h.cable("src-preshow/out", "mixer/tape-in", "mini-rca");
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("tape", "TAPE is in your headphones", (ctx) => !!ctx.mix.phones?.sources.includes("tape")),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "phones", label: "You listened in your headphones" },
      keep("out", "The track stays out of the house", (ctx) => house(ctx, "preshow") < AUDIBLE),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["On the 1202, TAPE IN only reaches the C-R/PHONES.", "The C-R/PHONES SOURCE buttons: MAIN, ALT 3-4, TAPE. You can press more than one.", "Press TAPE in the C-R/PHONES SOURCE and Listen to the PHONES."],
    complete: "The C-R SOURCE matrix chooses what your headphones hear (MAIN, ALT 3-4, TAPE), without changing the house.",
  },
);

// ----- Xenyx X1204USB -----

XEN.push(
  {
    id: "x1204usb-minus10",
    short: "Consumer level",
    title: "The consumer-level laptop",
    who: "You",
    prompt: "“Someone switched channel 7/8 to +4 dBu. The laptop is a consumer device: set the channel to match.”",
    goal: "Channel 7/8 set for consumer (−10 dBV) gear, the music still playing.",
    setup: {
      tweak: (st, h) => {
        h.set("preshow", "minus10", false);
        h.faderDb("preshow", -6);
      },
    },
    conditions: [
      goal("level", "Channel 7/8 is set for −10 dBV gear", (ctx) => !!sc(ctx, "preshow")?.minus10),
      keep("heard", "The music keeps playing", (ctx) => house(ctx, "preshow") >= AUDIBLE),
    ],
    hints: ["Pro gear runs at +4 dBu, consumer gear (laptops, phones, players) at −10 dBV: about 12 dB lower.", "The stereo channels have a LEVEL switch for that.", "Press the −10 dBV switch on channel 7/8."],
    complete: "The −10 dBV switch adds about 12 dB for consumer gear, so the fader can sit near U instead of at the top.",
  },
  swapToPhantom({
    id: "x1204usb-overhead",
    short: "Overhead on ch 2",
    title: "The overhead for the ballad",
    who: "Band leader",
    prompt: "“The backing singer sits out the ballad. Use channel 2 for the drum overhead.”",
    out: "backing-vocals",
    hints: ["The overhead is a condenser: XLR into a mic channel, plus phantom.", "Channel 2 is free once the backing vocal is unplugged. PHANTOM is one switch on the rear panel for channels 1–4.", "Plug the overhead into channel 2's MIC, switch PHANTOM on and check its GAIN."],
    complete: "One phantom switch powers channels 1–4. Dynamic mics and DIs don't mind, so it can stay on.",
  }),
  {
    id: "x1204usb-pfl",
    short: "Set gain with PFL",
    title: "Set the gain with PFL",
    who: "You",
    prompt: "“The guitar is barely registering. Set its GAIN properly, listening to it alone in your headphones before the fader.”",
    goal: "The guitar's input in Good, set using SOLO in PFL mode.",
    setup: {
      tweak: (st, h) => {
        h.set("guitars", "gainDb", 14);
        st.soloBus.mode = "sip";
      },
    },
    conditions: [
      goal("pfl", "The guitar is soloed in PFL mode", (ctx) => ctx.state.soloBus.mode === "pfl" && !!sc(ctx, "guitars")?.solo),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "phones", label: "You listened in your headphones" },
      goal("good", "The guitar's input sits in Good", (ctx) => mc(ctx, "guitars")?.band === "good"),
    ],
    hints: ["Gain is set looking at the input, before the fader. The Xenyx SOLO has two modes.", "MODE pressed = PFL (before the fader, for setting gain). Up = SOLO in place.", "Press MODE (PFL), SOLO channel 3, Listen to the PHONES, and raise its GAIN to Good."],
    complete: "PFL listens before the fader, so it shows the preamp level whatever the fader does: the right tool for gain. Solo in place is for hearing a channel as it sits in the mix.",
  },
  {
    id: "x1204usb-comp",
    short: "Jumpy vocal",
    title: "The jumpy vocal",
    who: "Lead singer",
    prompt: "“My loud notes jump out and my quiet ones disappear.”",
    goal: "Some compression on the lead vocal: COMP up, but not all the way.",
    setup: { tweak: (st, h) => h.set("lead-vocal", "comp", 0) },
    conditions: [
      goal("comp", "The vocal is compressed, moderately", (ctx) => (sc(ctx, "lead-vocal")?.comp ?? 0) >= 0.2 && (sc(ctx, "lead-vocal")?.comp ?? 1) <= 0.75),
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays in the house" },
    ],
    hints: ["A compressor narrows the gap between loud and quiet.", "Channels 1–4 have a one-knob COMP; its LED lights while it's working.", "Turn channel 1's COMP up until the LED flickers on the loud notes, around a third to a half."],
    complete: "One-knob compression lowers the loud peaks and lifts the rest. Too much sounds squashed and brings up noise, so stop when the LED just flickers.",
  },
  {
    id: "x1204usb-slapback",
    short: "Slapback",
    title: "Slapback for the rockabilly song",
    who: "Lead singer",
    prompt: "“Next song is rockabilly. Give me that short slapback echo instead of the reverb.”",
    goal: "The built-in effects set to SLAPBACK, the vocal still sent to it.",
    setup: {},
    conditions: [
      goal("prog", "The effects program is SLAPBACK", (ctx) => fxPreset(COMPACT.x1204usb, ctx.state.fx.program).name === "SLAPBACK"),
      keep("send", "The vocal stays in the effects", (ctx) => into(ctx, "aux2", "lead-vocal") >= -40 && LAWS.ret20.toDb(ctx.state.ret2.level) >= -10),
    ],
    hints: ["The sends and return stay as they are. Only the effect changes.", "The PROGRAM knob picks one of 16 presets.", "Turn PROGRAM to SLAPBACK (number 10)."],
    complete: "PROGRAM swaps the effect without touching the routing: the FX sends and RET 2 keep working whatever the preset.",
  },
  {
    id: "x1204usb-ret-mon",
    short: "Reverb in the wedge",
    title: "Reverb in the wedge",
    who: "Lead singer",
    prompt: "“We've plugged in our own reverb unit on AUX SEND 2 and RETURN 1. Can I have some of it in my wedge?”",
    goal: "The external reverb on RETURN 1 also fed into the wedge (AUX 1).",
    setup: {
      tweak: (st, h) => {
        h.addGear("reverb");
        h.cable("mixer/aux2", "reverb/in-l", "trs");
        h.cable("reverb/out-l", "mixer/ret1-l", "trs");
        h.cable("reverb/out-r", "mixer/ret1-r", "trs");
        st.ret1.mon = 0;
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("mon", "RETURN 1 feeds the wedge", (ctx) => LAWS.ret20.toDb(ctx.state.ret1.mon) >= -15),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux1", label: "You listened to the wedge" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["The reverb comes back on STEREO AUX RETURN 1. Is there a way from a return to a wedge?", "RETURN 1 has a MON knob: how much of the return goes into AUX 1.", "Turn up the MON knob under RET 1."],
    complete: "RETURN 1's MON knob feeds the effect into the monitor mix, separate from how much is in the house.",
  },
  {
    id: "x1204usb-cdtape",
    short: "Walk-in on CD/TAPE",
    title: "Walk-in music on CD/TAPE IN",
    who: "Keyboard player",
    prompt: "“I need channel 7/8 for my synth. Put the walk-in music somewhere else.”",
    goal: "The laptop playing through the house from CD/TAPE IN, channel 7/8 left empty.",
    setup: { tweak: (st, h) => h.unplug("preshow") },
    conditions: [
      goal("tape", "The laptop is on CD/TAPE IN", (ctx) => mc(ctx, "preshow")?.index === COMPACT.x1204usb.channels.length),
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "preshow", stereo: true, label: "The music plays through both house speakers" },
    ],
    hints: ["The Xenyx has a stereo input that isn't a channel.", "CD/TAPE INPUT (RCA). By itself it only reaches the C-R/PHONES; CD/TAPE TO MAIN sends it to the house.", "Plug the laptop into CD/TAPE IN (3.5 mm ↔ RCA) and press CD/TAPE TO MAIN."],
    complete: "CD/TAPE IN plays straight into the mix with no channel: good for walk-in music and playback, and it frees a channel for a real instrument.",
  },
);

// ----- Sound Devices 442 -----

SD.push(
  gainFix({
    id: "sd442-hot-vocal",
    short: "Distorting vocal",
    title: "The distorting vocal",
    who: "Producer",
    prompt: "“The singer's mic crackles on loud notes. The PEAK light is flashing and the limiter LED is busy.”",
    source: "lead-vocal",
    gainDb: 60,
    label: "The vocal's input sits in Good",
    hints: ["The limiter is catching it, which means the input is far too hot. Fix the cause.", "Each channel has two gain stages: GAIN (coarse, the preamp) and the fader (fine).", "Turn channel 3's GAIN down until the meter sits in Good. Leave the fader at about 0."],
    complete: "On a field mixer, GAIN is set once, then you mix on the faders. The limiter is a safety net, not a level control.",
  }),
  {
    id: "sd442-master",
    short: "Low camera level",
    title: "The camera level is too low",
    who: "Camera operator",
    prompt: "“Your level to my camera is way too low, everything at once. Can you send more?”",
    goal: "MASTER back to about 0 (unity), the channel faders left alone.",
    setup: { tweak: (st) => (st.main.level = LAWS.master6.toPos(-20)) },
    baseline: { faders: { metric: "fadersByChannel" } },
    conditions: [
      goal("master", "MASTER is back at unity (within 3 dB)", (ctx) => Math.abs(ctx.mix.mainMasterDb) <= 3),
      keep("faders", "The channel faders stay where they are", fadersKept),
      keep("cam", "The camera inputs match the level they're fed", camerasOk),
    ],
    hints: ["Everything is too low by the same amount: one control does that.", "The MASTER knob sets both outputs at once, from off up to +6.", "Turn MASTER back up to its 0 mark."],
    complete: "When everything is off by the same amount, fix it at the master. The faders hold the balance.",
  },
  {
    id: "sd442-line",
    short: "A line feed",
    title: "A line feed from the band",
    who: "Producer",
    prompt: "“The keyboard player wants their piano on the video. It's plugged into input 4 now, and it's horribly distorted.”",
    goal: "The keys on input 4 at a healthy level, heard at the camera.",
    setup: {
      tweak: (st, h) => {
        h.unplug("backing-vocals");
        h.cable("src-keys/out", "mixer/ch4-in", "xlr-trs");
        st.channels[3].gainDb = 22;
      },
    },
    conditions: [
      goal("good", "The keys' input sits in Good", (ctx) => mc(ctx, "keys")?.band === "good"),
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "keys", label: "The keys are heard at the camera" },
      keep("vox", "The lead vocal stays on", (ctx) => house(ctx, "lead-vocal") >= AUDIBLE),
    ],
    hints: ["A keyboard is line level, about 40 dB hotter than a mic. Even the lowest GAIN is too much for a mic preamp.", "Every 442 input has a MIC/LINE switch on the input panel: LINE takes 40 dB off.", "Set input 4 to LINE, then bring its GAIN up until the meter sits in Good."],
    complete: "MIC/LINE changes what the input expects. Line level into a mic setting overloads; set LINE, then set GAIN as usual.",
  },
  {
    id: "sd442-hpf",
    short: "Wind rumble",
    title: "Wind on the vocal mics",
    who: "Producer",
    prompt: "“We're outdoors and the wind is rumbling through both vocal mics.”",
    goal: "The high-pass on both vocal mics (at least 100 Hz), not on the room pair.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "hpf", 0);
        h.set("backing-vocals", "hpf", 0);
      },
    },
    conditions: [
      goal("vox", "Both vocal mics are high-passed at 100 Hz or more", (ctx) => ["lead-vocal", "backing-vocals"].every((s) => hpfHz("sd442", mc(ctx, s)?.index ?? 0, sc(ctx, s)?.hpf ?? 0) >= 100)),
      keep("room", "The room pair keeps its low end", (ctx) => ["room-l", "room-r"].every((s) => (sc(ctx, s)?.hpf ?? 0) <= 0.02)),
      keep("cam", "The camera inputs match the level they're fed", camerasOk),
    ],
    hints: ["Wind rumble is very low frequency.", "Each channel's HPF knob sweeps from 80 to 240 Hz; fully left (the detent) is off.", "Turn the HPF on channels 3 and 4 to about 100–150 Hz."],
    complete: "The 442's high-pass sits before the preamp, so wind can't overload it. A windshield on the mic is still the first fix.",
  },
);

// ----- Ui16 -----

UI.push(
  {
    id: "ui16-48v",
    short: "Silent overhead",
    title: "The silent overhead",
    who: "Drummer",
    prompt: "“My overhead mic's dead. It worked at soundcheck.”",
    goal: "The overhead heard in the house again.",
    setup: { tweak: (st, h) => h.set("drums", "phantom", false) },
    conditions: [
      { id: "drums", kind: "goal", type: "sourceHeardInMain", source: "drums", label: "The drums are heard in the house" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays in the house" },
    ],
    hints: ["A condenser mic needs phantom power. On a digital mixer it's set per channel.", "SEL channel 1: its INPUT section has 48V. (The GAIN page has it too.)", "SEL channel 1 and press 48V."],
    complete: "On the Ui16, 48V is per channel and remote-controlled, so it's easy to switch off by mistake. A silent condenser? Check 48V first.",
  },
  {
    id: "ui16-hpf",
    short: "Vocal HPF",
    title: "Rumble through the vocals",
    who: "Venue tech",
    prompt: "“Stage rumble is coming through both vocal mics.”",
    goal: "A high-pass of at least 80 Hz on both vocal channels, none on the bass.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "hpf", 0);
        h.set("backing-vocals", "hpf", 0);
      },
    },
    conditions: [
      goal("vox", "Both vocals are high-passed at 80 Hz or more", (ctx) => ["lead-vocal", "backing-vocals"].every((s) => hpfHz("ui16", mc(ctx, s)?.index ?? 0, sc(ctx, s)?.hpf ?? 0) >= 80)),
      keep("bass", "The bass keeps its low end", (ctx) => (sc(ctx, "bass")?.hpf ?? 0) <= 0.02),
    ],
    hints: ["SEL each vocal channel in turn.", "The INPUT section has an HPF knob (off, then 20–600 Hz).", "Set HPF to about 100 Hz on channels 6 and 7."],
    complete: "The HPF is the first tone control on every vocal. On a digital desk it's in the channel's SEL panel.",
  },
  {
    id: "ui16-harsh",
    short: "Harsh vocal",
    title: "The harsh vocal",
    who: "Lead singer",
    prompt: "“My voice sounds harsh and piercing around the top of my range.”",
    goal: "A cut (at least 2 dB) in the vocal's HI MID band, somewhere between 2 and 5 kHz.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "peq.hiMid.gain", 8);
        h.set("lead-vocal", "peq.hiMid.freq", 3000);
        h.set("lead-vocal", "eqOn", true);
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("eq", "The harshness is cut", (ctx) => {
        const b = sc(ctx, "lead-vocal")?.peq.hiMid;
        return !!b && b.gain <= -2 && b.freq >= 2000 && b.freq <= 5000;
      }),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels stay the same" },
    ],
    hints: ["Harsh, piercing tone lives around 2–5 kHz.", "SEL channel 7: its EQ has four bands, each with GAIN, FREQ and Q. HI MID is boosting right now.", "Turn HI MID's GAIN below 0 (a few dB) and keep its FREQ around 3 kHz."],
    complete: "A parametric EQ picks the exact frequency (FREQ) and width (Q). Find the problem with a boost, then cut it.",
  },
  {
    id: "ui16-comp",
    short: "Jumpy bass",
    title: "The jumpy bass",
    who: "Bassist",
    prompt: "“Some of my notes boom out and others disappear.”",
    goal: "The bass compressed: COMP ON, THRESH at −8 dB or lower, RATIO at least 2.5:1.",
    setup: {
      tweak: (st, h) => {
        h.set("bass", "dyn", { threshold: 0, ratio: 1, makeup: 0 });
        h.set("bass", "compOn", false);
      },
    },
    conditions: [
      goal("comp", "The bass is compressed", (ctx) => sc(ctx, "bass")?.compOn === true && (sc(ctx, "bass")?.dyn.threshold ?? 0) <= -8 && (sc(ctx, "bass")?.dyn.ratio ?? 1) >= 2.5),
      { id: "bass", kind: "keep", type: "sourceHeardInMain", source: "bass", label: "The bass stays in the house" },
    ],
    hints: ["Evening out loud and quiet notes is a compressor's job.", "SEL channel 2: COMPRESSOR has COMP ON, THRESH (where it starts), RATIO (how hard) and GAIN (make-up).", "Press COMP ON, then THRESH around −15 dB, RATIO 3:1 to 4:1 and a little GAIN to get the level back. Watch the curve bend and the GR bar move."],
    complete: "COMP ON switches it in; THRESH decides which notes get turned down, RATIO how much, GAIN brings the whole thing back up. The GR meter shows it working.",
  },
  {
    id: "ui16-delay",
    short: "Delay on the vocal",
    title: "An echo on the last line",
    who: "Lead singer",
    prompt: "“For the last line of the song, I want an echo on my voice.”",
    goal: "The vocal sent to the built-in DELAY, everything else unchanged.",
    setup: { tweak: (st, h) => h.sendDb("lead-vocal", "fx2", -Infinity) },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      goal("send", "The vocal is sent to the delay", (ctx) => into(ctx, "fx2", "lead-vocal") >= -35),
      keep("return", "The delay comes back into the MASTER", (ctx) => (ctx.mix.busDb?.fx2 ?? -Infinity) >= -20),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["Each built-in effect has a page in the mix bar.", "On the DELAY page, the faders are sends into the delay.", "Pick DELAY and push channel 7's fader up (or SEL 7 and turn up DELAY)."],
    complete: "Same pattern as the reverb: sends choose who goes in, the master sets how much comes back.",
  },
  {
    id: "ui16-post",
    short: "A POST send",
    title: "Follow my fader",
    who: "Keyboard player",
    prompt: "“When you ride the piano up for my solo, I want it to come up in the drummer's wedge too.”",
    goal: "The keys' send to AUX 2 switched to POST, so it follows the keys' fader.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("post", "The keys in AUX 2 now follow the keys' fader", (ctx) => !sc(ctx, "keys")?.pres.aux2 && into(ctx, "aux2", "keys") > -Infinity),
      keep("pres", "The other channels' AUX 2 sends stay PRE", (ctx) => ctx.mix.channels.filter((c) => c.sourceId && c.sourceId !== "keys" && c.sourceId !== "preshow").every((c) => ctx.state.channels[c.index].pres.aux2)),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["PRE sends ignore the MIX fader; POST sends follow it.", "On the AUX 2 page each channel has a PRE button. Lit means PRE.", "On the AUX 2 page, press channel 4's PRE so it goes out (POST)."],
    complete: "PRE or POST is chosen per channel, per mix. POST is right when a monitor should follow what you do in the house.",
  },
);

// ----- CR1604-VLZ -----

C16.push(
  {
    id: "cr1604-phantom",
    short: "Silent overhead",
    title: "The silent overhead",
    who: "Drummer",
    prompt: "“My overhead mic isn't working.”",
    goal: "The overhead heard in the house.",
    setup: { tweak: (st) => st.channels.forEach((c) => !c.tape && (c.phantom = false)) },
    conditions: [
      { id: "drums", kind: "goal", type: "sourceHeardInMain", source: "drums", label: "The drums are heard in the house" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays in the house" },
    ],
    hints: ["The overhead is a condenser.", "The 1604's PHANTOM is one switch on the rear panel, for every MIC input.", "Switch PHANTOM on (expect a thump)."],
    complete: "One rear-panel PHANTOM switch powers all 16 MIC inputs. Dynamic mics and DIs are unaffected.",
  },
  {
    id: "cr1604-levelset",
    short: "Level-set the vocal",
    title: "Level-set the vocal",
    who: "You",
    prompt: "“The vocal mic was swapped and its TRIM is way off. Level-set it the proper way, with SOLO in LEVEL SET mode.”",
    goal: "The vocal's input in Good, set using SOLO in LEVEL SET (PFL) mode.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "gainDb", 20);
        st.soloBus.mode = "afl";
      },
    },
    conditions: [
      goal("pfl", "The vocal is soloed in LEVEL SET (PFL) mode", (ctx) => ctx.state.soloBus.mode === "pfl" && !!sc(ctx, "lead-vocal")?.solo),
      { id: "listen", kind: "goal", type: "listenedTo", dest: "phones", label: "You listened in your headphones" },
      goal("good", "The vocal's input sits in Good", (ctx) => mc(ctx, "lead-vocal")?.band === "good"),
    ],
    hints: ["Mackie's level-set: SOLO the channel in LEVEL SET mode and watch the meters.", "MODE switch near the SOLO level: LEVEL SET (PFL) or NORMAL (AFL). PFL shows the input before the fader.", "MODE to LEVEL SET, SOLO channel 7, Listen to the PHONES, then TRIM up to Good (about 0 on the meter)."],
    complete: "In LEVEL SET mode the meters show the soloed channel before its fader: the way to set TRIM on any analog console.",
  },
  eqFix({
    id: "cr1604-sweep",
    short: "Honky horns",
    title: "The honky horns",
    who: "Trumpet player",
    prompt: "“We sound honky, all nose. Someone boosted something around 1 kHz.”",
    goalText: "Cut (at least 3 dB) the trumpets' MID at the problem frequency, around 1 kHz (700 Hz–1.5 kHz).",
    source: "trumpets",
    start: { "eq.mid": 12, "eq.freq": 1000 },
    label: "The honk around 1 kHz is cut",
    check: (c) => c.eq.mid <= -3 && c.eq.freq >= 700 && c.eq.freq <= 1500,
    hints: ["The 1604's MID EQ has two knobs: how much (MID) and where (FREQ).", "MID is boosting +12 at 1 kHz now. Keep FREQ there.", "Turn channel 5's MID below centre (−3 to −6 dB), FREQ near 1 kHz."],
    complete: "A sweepable MID picks the frequency to fix. Boost to find the ugly spot, then cut it there.",
  }),
  {
    id: "cr1604-lowcut",
    short: "Low cut",
    title: "Rumble through the vocals",
    who: "Venue tech",
    prompt: "“There's stage rumble coming through the vocal mics. Keep the kick and bass full.”",
    goal: "LOW CUT on both vocal channels, off on the drums and bass.",
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
      goal("vox", "Both vocal mics lose the rumble", (ctx) => !!sc(ctx, "lead-vocal")?.lowCut && !!sc(ctx, "backing-vocals")?.lowCut),
      goal("low", "The drums and bass keep their low end", (ctx) => !sc(ctx, "drums")?.lowCut && !sc(ctx, "bass")?.lowCut),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels stay the same" },
    ],
    hints: ["Rumble is very low. Voices don't need it; kick and bass do.", "Each channel has a LOW CUT switch (75 Hz, 18 dB/octave).", "LOW CUT on channels 6 and 7, off on 1 and 2."],
    complete: "Mackie's manual recommends LOW CUT on everything except kick and bass. It also protects the speakers from thumps.",
  },
  masterFix({
    id: "cr1604-drummer-quiet",
    short: "Drummer's wedge quiet",
    title: "The drummer can't hear",
    who: "Drummer",
    prompt: "“My whole wedge is too quiet. Check it, then turn the whole thing up.”",
    bus: "aux2",
    startDb: -20,
    raise: true,
    listenAlt: true,
    setLevel: (db) => CR1604.LAWS.master.toPos(db),
    hints: ["You can listen to a wedge from the console: each AUX SEND master has a SOLO button.", "SOLO the AUX SEND 2 master and Listen to the PHONES (or Listen to AUX 2).", "Then turn the AUX SEND 2 master up; leave the channel AUX 2 knobs alone."],
    complete: "AUX SOLO puts a whole monitor mix in your headphones: check it without leaving the desk, then move the master, not every send.",
  }),
  {
    id: "cr1604-efx-mon",
    short: "Reverb in the wedge",
    title: "Reverb in the singer's wedge",
    who: "Lead singer",
    prompt: "“Can I have some of that reverb in my wedge?”",
    goal: "AUX RETURN 1 (the reverb) also feeding the singer's wedge.",
    setup: { listen: "aux1" },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("toaux", "The reverb reaches the singer's wedge", (ctx) => ctx.state.ret1.toAux >= 0.3),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["The reverb comes back on STEREO AUX RETURN 1.", "RETURNS 1 and 2 have an EFFECTS TO MONITORS control: how much of the return goes into AUX SEND 1 (or 2).", "Turn RETURN 1's EFFECTS TO MONITORS (to AUX 1) up."],
    complete: "EFFECTS TO MONITORS feeds a return into a wedge, separate from the house reverb level.",
  },
  {
    id: "cr1604-mono",
    short: "Lobby speaker",
    title: "The lobby speaker",
    who: "Front of house manager",
    prompt: "“The people queuing in the lobby want to hear the show. There's a powered speaker out there.”",
    goal: "The lobby speaker fed a mono mix of the house from the MONO output, at a sensible level.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("lobby");
        st.mono.level = 0;
      },
    },
    conditions: [
      { id: "chain", kind: "goal", type: "validChain", output: "mono", device: "lobby", label: "The lobby speaker is fed from MONO OUT" },
      goal("level", "MONO LEVEL is up", (ctx) => CR1604.LAWS.mono.toDb(ctx.state.mono.level) >= -10),
      { id: "house", kind: "keep", type: "validChain", output: "main", zone: "foh", label: "The house speakers keep working" },
    ],
    hints: ["One speaker should get left and right together: mono. The 1604 has a mono output.", "MONO OUT on the rear panel, with its own MONO LEVEL knob.", "Cable MONO OUT to the lobby speaker and turn MONO LEVEL up."],
    complete: "MONO OUT sums L and R for a single speaker (a lobby, a backstage feed) with its own level, so the house doesn't change.",
  },
  {
    id: "cr1604-shift",
    short: "Horn wedge on AUX 6",
    title: "The horns' wedge on AUX 6",
    who: "Trumpet player",
    prompt: "“We've got our own wedge now, patched to AUX SEND 6. Just us in it, please.”",
    goal: "The trumpets in the horns' wedge (AUX 6), the other wedges unchanged.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("hwedge");
        h.cable("mixer/aux6", "hwedge/in", "trs");
      },
    },
    baseline: { singer: { metric: "monitorByChannel", bus: "aux1" }, drummer: { metric: "monitorByChannel", bus: "aux2" }, main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux6", label: "You listened to the horns' wedge" },
      { id: "tpt", kind: "goal", type: "monitorPresent", bus: "aux6", sources: ["trumpets"], minDb: -35, label: "The trumpets are in their wedge" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["Each channel has four AUX knobs but the 1604 has six AUX SENDs. How do knobs 3 and 4 reach 5 and 6?", "The 5/6 SHIFT switch: with it down, the AUX 3 knob feeds AUX 5 and AUX 4 feeds AUX 6.", "On channel 5: press SHIFT and turn up the AUX 4 knob."],
    complete: "SHIFT moves a channel's AUX 3/4 knobs to sends 5/6. (Here it also moved the trumpets' AUX 3 reverb send to AUX 5; on a real gig, plan which sends need shifting.)",
  },
  {
    id: "cr1604-direct",
    short: "Record the vocal",
    title: "Record the vocal on its own track",
    who: "Band manager",
    prompt: "“We want the lead vocal on its own track of the Zoom F8, clean, for a remix later.”",
    goal: "Channel 7's DIRECT OUT into a Zoom F8 input, that track armed.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("direct", "Channel 7's DIRECT OUT feeds an armed recorder track", (ctx) => {
        const c = cableFrom(ctx, "mixer/ch7-direct");
        const m = c && /^rec\/in(\d)$/.exec(c.to);
        const dev = ctx.state.rig.devices.find((d) => d.id === "rec");
        return !!m && !!dev?.tracks[Number(m[1]) - 1].arm;
      }),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["A per-channel output carries one channel on its own. The 1604 has them on channels 1–8.", "DIRECT OUT 7 (rear panel) → a 1/4\" cable → one of the Zoom F8's inputs. Then open the recorder.", "Cable ch 7 DIRECT OUT to F8 input 1 (TRS) and arm track 1 in the recorder's panel."],
    complete: "DIRECT OUTs feed a multitrack: each channel on its own track, after the fader on the 1604, so the recording follows your mix moves.",
  },
  {
    id: "cr1604-room",
    short: "Record the audience",
    title: "Record the audience",
    who: "Band manager",
    prompt: "“For the live album we need the audience: put the room pair on F8 tracks 3 and 4.”",
    goal: "The room pair's left and right mics on two recorder tracks, powered and armed.",
    setup: {},
    conditions: [
      goal("room", "Both room mics reach armed, working recorder tracks", (ctx) => {
        const dev = ctx.state.rig.devices.find((d) => d.id === "rec");
        const tracks = ctx.mix.rig.recorders?.rec || [];
        return ["room-l", "room-r"].every((s) => {
          const t = tracks.findIndex((x) => x && x.sourceId === s);
          return t >= 0 && tracks[t].status === "ok" && tracks[t].signal && dev.tracks[t].arm;
        });
      }),
      { id: "house", kind: "keep", type: "validChain", output: "main", zone: "foh", label: "The house keeps working" },
    ],
    hints: ["The room pair plugs straight into the recorder, not the mixer.", "Two XLR cables into F8 inputs 3 and 4. They're condensers: the F8's own +48 V, per input.", "Patch the pair into F8 inputs 3 and 4, then in the recorder turn on 48V and arm tracks 3 and 4."],
    complete: "A recorder has its own preamps and phantom. Mics can go straight in for an ambient record, independent of the house mix.",
  },
);


// ----- Behringer X32 Compact -----

const BAND = ["drums", "bass", "guitars", "keys", "trumpets"];

const X32 = [
  doors("x32c", {
    prompt: "“Doors in five. The laptop is on AUX IN 1/2 — preshow music, please.”",
    hints: ["The laptop isn't on channels 1–16. The input faders show one layer at a time.", "Press the AUX / FX layer button: the first strip is AUX 1/2.", "On the AUX / FX layer, push AUX 1/2's fader up."],
    complete: "On a digital console the faders are shared: the layer buttons decide which channels they control right now. Always check the layer before you grab a fader.",
  }),
  {
    id: "x32c-gain",
    short: "Tiny vocal",
    title: "The tiny vocal",
    who: "Lead singer",
    prompt: "“Can you even hear me? I sound tiny.”",
    goal: "The vocal at a healthy input level and heard in the house, the rest unchanged.",
    setup: { tweak: (st, h) => h.set("lead-vocal", "gainDb", -12) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "gain", kind: "goal", type: "sourceGain", source: "lead-vocal", label: "The vocal reaches a healthy input level" },
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal is heard in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "lead-vocal", toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: ["Gain first. On the X32 the preamp is in the channel strip, for whichever channel is selected.", "Press SEL on channel 07: the channel strip on the left now edits it.", "Turn the channel strip's GAIN up until the meter sits around the middle."],
    complete: "One set of channel-strip knobs serves every channel: SEL decides which. Check the channel strip's title before you turn anything.",
  },
  {
    id: "x32c-48v",
    short: "Silent overhead",
    title: "The silent overhead",
    who: "Drummer",
    prompt: "“My overhead's dead.”",
    goal: "The overhead heard in the house again.",
    setup: { tweak: (st, h) => h.set("drums", "phantom", false) },
    conditions: [
      { id: "drums", kind: "goal", type: "sourceHeardInMain", source: "drums", label: "The drums are heard in the house" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays in the house" },
    ],
    hints: ["A condenser needs phantom power. On the X32 it's per channel.", "SEL channel 01: 48V is in the channel strip's INPUT section.", "SEL channel 01 and press 48V."],
    complete: "48V lives in the selected channel's CONFIG/PREAMP section. The manual suggests muting a channel before switching it, to avoid a pop.",
  },
  {
    id: "x32c-lowcut",
    short: "Low cut",
    title: "Rumble through the vocals",
    who: "Venue tech",
    prompt: "“Stage rumble is coming through both vocal mics.”",
    goal: "LOW CUT of at least 80 Hz on both vocal channels, none on the bass.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "hpf", 0);
        h.set("backing-vocals", "hpf", 0);
      },
    },
    conditions: [
      goal("vox", "Both vocals have LOW CUT at 80 Hz or more", (ctx) => ["lead-vocal", "backing-vocals"].every((s) => hpfHz("x32c", mc(ctx, s)?.index ?? 0, sc(ctx, s)?.hpf ?? 0) >= 80)),
      keep("bass", "The bass keeps its low end", (ctx) => (sc(ctx, "bass")?.hpf ?? 0) <= 0.02),
    ],
    hints: ["SEL each vocal channel in turn.", "LOW CUT is in the channel strip's INPUT section, a frequency from 20 to 400 Hz.", "SEL 06, set LOW CUT around 100 Hz; then SEL 07 and do the same."],
    complete: "LOW CUT is part of every channel's preamp section on the X32: set it per channel, after GAIN.",
  },
  {
    id: "x32c-lr",
    short: "Missing guitar",
    title: "The missing guitar",
    who: "Guitarist",
    prompt: "“The singer hears me in her wedge, but the audience can't hear me at all.”",
    goal: "The guitar in the house, the rest of the house and the wedges unchanged.",
    setup: { tweak: (st, h) => h.set("guitars", "lr", false) },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "mix1" } },
    conditions: [
      { id: "gtr", kind: "goal", type: "sourceHeardInMain", source: "guitars", label: "The guitar is heard in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "guitars", toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["The guitar reaches the wedge, so the mic, GAIN and channel all work. What's between the channel and the house?", "Each channel has a MAIN LR switch: on, it goes to the main mix. It's in the channel strip (PAN & SENDS).", "SEL channel 03 and switch MAIN LR on."],
    complete: "On the X32 every channel needs MAIN LR on to reach the house. Turning it off is also a clean way to keep a channel in the wedges only.",
  },
  {
    id: "x32c-sof",
    short: "More me (Sends on Faders)",
    title: "More me in my wedge",
    who: "Lead singer",
    prompt: "“I need more of my own voice in my wedge.”",
    goal: "The vocal at least 4 dB louder in MIX 1 (the singer's wedge), everything else unchanged.",
    setup: {},
    baseline: {
      send: { metric: "sendDb", bus: "mix1", source: "lead-vocal" },
      vox: { metric: "heardMonitorDb", bus: "mix1", source: "lead-vocal" },
      singer: { metric: "monitorByChannel", bus: "mix1" },
      drummer: { metric: "monitorByChannel", bus: "mix2" },
      main: { metric: "mainDbByChannel" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "mix1", label: "You listened to the singer's wedge" },
      { id: "send", kind: "goal", type: "sendRaised", bus: "mix1", source: "lead-vocal", baseline: "send", minDb: 4, label: "The vocal's send to MIX 1 is up" },
      { id: "heard", kind: "goal", type: "monitorRaised", bus: "mix1", source: "lead-vocal", baseline: "vox", minDb: 4, label: "The singer hears more of herself" },
      { id: "rest", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", except: "lead-vocal", toleranceDb: 1, label: "The rest of the singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "mix2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["The singer's wedge is MIX 1 (XLR OUT 1). Listen to it.", "SEL MIX 1 on the BUS 1-8 layer, then press SENDS ON FADERS: the input faders become sends to MIX 1.", "With SENDS ON FADERS lit, push channel 07's fader up. Then switch SENDS ON FADERS off."],
    complete: "SENDS ON FADERS turns the input faders into one MIX's sends: the quickest way to work on a wedge. Switch it off afterwards, or your next fader move changes a wedge instead of the house.",
  },
  masterFix({
    id: "x32c-drummer-quiet",
    short: "Drummer's wedge quiet",
    title: "The drummer can't hear",
    who: "Drummer",
    prompt: "“My whole wedge is too quiet. The balance is fine.”",
    bus: "mix2",
    startDb: -20,
    raise: true,
    setLevel: (db) => LAWS.level.toPos(db),
    hints: ["The drummer's wedge is MIX 2. One fader moves the whole of it.", "The BUS 1-8 layer on the right-hand faders shows the MIX masters.", "On the BUS 1-8 layer, push MIX 2's fader up towards 0 dB."],
    complete: "The MIX master moves the whole wedge; the sends keep its balance. Same idea as an analog AUX master, on a fader layer.",
  }),
  {
    id: "x32c-bus-mute",
    short: "Silent wedge",
    title: "The silent wedge",
    who: "Lead singer",
    prompt: "“My wedge is completely silent. It worked at soundcheck.”",
    goal: "The singer's wedge (MIX 1) working again, nothing else changed.",
    setup: { tweak: (st) => (st.mix1.mute = true), listen: "main" },
    baseline: { main: { metric: "mainDbByChannel" }, sends: { metric: "sendDbByChannel", bus: "mix1" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "mix1", label: "You listened to the singer's wedge" },
      { id: "on", kind: "goal", type: "busAudible", bus: "mix1", label: "The singer's wedge makes sound" },
      { id: "balance", kind: "keep", type: "sendBalanceKept", bus: "mix1", baseline: "sends", toleranceDb: 1, label: "The wedge mix stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["Every send to the wedge is still there. So look at the whole bus.", "Bus masters have their own MUTE. They're on the BUS 1-8 layer, right-hand side.", "On the BUS 1-8 layer, switch MIX 1's MUTE off."],
    complete: "A muted bus master silences that whole mix while every send looks fine. Check the master before you chase channels.",
  },
  {
    id: "x32c-reverb",
    short: "Reverb on the vocal",
    title: "Reverb on the vocal",
    who: "Lead singer",
    prompt: "“My voice sounds bone dry.”",
    goal: "The vocal sent to FX 1 (the hall reverb), the dry mix and wedges unchanged.",
    setup: { tweak: (st, h) => h.sendDb("lead-vocal", "fx1", -Infinity) },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "mix1" } },
    conditions: [
      goal("send", "The vocal is sent to the reverb", (ctx) => into(ctx, "fx1", "lead-vocal") >= -35),
      keep("return", "The reverb comes back into MAIN LR", (ctx) => (ctx.mix.busDb?.fx1 ?? -Infinity) >= -20),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["FX 1 is a hall reverb fed by a send from each channel, returning on FX 1 RTN (AUX / FX layer).", "SEL channel 07: its sends are in the channel strip, FX 1 among them.", "Turn up channel 07's FX 1 send."],
    complete: "Effects on the X32 are buses too: a send per channel in, an FX return fader back into the main mix.",
  },
  {
    id: "x32c-out-of-house",
    short: "Out of the house",
    title: "Out of the house, still in the wedge",
    who: "Bassist",
    prompt: "“The subs are too much in here. Take me out of the house for this song, but the drummer still needs me.”",
    goal: "The bass out of the house, still in the drummer's wedge (MIX 2), everything else unchanged.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "mix1" } },
    conditions: [
      goal("out", "The bass is out of the house", (ctx) => house(ctx, "bass") < AUDIBLE),
      { id: "wedge", kind: "keep", type: "monitorPresent", bus: "mix2", sources: ["bass"], minDb: -30, label: "The drummer still hears the bass" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "bass", toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["Try MUTE and listen to MIX 2. On the X32, MUTE takes a channel out of its sends too.", "You need the bass out of MAIN LR only. Two ways: its fader (its MIX 2 send is PRE), or one switch in the channel strip.", "SEL channel 02 and switch MAIN LR off (or pull its fader down)."],
    complete: "MAIN LR off is the cleanest way: the channel stays in every send, with its fader untouched for the next song. MUTE would have taken the drummer's bass too.",
  },
  {
    id: "x32c-dca",
    short: "One fader for the band (DCA)",
    title: "One fader for the band",
    who: "Band leader",
    prompt: "“For the acoustic verse, bring the whole band down together, about 6 dB, with one fader. Leave the vocals alone, and don't touch the channel faders — I like the balance.”",
    goal: "Drums, bass, guitar, keys and trumpets on one DCA, at least 4 dB down in the house; vocals and channel faders unchanged.",
    setup: { listen: "main" },
    baseline: { main: { metric: "mainDbByChannel" }, levels: { metric: "channelLevels" }, singer: { metric: "monitorByChannel", bus: "mix1" } },
    conditions: [
      goal("dca", "The five band channels share one DCA (the vocals aren't on it)", (ctx) =>
        Object.keys(sc(ctx, "drums")?.dca || {}).some((d) => BAND.every((s) => sc(ctx, s)?.dca[d]) && !["lead-vocal", "backing-vocals"].some((s) => sc(ctx, s)?.dca[d])),
      ),
      goal("down", "The band is at least 4 dB down in the house", (ctx) => BAND.every((s) => ctx.baseline.main[mc(ctx, s).index] - house(ctx, s) >= 4)),
      { id: "vox", kind: "keep", type: "mainUnchanged", baseline: "main", except: BAND, toleranceDb: 1, label: "The vocals stay where they are" },
      keep("faders", "The channel faders don't move", (ctx) => ctx.state.channels.every((c, i) => Math.abs(c.level - ctx.baseline.levels[i]) < 0.01)),
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["A DCA is a fader that moves other faders' levels without touching them. The right-hand faders have a DCA 1-8 layer.", "On the DCA 1-8 layer, press DCA 1's SEL to start assigning, press SEL on channels 01–05, then DCA 1's SEL again to finish.", "Then pull DCA 1's fader down about 6 dB."],
    complete: "The DCA moved five channels at once and kept their balance, without moving a single channel fader. The wedges didn't change either: their sends are pre-fader, and a DCA acts like the fader.",
  },
  {
    id: "x32c-mute-group",
    short: "One-button mute",
    title: "One button between songs",
    who: "MC",
    prompt: "“Between songs I talk. One button should mute the drums, guitar and trumpet mics so they don't pick up the band noodling. The vocal mics stay live.”",
    goal: "Drums, guitar and trumpets in one mute group, that group muting them; vocals still live.",
    setup: {},
    conditions: [
      goal("group", "Drums, guitar and trumpets are in one mute group, and it's on", (ctx) => Object.keys(ctx.state.mgrp).some((g) => ctx.state.mgrp[g] && ["drums", "guitars", "trumpets"].every((s) => sc(ctx, s)?.mgrp[g]))),
      goal("out", "They're out of the house", (ctx) => ["drums", "guitars", "trumpets"].every((s) => house(ctx, s) < AUDIBLE)),
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The lead vocal stays live" },
      { id: "bv", kind: "keep", type: "sourceHeardInMain", source: "backing-vocals", label: "The backing vocal stays live" },
    ],
    hints: ["Muting three channels one by one works once, but you'll do it after every song.", "MUTE GRP (by the mute group buttons) puts the six buttons into assign mode: pick a group, then press SEL on its channels.", "MUTE GRP on, group 1, SEL 01, 03 and 05, MUTE GRP off, then press group 1."],
    complete: "A mute group mutes several channels with one button and leaves each channel's own MUTE alone. Theatre and talk-heavy shows live on them.",
  },
  {
    id: "x32c-new-mix",
    short: "Guitarist's mix (MIX 3)",
    title: "A mix for the guitarist",
    who: "Guitarist",
    prompt: "“My wedge is on XLR OUT 3 now. Lots of me, the vocal, a bit of drums — and it mustn't change when you ride the house faders.”",
    goal: "A new MIX 3: guitar and vocal clear, drums under the guitar, those sends PRE; the other mixes and the house unchanged.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("gwedge");
        h.cable("mixer/mix3", "gwedge/in", "xlr");
      },
    },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "mix1" }, drummer: { metric: "monitorByChannel", bus: "mix2" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "mix3", label: "You listened to the guitarist's wedge" },
      { id: "core", kind: "goal", type: "monitorPresent", bus: "mix3", sources: ["guitars", "lead-vocal"], minDb: -30, label: "Guitar and vocal are clear in MIX 3" },
      { id: "drums", kind: "goal", type: "monitorLittle", bus: "mix3", source: "drums", below: ["guitars"], byDb: 3, label: "A bit of drums, under the guitar" },
      goal("pre", "The guitarist's mix ignores the house faders (PRE)", (ctx) => ["guitars", "lead-vocal", "drums"].every((s) => ignoresFader(ctx, "mix3", s))),
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "mix2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["SEL MIX 3 and use SENDS ON FADERS to build the mix; listen to MIX 3 as you go.", "Sends to MIX 3 start POST here, so they'd follow the house faders. Each channel's PRE for MIX 3 is in its channel strip.", "SEL 01, 03 and 07 in turn and press PRE next to their MIX 3 send. Guitar and vocal near 0 dB, drums lower."],
    complete: "A new monitor mix: the sends set the balance, PRE makes it independent of the house. The routing (MIX 3 → XLR OUT 3) was already there.",
  },
];


// ----- Yamaha 01V96i -----

const Y96 = [
  doors("yam01v96", {
    prompt: "“Doors in five. The laptop is on 2TR IN — preshow music, please.”",
    hints: ["2TR IN is a stereo RCA input on the rear panel. On its own it only reaches the monitor outputs.", "Its AD 15/16 selector sends 2TR IN into channels 15 and 16, so it reaches the stereo mix.", "Press AD 15/16 in the REAR PANEL section."],
    complete: "2TR IN feeds the mix only through the AD 15/16 selector, which borrows input channels 15 and 16. Worth knowing before you plug something into 15 or 16!",
  }),
  {
    id: "yam01v96-pad",
    short: "Crunchy piano (PAD)",
    title: "The crunchy piano",
    who: "Keyboard player",
    prompt: "“Someone turned off something on channel 4 and now my piano sounds crunchy. Its PEAK light is on.”",
    goal: "The piano's input in Good with its GAIN off the bottom stop (use the PAD), nothing else changed.",
    setup: { tweak: (st, h) => h.set("keys", "pad", false) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("good", "The piano's input sits in Good", (ctx) => mc(ctx, "keys")?.band === "good"),
      keep("room", "Its GAIN stays off the bottom stop, with room to adjust", (ctx) => (sc(ctx, "keys")?.gainDb ?? 0) >= 22),
      keep("heard", "The piano stays in the house", (ctx) => house(ctx, "keys") >= AUDIBLE),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "keys", toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: ["A stage piano is line level. Channel 4's GAIN is already at its lowest, and it's still too hot.", "Inputs 1–12 have a 20 dB PAD switch next to the GAIN knob.", "Press PAD on input 4, then set its GAIN so the meter sits in Good."],
    complete: "The 01V96's preamps are built for mics. The PAD takes 20 dB off before them, so a line-level source can be gain-staged.",
  },
  {
    id: "yam01v96-phantom",
    short: "Silent overhead",
    title: "The silent overhead",
    who: "Drummer",
    prompt: "“My overhead mic is dead.”",
    goal: "The overhead heard in the house again.",
    setup: { tweak: (st) => [0, 1, 2, 3].forEach((i) => (st.channels[i].phantom = false)) },
    conditions: [
      { id: "drums", kind: "goal", type: "sourceHeardInMain", source: "drums", label: "The drums are heard in the house" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays in the house" },
    ],
    hints: ["The overhead is a condenser on input 1.", "Phantom power is on the rear panel: three switches, one for each group of four inputs.", "Switch PHANTOM +48V CH1–4 on."],
    complete: "On the 01V96, +48V comes in groups of four: inputs 2–4 get it too. Dynamic mics and DIs don't mind; ribbon mics would.",
  },
  {
    id: "yam01v96-on",
    short: "Dark ON key",
    title: "The dark ON key",
    who: "Bassist",
    prompt: "“I'm not in the house at all. My channel's button is dark.”",
    goal: "The bass back in the house, nothing else changed.",
    setup: { tweak: (st, h) => h.set("bass", "enabled", false) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "bass", kind: "goal", type: "sourceHeardInMain", source: "bass", label: "The bass is heard in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "bass", toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: ["Every fader has an ON key. Which way round does it work?", "ON is lit while the channel is on: dark means off. That's the opposite of a MUTE key.", "Press channel 2's ON key so it lights."],
    complete: "ON keys light up when the channel plays; MUTE keys light up when it doesn't. Read the label, not the light.",
  },
  {
    id: "yam01v96-fader-mode",
    short: "More me (FADER MODE)",
    title: "More me in my wedge",
    who: "Lead singer",
    prompt: "“I need more of my own voice in my wedge.”",
    goal: "The vocal at least 4 dB louder in AUX 1 (the singer's wedge), everything else unchanged.",
    setup: {},
    baseline: {
      send: { metric: "sendDb", bus: "aux1", source: "lead-vocal" },
      vox: { metric: "heardMonitorDb", bus: "aux1", source: "lead-vocal" },
      singer: { metric: "monitorByChannel", bus: "aux1" },
      drummer: { metric: "monitorByChannel", bus: "aux2" },
      main: { metric: "mainDbByChannel" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux1", label: "You listened to the singer's wedge" },
      { id: "send", kind: "goal", type: "sendRaised", bus: "aux1", source: "lead-vocal", baseline: "send", minDb: 4, label: "The vocal's AUX 1 send is up" },
      { id: "heard", kind: "goal", type: "monitorRaised", bus: "aux1", source: "lead-vocal", baseline: "vox", minDb: 4, label: "The singer hears more of herself" },
      { id: "rest", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", except: "lead-vocal", toleranceDb: 1, label: "The rest of the singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["The singer's wedge is AUX 1 (OMNI OUT 1).", "FADER MODE AUX 1 turns the 16 faders into AUX 1 sends.", "Press FADER MODE AUX 1, push channel 7's fader up, then press HOME."],
    complete: "FADER MODE is the 01V96's sends on faders. HOME puts the faders back on the channel levels: check the mode before you grab a fader.",
  },
  masterFix({
    id: "yam01v96-master",
    short: "Drummer's wedge quiet",
    title: "The drummer can't hear",
    who: "Drummer",
    prompt: "“My whole wedge is too quiet. The balance is fine.”",
    bus: "aux2",
    startDb: -20,
    raise: true,
    setLevel: (db) => LAWS.level.toPos(db),
    hints: ["The drummer's wedge is AUX 2. One fader moves all of it.", "The aux masters are on the MASTER layer.", "Press LAYER MASTER and push AUX 2's fader up towards 0 dB."],
    complete: "The MASTER layer holds the aux masters: the whole wedge moves, the balance stays.",
  }),
  {
    id: "yam01v96-eq",
    short: "Harsh vocal",
    title: "The harsh vocal",
    who: "Lead singer",
    prompt: "“My voice sounds harsh, around the top of my range.”",
    goal: "A cut (at least 2 dB) in the vocal's HIGH-MID band, between 2 and 5 kHz.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "peq.hiMid.gain", 8);
        h.set("lead-vocal", "peq.hiMid.freq", 3000);
        h.set("lead-vocal", "eqOn", true);
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("eq", "The harshness is cut", (ctx) => {
        const b = sc(ctx, "lead-vocal")?.peq.hiMid;
        return !!b && b.gain <= -2 && b.freq >= 2000 && b.freq <= 5000;
      }),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The levels stay the same" },
    ],
    hints: ["SEL channel 7 first: the SELECTED CHANNEL knobs only ever work on one channel.", "The EQ knobs show one band at a time: press HIGH-MID. The EQ page on the display shows all four.", "With HIGH-MID chosen, turn GAIN below 0; leave FREQUENCY near 3 kHz."],
    complete: "One set of knobs, four bands: the band keys choose which one you're turning. The display's EQ page shows them all.",
  },
  {
    id: "yam01v96-to-st",
    short: "Missing guitar",
    title: "The missing guitar",
    who: "Guitarist",
    prompt: "“The singer hears me in her wedge, but there's no guitar in the house.”",
    goal: "The guitar in the house, the rest of the house and the wedges unchanged.",
    setup: { tweak: (st, h) => h.set("guitars", "lr", false) },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      { id: "gtr", kind: "goal", type: "sourceHeardInMain", source: "guitars", label: "The guitar is heard in the house" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: "guitars", toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["It reaches the wedge, so the input and channel work. How does a channel get to the stereo bus?", "SEL channel 3 and open the display's PAN/ROUTING page.", "Switch TO ST on."],
    complete: "Routing lives in the display: TO ST sends a channel to the stereo bus. Some settings have no key of their own, so you page to them.",
  },
  {
    id: "yam01v96-reverb",
    short: "Reverb on the vocal",
    title: "Reverb on the vocal",
    who: "Lead singer",
    prompt: "“My voice sounds dry, and someone's turned the reverb return down too.”",
    goal: "The vocal sent to AUX 7 (the reverb), and ST IN 1 (its return) back up.",
    setup: {
      tweak: (st, h) => {
        h.sendDb("lead-vocal", "aux7", -Infinity);
        st.aux7.level = 0;
      },
    },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" } },
    conditions: [
      goal("send", "The vocal is sent to the reverb (AUX 7)", (ctx) => into(ctx, "aux7", "lead-vocal") >= -35),
      goal("return", "The reverb returns on ST IN 1", (ctx) => (ctx.mix.busDb?.aux7 ?? -Infinity) >= -10),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["Effects on the 01V96 are fed from an aux and come back on an ST IN channel. The PATCH page shows which.", "AUX 7 feeds the reverb; ST IN 1 brings it back.", "FADER MODE AUX 7 and push channel 7 up (or the AUX page of the display), then turn ST IN 1's level up."],
    complete: "Send on an aux, return on ST IN: the 01V96's effects work like an outboard loop, all inside the desk.",
  },
  {
    id: "yam01v96-pre-point",
    short: "OFF but still in the wedge",
    title: "OFF, but still in the wedge",
    who: "Backing singer",
    prompt: "“Between songs you switch my channel OFF so the audience doesn't hear me chatting. But then I vanish from the singer's wedge, and we need to hear each other to start the next song.”",
    goal: "The backing vocal's channel OFF, out of the house, but still in the singer's wedge (AUX 1).",
    setup: { tweak: (st, h) => h.set("backing-vocals", "enabled", false) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("wedge", "The backing vocal is in the singer's wedge", (ctx) => wedge(ctx, "aux1", "backing-vocals") >= -35),
      keep("off", "The backing vocal's channel stays OFF", (ctx) => sc(ctx, "backing-vocals")?.enabled === false),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["Her AUX 1 send is pre-fader. So why does switching the channel OFF take her out of the wedge?", "AUX SETUP on the display has PRE POINT: pre-fader sends are taken after the ON key (POST ON) or before it (PRE ON).", "Open the AUX SETUP page and choose PRE ON."],
    complete: "PRE POINT decides whether ON cuts the pre-fader sends. PRE ON lets you switch a channel off for the house while the band still hears it.",
  },
  {
    id: "yam01v96-comp",
    short: "Jumpy bass",
    title: "The jumpy bass",
    who: "Bassist",
    prompt: "“Some of my notes boom out and some disappear.”",
    goal: "The bass compressed: DYNAMICS ON, THRESHOLD at −8 dB or lower, RATIO at least 2.5:1.",
    setup: {},
    conditions: [
      goal("comp", "The bass is compressed", (ctx) => sc(ctx, "bass")?.compOn === true && (sc(ctx, "bass")?.dyn.threshold ?? 0) <= -8 && (sc(ctx, "bass")?.dyn.ratio ?? 1) >= 2.5),
      { id: "bass", kind: "keep", type: "sourceHeardInMain", source: "bass", label: "The bass stays in the house" },
    ],
    hints: ["Evening out loud and quiet notes is a compressor's job.", "SEL channel 2, then DISPLAY ACCESS DYNAMICS: DYNAMICS ON, THRESHOLD, RATIO and OUT GAIN.", "Press DYNAMICS ON, then THRESHOLD around −15 dB, RATIO 3:1 to 4:1, a little OUT GAIN. Watch the GR bar."],
    complete: "The compressor has no knobs of its own: SEL, then the DYNAMICS page. That's the central-screen way of working.",
  },
  {
    id: "yam01v96-new-mix",
    short: "Guitarist's mix (AUX 3)",
    title: "A mix for the guitarist",
    who: "Guitarist",
    prompt: "“My wedge is on OMNI OUT 3. Lots of me, the vocal, a bit of drums, and it mustn't follow the house faders.”",
    goal: "A new AUX 3 mix: guitar and vocal clear, drums under the guitar, those sends PRE; everything else unchanged.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("gwedge");
        h.cable("mixer/aux3", "gwedge/in", "xlr");
      },
    },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" }, drummer: { metric: "monitorByChannel", bus: "aux2" } },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux3", label: "You listened to the guitarist's wedge" },
      { id: "core", kind: "goal", type: "monitorPresent", bus: "aux3", sources: ["guitars", "lead-vocal"], minDb: -30, label: "Guitar and vocal are clear in AUX 3" },
      { id: "drums", kind: "goal", type: "monitorLittle", bus: "aux3", source: "drums", below: ["guitars"], byDb: 3, label: "A bit of drums, under the guitar" },
      goal("pre", "The guitarist's mix ignores the house faders (PRE)", (ctx) => ["guitars", "lead-vocal", "drums"].every((s) => ignoresFader(ctx, "aux3", s))),
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["FADER MODE AUX 3 to build the mix; listen to AUX 3 as you go.", "Sends start POST here. Each channel's PRE is on the display's AUX page (SEL the channel first).", "SEL 1, 3 and 7 in turn, AUX page, PRE on AUX 3. Guitar and vocal near 0 dB, drums lower."],
    complete: "FADER MODE for the levels, the AUX page for PRE/POST, OMNI OUT 3 already patched: a monitor mix built the 01V96 way.",
  },
];


// ----- Behringer X32 (full size): the advanced console -----

// The mixer's settings that a scene holds, compared loosely (channel ON and faders, bus levels).
const sameAsScene = (ctx, n) => {
  const sc = ctx.state.scenes?.[n];
  if (!sc) return false;
  return ctx.state.channels.every((c, i) => c.enabled === sc.settings.channels[i].enabled && Math.abs(c.level - sc.settings.channels[i].level) < 0.01) && Object.keys(COMPACT[ctx.state.model].buses).every((b) => Math.abs(ctx.state[b].level - sc.settings[b].level) < 0.01);
};

const X32F = [
  doors("x32", {
    prompt: "“Doors in five. The laptop is on AUX IN 1/2 — preshow music, please.”",
    hints: ["The 16 input faders show one layer at a time. Channels 1–32 aren't where the laptop is.", "Press the AUX IN / USB layer.", "Push AUX 1/2's fader up."],
    complete: "Five input layers share 16 faders on the full X32. Check the lit layer key before every move.",
  }),
  {
    id: "x32-room",
    short: "Room mics (CH 17-32)",
    title: "The room mics on 17 and 18",
    who: "Recording engineer",
    prompt: "“The audience mics are on inputs 17 and 18 and they're dead.”",
    goal: "Both room mics heard in the house.",
    setup: {
      tweak: (st, h) => {
        h.set("room-l", "phantom", false);
        h.set("room-r", "phantom", false);
      },
    },
    conditions: [
      { id: "l", kind: "goal", type: "sourceHeardInMain", source: "room-l", label: "The left room mic is heard" },
      { id: "r", kind: "goal", type: "sourceHeardInMain", source: "room-r", label: "The right room mic is heard" },
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal stays in the house" },
    ],
    hints: ["Inputs 17–32 live on their own layer.", "Press CH 17-32 and SEL channel 17: they're condensers.", "Switch 48V on for channels 17 and 18."],
    complete: "Thirty-two inputs, sixteen faders: the CH 17-32 layer holds the second half. A dead condenser? 48V first.",
  },
  {
    id: "x32-routing-house",
    short: "Silent house (ROUTING)",
    title: "The silent house",
    who: "Venue tech",
    prompt: "“After the last band's show file, the house speakers are silent. The meters move, the wedges work.”",
    goal: "MAIN L/R back on the house speakers' outputs (XLR OUT 15/16), the wedges unchanged.",
    setup: {
      tweak: (st) => {
        st.routing.out15 = "off";
        st.routing.out16 = "off";
      },
    },
    baseline: { singer: { metric: "monitorByChannel", bus: "mix1" } },
    conditions: [
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "lead-vocal", stereo: true, label: "The house plays, left and right" },
      { id: "chain", kind: "goal", type: "validChain", output: "main", zone: "foh", label: "The house speakers are fed by MAIN" },
      { id: "wedge", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge keeps working" },
    ],
    hints: ["The mix is fine and the speakers are plugged into XLR OUT 15 and 16. What do those outputs carry?", "On the X32 each XLR OUT carries whatever ROUTING says (main display, ROUTING page).", "Set XLR OUT 15 to MAIN L and 16 to MAIN R."],
    complete: "A digital desk's jacks carry nothing until they're routed. When the mix meters fine but a speaker is silent, check ROUTING.",
  },
  {
    id: "x32-routing-wedge",
    short: "Wedge on OUT 9",
    title: "The wedge on XLR OUT 9",
    who: "Stage hand",
    prompt: "“OUT 1's connector is broken, so I moved the singer's wedge cable to XLR OUT 9. It's silent now.”",
    goal: "The singer's wedge fed MIX 1 again, from XLR OUT 9.",
    setup: {
      tweak: (st, h) => {
        h.cut("mixer/out1");
        h.cable("mixer/out9", "wedge/in", "xlr");
        st.routing.out9 = "off";
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "chain", kind: "goal", type: "validChain", output: "mix1", device: "wedge", label: "The singer's wedge is fed by MIX 1" },
      { id: "listen", kind: "goal", type: "listenedTo", dest: "mix1", label: "You listened to it" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["The wedge's mix is MIX 1. Which output carries MIX 1, and which output is the wedge on now?", "Open ROUTING on the main display.", "Set XLR OUT 9 to MIX 1."],
    complete: "Moving a cable on a digital desk means moving the routing with it. The mix itself didn't change at all.",
  },
  {
    id: "x32-mc",
    short: "Front fill (M/C)",
    title: "A front fill for the vocals",
    who: "Venue tech",
    prompt: "“The front rows can't understand the words. We've put a front-fill speaker on XLR OUT 11: vocals only, please.”",
    goal: "The front fill fed from the MONO/CENTER bus, with both vocals in it and no drums or bass.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("ffill");
        h.cable("mixer/out11", "ffill/in", "xlr");
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "chain", kind: "goal", type: "validChain", output: "mc", device: "ffill", label: "The front fill is fed by M/C" },
      { id: "vox", kind: "goal", type: "monitorPresent", bus: "mc", sources: ["lead-vocal", "backing-vocals"], minDb: -30, label: "Both vocals are in the front fill" },
      { id: "no", kind: "keep", type: "monitorAbsent", bus: "mc", sources: ["drums", "bass"], label: "No drums or bass in it" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["The MONO/CENTER bus is a separate mono mix with its own send on every channel.", "SEL channels 06 and 07: each has an M/C send in its strip. M/C's fader is on the MATRIX layer.", "Turn up both vocals' M/C sends, then route XLR OUT 11 to M/C."],
    complete: "M/C is a third main bus: a mono feed you build per channel, here for vocal clarity at the front without more band.",
  },
  {
    id: "x32-matrix",
    short: "Lobby (MATRIX)",
    title: "The lobby speaker",
    who: "Front of house manager",
    prompt: "“The lobby speaker is on XLR OUT 12. Give it the house mix, and I want to set its level without touching the house.”",
    goal: "The lobby speaker fed by MATRIX 1, which carries the MAIN mix; the house unchanged.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("lobby");
        h.cable("mixer/out12", "lobby/in", "xlr");
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "chain", kind: "goal", type: "validChain", output: "mtx1", device: "lobby", label: "The lobby speaker is fed by MATRIX 1" },
      { id: "on", kind: "goal", type: "busAudible", bus: "mtx1", label: "The lobby hears the band" },
      goal("main", "MATRIX 1 carries the main mix", (ctx) => LAWS.level.toDb(ctx.state.mtx1.main) >= -10),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["A matrix is a mix of mixes: MAIN, M/C and the MIX buses, each at its own level, with its own fader.", "SEL MAIN LR: its strip has a send to each MATRIX. Or SEL MATRIX 1 (MATRIX layer) to see its sources.", "Turn MAIN's send to MATRIX 1 up, then route XLR OUT 12 to MATRIX 1."],
    complete: "Matrices feed the places that need the show but not their own mix: lobbies, delay speakers, recorders, broadcast. Each has its own fader.",
  },
  {
    id: "x32-subgroup",
    short: "Drum subgroup",
    title: "A drum subgroup",
    who: "Band leader",
    prompt: "“Put drums and bass through MIX 9 as a subgroup into the house, then pull it down about 6 dB for the quiet song.”",
    goal: "Drums and bass reaching MAIN LR only through MIX 9 (a subgroup), at least 4 dB down; everything else unchanged.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "mix1" }, drummer: { metric: "monitorByChannel", bus: "mix2" } },
    conditions: [
      goal("sub", "Drums and bass reach the house only through MIX 9", (ctx) => ctx.state.mix9.lr && ["drums", "bass"].every((s) => sc(ctx, s)?.lr === false && into(ctx, "mix9", s) > -60 && house(ctx, s) >= AUDIBLE)),
      { id: "drums", kind: "goal", type: "mainLowered", source: "drums", baseline: "main", minDb: 4, label: "The drums are down at least 4 dB" },
      { id: "bass", kind: "goal", type: "mainLowered", source: "bass", baseline: "main", minDb: 4, label: "The bass is down at least 4 dB" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: ["drums", "bass"], toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "mix2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
    ],
    hints: ["A subgroup is a MIX bus that goes into the main mix, with its own fader.", "Send channels 01 and 02 to MIX 9 at 0 dB (POST), switch their own MAIN LR off; SEL MIX 9 and switch its MAIN LR on.", "Then pull MIX 9's fader (BUS 9-16 layer) down about 6 dB."],
    complete: "Unlike a DCA, a subgroup sums the signals: you could compress or EQ the whole rhythm section on MIX 9. Switching the channels' own MAIN LR off stops them reaching the house twice.",
  },
  {
    id: "x32-fx",
    short: "Chorus on the keys (FX 4)",
    title: "Chorus on the keys",
    who: "Keyboard player",
    prompt: "“For the ballad, put a bit of chorus on the piano.”",
    goal: "The keys sent to FX 4 (the chorus, fed by MIX 16), its return up; the dry mix and wedges unchanged.",
    setup: { tweak: (st) => (st.mix16.level = 0) },
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "mix1" } },
    conditions: [
      goal("send", "The keys are sent to the chorus (MIX 16)", (ctx) => into(ctx, "mix16", "keys") >= -35),
      goal("return", "FX 4 RTN brings it back", (ctx) => (ctx.mix.busDb?.mix16 ?? -Infinity) >= -10),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The dry house mix stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "mix1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
    ],
    hints: ["The FX rack is fed by MIX 13–16 and comes back on the FX RETURNS layer.", "FX 4 is the chorus, fed by MIX 16. SEL channel 04 and turn up its MIX 16 send.", "Then push FX 4 RTN up on the FX RETURNS layer."],
    complete: "On the X32 the effects are fed by ordinary mix buses: the send is a MIX, the return is a channel. The routing is the same idea as an outboard rack.",
  },
  {
    id: "x32-scene-recall",
    short: "Recall the acoustic set",
    title: "Recall the acoustic set",
    who: "Band leader",
    prompt: "“Acoustic set now! We saved it as scene 2 at soundcheck.”",
    goal: "The mixer exactly as scene 2 has it.",
    setup: {},
    conditions: [goal("scene", "The mix matches scene 2 (Acoustic set)", (ctx) => sameAsScene(ctx, 1)), { id: "house", kind: "keep", type: "validChain", output: "main", zone: "foh", label: "The house keeps working" }],
    hints: ["Rebuilding it by hand takes ages and you'll miss something.", "The main display's SCENES page lists the saved scenes.", "RECALL scene 02."],
    complete: "One press: every channel, fader and bus back to how it was saved. Scenes are why digital desks rule festivals and theatre.",
  },
  {
    id: "x32-scene-store",
    short: "Save the encore mix",
    title: "Save the encore mix",
    who: "Band leader",
    prompt: "“That's the encore mix: the vocal's up. Save it as scene 3 so we can get it back tomorrow.”",
    goal: "Scene 3 holds the mix as it is now.",
    setup: { tweak: (st, h) => h.moveFader("lead-vocal", 3) },
    conditions: [goal("stored", "Scene 3 holds the current mix", (ctx) => sameAsScene(ctx, 2)), keep("old", "Scenes 1 and 2 are still there", (ctx) => !!ctx.state.scenes[0] && !!ctx.state.scenes[1])],
    hints: ["The SCENES page has a STORE button for each slot.", "Scene 3 is empty: store into it, not over 1 or 2.", "Press STORE on scene 03 and name it (Encore)."],
    complete: "STORE copies everything but the cables into the slot. Store into an empty slot, or the soundcheck scene is gone.",
  },
  masterFix({
    id: "x32-bus9",
    short: "Quiet in-ear (BUS 9-16)",
    title: "The quiet in-ear mix",
    who: "Guitarist",
    prompt: "“My wedge on MIX 10 is way too quiet. The balance is fine.”",
    bus: "mix10",
    startDb: -20,
    raise: true,
    setLevel: (db) => LAWS.level.toPos(db),
    hints: ["MIX 10 isn't on the BUS 1-8 layer.", "Press BUS 9-16 on the group section.", "Push MIX 10's fader up towards 0 dB."],
    complete: "Sixteen buses, eight group faders: BUS 9-16 is a layer of its own. The master moves the whole mix and keeps its balance.",
  }),
];
// The guitarist's wedge for MIX 10 (XLR OUT 10) is set up in the scenario itself.
X32F.at(-1).setup.tweak = ((orig) => (st, h) => {
  h.addDevice("gwedge");
  h.cable("mixer/out10", "gwedge/in", "xlr");
  st.routing.out10 = "mix10";
  for (const [src, db] of [["guitars", 0], ["lead-vocal", -6], ["drums", -12]]) {
    h.set(src, "pres.mix10", true);
    h.sendDb(src, "mix10", db);
  }
  orig(st, h);
})(X32F.at(-1).setup.tweak);

// ---------- each board's list, in teaching order ----------

// ---------- Yamaha CL3 ----------
// Most of the jobs are the X32's, done the CL way: the same checks with new
// words. `like` copies another board's scenario under this board's id.
const like = (board, srcId, over) => {
  const src = [...X32, ...X32F, ...Y96].find((s) => s.id === srcId);
  if (!src) throw new Error(`no scenario ${srcId}`);
  return { ...src, id: `${board}-${srcId.replace(/^[a-z0-9]+-/, "")}`, ...over };
};
const CL3 = [
  doors("cl3", {
    prompt: "“Doors in five. The laptop is on OMNI IN 1/2, channel ST IN 1. Preshow music, please.”",
    hints: ["The INPUT section shows one bank at a time. Channels 1–32 aren't where the laptop is.", "Press the ST IN bank key above the INPUT faders.", "Push ST IN 1's fader up."],
    complete: "On a CL the stereo inputs live on their own bank, next to the effects returns. Check the lit bank key before every move.",
  }),
  like("cl3", "x32c-gain", {
    hints: ["Gain first. The vocal's preamp is in the Rio stage box, but you set it from the console.", "Press SEL on channel 7: the SELECTED CHANNEL knobs left of the screen now edit it.", "Turn the SELECTED CHANNEL GAIN up until the meter sits around the middle."],
    complete: "The mic preamps are on stage in the Rio, controlled over Dante. SEL decides which channel the SELECTED CHANNEL knobs turn.",
  }),
  like("cl3", "x32c-48v", {
    hints: ["A condenser needs phantom power, and on a CL it comes from the Rio input it's plugged into.", "SEL channel 1 and open SELECTED CHANNEL on the touch screen: the INPUT field has +48V.", "Press +48V for channel 1."],
    complete: "+48V is switched per input from the console, even though the preamp is on stage. Switch the channel off first to keep the pop out of the speakers.",
  }),
  like("cl3", "yam01v96-on", {
    hints: ["Every fader has an ON key. Which way round does it work?", "ON is lit while the channel is on: dark means off. That's the opposite of a MUTE key.", "Press channel 2's ON key so it lights."],
    complete: "Yamaha keys light when the channel plays. Read the label, not the light.",
  }),
  eqOff("cl3", {
    hints: ["Open OVERVIEW: channel 7's EQ curve is flat and grey, marked EQ OFF. The SELECTED CHANNEL knobs moved the bands anyway.", "SEL channel 7, open SELECTED CHANNEL on the screen and press EQ ON."],
    complete: "On a CL the EQ knobs keep working while the EQ is off, which makes this easy to miss. The OVERVIEW curves show it at a glance.",
  }),
  compOff("cl3", {
    hints: ["The SELECTED CHANNEL section warns DYNAMICS is OFF, and the GR bar on OVERVIEW never moves.", "SEL channel 7, open SELECTED CHANNEL on the screen and press COMP ON."],
    complete: "A compressor dialled in but switched off does nothing at all. After setting one, check that GR moves.",
  }),
  like("cl3", "x32c-sof", {
    hints: ["The singer's wedge is MIX 1 (Rio OUT 1). Listen to it.", "Put MIX 1-8 on Centralogic, SEL MIX 1, then press SENDS ON FADER in the master section: the INPUT faders become sends to MIX 1.", "With SENDS ON FADER lit, push channel 7's fader up. Then switch SENDS ON FADER off."],
    complete: "SENDS ON FADER turns the faders into one MIX's sends. Switch it off afterwards, or your next fader move changes a wedge instead of the house.",
  }),
  like("cl3", "x32-routing-house", {
    goal: "STEREO back on the house speakers' outputs (Rio OUT 15/16), the wedges unchanged.",
    hints: ["The mix meters fine and the speakers are on Rio OUT 15 and 16. What do those outputs carry?", "Outputs carry what the OUTPUT PATCH says (touch screen, OUTPUT PATCH).", "Set Rio OUT 15 to ST L and 16 to ST R."],
    complete: "A stage box's outputs carry nothing until they're patched. When the mix meters fine but a speaker is silent, check the OUTPUT PATCH.",
  }),
  like("cl3", "x32-routing-wedge", {
    prompt: "“Rio OUT 1's connector is broken, so I moved the singer's wedge cable to Rio OUT 9. It's silent now.”",
    goal: "The singer's wedge fed MIX 1 again, from Rio OUT 9.",
    hints: ["The wedge's mix is MIX 1. Which output carries MIX 1, and which output is the wedge on now?", "Open OUTPUT PATCH on the touch screen.", "Set Rio OUT 9 to MIX 1."],
    complete: "Moving a cable on the stage box means moving the patch with it. The mix itself didn't change at all.",
  }),
  like("cl3", "x32c-dca", {
    hints: ["A DCA moves other faders' levels without touching them. Centralogic can show DCA 1-8.", "SEL each band channel (1–5) and, in SELECTED CHANNEL on the screen, press DCA 1 in its DCA field.", "Put DCA 1-8 on Centralogic and pull DCA 1 down about 6 dB."],
    complete: "The DCA moved five channels at once and kept their balance. On the CL you assign DCAs from the channel's own SELECTED CHANNEL VIEW, and there are sixteen of them.",
  }),
  like("cl3", "x32c-mute-group", {
    hints: ["Muting three channels one by one works once, but you'll do it after every song.", "SEL channels 1, 3 and 5 in turn and, in SELECTED CHANNEL on the screen, press MUTE GROUP 1 for each.", "Then press MUTE 1 in the master section (a USER DEFINED key)."],
    complete: "A mute group mutes several channels with one key and leaves each channel's own ON key alone. On a CL the master keys are USER DEFINED keys you set up yourself.",
  }),
  like("cl3", "x32-matrix", {
    goal: "The lobby speaker fed by MATRIX 1, which carries the STEREO mix; the house unchanged.",
    prompt: "“The lobby speaker is on Rio OUT 12. Give it the house mix, and I want to set its level without touching the house.”",
    hints: ["A matrix is a mix of mixes: STEREO and the MIX buses, each at its own level, with its own fader.", "SEL STEREO in the master section: SELECTED CHANNEL shows its sends to each MATRIX. Or put MATRIX on Centralogic and SEL MATRIX 1.", "Turn STEREO's send to MATRIX 1 up, then patch Rio OUT 12 to MATRIX 1."],
    complete: "Matrices feed the places that need the show but not their own mix: lobbies, delay speakers, recorders, broadcast. The CL has eight.",
  }),
  like("cl3", "x32-fx", {
    goal: "The keys sent to FX 4 (the chorus, fed by MIX 16), its return (ST IN 5) up; the dry mix and wedges unchanged.",
    hints: ["The effects rack is fed by MIX 13–16 and comes back on ST IN 2–5.", "FX 4 is the chorus, fed by MIX 16. SEL channel 4 and turn up its MIX 16 send in SELECTED CHANNEL.", "Then push ST IN 5 (FX 4) up on the ST IN bank."],
    complete: "The CL's effects are fed by ordinary MIX buses and return on ST IN channels: the same idea as an outboard rack.",
  }),
  {
    id: "cl3-dante",
    short: "Virtual soundcheck (Dante)",
    title: "Virtual soundcheck over Dante",
    who: "System engineer",
    prompt: "“The band isn't here yet, but last night's multitrack is on the laptop. Get it onto channels 1–7 over Dante so we can tune the PA as if they were playing.”",
    goal: "DAW tracks 1–7 out on DVS channels 1–7, CL3 Dante RX 1–7 subscribed to them, all seven playing on channels 1–7 in the house.",
    music: "excerpt", // the whole band, trumpets too
    setup: {
      tweak: (st, h) => {
        for (let n = 1; n <= 7; n++) h.cut(`mixer/ch${n}-mic`);
        h.addDevice("daw");
        for (let n = 0; n < 7; n++) st.channels[n].gainDb = 10; // playback is line level: far less gain than the mics
      },
    },
    conditions: [
      goal("daw", "Every DAW track has its own output, in order (track n → DVS n)", (ctx) => ctx.state.rig.devices.find((d) => d.type === "daw-dvs")?.outs.slice(0, 7).every((k, t) => k === t + 1)),
      goal("rx", "CL3 RX 1–7 are subscribed to DVS 1–7", (ctx) => ctx.state.rig.devices.find((d) => d.id === "mixer").danteRx.slice(0, 7).every((k, m) => k === m + 1)),
      goal("heard", "All seven tracks play on channels 1–7 in the house", (ctx) => DAW_TRACKS.every((s, t) => mc(ctx, s)?.index === t && house(ctx, s) >= AUDIBLE)),
    ],
    hints: [
      "Three hops, no cables: DAW track → its output (a Dante Virtual Soundcard channel) → Dante Controller subscribes the console's RX channel → that channel. Start at the laptop card in Sources.",
      "Open the DAW: set track 1's output to DVS 01, track 2 to DVS 02, and so on to track 7.",
      "Open Dante Controller: for CL3 RX 01–07 click the square under DVS 01–07. Seven ticks in a diagonal line.",
    ],
    complete: "That's a virtual soundcheck: the same channels, gains and processing, fed from a recording instead of the band. Ascending outputs and a diagonal in Dante Controller keep every channel number matching its track number.",
  },
  like("cl3", "x32-scene-recall", {
    hints: ["Rebuilding it by hand takes ages and you'll miss something.", "The touch screen's SCENE page lists the saved scenes.", "RECALL scene 02."],
  }),
  like("cl3", "x32-scene-store", {
    hints: ["The SCENE page has a STORE button for each slot.", "Scene 3 is empty: store into it, not over 1 or 2.", "Press STORE on scene 03 and name it (Encore)."],
  }),
];


// ---------- Yamaha DM2000 ----------
// The 01V96's jobs on the bigger desk, plus what's new: encoders, BUS 1–8 with
// BUS TO ST, the OUTPUT PATCH, and Yamaha fader and mute groups.
const DM = [
  doors("dm2000", {
    prompt: "“Doors in five. The laptop is on 2TR IN, channel 89/90. Preshow music, please.”",
    hints: ["The faders show one LAYER at a time, and 1–24 are the analog inputs.", "Channels 89–96 are on LAYER 73–96, with the effects returns.", "Press LAYER 73–96 and push channel 89/90's fader up."],
    complete: "96 channels, 24 faders: always check which LAYER is lit before you reach for a fader.",
  }),
  like("dm2000", "yam01v96-pad", {
    hints: ["A stage piano is line level. Channel 4's GAIN is already at its lowest, and it's still too hot.", "Every analog input on the top panel has a 20 dB PAD next to its GAIN knob.", "Press PAD on input 4, then bring its GAIN up so the meter sits in the middle."],
  }),
  like("dm2000", "x32c-48v", {
    hints: ["A condenser needs phantom power.", "The DM2000 has a +48V switch for each analog input, on the top panel under its GAIN and PAD.", "Press +48V on input 1."],
    complete: "+48V lives with the preamp on the top panel, one switch per input. Switch the channel's ON key off first to keep the pop out of the speakers.",
  }),
  like("dm2000", "yam01v96-on", {
    hints: ["Every channel strip has an ON key. Which way round does it work?", "ON is lit while the channel is on: dark means off.", "Press channel 2's ON key so it lights."],
  }),
  eqMud("dm2000", {
    hints: ["SEL channel 3. In the SELECTED CHANNEL EQUALIZER, turn L-MID's G down a few dB with F near 300 Hz.", "Nothing changed? The EQ starts switched off: press EQ ON in the EQUALIZER block (or on the display's EQUALIZER page)."],
    complete: "On the DM2000 the EQ knobs are always there for the selected channel, switched in or not. EQ ON and the display's curve tell you which.",
  }),
  eqOff("dm2000", {
    hints: ["SEL channel 7 and press DISPLAY ACCESS EQUALIZER: the curve is flat and grey, marked EQ OFF.", "Press EQ ON. Leave the bands alone."],
    complete: "A set-up EQ that's switched off looks perfect on the knobs and does nothing. The display's curve shows what's really happening.",
  }),
  compOff("dm2000", {
    hints: ["SEL channel 7 and press DISPLAY ACCESS DYNAMICS: COMP OFF, and the GR bar never moves.", "Press COMP ON in the SELECTED CHANNEL DYNAMICS block."],
    complete: "A compressor dialled in but switched off does nothing at all. After setting one, check that GR moves.",
  }),
  like("dm2000", "yam01v96-fader-mode", {
    hints: ["The singer's wedge is AUX 1. Listen to it first.", "FADER MODE AUX turns the faders into the sends of the aux picked with AUX SELECT.", "FADER MODE AUX, AUX SELECT 1, push channel 7's fader up, then FADER MODE FADER again."],
    complete: "FADER MODE puts one aux's sends on the faders. Switch back to FADER afterwards, or your next move changes a wedge instead of the house.",
  }),
  {
    id: "dm2000-encoder",
    short: "More bass for the drummer (encoders)",
    title: "More bass for the drummer",
    who: "Drummer",
    prompt: "“I can't lock in with the bass. More bass in my wedge, please — leave the rest alone.”",
    goal: "The bass at least 4 dB louder in AUX 2 (the drummer's wedge), everything else unchanged.",
    setup: {},
    baseline: {
      send: { metric: "sendDb", bus: "aux2", source: "bass" },
      bass: { metric: "heardMonitorDb", bus: "aux2", source: "bass" },
      drummer: { metric: "monitorByChannel", bus: "aux2" },
      singer: { metric: "monitorByChannel", bus: "aux1" },
      main: { metric: "mainDbByChannel" },
    },
    conditions: [
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux2", label: "You listened to the drummer's wedge" },
      { id: "send", kind: "goal", type: "sendRaised", bus: "aux2", source: "bass", baseline: "send", minDb: 4, label: "The bass's AUX 2 send is up" },
      { id: "heard", kind: "goal", type: "monitorRaised", bus: "aux2", source: "bass", baseline: "bass", minDb: 4, label: "The drummer hears more bass" },
      { id: "rest", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", except: "bass", toleranceDb: 1, label: "The rest of the drummer's wedge stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["Each channel has an encoder above its fader. ENCODER MODE decides what it turns.", "Press ENCODER MODE AUX and AUX SELECT 2: every encoder is now that channel's AUX 2 send.", "Turn channel 2's encoder up. The faders still run the house."],
    complete: "Encoders on AUX keep the faders on the house while you build a wedge: the classic way to work on a big Yamaha.",
  },
  like("dm2000", "yam01v96-to-st", {
    hints: ["The guitar's meter moves and its fader is up. Where does channel 3 go?", "SEL channel 3: the SELECTED CHANNEL ROUTING keys show which buses it feeds.", "Press STEREO in channel 3's ROUTING."],
    complete: "ROUTING decides where a channel goes: STEREO, any of BUS 1–8, or both. A channel on no bus is heard nowhere but the auxes.",
  }),
  like("dm2000", "yam01v96-reverb", {
    goal: "The vocal sent to the reverb (AUX 7), its return (CH 73/74) up; the dry mix and the wedges unchanged.",
    hints: ["AUX 7 feeds effect 1, the reverb. It comes back on channels 73/74.", "SEL channel 7 and turn up its AUX 7 send (SELECTED CHANNEL AUX SEND, BANK 5–8).", "Then LAYER 73–96: push CH 73/74 (FX 1) up."],
    complete: "Send on an aux, return on a channel: the DM2000's built-in effects patch like an outboard rack.",
  }),
  {
    id: "dm2000-subgroup",
    short: "Drum subgroup (BUS 1)",
    title: "A drum subgroup",
    who: "Band leader",
    prompt: "“Put drums and bass through BUS 1 into the house, then pull that bus down about 6 dB for the quiet song.”",
    goal: "Drums and bass reaching STEREO only through BUS 1, at least 4 dB down; everything else unchanged.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" }, singer: { metric: "monitorByChannel", bus: "aux1" }, drummer: { metric: "monitorByChannel", bus: "aux2" } },
    conditions: [
      goal("sub", "Drums and bass reach the house only through BUS 1", (ctx) => ctx.state.bus1.lr && ["drums", "bass"].every((s) => sc(ctx, s)?.lr === false && sc(ctx, s)?.sends.bus1 >= 0.5 && house(ctx, s) >= AUDIBLE)),
      { id: "drums", kind: "goal", type: "mainLowered", source: "drums", baseline: "main", minDb: 4, label: "The drums are down at least 4 dB" },
      { id: "bass", kind: "goal", type: "mainLowered", source: "bass", baseline: "main", minDb: 4, label: "The bass is down at least 4 dB" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: ["drums", "bass"], toleranceDb: 1, label: "Everything else in the house stays the same" },
      { id: "singer", kind: "keep", type: "monitorMixUnchanged", bus: "aux1", baseline: "singer", toleranceDb: 1, label: "The singer's wedge stays the same" },
      { id: "drummer", kind: "keep", type: "monitorMixUnchanged", bus: "aux2", baseline: "drummer", toleranceDb: 1, label: "The drummer's wedge stays the same" },
    ],
    hints: ["A subgroup is a bus that feeds the stereo mix, with its own fader.", "SEL channel 1: in ROUTING press 1 and switch STEREO off. The same on channel 2. Then DISPLAY ACCESS ROUTING: BUS 1 TO ST on.", "LAYER MASTER: pull BUS 1 down about 6 dB."],
    complete: "Exactly how an analog console's subgroups work: channels to a bus, the bus to the stereo mix. Switching the channels' own STEREO off stops them arriving twice.",
  },
  {
    id: "dm2000-bus-to-st",
    short: "Silent drums (BUS TO ST)",
    title: "The drums went missing",
    who: "Drummer",
    prompt: "“Last night's engineer put my kit and the bass through BUS 1. Tonight neither of us is in the house.”",
    goal: "Drums and bass back in the house, still through BUS 1.",
    setup: {
      tweak: (st, h) => {
        for (const s of ["drums", "bass"]) {
          h.set(s, "lr", false);
          h.set(s, "sends.bus1", 1);
        }
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("heard", "Drums and bass are heard in the house", (ctx) => ["drums", "bass"].every((s) => house(ctx, s) >= AUDIBLE)),
      keep("bus", "They still go through BUS 1 (not straight to STEREO)", (ctx) => ["drums", "bass"].every((s) => sc(ctx, s)?.lr === false && sc(ctx, s)?.sends.bus1 >= 0.5)),
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: ["drums", "bass"], toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: ["Their meters move and their faders are up. Follow the signal: channel → BUS 1 → ?", "A bus only reaches the house if it's routed to the STEREO bus: DISPLAY ACCESS ROUTING, BUS TO ST.", "Switch BUS 1 TO ST on."],
    complete: "A bus is a dead end until it's routed somewhere: the STEREO bus (BUS TO ST) or an output.",
  },
  {
    id: "dm2000-fader-group",
    short: "Ride the horns (FADER GROUP)",
    title: "Ride the horns and harmonies",
    who: "Band leader",
    prompt: "“Trumpets and backing vocals go up and down together all night. Link them so one fader moves both, and pull them down a few dB now.”",
    goal: "Trumpets and backing vocals in one fader group, both at least 3 dB down in the house; everything else unchanged.",
    setup: {},
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("group", "Trumpets and backing vocals share a fader group", (ctx) => Object.keys(sc(ctx, "trumpets")?.fgrp || {}).some((g) => sc(ctx, "trumpets").fgrp[g] && sc(ctx, "backing-vocals")?.fgrp[g])),
      { id: "tpt", kind: "goal", type: "mainLowered", source: "trumpets", baseline: "main", minDb: 3, label: "The trumpets are down at least 3 dB" },
      { id: "bv", kind: "goal", type: "mainLowered", source: "backing-vocals", baseline: "main", minDb: 3, label: "The backing vocals are down at least 3 dB" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", except: ["trumpets", "backing-vocals"], toleranceDb: 1, label: "Everything else in the house stays the same" },
    ],
    hints: ["A fader group links faders: move one and the others follow, keeping their balance.", "DISPLAY ACCESS GROUP: press fader group A, then SEL channels 5 and 6. Press A again to finish.", "Now pull channel 5's fader down a few dB: channel 6 follows."],
    complete: "Fader groups move real faders together; there's no master fader as with a DCA. Hold a channel's SEL while you move its fader to move it alone.",
  },
  {
    id: "dm2000-mute-group",
    short: "One ON key (MUTE GROUP)",
    title: "One key between songs",
    who: "MC",
    prompt: "“Between songs I talk. One key should switch off the drums, guitar and trumpet mics. The vocal mics stay live.”",
    goal: "Drums, guitar and trumpets in one mute group, all three switched off; vocals still live.",
    setup: {},
    conditions: [
      goal("group", "Drums, guitar and trumpets share a mute group", (ctx) => Object.keys(ctx.state.mgrp).some((g) => ["drums", "guitars", "trumpets"].every((s) => sc(ctx, s)?.mgrp[g]))),
      goal("out", "They're out of the house", (ctx) => ["drums", "guitars", "trumpets"].every((s) => house(ctx, s) < AUDIBLE)),
      { id: "vox", kind: "keep", type: "sourceHeardInMain", source: "lead-vocal", label: "The lead vocal stays live" },
      { id: "bv", kind: "keep", type: "sourceHeardInMain", source: "backing-vocals", label: "The backing vocal stays live" },
    ],
    hints: ["Switching three ON keys after every song is slow and easy to get wrong.", "DISPLAY ACCESS GROUP: press mute group I, then SEL channels 1, 3 and 5. Press I again to finish.", "Press channel 1's ON key: 3 and 5 go off with it."],
    complete: "On the DM2000 a mute group links ON keys: no master, any member's key switches them all. Press it again after the talking to bring them all back.",
  },
  {
    id: "dm2000-output-patch",
    short: "Wedge on OMNI 7",
    title: "The wedge on OMNI OUT 7",
    who: "Stage hand",
    prompt: "“OMNI OUT 1's jack is crackling, so I moved the singer's wedge to OMNI OUT 7. Now it's silent.”",
    goal: "The singer's wedge fed AUX 1 again, from OMNI OUT 7.",
    setup: {
      tweak: (st, h) => {
        h.cut("mixer/out1");
        h.cable("mixer/out7", "wedge/in", "xlr-trs");
      },
    },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      { id: "chain", kind: "goal", type: "validChain", output: "aux1", device: "wedge", label: "The singer's wedge is fed by AUX 1" },
      { id: "listen", kind: "goal", type: "listenedTo", dest: "aux1", label: "You listened to it" },
      { id: "house", kind: "keep", type: "mainUnchanged", baseline: "main", toleranceDb: 1, label: "The house mix stays the same" },
    ],
    hints: ["The wedge's mix is AUX 1. Which OMNI OUT carries AUX 1, and which is the wedge on now?", "DISPLAY ACCESS OUTPUT PATCH.", "Set OMNI OUT 7 to AUX 1."],
    complete: "Only STEREO OUT has its own jacks on the DM2000. Every other output goes wherever the OUTPUT PATCH sends it.",
  },
  like("dm2000", "x32-matrix", {
    prompt: "“The lobby speaker is on OMNI OUT 8. Give it the house mix, and I want to set its level without touching the house.”",
    goal: "The lobby speaker fed by MATRIX 1, which carries the STEREO mix; the house unchanged.",
    setup: {
      tweak: (st, h) => {
        h.addDevice("lobby");
        h.cable("mixer/out8", "lobby/in", "xlr-trs");
      },
    },
    hints: ["A matrix mixes the STEREO bus, the buses and the auxes, each at its own level, with its own master.", "DISPLAY ACCESS MATRIX, MATRIX 1: turn STEREO up.", "Then OUTPUT PATCH: set OMNI OUT 8 to MATRIX 1."],
    complete: "Matrices feed the places that need the show but not their own mix: lobbies, delays, recorders. The DM2000 has four, on the MASTER layer.",
  }),
  like("dm2000", "x32-scene-recall", {
    hints: ["Rebuilding it by hand takes ages and you'll miss something.", "DISPLAY ACCESS SCENE lists the saved scenes.", "RECALL scene 02."],
  }),
  like("dm2000", "yam01v96-new-mix", {
    prompt: "“My wedge is on OMNI OUT 3. Lots of me, the vocal, a bit of drums, and it mustn't follow the house faders.”",
    setup: {
      tweak: (st, h) => {
        h.addDevice("gwedge");
        h.cable("mixer/out3", "gwedge/in", "xlr-trs");
      },
    },
    hints: ["OMNI OUT 3 carries AUX 3 (OUTPUT PATCH). Listen to AUX 3: it's empty.", "SEL the guitar, the vocal and the drums in turn: in AUX SEND (BANK 1–4) turn AUX 3 up and press its PRE.", "Guitar and vocal near 0 dB, drums lower. Or use ENCODER MODE AUX with AUX SELECT 3 for all of them at once."],
  }),
];


// ---------- Zoom F8n Pro ----------
// A recorder with a mixer inside: TRIM sets each iso, the track knobs build
// the L/R mix for the cameras. The camera lessons of the 442, plus routing.
const F8S = [
  {
    id: "f8n-track",
    short: "Dark track key",
    title: "The vocal that isn't there",
    who: "Director",
    prompt: "“I can't hear the singer at all on the camera, and there's nothing on her meter.”",
    goal: "The lead vocal back in the L/R mix, and recording.",
    setup: { tweak: (st, h) => h.set("lead-vocal", "enabled", false) },
    baseline: { main: { metric: "mainDbByChannel" } },
    conditions: [
      goal("on", "Track 6's key is lit: the input is on and records", (ctx) => sc(ctx, "lead-vocal")?.enabled === true),
      { id: "heard", kind: "goal", type: "sourceHeardInMain", source: "lead-vocal", label: "The vocal is in the L/R mix" },
      { id: "rest", kind: "keep", type: "mainUnchanged", baseline: "main", except: "lead-vocal", toleranceDb: 1, label: "Everything else in the mix stays the same" },
    ],
    hints: ["No meter at all means no input, not a quiet one.", "On the F8n a dark track key means that input is off: not in the mix and not recorded.", "Press track key 6 so it lights red."],
    complete: "Track keys are the F8n's input switches. Before you roll, check every track you need is lit.",
  },
  {
    id: "f8n-trim",
    short: "Tiny vocal (TRIM)",
    title: "The tiny vocal track",
    who: "Editor",
    prompt: "“Yesterday's vocal track was so quiet I had to boost it 30 dB in the edit, and now it's all hiss. Fix it before today's take.”",
    goal: "The vocal's input at a healthy level, set with TRIM.",
    setup: { tweak: (st, h) => h.set("lead-vocal", "gainDb", 12) },
    baseline: { levels: { metric: "channelLevels" } },
    conditions: [
      { id: "gain", kind: "goal", type: "sourceGain", source: "lead-vocal", label: "The vocal's input sits in Good" },
      keep("knob", "Its track knob stays put (the knob doesn't change the recording)", (ctx) => Math.abs(sc(ctx, "lead-vocal").level - ctx.baseline.levels[mc(ctx, "lead-vocal").index]) < 0.01),
    ],
    hints: ["The editor works from the isolated tracks. What sets a track's recording level?", "Not the track knob: that's the mix. TRIM is in INPUT for the selected track.", "Open INPUT, select track 6 and turn TRIM up until the meter sits in Good."],
    complete: "TRIM records the track; the knob only mixes it. A quiet iso can't be fixed later without bringing up the noise with it.",
  },
  like("f8n", "x32-room", {
    prompt: "“The audience mics on 7 and 8 are dead.”",
    hints: ["The room pair are condensers.", "Condensers need phantom power: INPUT, track 7, +48V.", "Switch +48V on for tracks 7 and 8."],
    complete: "The F8n powers condensers itself, per input. No phantom, no condenser.",
  }),
  {
    id: "f8n-hpf",
    short: "Wind rumble (HPF)",
    title: "Rumble on the vocals",
    who: "Editor",
    prompt: "“There's a low rumble from the stage on both vocal tracks. The bass is fine.”",
    goal: "HPF at 80 Hz or higher on both vocal tracks, none on the bass.",
    setup: {
      tweak: (st, h) => {
        h.set("lead-vocal", "hpf", 0);
        h.set("backing-vocals", "hpf", 0);
      },
    },
    conditions: [
      goal("vox", "Both vocals filtered at 80 Hz or higher", (ctx) => ["lead-vocal", "backing-vocals"].every((s) => hpfHz("f8n", 0, sc(ctx, s)?.hpf ?? 0) >= 80)),
      keep("bass", "The bass isn't filtered", (ctx) => !hpfHz("f8n", 0, sc(ctx, "bass")?.hpf ?? 0)),
    ],
    hints: ["Rumble is below anything a voice needs.", "Each input has an HPF (10–240 Hz) in INPUT.", "Tracks 5 and 6: HPF to about 100 Hz. Leave the bass alone."],
    complete: "On a recorder the HPF is printed into the track: filter what nobody will ever want, and no more.",
  },
  {
    id: "f8n-pfl",
    short: "Check one mic (PFL)",
    title: "Is the guitar mic crackling?",
    who: "Guitarist",
    prompt: "“I think my mic cable crackles. Can you listen to just my mic?”",
    goal: "The guitar track alone in the headphones (PFL).",
    setup: {},
    baseline: { levels: { metric: "channelLevels" } },
    conditions: [goal("pfl", "Track 3 on PFL, heard in the headphones", (ctx) => sc(ctx, "guitars")?.solo === true && heard(ctx, "phones")), keep("mix", "The camera mix stays the same", (ctx) => ctx.state.channels.every((c, i) => Math.abs(c.level - ctx.baseline.levels[i]) < 0.01))],
    hints: ["Pulling the other knobs down would wreck the camera mix.", "PFL puts one track in the headphones, before its knob, without touching the mix.", "Press PFL on track 3 and listen in the headphones."],
    complete: "PFL checks one input without changing anything anyone else hears or records.",
  },
  {
    id: "f8n-balance",
    short: "Camera mix (knobs)",
    title: "The camera mix is all drums",
    who: "Director",
    prompt: "“The camera's audio is all drums. I need to hear the singer over the band. Don't touch the recordings, the editor likes them.”",
    goal: "The vocal at least 3 dB above the drums in the L/R mix, every TRIM unchanged.",
    setup: { tweak: (st, h) => h.moveFader("drums", 10) },
    baseline: { gains: { metric: "channelGains" } },
    conditions: [
      goal("vox", "The vocal is at least 3 dB above the drums in L/R", (ctx) => house(ctx, "lead-vocal") >= house(ctx, "drums") + 3),
      keep("trim", "Every TRIM stays the same (the recordings don't change)", (ctx) => ctx.state.channels.every((c, i) => Math.abs(c.gainDb - ctx.baseline.gains[i]) < 0.25)),
    ],
    hints: ["The cameras get the L/R mix. Which controls build it?", "The track knobs: each one is a fader into L/R. TRIM would change the recording too.", "Turn track 1's knob (drums) down, or track 6 (vocal) up, until the vocal sits on top."],
    complete: "On a recorder-mixer the knobs belong to the mix and TRIM belongs to the recording. Ride the knobs all you like; the isos stay clean.",
  },
  {
    id: "f8n-link",
    short: "Mono audience (LINK)",
    title: "The audience sounds mono",
    who: "Editor",
    prompt: "“The audience pair on 7/8 sounds like one mic in the middle of the camera mix.”",
    goal: "Tracks 7 and 8 stereo-linked: left and right in the mix.",
    setup: { tweak: (st) => (st.link.mode = "off") },
    conditions: [goal("link", "Stereo Link on for 7/8", (ctx) => ctx.state.link?.mode === "on"), { id: "l", kind: "keep", type: "sourceHeardInMain", source: "room-l", label: "The audience stays in the mix" }],
    hints: ["Two mics panned to the centre are mono.", "Stereo Link makes 7/8 a pair: 7 left, 8 right, one knob.", "INPUT, track 7 or 8: press LINK 7/8."],
    complete: "A linked pair keeps its image: left mic left, right mic right, moved by one knob.",
  },
  {
    id: "f8n-camera",
    short: "Distorted camera (LINE/MIC)",
    title: "The distorted main camera",
    who: "Camera operator",
    prompt: "“The audio on the main camera is distorted on both channels, even with my levels right down.”",
    goal: "Both main-camera inputs getting the level they're set for.",
    setup: { tweak: (st, h) => ["cam-1", "cam-2"].forEach((id) => h.dev(id, "inputLevel", 0)) },
    conditions: [goal("match", "Both camera inputs match the level they're fed", camerasOk), keep("fed", "The camera stays on MAIN OUT 1/2", camerasFed)],
    hints: ["Distortion that turning down doesn't fix is a level mismatch.", "MAIN OUT 1/2 are at LINE (+4). The camera inputs are set to MIC, which adds about 40 dB.", "MAIN OUT has no MIC setting: set both camera inputs to LINE (their cards in the Outputs)."],
    complete: "MAIN OUT is LINE or −10 only, so a camera fed from it must be on LINE. Match the type of level first.",
  },
  {
    id: "f8n-dslr",
    short: "Distorted camera B (SUB OUT)",
    title: "The distorted second camera",
    who: "Second camera operator",
    prompt: "“My little camera's audio is crunchy. It's plugged into the recorder's SUB OUT.”",
    goal: "Camera B fed at mic level from SUB OUT.",
    setup: { tweak: (st, h) => h.dev("mixer", "subLevel", 0) },
    conditions: [goal("ok", "Camera B gets mic level", (ctx) => endpoint(ctx, "dslr")?.status === "ok"), keep("main", "The main camera still matches", camerasOk)],
    hints: ["A small camera's 3.5 mm jack is a mic input, with no LINE setting.", "SUB OUT is at NORMAL (−10): about 26 dB too hot for it. OUTPUT has SUB OUT's Output Level.", "OUTPUT: set SUB OUT to MIC (−40)."],
    complete: "SUB OUT's MIC level exists for exactly this: a camera that only has a mic jack.",
  },
  {
    id: "f8n-iso-safety",
    short: "Vocal safety (MAIN OUT 2)",
    title: "A safety track for the vocal",
    who: "Director",
    prompt: "“Put the singer alone on the main camera's channel 2, before your knob, so we have a clean copy whatever you do to the mix. Channel 1 keeps the mix.”",
    goal: "MAIN OUT 2 carrying only the lead vocal, prefader; MAIN OUT 1 still the mix.",
    setup: {},
    conditions: [
      goal("route", "MAIN OUT 2 carries tracks, not L/R", (ctx) => ctx.state.routing.out2 === "bus2"),
      goal("vox", "The vocal is on it, prefader", (ctx) => sc(ctx, "lead-vocal")?.sends.bus2 >= 0.5 && sc(ctx, "lead-vocal")?.pres.bus2 === true),
      keep("only", "Nothing else is on it", (ctx) => ctx.state.channels.every((c, i) => i === mc(ctx, "lead-vocal").index || !(c.sends.bus2 >= 0.5))),
      keep("mix", "MAIN OUT 1 keeps the mix (L)", (ctx) => ctx.state.routing.out1 === "main-l"),
    ],
    hints: ["MAIN OUT 2 carries R of the mix right now. It can carry tracks instead.", "OUTPUT, MAIN OUT 2: track keys there cycle PRE → POST → OFF.", "On MAIN OUT 2's row press track 6 once (PRE). That replaces R with the vocal alone."],
    complete: "Prefader routing sends a track to an output whatever its knob does: a safety copy on the camera, independent of the mix.",
  },
];

CL3.push(
  eqMud("cl3", {
    hints: ["SEL channel 3 (GTR). In the SELECTED CHANNEL section, turn LOW-MID's GAIN down a few dB with its FREQUENCY near 300 Hz.", "Nothing changed? The EQ starts switched off: open SELECTED CHANNEL on the screen and press EQ ON."],
    complete: "Every EQ on this desk starts switched off. Knobs first or ON first, it doesn't matter, but check the curve before you trust your ears.",
  }),
);
UI.push(
  eqMud("ui16", {
    hints: ["SEL channel 3 (GTR) and turn LO MID's GAIN down a few dB, FREQ near 300 Hz.", "Nothing changed? The EQ starts switched off: press EQ ON. The curve turns green."],
    complete: "The EQ only works when it's switched in. The curve going from grey to coloured is your proof.",
  }),
  eqOff("ui16", {
    hints: ["SEL channel 7 (VOX). The EQ graph is grey and dashed, marked EQ OFF: the bands are set but switched out.", "Press EQ ON in the corner of the EQ section. Leave the bands alone."],
    complete: "EQ ON switches the whole EQ in or out. It's how you compare with and without (an A/B), and it's easy to leave off. Trust the curve, not the knobs.",
  }),
  compOff("ui16", {
    hints: ["SEL channel 7 (VOX): the COMPRESSOR graph says COMP OFF and the GR bar never moves.", "Press COMP ON. The curve bends at the threshold and GR starts moving on the loud lines."],
    complete: "A compressor dialled in but switched off does nothing at all. After setting one, check the GR meter moves.",
  }),
);
X32.push(
  eqMud("x32c", {
    hints: ["SEL channel 03 and, in the channel strip's EQ, turn LO MID's GAIN down a few dB with FREQ near 300 Hz.", "Nothing changed? The EQ starts switched off: press EQ ON. The HOME screen's curve shows it."],
    complete: "On the X32 every processing block has its own on button. Set it, switch it in, check the curve.",
  }),
  eqOff("x32c", {
    hints: ["SEL channel 07. The main display's HOME screen draws its EQ: flat, grey and marked EQ OFF.", "In the channel strip's EQ section, press EQ ON. Leave the bands alone."],
    complete: "Every processing block on the X32 has its own on button. The display's curves show what's really switched in.",
  }),
  compOff("x32c", {
    hints: ["SEL channel 07: the DYN graph on the main display says COMP OFF, and the GR bar never moves.", "In the channel strip's COMPRESSOR section, press COMP ON."],
    complete: "A compressor dialled in but switched off does nothing at all. After setting one, check that the GR meter moves.",
  }),
);
X32F.push(
  eqMud("x32", {
    hints: ["SEL channel 03 and, in the channel strip's EQ, turn LO MID's GAIN down a few dB with FREQ near 300 Hz.", "Nothing changed? The EQ starts switched off: press EQ ON. The HOME screen's curve shows it."],
    complete: "On the X32 every processing block has its own on button. Set it, switch it in, check the curve.",
  }),
  eqOff("x32", {
    hints: ["SEL channel 07. The main display's HOME screen draws its EQ: flat, grey and marked EQ OFF.", "In the channel strip's EQ section, press EQ ON. Leave the bands alone."],
    complete: "Every processing block on the X32 has its own on button. The display's curves show what's really switched in.",
  }),
  compOff("x32", {
    hints: ["SEL channel 07: the DYN graph on the main display says COMP OFF, and the GR bar never moves.", "In the channel strip's COMPRESSOR section, press COMP ON."],
    complete: "A compressor dialled in but switched off does nothing at all. After setting one, check that the GR meter moves.",
  }),
);
Y96.push(
  eqMud("yam01v96", {
    hints: ["SEL channel 3, press the LOW-MID band key, then turn GAIN down a few dB with FREQUENCY near 300 Hz.", "Nothing changed? The EQ starts switched off: DISPLAY ACCESS EQ, then EQ ON."],
    complete: "On the 01V96 the EQ's ON lives on the EQ page, away from the knobs. Check it whenever an EQ move does nothing.",
  }),
  eqOff("yam01v96", {
    hints: ["SEL channel 7, then DISPLAY ACCESS EQ. The bands are set, but the curve is flat and marked EQ OFF.", "Press EQ ON on the EQ page. Leave the bands alone."],
    complete: "On the 01V96 the EQ's ON lives on the EQ page. The SELECTED CHANNEL knobs still move the bands while it's off, so check the curve.",
  }),
  compOff("yam01v96", {
    hints: ["SEL channel 7, then DISPLAY ACCESS DYNAMICS: COMP OFF, and the GR bar never moves.", "Press DYNAMICS ON on the DYNAMICS page."],
    complete: "A compressor dialled in but switched off does nothing at all. After setting one, check the GR meter moves.",
  }),
);

const ORDER = {
  mix8: ["doors", "phones", "ol", "boomy", "pan", "keys-wedge", "wedge-loud", "speech", "ballad", "overhead", "guest"],
  stagepas400bt: ["doors", "micline", "monitor", "speech", "speakers", "reverb", "hall", "mono", "overhead", "sub", "feedback"],
  mg102: ["doors", "phantom", "peak", "less-drums", "one-knob", "thin-bass", "rumble", "reverb-loud", "2tr"],
  vlz1202: ["doors", "trim", "nasal", "pad", "pfl", "wedge-quiet", "lowcut", "reverb", "prefader", "efx", "tape", "alt"],
  x1204usb: ["doors", "minus10", "overhead", "pfl", "comp", "fx", "slapback", "wedge", "pre", "ret-mon", "cdtape", "alt"],
  cr1604: ["doors", "phantom", "assign", "levelset", "sweep", "lowcut", "mute-pre", "drummer-quiet", "reverb", "efx-mon", "mono", "shift", "subgroup", "direct", "room"],
  ui16: ["doors", "gain", "48v", "more-keys", "hpf", "mud", "harsh", "eq-on", "comp", "comp-on", "trumpet-reverb", "delay", "out-of-house", "post", "guitar-mix"],
  sd442: ["camera", "tone", "phantom", "hot-vocal", "master", "line", "hpf", "mono", "iso"],
  yam01v96: ["doors", "pad", "phantom", "on", "fader-mode", "master", "mud", "eq", "eq-on", "to-st", "reverb", "pre-point", "comp", "comp-on", "new-mix"],
  x32: ["doors", "mud", "eq-on", "comp-on", "room", "routing-house", "routing-wedge", "mc", "matrix", "subgroup", "fx", "scene-recall", "scene-store", "bus9"],
  f8n: ["track", "trim", "room", "hpf", "pfl", "balance", "link", "camera", "dslr", "iso-safety"],
  dm2000: ["doors", "pad", "48v", "on", "mud", "eq-on", "comp-on", "fader-mode", "encoder", "to-st", "reverb", "subgroup", "bus-to-st", "fader-group", "mute-group", "output-patch", "matrix", "scene-recall", "new-mix"],
  cl3: ["doors", "gain", "48v", "on", "mud", "eq-on", "comp-on", "sof", "routing-house", "routing-wedge", "dca", "mute-group", "matrix", "fx", "dante", "scene-recall", "scene-store"],
  x32c: ["doors", "gain", "48v", "lowcut", "mud", "eq-on", "comp-on", "lr", "sof", "drummer-quiet", "bus-mute", "reverb", "out-of-house", "dca", "mute-group", "new-mix"],
};

const LISTS = { f8n: F8S, dm2000: DM, cl3: CL3, mix8: MIX8, vlz1202: VLZ, mg102: MG, stagepas400bt: SP, x1204usb: XEN, sd442: SD, ui16: UI, cr1604: C16, x32c: X32, yam01v96: Y96, x32: X32F };

// Arrange a board's scenarios in ORDER, number them from 1, and tag them with the mixer.
function arrange(board) {
  const byId = Object.fromEntries(LISTS[board].map((s) => [s.id, s]));
  const ids = ORDER[board].map((k) => `${board}-${k}`);
  const missing = ids.filter((id) => !byId[id]);
  const extra = Object.keys(byId).filter((id) => !ids.includes(id));
  if (missing.length || extra.length) throw new Error(`${board}: missing ${missing}, unordered ${extra}`);
  return ids.map((id, i) => ({ board, number: i + 1, ...byId[id] }));
}

export const BOARD_SCENARIOS = Object.fromEntries(Object.keys(ORDER).map((b) => [b, arrange(b)]));

// The order to learn the real mixers in, simplest first (each builds on the last).
export const MIXER_ORDER = [
  { model: "mix8", skin: "mix8", why: "Four channels, one post-fader AUX, no mute or solo: the basics with nowhere to hide." },
  { model: "stagepas400bt", skin: "stagepas400bt", why: "A powered mixer: MIC/LINE instead of GAIN, the amp inside, MONITOR OUT as the whole mix." },
  { model: "mg102", skin: "mg102", why: "GAIN, HPF and PEAK on every mic, and one AUX knob that has to choose between wedge and reverb." },
  { model: "vlz1202", skin: "vlz1202", why: "Two auxes with a PRE switch, effects send and return, MUTE/ALT 3-4, solo and a C-R SOURCE matrix." },
  { model: "x1204usb", skin: "x1204usb", why: "Faders, compressors, built-in effects, PRE per channel, PFL or solo-in-place, an ALT bus with its own fader." },
  { model: "cr1604", skin: "mackie1604", why: "A full console: 16 channels, six auxes with SHIFT, four subgroups, mono out, four returns, direct outs to a recorder." },
  { model: "ui16", skin: "ui16", why: "Digital: the same jobs through pages and SEL. Sends on faders, a parametric EQ and a compressor on every channel." },
  { model: "x32c", skin: "x32c", why: "A digital console laid out like the big ones: fader layers, a selected-channel strip, Sends on Faders, DCA and mute groups, a MAIN LR switch on every channel." },
  { model: "yam01v96", skin: "yam01v96", why: "The classic digital desk: analog GAIN and PAD on top, then LAYERs, FADER MODE for the aux sends, ON keys, and a display you page through for routing, EQ, dynamics and aux setup." },
  { model: "dm2000", skin: "dm2000", why: "The 01V96's big brother: 24 faders with an encoder each, a SELECTED CHANNEL section with every knob, 8 buses routed with keys and BUS TO ST, an OUTPUT PATCH, and Yamaha fader and mute groups." },
  { model: "x32", skin: "x32", why: "The full console: 32 inputs, 16 mix buses that can be subgroups, MONO/CENTER, six matrices, an FX rack, output ROUTING and SCENES." },
  { model: "cl3", skin: "cl3", why: "A touring console: mics on a Rio stage box, OUTPUT PATCH over Dante, Centralogic under a touch screen (OVERVIEW and SELECTED CHANNEL VIEW), ON keys, 16 DCAs, 8 matrices and scenes." },
  { model: "sd442", skin: "sd442", why: "A different world: a field mixer feeding a camera. Output levels, tone, limiters and the mono check." },
  { model: "f8n", skin: "f8n", why: "A recorder that is also a mixer: every input records its own track while the track knobs build a mix for the cameras. TRIM vs fader, MAIN OUT routing, output levels." },
];
