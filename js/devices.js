// Outboard gear that isn't the mixer: a reverb unit, a Zoom F8 field recorder,
// a stereo room-mic pair and a camera's audio input (plus the 442 mixer's
// OUTPUT LEVEL switch, which decides what its XLR outs can feed). Their settings live on the rig device itself
// ({ id, type, label, ...settings }) and change through MixerStore.setDevice.
// Pure JS: the audio side is js/outboard-audio.js. See docs/CR1604.md.

import { DEVICE_TYPES } from "./connection-model.js";

const bool = (v) => !!v;
const range = (lo, hi, step) => (v) => {
  const n = Math.min(hi, Math.max(lo, Number(v)));
  return Number.isFinite(n) ? (step ? Math.round(n / step) * step : n) : undefined;
};

// ---------- reverb ----------

export const REVERB = { decayMin: 0.4, decayMax: 5, preDelayMs: 20 };
export const createReverb = (over = {}) => ({ decay: 2.2, ...over });

// ---------- Zoom F8 ----------

export const F8 = {
  tracks: 8,
  gainMin: 10, // MIC: +10…+75 dB; the 1/4" (line) path is 20 dB lower: −10…+55
  gainMax: 75,
  sampleRate: 48000,
  bitDepth: 24,
  cardGB: 32, // the course convention
  dualOffsetDb: -12, // a dual-channel safety track starts this far below its input's gain
  maxTakeSeconds: 6 * 60, // the lab keeps recordings in memory, so takes are capped
};

export function createF8(over = {}) {
  return {
    tracks: Array.from({ length: F8.tracks }, () => ({ trimDb: 30, phantom: false, arm: false })),
    link: [false, false, false, false], // pairs 1/2, 3/4, 5/6, 7/8
    dual: [false, false, false, false], // DUAL CHANNEL REC: input 1–4 also on track 5–8
    hpLevel: 0.6,
    ...over,
  };
}

// Which input jack each track records. With dual channel on, tracks 5–8 take
// inputs 1–4 (at their own gain) and jacks 5–8 aren't used.
export function trackInputs(dev) {
  return Array.from({ length: F8.tracks }, (_, t) => (t >= 4 && dev.dual[t - 4] ? t - 4 : t));
}

export const pairOf = (t) => Math.floor(t / 2);
export const isLinked = (dev, t) => dev.link[pairOf(t)];

// Recording time left on the card for the armed tracks (mono WAV per track).
export function cardStats(dev, usedBytes = 0) {
  const total = F8.cardGB * 1e9;
  const free = Math.max(0, total - usedBytes);
  const armed = dev.tracks.filter((t) => t.arm).length;
  const bytesPerSec = F8.sampleRate * (F8.bitDepth / 8) * Math.max(1, armed);
  return { total, free, armed, secondsLeft: armed ? free / bytesPerSec : Infinity, bytesPerSec };
}

export const takeBytes = (seconds, tracks) => seconds * F8.sampleRate * (F8.bitDepth / 8) * tracks;

// ---------- stereo mic pair ----------

export const PAIR = { spacingMax: 60, angleMax: 180 };
export const createPair = (over = {}) => ({ spacingCm: 17, angleDeg: 110, ...over });

// The named techniques a pair setting matches (spacing in cm, included angle in degrees).
export const TECHNIQUES = [
  { id: "ortf", name: "ORTF", spacingCm: 17, angleDeg: 110 },
  { id: "nos", name: "NOS", spacingCm: 30, angleDeg: 90 },
  { id: "xy", name: "XY (coincident)", spacingCm: 0, angleDeg: 90, angleTol: 20 },
];
export function techniqueOf({ spacingCm, angleDeg }) {
  return TECHNIQUES.find((t) => Math.abs(spacingCm - t.spacingCm) <= 2 && Math.abs(angleDeg - t.angleDeg) <= (t.angleTol || 5)) || null;
}

// Where each band member stands, in metres: x across the stage (from the
// source's pan), y back from the stage edge. The pair stands `PAIR_DISTANCE_M`
// out front, on the centre line, pointing at the stage.
const DEPTH_M = { drums: 3.5, bass: 2.5, guitars: 2.5, keys: 2.5, trumpets: 2, "backing-vocals": 1.5, "lead-vocal": 1 };
export const PAIR_DISTANCE_M = 6;
export const SPEED_OF_SOUND = 343;

