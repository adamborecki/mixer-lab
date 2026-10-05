// Audio graph of a compact mixer, built from its definition (js/compact-defs.js;
// state and level model: js/compact.js). Every switch is a gain the state sets.
//
// Channel:  input ─► gain stage ─► clipper ─► LOW CUT/HPF ─► [COMP] ─► EQ ─► eq tap
//           eq tap ─► PEAK LED, PFL solo, pre-fader sends, Yamaha insert
//           eq tap ─► [ST/MONO] ─► LEVEL ─► MUTE ─► post tap ─► PAN/BAL ─► MAIN L/R
//                                           └► ALT (muted, 1202) ─► PAN ─► ALT L/R
//           post tap ─► post-fader sends (and the STAGEPAS reverb)
//           LEVEL ─► Xenyx FX send (MUTE doesn't cut it); LEVEL ─► PAN ─► SOLO in place
// Masters:  MAIN ─► [STAGEPAS: MASTER EQ, sub HPF, amp] ─► outputs; aux masters;
//           returns; tape; C-R/PHONES (SOURCE, replaced by SOLO); meters.
// Xenyx:    AUX SEND 2 ─► built-in effects ─► STEREO AUX RETURN 2 (unless its jacks are used).
// Ui16:     … HPF ─► COMP ─► 4-band PEQ; MUTE before the pre sends too; AUX PRE/POST per send;
//           REVERB / DELAY / CHORUS buses ─► built-in effects ─► return level ─► MAIN.
// 442:      input ─► Ø ─► GAIN (MIC/LINE) ─► HPF sweep ─► input limiter ─► fader ─► PAN;
//           MASTER ─► output limiter (ON / LINK) ─► [TONE replaces the mix] ─► XLR OUTPUT LEVEL;
//           HEADPHONE selector OFF/L/R/M/ST (PFL replaces it; TONE ear-saver −20 dB).

import { EQ_FOR, LAWS, compIsOn, peqBands, eqIsOn, hpfHz, channelControl, channelGainDb, muteCutsPre, fxPreset, levelLaw, linkOf, reverbSetting, tapeIndex } from "./compact.js";
import { HEADROOM_DB, dbToGain } from "./levels.js";
import { DEVICE_TYPES } from "./connection-model.js";
import { lowCutStage, popBuffer, shelfHz } from "./graph-kit.js";
import { makeImpulse } from "./outboard-audio.js";

const MID_Q = 0.9;

