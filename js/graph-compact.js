// Audio graph of a compact mixer, built from its definition (js/compact-defs.js;
// state and level model: js/compact.js). Every switch is a gain the state sets.
//
// Channel:  input ─► gain stage ─► clipper ─► LOW CUT/HPF ─► EQ ─► eq tap
//           eq tap ─► PEAK LED, PFL solo, pre-fader sends, Yamaha insert
//           eq tap ─► [ST/MONO] ─► LEVEL ─► MUTE ─► post tap ─► PAN/BAL ─► MAIN L/R
//                                           └► ALT (muted, 1202) ─► PAN ─► ALT L/R
//           post tap ─► post-fader sends (and the STAGEPAS reverb)
// Masters:  MAIN ─► [STAGEPAS: MASTER EQ, sub HPF, amp] ─► outputs; aux masters;
//           returns; tape; C-R/PHONES (SOURCE, replaced by SOLO); meters.

import { EQ_FOR, LAWS, channelGainDb, reverbSetting, tapeIndex } from "./compact.js";
import { HEADROOM_DB, dbToGain } from "./levels.js";
import { DEVICE_TYPES } from "./connection-model.js";
import { lowCutStage, popBuffer } from "./graph-kit.js";
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
    outputs[b] = auxMaster[b];
  }
  const altBus = def.alt ? pair() : null;
  const pflBus = mono();
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
    input.connect(pre).connect(clip);
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
    const eq = {};
    let node = afterCut;
    for (const band of EQ_FOR(c.eq)) {
      const f = track(ctx.createBiquadFilter());
      f.type = band.type;
      f.frequency.value = band.hz;
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
    const mainGate = chan(1);
    level.connect(mainGate);
    const post = mainGate;
    const pan = track(ctx.createStereoPanner());
    post.connect(pan);
    const split = track(ctx.createChannelSplitter(2));
    pan.connect(split);
    split.connect(mainBus.L, 0);
    split.connect(mainBus.R, 1);
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
        tapEq.connect(sends[sid].pre).connect(dest);
        post.connect(sends[sid].post).connect(dest);
      }
    }
    const pfl = mono(0);
    if (c.solo) tapEq.connect(pfl).connect(pflBus);
    return { input, pre, popIn, lowCut, eq, meter, stMono, level, mainGate, pan, altGate, altPan, sends, pflGain: c.solo ? pfl : null, stereo };
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
    ret.side.L.connect(ret.level.L).connect(mainBus.L);
    ret.side.R.connect(ret.level.R).connect(mainBus.R);
    if (r.efxToMonitor) {
      ret.efx = mono(0);
      ret.level.L.connect(ret.efx);
      ret.level.R.connect(ret.efx);
      ret.efx.connect(auxBus[r.efxToMonitor]);
    }
    returns[r.id] = ret;
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
  if (altBus) {
    outputs["alt-l"] = altBus.L;
    outputs["alt-r"] = altBus.R;
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
  if (def.monitorOut) {
    // A mix of the channels (and reverb), before MASTER LEVEL.
    monitor = pair(0);
    mainBus.L.connect(monitor.L);
    mainBus.R.connect(monitor.R);
    outputs["mon-l"] = monitor.L;
    outputs["mon-r"] = monitor.R;
  }
  let xlr = null;
  if (def.outputs.includes("mainXlr")) {
    xlr = pair(1); // the XLR outs have a 30 dB PAD switch
    masterOut.L.connect(xlr.L);
    masterOut.R.connect(xlr.R);
    outputs["main-l"] = xlr.L;
    outputs["main-r"] = xlr.R;
    outputs["line-l"] = masterOut.L;
    outputs["line-r"] = masterOut.R;
  } else if (def.outputs.includes("main")) {
    outputs["main-l"] = masterOut.L;
    outputs["main-r"] = masterOut.R;
  }
  for (const k of ["tape-out", "rec-out"]) {
    outputs[`${k}-l`] = masterOut.L;
    outputs[`${k}-r`] = masterOut.R;
  }

  // ---------- C-R / PHONES ----------
  const crSum = pair();
  const selMain = pair(def.phones && !def.phones.sources ? 1 : 0);
  masterOut.L.connect(selMain.L).connect(crSum.L);
  masterOut.R.connect(selMain.R).connect(crSum.R);
  const selAlt = pair(0);
  if (altBus) {
    altBus.L.connect(selAlt.L).connect(crSum.L);
    altBus.R.connect(selAlt.R).connect(crSum.R);
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
  soloMeter.connect(meterIn.L);
  soloMeter.connect(meterIn.R);
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
      const anySolo = state.channels.some((c) => !c.tape && c.solo);
      def.channels.forEach((c, i) => {
        const ch = state.channels[i];
        const s = strips[i];
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
        for (const [id, f] of Object.entries(s.eq)) set(f.gain, ch.eq[id] || 0);
        if (s.stMono) {
          set(s.stMono.st.gain, on(!ch.stMono));
          set(s.stMono.sum.gain, on(ch.stMono));
        }
        set(s.level.gain, dbToGain(LAWS.level.toDb(ch.level)));
        const muted = c.mute && !ch.enabled;
        set(s.mainGate.gain, on(!muted));
        set(s.pan.pan, ch.pan);
        if (s.altGate) {
          set(s.altGate.gain, on(muted));
          set(s.altPan.pan, ch.pan);
        }
        if (s.pflGain) set(s.pflGain.gain, on(ch.solo));
        for (const sid of c.sends || []) {
          const d = def.sends[sid];
          const pos = ch.sends[sid];
          if (d.bipolar) {
            set(s.sends[sid].left.gain, pos < 0 ? dbToGain(LAWS[d.law].toDb(-pos)) : 0);
            set(s.sends[sid].right.gain, pos > 0 ? dbToGain(LAWS[d.law].toDb(pos)) : 0);
            continue;
          }
          const g = dbToGain(LAWS[d.law].toDb(pos));
          const tap = d.tap === "switch" ? (state[d.bus].pre ? "pre" : "post") : d.tap;
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
        const toMain = def.tape.routing === "toMain" || (def.tape.routing === "toMainOrCr" && !t.toCr);
        const toCr = (def.tape.routing === "toMainOrCr" && t.toCr) || (def.tape.routing === "crOnly" && state.cr?.tape);
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
      }

      const masterG = dbToGain(LAWS[def.main.law].toDb(state.main.level));
      set(mainMaster.L.gain, masterG);
      set(mainMaster.R.gain, masterG);
      for (const b of busIds) set(auxMaster[b].gain, def.buses[b].master ? dbToGain(LAWS[def.buses[b].master.law].toDb(state[b].level)) : 1);
      if (altToMain) for (const side of ["L", "R"]) set(altToMain[side].gain, on(state.alt.toMain));

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
        set(selMain.L.gain, on(!srcs || state.cr.main));
        set(selMain.R.gain, on(!srcs || state.cr.main));
        set(selAlt.L.gain, on(srcs && state.cr.alt));
        set(selAlt.R.gain, on(srcs && state.cr.alt));
        set(crGate.L.gain, on(!anySolo));
        set(crGate.R.gain, on(!anySolo));
        const g = dbToGain(LAWS.master.toDb(state.cr.level));
        set(crLevel.L.gain, g);
        set(crLevel.R.gain, g);
      }
      // Meters show the main mix, or the soloed channel while solo is on.
      set(soloMeter.gain, on(anySolo));
      for (const side of ["L", "R"]) set(mainMeterGate[side].gain, on(!anySolo));
    },

    readMeters(read) {
      return { channels: strips.map((s) => (s && s.meter ? read(s.meter) : null)), meterL: read(meters.left), meterR: read(meters.right) };
    },
  };
}