// Each mic's gain (cardioid, 1/distance) and delay for one source.
export function micResponse(pair, source) {
  const sx = (source.pan || 0) * 3;
  const sy = DEPTH_M[source.id] ?? 2;
  return ["L", "R"].map((side) => {
    const mx = (side === "L" ? -1 : 1) * (pair.spacingCm / 200);
    const my = -PAIR_DISTANCE_M;
    const dx = sx - mx;
    const dy = sy - my;
    const dist = Math.hypot(dx, dy);
    const aim = ((side === "L" ? -1 : 1) * pair.angleDeg) / 2; // degrees off the centre line
    const off = Math.atan2(dx, dy) - (aim * Math.PI) / 180;
    const cardioid = 0.5 * (1 + Math.cos(off));
    return { side, gain: (cardioid * PAIR_DISTANCE_M) / dist, delay: dist / SPEED_OF_SOUND };
  });
}

// ---------- validation ----------

const KEYS = {
  reverb: { decay: range(REVERB.decayMin, REVERB.decayMax, 0.1) },
  "stereo-mic-pair": { spacingCm: range(0, PAIR.spacingMax, 1), angleDeg: range(0, PAIR.angleMax, 1) },
  "camera-input": { inputLevel: range(0, 1, 1) }, // 0 = MIC, 1 = LINE
  sd442: { outLevel: range(0, 2, 1) }, // the 442's XLR OUTPUT LEVEL: 0 = MIC, 1 = −10, 2 = LINE
  f8n: { mainLevel: range(0, 1, 1), subLevel: range(0, 1, 1) },
  x32: { inSource: range(0, 1, 1) }, // ROUTING inputs, per block of 8: 0 = LOCAL, 1 = AES50-A
  x32c: { inSource: range(0, 1, 1) },
  cl3: { danteRx: range(0, 16, 1), inPatch: range(0, 1, 1) }, // Dante Controller subscriptions (0 = none); INPUT PATCH 0 = Rio, 1 = Dante
  "daw-dvs": { outs: range(0, 16, 1) }, // each DAW track's output: DVS channel 1–16 (0 = none) // Output Level: MAIN OUT 0 = LINE, 1 = NORMAL; SUB OUT 0 = NORMAL, 1 = MIC
  "zoom-f8": {
    trimDb: range(F8.gainMin, F8.gainMax, 0.5),
    phantom: bool,
    arm: bool,
    link: bool,
    dual: bool,
    hpLevel: range(0, 1),
  },
};

// Applies one setting to a device in place; returns true if it changed.
// Keys: "decay", "spacingCm", "angleDeg", "hpLevel", "tracks.3.trimDb",
// "link.1", "dual.0". A linked pair moves together (trim, 48V, arm).
export function setDeviceValue(dev, key, value) {
  const parts = key.split(".");
  const field = parts.length === 3 ? parts[2] : parts[0];
  const fn = KEYS[dev.type]?.[field];
  if (!fn || !DEVICE_TYPES[dev.type]) return false;
  const v = fn(value);
  if (v === undefined) return false;
  if (parts.length === 1) {
    if (dev[field] === v) return false;
    dev[field] = v;
    return true;
  }
  if (parts.length === 2) {
    const i = Number(parts[1]);
    if (!Array.isArray(dev[field]) || !(i in dev[field]) || dev[field][i] === v) return false;
    dev[field][i] = v;
    if (field === "link" && v) Object.assign(dev.tracks[i * 2 + 1], { trimDb: dev.tracks[i * 2].trimDb, phantom: dev.tracks[i * 2].phantom, arm: dev.tracks[i * 2].arm });
    // A new dual-channel safety track starts below its input's gain (and armed with it).
    if (field === "dual" && v) Object.assign(dev.tracks[i + 4], { trimDb: Math.max(F8.gainMin, dev.tracks[i].trimDb + F8.dualOffsetDb), arm: dev.tracks[i].arm });
    return true;
  }
  const t = Number(parts[1]);
  if (!dev.tracks?.[t]) return false;
  const targets = dev.link?.[pairOf(t)] ? [pairOf(t) * 2, pairOf(t) * 2 + 1] : [t];
  if (targets.every((k) => dev.tracks[k][field] === v)) return false;
  for (const k of targets) dev.tracks[k][field] = v;
  return true;
}
