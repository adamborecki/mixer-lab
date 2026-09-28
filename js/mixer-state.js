// Semantic mixer state: what the mixer *is*, independent of how any skin draws
// it. Skins read and write only through this module; the audio engine and the
// scenario checker read the same state. Pure JS — runs under `node --test`.

import { analyzeRig, checkConnection, getPort, splitRef } from "./connection-model.js";

// Channel strips, in order. A `stereo` strip is ONE strip (one gain, one level,
// one set of sends) carrying a linked L/R pair — not two mono channels. Skins
// decide how to draw it; state and engine treat it as a single channel.
export const CHANNEL_LAYOUT = [
  ...Array.from({ length: 8 }, (_, i) => ({ label: String(i + 1) })),
  { label: "9/10", stereo: true },
];
export const CHANNEL_COUNT = CHANNEL_LAYOUT.length;
export const GAIN_MIN_DB = 0;
export const GAIN_MAX_DB = 60;
// Aux/monitor buses (all pre-fader in V1). Each needs a master in state, a
// send on every channel, a mixer output port, and a word in each skin.
export const BUSES = ["aux1", "aux2"];
export const LISTEN_DESTINATIONS = ["main", ...BUSES, "pfl"];

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
const LAW = [
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

// ---------- state shape ----------

export function createChannel(index) {
  const layout = CHANNEL_LAYOUT[index];
  return {
    index,
    label: layout.label, // what the strip is called on the mixer ("3", "9/10")
    stereo: !!layout.stereo,
    gainDb: GAIN_MIN_DB,
    phantom: false,
    enabled: true, // Skin A shows this as MUTE (lit = false); Skin B as ON (lit = true)
    pan: 0, // mono strips only; a stereo strip keeps its left and right sides where they are
    level: 0, // fader / level knob position, 0…1
    auxSends: Object.fromEntries(BUSES.map((b) => [b, 0])), // send knob positions, 0…1 (pre-fader)
    pfl: false,
  };
}

export function createMixerState() {
  return {
    channels: Array.from({ length: CHANNEL_COUNT }, (_, i) => createChannel(i)),
    main: { level: 0.75 },
    ...Object.fromEntries(BUSES.map((b) => [b, { level: 0.75 }])),
    headphones: { level: 0.6 },
    listen: "main",
    rig: { devices: [{ id: "mixer", type: "mixer", label: "Mixer" }], cables: [] },
  };
}

export const cloneState = (s) => structuredClone(s);

// ---------- computed signal levels ----------

// Peak (dBFS) a source delivers to the mixer: a stem after the mono fold-down,
// or a stereo source's own measured peak.
export function sourcePeakDb(source, stems) {
  if (!source) return null;
  if (source.stem) return stems[source.stem] ? stems[source.stem].monoPeakDb : null;
  return typeof source.peakDb === "number" ? source.peakDb : null;
}

// Everything a scenario or hint needs, computed from state + manifest (not
// from live meters, which fluctuate with the music). dB values are peak
// estimates in dBFS.
export function computeMix(state, sourcesById, stems) {
  const rig = analyzeRig(state.rig, state.channels, sourcesById);
  const mainDb = levelToDb(state.main.level);
  const busDb = Object.fromEntries(BUSES.map((b) => [b, levelToDb(state[b].level)]));
  const reachable = new Set(Object.entries(rig.buses).filter(([, ends]) => ends.length).map(([p]) => p));

  const channels = state.channels.map((ch, i) => {
    const input = rig.channels[i] || { connected: false, signal: false };
    const source = input.sourceId ? sourcesById[input.sourceId] : null;
    const peakDb = sourcePeakDb(source, stems);
    let inputPeakDb = -Infinity;
    if (input.connected && input.signal && source && peakDb !== null) {
      inputPeakDb = peakDb + source.outputDb + (input.padDb || 0) + ch.gainDb + HEADROOM_DB;
    }
    const faderDb = levelToDb(ch.level);
    const toMain = ch.enabled ? inputPeakDb + faderDb + mainDb : -Infinity;
    // Mono strips are panned; a stereo strip passes left to Main L and right to Main R.
    const pg = ch.stereo ? { L: 1, R: 1 } : panGains(ch.pan);
    const main = {
      L: toMain + gainToDb(pg.L),
      R: toMain + gainToDb(pg.R),
    };
    // Pre-fader sends: they ignore the fader and the enabled switch.
    // `heardDb` is what actually reaches a working speaker on that bus.
    const aux = Object.fromEntries(
      BUSES.map((b) => {
        const sendDb = levelToDb(ch.auxSends[b]);
        const monitorDb = inputPeakDb + sendDb + busDb[b];
        return [b, { sendDb, monitorDb, heardDb: reachable.has(b) ? monitorDb : -Infinity }];
      }),
    );
    const heardMainDb = Math.max(reachable.has("main-l") ? main.L : -Infinity, reachable.has("main-r") ? main.R : -Infinity);
    return {
      index: i,
      sourceId: input.sourceId || null,
      input,
      inputPeakDb,
      band: inputBand(inputPeakDb),
      faderDb,
      mainDb: main,
      heardMainDb,
      aux,
      pflDb: ch.pfl ? inputPeakDb : -Infinity,
    };
  });

  const powerSum = (list) => gainToDb(Math.sqrt(list.reduce((acc, db) => acc + Math.pow(10, db / 10), 0)));
  const outputs = {
    "main-l": { peakDb: powerSum(channels.map((c) => c.mainDb.L)), endpoints: rig.buses["main-l"] || [] },
    "main-r": { peakDb: powerSum(channels.map((c) => c.mainDb.R)), endpoints: rig.buses["main-r"] || [] },
    ...Object.fromEntries(BUSES.map((b) => [b, { peakDb: powerSum(channels.map((c) => c.aux[b].monitorDb)), endpoints: rig.buses[b] || [] }])),
  };
  return { rig, channels, outputs, mainMasterDb: mainDb, busDb };
}

// ---------- store ----------

// A tiny observable store. Mutations go through named actions so the audio
// engine can tell cheap parameter changes from re-routing (rig changes).
export class MixerStore {
  constructor(state = createMixerState()) {
    this.state = state;
    this.listeners = new Set();
    this.rigVersion = 0;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(change) {
    for (const fn of this.listeners) fn(this.state, change);
  }

  replace(state) {
    this.state = state;
    this.rigVersion++;
    this.emit({ type: "replace" });
  }

  setChannel(index, key, value) {
    const ch = this.state.channels[index];
    if (!ch) return;
    if (ch.stereo && (key === "phantom" || key === "pan")) return; // not on a stereo line strip
    const v = sanitizeChannelValue(key, value);
    if (v === undefined || ch[key] === v) return;
    ch[key] = v;
    this.emit({ type: "channel", index, key });
  }

  setSend(index, bus, value) {
    const ch = this.state.channels[index];
    if (!ch || !(bus in ch.auxSends)) return;
    ch.auxSends[bus] = clamp(Number(value), 0, 1);
    this.emit({ type: "send", index, bus });
  }

  // Global phantom switch for skins that have one: sets every channel.
  setAllPhantom(on) {
    for (const ch of this.state.channels) if (!ch.stereo) ch.phantom = !!on; // stereo line inputs have no +48 V
    this.emit({ type: "channel", index: -1, key: "phantom" });
  }

  setBusLevel(bus, value) {
    if (!["main", "headphones", ...BUSES].includes(bus)) return;
    this.state[bus].level = clamp(Number(value), 0, 1);
    this.emit({ type: "bus", bus });
  }

  setListen(dest) {
    if (!LISTEN_DESTINATIONS.includes(dest) || this.state.listen === dest) return;
    this.state.listen = dest;
    this.emit({ type: "listen" });
  }

  connect(from, to, cable) {
    const check = checkConnection(this.state.rig, from, to, cable);
    if (!check.ok) return check;
    const id = `cable-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.state.rig.cables.push({ id, from, to, cable });
    this.rigVersion++;
    this.emit({ type: "rig" });
    return { ok: true, id };
  }

  disconnect(cableId) {
    const before = this.state.rig.cables.length;
    this.state.rig.cables = this.state.rig.cables.filter((c) => c.id !== cableId);
    if (this.state.rig.cables.length === before) return;
    this.rigVersion++;
    this.emit({ type: "rig" });
  }
}

function sanitizeChannelValue(key, value) {
  switch (key) {
    case "gainDb":
      return Math.round(clamp(Number(value), GAIN_MIN_DB, GAIN_MAX_DB) * 2) / 2;
    case "level":
      return clamp(Number(value), 0, 1);
    case "pan":
      return clamp(Number(value), -1, 1);
    case "enabled":
    case "phantom":
    case "pfl":
      return !!value;
    default:
      return undefined;
  }
}

// Which channel (if any) a source device is patched into.
export function channelForSourceDevice(state, deviceId) {
  const cable = state.rig.cables.find((c) => splitRef(c.from).deviceId === deviceId);
  if (!cable) return null;
  const to = getPort(state.rig, cable.to);
  return to && to.role === "channel-input" ? to.channel : null;
}
