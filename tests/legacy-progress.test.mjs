// The frozen Assignment 1 copy shares saved progress with the newer Mixer Lab:
// it must never drop what it doesn't know.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Progress } from "../js/progress.js";

const store = (init) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
};

describe("legacy progress keeps the newer lab's entries", () => {
  const key = "mixer-lab-progress-v1";
  const init = { [key]: JSON.stringify({ solved: ["preshow", "b207mp3-doors"], stats: { preshow: { sec: 5, actions: 1 }, "b207mp3-doors": { sec: 60, actions: 9 } } }) };
  it("on save", () => {
    const s = store(init);
    const p = new Progress(["preshow", "build-rig"], s, undefined, key);
    p.add("build-rig");
    const data = JSON.parse(s.m.get(key));
    assert.deepEqual(new Set(data.solved), new Set(["preshow", "build-rig", "b207mp3-doors"]));
    assert.deepEqual(data.stats["b207mp3-doors"], { sec: 60, actions: 9 });
  });
  it("on clear", () => {
    const s = store(init);
    new Progress(["preshow", "build-rig"], s, undefined, key).clear();
    const data = JSON.parse(s.m.get(key));
    assert.deepEqual(data.solved, ["b207mp3-doors"]);
    assert.equal(data.stats.preshow, undefined);
  });
});
