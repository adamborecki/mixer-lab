// Mackie CR1604-VLZ: state, validation, patching and the level model, checked
// against what the owner's manual says each control does (docs/CR1604.md).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as CR from "../js/cr1604.js";
import { MixerStore, computeMix, createMixerState, listenGroupOf } from "../js/mixer-state.js";
import { checkConnection, channelPortRef } from "../js/connection-model.js";
import { SCENARIOS_BY_ID, buildScenarioState, scenariosFor, sourceDeviceId } from "../js/scenarios.js";
import { SOURCES_BY_ID, STEMS } from "../audio/source-manifest.js";

const FREE = SCENARIOS_BY_ID["free-play"];
const gig = () => new MixerStore(buildScenarioState(FREE, SOURCES_BY_ID, "cr1604"));
const mix = (store) => computeMix(store.state, SOURCES_BY_ID, STEMS);
const ch = (store, sourceId) => mix(store).channels.find((c) => c.sourceId === sourceId);
const VOX = SOURCES_BY_ID["lead-vocal"].order - 1;
const DRUMS = SOURCES_BY_ID.drums.order - 1;
const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

describe("CR1604 state", () => {
  it("a fresh board: 16 mono channels plus the tape strip, nothing assigned, faders down", () => {
    const s = createMixerState("cr1604");
    assert.equal(s.model, "cr1604");
    assert.equal(s.channels.length, 17);
    assert.ok(s.channels[CR.TAPE].tape && s.channels[CR.TAPE].stereo);
    for (const c of s.channels.slice(0, 16)) {
      assert.deepEqual(c.assign, { lr: false, s12: false, s34: false });
      assert.equal(c.level, 0);
      assert.equal(c.pre, false);
      assert.equal(c.gainDb, 10); // TRIM fully down is still +10 dB through MIC
    }
  });

  it("validates every control the way the board limits it", () => {
    const st = new MixerStore(createMixerState("cr1604"));
    st.setChannel(0, "gainDb", 3);
    assert.equal(st.state.channels[0].gainDb, 10);
    st.setChannel(0, "eq.mid", 40);
    assert.equal(st.state.channels[0].eq.mid, 15);
    st.setChannel(0, "eq.freq", 20000);
    assert.equal(st.state.channels[0].eq.freq, 8000);
    st.setChannel(0, "assign.lr", 1);
    assert.equal(st.state.channels[0].assign.lr, true);
    st.setChannel(0, "nonsense", 1);
    assert.equal(st.state.channels[0].nonsense, undefined);
    st.setChannel(CR.TAPE, "pan", 1); // the tape strip has only a level and TAPE TO MAIN MIX
    assert.equal(st.state.channels[CR.TAPE].pan, 0);
    st.setBus("soloBus", "mode", "loud");
    assert.equal(st.state.soloBus.mode, "afl");
    st.setBus("sub3", "toMainR", true);
    assert.equal(st.state.sub3.toMainR, true);
    st.setListen("sub4");
    assert.equal(st.state.listen, "sub4");
    st.setListen("pfl"); // the generic mixer's word; not a 1604 destination
    assert.equal(st.state.listen, "sub4");
  });

  it("knob tapers: unity at the centre detent, the manual's maximum boost at the top", () => {
    near(CR.LAWS.send.toDb(0.5), 0);
    near(CR.LAWS.send.toDb(1), 15);
    near(CR.LAWS.master.toDb(1), 10);
    near(CR.LAWS.tape.toDb(1), 20);
    near(CR.LAWS.mono.toDb(0.67), 0);
    near(CR.LAWS.mono.toDb(1), 6);
    near(CR.LAWS.fader.toDb(0.75), 0);
    for (const law of Object.values(CR.LAWS)) for (const db of [-30, -10, 0, 5]) near(law.toDb(law.toPos(db)), db, 0.01);
    near(CR.posToMidFreq(CR.midFreqToPos(2500)), 2500, 0.01);
  });

  it("outputs are grouped for listening: MAIN and MONO are the main mix, C-R is the phones", () => {
    const s = createMixerState("cr1604");
    assert.equal(listenGroupOf(s, "mono"), "main");
    assert.equal(listenGroupOf(s, "cr-l"), "phones");
    assert.equal(listenGroupOf(s, "sub2"), "sub2");
  });
});

