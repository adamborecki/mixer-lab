// Compact analog mixers (definitions: js/compact-defs.js): semantic state,
// validation and level model, generic over the definition. Pure JS, runs under
// `node --test`. `compactModel(id)` returns the same interface js/cr1604.js
// offers, so js/mixer-state.js can dispatch to either. See docs/COMPACT_MIXERS.md.

import { COMPACT, EQ } from "./compact-defs.js";
import { analyzeRig } from "./connection-model.js";
import { FADER_LAW, HEADROOM_DB, gainToDb, inputBand, knobLaw, makeLaw, panGains } from "./levels.js";

export { COMPACT };
export const EQ_RANGE_DB = 15;
export const OL_DB = -3; // channel PEAK/OL LEDs: within 3 dB of clipping

export const LAWS = {
  level: FADER_LAW, // channel LEVEL and MAIN knobs: U at three quarters, +10 at the top
  send15: knobLaw(15), // aux and reverb sends: off, U at the detent, +15
  master: knobLaw(10), // master knobs with U at the detent: AUX masters, C-R/PHONES, STAGEPAS MASTER, MONITOR
  ret20: knobLaw(20), // returns and 2TR IN: off, U, +20
  // The MG10/2's AUX knob, measured from the centre (off) towards either side.
  yamahaAux: makeLaw([[0, -Infinity], [0.05, -50], [0.35, -20], [0.7, 0], [1, 6]]),
  // Sound Devices 442: channel faders off … 0 at the centre … +15; MASTER off … 0 … +6.
  sdFader: makeLaw([[0, -Infinity], [0.04, -60], [0.25, -20], [0.5, 0], [0.75, 8], [1, 15]]),
  master6: makeLaw([[0, -Infinity], [0.05, -50], [0.35, -20], [0.75, 0], [1, 6]]),
};

// The channel fader/LEVEL law of a mixer.
export const levelLaw = (def) => LAWS[def.levelLaw || "level"];

export const EQ_FOR = (name) => EQ[name] || [];

// The Ui16's 4-band parametric EQ: shelves at the ends, two bells in the middle.
export const PEQ_BANDS = [
  { id: "low", label: "LOW", type: "lowshelf", freq: 80, min: 20, max: 1000 },
  { id: "lowMid", label: "LO MID", type: "peaking", freq: 400, min: 60, max: 4000 },
  { id: "hiMid", label: "HI MID", type: "peaking", freq: 2500, min: 300, max: 12000 },
  { id: "high", label: "HIGH", type: "highshelf", freq: 8000, min: 1500, max: 20000 },
];
export const PEQ_Q = { min: 0.3, max: 8 };
export const DYN = { threshold: [-50, 0], ratio: [1, 20], makeup: [0, 24] };

export const isBipolar = (def, sendId) => !!def.sends[sendId]?.bipolar;
export const tapeIndex = (def) => def.channels.length;

// ---------- state ----------

function createChannel(def, i) {
  const c = def.channels[i];
  const g = c.gain;
  return {
    index: i,
    label: c.label,
    stereo: c.kind === "stereo",
    gainDb: g.min ?? g.fixed ?? 0,
    micLine: g.switch || g.lineSwitch ? "mic" : undefined,
    hpf: 0, // sweepable high-pass: 0 = off (the detent), then 80 … 240 Hz (442)
    polarity: false,
    phantom: false,
    lowCut: false,
    comp: 0, // one-knob compressor (Xenyx)
    pre: false, // a per-channel PRE switch for the "channel" send (Xenyx AUX 1)
    minus10: false, // stereo LEVEL switch at −10 dBV (Xenyx)
    hiZ: false,
    eq: Object.fromEntries(EQ_FOR(c.eq).map((b) => [b.id, 0])),
    sends: Object.fromEntries((c.sends || []).map((s) => [s, 0])),
    // Ui16: each aux send is PRE (the default) or POST on each channel.
    pres: Object.fromEntries((c.sends || []).filter((s) => def.sends[s].tap === "each").map((s) => [s, true])),
    peq: c.peq ? Object.fromEntries(PEQ_BANDS.map((b) => [b.id, { gain: 0, freq: b.freq, q: 0.7 }])) : undefined,
    dyn: c.dyn ? { threshold: 0, ratio: 1, makeup: 0 } : undefined,
    pan: 0,
    enabled: true,
    solo: false,
    stMono: false,
    level: 0,
    auxSends: {}, // the generic mixer's field; scenario conditions look for it
  };
}

