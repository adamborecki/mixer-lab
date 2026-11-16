// The COB gig in Irvine (js/scenarios.js COB_GIGS): its song only plays on the
// X32 Compact, the SD8 carries outputs only, the STAGEPAS 600BT is the mains'
// amp, the wedges share MIX 1 down a THRU chain, and ROUTING's CARD is silence.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SONGS, SOURCES_BY_ID, STEMS, songFits, useSong } from "../audio/source-manifest.js";
import { MODELS, MixerStore, computeMix } from "../js/mixer-state.js";
import { SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";

function gig() {
  useSong("cob");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32c"), SOURCES_BY_ID, "x32c"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  const cableTo = (ref) => st.state.rig.cables.find((c) => c.to === ref);
  return { st, mix, ep, cableTo };
}
const HEADSETS = "abcdefghijk".split("").map((l) => `hs-${l}`);

describe("COB in Irvine", () => {
  it("casts the Vocal Jazz Ensemble's “Love Me or Leave Me”: headset n is singer n, and the laptop plays silence", () => {
    const cob = SONGS.cob;
    const singers = SONGS["love-me"].sources;
    HEADSETS.forEach((id, i) => {
      const hs = cob.sources.find((s) => s.id === id);
      assert.equal(hs.musician, singers[i].musician);
      assert.equal(cob.stems[hs.stem], SONGS["love-me"].stems[singers[i].stem]);
    });
    assert.equal(cob.set.full.basePath, SONGS["love-me"].set.full.basePath);
    assert.equal(cob.stems.track.file, "cob-track-silent.mp3");
    // Karaoke keeps NOSTRADAMUS's own backing track.
    assert.equal(SONGS.karaoke.stems.track.file, "nostradamus-backing-track.mp3");
  });

  it("plays on the X32 Compact only", () => {
    assert.deepEqual(MODELS.filter((m) => songFits("cob", m)), ["x32c"]);
    assert.ok(songFits("persephone", "mix8"));
  });

  it("puts headsets A–K on inputs 1–11 (LOCAL) and the track on AUX IN 1/2", () => {
    const { mix, st } = gig();
    const m = mix();
    HEADSETS.forEach((id, i) => assert.equal(m.channels[i].sourceId, id));
    assert.equal(m.channels[16].sourceId, "track");
    assert.deepEqual(st.state.rig.devices.find((d) => d.id === "mixer").inSource, [0, 0]);
    useSong(DEFAULT_SONG);
  });

  it("feeds the mains through the STAGEPAS and every wedge from MIX 1 down the THRU chain", () => {
    const { ep } = gig();
    assert.equal(ep("sp6-l").output, "main-l");
    assert.equal(ep("sp6-l").viaAmp, "stagepas");
    assert.equal(ep("sp6-r").output, "main-r");
    for (const id of ["cob-w1", "cob-w2", "cob-w3"]) {
      assert.equal(ep(id).valid, true, id);
      assert.equal(ep(id).output, "mix1", id);
    }
    useSong(DEFAULT_SONG);
  });

  it("silences everything after a broken link in the chain, and nothing before it", () => {
    const { st, ep, cableTo } = gig();
    st.disconnect(cableTo("cob-w2/in").id);
    assert.equal(ep("cob-w1").valid, true);
    assert.equal(ep("cob-w2").valid, false);
    assert.equal(ep("cob-w3").valid, false, "wedge 3 hangs off wedge 2's THRU");
    useSong(DEFAULT_SONG);
  });

  it("loses the floor, not the mics, without the Cat5e", () => {
    const { st, ep, mix, cableTo } = gig();
    st.disconnect(cableTo("mixer/aes50a").id);
    for (const id of ["sp6-l", "sp6-r", "cob-w1", "cob-w2", "cob-w3"]) assert.equal(ep(id).valid, false, id);
    for (const c of mix().channels.slice(0, 11)) assert.ok(c.inputPeakDb > -40, c.sourceId);
    useSong(DEFAULT_SONG);
  });

  it("hears nothing on a block of inputs routed to the CARD (USB)", () => {
    const { st, mix } = gig();
    st.setDevice("mixer", "inSource.0", 2);
    const m = mix();
    for (const c of m.channels.slice(0, 8)) assert.equal(c.input.connected, false, c.index);
    for (const c of m.channels.slice(8, 11)) assert.ok(c.inputPeakDb > -40, c.sourceId);
    useSong(DEFAULT_SONG);
  });
});
