// Audio graph of the generic mixer that Mixer A and Mixer B draw. Built by
// js/audio-engine.js; reads only semantic state. See docs/AUDIO_ENGINE.md.
//
//   channel input ─► preamp gain ─► clipper ─► low cut ─► tap
//   tap ─► input meter
//   tap ─► enabled ─► fader ─► pan ─► Main bus ─► Main master ─► Main L / Main R outs
//   tap ─► Aux 1 send (pre-fader) ─► Aux 1 bus ─► Aux 1 master ─► Aux 1 out
//   tap ─► Aux 2 send (pre-fader) ─► Aux 2 bus ─► Aux 2 master ─► Aux 2 out
//   tap ─► PFL switch ─► PFL bus ─► phones level ─► listening ("pfl")

import { BUSES, CHANNEL_COUNT, CHANNEL_LAYOUT, HEADROOM_DB, dbToGain, levelToDb } from "./mixer-state.js";
import { lowCutStage } from "./graph-kit.js";

export function buildGenericGraph(kit) {
  const { ctx, gain, stereoGain, analyser } = kit;
  const meters = {};

  // Main L/R
  const mainBus = gain(1);
  mainBus.channelCount = 2;
  mainBus.channelCountMode = "explicit";
  const mainMaster = gain(1);
  mainBus.connect(mainMaster);
  const split = kit.track(ctx.createChannelSplitter(2));
  mainMaster.connect(split);
  const mainL = gain(1, true);
  const mainR = gain(1, true);
  split.connect(mainL, 0);
  split.connect(mainR, 1);
  const outputs = { "main-l": mainL, "main-r": mainR };
  meters.mainL = analyser();
  meters.mainR = analyser();
  mainL.connect(meters.mainL);
  mainR.connect(meters.mainR);

  // Aux buses: bus → master → out
  const auxBus = {};
  const auxMaster = {};
  for (const b of BUSES) {
    auxBus[b] = gain(1, true);
    auxMaster[b] = gain(1, true);
    auxBus[b].connect(auxMaster[b]);
    outputs[b] = auxMaster[b];
    meters[b] = analyser();
    auxMaster[b].connect(meters[b]);
  }

  // PFL
  const pflBus = gain(1, true);
  const phones = gain(1, true);
  pflBus.connect(phones);
  meters.pfl = analyser();
  pflBus.connect(meters.pfl);

  // Channel strips
  const strips = [];
  const clipCurve = new Float32Array([-1, 1]); // identity inside ±1, hard clip outside
  for (let i = 0; i < CHANNEL_COUNT; i++) {
    // A stereo strip is one strip: same controls, but every stage carries L and R.
    const stereo = !!CHANNEL_LAYOUT[i].stereo;
    const chan = stereo ? stereoGain : (v) => gain(v, true);
    const input = chan(1);
    const pre = chan(0);
    const clip = kit.track(ctx.createWaveShaper());
    clip.curve = clipCurve;
    const meter = analyser();
    const enabled = chan(1);
    const fader = chan(0);
    const pan = stereo ? null : kit.track(ctx.createStereoPanner()); // stereo: left stays left, right stays right
    const pfl = gain(0, true);
    input.connect(pre).connect(clip);
    const lowCut = lowCutStage(kit, clip, chan);
    const tap = lowCut.out;
    tap.connect(meter);
    tap.connect(enabled).connect(fader);
    if (pan) fader.connect(pan).connect(mainBus);
    else fader.connect(mainBus);
    const sends = {};
    for (const b of BUSES) {
      sends[b] = gain(0, true);
      tap.connect(sends[b]).connect(auxBus[b]); // pre-fader
    }
    tap.connect(pfl).connect(pflBus);
    strips.push({ input, pre, clip, lowCut, meter, enabled, fader, pan, sends, pfl, stereo });
  }

  return {
    strips,
    outputs,
    phones, // what the engineer's headphones carry
    phonesDest: "pfl",

    apply(state, rig, SOURCES_BY_ID) {
      const set = kit.set;
      state.channels.forEach((ch, i) => {
        const s = strips[i];
        const info = rig.channels[i];
        const source = info && info.sourceId ? SOURCES_BY_ID[info.sourceId] : null;
        // Everything before the preamp is folded into one gain: how hot the
        // source is, the line-input pad, the gain knob, and fixed headroom.
        const preDb = source && info.signal ? source.outputDb + (info.padDb || 0) + ch.gainDb + HEADROOM_DB : -Infinity;
        set(s.pre.gain, dbToGain(preDb));
        set(s.lowCut.dry.gain, ch.lowCut ? 0 : 1);
        set(s.lowCut.wet.gain, ch.lowCut ? 1 : 0);
        set(s.enabled.gain, ch.enabled ? 1 : 0);
        set(s.fader.gain, dbToGain(levelToDb(ch.level)));
        if (s.pan) set(s.pan.pan, ch.pan);
        for (const b of BUSES) set(s.sends[b].gain, dbToGain(levelToDb(ch.auxSends[b])));
        set(s.pfl.gain, ch.pfl ? 1 : 0);
      });
      set(mainMaster.gain, dbToGain(levelToDb(state.main.level)));
      for (const b of BUSES) set(auxMaster[b].gain, dbToGain(levelToDb(state[b].level)));
      set(phones.gain, dbToGain(levelToDb(state.headphones.level)));
    },

    readMeters(read) {
      const out = { channels: strips.map((s) => read(s.meter)) };
      for (const k of Object.keys(meters)) out[k] = read(meters[k]);
      return out;
    },
  };
}
