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

export {
  HEADROOM_DB,
  INPUT_BANDS,
  inputBand,
  levelToDb,
  dbToLevel,
  dbToGain,
  gainToDb,
  panGains,
  formatDb,
  formatPan,
  clamp,
} from "./levels.js";
import { HEADROOM_DB, inputBand, levelToDb, dbToLevel, gainToDb, panGains, clamp } from "./levels.js";
import * as CR1604 from "./cr1604.js";
import { setDeviceValue } from "./devices.js";
import { compactModel, COMPACT_IDS } from "./compact.js";

// Which mixer a state belongs to. A state without `model` is the generic
// mixer that Mixer A and Mixer B draw; "cr1604" is the Mackie (js/cr1604.js).
export const MODELS = ["generic", "cr1604", ...COMPACT_IDS];
export const modelOf = (state) => state.model || "generic";
// The model module for a non-generic state: js/cr1604.js or a compact mixer (js/compact.js).
export const hardware = (model) => (model === "cr1604" ? CR1604 : compactModel(model));
export const listenDestinations = (state) => (modelOf(state) === "generic" ? LISTEN_DESTINATIONS : hardware(modelOf(state)).LISTEN);
// The listening group a mixer output feeds (Main L and R are both "main").
export function listenGroupOf(state, portId) {
  if (modelOf(state) !== "generic") return hardware(modelOf(state)).listenGroupOf(portId, state);
  return portId === "main-l" || portId === "main-r" ? "main" : portId;
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
    lowCut: false, // 75 Hz high-pass right after the preamp (mono strips)
    enabled: true, // Skin A shows this as MUTE (lit = false); Skin B as ON (lit = true)
    pan: 0, // mono strips only; a stereo strip keeps its left and right sides where they are
    level: 0, // fader / level knob position, 0…1
    auxSends: Object.fromEntries(BUSES.map((b) => [b, 0])), // send knob positions, 0…1 (pre-fader)
    pfl: false,
  };
}

export function createMixerState(model = "generic") {
  if (model !== "generic") return hardware(model).createState();
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
  if (modelOf(state) !== "generic") return hardware(modelOf(state)).computeMix(state, sourcesById, stems, sourcePeakDb);
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

  // SCENES (full X32): store the mixer's settings in a slot, or recall them.
  // A scene holds everything but the cables, the listening position and the scenes.
  storeScene(n, name) {
    const scenes = this.state.scenes;
    if (!scenes || !(n in scenes)) return;
    const { rig, listen, scenes: _s, ...settings } = this.state;
    scenes[n] = { name: String(name || scenes[n]?.name || `Scene ${n + 1}`).slice(0, 24), settings: structuredClone(settings) };
    this.emit({ type: "scene", action: "store", n });
  }

  recallScene(n) {
    const scene = this.state.scenes?.[n];
    if (!scene) return;
    Object.assign(this.state, structuredClone(scene.settings));
    this.emit({ type: "scene", action: "recall", n });
  }

  setChannel(index, key, value) {
    const ch = this.state.channels[index];
    if (!ch) return;
    if (modelOf(this.state) !== "generic") {
      // Keys may name a nested control: "eq.mid", "assign.lr", "peq.hiMid.gain".
      const v = hardware(modelOf(this.state)).sanitizeChannel(ch, key, value);
      const path = key.split(".");
      const k = path.pop();
      const holder = path.reduce((o, p) => (o ? o[p] : undefined), ch);
      if (v === undefined || !holder || holder[k] === v) return;
      holder[k] = v;
      this.emit({ type: "channel", index, key });
      return;
    }
    if (ch.stereo && (key === "phantom" || key === "pan" || key === "lowCut")) return; // not on a stereo line strip
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
    // Which channels the switch powers: a compact mixer says (STAGEPAS: CH1/2 only).
    const powered = modelOf(this.state) !== "generic" ? hardware(modelOf(this.state)).phantomChannels : null;
    for (const ch of this.state.channels) if (powered ? powered.includes(ch.index) : !ch.stereo) ch.phantom = !!on; // stereo line inputs have no +48 V
    this.emit({ type: "channel", index: -1, key: "phantom" });
  }

  setBusLevel(bus, value) {
    if (modelOf(this.state) !== "generic") return this.setBus(bus, "level", value);
    if (!["main", "headphones", ...BUSES].includes(bus)) return;
    this.state[bus].level = clamp(Number(value), 0, 1);
    this.emit({ type: "bus", bus });
  }

  // A master-section control other than a level (CR1604: SUB assigns, SOURCE
  // matrix, solo MODE, AUX SEND solo). Validated by the mixer model.
  setBus(bus, key, value) {
    const fn = modelOf(this.state) !== "generic" ? hardware(modelOf(this.state)).BUS_KEYS[bus]?.[key] : key === "level" && ["main", "headphones", ...BUSES].includes(bus) ? (v) => clamp(Number(v), 0, 1) : null;
    const v = fn ? fn(value) : undefined;
    if (v === undefined || this.state[bus][key] === v) return;
    this.state[bus][key] = v;
    this.emit({ type: "bus", bus, key });
  }

  // A setting on an outboard device (reverb, recorder, mic pair): js/devices.js.
  setDevice(deviceId, key, value) {
    const dev = this.state.rig.devices.find((d) => d.id === deviceId);
    if (!dev || !setDeviceValue(dev, key, value)) return;
    this.emit({ type: "device", id: deviceId, key });
  }

  setListen(dest) {
    if (!listenDestinations(this.state).includes(dest) || this.state.listen === dest) return;
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
    case "lowCut":
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
