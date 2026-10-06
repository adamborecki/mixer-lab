// Canvas submission: progress tracking and report generation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROGRESS_KEY, Progress, numberedScenarios } from "../js/progress.js";
import { buildSubmission, summarize, validate, verifySubmission } from "../js/submission.js";
import { SCENARIOS, shortTitle } from "../js/scenarios.js";
import { liveUrl, previewSlug, storageKey } from "../js/deploy-context.js";

const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)), removeItem: (k) => void delete data[k], data };
};
const ids = numberedScenarios(SCENARIOS).map((s) => s.id);
const URL_ = "https://example.edu/mixer-lab/";
const NOW = new Date("2026-10-01T12:00:00.000Z");
const STATS = { [ids[0]]: { sec: 252, actions: 37 }, [ids[1]]: { sec: 65, actions: 9 }, "free-play": { sec: 3, actions: 1 } };
const build = (over = {}, solved = []) =>
  buildSubmission({ name: "Sam Student", reflection: "I raised the send, because the wedge was quiet.", summary: summarize(SCENARIOS, (id) => solved.includes(id), (id) => STATS[id] || { sec: 0, actions: 0 }), url: URL_, now: NOW, ...over });

describe("scenario list", () => {
  it("counts every numbered scenario, in order, and never Free play", () => {
    const s = summarize(SCENARIOS, () => false);
    assert.equal(s.total, SCENARIOS.filter((x) => x.number > 0).length);
    assert.ok(!s.rows.some((r) => r.id === "free-play"));
    assert.deepEqual(s.rows.map((r) => r.number), [...s.rows.map((r) => r.number)].sort((a, b) => a - b));
  });

  it("picks up a newly added scenario without any other change", () => {
    const extra = { id: "new-one", number: 99, title: "Brand new", conditions: [], hints: [] };
    const s = summarize([...SCENARIOS, extra], (id) => id === "new-one");
    assert.equal(s.total, ids.length + 1);
    assert.deepEqual(s.rows.at(-1), { id: "new-one", number: 99, title: "Brand new", done: true, sec: 0, actions: 0 });
    assert.equal(s.done, 1);
  });
});

describe("progress persistence", () => {
  it("survives a reload via storage and stores only scenario ids", () => {
    const store = memory();
    const a = new Progress(ids, store);
    assert.equal(a.add(ids[0]), true);
    assert.equal(a.add(ids[0]), false);
    assert.deepEqual(JSON.parse(store.data[PROGRESS_KEY]), { solved: [ids[0]], stats: {} });
    const b = new Progress(ids, store); // "refresh"
    assert.equal(b.has(ids[0]), true);
    assert.equal(b.has(ids[1]), false);
  });

  it("ignores unknown ids, bad JSON, and missing storage", () => {
    assert.equal(new Progress(ids, memory({ [PROGRESS_KEY]: JSON.stringify({ solved: ["gone", ids[0]] }) })).solved.size, 1);
    assert.equal(new Progress(ids, memory({ [PROGRESS_KEY]: "{oops" })).solved.size, 0);
    const p = new Progress(ids, null);
    assert.equal(p.add(ids[0]), true);
    assert.equal(p.has(ids[0]), true);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    const q = new Progress(ids, throwing);
    assert.equal(q.add(ids[0]), true);
    q.clear();
    assert.equal(q.has(ids[0]), false);
  });

  it("rejects ids that are not numbered scenarios (Free play)", () => {
    assert.equal(new Progress(ids, memory()).add("free-play"), false);
  });

  it("clear forgets everything", () => {
    const store = memory();
    const p = new Progress(ids, store);
    p.add(ids[0]);
    p.clear();
    assert.equal(store.data[PROGRESS_KEY], undefined);
    assert.equal(new Progress(ids, store).solved.size, 0);
  });
});

