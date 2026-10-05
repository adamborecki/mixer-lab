// Who's on stage (js/music.js stageFor) and the scenarios that set it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stageFor, stageNote } from "../js/music.js";
import { ALL_BOARD_SCENARIOS, SCENARIOS } from "../js/scenarios.js";
import { SOURCES_BY_ID, VOICES } from "../audio/source-manifest.js";

const BAND = ["drums", "bass", "guitars", "keys", "trumpets", "backing-vocals", "lead-vocal"];
const ALL = [...SCENARIOS.filter((s) => s.number > 0), ...ALL_BOARD_SCENARIOS];
// Checks that need a source to actually make sound (patching alone doesn't).
const NEEDS_SOUND = new Set(["sourceGain", "sourceHeardInMain", "monitorPresent", "monitorLittle", "monitorRaised", "sendRaised"]);

describe("stageFor", () => {
  const ids = [...BAND, "preshow"];
  it("plays everyone by default", () => {
    assert.deepEqual(stageFor({}, ids, SOURCES_BY_ID), { muted: [], voices: {} });
  });
  it("silent mutes the band but never the laptop", () => {
    const { muted } = stageFor({ stage: { silent: true } }, ids, SOURCES_BY_ID);
    assert.deepEqual(muted, BAND);
  });
  it("only / out", () => {
    assert.deepEqual(stageFor({ stage: { only: ["lead-vocal"] } }, ids, SOURCES_BY_ID).muted, BAND.filter((s) => s !== "lead-vocal"));
    assert.deepEqual(stageFor({ stage: { out: ["backing-vocals"] } }, ids, SOURCES_BY_ID).muted, ["backing-vocals"]);
  });
  it("a voice replaces its mic's stem", () => {
    const st = stageFor({ stage: { voice: { "lead-vocal": "announcement" } } }, ids, SOURCES_BY_ID);
    assert.deepEqual(st, { muted: ["lead-vocal"], voices: { "lead-vocal": "announcement" } });
  });
  it("says who's on stage", () => {
    assert.match(stageNote({ stage: { silent: true, voice: { "lead-vocal": "announcement" } } }, SOURCES_BY_ID, VOICES), /isn't on stage.*announcement \(Adam Borecki\)/);
    assert.equal(stageNote({}, SOURCES_BY_ID, VOICES), "");
  });
});

describe("scenarios: who's on stage", () => {
  it("every doors scenario has the band off stage", () => {
    const doors = ALL.filter((s) => s.id.endsWith("-doors") || s.id === "preshow");
    assert.ok(doors.length >= 14);
    for (const s of doors) assert.equal(s.stage?.silent, true, s.id);
  });

  it("names only real sources and voices", () => {
    for (const s of ALL.filter((x) => x.stage)) {
      for (const id of [...(s.stage.only || []), ...(s.stage.out || []), ...Object.keys(s.stage.voice || {})]) assert.ok(SOURCES_BY_ID[id], `${s.id}: ${id}`);
      for (const v of Object.values(s.stage.voice || {})) assert.ok(VOICES[v], `${s.id}: voice ${v}`);
    }
  });

  it("never silences a source the scenario needs to hear", () => {
    for (const s of ALL.filter((x) => x.stage)) {
      const { muted, voices } = stageFor(s, [...BAND, "preshow"], SOURCES_BY_ID);
      const silent = new Set(muted.filter((id) => !(id in voices)));
      for (const c of s.conditions) {
        if (!NEEDS_SOUND.has(c.type)) continue;
        for (const id of [c.source, ...(c.sources || [])].filter(Boolean)) assert.ok(!silent.has(id), `${s.id}: ${c.id} needs ${id}`);
      }
    }
  });
});