export function createState(id) {
  const def = COMPACT[id];
  const state = {
    model: id,
    channels: def.channels.map((_, i) => createChannel(def, i)),
    main: { level: def.main.law === "master" ? 0.5 : 0.75 },
    listen: "main",
    // The 442's OUTPUT LEVEL switch lives on the mixer device: what the XLR outs carry decides what they can feed.
    rig: { devices: [{ id: "mixer", type: id, label: def.name, ...(def.outLevel ? { outLevel: 2 } : {}) }], cables: [] },
  };
  if (def.tape) state.channels.push({ index: def.channels.length, label: def.tape.level || def.tape.label || "TAPE", stereo: true, tape: true, gainDb: 0, level: 0.5, toMain: false, toCr: false, enabled: true, pan: 0, phantom: false, auxSends: {}, sends: {}, eq: {} });
  for (const [b, bus] of Object.entries(def.buses)) state[b] = { level: bus.master ? 0.5 : 1, pre: bus.preSwitch ? true : undefined, solo: bus.solo ? false : undefined };
  for (const r of def.returns || []) state[r.id] = { level: r.fixedDb !== undefined ? 1 : 0.5, efx: r.efxToMonitor ? false : undefined, mon: r.toMonitor ? 0 : undefined, toAlt: r.toAlt ? false : undefined };
  if (def.alt) state.alt = { toMain: false, level: def.alt.fader ? 0.75 : undefined };
  if (def.phones) state.cr = { level: 0.5, main: true, alt: false, tape: false, ...(def.phones.selector ? { src: "ST" } : {}) };
  if (def.link) state.link = { mode: "off" };
  if (def.outputLimiter) state.lim = { mode: "link" };
  if (def.tone) state.tone = { on: false };
  if (def.solo) state.soloBus = { mode: def.solo.mode === "switch" ? "sip" : def.solo.mode }; // "pfl" or "sip" (solo in place)
  if (def.fx) state.fx = { program: 0 };
  if (def.reverb) state.reverb = { on: false, type: 0.15 };
  if (def.monitorOut) state.monitor = { level: 0 };
  if (def.masterEq) state.masterEq = { pos: 0.5 };
  if (def.feedbackSuppressor) state.fbs = { on: false };
  if (def.xlrPad) state.xlrPad = { on: false };
  return state;
}

// ---------- validation ----------

const bool = (v) => !!v;
const range = (lo, hi, step) => (v) => {
  const n = Math.min(hi, Math.max(lo, Number(v)));
  return Number.isFinite(n) ? (step ? Math.round(n / step) * step : n) : undefined;
};

