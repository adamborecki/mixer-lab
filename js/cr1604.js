// Mackie CR1604-VLZ: semantic state and level model. What the mixer *is*, after
// the owner's manual; the skin (js/ui/mixer-1604-view.js) only draws it and the
// audio graph (js/graph-1604.js) reproduces it. Pure JS, runs under `node --test`.
// See docs/CR1604.md.
//
// Signal flow per channel (manual pp. 17–21):
//   MIC or LINE → TRIM → LOW CUT ─┬─ PRE taps: AUX 1/2 with PRE down
//                                 └─ EQ ─┬─ SOLO in LEVEL SET (PFL) mode
//                                        └─ MUTE → fader ─┬─ AUX 1/2 (PRE up), AUX 3/4 (or 5/6 with SHIFT)
//                                                         └─ PAN → L-R, 1-2, 3-4 assigns; SOLO in NORMAL (AFL) mode

import { analyzeRig } from "./connection-model.js";
import { FADER_LAW, HEADROOM_DB, gainToDb, dbToGain, inputBand, knobLaw, makeLaw, panGains } from "./levels.js";

export const CHANNELS = 16;
export const TAPE = 16; // index of the tape-input strip, after the 16 channels
export const GAIN_MIN_DB = 10; // TRIM through MIC: +10…+60 dB. LINE is padded 20 dB: −10…+40.
export const GAIN_MAX_DB = 60;
export const AUXES = ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6"];
export const MASTERED_AUXES = ["aux1", "aux2"]; // AUX SENDS 3–6 leave at unity, no master
export const SUBS = ["sub1", "sub2", "sub3", "sub4"];
export const RETURNS = ["ret1", "ret2", "ret3", "ret4"];
export const DIRECTS = Array.from({ length: 8 }, (_, i) => `direct${i + 1}`);
export const INSERTS = Array.from({ length: 16 }, (_, i) => `insert${i + 1}`);
export const EQ_RANGE_DB = 15;
export const EQ_FREQ = { low: 80, high: 12000, midMin: 100, midMax: 8000 };
export const EQ_MID_OCTAVES = 1.5;
export const LOW_CUT_HZ = 75;
// A consumer (−10 dBV) tape or laptop output reaches the mix bus at about pro line level.
export const TAPE_REF_DB = 10;
// Channel OL LED: lights just before clipping.
export const OL_DB = -2;

// Control tapers. Positions are 0…1, as stored in state.
export const LAWS = {
  fader: FADER_LAW, // channel, SUB and MAIN faders: U ¾ up, +10 at the top
  send: knobLaw(15), // channel AUX knobs: off, U at the detent, +15
  master: knobLaw(10), // AUX SEND masters, C-R/PHONES, SOLO level: off, U, +10
  tape: knobLaw(20), // TAPE IN and the AUX RETURN levels: off, U, +20
  mono: makeLaw([[0, -Infinity], [0.05, -50], [0.3, -20], [0.67, 0], [1, 6]]), // MONO LEVEL: U at 1:30, +6
};

// Mid sweep knob: 100 Hz…8 kHz on a log scale.
export const midFreqToPos = (hz) => Math.log(hz / EQ_FREQ.midMin) / Math.log(EQ_FREQ.midMax / EQ_FREQ.midMin);
export const posToMidFreq = (pos) => EQ_FREQ.midMin * Math.pow(EQ_FREQ.midMax / EQ_FREQ.midMin, Math.min(1, Math.max(0, pos)));

// Every listening position, and which mixer output belongs to which. "rec"
// is a recorder's headphone out.
export const LISTEN = ["main", ...AUXES, ...SUBS, ...DIRECTS, ...INSERTS, "phones", "rec"];
export function listenGroupOf(portId) {
  if (["main-l", "main-r", "mono", "tape-out-l", "tape-out-r"].includes(portId)) return "main";
  if (portId === "cr-l" || portId === "cr-r") return "phones";
  const m = /^ch(\d+)-(direct|insert)$/.exec(portId);
  if (m) return `${m[2]}${m[1]}`;
  return portId;
}

// ---------- state ----------

