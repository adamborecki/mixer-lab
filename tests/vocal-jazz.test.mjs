// Vocal Jazz in Salmon (js/scenarios.js VJ_GIGS): its song only plays on the
// full X32, the handhelds come in on LOCAL at one GAIN, MIX 1 reaches three
// passive wedges through the S32 and the NX3000, and speakON fits only speakON.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SOURCES_BY_ID, STEMS, songFits, useSong } from "../audio/source-manifest.js";
import { CABLES, DEVICE_TYPES, cableFitsPort } from "../js/connection-model.js";
import { MODELS, MixerStore, computeMix } from "../js/mixer-state.js";
import { SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";

function gig() {
  useSong("vj");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  const cableTo = (ref) => st.state.rig.cables.find((c) => c.to === ref);
  return { st, mix, ep, cableTo };
}
const MICS = Array.from({ length: 13 }, (_, i) => `vj-${i + 1}`);
const WEDGES = ["vj-w1", "vj-w2", "vj-w3"];

describe("Vocal Jazz in Salmon", () => {
  it("plays on the full X32 only", () => {
    assert.deepEqual(MODELS.filter((m) => songFits("vj", m)), ["x32"]);
  });

  it("puts mic n on input n, every one at the same GAIN, on LOCAL with 25-32 on AES50-A", () => {
    const { mix, st } = gig();
    const m = mix();
    MICS.forEach((id, i) => {
      assert.equal(m.channels[i].sourceId, id);
      assert.equal(st.state.channels[i].gainDb, 30, id);
      assert.ok(["good", "hot"].includes(m.channels[i].band), id);
      assert.ok(st.state.channels[i].hpf > 0.02, `${id} has LOW CUT`);
      assert.ok(!st.state.channels[i].compOn, `${id} has no compressor`);
    });
    assert.deepEqual(st.state.rig.devices.find((d) => d.id === "mixer").inSource, [0, 0, 0, 1]);
    useSong(DEFAULT_SONG);
  });

  it("feeds all three wedges from MIX 1 through the S32 and the NX3000's channel A", () => {
    const { ep } = gig();
    for (const id of WEDGES) {
      assert.equal(ep(id).valid, true, id);
      assert.equal(ep(id).output, "out1", id);
      assert.equal(ep(id).viaAmp, "nx3000", id);
    }
    useSong(DEFAULT_SONG);
  });

  it("silences only the wedges after a broken speakON link", () => {
    const { st, ep, cableTo } = gig();
    st.disconnect(cableTo("vj-w2/in").id);
    assert.equal(ep("vj-w1").valid, true);
    assert.equal(ep("vj-w2").valid, false);
    assert.equal(ep("vj-w3").valid, false, "wedge 3 hangs off wedge 2's link");
    useSong(DEFAULT_SONG);
  });

  it("keeps the mics without the AES50 link, and loses the wedges", () => {
    const { st, ep, mix, cableTo } = gig();
    st.disconnect(cableTo("mixer/aes50a").id);
    for (const id of WEDGES) assert.equal(ep(id).valid, false, id);
    for (const c of mix().channels.slice(0, 13)) assert.ok(["good", "hot"].includes(c.band), c.sourceId);
    useSong(DEFAULT_SONG);
  });

  it("fits a speakON cable into speakON jacks only", () => {
    const wedgeIn = DEVICE_TYPES["passive-wedge"].ports.find((p) => p.id === "in");
    assert.ok(cableFitsPort("speakon", wedgeIn));
    assert.ok(!cableFitsPort("xlr", wedgeIn));
    assert.ok(!cableFitsPort("speaker", wedgeIn));
    assert.equal(CABLES.speakon.kind, "speaker");
  });
});
