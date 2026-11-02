// CME in Salmon (js/scenarios.js CME_GIGS): its song only plays on the full
// X32; everyone on one layer (handhelds on LOCAL 17-21, the band on a Hosa sub
// snake into S32 IN 25-32); three wedges on three mixes; the mains downstage
// through the amp rack's Crown, the hall's own speakers turned down at the
// Mix5. And the gear's own controls: amp knobs, an active wedge's VOLUME and
// IEC cable, a handheld's one button, an amp's MASTER, and a cable that broke.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SONGS, SOURCES_BY_ID, STEMS, songFits, useSong } from "../audio/source-manifest.js";
import { DEVICE_TYPES, knobDb, sourceTrimDb } from "../js/connection-model.js";
import { setDeviceValue } from "../js/devices.js";
import { MODELS, MixerStore, computeMix } from "../js/mixer-state.js";
import { SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";
import { BOARD_SCENARIOS } from "../js/board-scenarios.js";
import { GIGS } from "../js/themes.js";

function gig() {
  useSong("cme");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  const ch = (src) => mix().channels.find((c) => c.sourceId === src);
  const cableTo = (ref) => st.state.rig.cables.find((c) => c.to === ref);
  return { st, mix, ep, ch, cableTo };
}
const done = () => useSong(DEFAULT_SONG);
const HANDHELDS = ["cme-red", "cme-orange", "cme-yellow", "cme-green", "cme-blue"];
const BAND = { "cme-nord": 25, "cme-pno-l": 27, "cme-pno-r": 28, "cme-bass": 29, "cme-gtr1": 30, "cme-gtr2": 31, "cme-oh": 32 };

describe("CME in Salmon: the rig", () => {
  it("plays on the full X32 only, as a Chapman gig with Essentials open and Advanced still to come", () => {
    assert.deepEqual(MODELS.filter((m) => songFits("cme", m)), ["x32"]);
    const ess = GIGS.find((g) => g.id === "cme");
    assert.deepEqual(ess.ids, BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-cme-")).map((s) => s.id));
    assert.ok(BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-cme-")).every((s) => s.song === "cme"));
    assert.equal(GIGS.find((g) => g.id === "cme-advanced").soon, true);
  });

  it("puts everyone on one layer: handhelds on LOCAL 17-21, the band through the sub snake and the S32 on 25-32", () => {
    const { st, ch } = gig();
    HANDHELDS.forEach((s, i) => assert.equal(ch(s).index, 16 + i, s));
    for (const [s, n] of Object.entries(BAND)) {
      assert.equal(ch(s).index, n - 1, s);
      assert.ok(["good", "hot"].includes(ch(s).band), `${s}: ${ch(s).band}`);
    }
    assert.deepEqual(st.state.rig.devices.find((d) => d.id === "mixer").inSource, [0, 0, 0, 1], "Salmon's default routing");
    done();
  });

  it("sends 48V down the passive sub snake: no 48V, no piano mics", () => {
    const { st, ch } = gig();
    st.setChannel(26, "phantom", false);
    assert.equal(ch("cme-pno-l").band, "none");
    assert.equal(ch("cme-pno-l").input.status, "no-phantom");
    st.setChannel(26, "phantom", true);
    assert.equal(ch("cme-pno-l").band, "good");
    done();
  });

  it("loses a band channel when its sub snake input or its tail into the S32 is pulled", () => {
    const { st, ch, cableTo } = gig();
    st.disconnect(cableTo("s32/in29").id);
    assert.equal(ch("cme-bass"), undefined);
    assert.ok(st.connect("cme-hosa/tail5", "s32/in29", "xlr").ok);
    assert.equal(ch("cme-bass").index, 28);
    st.disconnect(cableTo("cme-hosa/in5").id);
    assert.equal(ch("cme-bass"), undefined);
    done();
  });

  it("feeds each wedge its own mix: MIX 9-11 on XLR OUT 9-11 through S32 OUT 9-11", () => {
    const { st, ep } = gig();
    for (const [id, out, amp] of [["cme-w1", "out9", "cme-km750"], ["cme-w2", "out10", "cme-km750"], ["cme-w3", "out11", null]]) {
      assert.equal(ep(id).valid, true, id);
      assert.equal(ep(id).output, out, id);
      assert.equal(ep(id).viaAmp, amp, id);
      assert.equal(st.state.routing[out], `mix${out.slice(3)}`);
    }
    done();
  });

  it("plays MAIN from the Yamahas downstage and keeps the hall's own speakers silent at the Mix5", () => {
    const { st, ep, mix } = gig();
    assert.equal(ep("cme-main-l").output, "out13");
    assert.equal(ep("cme-main-r").output, "out14");
    for (const id of ["cme-hall-l", "cme-hall-r"]) {
      assert.equal(ep(id).valid, true, id);
      assert.equal(ep(id).gainDb, -Infinity, id);
      assert.match(ep(id).messages.join(" "), /4\/5 LEVEL is all the way down/);
    }
    assert.ok(!mix().rig.buses.out15.length, "a speaker turned right down reaches nobody");
    st.setDevice("cme-house", "lvl45", 7.5);
    assert.equal(ep("cme-hall-l").gainDb, 0);
    assert.deepEqual(mix().rig.buses.out15, ["cme-hall-l"]);
    st.setDevice("cme-house", "main", 0);
    assert.equal(ep("cme-hall-r").gainDb, -Infinity, "MAIN MIX turns both sides down too");
    done();
  });
});

describe("CME in Salmon: knobs on the gear", () => {
  it("reads 0–10 knobs as dB: unity passes, below turns down, 0 is off", () => {
    assert.equal(knobDb(10, 10), 0);
    assert.equal(knobDb(0, 10), -Infinity);
    assert.ok(Math.abs(knobDb(5, 10) + 12) < 0.1);
    assert.ok(knobDb(10, 7.5) > 4 && knobDb(10, 7.5) < 6);
  });

  it("turns a passive wedge down at its amp channel only", () => {
    const { st, ep } = gig();
    const before = ep("cme-w2").gainDb;
    st.setDevice("cme-km750", "volB", 1);
    assert.ok(ep("cme-w2").gainDb < before - 20);
    assert.equal(ep("cme-w2").status, "weak");
    assert.match(ep("cme-w2").messages.join(" "), /CH B level is at 1/);
    assert.equal(ep("cme-w1").gainDb, before, "CH A is untouched");
    done();
  });

  it("silences an active wedge with no IEC power or its VOLUME at 0", () => {
    const { st, ep, mix } = gig();
    st.setDevice("cme-w3", "iec", 0);
    assert.equal(ep("cme-w3").valid, false);
    assert.equal(ep("cme-w3").status, "no-power");
    assert.ok(!mix().rig.buses.out11.length);
    st.setDevice("cme-w3", "iec", 1);
    st.setDevice("cme-w3", "vol", 0);
    assert.equal(ep("cme-w3").gainDb, -Infinity);
    assert.ok(!mix().rig.buses.out11.length);
    done();
  });

  it("mutes a handheld with a tap and switches it off with a hold: the channel goes dark, its settings don't change", () => {
    const { st, ch } = gig();
    const gain = st.state.channels[18].gainDb;
    for (const v of [1, 2]) {
      st.setDevice("src-cme-yellow", "mic", v);
      assert.equal(ch("cme-yellow").band, "none", `mic ${v}`);
      assert.equal(ch("cme-yellow").heardMainDb, -Infinity);
    }
    st.setDevice("src-cme-yellow", "mic", 0);
    assert.equal(ch("cme-yellow").band, "good");
    assert.equal(st.state.channels[18].gainDb, gain);
    done();
  });

  it("follows an amp's MASTER into the mic in front of it", () => {
    const { st, ch } = gig();
    const at5 = ch("cme-gtr1").inputPeakDb;
    st.setDevice("src-cme-gtr1", "vol", 0);
    assert.equal(ch("cme-gtr1").band, "none");
    st.setDevice("src-cme-gtr1", "vol", 10);
    assert.ok(Math.abs(ch("cme-gtr1").inputPeakDb - at5 - 12) < 0.1, "10 is about 12 dB over 5");
    assert.equal(sourceTrimDb({ vol: 5 }, SOURCES_BY_ID["cme-gtr1"]), 0);
    assert.equal(sourceTrimDb({}, SOURCES_BY_ID["cme-orange"]), 0, "a source with no knob passes as is");
    done();
  });

  it("validates the settings: knobs 0–10 in half steps, the button only on a handheld, the volume only on a source", () => {
    const amp = { id: "a", type: "km750" };
    assert.ok(setDeviceValue(amp, "volA", 12));
    assert.equal(amp.volA, 10);
    assert.ok(setDeviceValue(amp, "volB", 3.3));
    assert.equal(amp.volB, 3.5);
    assert.equal(setDeviceValue(amp, "lvl45", 2), false);
    const mic = { id: "m", type: "wireless-handheld", sourceId: "cme-red" };
    assert.ok(setDeviceValue(mic, "mic", 2));
    assert.equal(setDeviceValue({ id: "d", type: "dynamic-mic", sourceId: "x" }, "mic", 1), false);
    assert.ok(setDeviceValue({ id: "d", type: "dynamic-mic", sourceId: "cme-gtr1" }, "vol", 4));
    assert.equal(setDeviceValue({ id: "w", type: "active-wedge" }, "iec", 3), true, "clamped to plugged in");
    assert.deepEqual(DEVICE_TYPES["active-wedge"].knobs.find((k) => k.key === "iec").select, ["Unplugged", "Plugged in"]);
  });
});

describe("CME in Salmon: a cable that broke", () => {
  it("passes nothing, says so, and works again once it's swapped", () => {
    const { st, ep, cableTo } = gig();
    cableTo("cme-w1/in").broken = true;
    assert.equal(ep("cme-w1").valid, false);
    assert.match(ep("cme-w1").messages.join(" "), /a cable itself/);
    st.disconnect(cableTo("cme-w1/in").id);
    assert.ok(st.connect("cme-km750/out-a", "cme-w1/in", "speaker").ok);
    assert.equal(ep("cme-w1").valid, true);
    done();
  });

  it("still warns about an instrument cable carrying speaker level", () => {
    const { st, ep, cableTo } = gig();
    st.disconnect(cableTo("cme-w2/in").id);
    assert.ok(st.connect("cme-km750/out-b", "cme-w2/in", "ts").ok);
    assert.match(ep("cme-w2").messages.join(" "), /real speaker cable/);
    done();
  });
});

describe("CME in Salmon: the song", () => {
  it("splits Persephone's stereo stems where CME has two of something", () => {
    const { stems, set } = SONGS.cme;
    for (const [l, r] of [["gtr-l", "gtr-r"], ["piano-l", "piano-r"], ["bv-l", "bv-r"]]) {
      assert.equal(stems[l].treatment, "left");
      assert.equal(stems[r].treatment, "right");
      assert.equal(stems[l].file, stems[r].file);
    }
    const all = set.sections.find((s) => s.id === "excerpt");
    for (const st of ["gtr-l", "piano-r", "bv-l", "trumpets"]) assert.ok(all.plays.includes(st), st);
    assert.ok(!set.sections.find((s) => s.id === "bars-17").plays.includes("piano-l"), "Band in, no keys");
  });
});
