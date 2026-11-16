// CME in Salmon: Advanced. Sources on stage in one scenario only: a guest's
// headset on the PTU-7000 (x32-cme-adv-headset) and a kick and snare straight
// into S32 IN 9-10 (x32-cme-adv-inputs). Each is cabled but unheard at
// Salmon's default ROUTING, and lands on CH 9-10 once CH 9-16 listen to it.
// Built from minimal defs (the scenarios themselves live in js/board-scenarios.js).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildScenarioState } from "../js/scenarios.js";
import { MixerStore, computeMix } from "../js/mixer-state.js";
import { COMPACT, levelLaw } from "../js/compact.js";
import { SOURCES_BY_ID, STEMS, useSong } from "../audio/source-manifest.js";

function attempt(id) {
  useSong("cme");
  const def = { id, board: "x32", song: "cme", setup: {}, conditions: [] };
  const st = new MixerStore(buildScenarioState(def, SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const idx = (src) => mix().channels.findIndex((c) => c.sourceId === src);
  return { st, mix, idx };
}

const CASES = [
  // [scenario, block 1's ROUTING → INPUT (CH 9-16 ←), { source: [channel index, GAIN that reads good] }, its cable]
  ["x32-cme-adv-headset", 13, { "cme-guest": [8, 30] }, { "cme-guest": ["cme-rx-lav/out1", "mixer/ch25-mic"] }],
  ["x32-cme-adv-inputs", 1, { "cme-kick": [8, 28], "cme-snare": [9, 32] }, { "cme-kick": ["src-cme-kick/out", "s32/in9"], "cme-snare": ["src-cme-snare/out", "s32/in10"] }],
];
const NEW = CASES.flatMap(([, , srcs]) => Object.keys(srcs));
const fader = levelLaw(COMPACT.x32);

describe("CME Advanced: sources for one scenario", () => {
  for (const [id, block, srcs, cables] of CASES) {
    it(`${id}: on stage and cabled, unheard at Salmon's default routing`, () => {
      const a = attempt(id);
      assert.deepEqual(a.st.state.rig.devices.find((d) => d.id === "mixer").inSource, [0, 0, 0, 1]);
      for (const [src, [from, to]] of Object.entries(cables)) {
        assert.ok(a.st.state.rig.devices.some((d) => d.sourceId === src), `${src} on stage`);
        assert.ok(a.st.state.rig.cables.some((c) => c.from === from && c.to === to), `${from} → ${to}`);
        assert.equal(a.idx(src), -1, `${src} on no channel`);
      }
      for (const [, [i]] of Object.entries(srcs)) assert.equal(a.mix().channels[i].band, "none");
      if (srcs["cme-guest"]) assert.deepEqual(a.st.state.rig.devices.find((d) => d.id === "cme-rx-lav").pairs, { out1: "cme-guest" });
    });

    it(`${id}: CH 9-16 ← its block, and each reads good and reaches MAIN`, () => {
      const a = attempt(id);
      a.st.setDevice("mixer", "inSource.1", block);
      for (const [src, [i, gain]] of Object.entries(srcs)) {
        assert.equal(a.idx(src), i, `${src} on CH ${i + 1}`);
        assert.equal(a.st.state.channels[i].gainDb, gain, `${src}: the gig's GAIN`);
        assert.equal(a.mix().channels[i].band, "good", `${src}: band at GAIN ${gain}`);
        a.st.setChannel(i, "level", fader.toPos(0));
        assert.ok(a.mix().channels[i].mainDb.L > -60, `${src} in MAIN`);
        a.st.setChannel(i, "level", 0);
        assert.equal(a.mix().channels[i].mainDb.L, -Infinity, `${src}: fader down, out of MAIN`);
      }
    });
  }

  it("the other CME scenarios don't get them, and the PTU-7000 pairs with nothing", () => {
    for (const id of ["x32-cme-tour", "x32-cme-rack", "free-play", "x32-cme-adv-inputs"]) {
      const a = attempt(id);
      const here = NEW.filter((src) => a.st.state.rig.devices.some((d) => d.sourceId === src));
      assert.deepEqual(here, id === "x32-cme-adv-inputs" ? ["cme-kick", "cme-snare"] : [], id);
      if (id !== "x32-cme-adv-headset") assert.equal(a.st.state.rig.devices.find((d) => d.id === "cme-rx-lav").pairs, undefined, id);
      if (id !== "x32-cme-adv-inputs") assert.ok(!a.st.state.rig.cables.some((c) => c.to === "s32/in9" || c.to === "s32/in10"), id);
      // Receiver 3 keeps its five handhelds.
      assert.equal(Object.keys(a.st.state.rig.devices.find((d) => d.id === "cme-rx3").pairs).length, 5, id);
    }
  });
});
