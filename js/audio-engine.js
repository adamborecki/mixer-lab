// Web Audio engine. Owns the AudioContext, stem playback, the speakers and
// listening; the mixer itself is a graph built for the current state's model
// (graph-generic.js for Mixer A/B, graph-1604.js for the CR1604-VLZ). Reads
// semantic state and never touches the DOM. See docs/AUDIO_ENGINE.md.
//
//   stem player (mono) ─► mixer channel input ─► … mixer graph … ─► mixer outs
//   loop player (stereo, own timeline) ─► the mixer's stereo input
//   mixer outs ─► (only through a valid chain) ─► speaker ─► listen group of the bus feeding it
//   listen selector: Main | an aux or subgroup | phones ─► safety limiter ─► destination
//
// Stem playback and synchronization live in js/transport.js. Switching mixers
// rebuilds only the mixer graph: the stems keep playing on one timeline.

import { DEVICE_TYPES, analyzeRig, mixerOf } from "./connection-model.js";
import { dbToGain, listenDestinations, listenGroupOf, modelOf } from "./mixer-state.js";
import { LoopPlayer } from "./loop-player.js";
import { StemTransport } from "./transport.js";
import { METER_FFT, RAMP, nodeKit } from "./graph-kit.js";
import { buildGenericGraph } from "./graph-generic.js";
import { buildCr1604Graph } from "./graph-1604.js";
import { buildCompactGraph } from "./graph-compact.js";
import { COMPACT } from "./compact-defs.js";
import { buildRecorder, buildReverb, buildRoomPair } from "./outboard-audio.js";
import { splitRef } from "./connection-model.js";

// Outboard gear with audio of its own (settings: js/devices.js).
const OUTBOARD = { reverb: "reverb", "zoom-f8": "recorder", "stereo-mic-pair": "pair" };

const LISTEN_TRIM_DB = 4; // fixed make-up gain so a typical mix sits at a comfortable level