describe("CR1604 patching", () => {
  const rigWith = (...extra) => {
    const s = createMixerState("cr1604");
    s.rig.devices.push({ id: "mic", type: "condenser-mic", sourceId: "drums" }, { id: "kb", type: "line-source", sourceId: "keys" }, { id: "lap", type: "stereo-laptop", sourceId: "preshow" }, ...extra);
    return new MixerStore(s);
  };

  it("XLR goes in the MIC jack, 1/4\" in the LINE jack; one input per channel", () => {
    const st = rigWith();
    assert.equal(channelPortRef(0, { plug: "xlr", mixerType: "cr1604" }), "mixer/ch1-mic");
    assert.equal(channelPortRef(0, { plug: "ts14", mixerType: "cr1604" }), "mixer/ch1-line");
    assert.ok(st.connect("mic/out", "mixer/ch1-mic", "xlr").ok);
    const r = st.connect("kb/out", "mixer/ch1-line", "ts");
    assert.equal(r.ok, false);
    assert.match(r.reason, /one input per channel/);
    assert.ok(st.connect("kb/out", "mixer/ch2-line", "ts").ok);
  });

  it("the LINE jack is padded 20 dB and the condenser needs the rear PHANTOM switch", () => {
    const st = rigWith();
    st.connect("mic/out", "mixer/ch1-mic", "xlr");
    st.connect("kb/out", "mixer/ch2-line", "ts");
    let m = mix(st);
    assert.equal(m.channels[1].input.padDb, -20);
    assert.equal(m.channels[0].input.status, "no-phantom");
    st.setAllPhantom(true);
    m = mix(st);
    assert.equal(m.channels[0].input.status, "ok");
    assert.equal(st.state.channels[CR.TAPE].phantom, false); // the tape input has no phantom
  });

  it("a laptop goes into TAPE INPUT with a 3.5 mm ↔ RCA cable, not into a mono channel", () => {
    const st = rigWith();
    assert.ok(st.connect("lap/out", "mixer/tape-in", "mini-rca").ok);
    const m = mix(st);
    assert.equal(m.channels[CR.TAPE].sourceId, "preshow");
    assert.equal(m.channels[CR.TAPE].input.stereo, true);
  });
});

describe("CR1604 free play", () => {
  it("is the only scenario the 1604 runs for now", () => {
    assert.deepEqual(scenariosFor("cr1604").map((s) => s.id), ["free-play"]);
    assert.ok(scenariosFor("generic").length > 1);
  });

  it("builds the same gig: every cable valid, every band channel in the Good band and heard", () => {
    const st = gig();
    const rig = { devices: st.state.rig.devices, cables: [] };
    for (const c of st.state.rig.cables) {
      const r = checkConnection(rig, c.from, c.to, c.cable);
      assert.ok(r.ok, `${c.from} → ${c.to} (${c.cable}): ${r.reason}`);
      rig.cables.push(c);
    }
    const m = mix(st);
    for (const c of m.channels.filter((c) => c.sourceId && c.sourceId !== "preshow")) {
      assert.equal(c.band, "good", c.sourceId);
      assert.ok(c.heardMainDb > -40, `${c.sourceId} heard in the house`);
    }
    assert.ok(st.state.rig.cables.some((c) => c.from === `${sourceDeviceId("preshow")}/out` && c.to === "mixer/tape-in"));
  });

  it("matches the generic mixer's mix: same house and wedge levels per source", () => {
    const a = computeMix(buildScenarioState(FREE), SOURCES_BY_ID, STEMS);
    const b = mix(gig());
    for (const id of ["drums", "bass", "keys", "lead-vocal"]) {
      const x = a.channels.find((c) => c.sourceId === id);
      const y = b.channels.find((c) => c.sourceId === id);
      near(x.heardMainDb, y.heardMainDb, 0.6);
      near(x.aux.aux1.heardDb, y.aux.aux1.heardDb, 0.6);
      near(x.aux.aux2.heardDb, y.aux.aux2.heardDb, 0.6);
    }
  });
});