export function sanitizeChannel(def, ch, key, value) {
  if (ch.tape) return { level: range(0, 1), toMain: bool, toCr: bool }[key]?.(value);
  const c = def.channels[ch.index];
  const [a, b, k] = key.split(".");
  if (a === "pres") return def.sends[b]?.tap === "each" && (c.sends || []).includes(b) ? bool(value) : undefined;
  if (a === "peq") {
    const band = c.peq && PEQ_BANDS.find((x) => x.id === b);
    if (!band) return undefined;
    return { gain: range(-15, 15, 0.5), freq: range(band.min, band.max, 1), q: range(PEQ_Q.min, PEQ_Q.max, 0.05) }[k]?.(value);
  }
  if (a === "dyn") return c.dyn && DYN[b] ? range(DYN[b][0], DYN[b][1], b === "ratio" ? 0.1 : 0.5)(value) : undefined;
  if (a === "eq") return EQ_FOR(c.eq).some((x) => x.id === b) ? range(-EQ_RANGE_DB, EQ_RANGE_DB, 0.5)(value) : undefined;
  if (a === "sends") return (c.sends || []).includes(b) ? range(isBipolar(def, b) ? -1 : 0, 1)(value) : undefined;
  switch (key) {
    case "gainDb":
      return c.gain.min !== undefined ? range(c.gain.min, c.gain.max, 0.5)(value) : undefined;
    case "micLine":
      return (c.gain.switch || c.gain.lineSwitch) && (value === "mic" || value === "line") ? value : undefined;
    case "hpf":
      return c.hpf ? range(0, 1)(value) : undefined;
    case "polarity":
      return c.polarity ? bool(value) : undefined;
    case "lowCut":
      return c.lowCut ? bool(value) : undefined;
    case "comp":
      return c.comp ? range(0, 1)(value) : undefined;
    case "pre":
      return (c.sends || []).some((sid) => def.sends[sid].tap === "channel") ? bool(value) : undefined;
    case "minus10":
      return c.gain.minus10 ? bool(value) : undefined;
    case "hiZ":
      return c.hiZ ? bool(value) : undefined;
    case "stMono":
      return c.stMono ? bool(value) : undefined;
    case "enabled":
      return c.mute ? bool(value) : undefined;
    case "solo":
      return c.solo ? bool(value) : undefined;
    case "phantom":
      return def.phantom.channels.includes(ch.index) ? bool(value) : undefined;
    case "pan":
      return range(-1, 1)(value);
    case "level":
      return range(0, 1)(value);
    default:
      return undefined;
  }
}

export function busKeys(def) {
  const keys = { main: { level: range(0, 1) } };
  for (const [b, bus] of Object.entries(def.buses)) keys[b] = { ...(bus.master ? { level: range(0, 1) } : {}), ...(bus.preSwitch ? { pre: bool } : {}), ...(bus.solo ? { solo: bool } : {}) };
  for (const r of def.returns || []) keys[r.id] = { ...(r.fixedDb === undefined ? { level: range(0, 1) } : {}), ...(r.efxToMonitor ? { efx: bool } : {}), ...(r.toMonitor ? { mon: range(0, 1) } : {}), ...(r.toAlt ? { toAlt: bool } : {}) };
  if (def.alt) keys.alt = def.alt.fader ? { level: range(0, 1) } : { toMain: bool };
  if (def.solo?.mode === "switch") keys.soloBus = { mode: (v) => (v === "pfl" || v === "sip" ? v : undefined) };
  if (def.fx) keys.fx = { program: range(0, def.fx.presets.length - 1, 1) };
  if (def.phones) keys.cr = { level: range(0, 1), ...(def.phones.sources ? Object.fromEntries(def.phones.sources.map((s) => [s, bool])) : {}), ...(def.phones.selector ? { src: (v) => (def.phones.selector.includes(v) ? v : undefined) } : {}) };
  if (def.link) keys.link = { mode: (v) => (v === "off" || v === "on" ? v : undefined) };
  if (def.outputLimiter) keys.lim = { mode: (v) => (["off", "on", "link"].includes(v) ? v : undefined) };
  if (def.tone) keys.tone = { on: bool };
  if (def.reverb) keys.reverb = { on: bool, type: range(0, 1) };
  if (def.monitorOut) keys.monitor = { level: range(0, 1) };
  if (def.masterEq) keys.masterEq = { pos: range(0, 1) };
  if (def.feedbackSuppressor) keys.fbs = { on: bool };
  if (def.xlrPad) keys.xlrPad = { on: bool };
  return keys;
}

