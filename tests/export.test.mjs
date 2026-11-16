// The v2 Canvas export and its check code, and bug reports.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BugLog, issueUrl, reportText } from "../js/bugs.js";
import { ATTEMPT_SEC, FREE_PLAY_STAT_IDS, buildExport, exportSummary, verifyExport } from "../js/export.js";
import { count, verifySubmission } from "../js/submission.js";
import { ActiveTime, IDLE_MS } from "../js/progress.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

describe("Canvas export v2", () => {
  const solved = new Set(["find-amp", "b207mp3-doors"]);
  const stats = { "find-amp": { sec: 125, actions: 9 }, "mix8-ol": { sec: 30, actions: 4 }, "free-play/l20": { sec: 600, actions: 50 }, "free-play/mix8": { sec: 60, actions: 2 }, "free-play": { sec: 5, actions: 1 } };
  const summary = exportSummary({ isSolved: (id) => solved.has(id), statsFor: (id) => stats[id] || { sec: 0, actions: 0 } });
  const bugs = [{ at: "2026-10-05T14:03:00.000Z", scenario: "find-amp", title: "Where is the amplifier?", mixer: "Generic analog mixer", view: "Console", text: "The   knob\njumps", browser: "Safari 18", snapshot: "eJyrVg==" }];
  const text = buildExport({ name: "Sam", reflection: "I moved the send.", url: "https://adamborecki.github.io/mixer-lab/", summary, bugs, now: new Date("2026-10-05T15:00:00Z") });

  it("lists solved and worked-on scenarios, and bug reports, with no assignments section", () => {
    assert.doesNotMatch(text, /Assignment/);
    assert.match(text, /\[x\] Find the amp · Generic analog mixer · 2m 05s, 9 actions/);
    assert.match(text, /\[ \] OL light · Mackie Mix8 · 0m 30s, 4 actions/);
    assert.match(text, /Scenarios solved: 2 \(and 1 worked on, not solved yet\)/);
    assert.match(text, /What happened: The knob jumps/);
    assert.match(text, /Snapshot: eJyrVg==/);
  });

  it("puts the total active time first, then the time on each mixer, most first", () => {
    const lines = text.split("\n");
    assert.equal(lines[5], "Total active time: 13m 40s, 66 actions");
    assert.equal(lines[6], "Mixers used: 4");
    // b207mp3-doors is solved with no time recorded: the mixer still counts.
    assert.deepEqual(lines.slice(7, 11), ["  Zoom LiveTrak L-20 · 10m 00s, 50 actions", "  Generic analog mixer · 2m 05s, 9 actions", "  Mackie Mix8 · 1m 30s, 6 actions", "  Behringer EUROLIVE B207MP3 · 0m 00s, 0 actions"]);
  });

  it("lists Free play on each console, and time from before consoles were recorded (or from legacy/)", () => {
    assert.match(text, /Free play: 11m 05s, 53 actions\n  Zoom LiveTrak L-20 · 10m 00s, 50 actions\n  Mackie Mix8 · 1m 00s, 2 actions\n  console not recorded \(legacy\/ or before Oct 6\) · 0m 05s, 1 action$/m);
  });

  it("every scenario on every topic and mixer can appear in it", async () => {
    const { SCENARIOS, ALL_BOARD_SCENARIOS } = await import("../js/scenarios.js");
    const ids = [...SCENARIOS, ...ALL_BOARD_SCENARIOS].map((s) => s.id).filter((id) => id !== "free-play");
    const all = exportSummary({ isSolved: () => false, statsFor: () => ({ sec: 1, actions: 1 }) });
    const shown = new Set(all.topics.flatMap((g) => g.rows.map((r) => r.s.id)));
    assert.deepEqual(ids.filter((id) => !shown.has(id)), []);
    assert.equal(all.freeRows.length, FREE_PLAY_STAT_IDS.length);
  });

  it("verifies, survives Canvas spacing, and catches edits", () => {
    const r = verifyExport(text);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.name, "Sam");
    assert.equal(r.solved, 2);
    assert.equal(r.bugs, 1);
    assert.deepEqual(r.total, { sec: 820, actions: 66 });
    assert.equal(verifyExport(text.replace(/\n/g, "\n\n").replace(/^/gm, "  ")).ok, true);
    assert.equal(verifyExport(text.replace("Scenarios solved: 2", "Scenarios solved: 12")).ok, false);
  });

  it("reads the total from older exports that said \"1 actions\"", () => {
    const one = buildExport({ name: "Sam", reflection: "x", url: "https://x/", summary: exportSummary({ isSolved: () => false, statsFor: (id) => (id === "mix8-ol" ? { sec: 20, actions: 1 } : { sec: 0, actions: 0 }) }), now: new Date("2026-10-05T15:00:00Z") });
    assert.match(one, /^Total active time: 0m 20s, 1 action$/m);
    assert.deepEqual(verifyExport(one).total, { sec: 20, actions: 1 });
    assert.equal(verifyExport(text.replace("66 actions", "1 actions")).ok, false, "still edited");
  });

  it("is not mistaken for Assignment 1's format, and the other way round", () => {
    assert.equal(verifySubmission(text).ok, false);
    assert.equal(verifyExport("MIXER LAB — MUS 248 SUBMISSION\nName: x").reason, "not a Mixer Lab v2 export");
  });
});

