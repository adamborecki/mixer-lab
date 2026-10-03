// Small Web Audio helpers shared by the mixer graphs (graph-generic.js,
// graph-1604.js). A kit remembers every node it makes so a whole mixer can be
// torn down when the student switches to a different mixer.

export const RAMP = 0.012; // seconds; smooths control changes without lag
export const METER_FFT = 1024;

export function nodeKit(ctx) {
  const nodes = [];
  const track = (n) => (nodes.push(n), n);
  const gain = (v = 1, mono = false) => {
    const g = track(ctx.createGain());
    g.gain.value = v;
    if (mono) {
      g.channelCount = 1;
      g.channelCountMode = "explicit";
      g.channelInterpretation = "speakers";
    }
    return g;
  };
  const stereoGain = (v = 1) => {
    const g = track(ctx.createGain());
    g.gain.value = v;
    g.channelCount = 2;
    g.channelCountMode = "explicit";
    g.channelInterpretation = "speakers";
    return g;
  };
  const analyser = () => {
    const a = track(ctx.createAnalyser());
    a.fftSize = METER_FFT;
    a.smoothingTimeConstant = 0;
    return a;
  };
  return {
    ctx,
    nodes,
    track,
    gain,
    stereoGain,
    analyser,
    // `tau`: a slower approach than RAMP, e.g. phantom power charging up.
    set: (param, value, tau = RAMP) => param.setTargetAtTime(value, ctx.currentTime, tau),
    dispose() {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch (e) {
          /* already disconnected */
        }
      }
      nodes.length = 0;
    },
  };
}

// A console's "12 kHz shelf" is quoted where the boost is (nearly) all there.
// A Web Audio shelf's frequency is its half-gain point, about an octave short
// of that, so the filter sits an octave inside the printed frequency: 6 kHz
// for a 12 kHz HI shelf, 160 Hz for an 80 Hz LOW shelf. Without this the boost
// lands where the stems (and laptop speakers) have almost nothing.
export function shelfHz(type, hz) {
  if (type === "highshelf") return hz / 2;
  if (type === "lowshelf") return hz * 2;
  return hz;
}

// A phantom-power pop: a hard step that decays, with a short click on top.
// Low cut and the speakers turn the step into a thump. One buffer per context.
const popBuffers = new WeakMap();
export function popBuffer(ctx) {
  if (popBuffers.has(ctx)) return popBuffers.get(ctx);
  const n = Math.round(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    d[i] = Math.exp(-t / 0.07) + (t < 0.004 ? noise() * 0.6 : 0);
  }
  popBuffers.set(ctx, buf);
  return buf;
}

// First-order high-pass (6 dB/octave) by the bilinear transform; with the
// 12 dB/octave biquad before it, the low cut falls at 18 dB/octave.
export function onePoleHighpass(ctx, hz) {
  const k = Math.tan((Math.PI * hz) / ctx.sampleRate);
  return ctx.createIIRFilter([1 / (1 + k), -1 / (1 + k)], [1, (k - 1) / (k + 1)]);
}

// Channel LOW CUT, after the CR1604-VLZ: 75 Hz, 18 dB/octave (2nd + 1st order).
// Always in the graph: the switch crossfades a dry and a filtered path, so
// nothing is rebuilt and playback is never touched. Returns { out, dry, wet }.
export const LOW_CUT_HZ = 75;
export function lowCutStage(kit, from, chan) {
  const { ctx } = kit;
  const out = chan(1);
  const dry = chan(1);
  const wet = chan(0);
  const hp2 = kit.track(ctx.createBiquadFilter());
  hp2.type = "highpass";
  hp2.frequency.value = LOW_CUT_HZ;
  hp2.Q.value = Math.SQRT1_2;
  const hp1 = kit.track(onePoleHighpass(ctx, LOW_CUT_HZ));
  from.connect(dry).connect(out);
  from.connect(hp2).connect(hp1).connect(wet).connect(out);
  return { out, dry, wet };
}