// The STAGEPAS reverb TYPE/TIME knob: four types, each from short to long.
export function reverbSetting(def, pos) {
  const n = def.reverb.types.length;
  const i = Math.min(n - 1, Math.floor(pos * n));
  const within = pos * n - i;
  const type = def.reverb.types[i];
  const base = { HALL: [1.4, 3.5], PLATE: [0.8, 2.4], ROOM: [0.3, 1.2], ECHO: [0.15, 0.5] }[type];
  return { type, seconds: base[0] + within * (base[1] - base[0]) };
}

// The Xenyx effects PROGRAM: preset number (1…) and what it does.
export function fxPreset(def, program) {
  const i = Math.min(def.fx.presets.length - 1, Math.max(0, Math.round(program)));
  return { number: i + 1, ...def.fx.presets[i] };
}

// ---------- listening ----------

export function listenList(def) {
  const l = ["main"];
  for (const b of Object.keys(def.buses)) if (/^aux\d$/.test(b) && !def.buses[b].fx) l.push(b);
  if (def.alt) l.push("alt");
  if (def.monitorOut) l.push("monitor");
  def.channels.forEach((c, i) => c.insert && l.push(`insert${i + 1}`));
  if (def.phones) l.push("phones");
  l.push("rec");
  return l;
}

export function listenGroupOf(portId) {
  if (/^(main|line|tape-out|rec-out|spk)-[lr]$/.test(portId) || portId === "sub-out" || portId === "tape-mini") return "main";
  if (portId === "mon-l" || portId === "mon-r") return "monitor";
  if (portId === "alt-l" || portId === "alt-r") return "alt";
  if (portId === "cr-l" || portId === "cr-r") return "phones";
  const m = /^ch(\d+)-insert$/.exec(portId);
  return m ? `insert${m[1]}` : portId;
}

// ---------- gain and level model ----------

// The gain in front of the channel: trim, MIC/LINE switch or a fixed line gain,
// plus the line pad when the trim channel is fed through its LINE jack.
export function channelGainDb(def, ch, input) {
  const g = def.channels[ch.index].gain;
  if (g.switch) return g.switch[ch.micLine || "mic"];
  if (g.fixed !== undefined && g.min === undefined) return g.fixed + (g.minus10 && ch.minus10 ? g.minus10 : 0);
  const pad = (input && input.path === "line" && !input.stereo && !input.monoIn ? g.linePad || 0 : 0) + (g.lineSwitch && ch.micLine === "line" ? g.lineSwitch : 0);
  // A trimmed stereo channel's line inputs (MG10/2 3/4, 5/6) take the line pad too.
  const stereoPad = input && input.path === "line" && (input.stereo || input.monoIn) && g.min !== undefined ? g.linePad || 0 : 0;
  return ch.gainDb + pad + stereoPad;
}

// L and R gains of a Web Audio StereoPannerNode for a stereo input whose two
// sides carry the same level (a stereo channel's balance; a mono source in a
// stereo channel). Centre: both sides at 0 dB.
export function balanceGains(pan) {
  const p = Math.min(1, Math.max(-1, pan));
  if (p <= 0) {
    const x = (p + 1) * (Math.PI / 2);
    return { L: 1 + Math.cos(x), R: Math.sin(x) };
  }
  const x = p * (Math.PI / 2);
  return { L: Math.cos(x), R: 1 + Math.sin(x) };
}

const OFF = -Infinity;
const powerSum = (list) => gainToDb(Math.sqrt(list.reduce((acc, db) => acc + Math.pow(10, db / 10), 0)));

