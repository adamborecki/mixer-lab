// Power (js/connection-model.js powerSpec / powerState / powered): everything
// that plugs into the wall has a cable (`plugged`) and a switch (`on`), both on
// unless a scenario says otherwise, and the box's tab in Stage & patch flips
// either. No power, nothing passes: a console, a stage box, an amp, the Mix5,
// a receiver, a powered speaker, or the band's own gear in front of a mic.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SONG, SOURCES_BY_ID, STEMS, useSong } from "../audio/source-manifest.js";
import { DEVICE_TYPES, powerSpec, powerState, powerWhy } from "../js/connection-model.js";
import { setDeviceValue } from "../js/devices.js";
import { MixerStore, computeMix } from "../js/mixer-state.js";
import { ALL_BOARD_SCENARIOS, SCENARIOS_BY_ID, buildScenarioState, scenarioFor } from "../js/scenarios.js";

function gig() {
  useSong("cme");
  const st = new MixerStore(buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], "x32"), SOURCES_BY_ID, "x32"));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const ep = (id) => mix().rig.endpoints.find((e) => e.deviceId === id);
  const ch = (src) => mix().channels.find((c) => c.sourceId === src);
  const dev = (id) => st.state.rig.devices.find((d) => d.id === id);
  return { st, mix, ep, ch, dev };
}
const done = () => useSong(DEFAULT_SONG);

describe("power: which gear plugs in", () => {
  it("gives a cable and a switch to mixers, amps, powered speakers, stage boxes and the racks' gear, and none to passive gear", () => {
    for (const t of ["x32", "x32c", "cl3", "s32", "sd8", "km750", "nx3000", "crown-amp", "hall-crown", "mix5", "active-wedge", "powered-speaker", "b207-speaker", "rack-furman", "pas225", "ptu6000", "ptu7000", "iem-tx", "foh-mac"]) {
      assert.ok(DEVICE_TYPES[t].power, `${t} plugs in`);
    }
    for (const t of ["passive-speaker", "passive-wedge", "subsnake", "snake", "antenna", "rf-handheld", "dynamic-mic", "di-box", "f8n", "rack-power"]) {
      assert.equal(DEVICE_TYPES[t].power, undefined, `${t} has no power cable`);
    }
    assert.equal(DEVICE_TYPES["b207-speaker"].power.passiveThru, true, "a powered speaker's THRU is a straight wire");
    assert.equal(DEVICE_TYPES["active-wedge"].power.passiveThru, undefined);
  });

  it("starts everything on in the CME gig, and gives the band's own gear (the Nord, both guitar amps) power too", () => {
    const { st, dev } = gig();
    const powered = st.state.rig.devices.filter((d) => powerSpec(d));
    assert.ok(powered.length >= 20);
    assert.ok(powered.every((d) => powerState(st.state.rig, d) === "on"));
    assert.equal(powerSpec(dev("src-cme-gtr1")).gear, "The Katana-50");
    assert.equal(powerSpec(dev("src-cme-nord")).gear, "The Nord");
    assert.equal(powerSpec(dev("src-cme-bass")), null, "a passive bass into a DI has no power");
    done();
  });

  it("validates the plug and the switch: 0 or 1, and only on gear that plugs in", () => {
    const amp = { id: "a", type: "km750" };
    assert.ok(setDeviceValue(amp, "on", 0));
    assert.ok(setDeviceValue(amp, "plugged", 7));
    assert.equal(amp.plugged, 1);
    assert.equal(setDeviceValue({ id: "s", type: "passive-speaker" }, "on", 0), false);
    assert.ok(setDeviceValue({ id: "g", type: "dynamic-mic", sourceId: "cme-gtr1", gearPower: "The Katana-50" }, "on", 0));
    assert.equal(setDeviceValue({ id: "m", type: "dynamic-mic", sourceId: "x" }, "on", 0), false);
  });
});

