// Web Audio engine. Owns the AudioContext and the node graph; reads the
// semantic mixer state and never touches the DOM. See docs/AUDIO_ENGINE.md.
//
//   stem player (mono) ─► channel input ─► preamp gain ─► clipper ─► tap
//   tap ─► input meter
//   tap ─► enabled ─► fader ─► pan ─► Main bus ─► Main master ─► Main L / Main R outs
//   tap ─► Aux 1 send (pre-fader) ─► Aux 1 bus ─► Aux 1 master ─► Aux 1 out
//   tap ─► PFL switch ─► PFL bus ─► phones level
//
//   mixer outs ─► (only through a valid chain) ─► speaker endpoint ─► zone (house / stage)
//   listen selector: house zone | stage zone | phones ─► safety limiter ─► destination

import { analyzeRig } from "./connection-model.js";
import { CHANNEL_COUNT, HEADROOM_DB, dbToGain, levelToDb } from "./mixer-state.js";

const RAMP = 0.012; // seconds; smooths control changes without lag
const LISTEN_TRIM_DB = 4; // fixed make-up gain so a typical mix sits at a comfortable level
const METER_FFT = 1024;

export class AudioEngine {
  constructor(store, manifest) {
    this.store = store;
    this.manifest = manifest; // { STEM_SET, STEMS, SOURCES_BY_ID }
    this.ctx = null;
    this.buffers = new Map(); // stemId → mono AudioBuffer
    this.loadErrors = new Map(); // stemId → message
    this.players = new Map(); // sourceId → { node, out }
    this.activeSourceIds = [];
    this.playing = false;
    this.transportStart = 0;
    this.endpointNodes = new Map();
    this.routes = []; // [fromNode, toNode] connections that depend on the rig
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

  // Must be called from a user gesture (click/tap handler).
  start() {
    if (this.ctx) {
      if (this.ctx.state !== "running") this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    this.ctx.resume();
    this.buildGraph();
    this.unsubscribe = this.store.subscribe((state, change) => this.onChange(state, change));
    this.rewire();
    this.applyAll();
  }

  // ---------- graph ----------

  buildGraph() {
    const ctx = this.ctx;
    const gain = (v = 1, mono = false) => {
      const g = ctx.createGain();
      g.gain.value = v;
      if (mono) {
        g.channelCount = 1;
        g.channelCountMode = "explicit";
        g.channelInterpretation = "speakers";
      }
      return g;
    };
    const analyser = () => {
      const a = ctx.createAnalyser();
      a.fftSize = METER_FFT;
      a.smoothingTimeConstant = 0;
      return a;
    };
    this.meterBuf = new Float32Array(METER_FFT);

    // Buses
    this.mainBus = gain(1);
    this.mainBus.channelCount = 2;
    this.mainBus.channelCountMode = "explicit";
    this.mainMaster = gain(1);
    this.mainBus.connect(this.mainMaster);
    const split = ctx.createChannelSplitter(2);
    this.mainMaster.connect(split);
    this.mainL = gain(1, true);
    this.mainR = gain(1, true);
    split.connect(this.mainL, 0);
    split.connect(this.mainR, 1);

    this.aux1Bus = gain(1, true);
    this.aux1Master = gain(1, true);
    this.aux1Bus.connect(this.aux1Master);
    this.aux1Out = gain(1, true);
    this.aux1Master.connect(this.aux1Out);

    this.pflBus = gain(1, true);
    this.phones = gain(1, true);
    this.pflBus.connect(this.phones);

    this.outputs = { "main-l": this.mainL, "main-r": this.mainR, aux1: this.aux1Out };

    this.meters = {
      mainL: analyser(),
      mainR: analyser(),
      aux1: analyser(),
      pfl: analyser(),
    };
    this.mainL.connect(this.meters.mainL);
    this.mainR.connect(this.meters.mainR);
    this.aux1Out.connect(this.meters.aux1);
    this.pflBus.connect(this.meters.pfl);

    // Channel strips
    this.strips = [];
    const clipCurve = new Float32Array([-1, 1]); // identity inside ±1, hard clip outside
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      const input = gain(1, true);
      const pre = gain(0, true);
      const clip = ctx.createWaveShaper();
      clip.curve = clipCurve;
      const meter = analyser();
      const enabled = gain(1, true);
      const fader = gain(0, true);
      const pan = ctx.createStereoPanner();
      const send = gain(0, true);
      const pfl = gain(0, true);
      input.connect(pre).connect(clip);
      clip.connect(meter);
      clip.connect(enabled).connect(fader).connect(pan).connect(this.mainBus);
      clip.connect(send).connect(this.aux1Bus);
      clip.connect(pfl).connect(this.pflBus);
      this.strips.push({ input, pre, clip, meter, enabled, fader, pan, send, pfl });
    }

    // Listening: house zone, stage zone, phones → selector → limiter → out
    this.zones = { foh: gain(1), stage: gain(1) };
    this.listenGains = { main: gain(0), aux1: gain(0), pfl: gain(0) };
    this.zones.foh.connect(this.listenGains.main);
    this.zones.stage.connect(this.listenGains.aux1);
    this.phones.connect(this.listenGains.pfl);
    this.listenOut = gain(dbToGain(LISTEN_TRIM_DB));
    for (const g of Object.values(this.listenGains)) g.connect(this.listenOut);
    // Safety limiter: protects ears when students crank things, not a mix tool.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.2;
    this.listenOut.connect(this.limiter).connect(ctx.destination);
    this.meters.listen = analyser();
    this.limiter.connect(this.meters.listen);
  }

  // ---------- state → graph ----------

  onChange(state, change) {
    if (change.type === "rig" || change.type === "replace") this.rewire();
    this.applyAll();
  }

  set(param, value) {
    param.setTargetAtTime(value, this.ctx.currentTime, RAMP);
  }

  applyAll() {
    if (!this.ctx) return;
    const state = this.store.state;
    const { SOURCES_BY_ID } = this.manifest;
    // Re-analyse every time: phantom power changes whether a channel has signal.
    const rig = (this.rigInfo = analyzeRig(state.rig, state.channels, SOURCES_BY_ID));
    state.channels.forEach((ch, i) => {
      const s = this.strips[i];
      const info = rig.channels[i];
      const source = info && info.sourceId ? SOURCES_BY_ID[info.sourceId] : null;
      // Everything before the preamp is folded into one gain: how hot the
      // source is, the line-input pad, the gain knob, and fixed headroom.
      const preDb = source && info.signal ? source.outputDb + (info.padDb || 0) + ch.gainDb + HEADROOM_DB : -Infinity;
      this.set(s.pre.gain, dbToGain(preDb));
      this.set(s.enabled.gain, ch.enabled ? 1 : 0);
      this.set(s.fader.gain, dbToGain(levelToDb(ch.level)));
      this.set(s.pan.pan, ch.pan);
      this.set(s.send.gain, dbToGain(levelToDb(ch.auxSends.aux1)));
      this.set(s.pfl.gain, ch.pfl ? 1 : 0);
    });
    this.set(this.mainMaster.gain, dbToGain(levelToDb(state.main.level)));
    this.set(this.aux1Master.gain, dbToGain(levelToDb(state.aux1.level)));
    this.set(this.phones.gain, dbToGain(levelToDb(state.headphones.level)));
    for (const [dest, g] of Object.entries(this.listenGains)) this.set(g.gain, state.listen === dest ? 1 : 0);
  }

  // Rebuilds every connection that depends on patching: which player feeds
  // which channel, and which mixer output reaches which speaker.
  rewire() {
    if (!this.ctx) return;
    const state = this.store.state;
    this.rigInfo = analyzeRig(state.rig, state.channels, this.manifest.SOURCES_BY_ID);
    for (const [from, to] of this.routes) {
      try {
        from.disconnect(to);
      } catch (e) {
        /* already gone */
      }
    }
    this.routes = [];
    const link = (from, to) => {
      from.connect(to);
      this.routes.push([from, to]);
    };

    // Sources → channel inputs. Signal validity (phantom etc.) is applied as
    // gain in applyAll so toggling 48 V doesn't need a rewire.
    this.rigInfo.channels.forEach((info, i) => {
      if (!info || !info.connected || !info.sourceId) return;
      const player = this.players.get(info.sourceId);
      if (player) link(player.out, this.strips[i].input);
    });

    // Endpoints: one node per speaker, panned into its zone.
    const wanted = new Set();
    for (const ep of this.rigInfo.endpoints) {
      wanted.add(ep.deviceId);
      let node = this.endpointNodes.get(ep.deviceId);
      if (!node) {
        const input = this.ctx.createGain();
        input.channelCount = 1;
        input.channelCountMode = "explicit";
        const pan = this.ctx.createStereoPanner();
        input.connect(pan);
        node = { input, pan, zone: null };
        this.endpointNodes.set(ep.deviceId, node);
      }
      node.pan.pan.value = ep.pan * 0.8;
      if (node.zone !== ep.zone) {
        if (node.zone) node.pan.disconnect();
        node.pan.connect(this.zones[ep.zone] || this.zones.foh);
        node.zone = ep.zone;
      }
      // Only a valid physical chain makes sound. No bypass.
      if (ep.valid && this.outputs[ep.output]) link(this.outputs[ep.output], node.input);
    }
    for (const [id, node] of this.endpointNodes) {
      if (wanted.has(id)) continue;
      node.pan.disconnect();
      this.endpointNodes.delete(id);
    }
  }

  // ---------- stems ----------

  // Loads (once) and decodes the stems for these sources, then (re)starts
  // them together. Nothing plays until every requested buffer is ready.
  async setSources(sourceIds, { restart = true } = {}) {
    const { SOURCES_BY_ID } = this.manifest;
    this.activeSourceIds = sourceIds.filter((id) => SOURCES_BY_ID[id]);
    const stemIds = [...new Set(this.activeSourceIds.map((id) => SOURCES_BY_ID[id].stem))];
    const missing = stemIds.filter((s) => !this.buffers.has(s));
    const token = (this.loadToken = Symbol("load"));
    this.stopPlayers();
    if (missing.length) {
      let done = stemIds.length - missing.length;
      this.emit({ type: "loading", done, total: stemIds.length });
      await Promise.all(
        missing.map(async (stemId) => {
          this.buffers.set(stemId, await this.loadStem(stemId));
          done++;
          if (token === this.loadToken) this.emit({ type: "loading", done, total: stemIds.length });
        }),
      );
    }
    if (token !== this.loadToken) return; // a newer request superseded this one
    this.emit({ type: "ready", errors: [...this.loadErrors.entries()] });
    if (restart) this.play();
  }

  async loadStem(stemId) {
    const { STEM_SET, STEMS } = this.manifest;
    const stem = STEMS[stemId];
    try {
      const res = await fetch(STEM_SET.basePath + stem.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(data);
      return toMono(this.ctx, decoded, stem.treatment);
    } catch (err) {
      this.loadErrors.set(stemId, `${stem.file}: ${err.message || err}`);
      return testTone(this.ctx, STEM_SET.loop.end + 1, stemId);
    }
  }

  play() {
    if (!this.ctx) return;
    this.stopPlayers();
    const { STEM_SET, SOURCES_BY_ID } = this.manifest;
    const { start: loopStart, end: loopEnd } = STEM_SET.loop;
    const when = this.ctx.currentTime + 0.08;
    for (const id of this.activeSourceIds) {
      const buffer = this.buffers.get(SOURCES_BY_ID[id].stem);
      if (!buffer) continue;
      const node = this.ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.loopStart = loopStart;
      node.loopEnd = loopEnd;
      const out = this.ctx.createGain();
      node.connect(out);
      // Same start time, same offset, same loop points → sample-locked stems.
      node.start(when, loopStart);
      this.players.set(id, { node, out });
    }
    this.transportStart = when;
    this.playing = true;
    this.rewire();
    this.emit({ type: "transport", playing: true });
  }

  stop() {
    this.stopPlayers();
    this.playing = false;
    this.emit({ type: "transport", playing: false });
  }

  stopPlayers() {
    const outs = new Set();
    for (const { node, out } of this.players.values()) {
      try {
        node.stop();
      } catch (e) {
        /* not started */
      }
      node.disconnect();
      out.disconnect();
      outs.add(out);
    }
    this.players.clear();
    this.routes = this.routes.filter(([from]) => !outs.has(from));
  }

  // Seconds into the loop (for a progress display).
  get position() {
    if (!this.ctx || !this.playing) return 0;
    const { start, end } = this.manifest.STEM_SET.loop;
    const t = this.ctx.currentTime - this.transportStart;
    return t < 0 ? 0 : t % (end - start);
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
    return {
      channels: this.strips.map((s) => this.readAnalyser(s.meter)),
      mainL: this.readAnalyser(this.meters.mainL),
      mainR: this.readAnalyser(this.meters.mainR),
      aux1: this.readAnalyser(this.meters.aux1),
      pfl: this.readAnalyser(this.meters.pfl),
      listen: this.readAnalyser(this.meters.listen),
    };
  }
}

// Folds a decoded stereo buffer into the mono signal a live-sound input
// channel would see. "sum" averages L and R (no level jump for centred
// material, no clipping); "left"/"right" pick one side for stems whose sides
// would cancel. Mono input passes through.
export function toMono(ctx, buffer, treatment = "sum") {
  if (buffer.numberOfChannels === 1) return buffer;
  const out = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const dst = out.getChannelData(0);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  if (treatment === "left") dst.set(L);
  else if (treatment === "right") dst.set(R);
  else for (let i = 0; i < dst.length; i++) dst[i] = 0.5 * (L[i] + R[i]);
  return out;
}

// Development fallback only: a plain tone so routing can still be tested if
// a stem fails to load. Never used as "music".
function testTone(ctx, seconds, seed) {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const freq = 220 * Math.pow(2, (seed.length % 7) / 12);
  for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / ctx.sampleRate);
  return buf;
}