export function computeMix(def, state, sourcesById, stems, sourcePeakDb) {
  const rig = analyzeRig(state.rig, state.channels, sourcesById);
  const mainDb = LAWS[def.main.law].toDb(state.main.level);
  const reachable = new Set(Object.entries(rig.buses).filter(([, ends]) => ends.length).map(([p]) => p));
  const heardBus = (bus) => [...reachable].some((p) => listenGroupOf(p) === bus);
  const masterDb = (b) => (def.buses[b]?.master ? LAWS[def.buses[b].master.law].toDb(state[b].level) : 0);
  const buses = Object.keys(def.buses);

  const channels = state.channels.map((ch, i) => {
    const input = rig.channels[i] || { connected: false, signal: false };
    const source = input.sourceId ? sourcesById[input.sourceId] : null;
    const peak = sourcePeakDb(source, stems);
    const live = input.connected && input.signal && source && peak !== null;
    const aux = Object.fromEntries(buses.map((b) => [b, { sendDb: OFF, monitorDb: OFF, heardDb: OFF }]));
    const base = { index: i, sourceId: input.sourceId || null, input, aux, pflDb: OFF };
    if (ch.tape) {
      const tapeDb = live ? peak + source.outputDb + 10 + HEADROOM_DB + (def.tape.level ? LAWS.ret20.toDb(ch.level) : 0) : OFF;
      const toMain = def.tape.routing === "toMain" || (def.tape.routing === "toMainOrCr" && !ch.toCr) || (def.tape.routing === "switch" && ch.toMain);
      const side = toMain ? tapeDb + mainDb : OFF;
      return { ...base, inputPeakDb: tapeDb, band: inputBand(tapeDb), faderDb: 0, mainDb: { L: side, R: side }, heardMainDb: heardBus("main") ? side : OFF, altDb: { L: OFF, R: OFF } };
    }
    const c = def.channels[i];
    const inputPeakDb = live ? peak + source.outputDb + channelGainDb(def, ch, input) + HEADROOM_DB : OFF;
    // 442 1+2 LINK: channel 1's fader and PAN (now a balance) run both; 1 is left, 2 right.
    const link = linkOf(def, state, i);
    const faderDb = levelLaw(def).toDb(link ? state.channels[link.leader].level : ch.level);
    const levelled = inputPeakDb + faderDb;
    const muted = c.mute && !ch.enabled;
    const postDb = muted ? OFF : levelled;
    const pg = link ? link.gains : ch.stereo ? balanceGains(ch.pan) : panGains(ch.pan);
    const side = (k, db) => db + gainToDb(pg[k]);
    // "fader": after LEVEL, before MUTE; "channel": this channel's PRE switch.
    // "each": this channel's PRE/POST for that send (Ui16). With `muteCutsPre`, MUTE cuts pre sends too.
    const preDb = def.muteCutsPre && muted ? OFF : inputPeakDb;
    const tap = (t, sid) => (t === "pre" || (t === "channel" && ch.pre) || (t === "each" && ch.pres[sid]) ? preDb : t === "fader" ? levelled : postDb);
    for (const sid of c.sends || []) {
      const s = def.sends[sid];
      const pos = ch.sends[sid];
      if (s.bipolar) {
        const way = pos < 0 ? s.bipolar.left : s.bipolar.right;
        const sendDb = LAWS[s.law].toDb(Math.abs(pos));
        aux[way.bus] = { sendDb, monitorDb: tap(way.tap) + sendDb + masterDb(way.bus) };
      } else if (aux[s.bus]) {
        const t = s.tap === "switch" ? (state[s.bus].pre ? "pre" : "post") : s.tap;
        const sendDb = LAWS[s.law].toDb(pos);
        aux[s.bus] = { sendDb, monitorDb: tap(t, sid) + sendDb + masterDb(s.bus) };
      }
    }
    for (const b of buses) aux[b].heardDb = heardBus(b) ? aux[b].monitorDb : OFF;
    // MUTE/ALT 3-4: a muted channel goes to the ALT bus instead of MAIN.
    const altDb = muted && c.mute === "alt" ? { L: side("L", levelled), R: side("R", levelled) } : { L: OFF, R: OFF };
    const toMainAlt = state.alt?.toMain ? altDb : { L: OFF, R: OFF };
    const L = Math.max(side("L", postDb), toMainAlt.L) + mainDb;
    const R = Math.max(side("R", postDb), toMainAlt.R) + mainDb;
    const pflDb = ch.solo ? (state.soloBus?.mode === "sip" ? levelled : inputPeakDb) : OFF;
    return { ...base, inputPeakDb, band: inputBand(inputPeakDb), faderDb, mainDb: { L, R }, heardMainDb: heardBus("main") ? Math.max(L, R) : OFF, altDb, pflDb };
  });

  const outputs = {
    "main-l": { peakDb: powerSum(channels.map((c) => c.mainDb.L)), endpoints: rig.buses["main-l"] || rig.buses["spk-l"] || [] },
    "main-r": { peakDb: powerSum(channels.map((c) => c.mainDb.R)), endpoints: rig.buses["main-r"] || rig.buses["spk-r"] || [] },
    ...Object.fromEntries(buses.map((b) => [b, { peakDb: powerSum(channels.map((c) => c.aux[b].monitorDb)), endpoints: rig.buses[b] || [] }])),
  };
  return { rig, channels, outputs, mainMasterDb: mainDb, busDb: Object.fromEntries(buses.map((b) => [b, masterDb(b)])), phones: phonesOf(def, state) };
}

