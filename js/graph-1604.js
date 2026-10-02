// Audio graph of the Mackie CR1604-VLZ (state and level model: js/cr1604.js).
// Built by js/audio-engine.js when the state's model is "cr1604". Every switch
// is a gain that the state sets, so nothing is rebuilt while the band plays.
//
// Channel (mono, ×16):
//   input ─► TRIM ─► clipper ─► LOW CUT ─► pre ─► EQ (LOW 80 Hz shelf, MID sweep, HI 12 kHz shelf) ─► eq
//   pre ─► AUX 1/2 (PRE down)
//   eq  ─► OL / −20 LEDs;  eq ─► SOLO (LEVEL SET/PFL) ─► PFL bus
//   eq  ─► MUTE ─► fader ─► post ─► AUX 1/2 (PRE up), AUX 3/4 or 5/6 (SHIFT)
//   post ─► PAN ─► L/R ─► L-R, 1-2, 3-4 assigns;  L/R ─► SOLO (NORMAL/AFL) ─► AFL bus
// Tape (stereo): input ─► TAPE IN ─► TAPE TO MAIN MIX, and the SOURCE matrix.
// Masters: SUB faders ─► SUB OUTS and ASSIGN TO MAIN MIX L/R; MAIN fader ─► MAIN OUTS, MONO;
//   AUX 1/2 masters; C-R/PHONES: SOURCE matrix, replaced by SOLO while any solo is on.

import * as CR from "./cr1604.js";
import { HEADROOM_DB, dbToGain } from "./levels.js";
import { lowCutStage, popBuffer } from "./graph-kit.js";
import { DEVICE_TYPES } from "./connection-model.js";

// MID EQ bandwidth of 1.5 octaves as a peaking-filter Q.
const MID_Q = Math.sqrt(Math.pow(2, CR.EQ_MID_OCTAVES)) / (Math.pow(2, CR.EQ_MID_OCTAVES) - 1);