describe("activity stats", () => {
  it("records time and actions per scenario, persists them on flush, and drops unknown ids", () => {
    const store = memory();
    const p = new Progress(ids, store, [...ids, "free-play"]);
    p.record(ids[0], { sec: 5, actions: 2 });
    p.record(ids[0], { sec: 1 });
    p.record("free-play", { actions: 1 });
    p.record("nope", { sec: 9 });
    assert.equal(store.data[PROGRESS_KEY], undefined, "not written until flushed");
    p.flush();
    const q = new Progress(ids, store, [...ids, "free-play"]);
    assert.deepEqual(q.statsFor(ids[0]), { sec: 6, actions: 2 });
    assert.deepEqual(q.statsFor("free-play"), { sec: 0, actions: 1 });
    assert.deepEqual(q.statsFor("nope"), { sec: 0, actions: 0 });
    q.clear();
    assert.deepEqual(q.statsFor(ids[0]), { sec: 0, actions: 0 });
  });
});

describe("progress shared by several tabs (and legacy/)", () => {
  it("adds this tab's time to what another tab saved instead of writing over it", () => {
    const store = memory();
    const stats = [...ids, "free-play/l20"];
    const a = new Progress(ids, store, stats);
    const b = new Progress(ids, store, stats);
    a.record(ids[0], { sec: 60, actions: 3 });
    a.flush();
    b.record(ids[0], { sec: 30, actions: 1 });
    b.record("free-play/l20", { sec: 10 });
    b.add(ids[1]);
    b.flush();
    a.record(ids[0], { sec: 5 });
    a.flush();
    const c = new Progress(ids, store, stats);
    assert.deepEqual(c.statsFor(ids[0]), { sec: 95, actions: 4 });
    assert.deepEqual(c.statsFor("free-play/l20"), { sec: 10, actions: 0 });
    assert.equal(c.has(ids[1]), true);
    assert.equal(a.has(ids[1]), true, "a tab picks up the other's solved scenarios when it saves");
  });
  it("keeps ids it doesn't know (another version's), and a cleared key stays cleared", () => {
    const store = memory({ [PROGRESS_KEY]: JSON.stringify({ solved: ["old-one"], stats: { "old-one": { sec: 7, actions: 1 } } }) });
    const a = new Progress(ids, store);
    const b = new Progress(ids, store);
    a.record(ids[0], { sec: 2 });
    a.flush();
    const saved = JSON.parse(store.data[PROGRESS_KEY]);
    assert.deepEqual(saved.solved, ["old-one"]);
    assert.deepEqual(saved.stats["old-one"], { sec: 7, actions: 1 });
    b.clear();
    a.record(ids[0], { sec: 1 });
    a.flush();
    assert.deepEqual(JSON.parse(store.data[PROGRESS_KEY]), { solved: [], stats: { [ids[0]]: { sec: 1, actions: 0 } } });
  });
  it("without storage, work still adds up until the page closes", () => {
    const p = new Progress(ids, null);
    p.record(ids[0], { sec: 3 });
    p.flush();
    p.record(ids[0], { sec: 2 });
    p.flush();
    assert.deepEqual(p.statsFor(ids[0]), { sec: 5, actions: 0 });
  });
});