// A fresh board: every switch up, every knob at its detent, faders down,
// nothing assigned. On a real 1604 that means silence until L-R is pressed.
export function createChannel(index) {
  return {
    index,
    label: String(index + 1),
    stereo: false,
    gainDb: GAIN_MIN_DB,
    phantom: false, // one PHANTOM switch on the rear panel sets every channel
    lowCut: false,
    eq: { high: 0, mid: 0, freq: 1000, low: 0 },
    // Knob positions. "aux3"/"aux4" are the AUX 3 and AUX 4 knobs, which feed
    // AUX SENDS 3/4, or 5/6 when the channel's 5/6 SHIFT is down.
    auxSends: { aux1: 0, aux2: 0, aux3: 0, aux4: 0 },
    pre: false, // PRE switch: AUX 1 and 2 taken before EQ, MUTE and fader
    shift: false, // 5/6 SHIFT
    pan: 0,
    enabled: true, // MUTE is lit when this is false
    solo: false,
    assign: { lr: false, s12: false, s34: false },
    level: 0,
  };
}

// The TAPE INPUT is one stereo strip with two controls: TAPE IN level and TAPE TO MAIN MIX.
export function createTapeStrip() {
  return { index: TAPE, label: "TAPE", stereo: true, tape: true, gainDb: 0, level: 0.5, toMain: false, enabled: true, pan: 0, phantom: false, auxSends: {} };
}

export function createState() {
  return {
    model: "cr1604",
    channels: [...Array.from({ length: CHANNELS }, (_, i) => createChannel(i)), createTapeStrip()],
    main: { level: 0.75 },
    aux1: { level: 0.5, solo: false },
    aux2: { level: 0.5, solo: false },
    ...Object.fromEntries(SUBS.map((s) => [s, { level: 0, toMainL: false, toMainR: false }])),
    mono: { level: 0.67 },
    // C-R/PHONES: SOURCE matrix and level. SOLO replaces the selection while any solo is on.
    cr: { level: 0.5, main: true, subs12: false, subs34: false, tape: false },
    soloBus: { level: 0.5, mode: "afl", returns: false }, // MODE: "afl" = NORMAL (AFL), "pfl" = LEVEL SET (PFL); RETURNS SOLO
    // STEREO AUX RETURNS. 1 and 2 also feed AUX SEND 1/2 (EFFECTS TO MONITORS);
    // 3 can go to the subgroups instead of MAIN; 4 can go to C-R/PHONES only.
    ret1: { level: 0.5, toAux: 0 },
    ret2: { level: 0.5, toAux: 0 },
    ret3: { level: 0.5, toSubs: false, subs34: false },
    ret4: { level: 0.5, crOnly: false },
    listen: "main",
    rig: { devices: [{ id: "mixer", type: "cr1604", label: "Mackie CR1604-VLZ" }], cables: [] },
  };
}

// ---------- validation (MixerStore calls these) ----------

const bool = (v) => !!v;
const range = (lo, hi, step) => (v) => {
  const n = Math.min(hi, Math.max(lo, Number(v)));
  return Number.isFinite(n) ? (step ? Math.round(n / step) * step : n) : undefined;
};
const CHANNEL_KEYS = {
  gainDb: range(GAIN_MIN_DB, GAIN_MAX_DB, 0.5),
  level: range(0, 1),
  pan: range(-1, 1),
  enabled: bool,
  phantom: bool,
  lowCut: bool,
  pre: bool,
  shift: bool,
  solo: bool,
  "eq.high": range(-EQ_RANGE_DB, EQ_RANGE_DB, 0.5),
  "eq.mid": range(-EQ_RANGE_DB, EQ_RANGE_DB, 0.5),
  "eq.low": range(-EQ_RANGE_DB, EQ_RANGE_DB, 0.5),
  "eq.freq": range(EQ_FREQ.midMin, EQ_FREQ.midMax),
  "assign.lr": bool,
  "assign.s12": bool,
  "assign.s34": bool,
};
const TAPE_KEYS = { level: range(0, 1), toMain: bool };

