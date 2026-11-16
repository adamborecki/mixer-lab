// The electroacoustic showcase in Salmon (js/scenarios.js EA_GIGS): its song only
// plays on the full X32, an SD8 daisy-chained off the S32's AES50 B arrives as
// AES50 A33-40, its OUTPUT switch picks the AES50 bank its jacks carry, and a
// box whose outputs die keeps its inputs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_SONG, SONGS, songFits, useSong } from "../audio/source-manifest.js";
import * as manifest from "../audio/source-manifest.js";
import { aesBlockOf, aesOffset, inSourceName } from "../js/connection-model.js";
import { MODELS, MixerStore, computeMix } from "../js/mixer-state.js";
import { SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";

function gig() {
  useSong("ea");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), manifest.SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, manifest.SOURCES_BY_ID, manifest.STEMS);
  const ch = (id) => mix().channels.find((c) => c.sourceId === id);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  const dev = (id) => st.state.rig.devices.find((d) => d.id === id);
  const cableTo = (ref) => st.state.rig.cables.find((c) => c.to === ref);
  return { st, mix, ch, ep, dev, cableTo };
}
const done = () => useSong(DEFAULT_SONG);

describe("Electroacoustic showcase in Salmon", () => {
  it("plays on the full X32 only", () => {
    assert.deepEqual(MODELS.filter((m) => songFits("ea", m)), ["x32"]);
  });

  it("hears the S32 on CH 25-27 and the daisy-chained SD8 on CH 17-18, all with signal", () => {
    const { ch, dev, st } = gig();
    const mixer = dev("mixer");
    assert.equal(aesOffset(st.state.rig, dev("s32"), mixer), 0);
    assert.equal(aesOffset(st.state.rig, dev("ea-sd8"), mixer), 32, "an SD8 behind a 32-input S32 starts at AES50 A33");
    assert.equal(inSourceName(mixer.inSource, 2), "AES50 A33-40");
    assert.equal(inSourceName(mixer.inSource, 3), "AES50 A25-32");
    for (const [id, index] of [["ea-pots", 16], ["ea-kat", 17], ["ea-bcl", 24], ["ea-piano", 25], ["ea-guitar", 26], ["ea-click", 0], ["ea-track", 32]]) {
      assert.equal(ch(id).index, index, id);
      assert.ok(["good", "hot"].includes(ch(id).band), `${id}: ${ch(id).band}`);
    }
    done();
  });

  it("keeps the click out of the house and in the bass clarinetist's wedge", () => {
    const { ch, ep } = gig();
    assert.ok(ch("ea-click").heardMainDb < -60);
    assert.ok(ch("ea-click").aux.mix3.heardDb > -45);
    assert.equal(ep("ea-perf").valid, true);
    assert.equal(ep("ea-perf").output, "out3");
    done();
  });

  it("loses the whole far side, inputs and outputs, without the chain cable", () => {
    const { st, ch, ep, cableTo } = gig();
    st.disconnect(cableTo("s32/aes50b").id);
    assert.equal(ep("ea-perf").valid, false);
    assert.ok(!(ch("ea-pots")?.input.connected));
    assert.ok(["good", "hot"].includes(ch("ea-bcl").band), "the S32 side carries on");
    done();
  });

  it("routes any AES50 block to any channel block", () => {
    assert.equal(aesBlockOf([0, 0, 0, 1], 3), 3);
    assert.equal(aesBlockOf([0, 0, 7, 1], 2), 4);
    assert.equal(aesBlockOf([0, 2, 0, 0], 1), null);
    const { st, ch } = gig();
    st.setDevice("mixer", "inSource.2", 1); // CH 17-24 ← AES50 A17-24: the S32's empty inputs
    assert.ok(!(ch("ea-pots")?.input.connected));
    done();
  });

  it("follows the SD8's OUTPUT switch: 9-16 carries Output 9-16, 17-24 repeats Output 1-8", () => {
    const { st, ep } = gig();
    st.setDevice("ea-sd8", "outBank", 1);
    assert.equal(ep("ea-perf").output, "out11");
    st.setDevice("ea-sd8", "outBank", 2);
    assert.equal(ep("ea-perf").output, "out3");
    done();
  });

  it("keeps a box's inputs when its outputs die", () => {
    const { st, ch, ep } = gig();
    st.state.rig.devices.find((d) => d.id === "ea-sd8").outsDead = true;
    assert.equal(ep("ea-perf").valid, false);
    assert.ok(["good", "hot"].includes(ch("ea-pots").band));
    done();
  });

  it("ships a click on FTW's timeline", () => {
    const { set, stems } = SONGS.ea;
    assert.equal(set.loop.end, SONGS.ftw.set.loop.end, "the same loop as FTW's stems");
    assert.ok(fs.existsSync(new URL(`../${set.basePath}${stems.click.file}`, import.meta.url)));
    for (const sec of set.sections) assert.ok(sec.plays.includes("click"), sec.id);
  });
});
