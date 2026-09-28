// Web Audio engine. Owns the AudioContext and the node graph; reads the
// semantic mixer state and never touches the DOM. See docs/AUDIO_ENGINE.md.
//
//   stem player (mono) ─► channel input ─► preamp gain ─► clipper ─► tap
//   loop player (stereo, own timeline) ─► stereo channel strip (same chain, no pan)
//   tap ─► input meter
//   tap ─► enabled ─► fader ─► pan ─► Main bus ─► Main master ─► Main L / Main R outs
//   tap ─► Aux 1 send (pre-fader) ─► Aux 1 bus ─► Aux 1 master ─► Aux 1 out
//   tap ─► Aux 2 send (pre-fader) ─► Aux 2 bus ─► Aux 2 master ─► Aux 2 out
//   tap ─► PFL switch ─► PFL bus ─► phones level
//
//   mixer outs ─► (only through a valid chain) ─► speaker ─► listen group of the bus feeding it
//   listen selector: Main | Aux 1 | Aux 2 | phones ─► safety limiter ─► destination
//
// Stem playback and synchronization live in js/transport.js.

import { analyzeRig } from "./connection-model.js";
import { BUSES, CHANNEL_COUNT, CHANNEL_LAYOUT, HEADROOM_DB, dbToGain, levelToDb } from "./mixer-state.js";
import { LoopPlayer } from "./loop-player.js";
import { StemTransport } from "./transport.js";

const RAMP = 0.012; // seconds; smooths control changes without lag
const LISTEN_TRIM_DB = 4; // fixed make-up gain so a typical mix sits at a comfortable level
const METER_FFT = 1024;

// Which listen group a mixer output belongs to.
const busOfOutput = (port) => (port === "main-l" || port === "main-r" ? "main" : port);

export class AudioEngine {
  constructor(store, manifest) {
    this.store = store;
    this.manifest = manifest; // { STEM_SET, STEMS, SOURCES_BY_ID, LOOP_ASSETS }
    this.ctx = null;
    this.transport = null;
    this.loops = new Map(); // sourceId → LoopPlayer (independent of the band's transport)
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
    this.unsubscribe = this.store.subscribe((state, change) => this.onChange(state, change));
    this.rewire();
    this.applyAll();
    for (const p of this.loops.values()) p.start(); // once; never restarted or stopped by patching
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
    const stereoGain = (v = 1) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.channelCount = 2;
      g.channelCountMode = "explicit";
      g.channelInterpretation = "speakers";
      return g;
    };
    const analyser = () => {
      const a = ctx.createAnalyser();
      a.fftSize = METER_FFT;
      a.smoothingTimeConstant = 0;
      return a;
    };
    this.meterBuf = new Float32Array(METER_FFT);
    this.meters = {};

    // Main L/R
    this.mainBus = gain(1);
    this.mainBus.channelCount = 2;
    this.mainBus.channelCountMode = "explicit";
    this.mainMaster = gain(1);
    this.mainBus.connect(this.mainMaster);
    const split = ctx.createChannelSplitter(2);
    this.mainMaster.connect(split);
    const mainL = gain(1, true);
    const mainR = gain(1, true);
    split.connect(mainL, 0);
    split.connect(mainR, 1);
    this.outputs = { "main-l": mainL, "main-r": mainR };
    this.meters.mainL = analyser();
    this.meters.mainR = analyser();
    mainL.connect(this.meters.mainL);
    mainR.connect(this.meters.mainR);

    // Aux buses: bus → master → out
    this.auxBus = {};
    this.auxMaster = {};
    for (const b of BUSES) {
      this.auxBus[b] = gain(1, true);
      this.auxMaster[b] = gain(1, true);
      this.auxBus[b].connect(this.auxMaster[b]);
      this.outputs[b] = this.auxMaster[b];
      this.meters[b] = analyser();
      this.auxMaster[b].connect(this.meters[b]);
    }

    // PFL
    this.pflBus = gain(1, true);
    this.phones = gain(1, true);
    this.pflBus.connect(this.phones);
    this.meters.pfl = analyser();
    this.pflBus.connect(this.meters.pfl);

    // Channel strips
    this.strips = [];
    const clipCurve = new Float32Array([-1, 1]); // identity inside ±1, hard clip outside
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      // A stereo strip is one strip: same controls, but every stage carries L and R.
      const stereo = !!CHANNEL_LAYOUT[i].stereo;
      const chan = stereo ? stereoGain : (v) => gain(v, true);
      const input = chan(1);
      const pre = chan(0);
      const clip = ctx.createWaveShaper();
      clip.curve = clipCurve;
      const meter = analyser();
      const enabled = chan(1);
      const fader = chan(0);
      const pan = stereo ? null : ctx.createStereoPanner(); // stereo: left stays left, right stays right
      const pfl = gain(0, true);
      input.connect(pre).connect(clip);
      clip.connect(meter);
      clip.connect(enabled).connect(fader);
      if (pan) fader.connect(pan).connect(this.mainBus);
      else fader.connect(this.mainBus);
      const sends = {};
      for (const b of BUSES) {
        sends[b] = gain(0, true);
        clip.connect(sends[b]).connect(this.auxBus[b]); // pre-fader
      }
      clip.connect(pfl).connect(this.pflBus);
      this.strips.push({ input, pre, clip, meter, enabled, fader, pan, sends, pfl, stereo });
    }

    // Listening: each speaker feeds the listen group of the bus that reaches
    // it; the selector opens one group (or the phones).
    this.listenGains = {};
    this.listenOut = gain(dbToGain(LISTEN_TRIM_DB));
    for (const dest of ["main", ...BUSES, "pfl"]) {
      this.listenGains[dest] = gain(0);
      this.listenGains[dest].connect(this.listenOut);
    }
    this.phones.connect(this.listenGains.pfl);
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
    const rig = analyzeRig(state.rig, state.channels, SOURCES_BY_ID);
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
      if (s.pan) this.set(s.pan.pan, ch.pan);
      for (const b of BUSES) this.set(s.sends[b].gain, dbToGain(levelToDb(ch.auxSends[b])));
      this.set(s.pfl.gain, ch.pfl ? 1 : 0);
    });
    this.set(this.mainMaster.gain, dbToGain(levelToDb(state.main.level)));
    for (const b of BUSES) this.set(this.auxMaster[b].gain, dbToGain(levelToDb(state[b].level)));
    this.set(this.phones.gain, dbToGain(levelToDb(state.headphones.level)));
    for (const [dest, g] of Object.entries(this.listenGains)) this.set(g.gain, state.listen === dest ? 1 : 0);
  }

  // Rebuilds every connection that depends on patching: which stem feeds
  // which channel, and which mixer output reaches which speaker.
  rewire() {
    if (!this.ctx) return;
    const state = this.store.state;
    const rigInfo = analyzeRig(state.rig, state.channels, this.manifest.SOURCES_BY_ID);
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
    rigInfo.channels.forEach((info, i) => {
      if (!info || !info.connected || !info.sourceId) return;
      const loop = this.loops.get(info.sourceId);
      const out = loop ? loop.out : this.transport.outs.get(info.sourceId);
      if (out) link(out, this.strips[i].input);
    });

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
      if (ep.valid && this.outputs[ep.output]) {
        link(this.outputs[ep.output], node.input);
        link(node.pan, this.listenGains[busOfOutput(ep.output)]);
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
    const out = { channels: this.strips.map((s) => this.readAnalyser(s.meter)) };
    for (const k of Object.keys(this.meters)) out[k] = this.readAnalyser(this.meters[k]);
    return out;
  }
}
