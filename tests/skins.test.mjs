// Skin mapping layer: presentation only, never behaviour.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SKINS, enabledLit, enabledAfterPress, enabledStatusText, globalPhantomState } from "../js/mixer-models.js";
import { SCENARIOS } from "../js/scenarios.js";
import { createMixerState } from "../js/mixer-state.js";

const { analog, compact } = SKINS;
const PARTS = new Set(["phantom", "gain", "aux1", "aux2", "pan", "pfl", "meter", "enabled", "level"]);

describe("enable button mapping (MUTE vs ON)", () => {
  it("MUTE is lit when the channel is disabled; ON is lit when it is enabled", () => {
    assert.equal(enabledLit(analog, false), true);
    assert.equal(enabledLit(analog, true), false);
    assert.equal(enabledLit(compact, true), true);
    assert.equal(enabledLit(compact, false), false);
  });

  it("the two skins are always lit in opposite states for the same semantic value", () => {
    for (const en of [true, false]) assert.notEqual(enabledLit(analog, en), enabledLit(compact, en));
  });

  it("pressing either button toggles enabled — the inversion is only in what 'lit' means", () => {
    for (const skin of [analog, compact]) {
      assert.equal(enabledAfterPress(skin, true), false);
      assert.equal(enabledAfterPress(skin, false), true);
    }
  });

  it("state has words, not just colour", () => {
    assert.equal(enabledStatusText(analog, false), "Muted");
    assert.equal(enabledStatusText(compact, false), "Off");
  });
});

describe("global phantom switch", () => {
  it("reports off / mixed / on from per-channel state", () => {
    const s = createMixerState();
    assert.equal(globalPhantomState(s.channels), "off");
    s.channels[0].phantom = true;
    assert.equal(globalPhantomState(s.channels), "mixed");
    for (const c of s.channels) c.phantom = true;
    assert.equal(globalPhantomState(s.channels), "on");
  });
});

describe("skin definitions", () => {
  it("both skins place every control exactly once, using known parts", () => {
    for (const skin of [analog, compact]) {
      const parts = skin.strip.flatMap((sec) => sec.rows.flatMap((r) => (Array.isArray(r) ? r : r.parts)));
      for (const p of parts) assert.ok(PARTS.has(p), `${skin.id}: unknown part ${p}`);
      const needed = [...PARTS].filter((p) => p !== "phantom" || skin.phantomControl === "per-channel");
      for (const p of needed) assert.equal(parts.filter((x) => x === p).length, 1, `${skin.id}: ${p}`);
    }
  });

  it("the skins differ in the ways the spec requires", () => {
    assert.equal(analog.levelControl, "fader");
    assert.equal(compact.levelControl, "knob");
    assert.equal(analog.terms.aux1, "AUX 1");
    assert.equal(analog.terms.aux2, "AUX 2");
    assert.equal(compact.terms.aux1, "MON 1");
    assert.equal(compact.terms.aux2, "MON 2");
    assert.equal(analog.enabledControl.label, "MUTE");
    assert.equal(compact.enabledControl.label, "ON");
  });

  it("every hint placeholder is defined by both skins", () => {
    const text = SCENARIOS.flatMap((s) => [s.prompt, s.goal, s.complete, ...s.hints, ...s.conditions.map((c) => c.label)]).filter(Boolean).join(" ");
    const keys = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const skin of [analog, compact]) for (const k of keys) assert.ok(k in skin.terms, `${skin.id}: {${k}}`);
  });
});