export function sanitizeChannel(ch, key, value) {
  const fn = (ch.tape ? TAPE_KEYS : CHANNEL_KEYS)[key];
  return fn ? fn(value) : undefined;
}

export const BUS_KEYS = {
  main: { level: range(0, 1) },
  aux1: { level: range(0, 1), solo: bool },
  aux2: { level: range(0, 1), solo: bool },
  ...Object.fromEntries(SUBS.map((s) => [s, { level: range(0, 1), toMainL: bool, toMainR: bool }])),
  mono: { level: range(0, 1) },
  cr: { level: range(0, 1), main: bool, subs12: bool, subs34: bool, tape: bool },
  soloBus: { level: range(0, 1), mode: (v) => (v === "pfl" || v === "afl" ? v : undefined), returns: bool },
  ret1: { level: range(0, 1), toAux: range(0, 1) },
  ret2: { level: range(0, 1), toAux: range(0, 1) },
  ret3: { level: range(0, 1), toSubs: bool, subs34: bool },
  ret4: { level: range(0, 1), crOnly: bool },
};

// ---------- computed signal levels ----------

const OFF = -Infinity;
// Coherent copies of one signal add in amplitude; separate channels add in power.
const ampSum = (list) => gainToDb(list.reduce((a, db) => a + dbToGain(db), 0));
const powerSum = (list) => gainToDb(Math.sqrt(list.reduce((acc, db) => acc + Math.pow(10, db / 10), 0)));
const PAIR_DB = gainToDb(Math.SQRT1_2); // a subgroup assigned to both sides drops 3 dB per side

// Which AUX SEND each of a channel's four AUX knobs feeds.
export function sendTargets(ch) {
  return { aux1: "aux1", aux2: "aux2", aux3: ch.shift ? "aux5" : "aux3", aux4: ch.shift ? "aux6" : "aux4" };
}

// How a subgroup reaches MAIN L and R through its ASSIGN TO MAIN MIX switches.
function subToMain(sub) {
  if (sub.toMainL && sub.toMainR) return { L: PAIR_DB, R: PAIR_DB };
  return { L: sub.toMainL ? 0 : OFF, R: sub.toMainR ? 0 : OFF };
}

