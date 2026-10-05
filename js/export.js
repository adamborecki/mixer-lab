// The Canvas export (v2): everything a student has done in Mixer Lab, ever,
// as plain text to paste into a Canvas assignment. Progress toward each
// assignment's topics, every solved scenario (and ones worked on but not yet
// solved) with time and actions, Free play, bug reports, a reflection, and a
// check code. Pure: no DOM. Assignment 1's old format is js/submission.js.
//
// The check code is a checksum over every line (blank lines and spacing
// ignored, so Canvas's paste can't break it). The key is public, so it shows
// accidental edits and casual tampering, not proof: progress lives in the
// student's browser.

import { previewSlug } from "./deploy-context.js";
import { ASSIGNMENTS, assignmentProgress, label } from "./assignments.js";
import { contextLine } from "./bugs.js";
import { shortTitle } from "./scenarios.js";
import { SKINS } from "./mixer-models.js";
import { THEMES, consoleOf, skinOf, themeScenarios } from "./themes.js";
import { duration, hash53 } from "./submission.js";

export const HEADER = "MIXER LAB — MUS 248 CANVAS EXPORT v2";
const SALT = "mixer-lab/mus248/v2";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const stat = (o) => `${duration(o.sec)}, ${o.actions} actions`;
const consoleName = (s) => SKINS[skinOf(consoleOf(s))]?.name || consoleOf(s);

// What the dialog shows and the text prints.
export function exportSummary({ isSolved, statsFor }) {
  const assignments = ASSIGNMENTS.filter((a) => !a.legacy).map((a) => ({ a, ...assignmentProgress(a, isSolved) }));
  const topics = THEMES.map((t) => ({
    t,
    rows: themeScenarios(t)
      .map((s) => ({ s, solved: isSolved(s.id), ...statsFor(s.id) }))
      .filter((r) => r.solved || r.sec > 0 || r.actions > 0),
  })).filter((g) => g.rows.length);
  const all = topics.flatMap((g) => g.rows);
  const free = statsFor("free-play");
  return {
    assignments,
    topics,
    solved: all.filter((r) => r.solved).length,
    worked: all.filter((r) => !r.solved).length,
    free,
    total: { sec: all.reduce((n, r) => n + r.sec, 0) + free.sec, actions: all.reduce((n, r) => n + r.actions, 0) + free.actions },
  };
}

export function buildExport({ name, reflection, url, summary, bugs = [], now = new Date() }) {
  const generated = now.toISOString().replace(/\.\d+Z$/, "Z");
  const lines = [HEADER, `Name: ${clean(name)}`, `Generated: ${generated}`, `Mixer Lab: ${url}`, "", "Assignments:"];
  for (const p of summary.assignments) {
    lines.push(`${p.complete ? "[x]" : "[ ]"} ${label(p.a)} · ${p.a.title}: ${p.done} / ${p.need}`);
    lines.push(`    ${p.topics.map((t) => `${t.title} ${t.done}/${t.need}`).join(" · ")}`);
  }
  lines.push("", `Scenarios solved: ${summary.solved}${summary.worked ? ` (and ${summary.worked} worked on, not solved yet)` : ""}`);
  for (const g of summary.topics) {
    lines.push(`  ${g.t.title}`);
    for (const r of g.rows) lines.push(`    [${r.solved ? "x" : " "}] ${shortTitle(r.s)} · ${consoleName(r.s)} · ${stat(r)}`);
  }
  lines.push(`Free play: ${stat(summary.free)}`, `Total: ${stat(summary.total)}`, "");
  lines.push(`Bug reports: ${bugs.length}`);
  bugs.forEach((b, i) => {
    lines.push(`  #${i + 1} ${contextLine(b)}`, `     What happened: ${clean(b.text)}`);
    if (b.browser) lines.push(`     Browser: ${b.browser}`);
    if (b.snapshot) lines.push(`     Snapshot: ${b.snapshot}`);
  });
  lines.push("", `Reflection: ${clean(reflection)}`);
  lines.push(`Check code: ${checkCode(lines)}`);
  return lines.join("\n");
}

// Every non-blank line, trimmed, except the check code itself.
const normalized = (lines) => lines.map((l) => l.trim().replace(/\s+/g, " ")).filter((l) => l && !l.startsWith("Check code:"));
export const checkCode = (lines) => hash53([SALT, ...normalized(lines)].join("\n"));

export function verifyExport(text) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const first = lines.find((l) => l.trim());
  if (first?.trim() !== HEADER) return { ok: false, reason: "not a Mixer Lab v2 export" };
  const get = (p) => lines.map((l) => l.trim()).find((l) => l.startsWith(p))?.slice(p.length);
  const code = get("Check code: ");
  if (!code) return { ok: false, reason: "no check code" };
  if (checkCode(lines) !== code.trim()) return { ok: false, reason: "check code does not match; the text was edited" };
  const url = get("Mixer Lab: ") || "";
  const preview = previewSlug(new URL(url.trim(), "https://x/").pathname);
  const assignments = lines.map((l) => /^\[(x| )\] (Assignment \d+[^·]*)· .*: (\d+) \/ (\d+)$/.exec(l.trim())).filter(Boolean).map((m) => ({ label: m[2].trim(), done: Number(m[3]), need: Number(m[4]), complete: m[1] === "x" }));
  const bugs = Number(get("Bug reports: ") || 0);
  return { ok: true, name: get("Name: "), assignments, solved: Number(/^(\d+)/.exec(get("Scenarios solved: ") || "0")[1]), bugs, ...(preview && { preview }) };
}
