// Web Audio for the outboard gear (settings: js/devices.js): the reverb unit,
// the stereo room-mic pair and the Zoom F8. Built and wired by
// js/audio-engine.js; every builder returns { inputs, outputs, apply, dispose }.

import { F8, REVERB, micResponse, trackInputs, isLinked } from "./devices.js";
import { HEADROOM_DB, dbToGain } from "./levels.js";
import { popBuffer } from "./graph-kit.js";

const RAMP = 0.03;
// What a mixer (or effects) output carries into another device's input: line
// level, already sitting HEADROOM_DB below full scale. A source's outputDb
// says the same for a source.
export const LINE_OUTPUT_DB = -HEADROOM_DB;

function monoGain(ctx, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  g.channelCount = 1;
  g.channelCountMode = "explicit";
  return g;
}

// Decaying stereo noise: a plain synthetic room. `seconds` is roughly RT60.
export function makeImpulse(ctx, seconds, seed = 1) {
  const len = Math.round(ctx.sampleRate * Math.max(0.3, seconds * 1.2));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    let s = seed * 9301 + c * 49297 + 233280;
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      s = (s * 16807) % 2147483647;
      const n = (s / 2147483647) * 2 - 1;
      lp += 0.35 * (n - lp); // a little darker than white noise
      const t = i / ctx.sampleRate;
      d[i] = lp * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.008);
    }
  }
  return buf;
}

// ---------- reverb unit ----------

export function buildReverb(ctx) {
  const inL = monoGain(ctx);
  const inR = monoGain(ctx);
  const sum = monoGain(ctx, Math.SQRT1_2); // mono in, stereo out
  inL.connect(sum);
  inR.connect(sum);
  const clip = ctx.createWaveShaper();
  clip.curve = new Float32Array([-1, 1]); // keeps a feedback loop bounded
  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = REVERB.preDelayMs / 1000;
  const conv = ctx.createConvolver();
  const split = ctx.createChannelSplitter(2);
  const outL = monoGain(ctx);
  const outR = monoGain(ctx);
  sum.connect(clip).connect(pre).connect(conv).connect(split);
  split.connect(outL, 0);
  split.connect(outR, 1);
  let decay = null;
  let timer = 0;
  const nodes = [inL, inR, sum, clip, pre, conv, split, outL, outR];
  return {
    inputs: { "in-l": inL, "in-r": inR },
    outputs: { "out-l": outL, "out-r": outR },
    apply(dev) {
      if (dev.decay === decay) return;
      const first = decay === null;
      decay = dev.decay;
      clearTimeout(timer);
      const build = () => (conv.buffer = makeImpulse(ctx, decay, 3));
      if (first) build();
      else timer = setTimeout(build, 150); // regenerate once the knob settles
    },
    dispose() {
      clearTimeout(timer);
      for (const n of nodes) n.disconnect();
    },
  };
}

// ---------- stereo room pair ----------

// Each mic hears every band stem at its distance, angle and arrival time, plus
// the room. `link(outs)` connects the stems the transport has loaded.
const ROOM_LEVEL = 0.32; // overall pickup; the source's outputDb sets mic level
const ROOM_WET = 0.22;

export function buildRoomPair(ctx, sourcesById) {
  const outL = monoGain(ctx, ROOM_LEVEL);
  const outR = monoGain(ctx, ROOM_LEVEL);
  const roomIn = monoGain(ctx, ROOM_WET);
  const room = ctx.createConvolver();
  room.buffer = makeImpulse(ctx, 1.8, 7);
  const split = ctx.createChannelSplitter(2);
  roomIn.connect(room).connect(split);
  split.connect(outL, 0);
  split.connect(outR, 1);
  const paths = new Map(); // sourceId → { out, L: {delay, gain}, R: {...} }
  let pair = null;
  const nodes = [outL, outR, roomIn, room, split];

  const setPath = (id, p) => {
    const [l, r] = micResponse(pair, sourcesById[id]);
    for (const [side, resp] of [["L", l], ["R", r]]) {
      p[side].gain.gain.setTargetAtTime(resp.gain, ctx.currentTime, RAMP);
      p[side].delay.delayTime.setTargetAtTime(resp.delay, ctx.currentTime, RAMP);
    }
  };

  return {
    inputs: {},
    outputs: { "out-l": outL, "out-r": outR },
    link(outs) {
      for (const [id, p] of paths) {
        if (outs.get(id) === p.out) continue;
        p.out.disconnect(p.taps);
        paths.delete(id);
      }
      for (const [id, out] of outs) {
        const src = sourcesById[id];
        if (!src || !src.stem || paths.has(id)) continue;
        const taps = monoGain(ctx);
        out.connect(taps);
        const p = { out, taps };
        for (const [side, dest] of [["L", outL], ["R", outR]]) {
          const delay = ctx.createDelay(0.2);
          const gain = monoGain(ctx, 0);
          taps.connect(delay).connect(gain).connect(dest);
          p[side] = { delay, gain };
          nodes.push(delay, gain);
        }
        taps.connect(roomIn);
        nodes.push(taps);
        paths.set(id, p);
        if (pair) setPath(id, p);
      }
    },
    apply(dev) {
      pair = { spacingCm: dev.spacingCm, angleDeg: dev.angleDeg };
      for (const [id, p] of paths) setPath(id, p);
    },
    dispose() {
      for (const p of paths.values()) p.out.disconnect(p.taps);
      for (const n of nodes) n.disconnect();
    },
  };
}

