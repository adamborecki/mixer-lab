// Outboard gear and the CR1604's extra jacks: reverb, Zoom F8, the stereo room
// pair, direct outs, inserts, tape out and the aux returns (docs/CR1604.md).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { F8, cardStats, createF8, createPair, micResponse, setDeviceValue, techniqueOf, trackInputs } from "../js/devices.js";
import { MixerStore, computeMix, createMixerState, listenGroupOf } from "../js/mixer-state.js";
import { checkConnection } from "../js/connection-model.js";
import { SCENARIOS_BY_ID, STAGE_GEAR, buildScenarioState } from "../js/scenarios.js";
import { SOURCES_BY_ID, STEMS } from "../audio/source-manifest.js";
import { encodeWav } from "../js/wav.js";

const gig = () => new MixerStore(buildScenarioState(SCENARIOS_BY_ID["free-play"], SOURCES_BY_ID, "cr1604"));
const f8 = () => ({ id: "rec", type: "zoom-f8", ...createF8() });

describe("stereo room pair", () => {
  it("names ORTF, NOS and XY only when angle and spacing match", () => {
    assert.equal(techniqueOf({ spacingCm: 17, angleDeg: 110 }).id, "ortf");
    assert.equal(techniqueOf({ spacingCm: 30, angleDeg: 90 }).id, "nos");
    assert.equal(techniqueOf({ spacingCm: 0, angleDeg: 100 }).id, "xy");
    assert.equal(techniqueOf({ spacingCm: 17, angleDeg: 90 }), null);
    assert.equal(techniqueOf({ spacingCm: 25, angleDeg: 110 }), null);
  });

  it("a source on the left is louder in the left mic and arrives there first", () => {
    const left = { id: "guitars", pan: -0.8 };
    const [l, r] = micResponse(createPair(), left);
    assert.ok(l.gain > r.gain);
    assert.ok(l.delay < r.delay);
    const [cl, cr] = micResponse(createPair(), { id: "lead-vocal", pan: 0 });
    assert.ok(Math.abs(cl.gain - cr.gain) < 1e-9, "centre is centre");
  });

  it("a wider angle makes a wider image; coincident XY has no time difference", () => {
    const src = { id: "keys", pan: 0.6 };
    const diff = (pair) => {
      const [l, r] = micResponse(pair, src);
      return r.gain - l.gain;
    };
    assert.ok(diff({ spacingCm: 17, angleDeg: 130 }) > diff({ spacingCm: 17, angleDeg: 60 }));
    const [l, r] = micResponse({ spacingCm: 0, angleDeg: 90 }, src);
    assert.equal(l.delay, r.delay);
  });
});

describe("Zoom F8", () => {
  it("a linked pair moves together; linking copies the odd track to the even one", () => {
    const d = f8();
    setDeviceValue(d, "tracks.0.trimDb", 44);
    setDeviceValue(d, "link.0", true);
    assert.equal(d.tracks[1].trimDb, 44);
    setDeviceValue(d, "tracks.1.phantom", true);
    assert.equal(d.tracks[0].phantom, true);
    setDeviceValue(d, "tracks.2.arm", true); // pair 3/4 isn't linked
    assert.equal(d.tracks[3].arm, false);
  });

  it("dual channel: tracks 5–8 record inputs 1–4, starting 12 dB lower", () => {
    const d = f8();
    setDeviceValue(d, "tracks.0.trimDb", 40);
    setDeviceValue(d, "tracks.0.arm", true);
    setDeviceValue(d, "dual.0", true);
    assert.deepEqual(trackInputs(d), [0, 1, 2, 3, 0, 5, 6, 7]);
    assert.equal(d.tracks[4].trimDb, 40 + F8.dualOffsetDb);
    assert.equal(d.tracks[4].arm, true);
  });

  it("validates settings and ignores unknown keys", () => {
    const d = f8();
    assert.equal(setDeviceValue(d, "tracks.0.trimDb", 200), true);
    assert.equal(d.tracks[0].trimDb, F8.gainMax);
    assert.equal(setDeviceValue(d, "tracks.9.arm", true), false);
    assert.equal(setDeviceValue(d, "tape", 1), false);
  });

  it("a 32 GB card at 48 kHz / 24-bit: about 15½ hours for four tracks", () => {
    const d = f8();
    for (const t of [0, 1, 2, 3]) d.tracks[t].arm = true;
    const s = cardStats(d);
    assert.equal(s.armed, 4);
    assert.ok(Math.abs(s.secondsLeft / 3600 - 32e9 / (48000 * 3 * 4) / 3600) < 1e-9);
    assert.equal(cardStats(f8()).secondsLeft, Infinity);
  });

  it("its inputs take sources directly, phantom per input, line on the 1/4″ path", () => {
    const st = gig();
    assert.ok(st.connect("room-pair/out-l", "rec/in1", "xlr").ok);
    assert.ok(st.connect("mixer/tape-out-l", "rec/in3", "rca-ts").ok);
    let rec = computeMix(st.state, SOURCES_BY_ID, STEMS).rig.recorders.rec;
    assert.equal(rec[0].sourceId, "room-l");
    assert.equal(rec[0].status, "no-phantom");
    assert.equal(rec[2].path, "line");
    st.setDevice("rec", "tracks.0.phantom", true);
    rec = computeMix(st.state, SOURCES_BY_ID, STEMS).rig.recorders.rec;
    assert.equal(rec[0].status, "ok");
  });

  it("a line output into a mic (XLR) input is flagged as far too hot", () => {
    const st = gig();
    assert.ok(st.connect("mixer/aux6", "rec/in5", "xlr-trs").ok);
    const rec = computeMix(st.state, SOURCES_BY_ID, STEMS).rig.recorders.rec;
    assert.equal(rec[4].path, "mic");
    assert.equal(rec[4].status, "hot");
  });
});

