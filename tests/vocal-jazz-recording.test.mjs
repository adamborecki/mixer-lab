// Vocal Jazz v2 in Salmon: the recording session (js/scenarios.js VJR_GIGS,
// js/recording.js): the handhelds through the wireless rack, four condensers on
// the S32, and Logic on the FOH Mac mini over the X32's X-DANTE card.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SOURCES_BY_ID, STEMS, useSong } from "../audio/source-manifest.js";
import { MixerStore, computeMix } from "../js/mixer-state.js";
import { SCENARIOS_BY_ID, VJR_CONDENSERS, VJR_MICS, buildScenarioState, scenarioFor } from "../js/scenarios.js";
import { cardSource, logicTracks } from "../js/recording.js";
import { BOARD_SCENARIOS } from "../js/board-scenarios.js";

const MAC = "src-preshow";
function session() {
  useSong("vjr");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const tracks = () => logicTracks(st.state, SOURCES_BY_ID, STEMS);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  return { st, mix, tracks, ep };
}
const done = () => useSong(DEFAULT_SONG);
const recorded = (tracks, t, src) => tracks[t].ok && tracks[t].sourceId === src;
// The four condensers off the S32 into LOCAL 29-32, as the session did.
function goLocal(st) {
  ["room-pair/out-l", "room-pair/out-r", "piano-pair/out-l", "piano-pair/out-r"].forEach((from, i) => {
    st.disconnect(st.state.rig.cables.find((c) => c.from === from).id);
    assert.ok(st.connect(from, `mixer/ch${29 + i}-mic`, "xlr").ok);
  });
  st.setDevice("mixer", "inSource.3", 0);
}

describe("Vocal Jazz v2: the recording session", () => {
  it("has fourteen scenarios on the X32, taking turns with the two pieces", () => {
    const vjr = BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-vjr-"));
    assert.equal(vjr.length, 14);
    assert.equal(vjr[0].id, "x32-vjr-tour");
    vjr.forEach((s, i) => assert.equal(s.song, i % 2 ? "vjr-love" : "vjr", s.id));
  });

  it("puts the handhelds on CH 1-11 by radio, the condensers on CH 25-28 over the S32, and the hall's speakers off", () => {
    const { mix, ep, st } = session();
    const m = mix();
    VJR_MICS.forEach((id, i) => assert.equal(m.channels[i].sourceId, id));
    VJR_CONDENSERS.forEach((id, i) => {
      assert.equal(m.channels[24 + i].sourceId, id);
      assert.ok(["good", "hot"].includes(m.channels[24 + i].band), id);
      assert.ok(st.state.channels[24 + i].phantom, `${id} has +48 V`);
    });
    for (const id of ["vj-w1", "vj-w2", "vj-w3"]) assert.equal(ep(id).output, "out1", id);
    assert.equal(st.state.rig.devices.find((d) => d.id === "cme-mix5").lvl45, 0, "no audience: the hall's speakers turned down");
    done();
  });

  it("records the singers on Audio 1-11 and the condensers on Audio 17-20", () => {
    const { tracks } = session();
    const t = tracks();
    assert.equal(t.length, 20);
    VJR_MICS.forEach((id, i) => assert.ok(recorded(t, i, id), id));
    VJR_CONDENSERS.forEach((id, i) => assert.ok(recorded(t, 16 + i, id), id));
    for (const k of [11, 12, 13, 14, 15]) assert.equal(t[k].ok, false, `Audio ${k + 1}: an unused receiver channel`);
    done();
  });

  it("records inputs, not channels: with the card on Local 25-32, Audio 17-20 get the PTU-7000, not the S32", () => {
    const { st, tracks, mix } = session();
    st.setDevice("mixer", "cardOut.3", "local3");
    assert.deepEqual(cardSource(st.state.rig, 25), { kind: "local", n: 25 });
    const t = tracks();
    for (const k of [16, 17, 18, 19]) assert.equal(t[k].ok, false);
    assert.match(t[16].jack, /LOCAL 25/);
    assert.equal(mix().channels[24].sourceId, "room-l", "the console still hears it on CH 25");
    done();
  });

  it("follows the condensers to LOCAL 29-32: +48 V and Logic's inputs have to follow too", () => {
    const { st, tracks, mix } = session();
    goLocal(st);
    VJR_CONDENSERS.forEach((id, i) => assert.equal(mix().channels[28 + i].sourceId, id));
    st.setDevice("mixer", "cardOut.3", "local3");
    st.setDeviceMany(MAC, [29, 30, 31, 32].map((n, i) => [`tracks.${16 + i}.in`, n]));
    // CH 29-32 are the X32's own preamps: no +48 V yet.
    for (const k of [16, 17, 18, 19]) assert.equal(tracks()[k].ok, false);
    for (const i of [28, 29, 30, 31]) st.setChannel(i, "phantom", true);
    for (const i of [28, 29, 30, 31]) st.setChannel(i, "gainDb", 38);
    VJR_CONDENSERS.forEach((id, i) => assert.ok(recorded(tracks(), 16 + i, id), id));
    done();
  });

  it("stops at each hop on the Mac mini: the Cat5e, Dante Virtual Soundcard, Logic's input device, Dante Controller", () => {
    const check = (fault, why) => {
      const { st, tracks } = session();
      fault(st);
      const t = tracks();
      assert.ok(t.every((x) => !x.ok), why.source);
      assert.match(t[0].why, why);
      done();
    };
    check((st) => st.disconnect(st.state.rig.cables.find((c) => c.from === "mixer/card-dante").id), /Cat5e/);
    check((st) => st.setDevice(MAC, "dvs", 0), /Dante Virtual Soundcard is stopped/);
    check((st) => st.setDevice(MAC, "logicIn", 1), /SSL 2\+/);
    check((st) => st.setDeviceMany(MAC, Array.from({ length: 32 }, (_, i) => [`macRx.${i}`, 0])), /Dante Controller/);
  });

  it("loses only the S32's inputs without the AES50 link", () => {
    const { st, tracks } = session();
    st.disconnect(st.state.rig.cables.find((c) => c.from === "s32/aes50a").id);
    const t = tracks();
    VJR_MICS.forEach((id, i) => assert.ok(recorded(t, i, id), id));
    for (const k of [16, 17, 18, 19]) assert.match(t[k].why, /AES50/);
    done();
  });

  it("gives ascending inputs as one change, and a buzz on the S32 changes no levels", () => {
    const { st, tracks } = session();
    const before = tracks().map((t) => t.peakDb);
    st.state.rig.devices.find((d) => d.id === "s32").buzz = 1; // a scenario fault, not a control
    assert.deepEqual(tracks().map((t) => t.peakDb), before);
    assert.equal(tracks()[16].buzz, true, "Audio 17 hears the buzzing S32");
    st.setDeviceMany(MAC, [27, 28, 29, 30].map((n, i) => [`tracks.${16 + i}.in`, n]));
    assert.deepEqual(st.state.rig.devices.find((d) => d.id === MAC).tracks.slice(16).map((t) => t.in), [27, 28, 29, 30]);
    done();
  });
});