// ---------- Zoom F8 ----------

const CAPTURE_SRC = `
class F8Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.alloc();
    this.port.onmessage = (e) => {
      if (e.data === "start") { this.alloc(); this.on = true; }
      else if (e.data === "stop") { this.flush(); this.on = false; this.port.postMessage({ done: true }); }
    };
  }
  alloc() { this.buf = Array.from({ length: 8 }, () => new Float32Array(16384)); this.n = 0; }
  flush() {
    if (this.n) this.port.postMessage({ chunk: this.buf.map((b) => b.slice(0, this.n)) });
    this.alloc();
  }
  process(inputs) {
    if (this.on) {
      const ch = inputs[0] || [];
      const len = ch[0] ? ch[0].length : 128;
      for (let c = 0; c < 8; c++) if (ch[c]) this.buf[c].set(ch[c], this.n);
      this.n += len;
      if (this.n > 16384 - 128) this.flush();
    }
    return true;
  }
}
registerProcessor("f8-capture", F8Capture);
`;
const workletReady = new WeakMap();
function loadCapture(ctx) {
  if (!workletReady.has(ctx)) {
    const url = URL.createObjectURL(new Blob([CAPTURE_SRC], { type: "text/javascript" }));
    workletReady.set(ctx, ctx.audioWorklet.addModule(url));
  }
  return workletReady.get(ctx);
}