describe("CR1604 signal flow (manual pp. 17–27)", () => {
  it("MUTE cuts L-R and the post sends; PRE sends keep going", () => {
    const st = gig();
    const before = ch(st, "lead-vocal");
    st.setChannel(VOX, "enabled", false);
    let v = ch(st, "lead-vocal");
    assert.equal(v.heardMainDb, -Infinity);
    near(v.aux.aux1.heardDb, before.aux.aux1.heardDb); // PRE is down in the gig
    st.setChannel(VOX, "pre", false);
    v = ch(st, "lead-vocal");
    assert.equal(v.aux.aux1.heardDb, -Infinity);
  });

  it("PRE sends ignore the fader; post sends follow it", () => {
    const st = gig();
    const base = ch(st, "lead-vocal").aux.aux1.monitorDb;
    st.setChannel(VOX, "level", CR.LAWS.fader.toPos(-10));
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, base);
    st.setChannel(VOX, "pre", false);
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, base - 10, 0.1);
  });

  it("AUX 3/4 knobs are post-fader and 5/6 SHIFT moves them to AUX SENDS 5/6", () => {
    const st = gig();
    st.setSend(VOX, "aux3", 0.5);
    let v = ch(st, "lead-vocal");
    assert.ok(v.aux.aux3.monitorDb > -40);
    assert.equal(v.aux.aux5.monitorDb, -Infinity);
    st.setChannel(VOX, "shift", true);
    v = ch(st, "lead-vocal");
    assert.equal(v.aux.aux3.monitorDb, -Infinity);
    near(v.aux.aux5.monitorDb, ch(gig(), "lead-vocal").inputPeakDb + CR.LAWS.fader.toDb(st.state.channels[VOX].level));
    st.setChannel(VOX, "enabled", false);
    assert.equal(ch(st, "lead-vocal").aux.aux5.monitorDb, -Infinity);
  });

  it("AUX SEND masters exist for 1 and 2 only", () => {
    const st = gig();
    const base = ch(st, "lead-vocal").aux.aux1.monitorDb;
    st.setBusLevel("aux1", CR.LAWS.master.toPos(-6));
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, base - 6, 0.1);
    st.setBusLevel("aux3", 0.1); // no such master
    assert.equal(st.state.aux3, undefined);
  });

  it("no L-R assign, no house: subgroups need ASSIGN TO MAIN MIX", () => {
    const st = gig();
    const direct = ch(st, "drums").mainDb.L;
    st.setChannel(DRUMS, "assign.lr", false);
    assert.equal(ch(st, "drums").heardMainDb, -Infinity);
    st.setChannel(DRUMS, "assign.s12", true);
    assert.ok(ch(st, "drums").subs.sub1 > -40);
    assert.equal(ch(st, "drums").heardMainDb, -Infinity);
    st.setBus("sub1", "toMainL", true);
    st.setBus("sub2", "toMainR", true);
    near(ch(st, "drums").mainDb.L, direct); // subs at U: same level as going direct
    st.setBusLevel("sub1", CR.LAWS.fader.toPos(-10));
    near(ch(st, "drums").mainDb.L, direct - 10, 0.1);
  });

  it("odd subgroups get the left side, even the right; a sub on both sides drops 3 dB", () => {
    const st = gig();
    st.setChannel(DRUMS, "assign.s34", true);
    st.setChannel(DRUMS, "pan", -1);
    let d = ch(st, "drums");
    assert.ok(d.subs.sub3 > -40);
    assert.equal(d.subs.sub4, -Infinity);
    st.setChannel(DRUMS, "assign.lr", false);
    st.setChannel(DRUMS, "pan", 0);
    st.setBus("sub3", "toMainL", true);
    const one = ch(st, "drums").mainDb.L;
    st.setBus("sub3", "toMainR", true);
    near(ch(st, "drums").mainDb.L, one - 3.01, 0.05);
  });

  it("TAPE IN reaches the house only with TAPE TO MAIN MIX, in stereo", () => {
    const st = gig();
    let t = mix(st).channels[CR.TAPE];
    assert.equal(t.heardMainDb, -Infinity);
    st.setChannel(CR.TAPE, "toMain", true);
    t = mix(st).channels[CR.TAPE];
    assert.equal(t.band, "good"); // a laptop at the TAPE IN detent sits at a healthy level
    near(t.mainDb.L, t.mainDb.R);
    assert.ok(t.heardMainDb > -30);
  });

  it("SOLO replaces the C-R/PHONES source; LEVEL SET (PFL) taps before the fader", () => {
    const st = gig();
    assert.deepEqual(mix(st).phones, { solo: false, soloed: [], auxSolo: [], mode: "pfl", sources: ["main"] });
    st.setChannel(VOX, "solo", true);
    st.setChannel(VOX, "level", 0);
    const m = mix(st);
    assert.equal(m.phones.solo, true);
    assert.deepEqual(m.phones.soloed, ["7"]);
    near(m.channels[VOX].pflDb, m.channels[VOX].inputPeakDb); // fader down, PFL still hears it
    st.setBus("aux2", "solo", true);
    assert.deepEqual(mix(st).phones.auxSolo, ["aux2"]);
  });

  it("MONO is the sum of MAIN L and R through MONO LEVEL", () => {
    const st = gig();
    const v = ch(st, "lead-vocal"); // centre-panned: the same signal on both sides, summed and halved
    near(v.monoDb, v.mainDb.L, 0.05);
    st.setBusLevel("mono", 1);
    near(ch(st, "lead-vocal").monoDb, v.monoDb + 6, 0.05);
  });
});