export class AudioEngine {
  constructor(store, manifest) {
    this.store = store;
    this.manifest = manifest; // { STEM_SET, STEMS, SOURCES_BY_ID, LOOP_ASSETS }
    this.ctx = null;
    this.transport = null;
    this.loops = new Map(); // sourceId → LoopPlayer (independent of the band's transport)
    this.endpointNodes = new Map();
    this.routes = []; // [fromNode, toNode] connections that depend on the rig
    this.devices = new Map(); // deviceId → { type, rt }: reverb, recorder, mic pair
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(evt) {
    for (const fn of this.listeners) fn(evt);
  }

  get started() {
    return !!this.ctx;
  }

  get playing() {
    return !!this.transport && this.transport.playing;
  }

  get mode() {
    return this.transport ? this.transport.mode : "excerpt";
  }

  // Must be called from a user gesture (click/tap handler).
  start() {
    if (this.ctx) {
      if (this.ctx.state !== "running") this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    this.ctx.resume();
    this.transport = new StemTransport(this.ctx, this.manifest, (evt) => this.emit(evt));
    const errors = this.transport.errors;
    for (const source of Object.values(this.manifest.SOURCES_BY_ID)) {
      const asset = source.asset && this.manifest.LOOP_ASSETS[source.asset];
      if (asset) this.loops.set(source.id, new LoopPlayer(this.ctx, { sourceId: source.id, url: asset.file, errors, emit: (evt) => this.emit(evt) }));
    }
    this.buildGraph();
    this.syncDevices(this.store.state);
    this.lastCables = new Map(this.store.state.rig.cables.map((c) => [c.id, c]));
    this.unsubscribe = this.store.subscribe((state, change) => this.onChange(state, change));
    this.rewire();
    this.applyAll();
    for (const p of this.loops.values()) p.start(); // once; never restarted or stopped by patching
  }

  // ---------- graph ----------

  // The parts that never change: listening output, safety limiter, its meter.
  buildGraph() {
    const ctx = this.ctx;
    this.meterBuf = new Float32Array(METER_FFT);
    this.listenOut = ctx.createGain();
    this.listenOut.gain.value = dbToGain(LISTEN_TRIM_DB);
    // Safety limiter: protects ears when students crank things, not a mix tool.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.2;
    this.listenOut.connect(this.limiter).connect(ctx.destination);
    this.listenMeter = ctx.createAnalyser();
    this.listenMeter.fftSize = METER_FFT;
    this.listenMeter.smoothingTimeConstant = 0;
    this.limiter.connect(this.listenMeter);
    this.buildMixer();
  }

  // The mixer graph for the current state's model, plus one listen group per destination.
  buildMixer() {
    const state = this.store.state;
    this.model = modelOf(state);
    this.kit = nodeKit(this.ctx);
    this.mixer = this.model === "cr1604" ? buildCr1604Graph(this.kit) : COMPACT[this.model] ? buildCompactGraph(this.kit, COMPACT[this.model]) : buildGenericGraph(this.kit);
    this.strips = this.mixer.strips;
    this.outputs = this.mixer.outputs;
    this.listenGains = {};
    for (const dest of listenDestinations(state)) {
      this.listenGains[dest] = this.kit.gain(0);
      this.listenGains[dest].connect(this.listenOut);
    }
    if (this.mixer.phonesDest && this.listenGains[this.mixer.phonesDest]) this.mixer.phones.connect(this.listenGains[this.mixer.phonesDest]);
  }

  // ---------- state → graph ----------

  onChange(state, change) {
    if (change.type === "replace" && modelOf(state) !== this.model) {
      this.unroute();
      this.kit.dispose();
      this.buildMixer();
    }
    if (change.type === "replace" || change.type === "rig") this.syncDevices(state);
    if (this.mixer.pop) this.firePops(state, change);
    if (change.type === "rig" || change.type === "replace") this.rewire();
    this.applyAll();
  }

  // Phantom pops (mixers whose graph supports them): an XLR plugged into or
  // pulled out of a powered MIC jack pops loudly; flipping PHANTOM thumps
  // every channel with an XLR in it.
  firePops(state, change) {
    const POP_DB = -14; // at the mic input, before TRIM
    const THUMP_DB = -58; // several channels thump at once, so each is quieter
    const cables = new Map(state.rig.cables.map((c) => [c.id, c]));
    if (change.type === "rig") {
      const mixerType = DEVICE_TYPES[mixerOf(state.rig).type];
      const changed = [...[...cables.values()].filter((c) => !this.lastCables.has(c.id)), ...[...this.lastCables.values()].filter((c) => !cables.has(c.id))];
      for (const c of changed) {
        const port = mixerType.ports.find((p) => `mixer/${p.id}` === c.to);
        if (port && port.path === "mic" && state.channels[port.channel]?.phantom) this.mixer.pop(state, port.channel, POP_DB);
      }
    }
    if (change.type === "channel" && change.key === "phantom") {
      for (const i of this.mixer.xlrChannels(state.rig)) this.mixer.pop(state, i, THUMP_DB);
    }
    // The recorder's inputs pop the same way when their own 48V is on.
    const recPop = (ref, cable, db) => {
      const { deviceId, portId } = splitRef(ref);
      const d = this.devices.get(deviceId);
      const dev = state.rig.devices.find((x) => x.id === deviceId);
      const m = /^in(\d)$/.exec(portId);
      if (!d || d.type !== "zoom-f8" || !m || !dev || cable.cable === undefined) return;
      const t = Number(m[1]) - 1;
      if (dev.tracks[t].phantom && ["xlr", "xlr-trs"].includes(cable.cable)) d.rt.pop(t, db);
    };
    if (change.type === "rig") {
      for (const c of cables.values()) if (!this.lastCables.has(c.id)) recPop(c.to, c, POP_DB);
      for (const c of this.lastCables.values()) if (!cables.has(c.id)) recPop(c.to, c, POP_DB);
    }
    if (change.type === "device" && /^tracks\.\d\.phantom$/.test(change.key)) {
      const t = Number(change.key.split(".")[1]);
      const c = [...cables.values()].find((x) => x.to === `${change.id}/in${t + 1}`);
      if (c) recPop(c.to, c, THUMP_DB + 8);
    }
    this.lastCables = cables;
  }

  set(param, value) {
    param.setTargetAtTime(value, this.ctx.currentTime, RAMP);
  }

  applyAll() {
    if (!this.ctx) return;
    const state = this.store.state;
    const { SOURCES_BY_ID } = this.manifest;
    // Re-analyse every time: phantom power changes whether a channel has signal.
    const rig = analyzeRig(state.rig, state.channels, SOURCES_BY_ID);
    this.mixer.apply(state, rig, SOURCES_BY_ID);
    for (const dev of state.rig.devices) {
      const d = this.devices.get(dev.id);
      if (d) d.rt.apply(dev, rig.recorders?.[dev.id], SOURCES_BY_ID);
    }
    for (const [dest, g] of Object.entries(this.listenGains)) this.set(g.gain, state.listen === dest ? 1 : 0);
  }

  // Builds or tears down the outboard gear to match the rig. A recorder keeps
  // its takes while it stays on stage (a scenario reset doesn't wipe the card).
  syncDevices(state) {
    const want = new Map(state.rig.devices.filter((d) => OUTBOARD[d.type]).map((d) => [d.id, d.type]));
    for (const [id, d] of this.devices) {
      if (want.get(id) === d.type) continue;
      d.rt.dispose();
      this.devices.delete(id);
    }
    for (const [id, type] of want) {
      if (this.devices.has(id)) continue;
      const rt =
        type === "reverb"
          ? buildReverb(this.ctx)
          : type === "stereo-mic-pair"
            ? buildRoomPair(this.ctx, this.manifest.SOURCES_BY_ID)
            : buildRecorder(this.ctx, { onUpdate: () => this.emit({ type: "recorder", id }) });
      this.devices.set(id, { type, rt });
    }
  }

  recorder(id) {
    const d = this.devices.get(id);
    return d && d.type === "zoom-f8" ? d.rt : null;
  }

  // The audio node behind an output port, or an input port (null if none).
  outNode(ref) {
    const { deviceId, portId } = splitRef(ref);
    if (deviceId === "mixer") return this.outputs[portId] || null;
    const d = this.devices.get(deviceId);
    if (d) return d.rt.outputs[portId] || null;
    const dev = this.store.state.rig.devices.find((x) => x.id === deviceId);
    if (!dev || !dev.sourceId) return null;
    const loop = this.loops.get(dev.sourceId);
    return loop ? loop.out : this.transport.outs.get(dev.sourceId) || null;
  }

  inNode(ref) {
    const { deviceId, portId } = splitRef(ref);
    if (deviceId === "mixer") {
      const port = DEVICE_TYPES[mixerOf(this.store.state.rig).type].ports.find((p) => p.id === portId);
      if (port && port.role === "channel-input") return this.strips[port.channel]?.input || null;
      return this.mixer.inputs?.[portId] || null;
    }
    const d = this.devices.get(deviceId);
    return d ? d.rt.inputs[portId] || null : null;
  }

  unroute() {
    for (const [from, to] of this.routes) {
      try {
        from.disconnect(to);
      } catch (e) {
        /* already gone */
      }
    }
    this.routes = [];
  }

  // Rebuilds every connection that depends on patching: which stem feeds
  // which channel, and which mixer output reaches which speaker.
  rewire() {
    if (!this.ctx) return;
    const state = this.store.state;
    const rigInfo = analyzeRig(state.rig, state.channels, this.manifest.SOURCES_BY_ID);
    this.unroute();
    const link = (from, to) => {
      from.connect(to);
      this.routes.push([from, to]);
    };

    // Every cable between two ports that have audio: sources and the room
    // pair into the mixer or the recorder, aux sends into the reverb, the
    // reverb into the returns, mixer outputs into the recorder. Signal validity
    // (phantom etc.) is applied as gain in applyAll, so 48 V needs no rewire.
    // Speakers and amps are handled below.
    for (const d of this.devices.values()) if (d.rt.link) d.rt.link(this.transport.outs);
    for (const c of state.rig.cables) {
      const from = this.outNode(c.from);
      const to = this.inNode(c.to);
      if (from && to) link(from, to);
    }
    for (const d of this.devices.values()) if (d.rt.phones && this.listenGains.rec) link(d.rt.phones, this.listenGains.rec);

    // Speakers: one node per speaker, panned to its place, feeding the listen
    // group of whichever bus reaches it.
    const wanted = new Set();
    for (const ep of rigInfo.endpoints) {
      wanted.add(ep.deviceId);
      let node = this.endpointNodes.get(ep.deviceId);
      if (!node) {
        const input = this.ctx.createGain();
        input.channelCount = 1;
        input.channelCountMode = "explicit";
        const pan = this.ctx.createStereoPanner();
        input.connect(pan);
        node = { input, pan };
        this.endpointNodes.set(ep.deviceId, node);
      }
      node.pan.pan.value = ep.pan * 0.8;
      // Only a valid physical chain makes sound. No bypass.
      const group = this.listenGains[listenGroupOf(state, ep.output)];
      if (ep.valid && this.outputs[ep.output] && group) {
        link(this.outputs[ep.output], node.input);
        link(node.pan, group);
      }
    }
    for (const [id, node] of this.endpointNodes) {
      if (wanted.has(id)) continue;
      node.pan.disconnect();
      this.endpointNodes.delete(id);
    }
  }

  // ---------- stems ----------

  // Loads the stems for these sources (excerpt loop or full song), then starts
  // them together. Nothing plays until the first audio is decoded.
  async setSources(sourceIds, { mode = this.mode } = {}) {
    // Band stems only: loop-player sources (preshow) have their own timeline.
    const ids = sourceIds.filter((id) => this.manifest.SOURCES_BY_ID[id] && this.manifest.SOURCES_BY_ID[id].stem);
    this.transport.prepare(ids);
    this.rewire();
    if (await this.transport.load(mode)) await this.transport.play();
  }

  play() {
    return this.transport && this.transport.play();
  }

  stop() {
    if (this.transport) this.transport.stop();
  }

  seek(t) {
    if (this.transport) this.transport.seek(t);
  }

  position() {
    return this.transport ? this.transport.position() : { t: 0, duration: 0 };
  }

  // ---------- meters ----------

  // Peak and RMS (dBFS) from an analyser's current time-domain window.
  readAnalyser(a) {
    const buf = this.meterBuf;
    a.getFloatTimeDomainData(buf);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    return { peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity };
  }

  readMeters() {
    if (!this.ctx) return null;
    const recorders = {};
    for (const [id, d] of this.devices) if (d.type === "zoom-f8") recorders[id] = d.rt.tracks.map((t) => this.readAnalyser(t.meter));
    return { ...this.mixer.readMeters((a) => this.readAnalyser(a)), listen: this.readAnalyser(this.listenMeter), recorders };
  }
}
