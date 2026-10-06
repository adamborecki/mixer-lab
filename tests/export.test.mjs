// The v2 Canvas export and its check code, and bug reports.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BugLog, issueUrl, reportText } from "../js/bugs.js";
import { buildExport, exportSummary, verifyExport } from "../js/export.js";
import { verifySubmission } from "../js/submission.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

describe("Canvas export v2", () => {
  const solved = new Set(["find-amp", "b207mp3-doors"]);
  const summary = exportSummary({ isSolved: (id) => solved.has(id), statsFor: (id) => (id === "find-amp" ? { sec: 125, actions: 9 } : id === "mix8-ol" ? { sec: 30, actions: 4 } : { sec: 0, actions: 0 }) });
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

  it("verifies, survives Canvas spacing, and catches edits", () => {
    const r = verifyExport(text);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.name, "Sam");
    assert.equal(r.solved, 2);
    assert.equal(r.bugs, 1);
    assert.equal(verifyExport(text.replace(/\n/g, "\n\n").replace(/^/gm, "  ")).ok, true);
    assert.equal(verifyExport(text.replace("Scenarios solved: 2", "Scenarios solved: 12")).ok, false);
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
