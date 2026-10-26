// Vocal Jazz in Salmon (js/scenarios.js VJ_GIGS): its song only plays on the
// full X32, the handhelds come in on LOCAL at one GAIN, MIX 1 reaches three
// passive wedges through the S32 and the NX3000, and speakON fits only speakON.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CREDITS, DEFAULT_SONG, SONGS, SOURCES_BY_ID, STEMS, songFits, useSong } from "../audio/source-manifest.js";
import { loopPoints } from "../js/transport.js";
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
const MICS = Array.from({ length: 11 }, (_, i) => `vj-${i + 1}`);
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
    for (const c of mix().channels.slice(0, 11)) assert.ok(["good", "hot"].includes(c.band), c.sourceId);
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

// The Vocal Jazz Ensemble's own recording (audio/source-manifest.js): two
// pieces, eleven singers on eleven handhelds, every track at one gain, loops
// from breath to breath with lengths of their own.
describe("the Vocal Jazz Ensemble's two pieces", () => {
  const PROGRAM = ["Allie Hulbert", "Karmyn Trufant", "Magnolia Bycott", "Abbey Sourov", "Nina Brown", "Shayne Sayre", "Paola Morales", "Jessica Kaber", "Brandon Borlaza", "Michael Rogachefsky", "Silas Arora"];

  for (const id of ["almost-like", "love-me", "vj"]) {
    it(`${id}: mic n is the program's nth singer, every track mono at the same +10 dB`, () => {
      const song = SONGS[id];
      assert.deepEqual(song.sources.map((s) => s.musician), PROGRAM);
      song.sources.forEach((s, i) => assert.equal(s.order, i + 1));
      for (const stem of Object.values(song.stems)) {
        assert.equal(stem.normalizeDb, 10);
        assert.equal(stem.channels, 1);
        assert.ok(stem.monoPeakDb <= -1 && stem.monoPeakDb > -12, stem.file);
      }
    });
  }

  it("Salmon plays the ensemble's own “Almost Like Being in Love”", () => {
    assert.equal(SONGS.vj.set.full.basePath, SONGS["almost-like"].set.full.basePath);
    assert.ok(SONGS.vj.sources.every((s) => s.deviceType === "wireless-handheld" && /\(black|\(gray/.test(s.name)));
  });

  it("each section loops for its own length; the excerpt for the song's", () => {
    const set = SONGS["love-me"].set;
    assert.deepEqual(loopPoints(set, "excerpt"), set.loop);
    const solo = set.sections.find((s) => s.id === "bars-72");
    assert.deepEqual(loopPoints(set, "bars-72"), { start: 0.5, end: 0.5 + solo.length });
    assert.deepEqual(loopPoints(SONGS.persephone.set, "bars-5"), SONGS.persephone.set.loop);
  });

  it("puts all eleven on the X32 at a good level, and mics 1–8 on Mixer A with 9–11 left on stage", () => {
    useSong("love-me");
    const x32 = computeMix(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), SOURCES_BY_ID, "x32"), SOURCES_BY_ID, STEMS);
    for (let i = 0; i < 11; i++) {
      assert.equal(x32.channels[i].sourceId, `vj-${i + 1}`);
      assert.ok(["good", "hot"].includes(x32.channels[i].band), `vj-${i + 1}`);
    }
    const state = buildScenarioState(SCENARIOS_BY_ID["free-play"], SOURCES_BY_ID, "generic");
    const a = computeMix(state, SOURCES_BY_ID, STEMS);
    assert.deepEqual(a.channels.slice(0, 8).map((c) => c.sourceId), MICS.slice(0, 8));
    assert.equal(a.channels[8].sourceId, null);
    for (const id of ["vj-9", "vj-10", "vj-11"]) assert.ok(state.rig.devices.some((d) => d.sourceId === id), `${id} is on stage`);
    useSong(DEFAULT_SONG);
  });

  it("credits both pieces, their arrangers and every singer", () => {
    for (const title of ["Almost Like Being in Love", "Love Me or Leave Me"]) {
      const c = CREDITS.find((x) => x.title === title);
      const text = c.lines.flat().join(" ");
      for (const name of [...PROGRAM, "Alex Robinson", "Celine You"]) assert.ok(text.includes(name), `${title}: ${name}`);
    }
  });
});