describe("CR1604 outboard jacks", () => {
  it("the gig has the reverb on AUX 3 → AUX RETURN 1, and the recorder and pair unpatched", () => {
    const s = gig().state;
    const ids = s.rig.devices.map((d) => d.id);
    for (const id of ["reverb", "rec", "room-pair"]) assert.ok(ids.includes(id), id);
    assert.ok(s.rig.cables.some((c) => c.from === "mixer/aux3" && c.to === "reverb/in-l"));
    assert.ok(s.rig.cables.some((c) => c.from === "reverb/out-r" && c.to === "mixer/ret1-r"));
    assert.ok(!s.rig.cables.some((c) => c.to.startsWith("rec/") || c.from.startsWith("room-pair/")));
    assert.ok(s.channels[6].auxSends.aux3 > 0, "lead vocal sends to the reverb");
    assert.deepEqual(computeMix(s, SOURCES_BY_ID, STEMS).rig.returns.ret1, { L: true, R: true });
  });

  it("the patch rules keep effects and returns in their places", () => {
    const st = gig();
    st.disconnect(st.state.rig.cables.find((c) => c.to === "mixer/ret1-l").id);
    st.disconnect(st.state.rig.cables.find((c) => c.from === "src-drums/out").id);
    const rig = st.state.rig;
    assert.equal(checkConnection(rig, "src-drums/out", "mixer/ret1-l", "xlr-trs").ok, false); // a mic into a return
    assert.equal(checkConnection(rig, "src-drums/out", "rec/in8", "xlr").ok, true); // a mic straight into the recorder
    assert.equal(checkConnection(rig, "src-keys/out", "reverb/in-r", "ts").ok, false); // effects are fed from the mixer
    assert.equal(checkConnection(rig, "mixer/aux4", "reverb/in-r", "trs").ok, true);
  });

  it("new outputs have listening groups: tape out is the main mix", () => {
    const s = createMixerState("cr1604");
    assert.equal(listenGroupOf(s, "tape-out-l"), "main");
    assert.equal(listenGroupOf(s, "ch3-direct"), "direct3");
    assert.equal(listenGroupOf(s, "ch12-insert"), "insert12");
  });

  it("aux return controls validate; RETURNS SOLO counts as a solo", () => {
    const st = gig();
    st.setBus("ret1", "toAux", 2);
    assert.equal(st.state.ret1.toAux, 1);
    st.setBus("ret2", "toSubs", true); // only return 3 has MAIN MIX TO SUBS
    assert.equal(st.state.ret2.toSubs, undefined);
    st.setBus("ret3", "toSubs", true);
    st.setBus("ret4", "crOnly", true);
    assert.equal(st.state.ret3.toSubs && st.state.ret4.crOnly, true);
    st.setBus("soloBus", "returns", true);
    const p = computeMix(st.state, SOURCES_BY_ID, STEMS).phones;
    assert.equal(p.solo, true);
    assert.ok(p.auxSolo.includes("returns"));
  });

  it("STAGE_GEAR builds fresh devices each time", () => {
    const a = STAGE_GEAR.recorder();
    a.tracks[0].arm = true;
    assert.equal(STAGE_GEAR.recorder().tracks[0].arm, false);
  });
});

describe("WAV export", () => {
  it("writes a valid 16-bit poly WAV header and interleaves the tracks", () => {
    const wav = encodeWav([Int16Array.from([1, 2]), Int16Array.from([-1, -2])], 48000);
    const v = new DataView(wav);
    const text = (o) => String.fromCharCode(...new Uint8Array(wav, o, 4));
    assert.equal(text(0), "RIFF");
    assert.equal(text(8), "WAVE");
    assert.equal(v.getUint16(22, true), 2); // channels
    assert.equal(v.getUint32(24, true), 48000);
    assert.equal(v.getUint32(40, true), 8); // 2 frames × 2 channels × 2 bytes
    assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)], [1, -1, 2, -2]);
  });
});
