// The Stage & patch diagram's geometry: every jack in every rig has a place,
// nothing overlaps, and network-only ports aren't drawn as jacks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SOURCES_BY_ID } from "../audio/source-manifest.js";
import { DEVICE_TYPES } from "../js/connection-model.js";
import { SKINS } from "../js/mixer-models.js";
import { buildScenarioState, scenarioFor, scenariosFor } from "../js/scenarios.js";
import { isPhysical, layoutStage, shortLabel } from "../js/ui/stage-layout.js";

const hardware = [...new Set(Object.values(SKINS).map((s) => s.hardware || "generic"))];

function rigs() {
  const out = [];
  for (const hw of hardware) {
    for (const s of scenariosFor(hw)) {
      const def = scenarioFor(s, hw);
      const state = buildScenarioState(def, SOURCES_BY_ID, hw);
      out.push({ name: `${hw} · ${def.id}`, state });
    }
  }
  return out;
}

const inside = (j, b) => j.x >= b.x && j.x <= b.x + b.w && j.y >= b.y && j.y <= b.y + b.h;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("stage diagram layout", () => {
  const all = rigs();

  it("covers every mixer and scenario", () => {
    assert.ok(hardware.length >= 15, `${hardware.length} mixers`);
    assert.ok(all.length > 200, `${all.length} rigs`);
  });

  it("gives every physical jack a place inside its box, and no network-only port", () => {
    for (const { name, state } of all) {
      const L = layoutStage(state.rig, { channelLabels: state.channels.map((c) => c.label) });
      const boxes = new Map(L.boxes.map((b) => [b.id, b]));
      for (const d of state.rig.devices) {
        for (const p of DEVICE_TYPES[d.type].ports) {
          const j = L.jacks.get(`${d.id}/${p.id}`);
          if (!isPhysical(p)) {
            assert.equal(j, undefined, `${name}: ${d.id}/${p.id} is network-only`);
            continue;
          }
          assert.ok(j, `${name}: ${d.id}/${p.id} has no place`);
          assert.ok(inside(j, boxes.get(j.boxId)), `${name}: ${d.id}/${p.id} is outside its box`);
        }
      }
    }
  });

  it("never stacks two jacks on the same spot or two boxes on each other", () => {
    for (const { name, state } of all) {
      const L = layoutStage(state.rig, { channelLabels: state.channels.map((c) => c.label) });
      const js = [...L.jacks.values()];
      for (let i = 0; i < js.length; i++) {
        for (let k = i + 1; k < js.length; k++) {
          assert.ok(Math.hypot(js[i].x - js[k].x, js[i].y - js[k].y) >= 20, `${name}: ${js[i].ref} and ${js[k].ref} overlap`);
        }
      }
      for (let i = 0; i < L.boxes.length; i++) {
        for (let k = i + 1; k < L.boxes.length; k++) assert.ok(!overlaps(L.boxes[i], L.boxes[k]), `${name}: ${L.boxes[i].id} and ${L.boxes[k].id} overlap`);
      }
      assert.ok(L.width > 0 && L.height > 0 && Number.isFinite(L.width + L.height), name);
    }
  });

  it("puts sources left of the console and speakers right of it", () => {
    for (const { name, state } of all) {
      const L = layoutStage(state.rig);
      const col = (id) => L.columns.find((c) => c.id === id);
      if (col("stage") && col("foh")) assert.ok(col("stage").x < col("foh").x, name);
      if (col("speakers") && col("foh")) assert.ok(col("speakers").x > col("foh").x, name);
    }
  });

  it("prints short jack names", () => {
    assert.equal(shortLabel({ name: "XLR OUT 7 (MAIN L)" }), "OUT 7");
    assert.equal(shortLabel({ name: "AUX SEND 3" }), "AUX 3");
    assert.equal(shortLabel({ name: "MAIN OUT L" }), "MAIN L");
    assert.equal(shortLabel({ name: "Aux 1 out" }), "AUX 1");
    assert.equal(shortLabel({ name: "C-R OUT R" }), "C-R R");
  });
});
