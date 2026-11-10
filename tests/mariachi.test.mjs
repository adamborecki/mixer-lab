// Mariachi in Salmon (js/scenarios.js MARIACHI_GIGS): Mariachi Panteras' own
// dress-rehearsal stems on the full X32; nine wireless handhelds on receivers
// 1 and 2; six wedges on six mixes (one active, three speakON-or-1/4" wedges on
// the KM750s, two 1/4"-only wedges on the Crown); the hall's own speakers as the
// house. And the gear facts the scenarios lean on: which jack takes which plug,
// and a handheld that's dead whatever its button says.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SONGS, SOURCES_BY_ID, STEMS, songFits, useSong } from "../audio/source-manifest.js";
import { DEVICE_TYPES, plugFitsJack, sourceTrimDb } from "../js/connection-model.js";
import { MODELS, MixerStore, computeMix } from "../js/mixer-state.js";
import { MAR_MICS, SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";
import { BOARD_SCENARIOS } from "../js/board-scenarios.js";
import { GIGS } from "../js/themes.js";

function gig(song = "mariachi") {
  useSong(song);
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  const ch = (src) => mix().channels.find((c) => c.sourceId === src);
  return { st, mix, ep, ch };
}
const done = () => useSong(DEFAULT_SONG);
// Console channel (1-based) for each handheld: rainbow order on receiver 1, yellow (CH 3) skipped; the vocal mics on receiver 2.
const CHANNELS = { "mar-vln1": 1, "mar-vln2": 2, "mar-vln3": 4, "mar-vln4": 5, "mar-gtrn": 6, "mar-vih": 7, "mar-gtra": 8, "mar-vox1": 9, "mar-vox2": 10 };

describe("Mariachi in Salmon: the rig", () => {
  it("plays on the full X32 only, as a Chapman gig listing every x32-mar- scenario in order", () => {
    assert.deepEqual(MODELS.filter((m) => songFits("mariachi", m)), ["x32"]);
    const g = GIGS.find((x) => x.id === "mariachi");
    assert.deepEqual(g.ids, BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-mar-")).map((s) => s.id));
    assert.equal(g.ids[0], "x32-mar-tour", "the first scenario is the whole rig working");
    assert.ok(BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-mar-")).every((s) => s.song === "mariachi"));
  });

  it("has the nine stems, none of them trumpets, from song 1 of the dress rehearsal", () => {
    const stems = SONGS.mariachi.stems;
    assert.deepEqual(Object.keys(stems), ["vocal-1", "vocal-2", "violin-1", "violin-2", "violin-3", "violin-4", "guitarron", "vihuela", "guitarra"]);
    assert.ok(Object.values(stems).every((s) => s.file.startsWith("mariachi-1-") && s.channels === 1));
    assert.ok(!SONGS.mariachi.sources.some((s) => /trumpet/i.test(s.name)));
  });

  it("puts the nine handhelds on CH 1-10 by radio, CH 3 empty, every one in the good range", () => {
    const { ch, st } = gig();
    assert.deepEqual([...MAR_MICS].sort(), Object.keys(CHANNELS).sort());
    for (const [s, n] of Object.entries(CHANNELS)) {
      assert.equal(ch(s).index, n - 1, s);
      assert.equal(ch(s).band, "good", `${s}: ${ch(s).band}`);
    }
    assert.ok(!computeMix(st.state, SOURCES_BY_ID, STEMS).channels[2].sourceId, "CH 3 (yellow) isn't used");
    assert.deepEqual(st.state.rig.devices.find((d) => d.id === "mixer").inSource, [0, 0, 0, 1], "Salmon's default routing");
    done();
  });

  it("feeds six wedges six mixes: MIX n on S32 OUT n, the active one on its own, the rest through the right amp", () => {
    const { st, ep } = gig();
    const want = [["mar-w1", "out3", null], ["mar-w2", "out4", "mar-km750-1"], ["mar-w3", "out5", "mar-km750-1"], ["mar-w4", "out6", "mar-km750-2"], ["mar-w5", "out7", "mar-crown"], ["mar-w6", "out8", "mar-crown"]];
    for (const [id, out, amp] of want) {
      assert.equal(ep(id).valid, true, id);
      assert.equal(ep(id).output, out, id);
      assert.equal(ep(id).viaAmp, amp, id);
      assert.equal(st.state.routing[out], `mix${out.slice(3)}`);
    }
    assert.equal(ep("cme-hall-l").output, "out15");
    assert.equal(ep("cme-hall-r").output, "out16");
    done();
  });

  it("puts the vocal mics in every wedge", () => {
    const { ch } = gig();
    for (const b of ["mix3", "mix4", "mix5", "mix6", "mix7", "mix8"]) for (const s of ["mar-vox1", "mar-vox2"]) assert.ok(ch(s).aux[b].heardDb > -45, `${s} in ${b}`);
    done();
  });
});

describe("Mariachi in Salmon: the gear", () => {
  it("wedges 2-4 take speakON or 1/4\"; wedges 5 and 6 take 1/4\" only; the KM750s put out speakON, the Crown 1/4\"", () => {
    const combo = DEVICE_TYPES["passive-wedge-combo"].ports[0].jack;
    assert.ok(plugFitsJack("speakon", combo) && plugFitsJack("ts14", combo));
    const quarter = DEVICE_TYPES["passive-speaker"].ports[0].jack;
    assert.ok(plugFitsJack("ts14", quarter) && !plugFitsJack("speakon", quarter));
    assert.ok(DEVICE_TYPES["km750-nl4"].ports.filter((p) => p.dir === "out").every((p) => p.jack === "speakon"));
    assert.ok(DEVICE_TYPES["crown-amp"].ports.filter((p) => p.dir === "out").every((p) => p.jack === "quarter"));
  });

  it("won't put a speakON cable on a 1/4\"-only wedge", () => {
    const { st } = gig();
    const c = st.state.rig.cables.find((x) => x.to === "mar-w5/in");
    st.disconnect(c.id);
    assert.ok(!st.connect("mar-km750-2/out-b", "mar-w5/in", "speakon").ok);
    assert.ok(st.connect("mar-crown/out-a", "mar-w5/in", "speaker").ok);
    done();
  });

  it("a dead handheld is silent whatever its button says, and its spare is a different channel", () => {
    assert.equal(sourceTrimDb({ dead: 1, mic: 0 }, {}), -Infinity);
    assert.equal(sourceTrimDb({ mic: 0 }, {}), 0);
    useSong("mariachi");
    const def = BOARD_SCENARIOS.x32.find((s) => s.id === "x32-mar-swap");
    const st = new MixerStore(buildScenarioState(def, SOURCES_BY_ID, "x32"));
    const mix = computeMix(st.state, SOURCES_BY_ID, STEMS);
    assert.equal(mix.channels.find((c) => c.sourceId === "mar-spare").index, 11, "the spare is on CH 12");
    assert.equal(mix.channels.find((c) => c.sourceId === "mar-vln1").band, "none", "the red mic is dead");
    done();
  });

  it("leaves CME alone: receivers 1 and 2 pair nothing there", () => {
    const { st } = gig("cme");
    for (const id of ["cme-rx1", "cme-rx2"]) assert.equal(st.state.rig.devices.find((d) => d.id === id).pairs, undefined, id);
    done();
  });
});