export function buildCr1604Graph(kit) {
  const { ctx, gain, stereoGain, analyser } = kit;
  const mono = (v = 1) => gain(v, true);
  const pair = (v = 1) => ({ L: mono(v), R: mono(v) });
  const biquad = (type, hz, q) => {
    const f = kit.track(ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = hz;
    if (q) f.Q.value = q;
    f.gain.value = 0;
    return f;
  };
  const outputs = {};

  // ---------- buses ----------
  const mainBus = pair();
  const mainFader = pair(0);
  mainBus.L.connect(mainFader.L);
  mainBus.R.connect(mainFader.R);
  outputs["main-l"] = mainFader.L;
  outputs["main-r"] = mainFader.R;
  const monoSum = mono(0.5);
  mainFader.L.connect(monoSum);
  mainFader.R.connect(monoSum);
  const monoLevel = mono(1);
  monoSum.connect(monoLevel);
  outputs.mono = monoLevel;

  const auxBus = Object.fromEntries(CR.AUXES.map((b) => [b, mono()]));
  const auxMaster = {};
  for (const b of CR.AUXES) {
    if (CR.MASTERED_AUXES.includes(b)) {
      auxMaster[b] = mono(1);
      auxBus[b].connect(auxMaster[b]);
      outputs[b] = auxMaster[b];
    } else outputs[b] = auxBus[b]; // AUX SENDS 3–6: straight out at unity
  }

  const subBus = Object.fromEntries(CR.SUBS.map((s) => [s, mono()]));
  const subFader = {};
  const subToMain = {};
  for (const s of CR.SUBS) {
    subFader[s] = mono(0);
    subBus[s].connect(subFader[s]);
    outputs[s] = subFader[s];
    subToMain[s] = pair(0);
    subFader[s].connect(subToMain[s].L).connect(mainBus.L);
    subFader[s].connect(subToMain[s].R).connect(mainBus.R);
  }

  // Solo buses. PFL is mono (centre in the phones, left meter only).
  const pflBus = mono();
  const aflBus = pair();
  const auxSolo = { aux1: pair(0), aux2: pair(0) };
  auxMaster.aux1.connect(auxSolo.aux1.L);
  auxMaster.aux1.connect(auxSolo.aux1.R);
  auxMaster.aux2.connect(auxSolo.aux2.L);
  auxMaster.aux2.connect(auxSolo.aux2.R);

  // ---------- channels ----------
  const clipCurve = new Float32Array([-1, 1]);
  const strips = [];
  for (let i = 0; i < CR.CHANNELS; i++) {
    const input = mono(1);
    const pre = mono(0);
    const clip = kit.track(ctx.createWaveShaper());
    clip.curve = clipCurve;
    input.connect(pre).connect(clip);
    const popIn = mono(1); // phantom pops arrive here, after the preamp
    popIn.connect(clip);
    const lowCut = lowCutStage(kit, clip, mono);
    const tapPre = lowCut.out;
    const eq = {
      low: biquad("lowshelf", CR.EQ_FREQ.low),
      mid: biquad("peaking", 1000, MID_Q),
      high: biquad("highshelf", CR.EQ_FREQ.high),
    };
    const tapEq = mono(1);
    tapPre.connect(eq.low).connect(eq.mid).connect(eq.high).connect(tapEq);
    const meter = analyser();
    tapEq.connect(meter);
    const mute = mono(1);
    const fader = mono(0);
    tapEq.connect(mute).connect(fader);
    const tapPost = fader;

    // AUX 1/2: one gain from each tap point; PRE decides which is open.
    const sends = {};
    for (const b of ["aux1", "aux2"]) {
      sends[b] = { pre: mono(0), post: mono(0) };
      tapPre.connect(sends[b].pre).connect(auxBus[b]);
      tapPost.connect(sends[b].post).connect(auxBus[b]);
    }
    // AUX 3/4 knobs: post-fader, to 3/4 or (5/6 SHIFT) 5/6.
    for (const [knob, a, b] of [["aux3", "aux3", "aux5"], ["aux4", "aux4", "aux6"]]) {
      sends[knob] = { a: mono(0), b: mono(0) };
      tapPost.connect(sends[knob].a).connect(auxBus[a]);
      tapPost.connect(sends[knob].b).connect(auxBus[b]);
    }

    const pan = kit.track(ctx.createStereoPanner());
    tapPost.connect(pan);
    const split = kit.track(ctx.createChannelSplitter(2));
    pan.connect(split);
    const side = pair();
    split.connect(side.L, 0);
    split.connect(side.R, 1);
    const assign = { lr: pair(0), s12: pair(0), s34: pair(0) };
    side.L.connect(assign.lr.L).connect(mainBus.L);
    side.R.connect(assign.lr.R).connect(mainBus.R);
    side.L.connect(assign.s12.L).connect(subBus.sub1);
    side.R.connect(assign.s12.R).connect(subBus.sub2);
    side.L.connect(assign.s34.L).connect(subBus.sub3);
    side.R.connect(assign.s34.R).connect(subBus.sub4);

    const pfl = mono(0);
    tapEq.connect(pfl).connect(pflBus); // pre-MUTE, pre-fader
    const afl = pair(0);
    side.L.connect(afl.L).connect(aflBus.L); // post-MUTE, fader and PAN
    side.R.connect(afl.R).connect(aflBus.R);

    strips.push({ input, pre, popIn, lowCut, eq, meter, mute, fader, sends, pan, assign, pfl, afl });
    // INSERT used as a send: after TRIM, before LOW CUT and EQ. DIRECT OUT (1–8): the end of the channel.
    outputs[`ch${i + 1}-insert`] = clip;
    if (i < 8) outputs[`ch${i + 1}-direct`] = tapPost;
  }

  // TAPE IN: a stereo pair with a level knob.
  const tape = { input: stereoGain(1), pre: stereoGain(0), level: stereoGain(1) };
  tape.input.connect(tape.pre).connect(tape.level);
  const tapeSplit = kit.track(ctx.createChannelSplitter(2));
  tape.level.connect(tapeSplit);
  tape.side = pair();
  tapeSplit.connect(tape.side.L, 0);
  tapeSplit.connect(tape.side.R, 1);
  tape.toMain = pair(0);
  tape.side.L.connect(tape.toMain.L).connect(mainBus.L);
  tape.side.R.connect(tape.toMain.R).connect(mainBus.R);
  strips.push(tape);

  // TAPE OUTPUT: a copy of the MAIN MIX after its fader.
  outputs["tape-out-l"] = mainFader.L;
  outputs["tape-out-r"] = mainFader.R;

  // ---------- STEREO AUX RETURNS ----------
  // A lone L input is normalled to both sides. Each return's level knob feeds
  // MAIN (or, for 3, a subgroup pair; for 4, only the C-R/PHONES); 1 and 2 also
  // feed AUX SEND 1/2 through EFFECTS TO MONITORS, before the level knob.
  const inputs = {};
  const returns = {};
  for (const r of CR.RETURNS) {
    const n = r.slice(3);
    const ret = { inL: mono(1), inR: mono(1), normal: mono(0), side: pair(), level: pair(1) };
    inputs[`ret${n}-l`] = ret.inL;
    inputs[`ret${n}-r`] = ret.inR;
    ret.inL.connect(ret.side.L);
    ret.inR.connect(ret.side.R);
    ret.inL.connect(ret.normal).connect(ret.side.R);
    ret.side.L.connect(ret.level.L);
    ret.side.R.connect(ret.level.R);
    ret.toMain = pair(0);
    ret.level.L.connect(ret.toMain.L).connect(mainBus.L);
    ret.level.R.connect(ret.toMain.R).connect(mainBus.R);
    if (r === "ret3") {
      ret.toS12 = pair(0);
      ret.toS34 = pair(0);
      ret.level.L.connect(ret.toS12.L).connect(subBus.sub1);
      ret.level.R.connect(ret.toS12.R).connect(subBus.sub2);
      ret.level.L.connect(ret.toS34.L).connect(subBus.sub3);
      ret.level.R.connect(ret.toS34.R).connect(subBus.sub4);
    }
    if (r === "ret1" || r === "ret2") {
      ret.toAux = mono(0);
      ret.side.L.connect(ret.toAux);
      ret.side.R.connect(ret.toAux);
      ret.toAux.connect(auxBus[r === "ret1" ? "aux1" : "aux2"]);
    }
    ret.solo = { afl: pair(0), pfl: mono(0) };
    ret.level.L.connect(ret.solo.afl.L).connect(aflBus.L);
    ret.level.R.connect(ret.solo.afl.R).connect(aflBus.R);
    ret.level.L.connect(ret.solo.pfl);
    ret.level.R.connect(ret.solo.pfl);
    ret.solo.pfl.connect(pflBus);
    returns[r] = ret;
  }

  // ---------- C-R / PHONES ----------
  const sel = {
    main: pair(0),
    subs12: pair(0),
    subs34: pair(0),
    tape: pair(0),
  };
  const crSum = pair();
  mainFader.L.connect(sel.main.L).connect(crSum.L);
  mainFader.R.connect(sel.main.R).connect(crSum.R);
  subFader.sub1.connect(sel.subs12.L).connect(crSum.L);
  subFader.sub2.connect(sel.subs12.R).connect(crSum.R);
  subFader.sub3.connect(sel.subs34.L).connect(crSum.L);
  subFader.sub4.connect(sel.subs34.R).connect(crSum.R);
  tape.side.L.connect(sel.tape.L).connect(crSum.L);
  tape.side.R.connect(sel.tape.R).connect(crSum.R);
  // AUX RETURN 4 with C-R/PHNS ONLY: into the C-R mix whatever the SOURCE (still replaced by SOLO).
  returns.ret4.toCr = pair(0);
  returns.ret4.level.L.connect(returns.ret4.toCr.L).connect(crSum.L);
  returns.ret4.level.R.connect(returns.ret4.toCr.R).connect(crSum.R);

  // While any SOLO is on it replaces the SOURCE selection.
  const crGate = pair(1);
  crSum.L.connect(crGate.L);
  crSum.R.connect(crGate.R);
  const soloAudio = pair();
  pflBus.connect(soloAudio.L);
  pflBus.connect(soloAudio.R);
  aflBus.L.connect(soloAudio.L);
  aflBus.R.connect(soloAudio.R);
  auxSolo.aux1.L.connect(soloAudio.L);
  auxSolo.aux1.R.connect(soloAudio.R);
  auxSolo.aux2.L.connect(soloAudio.L);
  auxSolo.aux2.R.connect(soloAudio.R);
  const soloLevel = pair(1);
  soloAudio.L.connect(soloLevel.L);
  soloAudio.R.connect(soloLevel.R);
  const crLevel = pair(1);
  crGate.L.connect(crLevel.L);
  crGate.R.connect(crLevel.R);
  soloLevel.L.connect(crLevel.L);
  soloLevel.R.connect(crLevel.R);
  outputs["cr-l"] = crLevel.L;
  outputs["cr-r"] = crLevel.R;
  const phones = kit.track(ctx.createChannelMerger(2));
  crLevel.L.connect(phones, 0, 0);
  crLevel.R.connect(phones, 0, 1);

  // The two 12-LED meters read the SOURCE mix (or solo) before any level
  // control; LEVEL SET (PFL) solo shows on the left meter only.
  const meterIn = pair();
  crGate.L.connect(meterIn.L);
  crGate.R.connect(meterIn.R);
  pflBus.connect(meterIn.L);
  aflBus.L.connect(meterIn.L);
  aflBus.R.connect(meterIn.R);
  auxSolo.aux1.L.connect(meterIn.L);
  auxSolo.aux1.R.connect(meterIn.R);
  auxSolo.aux2.L.connect(meterIn.L);
  auxSolo.aux2.R.connect(meterIn.R);
  const meters = { left: analyser(), right: analyser() };
  meterIn.L.connect(meters.left);
  meterIn.R.connect(meters.right);

  // Phantom voltage charges up in about a second and drains more slowly (the
  // manual: the PHANTOM LED stays on for a while after switching off).
  const lastPhantom = [];
  const PHANTOM_TAU = { on: 0.35, off: 0.8 };

  return {
    strips,
    outputs,
    inputs, // input jacks other than the channels' (the aux returns)
    phones,
    phonesDest: "phones",

    // Fire a phantom pop into channel i: `db` at the mic input, so the TRIM
    // decides how loud it is after the preamp.
    pop(state, i, db) {
      const s = strips[i];
      if (!s || !s.popIn) return;
      const src = ctx.createBufferSource();
      src.buffer = popBuffer(ctx);
      const g = ctx.createGain();
      g.gain.value = dbToGain(db + state.channels[i].gainDb + HEADROOM_DB);
      src.connect(g).connect(s.popIn);
      src.onended = () => g.disconnect();
      src.start();
    },

    // Channels whose MIC jack has an XLR in it (they pop when phantom flips).
    xlrChannels(rig) {
      const mixer = rig.devices.find((d) => d.id === "mixer");
      const ports = DEVICE_TYPES[mixer.type].ports;
      return rig.cables
        .map((c) => ports.find((p) => `mixer/${p.id}` === c.to && p.path === "mic"))
        .filter(Boolean)
        .map((p) => p.channel);
    },

    apply(state, rig, SOURCES_BY_ID) {
      const set = kit.set;
      const on = (b) => (b ? 1 : 0);
      const law = CR.LAWS;
      const mode = state.soloBus.mode;
      for (let i = 0; i < CR.CHANNELS; i++) {
        const ch = state.channels[i];
        const s = strips[i];
        const info = rig.channels[i];
        const source = info && info.sourceId ? SOURCES_BY_ID[info.sourceId] : null;
        const preDb = source && info.signal ? source.outputDb + (info.padDb || 0) + ch.gainDb + HEADROOM_DB : -Infinity;
        const flipped = lastPhantom[i] !== undefined && lastPhantom[i] !== ch.phantom;
        lastPhantom[i] = ch.phantom;
        set(s.pre.gain, dbToGain(preDb), flipped ? PHANTOM_TAU[ch.phantom ? "on" : "off"] : undefined);
        set(s.lowCut.dry.gain, on(!ch.lowCut));
        set(s.lowCut.wet.gain, on(ch.lowCut));
        set(s.eq.low.gain, ch.eq.low);
        set(s.eq.mid.gain, ch.eq.mid);
        set(s.eq.mid.frequency, ch.eq.freq);
        set(s.eq.high.gain, ch.eq.high);
        set(s.mute.gain, on(ch.enabled));
        set(s.fader.gain, dbToGain(law.fader.toDb(ch.level)));
        for (const b of ["aux1", "aux2"]) {
          const g = dbToGain(law.send.toDb(ch.auxSends[b]));
          set(s.sends[b].pre.gain, ch.pre ? g : 0);
          set(s.sends[b].post.gain, ch.pre ? 0 : g);
        }
        for (const k of ["aux3", "aux4"]) {
          const g = dbToGain(law.send.toDb(ch.auxSends[k]));
          set(s.sends[k].a.gain, ch.shift ? 0 : g);
          set(s.sends[k].b.gain, ch.shift ? g : 0);
        }
        set(s.pan.pan, ch.pan);
        for (const k of ["lr", "s12", "s34"]) {
          set(s.assign[k].L.gain, on(ch.assign[k]));
          set(s.assign[k].R.gain, on(ch.assign[k]));
        }
        set(s.pfl.gain, on(ch.solo && mode === "pfl"));
        set(s.afl.L.gain, on(ch.solo && mode === "afl"));
        set(s.afl.R.gain, on(ch.solo && mode === "afl"));
      }

      const t = state.channels[CR.TAPE];
      const tInfo = rig.channels[CR.TAPE];
      const tSource = tInfo && tInfo.sourceId ? SOURCES_BY_ID[tInfo.sourceId] : null;
      set(tape.pre.gain, dbToGain(tSource && tInfo.signal ? tSource.outputDb + CR.TAPE_REF_DB + HEADROOM_DB : -Infinity));
      set(tape.level.gain, dbToGain(law.tape.toDb(t.level)));
      set(tape.toMain.L.gain, on(t.toMain));
      set(tape.toMain.R.gain, on(t.toMain));

      set(mainFader.L.gain, dbToGain(law.fader.toDb(state.main.level)));
      set(mainFader.R.gain, dbToGain(law.fader.toDb(state.main.level)));
      set(monoLevel.gain, dbToGain(law.mono.toDb(state.mono.level)));
      for (const b of CR.MASTERED_AUXES) set(auxMaster[b].gain, dbToGain(law.master.toDb(state[b].level)));
      for (const sub of CR.SUBS) {
        const st = state[sub];
        const both = st.toMainL && st.toMainR;
        set(subFader[sub].gain, dbToGain(law.fader.toDb(st.level)));
        set(subToMain[sub].L.gain, st.toMainL ? (both ? Math.SQRT1_2 : 1) : 0);
        set(subToMain[sub].R.gain, st.toMainR ? (both ? Math.SQRT1_2 : 1) : 0);
      }
      // AUX SEND solo: 1 left and 2 right in NORMAL (AFL); centred in LEVEL SET (PFL).
      const centre = mode === "pfl" ? Math.SQRT1_2 : 0;
      set(auxSolo.aux1.L.gain, state.aux1.solo ? (mode === "pfl" ? centre : 1) : 0);
      set(auxSolo.aux1.R.gain, state.aux1.solo ? centre : 0);
      set(auxSolo.aux2.L.gain, state.aux2.solo ? centre : 0);
      set(auxSolo.aux2.R.gain, state.aux2.solo ? (mode === "pfl" ? centre : 1) : 0);

      for (const r of CR.RETURNS) {
        const st = state[r];
        const ret = returns[r];
        const used = rig.returns?.[r] || { L: false, R: false };
        set(ret.normal.gain, on(used.L && !used.R));
        const g = dbToGain(law.tape.toDb(st.level));
        set(ret.level.L.gain, g);
        set(ret.level.R.gain, g);
        const toMain = r === "ret3" ? !st.toSubs : r === "ret4" ? !st.crOnly : true;
        set(ret.toMain.L.gain, on(toMain));
        set(ret.toMain.R.gain, on(toMain));
        if (ret.toS12) {
          for (const side of ["L", "R"]) {
            set(ret.toS12[side].gain, on(st.toSubs && !st.subs34));
            set(ret.toS34[side].gain, on(st.toSubs && st.subs34));
          }
        }
        if (ret.toCr) for (const side of ["L", "R"]) set(ret.toCr[side].gain, on(st.crOnly));
        if (ret.toAux) set(ret.toAux.gain, 0.5 * dbToGain(law.send.toDb(st.toAux)));
        const rs = state.soloBus.returns;
        set(ret.solo.afl.L.gain, on(rs && mode === "afl"));
        set(ret.solo.afl.R.gain, on(rs && mode === "afl"));
        set(ret.solo.pfl.gain, rs && mode === "pfl" ? 0.5 : 0);
      }

      for (const k of ["main", "subs12", "subs34", "tape"]) {
        set(sel[k].L.gain, on(state.cr[k]));
        set(sel[k].R.gain, on(state.cr[k]));
      }
      const solo = CR.phonesOf(state).solo;
      set(crGate.L.gain, on(!solo));
      set(crGate.R.gain, on(!solo));
      const soloG = dbToGain(law.master.toDb(state.soloBus.level));
      set(soloLevel.L.gain, soloG);
      set(soloLevel.R.gain, soloG);
      const crG = dbToGain(law.master.toDb(state.cr.level));
      set(crLevel.L.gain, crG);
      set(crLevel.R.gain, crG);
    },

    readMeters(read) {
      return { channels: strips.map((s) => (s.meter ? read(s.meter) : null)), meterL: read(meters.left), meterR: read(meters.right) };
    },
  };
}
