// The X32's ROUTING screen as the console has it (js/ui/mixer-x32-view.js
// routingScreen): BLOCK → INPUT takes any LOCAL, AES50 A, AES50 B or CARD
// block on any block of 8 channels; BLOCK → AES A decides what a stage box's
// outputs carry. Driven through the model, as the screen's CONNECT does.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SOURCES_BY_ID, STEMS, useSong } from "../audio/source-manifest.js";
import { AES_OUT_START, inSourceName } from "../js/connection-model.js";
import { setDeviceValue } from "../js/devices.js";
import { MixerStore, computeMix } from "../js/mixer-state.js";
import { SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";

function cme() {
  useSong("cme");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const ch = (i) => mix().channels[i];
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  return { st, mix, ch, ep };
}

describe("X32 ROUTING → BLOCK → INPUT", () => {
  it("names every choice as the console prints it", () => {
    const names = [[0, 1, "Local 9-16"], [10, 1, "Local 1-8"], [1, 3, "AES50 A25-32"], [7, 2, "AES50 A33-40"], [21, 0, "AES50 B9-16"], [2, 1, "Card 9-16"], [30, 1, "Card 1-8"]];
    for (const [v, b, name] of names) {
      const inSource = [0, 0, 0, 0];
      inSource[b] = v;
      assert.equal(inSourceName(inSource, b), name, `${v} on block ${b}`);
    }
  });

  it("lets CH 9-16 take Local 1-8: the wireless on LOCAL 1-8 is heard on 9-16 too, and 9-16's own jacks aren't", () => {
    const { st, ch } = cme();
    // Move receiver 3's channels for red and orange onto LOCAL 1 and LOCAL 9.
    const pull = (ref) => st.disconnect(st.state.rig.cables.find((c) => c.from === ref || c.to === ref).id);
    for (const ref of ["cme-rx3/out1", "cme-rx3/out2", "mixer/ch1-mic", "mixer/ch9-mic"]) pull(ref);
    assert.ok(st.connect("cme-rx3/out1", "mixer/ch1-mic", "xlr").ok);
    assert.ok(st.connect("cme-rx3/out2", "mixer/ch9-mic", "xlr").ok);
    assert.equal(ch(8).sourceId, "cme-orange");
    st.setDevice("mixer", "inSource.1", 10);
    assert.equal(ch(0).sourceId, "cme-red", "CH 1 still hears LOCAL 1");
    assert.equal(ch(8).sourceId, "cme-red", "CH 9 hears LOCAL 1 now");
    st.setChannel(8, "gainDb", 30); // CH 9 was never gain-staged in this gig
    assert.ok(["good", "hot"].includes(ch(8).band));
    assert.ok(!ch(8).input.connected || ch(8).sourceId !== "cme-orange", "LOCAL 9 isn't heard");
    st.setDevice("mixer", "inSource.1", 0);
    assert.equal(ch(8).sourceId, "cme-orange");
    useSong(DEFAULT_SONG);
  });

  it("goes silent on AES50 B and the card: nothing is connected there", () => {
    const { st, ch } = cme();
    assert.equal(ch(24).sourceId, "cme-nord");
    for (const v of [23, 2, 33]) {
      st.setDevice("mixer", "inSource.3", v);
      assert.equal(ch(24).input.connected, false, `value ${v}`);
    }
    st.setDevice("mixer", "inSource.3", 1);
    assert.equal(ch(24).sourceId, "cme-nord");
    useSong(DEFAULT_SONG);
  });

  it("only accepts the console's choices", () => {
    const mixer = { id: "mixer", type: "x32", inSource: [0, 0, 0, 0], aesOut: [...AES_OUT_START] };
    assert.ok(setDeviceValue(mixer, "inSource.1", "10"));
    assert.equal(mixer.inSource[1], 10);
    assert.equal(setDeviceValue(mixer, "inSource.1", 9), false);
    assert.equal(setDeviceValue(mixer, "inSource.1", 40), false);
    assert.ok(setDeviceValue(mixer, "aesOut.4", "out0"));
    assert.equal(setDeviceValue(mixer, "aesOut.4", "nonsense"), false);
  });
});

describe("X32 ROUTING → BLOCK → AES A", () => {
  it("starts as Salmon's: Output 1-8, 9-16, 1-8, 9-16, P16 1-8, P16 9-16", () => {
    const { st } = cme();
    assert.deepEqual(st.state.rig.devices.find((d) => d.id === "mixer").aesOut, ["out0", "out1", "out0", "out1", "p16-0", "p16-1"]);
    useSong(DEFAULT_SONG);
  });

  it("decides what the S32's outputs carry: the wedges go silent when 9-16 carries P16, and follow Output 1-8 if that's what it sends", () => {
    const { st, ep } = cme();
    assert.equal(ep("cme-w1").output, "out9");
    st.setDevice("mixer", "aesOut.1", "p16-1");
    assert.equal(ep("cme-w1").valid, false, "nothing the lab plays on P16");
    st.setDevice("mixer", "aesOut.1", "out0");
    assert.equal(ep("cme-w1").output, "out1", "S32 OUT 9 now carries Output 1");
    st.setDevice("mixer", "aesOut.1", "out1");
    assert.equal(ep("cme-w1").output, "out9");
    useSong(DEFAULT_SONG);
  });
});
