import test from "node:test";
import assert from "node:assert/strict";
import { STEM_SET, SOURCES_BY_ID } from "../audio/source-manifest.js";
import { ALL_BOARD_SCENARIOS, SCENARIOS } from "../js/scenarios.js";
import { pickSection, sittingOut, stemsNeeded } from "../js/music.js";
import { bakeLoop, segmentsUnder, stitch } from "../js/transport.js";

const ALL = [...SCENARIOS, ...ALL_BOARD_SCENARIOS];
const BAR = 28.405 / 8;

test("sections sit on the excerpt's bar grid and inside the song", () => {
  const ex = STEM_SET.sections.find((s) => s.id === "excerpt");
  assert.ok(Math.abs(ex.start - (STEM_SET.excerpt.originalStart + STEM_SET.loop.start)) < 1e-6);
  for (const s of STEM_SET.sections) {
    const bars = (s.start - ex.start) / BAR;
    assert.ok(Math.abs(bars - Math.round(bars)) < 0.001, `${s.id} is ${bars} bars from the excerpt`);
    assert.ok(s.start - STEM_SET.loop.start >= 0);
    assert.ok(s.start + STEM_SET.loop.end + 1 <= STEM_SET.full.duration);
  }
});

test("every scenario loops a section where the instruments it needs are playing", () => {
  for (const def of ALL) {
    const sec = pickSection(def, STEM_SET.sections, SOURCES_BY_ID);
    for (const stem of stemsNeeded(def, SOURCES_BY_ID)) {
      if (def.music) continue;
      assert.ok(sec.plays.includes(stem), `${def.id}: ${stem} sits out in ${sec.id}`);
    }
  }
});

test("scenarios that need the trumpets get the full-band excerpt", () => {
  const trumpet = ALL.filter((d) => stemsNeeded(d, SOURCES_BY_ID).includes("trumpets"));
  assert.ok(trumpet.length > 0);
  for (const d of trumpet) assert.equal(pickSection(d, STEM_SET.sections, SOURCES_BY_ID).id, "excerpt");
});

test("the scenarios spread over the song, not one loop", () => {
  const used = new Map();
  for (const def of ALL) {
    const id = pickSection(def, STEM_SET.sections, SOURCES_BY_ID).id;
    used.set(id, (used.get(id) || 0) + 1);
  }
  assert.equal(used.size, STEM_SET.sections.length);
  assert.ok(used.get("excerpt") < ALL.length / 3);
});

test("a scenario can pin its section; Free play defaults to the excerpt", () => {
  assert.equal(pickSection({ id: "x", music: "bars-17", conditions: [] }, STEM_SET.sections, SOURCES_BY_ID).id, "bars-17");
  assert.equal(pickSection({ id: "free-play", conditions: [] }, STEM_SET.sections, SOURCES_BY_ID).id, "excerpt");
});

test("sittingOut names the patched sources a section leaves out", () => {
  const sec = STEM_SET.sections.find((s) => s.id === "bars-5");
  const out = sittingOut(sec, ["drums", "keys", "lead-vocal", "trumpets", "room-l"], SOURCES_BY_ID).map((s) => s.id);
  assert.deepEqual(out, ["drums", "trumpets"]);
});

test("segmentsUnder finds the segments covering a section", () => {
  const F = STEM_SET.full;
  assert.deepEqual(segmentsUnder(58.053, 29.905, F), [2, 3, 4]);
  assert.deepEqual(segmentsUnder(15.445, 29.905, F), [0, 1, 2]);
  assert.deepEqual(segmentsUnder(185.875, 29.905, F), [9, 10]);
});

test("stitch joins overlapping segments at their boundaries", () => {
  const sr = 100;
  // Two pieces of a ramp (value = song time), split at t = 20 with 0.5 s overlap.
  const ramp = (t0, n) => Float32Array.from({ length: n }, (_, i) => t0 + i / sr);
  const pieces = [
    { start: 0, boundary: 0, data: ramp(0, 2050) },
    { start: 19.5, boundary: 20, data: ramp(19.5, 2100) },
  ];
  const out = stitch(pieces, 15, 1000, sr, 0.02);
  for (let i = 0; i < out.length; i++) assert.ok(Math.abs(out[i] - (15 + i / sr)) < 1e-3, `sample ${i}`);
  // A different second piece shows where the handover happens.
  pieces[1].data = new Float32Array(2100).fill(-1);
  const cut = stitch(pieces, 15, 1000, sr, 0.02);
  assert.ok(Math.abs(cut[498] - (15 + 4.98)) < 1e-3);
  assert.equal(cut[510], -1);
});

test("bakeLoop makes the wrap continuous", () => {
  const sr = 1000;
  const data = Float32Array.from({ length: 3000 }, (_, i) => Math.sin(i / 7));
  const start = 500;
  const len = 1777;
  bakeLoop(data, start, len, 30);
  // The last sample before the wrap equals the sample just before loop start.
  assert.ok(Math.abs(data[start + len - 1] - data[start - 1]) < 1e-6);
  // Untouched well before the fade.
  assert.ok(Math.abs(data[start + len - 40] - Math.sin((start + len - 40) / 7)) < 1e-6);
});