describe("power: no power, nothing passes", () => {
  it("tells the plug from the switch, and both from a rack whose Furman is off", () => {
    const { st, dev } = gig();
    const rig = st.state.rig;
    st.setDevice("cme-w3", "on", 0);
    assert.equal(powerState(rig, dev("cme-w3")), "off");
    assert.match(powerWhy(rig, dev("cme-w3")), /switched off/);
    st.setDevice("cme-w3", "plugged", 0);
    assert.equal(powerState(rig, dev("cme-w3")), "unplugged", "unplugged wins: the switch can't do anything");
    assert.match(powerWhy(rig, dev("cme-w3")), /IEC power cable isn't plugged in/);
    st.setDevice("cme-wl-power", "on", 0);
    assert.equal(powerState(rig, dev("cme-rx3")), "no-power");
    assert.match(powerWhy(rig, dev("cme-rx3")), /switched on, but Furman/);
    assert.equal(powerState(rig, dev("cme-ant-a")), null, "an antenna needs no power");
    done();
  });

  it("silences every channel and output with the X32 off", () => {
    const { st, mix } = gig();
    st.setDevice("mixer", "on", 0);
    const m = mix();
    assert.ok(m.rig.channels.filter((c) => c?.connected).every((c) => c.status === "no-power" && !c.signal));
    assert.ok(Object.values(m.rig.buses).every((list) => !list.length), "no speaker plays anything");
    assert.ok(m.channels.every((c) => c.band === "none"));
    st.setDevice("mixer", "on", 1);
    assert.ok(mix().rig.buses.out13.length, "back on, back to normal");
    done();
  });

  it("cuts the S32's inputs and outputs with it off: the band, the wedges and the mains; the wireless stays", () => {
    const { st, ch, ep } = gig();
    st.setDevice("s32", "plugged", 0);
    for (const src of ["cme-nord", "cme-pno-l", "cme-gtr1"]) assert.equal(ch(src).input.status, "no-power", src);
    for (const id of ["cme-w1", "cme-w2", "cme-w3", "cme-main-l", "cme-main-r"]) assert.equal(ep(id).status, "no-power", id);
    assert.match(ep("cme-w3").messages[0], /S32/);
    assert.equal(ch("cme-orange").band, "good", "the wireless comes into the X32's own inputs");
    done();
  });

  it("takes out both wedges on a KM750 that's off, and only those", () => {
    const { st, ep } = gig();
    st.setDevice("cme-km750", "on", 0);
    assert.equal(ep("cme-w1").status, "no-power");
    assert.equal(ep("cme-w2").status, "no-power");
    assert.match(ep("cme-w1").messages[0], /KM750 #1 · amp rack is switched off/);
    assert.ok(ep("cme-w3").valid);
    assert.ok(ep("cme-main-l").valid);
    done();
  });

  it("leaves the hall's speakers with no power through a Mix5 that's off", () => {
    const { st, ep } = gig();
    assert.equal(ep("cme-hall-l").status, "off", "CME turns them down at the Mix5");
    st.setDevice("cme-mix5", "on", 0);
    assert.equal(ep("cme-hall-l").status, "no-power");
    st.setDevice("cme-mix5", "on", 1);
    st.setDevice("cme-hall-crown", "plugged", 0);
    assert.equal(ep("cme-hall-r").status, "no-power");
    done();
  });

  it("silences a receiver switched off on its own, with the Furman still on", () => {
    const { st, ch } = gig();
    st.setDevice("cme-rx3", "on", 0);
    for (const s of ["cme-red", "cme-blue"]) assert.equal(ch(s).band, "none", s);
    assert.equal(ch("cme-red").input.status, "no-power");
    done();
  });

  it("silences a guitar amp that's off, and a Mac mini that's off, without touching their channels", () => {
    const { st, ch } = gig();
    const gain = st.state.channels[29].gainDb;
    st.setDevice("src-cme-gtr1", "on", 0);
    assert.equal(ch("cme-gtr1").band, "none");
    assert.equal(ch("cme-gtr1").input.trimDb, -Infinity);
    assert.match(ch("cme-gtr1").input.messages.join(" "), /Katana-50 is switched off/);
    assert.equal(st.state.channels[29].gainDb, gain);
    assert.equal(ch("cme-gtr2").band, "good");
    done();
  });

  it("passes a powered speaker's THRU on with the speaker itself off", () => {
    const def = ALL_BOARD_SCENARIOS.find((s) => s.id === "x32c-cob-thru");
    useSong(def.song || DEFAULT_SONG);
    const st = new MixerStore(buildScenarioState(def, SOURCES_BY_ID, def.board));
    const r = st.connect("cob-w2/thru", "cob-w3/in", "xlr");
    assert.ok(r.ok, JSON.stringify(r));
    const ep = (id) => computeMix(st.state, SOURCES_BY_ID, STEMS).rig.endpoints.find((e) => e.deviceId === id);
    assert.ok(ep("cob-w3").valid);
    st.setDevice("cob-w2", "on", 0);
    assert.equal(ep("cob-w2").status, "no-power");
    assert.ok(ep("cob-w3").valid, "wedge 3 still plays through wedge 2's THRU");
    st.setDevice("cob-w3", "on", 0);
    assert.equal(ep("cob-w3").status, "no-power");
    done();
  });
});
