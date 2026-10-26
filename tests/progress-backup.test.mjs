// Progress files: saving progress in one browser and merging it into another.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROGRESS_KEY, Progress, backupFile, backupFileName, mergeProgress, parseBackup } from "../js/progress.js";

const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)), removeItem: (k) => void delete data[k], data };
};
const NOW = new Date("2026-10-26T12:00:00.000Z");

describe("mergeProgress", () => {
  const laptop = { solved: ["a", "b"], stats: { a: { sec: 300, actions: 40 }, b: { sec: 60, actions: 5 }, "free-play/l20": { sec: 10, actions: 1 } } };
  const lab = { solved: ["b", "c"], stats: { b: { sec: 90, actions: 3 }, c: { sec: 120, actions: 12 } } };

  it("keeps every solved scenario and the larger time and action count of each", () => {
    const m = mergeProgress(laptop, lab);
    assert.deepEqual([...m.solved].sort(), ["a", "b", "c"]);
    assert.deepEqual(m.stats, { a: { sec: 300, actions: 40 }, b: { sec: 90, actions: 5 }, c: { sec: 120, actions: 12 }, "free-play/l20": { sec: 10, actions: 1 } });
  });

  it("is the same either way round, and merging again changes nothing", () => {
    const sorted = (p) => ({ ...p, solved: [...p.solved].sort() });
    assert.deepEqual(sorted(mergeProgress(laptop, lab)), sorted(mergeProgress(lab, laptop)));
    const once = mergeProgress(laptop, lab);
    assert.deepEqual(mergeProgress(once, lab), once);
    assert.deepEqual(mergeProgress(once, once), once);
  });

  it("never removes anything: an empty or older file leaves progress as it was", () => {
    assert.deepEqual(mergeProgress(laptop, { solved: [], stats: {} }), laptop);
    assert.deepEqual(mergeProgress(laptop, null), laptop);
    assert.deepEqual(mergeProgress(laptop, { solved: ["a"], stats: { a: { sec: 1, actions: 1 } } }), laptop);
  });

  it("keeps ids it doesn't know (another version's) and other stored fields", () => {
    const m = mergeProgress({ solved: ["legacy-1"], stats: {}, extra: 1 }, { solved: ["someday"], stats: { someday: { sec: 5, actions: 1 } } });
    assert.deepEqual(m.solved, ["legacy-1", "someday"]);
    assert.equal(m.extra, 1);
  });

  it("does not change its inputs", () => {
    const a = structuredClone(laptop);
    mergeProgress(a, lab);
    assert.deepEqual(a, laptop);
  });
});

describe("progress files", () => {
  const progress = { solved: ["a"], stats: { a: { sec: 75, actions: 9 } } };

  it("round-trips through the file", () => {
    const r = parseBackup(backupFile(progress, { now: NOW }));
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual(r.progress, progress);
    assert.equal(r.saved, NOW.toISOString());
    assert.equal(r.preview, null);
    assert.equal(parseBackup(backupFile(progress, { now: NOW, preview: "skin-l20" })).preview, "skin-l20");
  });

  it("names the file by date, and by preview on a branch preview", () => {
    assert.equal(backupFileName({ now: NOW }), "mixer-lab-progress-2026-10-26.json");
    assert.equal(backupFileName({ now: NOW, preview: "skin-l20" }), "mixer-lab-progress-skin-l20-2026-10-26.json");
  });

  it("rejects anything that isn't a good progress file, with a reason to show", () => {
    const file = (o) => JSON.stringify({ kind: "mixer-lab-progress", version: 1, ...o });
    const bad = [
      "",
      "   ",
      "{oops",
      "null",
      "[]",
      JSON.stringify(progress), // the raw stored data, not a file from "Save progress file"
      JSON.stringify({ kind: "something-else", version: 1, progress }),
      file({ version: undefined, progress }),
      file({ version: 2, progress }),
      file({ progress: undefined }),
      file({ progress: { solved: "a", stats: {} } }),
      file({ progress: { solved: [], stats: [] } }),
      file({ progress: { solved: [3], stats: {} } }),
      file({ progress: { solved: [], stats: { a: { sec: -1, actions: 0 } } } }),
      file({ progress: { solved: [], stats: { a: { sec: "lots", actions: 0 } } } }),
      file({ progress: { solved: [], stats: { a: null } } }),
      "x".repeat(2_000_000),
    ];
    for (const text of bad) {
      const r = parseBackup(text);
      assert.equal(r.ok, false, text.slice(0, 80));
      assert.match(r.reason, /\w/);
    }
    assert.match(parseBackup(file({ version: 2, progress })).reason, /newer/);
    assert.equal(parseBackup(undefined).ok, false);
  });

  it("rounds times and actions down to whole numbers", () => {
    const r = parseBackup(JSON.stringify({ kind: "mixer-lab-progress", version: 1, progress: { solved: [], stats: { a: { sec: 12.7, actions: 3.2 } } } }));
    assert.deepEqual(r.progress.stats, { a: { sec: 12, actions: 3 } });
  });
});

describe("Progress: saving a file in one browser and loading it in another", () => {
  const ids = ["a", "b", "c"];
  const stats = [...ids, "free-play"];

  it("a file from one browser merges into another's progress", () => {
    const home = new Progress(ids, memory(), stats);
    home.add("a");
    home.record("a", { sec: 200, actions: 20 });
    const text = backupFile(home.snapshot(), { now: NOW });

    const labStore = memory();
    const lab = new Progress(ids, labStore, stats);
    lab.add("b");
    lab.record("a", { sec: 50, actions: 30 });
    lab.record("b", { sec: 40, actions: 4 });
    assert.equal(lab.merge(parseBackup(text).progress), 1);
    assert.deepEqual([...lab.solved].sort(), ["a", "b"]);
    assert.deepEqual(lab.statsFor("a"), { sec: 200, actions: 30 });
    assert.deepEqual(lab.statsFor("b"), { sec: 40, actions: 4 });
    // Saved, and loading it again changes nothing.
    assert.deepEqual([...new Progress(ids, labStore, stats).solved].sort(), ["a", "b"]);
    assert.equal(lab.merge(parseBackup(text).progress), 0);
    assert.deepEqual(lab.statsFor("a"), { sec: 200, actions: 30 });
  });

  it("the snapshot includes unsaved time and ids this version doesn't show", () => {
    const store = memory({ [PROGRESS_KEY]: JSON.stringify({ solved: ["legacy-only"], stats: {} }) });
    const p = new Progress(ids, store, stats);
    p.record("free-play", { sec: 3, actions: 1 });
    assert.deepEqual(p.snapshot(), { solved: ["legacy-only"], stats: { "free-play": { sec: 3, actions: 1 } } });
    // With no storage at all, the snapshot is what's in this tab.
    const q = new Progress(ids, null, stats);
    q.add("c");
    q.record("c", { sec: 9, actions: 2 });
    assert.deepEqual(q.snapshot(), { solved: ["c"], stats: { c: { sec: 9, actions: 2 } } });
  });

  it("a merge that can't be saved reports it and changes nothing", () => {
    const p = new Progress(ids, null, stats);
    assert.equal(p.merge({ solved: ["a"], stats: {} }), null);
    assert.equal(p.has("a"), false);
    const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem() {} };
    const q = new Progress(ids, full, stats);
    assert.equal(q.merge({ solved: ["a"], stats: {} }), null);
    assert.equal(q.has("a"), false);
  });
});
