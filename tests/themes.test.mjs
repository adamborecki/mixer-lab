// Themes group the scenarios by concept: every scenario in exactly one theme,
// in a teaching order that starts on the generic mixer.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_BOARD_SCENARIOS, MIXER_ORDER, SCENARIOS } from "../js/scenarios.js";
import { FREE_CONSOLES } from "../js/ui/mission-view.js";
import { SKINS } from "../js/mixer-models.js";
import { CANVAS_SCENARIOS, THEMES, consoleOf, isCanvas, nextInTheme, skinOf, themeOf, themeScenarios } from "../js/themes.js";

const all = [...SCENARIOS.filter((s) => s.number > 0), ...ALL_BOARD_SCENARIOS];

describe("themes", () => {
  it("put every scenario in exactly one theme, and list nothing that doesn't exist", () => {
    const seen = new Map();
    for (const t of THEMES) for (const id of t.ids) seen.set(id, [...(seen.get(id) || []), t.id]);
    for (const s of all) assert.deepEqual(seen.get(s.id)?.length, 1, `${s.id}: ${seen.get(s.id) || "no theme"}`);
    const ids = new Set(all.map((s) => s.id));
    for (const id of seen.keys()) assert.ok(ids.has(id), `${id} isn't a scenario`);
  });

  it("each have words to show and at least three scenarios", () => {
    for (const t of THEMES) {
      assert.ok(t.title && t.question && t.concept, t.id);
      assert.ok(themeScenarios(t).length >= 3, `${t.id} is too small`);
    }
  });

  it("start on the generic mixer and climb the console order", () => {
    const list = themeScenarios("monitors");
    assert.equal(consoleOf(list[0]), "generic");
    const firstReal = list.findIndex((s) => s.board);
    assert.ok(list.slice(firstReal).every((s) => s.board), "no generic scenario after a real console");
  });

  it("map every scenario's console to a skin that exists", () => {
    for (const s of all) assert.ok(SKINS[skinOf(consoleOf(s))], s.id);
  });

  it("keep the ten Canvas scenarios on the generic mixer", () => {
    assert.equal(CANVAS_SCENARIOS.length, 10);
    for (const s of CANVAS_SCENARIOS) {
      assert.ok(isCanvas(s));
      assert.equal(skinOf(consoleOf(s)), "analog");
      assert.ok(themeOf(s.id), s.id);
    }
  });

  it("open a theme at its first unsolved scenario", () => {
    const list = themeScenarios("phantom");
    assert.equal(nextInTheme("phantom").id, list[0].id);
    assert.equal(nextInTheme("phantom", (id) => id === list[0].id).id, list[1].id);
  });
});

describe("Free play's console picker", () => {
  it("offers every real mixer, so a new one can't be left out", () => {
    for (const m of MIXER_ORDER) assert.ok(FREE_CONSOLES.includes(m.skin), `${m.skin} is missing from FREE_CONSOLES`);
  });
});
