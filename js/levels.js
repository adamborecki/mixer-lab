// Level laws, dB helpers and input bands shared by every mixer model (and
// re-exported by mixer-state.js). Pure JS, no imports.

// Where a well-gain-staged channel lands: post-preamp peak (dBFS) =
// stem peak + source output + pad + gain + HEADROOM_DB. With gain set so a
// source reaches line level (0 dB), peaks sit ~10 dB under clip.
export const HEADROOM_DB = -8;

// Input meter bands (post-preamp peak, dBFS). Shared by meters, hints and scenarios.
export const INPUT_BANDS = [
  { id: "clip", min: 0, label: "Clipping" },
  { id: "hot", min: -4, label: "Hot" },
  { id: "good", min: -22, label: "Good" },
  { id: "low", min: -40, label: "Low" },
  { id: "none", min: -Infinity, label: "No signal" },
];

export function inputBand(peakDb) {
  return INPUT_BANDS.find((b) => peakDb >= b.min).id;
}

// ---------- level laws (shared by every skin) ----------

// Normalised control position (0…1) ↔ dB. 0.75 is unity ("U"/0 dB), the top
// is +10 dB, the bottom is off. Same law for faders, level knobs, sends and
// masters, so a skin's fader and another skin's knob mean the same thing.
export const LAW = [
  [0, -Infinity],
  [0.02, -70],
  [0.1, -50],
  [0.25, -30],
  [0.5, -10],
  [0.75, 0],
  [1, 10],
];

export function levelToDb(pos) {
  const p = clamp(pos, 0, 1);
  if (p <= 0) return -Infinity;
  for (let i = 1; i < LAW.length; i++) {
    const [p1, d1] = LAW[i];
    const [p0, d0] = LAW[i - 1];
    if (p <= p1) {
      if (d0 === -Infinity) return d1 + (p - p1) * 400; // steep tail into silence
      return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
    }
  }
  return LAW[LAW.length - 1][1];
}

export function dbToLevel(db) {
  if (db === -Infinity || db <= -78) return 0;
  if (db >= 10) return 1;
  for (let i = LAW.length - 1; i > 0; i--) {
    const [p0, d0] = LAW[i - 1];
    const [p1, d1] = LAW[i];
    if (db >= (d0 === -Infinity ? -78 : d0)) {
      if (d0 === -Infinity) return p1 + (db - d1) / 400;
      return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
    }
  }
  return 0;
}

export const dbToGain = (db) => (db === -Infinity ? 0 : Math.pow(10, db / 20));
export const gainToDb = (g) => (g <= 0 ? -Infinity : 20 * Math.log10(g));

// Equal-power pan (−3 dB in the centre), matching StereoPannerNode.
export function panGains(pan) {
  const x = (clamp(pan, -1, 1) + 1) / 2;
  const snap = (v) => (v < 1e-9 ? 0 : v); // cos(π/2) isn't exactly 0 in floating point
  return { L: snap(Math.cos((x * Math.PI) / 2)), R: snap(Math.sin((x * Math.PI) / 2)) };
}

export function formatDb(db, { unity = false, digits = 0 } = {}) {
  if (db === -Infinity || db < -69.5) return "−∞";
  if (unity && Math.abs(db) < 0.25) return "U";
  const v = db.toFixed(digits);
  if (Number(v) === 0) return "0 dB";
  return `${db > 0 ? "+" : "−"}${Math.abs(Number(v)).toFixed(digits)} dB`;
}

export function formatPan(pan) {
  if (Math.abs(pan) < 0.03) return "C";
  const pct = Math.round(Math.abs(pan) * 100);
  return `${pan < 0 ? "L" : "R"}${pct}`;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------- other control tapers ----------

// A taper as [position, dB] points (position 0…1, first point -Infinity = off).
// Returns the two conversions; a skin's knob and the level model use the same pair.
export function makeLaw(points) {
  const toDb = (pos) => {
    const p = clamp(pos, 0, 1);
    if (p <= 0) return -Infinity;
    for (let i = 1; i < points.length; i++) {
      const [p1, d1] = points[i];
      const [p0, d0] = points[i - 1];
      if (p <= p1) {
        if (d0 === -Infinity) return d1 + (p - p1) * 400; // steep tail into silence
        return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
      }
    }
    return points[points.length - 1][1];
  };
  const floor = points[1][1] - points[1][0] * 400; // where the tail reaches position 0
  const toPos = (db) => {
    if (db === -Infinity || db <= floor) return 0;
    const top = points[points.length - 1];
    if (db >= top[1]) return 1;
    for (let i = points.length - 1; i > 0; i--) {
      const [p0, d0] = points[i - 1];
      const [p1, d1] = points[i];
      if (db >= (d0 === -Infinity ? floor : d0)) {
        if (d0 === -Infinity) return p1 + (db - d1) / 400;
        return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
      }
    }
    return 0;
  };
  return { toDb, toPos };
}

// Faders and the generic mixers' knobs: unity three quarters up, +10 at the top.
export const FADER_LAW = { toDb: (p) => levelToDb(p), toPos: (db) => dbToLevel(db) };
// Rotary level knobs with unity at the centre detent (Mackie style), by maximum boost.
export const knobLaw = (maxDb) => makeLaw([[0, -Infinity], [0.05, -50], [0.25, -20], [0.5, 0], [1, maxDb]]);