// Same shape as the generic computeMix (mixer-state.js), plus the 1604's extras
// (`subs`, `phones`), so scenario conditions read either mixer.
export function computeMix(state, sourcesById, stems, sourcePeakDb) {
  const rig = analyzeRig(state.rig, state.channels, sourcesById);
  const mainDb = LAWS.fader.toDb(state.main.level);
  const subLevel = Object.fromEntries(SUBS.map((s) => [s, LAWS.fader.toDb(state[s].level)]));
  const masterDb = Object.fromEntries(AUXES.map((b) => [b, MASTERED_AUXES.includes(b) ? LAWS.master.toDb(state[b].level) : 0]));
  const reachable = new Set(Object.entries(rig.buses).filter(([, ends]) => ends.length).map(([p]) => p));
  const toMain = Object.fromEntries(SUBS.map((s) => [s, subToMain(state[s])]));

  const channels = state.channels.map((ch, i) => {
    const input = rig.channels[i] || { connected: false, signal: false };
    const source = input.sourceId ? sourcesById[input.sourceId] : null;
    const peakDb = sourcePeakDb(source, stems);
    const live = input.connected && input.signal && source && peakDb !== null;
    if (ch.tape) {
      // TAPE IN: no trim and no meter of its own; its knob sets the level into the mix.
      const inputPeakDb = live ? peakDb + source.outputDb + TAPE_REF_DB + HEADROOM_DB + LAWS.tape.toDb(ch.level) : OFF;
      const side = ch.toMain ? inputPeakDb + mainDb : OFF;
      return finish(i, input, inputPeakDb, { L: side, R: side }, {}, { sub1: OFF, sub2: OFF, sub3: OFF, sub4: OFF }, OFF, 0);
    }
    // Post-TRIM, post-LOW CUT. The level model leaves EQ out, as it does the low cut.
    const inputPeakDb = live ? peakDb + source.outputDb + (input.padDb || 0) + ch.gainDb + HEADROOM_DB : OFF;
    const faderDb = LAWS.fader.toDb(ch.level);
    const postDb = ch.enabled ? inputPeakDb + faderDb : OFF; // post-EQ, MUTE and fader; pre-PAN
    const pg = panGains(ch.pan);
    const L = postDb + gainToDb(pg.L);
    const R = postDb + gainToDb(pg.R);

    const targets = sendTargets(ch);
    const aux = {};
    for (const [knob, bus] of Object.entries(targets)) {
      const sendDb = LAWS.send.toDb(ch.auxSends[knob]);
      const tap = (knob === "aux1" || knob === "aux2") && ch.pre ? inputPeakDb : postDb;
      aux[bus] = { sendDb, monitorDb: tap + sendDb + masterDb[bus] };
    }

    const subs = {
      sub1: ch.assign.s12 ? L + subLevel.sub1 : OFF,
      sub2: ch.assign.s12 ? R + subLevel.sub2 : OFF,
      sub3: ch.assign.s34 ? L + subLevel.sub3 : OFF,
      sub4: ch.assign.s34 ? R + subLevel.sub4 : OFF,
    };
    // Main L/R: the L-R assign directly, plus every subgroup that is assigned to the main mix.
    const side = (k) =>
      ampSum([ch.assign.lr ? (k === "L" ? L : R) : OFF, ...SUBS.map((s) => subs[s] + toMain[s][k])]) + mainDb;
    return finish(i, input, inputPeakDb, { L: side("L"), R: side("R") }, aux, subs, ch.solo ? inputPeakDb : OFF, faderDb);
  });

  function finish(index, input, inputPeakDb, main, aux, subs, pflDb, faderDb) {
    const full = Object.fromEntries(
      AUXES.map((b) => {
        const a = aux[b] || { sendDb: OFF, monitorDb: OFF };
        return [b, { ...a, heardDb: reachable.has(b) ? a.monitorDb : OFF }];
      }),
    );
    const monoDb = monoOf(main.L, main.R);
    const heardMainDb = Math.max(reachable.has("main-l") ? main.L : OFF, reachable.has("main-r") ? main.R : OFF, reachable.has("mono") ? monoDb : OFF);
    return { index, sourceId: input.sourceId || null, input, inputPeakDb, band: inputBand(inputPeakDb), faderDb, mainDb: main, monoDb, heardMainDb, aux: full, subs, pflDb };
  }

  function monoOf(L, R) {
    return ampSum([L, R]) + gainToDb(0.5) + LAWS.mono.toDb(state.mono.level);
  }

  const outputs = {
    "main-l": { peakDb: powerSum(channels.map((c) => c.mainDb.L)), endpoints: rig.buses["main-l"] || [] },
    "main-r": { peakDb: powerSum(channels.map((c) => c.mainDb.R)), endpoints: rig.buses["main-r"] || [] },
    mono: { peakDb: powerSum(channels.map((c) => c.monoDb)), endpoints: rig.buses.mono || [] },
    ...Object.fromEntries(AUXES.map((b) => [b, { peakDb: powerSum(channels.map((c) => c.aux[b].monitorDb)), endpoints: rig.buses[b] || [] }])),
    ...Object.fromEntries(SUBS.map((s) => [s, { peakDb: powerSum(channels.map((c) => c.subs[s])), endpoints: rig.buses[s] || [] }])),
  };
  return { rig, channels, outputs, mainMasterDb: mainDb, busDb: masterDb, phones: phonesOf(state) };
}

// What the C-R OUTS and PHONES carry: any SOLO replaces the SOURCE matrix.
export function phonesOf(state) {
  const soloed = state.channels.filter((c) => !c.tape && c.solo).map((c) => c.label);
  const auxSolo = MASTERED_AUXES.filter((b) => state[b].solo);
  if (state.soloBus.returns) auxSolo.push("returns");
  const solo = soloed.length > 0 || auxSolo.length > 0;
  const sources = [state.cr.main && "main", state.cr.subs12 && "subs12", state.cr.subs34 && "subs34", state.cr.tape && "tape"].filter(Boolean);
  return { solo, soloed, auxSolo, mode: state.soloBus.mode, sources };
}
