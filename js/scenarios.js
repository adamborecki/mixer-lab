// Scenarios are data: a setup (rig + mixer values), named baselines captured
// at the start, and declarative conditions evaluated from state + computed
// signal flow. Nothing here knows which skin is showing, and no condition is
// ever satisfied by a "done" button. See docs/SCENARIOS.md.

import { SOURCES_BY_ID, STEMS, sourcesForScenario } from "../audio/source-manifest.js";
import { DEVICE_TYPES, channelPortRef } from "./connection-model.js";
import { BUSES, computeMix, createMixerState, dbToLevel, levelToDb, clamp } from "./mixer-state.js";

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
  pwedge: { type: "passive-speaker", label: "Passive wedge · drummer", short: "drummer's wedge", zone: "stage", pan: 0 },
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
    id: "build-rig",
    number: 1,
    title: "Build the rig",
    who: "Band leader",
    prompt: "“Doors in ten minutes. Get at least two of us into the house speakers — the audience has to hear us.”",
    goal: "Two sources patched, gain-staged, and heard through a working Main L/R speaker chain.",
    setup: {
      devices: ["spk-l", "spk-r", "pspk-l", "amp", "wedge"],
      patch: "none",
      // Deliberately incomplete: Main L is already run to a passive speaker.
      cables: [{ from: "mixer/main-l", to: "pspk-l/in", cable: "xlr-trs" }],
      channels: "safe", // gain at minimum, faders down
      listen: "main",
    },
    conditions: [
      { id: "patched", kind: "goal", type: "sourcesPatched", min: 2, label: "Two different sources plugged into proper inputs" },
      { id: "gain", kind: "goal", type: "gainStaged", min: 2, label: "Their input meters show a healthy level — not low, not clipping" },
      { id: "chain", kind: "goal", type: "validChain", output: "main", zone: "foh", label: "A house speaker chain that can actually make sound" },
      { id: "heard", kind: "goal", type: "heardInMain", min: 2, label: "Both sources reach that speaker through Main" },
      { id: "no-broken", kind: "goal", type: "noBrokenChains", zone: "foh", label: "No house speaker left on a chain that can't work" },
    ],
    hints: [
      "Start at the destination. Which speakers does the audience hear — and could they make sound right now?",
      "Look at what Main L is plugged into. A passive speaker has no amplifier inside. Where is the amplifier?",
      "Patch Main L/R into the powered speakers (or Main → power amp input → amp output → passive speaker). Then plug in two sources, raise GAIN until the meter reads Good, and bring up the {level}.",
    ],
    complete: "That's a working rig: source → preamp → channel → Main → amplifier → speaker. Every speaker needs an amp somewhere — inside it (powered) or in front of it (passive).",
  },
  {
    id: "more-vocal",
    number: 2,
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
    id: "monitor-quiet",
    number: 3,
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
      "The destination is the drummer's wedge — and the complaint is about the whole mix, not one instrument. Which bus feeds it? Follow {aux2} out to the power amp and the passive wedge.",
      "Turning up every channel's {aux2} send one by one would work — slowly, and the balance would drift. What controls the whole {aux2} bus at once?",
      "Raise the {aux2Master}. Not the {aux1Master} — that's the singer's wedge.",
    ],
    complete: "One control, whole mix: the {aux2Master} sits after every {aux2} send is summed, so it moves the drummer's entire mix without touching its balance — or anyone else's wedge.",
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
    },
    conditions: [],
    hints: [],
    complete: null,
  },
];

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

// ---------- building a scenario's starting state ----------

export function buildScenarioState(def, sourcesById = SOURCES_BY_ID) {
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
      if (s.reference === false) continue; // available on stage, but the student patches it
      addCable({ from: `${sourceDeviceId(s.id)}/out`, to: channelPortRef(s.order - 1), cable: defaultCableFor(s) });
    }
  }
  for (const c of setup.cables || []) addCable(c);

  if (setup.channels === "mixed") {
    for (const s of sources) {
      const ch = state.channels[s.order - 1];
      ch.gainDb = nominalGainDb(s);
      ch.phantom = s.phantom === "required";
      ch.level = dbToLevel(s.mixDb);
      if (!ch.stereo) ch.pan = s.pan;
      for (const bus of BUSES) {
        const sends = (setup.sends && setup.sends[bus]) || {};
        ch.auxSends[bus] = dbToLevel(s.id in sends ? sends[s.id] : -Infinity);
      }
    }
  }
  // Masters default to unity; setup.masters gives exceptions in dB.
  for (const [bus, db] of Object.entries(setup.masters || {})) state[bus].level = dbToLevel(db);
  state.listen = setup.listen || "main";
  return state;
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
  // What each channel contributes to a wedge that actually makes sound.
  monitorByChannel: (ctx, p) => ctx.mix.channels.map((c) => c.aux[p.bus].heardDb),
};

export function captureBaseline(def, state, sourcesById = SOURCES_BY_ID, stems = STEMS) {
  const mix = computeMix(state, sourcesById, stems);
  const out = {};
  for (const [name, spec] of Object.entries(def.baseline || {})) out[name] = METRICS[spec.metric]({ state, mix }, spec);
  return out;
}

// ---------- conditions ----------

// Threshold for "you'd hear it": estimated peak at a speaker, dBFS.
export const AUDIBLE_DB = -45;
const OFF_DB = -60; // a send/contribution below this counts as off

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
  validChain(ctx, c) {
    const ports = c.output === "main" ? ["main-l", "main-r"] : [c.output];
    const ends = ctx.mix.rig.endpoints.filter((e) => e.valid && ports.includes(e.output) && (!c.zone || e.zone === c.zone));
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
  monitorMixUnchanged(ctx, c) {
    const base = ctx.baseline[c.baseline];
    const now = METRICS.monitorByChannel(ctx, c);
    return { met: now.every((v, i) => same(v, base[i], c.toleranceDb)) };
  },
  monitorRaised(ctx, c) {
    const now = METRICS.heardMonitorDb(ctx, c);
    const base = ctx.baseline[c.baseline];
    return { met: now - base >= c.minDb && now >= AUDIBLE_DB, detail: delta(now, base) };
  },
  mainUnchanged(ctx, c) {
    const base = ctx.baseline[c.baseline];
    const now = METRICS.mainDbByChannel(ctx);
    const moved = now.map((v, i) => !same(v, base[i], c.toleranceDb));
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
