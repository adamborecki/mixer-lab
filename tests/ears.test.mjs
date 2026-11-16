// The wedge nudge (js/ears.js): which mix a scenario is about, and when the
// listen bar should point the student at it instead of switching for them.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { earsTarget, earsNudge, earsNudgeText } from "../js/ears.js";
import { ALL_BOARD_SCENARIOS, SCENARIOS, SCENARIOS_BY_ID, buildScenarioState } from "../js/scenarios.js";
import { listenDestinations } from "../js/mixer-state.js";
import { DEFAULT_SONG, SOURCES_BY_ID, useSong } from "../audio/source-manifest.js";

const BOARD = Object.fromEntries(ALL_BOARD_SCENARIOS.map((s) => [s.id, s]));

describe("earsTarget", () => {
  it("finds the wedge in the scenarios students got stuck on", () => {
    assert.equal(earsTarget(BOARD["yam01v96-fader-mode"]).dest, "aux1");
    assert.equal(earsTarget(SCENARIOS_BY_ID["more-vocal"]).dest, "aux1");
    assert.equal(earsTarget(BOARD["gdig-sof"]).dest, "mix1");
  });

  it("is null when the scenario isn't about a monitor mix", () => {
    assert.equal(earsTarget(SCENARIOS_BY_ID["free-play"]), null);
    assert.equal(earsTarget(SCENARIOS_BY_ID["preshow"]), null);
    assert.equal(earsTarget(SCENARIOS_BY_ID["missing-guitar"]), null); // PFL, not a wedge
    assert.equal(earsTarget(BOARD["x32-matrix"]), null); // a matrix isn't a wedge
    assert.equal(earsTarget(null), null);
  });

  it("falls back to a monitor goal's bus when there's no listen goal", () => {
    assert.equal(earsTarget(BOARD["mix8-ballad"]).dest, "aux1");
  });

  it("honours an explicit `ears`, including other spots that count", () => {
    assert.deepEqual(earsTarget(BOARD["yam01v96-master"]), { dest: "aux2", ok: ["aux2"] }); // the drummer's wedge
    assert.deepEqual(earsTarget(BOARD["x1204usb-wedge"]).ok, ["aux1", "phones"]);
    assert.equal(earsTarget({ ears: null, conditions: [{ kind: "goal", type: "listenedTo", dest: "aux1" }] }), null);
  });

  it("every target is a listening spot its own mixer offers", () => {
    for (const def of [...SCENARIOS, ...ALL_BOARD_SCENARIOS]) {
      const t = earsTarget(def);
      if (!t) continue;
      useSong(def.song || DEFAULT_SONG);
      const dests = listenDestinations(buildScenarioState(def, SOURCES_BY_ID, def.board));
      for (const d of t.ok) assert.ok(dests.includes(d), `${def.id}: ${d} is not a listen destination`);
    }
  });
});

describe("earsNudge", () => {
  it("nudges a student hearing Main in a wedge scenario", () => {
    assert.equal(earsNudge(BOARD["yam01v96-fader-mode"], "main").dest, "aux1");
    assert.equal(earsNudge(SCENARIOS_BY_ID["more-vocal"], "aux2").dest, "aux1"); // the other wedge
  });

  it("stays quiet once the ears are there, or somewhere the scenario also counts", () => {
    assert.equal(earsNudge(BOARD["yam01v96-fader-mode"], "aux1"), null);
    assert.equal(earsNudge(BOARD["x32-vj-send"], "main"), null); // listen to the house and MIX 1
    assert.equal(earsNudge(BOARD["x32-vj-send"], "mix1"), null);
    assert.equal(earsNudge(BOARD["x1204usb-wedge"], "phones"), null);
    assert.equal(earsNudge(SCENARIOS_BY_ID["free-play"], "main"), null);
  });
});

describe("earsNudgeText", () => {
  it("names the wedge, what you hear now, and where to switch", () => {
    const s = earsNudgeText({ about: "the singer's wedge", target: "Aux 1", current: "Main L/R" });
    assert.match(s, /about the singer's wedge/);
    assert.match(s, /hearing Main L\/R/);
    assert.match(s, /switch Your ears to Aux 1/);
  });

  it("says so when the mix reaches no speaker yet", () => {
    assert.match(earsNudgeText({ about: null, target: "Aux 2", current: "Main L/R" }), /doesn't reach a speaker yet/);
  });
});