export function buildCompactGraph(kit, def) {
  const { ctx, gain, stereoGain, analyser } = kit;
  const mono = (v = 1) => gain(v, true);
  const pair = (v = 1) => ({ L: mono(v), R: mono(v) });
  const track = kit.track;
  const outputs = {};
  const inputs = {};
  const busIds = Object.keys(def.buses);

  // ---------- buses ----------
  const mainBus = pair();
  const mainMaster = pair(0);
  mainBus.L.connect(mainMaster.L);
  mainBus.R.connect(mainMaster.R);
  const auxBus = Object.fromEntries(busIds.map((b) => [b, mono()]));
  const auxMaster = {};
  for (const b of busIds) {
    auxMaster[b] = mono(1);
    auxBus[b].connect(auxMaster[b]);
    if (!def.buses[b].fx) outputs[b] = auxMaster[b];
  }
  const altBus = def.alt ? pair() : null;
  const pflBus = mono();
  const sipBus = pair();
  const mcBus = def.mc ? mono() : null; // MONO/CENTER (full X32) // SOLO in place (Xenyx MODE up)
  const reverbBus = def.reverb ? mono() : null;

  // ---------- channels ----------
  const clipCurve = new Float32Array([-1, 1]);
  const strips = def.channels.map((c, i) => {
    const stereo = c.kind === "stereo";
    const chan = stereo ? stereoGain : mono;
    const input = chan(1);
    const pre = chan(0);
    const clip = track(ctx.createWaveShaper());
    clip.curve = clipCurve;
    const popIn = mono(1);
    const polarity = c.polarity ? chan(1) : null; // Ø: a gain of −1
    if (polarity) input.connect(polarity).connect(pre).connect(clip);
    else input.connect(pre).connect(clip);
    popIn.connect(clip);
    let afterCut = clip;
    let lowCut = null;
    if (c.lowCut && c.lowCut.order === 3) {
      lowCut = lowCutStage(kit, clip, chan);
      afterCut = lowCut.out;
    } else if (c.lowCut) {
      const hp = track(ctx.createBiquadFilter());
      hp.type = "highpass";
      hp.frequency.value = c.lowCut.hz;
      hp.Q.value = Math.SQRT1_2;
      const out = chan(1);
      const dry = chan(1);
      const wet = chan(0);
      clip.connect(dry).connect(out);
      clip.connect(hp).connect(wet).connect(out);
      lowCut = { out, dry, wet };
      afterCut = out;
    }
    // Sweepable high-pass (442): 12 dB/oct, off at the detent.
    let hpf = null;
    if (c.hpf) {
      const hp = track(ctx.createBiquadFilter());
      hp.type = "highpass";
      hp.frequency.value = c.hpf.min;
      hp.Q.value = 0.6;
      const out = chan(1);
      const dry = chan(1);
      const wet = chan(0);
      afterCut.connect(dry).connect(out);
      afterCut.connect(hp).connect(wet).connect(out);
      hpf = { hp, dry, wet };
      afterCut = out;
    }
    // Input limiter (442): a safety limiter just under clipping, on while LIM is.
    let limiter = null;
    if (c.limiter) {
      const dyn = track(ctx.createDynamicsCompressor());
      dyn.threshold.value = -4;
      dyn.knee.value = 0;
      dyn.ratio.value = 20;
      dyn.attack.value = 0.001;
      dyn.release.value = 0.1;
      const out = chan(1);
      const dry = chan(1);
      const wet = chan(0);
      afterCut.connect(dry).connect(out);
      afterCut.connect(dyn).connect(wet).connect(out);
      limiter = { dyn, dry, wet };
      afterCut = out;
    }
    // One-knob compressor (Xenyx) or THRESHOLD/RATIO/GAIN (Ui16): bypassed until used.
    let comp = null;
    if (c.comp || c.dyn) {
      const dyn = track(ctx.createDynamicsCompressor());
      dyn.knee.value = 6;
      dyn.attack.value = 0.003;
      dyn.release.value = 0.15;
      const dry = chan(1);
      const wet = chan(0);
      const makeup = chan(1);
      const out = chan(1);
      afterCut.connect(dry).connect(out);
      afterCut.connect(dyn).connect(makeup).connect(wet).connect(out);
      comp = { dyn, dry, wet, makeup };
      afterCut = out;
    }
    const eq = {};
    let node = afterCut;
    const peq = {};
    if (c.peq) {
      for (const band of peqBands(def)) {
        const f = track(ctx.createBiquadFilter());
        f.type = band.type;
        f.frequency.value = shelfHz(band.type, band.freq);
        if (band.q) f.Q.value = band.q;
        f.gain.value = 0;
        node.connect(f);
        node = f;
        peq[band.id] = f;
      }
    }
    for (const band of EQ_FOR(c.eq)) {
      const f = track(ctx.createBiquadFilter());
      f.type = band.type;
      f.frequency.value = shelfHz(band.type, band.hz);
      if (band.type === "peaking") f.Q.value = MID_Q;
      f.gain.value = 0;
      node.connect(f);
      node = f;
      eq[band.id] = f;
    }
    const tapEq = chan(1);
    node.connect(tapEq);
    const meter = analyser();
    tapEq.connect(meter);
    if (c.insert) outputs[`ch${i + 1}-insert`] = c.insert === "trim" ? clip : tapEq;

    // ST/MONO (STAGEPAS): both sides summed to mono.
    let toLevel = tapEq;
    let stMono = null;
    if (c.stMono) {
      const st = stereoGain(1);
      const sum = mono(0); // a mono node downmixes L+R; the next stereo node spreads it again
      const spread = stereoGain(1);
      tapEq.connect(st);
      tapEq.connect(sum).connect(spread);
      toLevel = stereoGain(1);
      st.connect(toLevel);
      spread.connect(toLevel);
      stMono = { st, sum };
    }
    const level = chan(0);
    toLevel.connect(level);
    // With `muteCutsPre` the pre-fader sends come after the MUTE (Ui16).
    const preMute = def.muteCutsPre || def.prePoint ? chan(1) : null;
    if (preMute) tapEq.connect(preMute);
    const preTap = preMute || tapEq;
    const mainGate = chan(1);
    level.connect(mainGate);
    const post = mainGate;
    const pan = track(ctx.createStereoPanner());
    // MAIN LR switch (X32): after the post-fader sends, before the main mix.
    const lrGate = def.lrSwitch ? chan(1) : null;
    if (lrGate) post.connect(lrGate).connect(pan);
    else post.connect(pan);
    const split = track(ctx.createChannelSplitter(2));
    pan.connect(split);
    split.connect(mainBus.L, 0);
    split.connect(mainBus.R, 1);
    // SOLO in place: after LEVEL and PAN, before MUTE.
    let sip = null;
    if (c.solo && def.solo.mode === "switch") {
      const sipPan = track(ctx.createStereoPanner());
      level.connect(sipPan);
      const s3 = track(ctx.createChannelSplitter(2));
      sipPan.connect(s3);
      sip = { pan: sipPan, gate: pair(0) };
      s3.connect(sip.gate.L, 0);
      s3.connect(sip.gate.R, 1);
      sip.gate.L.connect(sipBus.L);
      sip.gate.R.connect(sipBus.R);
    }
    let altGate = null;
    let altPan = null;
    if (c.mute === "alt") {
      altGate = chan(0);
      level.connect(altGate);
      altPan = track(ctx.createStereoPanner());
      altGate.connect(altPan);
      const s2 = track(ctx.createChannelSplitter(2));
      altPan.connect(s2);
      s2.connect(altBus.L, 0);
      s2.connect(altBus.R, 1);
    }

    // Sends: a gain from each tap point (stereo channels send L+R in mono).
    const sends = {};
    for (const sid of c.sends || []) {
      const s = def.sends[sid];
      if (s.bipolar) {
        sends[sid] = { left: mono(0), right: mono(0) };
        (s.bipolar.left.tap === "pre" ? tapEq : post).connect(sends[sid].left).connect(auxBus[s.bipolar.left.bus]);
        (s.bipolar.right.tap === "pre" ? tapEq : post).connect(sends[sid].right).connect(auxBus[s.bipolar.right.bus]);
      } else {
        const dest = s.bus === "reverb" ? reverbBus : auxBus[s.bus];
        sends[sid] = { pre: mono(0), post: mono(0) };
        preTap.connect(sends[sid].pre).connect(dest);
        (s.tap === "fader" ? level : post).connect(sends[sid].post).connect(dest);
      }
    }
    let mcSend = null;
    if (mcBus) {
      mcSend = mono(0);
      post.connect(mcSend).connect(mcBus);
    }
    const pfl = mono(0);
    if (c.solo) tapEq.connect(pfl).connect(pflBus);
    return { input, pre, popIn, polarity, hpf, limiter, lowCut, comp, peq, preMute, lrGate, mcSend, eq, meter, stMono, level, mainGate, pan, sip, altGate, altPan, sends, pflGain: c.solo ? pfl : null, stereo };
  });

  // ---------- tape in ----------
  let tape = null;
  if (def.tape) {
    tape = { input: stereoGain(1), pre: stereoGain(0), level: stereoGain(1), toMain: pair(0), toCr: pair(0), side: pair() };
    tape.input.connect(tape.pre).connect(tape.level);
    const s = track(ctx.createChannelSplitter(2));
    tape.level.connect(s);
    s.connect(tape.side.L, 0);
    s.connect(tape.side.R, 1);
    tape.side.L.connect(tape.toMain.L).connect(mainBus.L);
    tape.side.R.connect(tape.toMain.R).connect(mainBus.R);
    strips[tapeIndex(def)] = tape;
  }

  // ---------- returns ----------
  const returns = {};
  for (const r of def.returns || []) {
    const ret = { inL: mono(1), inR: mono(1), normal: mono(0), side: pair(), level: pair(1) };
    inputs[`${r.id}-l`] = ret.inL;
    inputs[`${r.id}-r`] = ret.inR;
    ret.inL.connect(ret.side.L);
    ret.inR.connect(ret.side.R);
    ret.inL.connect(ret.normal).connect(ret.side.R);
    ret.side.L.connect(ret.level.L);
    ret.side.R.connect(ret.level.R);
    // RETURN 2 on the Xenyx goes to MAIN MIX or (switch pressed) ALT 3-4.
    ret.toMain = pair(1);
    ret.level.L.connect(ret.toMain.L).connect(mainBus.L);
    ret.level.R.connect(ret.toMain.R).connect(mainBus.R);
    if (r.toAlt) {
      ret.toAlt = pair(0);
      ret.level.L.connect(ret.toAlt.L).connect(altBus.L);
      ret.level.R.connect(ret.toAlt.R).connect(altBus.R);
    }
    // STEREO AUX RETURN MON: the return into a monitor send (Xenyx).
    if (r.toMonitor) {
      ret.mon = mono(0);
      ret.side.L.connect(ret.mon);
      ret.side.R.connect(ret.mon);
      ret.mon.connect(auxBus[r.toMonitor.bus]);
    }
    if (r.efxToMonitor) {
      ret.efx = mono(0);
      ret.level.L.connect(ret.efx);
      ret.level.R.connect(ret.efx);
      ret.efx.connect(auxBus[r.efxToMonitor]);
    }
    returns[r.id] = ret;
  }

  // ---------- Ui16 effects buses: send ─► unit ─► return level ─► MAIN ----------
  const fxBuses = {};
  for (const b of busIds) {
    const fxDef = def.buses[b].fx;
    if (!fxDef) continue;
    const unit = buildFxUnit(kit);
    auxBus[b].disconnect();
    auxBus[b].connect(unit.input);
    const ret = pair(0);
    unit.out.L.connect(ret.L).connect(mainBus.L);
    unit.out.R.connect(ret.R).connect(mainBus.R);
    unit.setPreset(fxDef);
    // L-20: the effect also returns into each monitor mix, at that mix's own EFX RTN level.
    const to = {};
    for (const t of def.buses[b].returnsTo || []) {
      to[t] = mono(0);
      unit.out.L.connect(to[t]);
      unit.out.R.connect(to[t]);
      to[t].connect(auxBus[t]);
    }
    fxBuses[b] = { unit, ret, to };
  }

  // ---------- Xenyx built-in effects ----------
  let fx = null;
  if (def.fx) {
    fx = buildFxUnit(kit);
    auxMaster[def.fx.send].connect(fx.input);
    const ret = returns[def.fx.ret];
    fx.gate = pair(1); // muted once a plug is in the RETURN 2 jacks
    fx.out.L.connect(fx.gate.L).connect(ret.side.L);
    fx.out.R.connect(fx.gate.R).connect(ret.side.R);
    fx.meter = analyser();
    fx.input.connect(fx.meter);
  }

  // ---------- STAGEPAS reverb ----------
  let reverb = null;
  if (def.reverb) {
    const conv = track(ctx.createConvolver());
    const gate = mono(0);
    const split = track(ctx.createChannelSplitter(2));
    reverbBus.connect(gate).connect(conv).connect(split);
    split.connect(mainBus.L, 0);
    split.connect(mainBus.R, 1);
    reverb = { conv, gate, key: "" };
  }

  // ---------- ALT 3-4 ----------
  let altToMain = null;
  let altOut = altBus;
  if (altBus && def.alt.fader) {
    altOut = pair(0);
    altBus.L.connect(altOut.L);
    altBus.R.connect(altOut.R);
  }
  if (altBus) {
    outputs["alt-l"] = altOut.L;
    outputs["alt-r"] = altOut.R;
    altToMain = pair(0);
    altBus.L.connect(altToMain.L).connect(mainBus.L);
    altBus.R.connect(altToMain.R).connect(mainBus.R);
  }

  // ---------- main outputs ----------
  let masterOut = mainMaster;
  let masterEq = null;
  let spkHp = null;
  let monitor = null;
  if (def.masterEq) {
    // One knob: SPEECH (lows cut) … MUSIC (flat) … bass boost.
    masterEq = {};
    for (const side of ["L", "R"]) {
      const lo = track(ctx.createBiquadFilter());
      lo.type = "lowshelf";
      lo.frequency.value = 120;
      const hi = track(ctx.createBiquadFilter());
      hi.type = "highshelf";
      hi.frequency.value = 6000;
      masterEq[side] = { lo, hi };
    }
    const eqOut = pair();
    mainMaster.L.connect(masterEq.L.lo).connect(masterEq.L.hi).connect(eqOut.L);
    mainMaster.R.connect(masterEq.R.lo).connect(masterEq.R.hi).connect(eqOut.R);
    masterOut = eqOut;
  }
  // MAIN EQ (B207MP3): a 3-band EQ on the whole box, after MAIN LEVEL.
  let mainEq = null;
  if (def.mainEq) {
    mainEq = {};
    const eqOut = pair();
    for (const side of ["L", "R"]) {
      let node = masterOut[side];
      mainEq[side] = {};
      for (const band of EQ_FOR(def.mainEq)) {
        const f = track(ctx.createBiquadFilter());
        f.type = band.type;
        f.frequency.value = band.hz;
        if (band.type === "peaking") f.Q.value = 0.9;
        mainEq[side][band.id] = f;
        node = node.connect(f);
      }
      node.connect(eqOut[side]);
    }
    masterOut = eqOut;
  }
  // Output limiter (442): ON = two limiters, LINK = one stereo limiter (same gain change both sides).
  let outLim = null;
  if (def.outputLimiter) {
    const mk = (channels) => {
      const d = track(ctx.createDynamicsCompressor());
      d.threshold.value = def.outputLimiter.thresholdDb;
      d.knee.value = 0;
      d.ratio.value = 20;
      d.attack.value = 0.001;
      d.release.value = 0.15;
      d.channelCount = channels;
      d.channelCountMode = "explicit";
      return d;
    };
    outLim = { L: mk(1), R: mk(1), st: mk(2), off: pair(1), on: pair(0), link: pair(0), out: pair() };
    const merge = track(ctx.createChannelMerger(2));
    const split = track(ctx.createChannelSplitter(2));
    masterOut.L.connect(outLim.off.L).connect(outLim.out.L);
    masterOut.R.connect(outLim.off.R).connect(outLim.out.R);
    masterOut.L.connect(outLim.L).connect(outLim.on.L).connect(outLim.out.L);
    masterOut.R.connect(outLim.R).connect(outLim.on.R).connect(outLim.out.R);
    masterOut.L.connect(merge, 0, 0);
    masterOut.R.connect(merge, 0, 1);
    merge.connect(outLim.st).connect(split);
    split.connect(outLim.link.L, 0);
    split.connect(outLim.link.R, 1);
    outLim.link.L.connect(outLim.out.L);
    outLim.link.R.connect(outLim.out.R);
    masterOut = outLim.out;
  }
  // TONE (442): a 1 kHz sine at 0 dBu (−18 dBFS here) replaces the mix on the outputs.
  let tone = null;
  if (def.tone) {
    const osc = track(ctx.createOscillator());
    osc.frequency.value = def.tone.hz;
    osc.start();
    tone = { osc, level: mono(0), program: pair(1), out: pair() };
    osc.connect(tone.level);
    tone.level.connect(tone.out.L);
    tone.level.connect(tone.out.R);
    masterOut.L.connect(tone.program.L).connect(tone.out.L);
    masterOut.R.connect(tone.program.R).connect(tone.out.R);
    masterOut = tone.out;
  }

  if (def.outputs.includes("speakers")) {
    // With a sub patched, the speakers lose everything below 120 Hz.
    spkHp = { gateHp: pair(0), gateFull: pair(1), out: pair() };
    for (const side of ["L", "R"]) {
      const hp = track(ctx.createBiquadFilter());
      hp.type = "highpass";
      hp.frequency.value = def.subOut.hz;
      masterOut[side].connect(spkHp.gateFull[side]).connect(spkHp.out[side]);
      masterOut[side].connect(hp).connect(spkHp.gateHp[side]).connect(spkHp.out[side]);
    }
    outputs["spk-l"] = spkHp.out.L;
    outputs["spk-r"] = spkHp.out.R;
    const sub = mono(0.5);
    const lp = track(ctx.createBiquadFilter());
    lp.type = "lowpass";
    lp.frequency.value = def.subOut.hz;
    masterOut.L.connect(sub);
    masterOut.R.connect(sub);
    sub.connect(lp);
    outputs["sub-out"] = lp;
  }
  if (def.outputs.includes("builtIn")) {
    // The box's own speaker (B207MP3): one speaker, so left and right summed.
    const spk = mono(Math.SQRT1_2);
    masterOut.L.connect(spk);
    masterOut.R.connect(spk);
    outputs.spk = spk;
  }
  let thru = null;
  if (def.thru) {
    // THRU: the mix before MAIN LEVEL and the EQ, at its own LEVEL, mono.
    thru = mono(1);
    mainBus.L.connect(thru);
    mainBus.R.connect(thru);
    outputs.thru = thru;
  }
  if (def.monitorOut) {
    // A mix of the channels (and reverb), before MASTER LEVEL.
    monitor = pair(0);
    mainBus.L.connect(monitor.L);
    mainBus.R.connect(monitor.R);
    outputs["mon-l"] = monitor.L;
    outputs["mon-r"] = monitor.R;
  }
  let xlr = null;
  let switched = null;
  if (def.outputs.includes("xlrSwitched")) {
    // OUTPUT LEVEL: LINE, −10 (14 dB down) or MIC (40 dB down).
    switched = pair(1);
    masterOut.L.connect(switched.L);
    masterOut.R.connect(switched.R);
    outputs["main-l"] = switched.L;
    outputs["main-r"] = switched.R;
  }
  if (def.outputs.includes("tapeMini")) {
    const tape = pair(dbToGain(-14));
    masterOut.L.connect(tape.L);
    masterOut.R.connect(tape.R);
    const m = track(ctx.createChannelMerger(2));
    tape.L.connect(m, 0, 0);
    tape.R.connect(m, 0, 1);
    outputs["tape-mini"] = m;
  }
  // Zoom F8n SUB OUT: the L/R mix on a stereo 3.5 mm jack, at NORMAL or MIC level.
  let f8sub = null;
  if (def.outputs.includes("f8")) {
    f8sub = pair(1);
    masterOut.L.connect(f8sub.L);
    masterOut.R.connect(f8sub.R);
    const m = track(ctx.createChannelMerger(2));
    f8sub.L.connect(m, 0, 0);
    f8sub.R.connect(m, 0, 1);
    outputs["sub-out"] = m;
  }
  if (def.outputs.includes("mainXlr")) {
    xlr = pair(1); // the XLR outs have a 30 dB PAD switch
    masterOut.L.connect(xlr.L);
    masterOut.R.connect(xlr.R);
    outputs["main-l"] = xlr.L;
    outputs["main-r"] = xlr.R;
    outputs["line-l"] = masterOut.L;
    outputs["line-r"] = masterOut.R;
  } else if (def.outputs.includes("main") || def.outputs.includes("mainXlrOnly")) {
    outputs["main-l"] = masterOut.L;
    outputs["main-r"] = masterOut.R;
  }
  for (const k of ["tape-out", "rec-out"]) {
    outputs[`${k}-l`] = masterOut.L;
    outputs[`${k}-r`] = masterOut.R;
  }

  // ---------- full X32: subgroups, M/C, matrices, output routing ----------
  const busToMain = {};
  if (def.busToMain) {
    for (const b of busIds) {
      if (def.buses[b].fx) continue;
      const gate = mono(0);
      const panner = track(ctx.createStereoPanner());
      const split = track(ctx.createChannelSplitter(2));
      auxMaster[b].connect(gate).connect(panner).connect(split);
      split.connect(mainBus.L, 0);
      split.connect(mainBus.R, 1);
      busToMain[b] = { gate, panner };
    }
  }
  let mcMaster = null;
  if (mcBus) {
    mcMaster = mono(1);
    mcBus.connect(mcMaster);
  }
  const matrices = [];
  for (let k = 1; k <= (def.matrix || 0); k++) {
    const bus = mono();
    const master = mono(1);
    bus.connect(master);
    const sends = {};
    const feed = (src, node, g = 1) => {
      const s = mono(0);
      node.connect(s).connect(bus);
      (sends[src] ||= []).push({ s, g });
    };
    feed("main", masterOut.L, 0.5);
    feed("main", masterOut.R, 0.5);
    if (mcMaster) feed("mc", mcMaster);
    for (const b of busIds) if (!def.buses[b].fx) feed(b, auxMaster[b]);
    matrices.push({ id: `mtx${k}`, master, sends });
  }
  // XLR OUT 1–16 carry whatever the ROUTING page patches to them.
  // A jack that carries the whole MASTER mix (L-20 MONITOR OUT on MASTER): both sides, summed at half each.
  const mainMono = def.routing ? mono(1) : null;
  if (mainMono) {
    masterOut.L.connect(mono(0.5)).connect(mainMono);
    masterOut.R.connect(mono(0.5)).connect(mainMono);
  }
  const routeSources = def.routing
    ? { "main-l": masterOut.L, "main-r": masterOut.R, main: mainMono, ...(mcMaster ? { mc: mcMaster } : {}), ...Object.fromEntries(busIds.filter((b) => !def.buses[b].fx).map((b) => [b, auxMaster[b]])), ...Object.fromEntries(matrices.map((m) => [m.id, m.master])) }
    : null;
  const routed = {};
  if (def.routing) {
    for (const o of def.routing.outputs) {
      outputs[o] = mono(1);
      routed[o] = null;
    }
    for (const b of busIds) delete outputs[b];
  }

  // ---------- C-R / PHONES ----------
  const crSum = pair();
  const selector = !!def.phones?.selector;
  const selMain = pair(def.phones && !def.phones.sources && !selector ? 1 : 0);
  masterOut.L.connect(selMain.L).connect(crSum.L);
  masterOut.R.connect(selMain.R).connect(crSum.R);
  // HEADPHONE selector (442): which output goes to which ear.
  let hpMatrix = null;
  if (selector) {
    hpMatrix = { LL: mono(0), RL: mono(0), LR: mono(0), RR: mono(0) };
    masterOut.L.connect(hpMatrix.LL).connect(crSum.L);
    masterOut.R.connect(hpMatrix.RL).connect(crSum.L);
    masterOut.L.connect(hpMatrix.LR).connect(crSum.R);
    masterOut.R.connect(hpMatrix.RR).connect(crSum.R);
  }
  const selAlt = pair(0);
  if (altBus) {
    altOut.L.connect(selAlt.L).connect(crSum.L);
    altOut.R.connect(selAlt.R).connect(crSum.R);
  }
  if (tape) {
    tape.side.L.connect(tape.toCr.L).connect(crSum.L);
    tape.side.R.connect(tape.toCr.R).connect(crSum.R);
  }
  const crGate = pair(1);
  crSum.L.connect(crGate.L);
  crSum.R.connect(crGate.R);
  const crLevel = pair(def.phones ? 1 : 0);
  crGate.L.connect(crLevel.L);
  crGate.R.connect(crLevel.R);
  pflBus.connect(crLevel.L);
  pflBus.connect(crLevel.R);
  sipBus.L.connect(crLevel.L);
  sipBus.R.connect(crLevel.R);
  // AUX SOLO (Xenyx): an aux send's master into the phones and meters.
  const auxSolo = {};
  for (const b of busIds) {
    if (!def.buses[b].solo) continue;
    auxSolo[b] = mono(0);
    auxMaster[b].connect(auxSolo[b]);
    auxSolo[b].connect(crLevel.L);
    auxSolo[b].connect(crLevel.R);
  }
  if (def.outputs.includes("cr")) {
    outputs["cr-l"] = crLevel.L;
    outputs["cr-r"] = crLevel.R;
  }
  const phones = track(ctx.createChannelMerger(2));
  crLevel.L.connect(phones, 0, 0);
  crLevel.R.connect(phones, 0, 1);

  // ---------- meters ----------
  const meterIn = pair();
  const mainMeterGate = pair(1);
  masterOut.L.connect(mainMeterGate.L).connect(meterIn.L);
  masterOut.R.connect(mainMeterGate.R).connect(meterIn.R);
  const soloMeter = mono(0);
  pflBus.connect(soloMeter);
  for (const g of Object.values(auxSolo)) g.connect(soloMeter);
  soloMeter.connect(meterIn.L);
  soloMeter.connect(meterIn.R);
  const sipMeter = pair(0);
  sipBus.L.connect(sipMeter.L).connect(meterIn.L);
  sipBus.R.connect(sipMeter.R).connect(meterIn.R);
  const meters = { left: analyser(), right: analyser() };
  meterIn.L.connect(meters.left);
  meterIn.R.connect(meters.right);

  const lastPhantom = [];

  return {
    strips,
    outputs,
    inputs,
    phones,
    phonesDest: def.phones ? "phones" : null,

    pop(state, i, db) {
      const s = strips[i];
      if (!s || !s.popIn) return;
      const src = ctx.createBufferSource();
      src.buffer = popBuffer(ctx);
      const g = ctx.createGain();
      g.gain.value = dbToGain(db + channelGainDb(def, state.channels[i], { path: "mic" }) + HEADROOM_DB);
      src.connect(g).connect(s.popIn);
      src.onended = () => g.disconnect();
      src.start();
    },

    xlrChannels(rig) {
      const ports = DEVICE_TYPES[def.id].ports;
      return rig.cables
        .map((c) => ports.find((p) => `mixer/${p.id}` === c.to && (p.path === "mic" || (p.jack === "combo" && c.cable === "xlr"))))
        .filter(Boolean)
        .map((p) => p.channel);
    },

    apply(state, rig, SOURCES_BY_ID) {
      const set = kit.set;
      const on = (b) => (b ? 1 : 0);
      const sipMode = state.soloBus?.mode === "sip";
      const anyAuxSolo = busIds.some((b) => state[b].solo);
      const anySolo = state.channels.some((c) => !c.tape && c.solo) || anyAuxSolo;
      def.channels.forEach((c, i) => {
        const ch = state.channels[i];
        const s = strips[i];
        if (s.polarity) set(s.polarity.gain, ch.polarity ? -1 : 1);
        if (s.hpf) {
          // L-20: EQ OFF bypasses LOW CUT too.
          const cutting = ch.hpf > 0.02 && (!def.eqOffBypassesHpf || eqIsOn(ch));
          set(s.hpf.hp.frequency, hpfHz(c, ch.hpf) || c.hpf.min);
          set(s.hpf.dry.gain, on(!cutting));
          set(s.hpf.wet.gain, on(cutting));
        }
        if (s.limiter) {
          const lim = state.lim?.mode !== "off";
          set(s.limiter.dry.gain, on(!lim));
          set(s.limiter.wet.gain, on(lim));
        }
        const info = rig.channels[i];
        const source = info && info.sourceId ? SOURCES_BY_ID[info.sourceId] : null;
        const preDb = source && info.signal ? source.outputDb + channelGainDb(def, ch, info) + HEADROOM_DB : -Infinity;
        const flipped = lastPhantom[i] !== undefined && lastPhantom[i] !== ch.phantom;
        lastPhantom[i] = ch.phantom;
        set(s.pre.gain, dbToGain(preDb), flipped ? (ch.phantom ? 0.35 : 0.8) : undefined);
        if (s.lowCut) {
          const active = ch.lowCut && (!c.lowCut.micOnly || (info && info.path === "mic"));
          set(s.lowCut.dry.gain, on(!active));
          set(s.lowCut.wet.gain, on(active));
        }
        if (s.comp && c.dyn) {
          const d = ch.dyn;
          const active = compIsOn(ch) && d.threshold < 0 && d.ratio > 1;
          set(s.comp.dyn.threshold, d.threshold);
          set(s.comp.dyn.ratio, d.ratio);
          set(s.comp.makeup.gain, dbToGain(d.makeup));
          set(s.comp.dry.gain, on(!active));
          set(s.comp.wet.gain, on(active));
        } else if (s.comp) {
          // Clockwise: a lower threshold, a higher ratio, and make-up gain for about a third of the squash.
          const k = ch.comp || 0;
          const thr = -6 - 30 * k;
          const ratio = 1 + 7 * k;
          set(s.comp.dyn.threshold, thr);
          set(s.comp.dyn.ratio, ratio);
          set(s.comp.makeup.gain, dbToGain(0.3 * (-thr - 6) * (1 - 1 / ratio)));
          set(s.comp.dry.gain, on(k <= 0));
          set(s.comp.wet.gain, on(k > 0));
        }
        for (const [id, f] of Object.entries(s.eq)) set(f.gain, ch.eq[id] || 0);
        for (const [id, f] of Object.entries(s.peq)) {
          set(f.gain, eqIsOn(ch) ? ch.peq[id].gain : 0);
          set(f.frequency, shelfHz(f.type, ch.peq[id].freq));
          if (f.type === "peaking") set(f.Q, ch.peq[id].q);
        }
        if (s.stMono) {
          set(s.stMono.st.gain, on(!ch.stMono));
          set(s.stMono.sum.gain, on(ch.stMono));
        }
        const link = linkOf(def, state, i);
        const ctl = channelControl(def, state, i);
        const lvl = levelLaw(def).toDb(link ? state.channels[link.leader].level : ch.level) + ctl.dcaDb;
        set(s.level.gain, dbToGain(lvl) * (link ? Math.max(link.gains.L, link.gains.R) : 1));
        const muted = ctl.muted;
        if (s.lrGate) set(s.lrGate.gain, on(ctl.toMain));
        if (s.mcSend) set(s.mcSend.gain, dbToGain(LAWS.level.toDb(ch.mc)));
        set(s.mainGate.gain, on(!muted));
        if (s.preMute) set(s.preMute.gain, on(!(muted && muteCutsPre(def, state))));
        set(s.pan.pan, link ? (link.gains.L > 0 ? -1 : 1) : ch.pan);
        if (s.altGate) {
          set(s.altGate.gain, on(muted));
          set(s.altPan.pan, ch.pan);
        }
        if (s.pflGain) set(s.pflGain.gain, on(ch.solo && !sipMode));
        if (s.sip) {
          set(s.sip.pan.pan, ch.pan);
          set(s.sip.gate.L.gain, on(ch.solo && sipMode));
          set(s.sip.gate.R.gain, on(ch.solo && sipMode));
        }
        for (const sid of c.sends || []) {
          const d = def.sends[sid];
          const pos = ch.sends[sid];
          if (d.bipolar) {
            set(s.sends[sid].left.gain, pos < 0 ? dbToGain(LAWS[d.law].toDb(-pos)) : 0);
            set(s.sends[sid].right.gain, pos > 0 ? dbToGain(LAWS[d.law].toDb(pos)) : 0);
            continue;
          }
          const g = dbToGain(LAWS[d.law].toDb(pos));
          const tap = d.tap === "switch" ? (state[d.bus].pre ? "pre" : "post") : d.tap === "channel" ? (ch.pre ? "pre" : "post") : d.tap === "each" ? (ch.pres[sid] ? "pre" : "post") : d.tap === "fader" ? "post" : d.tap;
          set(s.sends[sid].pre.gain, tap === "pre" ? g : 0);
          set(s.sends[sid].post.gain, tap === "post" ? g : 0);
        }
      });

      if (tape) {
        const t = state.channels[tapeIndex(def)];
        const info = rig.channels[tapeIndex(def)];
        const source = info && info.sourceId ? SOURCES_BY_ID[info.sourceId] : null;
        set(tape.pre.gain, dbToGain(source && info.signal ? source.outputDb + 10 + HEADROOM_DB : -Infinity));
        set(tape.level.gain, def.tape.level ? dbToGain(LAWS.ret20.toDb(t.level)) : 1);
        const toMain = def.tape.routing === "toMain" || (def.tape.routing === "toMainOrCr" && !t.toCr) || (def.tape.routing === "switch" && t.toMain);
        const toCr = (def.tape.routing === "toMainOrCr" && t.toCr) || ((def.tape.routing === "crOnly" || def.tape.routing === "switch") && state.cr?.tape);
        for (const side of ["L", "R"]) {
          set(tape.toMain[side].gain, on(toMain));
          set(tape.toCr[side].gain, on(toCr));
        }
      }

      for (const r of def.returns || []) {
        const ret = returns[r.id];
        const used = rig.returns?.[r.id] || { L: false, R: false };
        set(ret.normal.gain, on(used.L && !used.R));
        const g = r.fixedDb !== undefined ? dbToGain(r.fixedDb) : dbToGain(LAWS[r.law].toDb(state[r.id].level));
        set(ret.level.L.gain, g);
        set(ret.level.R.gain, g);
        if (ret.efx) set(ret.efx.gain, state[r.id].efx ? 0.5 : 0);
        if (ret.mon) set(ret.mon.gain, 0.5 * dbToGain(LAWS[r.toMonitor.law].toDb(state[r.id].mon)));
        if (ret.toAlt) {
          for (const side of ["L", "R"]) {
            set(ret.toMain[side].gain, on(!state[r.id].toAlt));
            set(ret.toAlt[side].gain, on(state[r.id].toAlt));
          }
        }
      }

      const masterG = def.mainMute && state.main.mute ? 0 : dbToGain(LAWS[def.main.law].toDb(state.main.level));
      set(mainMaster.L.gain, masterG);
      set(mainMaster.R.gain, masterG);
      for (const b of busIds) {
        const g = def.buses[b].mute && state[b].mute ? 0 : def.buses[b].master ? dbToGain(LAWS[def.buses[b].master.law].toDb(state[b].level)) : 1;
        if (fxBuses[b]) {
          set(fxBuses[b].ret.L.gain, g);
          set(fxBuses[b].ret.R.gain, g);
          for (const [t, node] of Object.entries(fxBuses[b].to)) set(node.gain, 0.5 * dbToGain(LAWS[def.buses[b].master.law].toDb(state[b][`ret_${t}`])));
        } else set(auxMaster[b].gain, g);
      }
      if (altToMain) for (const side of ["L", "R"]) set(altToMain[side].gain, on(!!state.alt.toMain));
      if (altOut !== altBus) for (const side of ["L", "R"]) set(altOut[side].gain, dbToGain(LAWS.level.toDb(state.alt.level)));
      for (const [b, g] of Object.entries(auxSolo)) set(g.gain, on(state[b].solo));
      for (const [b, t] of Object.entries(busToMain)) {
        set(t.gate.gain, on(state[b].lr));
        set(t.panner.pan, state[b].pan);
      }
      if (mcMaster) set(mcMaster.gain, state.mc.mute ? 0 : dbToGain(LAWS.level.toDb(state.mc.level)));
      for (const m of matrices) {
        const st = state[m.id];
        set(m.master.gain, st.mute ? 0 : dbToGain(LAWS.level.toDb(st.level)));
        for (const [src, list] of Object.entries(m.sends)) for (const { s, g } of list) set(s.gain, g * dbToGain(LAWS.level.toDb(st[src])));
      }
      const outVol = {};
      if (routeSources) {
        for (const o of def.routing.outputs) {
          if (def.routing.volume) {
            outVol[o] = dbToGain(LAWS[def.routing.volume.law].toDb(state[o].level));
            set(outputs[o].gain, outVol[o]);
          }
          const want = state.routing[o];
          if (routed[o] === want) continue;
          if (routed[o] && routeSources[routed[o]]) routeSources[routed[o]].disconnect(outputs[o]);
          if (routeSources[want]) routeSources[want].connect(outputs[o]);
          routed[o] = want;
        }
      }
      if (fx) {
        const used = rig.returns?.[def.fx.ret] || { L: false, R: false };
        const internal = !used.L && !used.R;
        for (const side of ["L", "R"]) set(fx.gate[side].gain, on(internal));
        fx.setPreset(fxPreset(def, state.fx.program));
      }

      if (reverb) {
        set(reverb.gate.gain, on(state.reverb.on));
        const r = reverbSetting(def, state.reverb.type);
        const key = `${r.type}:${r.seconds.toFixed(2)}`;
        if (key !== reverb.key) {
          reverb.key = key;
          clearTimeout(reverb.timer);
          const build = () => (reverb.conv.buffer = makeImpulse(ctx, r.type === "ECHO" ? 0.35 : r.seconds, r.type.length));
          if (!reverb.conv.buffer) build();
          else reverb.timer = setTimeout(build, 150);
        }
      }
      if (outLim) {
        const m = state.lim.mode;
        for (const side of ["L", "R"]) {
          set(outLim.off[side].gain, on(m === "off"));
          set(outLim.on[side].gain, on(m === "on"));
          set(outLim.link[side].gain, on(m === "link"));
        }
      }
      if (tone) {
        set(tone.level.gain, state.tone.on ? dbToGain(-18) : 0);
        for (const side of ["L", "R"]) set(tone.program[side].gain, on(!state.tone.on));
      }
      // Output Level switches (F8n): each sets the gain of the outputs it covers.
      for (const w of def.outSwitches || []) {
        const dev = state.rig.devices.find((d) => d.id === "mixer");
        const g = dbToGain(w.db[dev?.[w.key] ?? 0]);
        for (const p of w.ports) {
          if (p === "sub-out" && f8sub) {
            set(f8sub.L.gain, g);
            set(f8sub.R.gain, g);
          } else if (outputs[p]) set(outputs[p].gain, g * (outVol[p] ?? 1));
        }
      }
      if (switched) {
        const dev = state.rig.devices.find((d) => d.id === "mixer");
        const g = dbToGain(def.outLevel.db[dev?.outLevel ?? 2]);
        set(switched.L.gain, g);
        set(switched.R.gain, g);
      }
      if (hpMatrix) {
        const src = state.cr.src;
        const m = { OFF: [0, 0, 0, 0], L: [1, 0, 1, 0], R: [0, 1, 0, 1], M: [0.5, 0.5, 0.5, 0.5], ST: [1, 0, 0, 1] }[src] || [0, 0, 0, 0];
        set(hpMatrix.LL.gain, m[0]);
        set(hpMatrix.RL.gain, m[1]);
        set(hpMatrix.LR.gain, m[2]);
        set(hpMatrix.RR.gain, m[3]);
      }
      if (masterEq) {
        // Below the centre: SPEECH (lows cut). Above: more lows; the top is BASS BOOST.
        const p = state.masterEq.pos;
        const lowDb = p < 0.5 ? -12 * (0.5 - p) * 2 : 8 * (p - 0.5) * 2;
        for (const side of ["L", "R"]) {
          set(masterEq[side].lo.gain, lowDb);
          set(masterEq[side].hi.gain, p < 0.5 ? 2 * (0.5 - p) * 2 : 0);
        }
      }
      if (spkHp) {
        const subUsed = rig.buses && "sub-out" in rig.buses && state.rig.cables.some((c) => c.from === "mixer/sub-out");
        for (const side of ["L", "R"]) {
          set(spkHp.gateHp[side].gain, on(subUsed));
          set(spkHp.gateFull[side].gain, on(!subUsed));
        }
      }
      if (mainEq) {
        for (const side of ["L", "R"]) for (const [id, f] of Object.entries(mainEq[side])) set(f.gain, state.mainEq[id]);
      }
      if (thru) set(thru.gain, dbToGain(LAWS.master.toDb(state.thru.level)) * Math.SQRT1_2);
      if (monitor) {
        const g = dbToGain(LAWS.master.toDb(state.monitor.level));
        set(monitor.L.gain, g);
        set(monitor.R.gain, g);
      }
      if (xlr) {
        const g = state.xlrPad.on ? dbToGain(-30) : 1;
        set(xlr.L.gain, g);
        set(xlr.R.gain, g);
      }
      if (def.phones) {
        const srcs = def.phones.sources;
        set(selMain.L.gain, on(!selector && (!srcs || state.cr.main)));
        set(selMain.R.gain, on(!selector && (!srcs || state.cr.main)));
        set(selAlt.L.gain, on(srcs && state.cr.alt));
        set(selAlt.R.gain, on(srcs && state.cr.alt));
        set(crGate.L.gain, on(!anySolo));
        set(crGate.R.gain, on(!anySolo));
        const g = dbToGain(LAWS.master.toDb(state.cr.level) + (state.tone?.on ? def.tone.earSaverDb : 0));
        set(crLevel.L.gain, g);
        set(crLevel.R.gain, g);
      }
      // Meters show the main mix, or the soloed channel while solo is on.
      set(soloMeter.gain, on(anySolo && !sipMode) || on(anyAuxSolo));
      for (const side of ["L", "R"]) set(sipMeter[side].gain, on(sipMode && anySolo));
      for (const side of ["L", "R"]) set(mainMeterGate[side].gain, on(!anySolo));
    },

    readMeters(read) {
      return {
        channels: strips.map((s) => (s && s.meter ? read(s.meter) : null)),
        comp: strips.map((s) => (s && s.comp ? s.comp.dyn.reduction : 0)),
        limit: strips.map((s) => (s && s.limiter ? s.limiter.dyn.reduction : 0)),
        outLimit: outLim ? Math.min(outLim.L.reduction, outLim.R.reduction, outLim.st.reduction) : 0,
        fx: fx ? read(fx.meter) : null,
        meterL: read(meters.left),
        meterR: read(meters.right),
      };
    },
  };
}