// Linked channels (442 1+2 LINK ON): who leads, and this channel's L/R gains.
export function linkOf(def, state, i) {
  if (!def.link || state.link?.mode !== "on" || !def.link.pair.includes(i)) return null;
  const [a, b] = def.link.pair;
  const bal = state.channels[a].pan;
  const keep = (x) => (x <= 0 ? 1 : x >= 1 ? 0 : Math.cos((x * Math.PI) / 2));
  return { leader: a, gains: i === a ? { L: keep(bal), R: 0 } : { L: 0, R: keep(-bal) }, follower: i === b };
}

export function phonesOf(def, state) {
  if (!def.phones) return null;
  if (def.phones.selector) {
    const soloed = state.channels.filter((c) => c.solo).map((c) => c.label);
    return { solo: soloed.length > 0, soloed, auxSolo: [], mode: "pfl", modeText: "PFL: before the fader, in mono", sources: [], selector: state.cr.src, tone: !!state.tone?.on };
  }
  const soloed = state.channels.filter((c) => !c.tape && c.solo).map((c) => c.label);
  const auxSolo = Object.keys(def.buses).filter((b) => state[b].solo);
  const tapeStrip = state.channels.find((c) => c.tape);
  const sources = def.phones.sources ? def.phones.sources.filter((s) => state.cr[s]) : ["main", ...(def.tape?.routing === "toMainOrCr" && tapeStrip?.toCr ? ["tape"] : [])];
  const mode = def.solo ? state.soloBus.mode : null;
  const modeText = mode === "sip" ? "SOLO (in place): after the fader and pan" : "PFL: before the fader";
  return { solo: soloed.length + auxSolo.length > 0, soloed, auxSolo, mode, modeText, sources };
}

// The interface js/mixer-state.js dispatches to (same shape as js/cr1604.js).
const models = {};
export function compactModel(id) {
  if (!COMPACT[id]) return null;
  if (models[id]) return models[id];
  const def = COMPACT[id];
  models[id] = {
    def,
    createState: () => createState(id),
    computeMix: (state, sourcesById, stems, sourcePeakDb) => computeMix(def, state, sourcesById, stems, sourcePeakDb),
    sanitizeChannel: (ch, key, value) => sanitizeChannel(def, ch, key, value),
    BUS_KEYS: busKeys(def),
    LISTEN: listenList(def),
    listenGroupOf,
    phonesOf: (state) => phonesOf(def, state),
    phantomChannels: def.phantom.channels,
  };
  return models[id];
}

export const COMPACT_IDS = Object.keys(COMPACT);