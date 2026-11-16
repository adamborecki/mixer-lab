// Two bands (audio/source-manifest.js SONGS): switching songs, the delivery
// files each one names, and every mixer's gig with either band on stage.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as manifest from "../audio/source-manifest.js";
import { DEFAULT_SONG, SONGS, songFits, useSong } from "../audio/source-manifest.js";
import { ALL_BOARD_SCENARIOS, SCENARIOS, SCENARIOS_BY_ID, buildScenarioState, gigFor, scenarioFor } from "../js/scenarios.js";
import { MODELS, computeMix, sourcePeakDb } from "../js/mixer-state.js";
import { pickSection } from "../js/music.js";
import { loopPoints } from "../js/transport.js";

const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));

describe("songs", () => {
  it("useSong swaps the band, and the shared parts keep their input number", () => {
    useSong("persephone");
    assert.equal(manifest.STEM_SET.id, "persephone");
    assert.ok(manifest.SOURCES_BY_ID.keys && !manifest.SOURCES_BY_ID["lead-guitar"]);
    const persephone = Object.fromEntries(manifest.SOURCES.map((s) => [s.id, s.order]));
    assert.equal(useSong("nostradamus"), true);
    assert.equal(useSong("nostradamus"), false);
    assert.equal(manifest.STEM_SET.id, "nostradamus");
    assert.equal(manifest.SOURCES_BY_ID.keys, undefined);
    for (const id of ["drums", "bass", "guitars", "backing-vocals", "lead-vocal"]) assert.equal(manifest.SOURCES_BY_ID[id].order, persephone[id], id);
    // The room pair and the preshow laptop are always findable.
    for (const id of ["room-l", "room-r", "preshow"]) assert.ok(manifest.SOURCES_BY_ID[id], id);
    useSong(DEFAULT_SONG);
  });

  it("NOSTRADAMUS fills Mixer A/B exactly: inputs 1–8 mono, the pads on stereo 9/10", () => {
    useSong("nostradamus");
    const band = manifest.sourcesInFohOrder();
    assert.deepEqual(band.map((s) => s.order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const pads = manifest.SOURCES_BY_ID.pads;
    assert.equal(pads.stereo, true);
    assert.equal(manifest.STEMS[pads.stem].treatment, "stereo");
    assert.equal(sourcePeakDb(pads, manifest.STEMS), manifest.STEMS[pads.stem].peakDb);
    useSong(DEFAULT_SONG);
  });

  for (const song of Object.values(SONGS)) {
    it(`${song.title}: every stem's excerpt and full-song segments are on disk`, () => {
      const { set, stems } = song;
      for (const [id, stem] of Object.entries(stems)) {
        assert.ok(exists(set.basePath + stem.file), `${id}: ${stem.file}`);
        for (let k = 0; k < set.full.segments; k++) assert.ok(exists(`${set.full.basePath}${stem.file.replace(/\.mp3$/, "")}-${String(k).padStart(2, "0")}.mp3`), `${id} segment ${k}`);
        assert.ok(!exists(`${set.full.basePath}${stem.file.replace(/\.mp3$/, "")}-${String(set.full.segments).padStart(2, "0")}.mp3`), `${id}: no extra segment`);
      }
      assert.equal(set.full.segments, Math.ceil(set.full.duration / set.full.segmentSeconds));
    });

    it(`${song.title}: every section fits in the song and names that song's stems`, () => {
      const { set, stems } = song;
      const ids = song.sources.filter((s) => s.stem).map((s) => s.stem);
      assert.ok(set.sections.some((s) => s.id === "excerpt"));
      for (const sec of set.sections) {
        assert.ok(sec.start - set.loop.start >= 0, sec.id);
        const { start, end } = loopPoints(set, sec.id);
        assert.ok(sec.start - start + end + 1 <= set.full.duration, `${sec.id} runs past the end`);
        for (const st of [...sec.plays, ...sec.partly]) assert.ok(stems[st] && ids.includes(st), `${sec.id}: ${st}`);
      }
      const ex = set.sections.find((s) => s.id === "excerpt");
      assert.ok(Math.abs(ex.start - set.loop.start - set.excerpt.originalStart) < 0.002, "the excerpt file starts where its section does");
    });
  }
});

describe("both bands on every mixer", () => {
  for (const song of Object.keys(SONGS)) {
    for (const model of MODELS.filter((m) => songFits(song, m))) {
      it(`${song} on ${model}: every patched source arrives with signal`, () => {
        useSong(song);
        const state = buildScenarioState(scenarioFor(SCENARIOS_BY_ID["free-play"], model), manifest.SOURCES_BY_ID, model);
        const mix = computeMix(state, manifest.SOURCES_BY_ID, manifest.STEMS);
        const patched = mix.channels.filter((c) => c.sourceId && c.sourceId !== "preshow");
        assert.ok(patched.length >= 2);
        for (const c of patched) {
          assert.ok(manifest.SOURCES.includes(manifest.SOURCES_BY_ID[c.sourceId]) || manifest.SOURCES_BY_ID[c.sourceId].room, `${c.sourceId} belongs to ${song}`);
          assert.ok(c.inputPeakDb > -40, `${c.sourceId}: ${c.inputPeakDb}`);
        }
        // A gig never mentions a part the band on stage doesn't have.
        const gig = gigFor(model);
        if (gig) for (const id of Object.keys(gig.patch)) if (!manifest.SOURCES_BY_ID[id]) assert.fail(`${model} patches ${id}`);
        useSong(DEFAULT_SONG);
      });
    }
  }

  it("every other band's gig names that band and none of Persephone's parts", () => {
    for (const [song, name] of [["nostradamus", /NOSTRADAMUS/], ["ftw", /FTW/]]) {
      for (const model of MODELS) {
        useSong(song);
        const gig = gigFor(model);
        useSong("persephone");
        if (!gig || gig === gigFor(model)) continue;
        assert.match(gig.prompt, name, `${song} on ${model}`);
        assert.doesNotMatch(gig.prompt, /\b(keys|piano|trumpets?)\b/i, `${song} on ${model}`);
      }
    }
  });
});

describe("which band plays a scenario", () => {
  const all = [...SCENARIOS, ...ALL_BOARD_SCENARIOS];

  it("every song a scenario names exists, and every band has scenarios", () => {
    for (const s of all) if (s.song) assert.ok(SONGS[s.song], s.id);
    assert.ok(all.filter((s) => s.song === "nostradamus").length >= 80);
    assert.ok(all.filter((s) => s.song === "ftw").length >= 20);
    assert.ok(all.filter((s) => !s.song).length >= 80);
  });

  for (const song of ["nostradamus", "ftw"]) {
    it(`a ${song} scenario never asks for Persephone's keys, trumpets or preshow laptop, or a part its band doesn't have`, () => {
      for (const s of all.filter((d) => d.song === song)) {
        const text = [s.title, s.prompt, s.goal, ...s.hints, s.complete, ...s.conditions.map((c) => c.label)].join(" ");
        assert.doesNotMatch(text, /\b(keys|keyboard|piano|trumpets?|horns?|preshow|doors)\b/i, s.id);
        for (const c of s.conditions) for (const id of [c.source, ...(c.sources || []), ...(c.below || [])].filter(Boolean)) assert.ok(SONGS[song].sources.some((x) => x.id === id) || ["room-l", "room-r"].includes(id), `${s.id}: ${id}`);
      }
    });

    it(`each ${song} scenario loops a section of its own song`, () => {
      useSong(song);
      const sections = manifest.STEM_SET.sections;
      for (const s of all.filter((d) => d.song === song)) assert.ok(sections.includes(pickSection(s, sections, manifest.SOURCES_BY_ID)), s.id);
      useSong(DEFAULT_SONG);
    });
  }
});