// `onUpdate()` is called when recording starts, stops or a take is added.
export function buildRecorder(ctx, { onUpdate }) {
  const inputs = {};
  const jack = [];
  for (let t = 0; t < F8.tracks; t++) {
    jack[t] = monoGain(ctx);
    inputs[`in${t + 1}`] = jack[t];
  }
  const merger = ctx.createChannelMerger(F8.tracks);
  const hpBus = ctx.createGain();
  const hpLevel = ctx.createGain();
  const phones = ctx.createGain();
  hpBus.connect(hpLevel).connect(phones);
  const playBus = ctx.createGain();
  playBus.connect(hpLevel);
  const clipCurve = new Float32Array([-1, 1]);
  const tracks = [];
  for (let t = 0; t < F8.tracks; t++) {
    const own = monoGain(ctx, 1);
    const dual = monoGain(ctx, 0);
    const pre = monoGain(ctx, 0);
    const popIn = monoGain(ctx);
    const clip = ctx.createWaveShaper();
    clip.curve = clipCurve;
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    meter.smoothingTimeConstant = 0;
    const hp = monoGain(ctx, 0);
    const pan = ctx.createStereoPanner();
    jack[t].connect(own).connect(pre);
    if (t >= 4) jack[t - 4].connect(dual).connect(pre);
    pre.connect(clip);
    popIn.connect(clip);
    clip.connect(meter);
    clip.connect(merger, 0, t);
    clip.connect(hp).connect(pan).connect(hpBus);
    tracks.push({ own, dual, pre, popIn, clip, meter, hp, pan });
  }
  // The capture node has to be pulled to run: a silent link to the speakers.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);

  let capture = null;
  loadCapture(ctx)
    .then(() => {
      capture = new AudioWorkletNode(ctx, "f8-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: F8.tracks, channelCountMode: "explicit", channelInterpretation: "discrete" });
      merger.connect(capture).connect(sink);
      capture.port.onmessage = (e) => onCapture(e.data);
    })
    .catch(() => (runtime.error = "This browser can't record audio here (AudioWorklet unavailable)."));

  const runtime = {
    inputs,
    outputs: {},
    phones,
    tracks,
    takes: [],
    recording: null,
    playing: null,
    error: null,
    dev: null,
    usedBytes: 0,
    apply,
    record,
    stop,
    play,
    pop,
    dispose,
  };

  function apply(dev, rigInfo, sourcesById) {
    runtime.dev = dev;
    runtime.lastInfo = rigInfo;
    runtime.lastSources = sourcesById;
    const map = trackInputs(dev);
    const info = rigInfo || [];
    tracks.forEach((tr, t) => {
      const src = map[t];
      tr.own.gain.setTargetAtTime(src === t ? 1 : 0, ctx.currentTime, RAMP);
      tr.dual.gain.setTargetAtTime(src !== t ? 1 : 0, ctx.currentTime, RAMP);
      const inp = info[src];
      const source = inp && inp.sourceId ? sourcesById[inp.sourceId] : null;
      const level = source ? source.outputDb : LINE_OUTPUT_DB;
      const preDb = inp && inp.connected && inp.signal ? level + (inp.padDb || 0) + dev.tracks[t].trimDb + HEADROOM_DB : -Infinity;
      tr.pre.gain.setTargetAtTime(dbToGain(preDb), ctx.currentTime, RAMP);
      // Headphones: the input tracks (a dual-channel copy would just double them).
      const linked = isLinked(dev, t);
      tr.hp.gain.setTargetAtTime(src === t && !runtime.playing ? 1 : 0, ctx.currentTime, RAMP);
      tr.pan.pan.value = linked ? (t % 2 ? 1 : -1) : 0;
    });
    hpLevel.gain.setTargetAtTime(dev.hpLevel * dev.hpLevel * 1.6, ctx.currentTime, RAMP);
  }

  function pop(t, db) {
    const src = ctx.createBufferSource();
    src.buffer = popBuffer(ctx);
    const g = ctx.createGain();
    g.gain.value = dbToGain(db + (runtime.dev ? runtime.dev.tracks[t].trimDb : 30) + HEADROOM_DB);
    src.connect(g).connect(tracks[t].popIn);
    src.onended = () => g.disconnect();
    src.start();
  }

  function onCapture(msg) {
    const rec = runtime.recording;
    if (msg.chunk && rec) {
      for (const t of rec.tracks) {
        const f = msg.chunk[t];
        const out = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
        rec.data[t].push(out);
      }
      rec.frames += msg.chunk[0].length;
      if (rec.frames / ctx.sampleRate >= F8.maxTakeSeconds) stop();
    }
    if (msg.done && rec && rec.stopping) finishTake(rec);
  }

  async function record() {
    if (runtime.recording || !runtime.dev) return { ok: false, reason: "Already recording." };
    const armed = runtime.dev.tracks.map((t, i) => (t.arm ? i : -1)).filter((i) => i >= 0);
    if (!armed.length) return { ok: false, reason: "Arm at least one track first." };
    if (runtime.error) return { ok: false, reason: runtime.error };
    await loadCapture(ctx);
    if (!capture) return { ok: false, reason: "The recorder is still starting. Try again." };
    stopPlayback();
    runtime.recording = { tracks: armed, data: Object.fromEntries(armed.map((t) => [t, []])), frames: 0, startedAt: ctx.currentTime, stopping: false };
    capture.port.postMessage("start");
    onUpdate();
    return { ok: true };
  }

  function stop() {
    if (runtime.recording && !runtime.recording.stopping) {
      runtime.recording.stopping = true;
      capture.port.postMessage("stop");
    }
    stopPlayback();
  }

  function finishTake(rec) {
    runtime.recording = null;
    const n = runtime.takes.length + 1;
    const take = {
      id: `take-${Date.now().toString(36)}`,
      name: `ZOOM${String(n).padStart(4, "0")}`,
      seconds: rec.frames / ctx.sampleRate,
      tracks: rec.tracks,
      linked: rec.tracks.map((t) => isLinked(runtime.dev, t)),
      rate: ctx.sampleRate,
      data: rec.tracks.map((t) => concat(rec.data[t], rec.frames)),
    };
    runtime.takes.push(take);
    runtime.usedBytes += take.seconds * F8.sampleRate * (F8.bitDepth / 8) * take.tracks.length;
    // Keep the three newest takes' audio; older ones stay listed on the card.
    for (const old of runtime.takes.slice(0, -3)) old.data = null;
    onUpdate();
  }

  function play(takeId) {
    stopPlayback();
    const take = runtime.takes.find((t) => t.id === takeId);
    if (!take || !take.data) return;
    const len = take.data[0].length;
    const buf = ctx.createBuffer(take.data.length, Math.max(1, len), take.rate);
    take.data.forEach((d, c) => {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = d[i] / 32768;
    });
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const split = ctx.createChannelSplitter(take.data.length);
    src.connect(split);
    const pans = take.tracks.map((t, c) => {
      const p = ctx.createStereoPanner();
      p.pan.value = take.linked[c] ? (t % 2 ? 1 : -1) : 0;
      split.connect(p, c);
      p.connect(playBus);
      return p;
    });
    src.onended = () => {
      if (runtime.playing && runtime.playing.src === src) stopPlayback();
    };
    runtime.playing = { takeId, src, split, pans, startedAt: ctx.currentTime, duration: take.seconds };
    src.start();
    if (runtime.dev) apply(runtime.dev, runtime.lastInfo, runtime.lastSources);
    onUpdate();
  }

  function stopPlayback() {
    const p = runtime.playing;
    if (!p) return;
    runtime.playing = null;
    try {
      p.src.stop();
    } catch (e) {
      /* already stopped */
    }
    p.split.disconnect();
    for (const n of p.pans) n.disconnect();
    if (runtime.dev) apply(runtime.dev, runtime.lastInfo, runtime.lastSources);
    onUpdate();
  }

  function dispose() {
    stop();
    const all = [...jack, merger, hpBus, hpLevel, phones, playBus, sink, ...tracks.flatMap((t) => [t.own, t.dual, t.pre, t.popIn, t.clip, t.meter, t.hp, t.pan])];
    if (capture) all.push(capture);
    for (const n of all) n.disconnect();
  }

  return runtime;
}

function concat(chunks, frames) {
  const out = new Int16Array(frames);
  let o = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, Math.min(c.length, frames - o)), o);
    o += c.length;
    if (o >= frames) break;
  }
  return out;
}