describe("bug reports", () => {
  it("saves, lists and removes; drops an oversize snapshot", () => {
    const log = new BugLog(memory(), "k");
    log.add({ text: " hi ", snapshot: "x".repeat(20000) });
    assert.equal(log.list()[0].text, "hi");
    assert.equal(log.list()[0].snapshot, "");
    log.remove(0);
    assert.equal(log.list().length, 0);
  });
  it("copyable text and a GitHub issue link without the snapshot", () => {
    const r = { text: "Fader stuck", at: "2026-10-05T14:03:00Z", scenario: "find-amp", title: "Where is the amplifier?", mixer: "Generic analog mixer", snapshot: "eJyrVg==" };
    assert.match(reportText(r), /Snapshot: eJyrVg==/);
    const u = new URL(issueUrl(r));
    assert.equal(u.origin + u.pathname, "https://github.com/adamborecki/mixer-lab/issues/new");
    assert.match(u.searchParams.get("title"), /Fader stuck/);
    assert.doesNotMatch(u.searchParams.get("body"), /eJyrVg/);
  });
});

describe("export: counts, drive-by opens and repeated titles", () => {
  const solved = new Set(["find-amp"]);
  const stats = {
    "find-amp": { sec: 1, actions: 0 }, // solved: always listed
    "mix8-ol": { sec: ATTEMPT_SEC, actions: 0 }, // 15 s: worked on
    "b207mp3-doors": { sec: 0, actions: 1 }, // one action: worked on
    "missing-guitar": { sec: 2, actions: 0 }, // drive-by opens
    "gdig-lr": { sec: 1, actions: 0 },
    "x32-stagebox-link": { sec: 14, actions: 0 },
    "x32-vj-link": { sec: 40, actions: 3 },
  };
  const summary = exportSummary({ isSolved: (id) => solved.has(id), statsFor: (id) => stats[id] || { sec: 0, actions: 0 } });
  const text = buildExport({ name: "Sam", reflection: "x", url: "https://x/", summary, now: new Date("2026-10-05T15:00:00Z") });
  const rows = text.split("\n").filter((l) => /^\s*\[[ x]\]/.test(l));

  it("says 1 action, not 1 actions, anywhere", () => {
    assert.equal(count(1, "action"), "1 action");
    assert.equal(count(0, "action"), "0 actions");
    assert.equal(count(2, "bug report"), "2 bug reports");
    assert.doesNotMatch(text, /\b1 actions\b/);
    assert.match(text, /Doors music · Behringer EUROLIVE B207MP3 · 0m 00s, 1 action$/m);
  });

  it("lists scenarios worked on (an action or 15 s) and puts drive-by opens on one line", () => {
    assert.equal(rows.length, 4);
    assert.equal(summary.worked, 3);
    assert.match(text, /Scenarios solved: 1 \(and 3 worked on, not solved yet\)/);
    assert.match(text, /\[ \] OL light · Mackie Mix8 · 0m 15s, 0 actions/);
    const also = text.split("\n").filter((l) => l.includes("Also opened"));
    assert.deepEqual(also, ["  Also opened: Missing guitar (Plugging in) · Generic analog mixer; Missing guitar (The house mix) · Generic digital mixer; No AES50 link (Snakes and stage boxes) · Behringer X32"]);
    // A drive-by's time still counts toward the total and its mixer.
    assert.equal(summary.total.sec, 1 + 15 + 0 + 2 + 1 + 14 + 40);
    assert.ok(summary.mixers.some((m) => m.name === "Generic digital mixer" && m.sec === 1));
  });

  it("names the topic when a short title is on more than one", () => {
    assert.ok(rows.includes("    [ ] No AES50 link (Vocal Jazz in Salmon) · Behringer X32 · 0m 40s, 3 actions"));
    assert.ok(rows.includes("    [x] Find the amp · Generic analog mixer · 0m 01s, 0 actions"), "a title on one topic only stays as it was");
  });

  it("leaves the Also opened line out when there are none", () => {
    const none = buildExport({ name: "Sam", reflection: "x", url: "https://x/", summary: exportSummary({ isSolved: () => false, statsFor: () => ({ sec: 0, actions: 0 }) }) });
    assert.doesNotMatch(none, /Also opened/);
  });
});

describe("active time (idle timeout)", () => {
  const run = () => {
    const got = {};
    const t = new ActiveTime((id, { sec }) => (got[id] = (got[id] || 0) + sec));
    return { t, got };
  };
  const secs = (t, id, from, n) => {
    for (let i = 1; i <= n; i++) t.tick(id, (from + i) * 1000);
  };

  it("counts seconds between interactions, per scenario", () => {
    const { t, got } = run();
    t.touch(0);
    secs(t, "a", 0, 30);
    assert.deepEqual(got, {}, "held until the next interaction");
    t.touch(30000);
    secs(t, "b", 30, 10);
    t.touch(40000);
    assert.deepEqual(got, { a: 30, b: 10 });
  });

  it("drops a stretch of a minute or more without interaction, and starts again on the next action", () => {
    const { t, got } = run();
    t.touch(0);
    secs(t, "a", 0, 88); // opened, then walked away
    t.touch(88000);
    assert.deepEqual(got, {});
    secs(t, "a", 88, 5);
    t.touch(93000);
    assert.deepEqual(got, { a: 5 });
    assert.equal(IDLE_MS, 60000);
  });

  it("nothing counts before the first interaction; leaving soon after one keeps the time", () => {
    const { t, got } = run();
    secs(t, "a", 0, 20);
    t.touch(20000);
    secs(t, "a", 20, 12);
    t.settle(32000); // tab hidden
    assert.deepEqual(got, { a: 12 });
    secs(t, "a", 32, 3);
    t.settle(200000); // came back much later
    assert.deepEqual(got, { a: 12 });
  });
});