// The Xenyx effects unit: mono in, stereo out, 100 % wet. One preset at a
// time: reverb (a convolver), delay (with feedback), or chorus / flanger (a
// delay swept by an LFO), optionally followed by a little reverb.
function buildFxUnit(kit) {
  const { ctx, gain, track } = kit;
  const mono = (v = 1) => gain(v, true);
  const input = mono(1);
  const out = { L: mono(1), R: mono(1) };
  const toOut = (node, side) => {
    const split = track(ctx.createChannelSplitter(2));
    node.connect(split);
    split.connect(out.L, 0);
    split.connect(out.R, side === "both" ? 1 : 0);
  };

  // Reverb.
  const revIn = mono(0);
  const conv = track(ctx.createConvolver());
  input.connect(revIn).connect(conv);
  toOut(conv, "both");

  // Delay with feedback.
  const delIn = mono(0);
  const delay = track(ctx.createDelay(2));
  const feedback = mono(0);
  input.connect(delIn).connect(delay);
  delay.connect(feedback).connect(delay);
  const delOut = mono(0);
  delay.connect(delOut);
  delOut.connect(out.L);
  delOut.connect(out.R);

  // Chorus / flanger: two swept delays, one per side, with opposite LFO phase.
  const modIn = mono(0);
  input.connect(modIn);
  const lfo = track(ctx.createOscillator());
  lfo.frequency.value = 0.8;
  const mods = ["L", "R"].map((side, k) => {
    const d = track(ctx.createDelay(0.1));
    d.delayTime.value = 0.012;
    const depth = mono(0);
    lfo.connect(depth).connect(d.delayTime);
    const fb = mono(0);
    modIn.connect(d);
    d.connect(fb).connect(d);
    const g = mono(0);
    d.connect(g).connect(out[side]);
    return { d, depth, fb, g, sign: k ? -1 : 1 };
  });
  lfo.start();

  // Reverb after a delay or chorus (the combination presets).
  const postRev = mono(0);
  delOut.connect(postRev);
  for (const m of mods) m.g.connect(postRev);
  postRev.connect(conv);

  let key = "";
  let timer = null;
  const set = kit.set;
  return {
    input,
    out,
    setPreset(p) {
      const k = `${p.number}`;
      if (k === key) return;
      key = k;
      const rev = p.kind === "reverb" ? p.seconds : p.reverb || 0;
      set(revIn.gain, p.kind === "reverb" ? 1 : 0);
      set(postRev.gain, p.reverb ? 0.5 : 0);
      set(delIn.gain, p.kind === "delay" ? 1 : 0);
      set(delOut.gain, p.kind === "delay" ? 1 : 0);
      if (p.kind === "delay") {
        delay.delayTime.setTargetAtTime(p.seconds, ctx.currentTime, 0.02);
        set(feedback.gain, p.feedback);
      } else set(feedback.gain, 0);
      const mod = p.kind === "chorus" || p.kind === "flanger";
      set(modIn.gain, mod ? 1 : 0);
      if (mod) lfo.frequency.setTargetAtTime(p.rate, ctx.currentTime, 0.05);
      for (const m of mods) {
        set(m.g.gain, mod ? 0.8 : 0);
        set(m.depth.gain, mod ? m.sign * p.depth : 0);
        m.d.delayTime.setTargetAtTime(p.kind === "flanger" ? 0.003 : 0.014, ctx.currentTime, 0.05);
        set(m.fb.gain, p.kind === "flanger" ? 0.6 : 0);
      }
      if (rev) {
        clearTimeout(timer);
        const build = () => (conv.buffer = makeImpulse(ctx, rev, p.number));
        if (!conv.buffer) build();
        else timer = setTimeout(build, 150);
      }
    },
  };
}