describe("submission text", () => {
  it("has the name, count, every scenario, reflection, URL and a check code", () => {
    const text = build({}, [ids[0]]);
    assert.match(text, /^MIXER LAB — MUS 248 SUBMISSION\nName: Sam Student\n/);
    assert.ok(text.includes(`Completed: 1 / ${ids.length}`));
    assert.ok(text.includes("Reflection: I raised the send, because the wedge was quiet."));
    assert.ok(text.includes(`Mixer Lab: ${URL_}`));
    assert.ok(text.includes("— 4m 12s, 37 actions"));
    assert.ok(text.includes("— 1m 05s, 9 actions"));
    assert.ok(text.includes("Free play: 0m 03s, 1 actions"));
    assert.ok(text.includes("Total: 5m 20s, 47 actions"));
    assert.match(text, /Check code: [0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{2}$/);
    const first = SCENARIOS.find((s) => s.id === ids[0]);
    assert.ok(text.includes(`[x] ${first.number}. ${shortTitle(first)}`));
    for (const id of ids.slice(1)) assert.ok(text.includes(`[ ] ${SCENARIOS.find((s) => s.id === id).number}.`));
    assert.ok(!/^\[.\] 0\./m.test(text), "Free play is not a numbered row");
  });

  it("allows a partial (even empty) submission", () => {
    const text = build({}, []);
    assert.ok(text.includes(`Completed: 0 / ${ids.length}`));
    assert.equal(verifySubmission(text).ok, true);
  });

  it("collapses whitespace and newlines in the fields", () => {
    const text = build({ name: "  Sam\n  Student ", reflection: "one\n\ntwo   three" });
    assert.ok(text.includes("Name: Sam Student\n"));
    assert.ok(text.includes("Reflection: one two three\n"));
    assert.equal(verifySubmission(text).ok, true);
  });

  it("requires a name and a reflection", () => {
    assert.deepEqual(Object.keys(validate({ name: " ", reflection: "" })).sort(), ["name", "reflection"]);
    assert.deepEqual(validate({ name: "A", reflection: "B" }), {});
  });
});

describe("check code", () => {
  const all = ids;
  const text = build({}, all);

  it("verifies an untouched submission", () => {
    assert.deepEqual(verifySubmission(text), { ok: true, name: "Sam Student", done: all.length, total: all.length });
    assert.equal(verifySubmission(text.replace(/\n/g, "\r\n")).ok, true); // Canvas may change line endings
  });

  it("is deterministic and depends on the content", () => {
    assert.equal(build({}, all), text);
    assert.notEqual(build({ reflection: "Different." }, all), text);
    assert.notEqual(build({ now: new Date("2026-10-02T12:00:00Z") }, all), text);
  });

  it("catches edited name, reflection, ticks, count, URL and code", () => {
    assert.equal(verifySubmission(text.replace("Sam Student", "Pat Student")).ok, false);
    assert.equal(verifySubmission(text.replace("wedge was quiet", "wedge was loud")).ok, false);
    assert.equal(verifySubmission(text.replace(`https://example.edu`, "https://other.edu")).ok, false);
    assert.equal(verifySubmission(build({}, []).replace("[ ]", "[x]")).ok, false);
    assert.equal(verifySubmission(build({}, []).replace(/Completed: \d+/, "Completed: 3")).ok, false);
    assert.equal(verifySubmission(text.replace("4m 12s", "0m 12s")).ok, false);
    assert.equal(verifySubmission(text.replace("37 actions", "3 actions")).ok, false);
    assert.equal(verifySubmission(text.replace(/Total: .*/, "Total: 0m 00s, 0 actions")).ok, false);
    assert.equal(verifySubmission(text.replace(/Check code: ....-/, "Check code: 0000-")).ok, false);
  });

  it("rejects text that isn't a submission", () => {
    assert.equal(verifySubmission("hello").ok, false);
  });
});

describe("branch previews", () => {
  it("knows a preview from the live site by its path", () => {
    assert.equal(previewSlug("/mixer-lab/"), null);
    assert.equal(previewSlug("/mixer-lab/branch/feature-low-cut/"), "feature-low-cut");
    assert.equal(previewSlug("/mixer-lab/branch/feature-low-cut/index.html"), "feature-low-cut");
    assert.equal(liveUrl("https://a.github.io/mixer-lab/branch/skin-stagepas/#/free-play"), "https://a.github.io/mixer-lab/");
  });

  it("keeps a preview's progress apart from the live site's", () => {
    assert.equal(storageKey(PROGRESS_KEY, null), PROGRESS_KEY);
    const store = memory();
    new Progress(ids, store, ids, storageKey(PROGRESS_KEY, "skin-stagepas")).add(ids[0]);
    assert.equal(store.data[PROGRESS_KEY], undefined);
    assert.equal(new Progress(ids, store).has(ids[0]), false);
  });

  it("flags a submission made on a preview", () => {
    assert.equal(verifySubmission(build()).preview, undefined);
    assert.equal(verifySubmission(build({ url: "https://example.edu/mixer-lab/branch/claude-x/" })).preview, "claude-x");
  });
});
