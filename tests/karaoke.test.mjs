// Karaoke in BH 109 (js/scenarios.js KARAOKE_GIGS): its song only plays on the
// Xenyx, the singers, laptop and Zoom V3 land on their channels, and the room's
// rack (AUX AUDIO INPUT → the Ashly's Ch.1 → the Crown) drives the wall
// speakers, distorting when Ch.1 is set to MIC.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SOURCES_BY_ID, STEMS, songFits, useSong } from "../audio/source-manifest.js";
import { MODELS, MixerStore, computeMix } from "../js/mixer-state.js";
import { COMPACT, fxPreset } from "../js/compact.js";
import { SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";

function gig() {
  useSong("karaoke");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x1204usb"), SOURCES_BY_ID, "x1204usb"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  const cableTo = (ref) => st.state.rig.cables.find((c) => c.to === ref);
  return { st, mix, ep, cableTo };
}

describe("Karaoke in BH 109", () => {
  it("plays on the Xenyx only", () => {
    assert.deepEqual(MODELS.filter((m) => songFits("karaoke", m)), ["x1204usb"]);
  });

  it("puts the SM58s on 1 and 2, the laptop on 5/6 and the V3 on 7/8, both at −10", () => {
    const { mix, st } = gig();
    const m = mix();
    assert.equal(m.channels[0].sourceId, "ky-mic1");
    assert.equal(m.channels[1].sourceId, "ky-mic2");
    assert.equal(m.channels[4].sourceId, "ky-track");
    assert.equal(m.channels[5].sourceId, "ky-v3");
    assert.equal(st.state.channels[4].minus10, true);
    assert.equal(st.state.channels[5].minus10, true);
    for (const i of [0, 1]) assert.equal(st.state.channels[i].lowCut, true);
    for (const c of m.channels.filter((c) => c.sourceId)) assert.equal(c.band, "good", c.sourceId);
    useSong(DEFAULT_SONG);
  });

  it("starts the effects on a COMBINATION FX preset (the room's DLY + REV), back in the MAIN MIX", () => {
    const { st } = gig();
    assert.equal(fxPreset(COMPACT.x1204usb, st.state.fx.program).group, "COMBINATION FX");
    assert.equal(fxPreset(COMPACT.x1204usb, st.state.fx.program).number, 27);
    assert.equal(st.state.ret2.toAlt, false);
    useSong(DEFAULT_SONG);
  });

  it("drives both wall speakers from MAIN L/R through the rack", () => {
    const { ep } = gig();
    for (const [id, out] of [["bh109-l", "main-l"], ["bh109-r", "main-r"]]) {
      assert.equal(ep(id).status, "ok", id);
      assert.equal(ep(id).output, out, id);
      assert.equal(ep(id).viaAmp, "bh109-rack", id);
      assert.equal(ep(id).gainDb, 0, id);
    }
    useSong(DEFAULT_SONG);
  });

  it("distorts both wall speakers with the Ashly's Ch.1 on MIC, and recovers on LINE", () => {
    const { st, ep } = gig();
    st.setDevice("bh109-rack", "ashlyMic", 1);
    for (const id of ["bh109-l", "bh109-r"]) {
      assert.equal(ep(id).status, "hot", id);
      assert.equal(ep(id).gainDb, 30, id);
      assert.ok(ep(id).valid, id);
    }
    st.setDevice("bh109-rack", "ashlyMic", 0);
    for (const id of ["bh109-l", "bh109-r"]) assert.equal(ep(id).status, "ok", id);
    useSong(DEFAULT_SONG);
  });

  it("goes silent on one side without its AUX AUDIO cable", () => {
    const { st, ep, cableTo } = gig();
    st.disconnect(cableTo("bh109-rack/in-b").id);
    assert.equal(ep("bh109-l").valid, true);
    assert.equal(ep("bh109-r").valid, false);
    assert.equal(ep("bh109-r").status, "amp-no-input");
    useSong(DEFAULT_SONG);
  });
});
