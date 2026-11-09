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
    assert.deepEqual(ess.ids, BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-cme-") && !s.id.startsWith("x32-cme-adv-")).map((s) => s.id));
    assert.deepEqual(GIGS.find((g) => g.id === "cme-advanced").ids, BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-cme-adv-")).map((s) => s.id));
    assert.ok(BOARD_SCENARIOS.x32.filter((s) => s.id.startsWith("x32-cme-")).every((s) => s.song === "cme"));
    assert.ok(!GIGS.find((g) => g.id === "cme-advanced").soon);
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
    st.setDevice("cme-mix5", "lvl45", 7.5);
    assert.equal(ep("cme-hall-l").gainDb, 0);
    assert.deepEqual(mix().rig.buses.out15, ["cme-hall-l"]);
    st.setDevice("cme-mix5", "main", 0);
    assert.equal(ep("cme-hall-r").gainDb, -Infinity, "MAIN MIX turns both sides down too");
    done();
  });
});

describe("CME in Salmon: two racks", () => {
  it("draws the amp rack and the hall's mains rack as separate racks", () => {
    const { st } = gig();
    const rack = (r) => st.state.rig.devices.filter((d) => d.rack === r).map((d) => d.type);
    assert.deepEqual(rack("amp"), ["nx3000", "km750", "km750", "crown-amp"]);
    assert.deepEqual(rack("hall"), ["mix5", "rack-power", "hall-crown"], "the Mix5 on top, power, the Crown inside");
    done();
  });

  it("keeps the hall rack's own cables where they are: they can't be unplugged", () => {
    const { st, ep, cableTo } = gig();
    for (const ref of ["cme-hall-crown/in-a", "cme-hall-crown/in-b", "cme-hall-l/in", "cme-hall-r/in"]) {
      const c = cableTo(ref);
      assert.equal(c.fixed, true, ref);
      st.disconnect(c.id);
      assert.ok(cableTo(ref), `${ref} is still there`);
    }
    st.disconnect(cableTo("cme-mix5/in-l").id);
    assert.equal(cableTo("cme-mix5/in-l"), undefined, "the S32's cables into the Mix5 aren't fixed");
    st.setDevice("cme-mix5", "lvl45", 7.5);
    assert.equal(ep("cme-hall-l").valid, false, "nothing into LINE IN 4: the left hall speaker is silent");
    assert.equal(ep("cme-hall-r").valid, true);
    done();
  });

  it("turns one side down with the Mix5's 4/5 BAL, and ignores the knobs nothing is plugged into", () => {
    const { st, ep } = gig();
    st.setDevice("cme-mix5", "lvl45", 7.5);
    st.setDevice("cme-mix5", "bal45", 10);
    assert.equal(ep("cme-hall-l").gainDb, -Infinity, "hard right: no left");
    assert.equal(ep("cme-hall-r").gainDb, 0);
    st.setDevice("cme-mix5", "bal45", 5);
    for (const k of ["ch1Gain", "lvl23", "phones", "tapeMain"]) assert.ok(st.setDevice("cme-mix5", k, 1) === undefined);
    assert.equal(ep("cme-hall-l").gainDb, 0, "CH 1, 2/3, PHONES and TAPE aren't on the path");
    st.setDevice("cme-mix5", "main", 0);
    assert.equal(ep("cme-hall-l").gainDb, -Infinity);
    assert.match(ep("cme-hall-l").messages.join(" "), /MAIN MIX is all the way down/);
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
    st.setDevice("cme-w3", "plugged", 0);
    assert.equal(ep("cme-w3").valid, false);
    assert.equal(ep("cme-w3").status, "no-power");
    assert.ok(!mix().rig.buses.out11.length);
    st.setDevice("cme-w3", "plugged", 1);
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
    const w = { id: "w", type: "active-wedge" };
    assert.equal(setDeviceValue(w, "plugged", 3), true, "clamped to plugged in");
    assert.equal(w.plugged, 1);
    assert.ok(setDeviceValue(w, "on", 0));
    assert.equal(setDeviceValue({ id: "s", type: "passive-speaker" }, "on", 0), false, "a passive speaker has no power");
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

describe("CME in Salmon: the wireless rack at FOH", () => {
  const VOX = ["cme-red", "cme-orange", "cme-yellow", "cme-green", "cme-blue"];

  it("brings the handhelds in through receiver 3: no cable from the mic, its AF OUT n into LOCAL 16 + n", () => {
    const { st, ch } = gig();
    VOX.forEach((s, i) => {
      assert.equal(ch(s).index, 16 + i, s);
      assert.equal(ch(s).input.fromPort, `cme-rx3/out${i + 1}`, s);
      assert.ok(!st.state.rig.cables.some((c) => c.from.startsWith(`src-${s}/`)), `${s} has no cable`);
    });
    done();
  });

  it("goes dark with the Furman off, and comes back with it on", () => {
    const { st, ch } = gig();
    st.setDevice("cme-wl-power", "on", 0);
    for (const s of VOX) assert.equal(ch(s).band, "none", s);
    assert.equal(ch("cme-nord").band, "good", "the band isn't in the wireless rack");
    st.setDevice("cme-wl-power", "on", 1);
    for (const s of VOX) assert.ok(["good", "hot"].includes(ch(s).band), s);
    done();
  });

  it("needs radio from the antennas: receiver 3 hangs off the PAS-225X, daisy-chained from the PAS-225", () => {
    const { st, ch, cableTo } = gig();
    st.disconnect(cableTo("cme-pas-x/ant-a").id);
    assert.equal(ch("cme-orange").band, "good", "one antenna is still enough (diversity)");
    st.disconnect(cableTo("cme-pas-x/ant-b").id);
    assert.equal(ch("cme-orange").band, "none", "no antenna, no mics on receiver 3");
    st.setDevice("cme-pas", "on", 0);
    assert.ok(st.connect("cme-pas/out4a", "cme-pas-x/ant-a", "bnc").ok);
    assert.equal(ch("cme-orange").band, "none", "the PAS-225 off passes nothing on");
    st.setDevice("cme-pas", "on", 1);
    assert.equal(ch("cme-orange").band, "good");
    done();
  });

  it("sets each channel's level at the receiver's VOL knob: 9 o'clock is right at 30 dB of gain, all the way up clips", () => {
    const { st, ch } = gig();
    assert.equal(st.state.channels[17].gainDb, 30);
    st.setDevice("cme-rx3", "vol2", 10);
    assert.equal(ch("cme-orange").band, "clip");
    st.setDevice("cme-rx3", "vol2", 0);
    assert.equal(ch("cme-orange").band, "none");
    done();
  });

  it("keeps the PTU-7000 on LOCAL 25-28 (unheard while CH 25-32 are on the S32) and the IEMs on XLR OUT 9-12", () => {
    const { st } = gig();
    const into = (from) => st.state.rig.cables.find((c) => c.from === from)?.to;
    for (let n = 1; n <= 4; n++) {
      assert.equal(into(`cme-rx-lav/out${n}`), `mixer/ch${24 + n}-mic`);
      assert.equal(into(`mixer/out${8 + n}`), `cme-iem/in${n}`);
    }
    assert.equal(into("mixer/card-dante"), "src-preshow/dante", "the X-DANTE card to the FOH Mac mini");
    done();
  });

  it("takes antenna coax only between antennas, distribution units and receivers", () => {
    const { st, cableTo } = gig();
    st.disconnect(cableTo("cme-rx3/ant-a").id);
    assert.equal(st.connect("cme-pas-x/out1a", "mixer/ch32-mic", "bnc").ok, false);
    assert.equal(st.connect("cme-rx2/out1", "cme-rx3/ant-a", "xlr").ok, false);
    assert.ok(st.connect("cme-pas-x/out1a", "cme-rx3/ant-a", "bnc").ok);
    done();
  });
});
