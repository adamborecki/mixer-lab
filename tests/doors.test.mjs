// Doors music, solved the way a student would on the boards where students got
// stuck (1604, Mix8, B207MP3), plus the traps that used to fail silently.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_BOARD_SCENARIOS, buildScenarioState, captureBaseline, evaluateScenario } from "../js/scenarios.js";
import { MixerStore, computeMix } from "../js/mixer-state.js";
import { DEFAULT_SONG, SOURCES_BY_ID, STEMS, useSong } from "../audio/source-manifest.js";

const byId = Object.fromEntries(ALL_BOARD_SCENARIOS.map((s) => [s.id, s]));
function attempt(id) {
  useSong(DEFAULT_SONG);
  const def = byId[id];
  const st = new MixerStore(buildScenarioState(def, SOURCES_BY_ID, def.board));
  const baseline = captureBaseline(def, st.state, SOURCES_BY_ID, STEMS);
  const laptop = computeMix(st.state, SOURCES_BY_ID, STEMS).channels.find((c) => c.sourceId === "preshow").index;
  const heard = () => evaluateScenario(def, st.state, baseline, SOURCES_BY_ID, STEMS, { listened: new Set(["main"]) }).items.find((i) => i.id === "heard");
  return { st, laptop, heard };
}

describe("Doors music", () => {
  it("every variant says where the laptop already is, and explains a near miss", () => {
    for (const s of ALL_BOARD_SCENARIOS.filter((d) => d.id.endsWith("-doors"))) {
      assert.match(s.goal, /nothing needs patching/, s.id);
      assert.ok(s.conditions.find((c) => c.id === "heard").explain, s.id);
    }
  });

  it("1604: TAPE TO MAIN MIX solves it; cranking TAPE IN into clipping doesn't, and says why", () => {
    const a = attempt("cr1604-doors");
    assert.equal(a.heard().met, false);
    assert.equal(a.heard().detail, undefined, "no spoiler before the student has found the path");
    a.st.setChannel(a.laptop, "toMain", true);
    assert.equal(a.heard().met, true);
    a.st.setChannel(a.laptop, "level", 1);
    assert.equal(a.heard().met, false);
    assert.match(a.heard().detail, /clipping/);
    a.st.setChannel(a.laptop, "level", 0.35); // quieter than U, still clearly heard: TAPE IN has no meter
    assert.equal(a.heard().met, true);
  });

  it("Mix8: releasing TO CR/PHONES solves it", () => {
    const a = attempt("mix8-doors");
    assert.equal(a.heard().met, false);
    a.st.setChannel(a.laptop, "toCr", false);
    assert.equal(a.heard().met, true);
  });

  it("B207MP3 (no meter): LEVEL 4 to noon counts, because it's heard", () => {
    const a = attempt("b207mp3-doors");
    a.st.setChannel(a.laptop, "level", 0.5);
    assert.equal(a.heard().met, true);
    a.st.setChannel(a.laptop, "level", 0.3);
    assert.equal(a.heard().met, false);
    assert.match(a.heard().detail, /too quiet/);
  });
});
