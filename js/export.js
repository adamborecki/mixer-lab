// The Canvas export (v2): everything a student has done in Mixer Lab, ever,
// as plain text to paste into a Canvas assignment. The total active time and
// actions, the time on each mixer, every solved scenario (and ones worked on but
// not yet solved) on any topic or mixer with time and actions, one line naming
// the ones only opened, Free play on each console, bug reports, a reflection,
// and a check code. Pure: no DOM.
// Assignment 1's old format is js/submission.js.
//
// The check code is a checksum over every line (blank lines and spacing
// ignored, so Canvas's paste can't break it). The key is public, so it shows
// accidental edits and casual tampering, not proof: progress lives in the
// student's browser.

import { previewSlug } from "./deploy-context.js";
import { contextLine } from "./bugs.js";
import { shortTitle } from "./scenarios.js";
import { SKINS } from "./mixer-models.js";
import { OPEN_GIGS, THEMES, consoleOf, skinOf, themeScenarios } from "./themes.js";
import { count, duration, hash53 } from "./submission.js";

export const HEADER = "MIXER LAB — MUS 248 CANVAS EXPORT v2";
const SALT = "mixer-lab/mus248/v2";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const stat = (o) => `${duration(o.sec)}, ${count(o.actions, "action")}`;
const consoleName = (s) => SKINS[skinOf(consoleOf(s))]?.name || consoleOf(s);
const add = (a, b) => ({ sec: a.sec + b.sec, actions: a.actions + b.actions });
const ZERO = { sec: 0, actions: 0 };

// Free play's time and actions are kept per console: "free-play/<skin id>".
// Plain "free-play" holds what was recorded before that (Oct 6), and what
// legacy/ (Assignment 1's frozen copy, Mixer A or B) still records there.
export const freePlayStatId = (skinId) => `free-play/${skinId}`;
export const FREE_PLAY_STAT_IDS = ["free-play", ...Object.keys(SKINS).map(freePlayStatId)];
const EARLIER = "console not recorded (legacy/ or before Oct 6)";

// Worked on: at least one action or ATTEMPT_SEC seconds. Less is a drive-by
// open: its time still counts, but it's only named on the "Also opened" line.
export const ATTEMPT_SEC = 15;
export const attempted = (r) => r.actions > 0 || r.sec >= ATTEMPT_SEC;

// A scenario's name in the export. Short titles repeat ("Missing guitar" is on
// Plugging in and The house mix): one that's on more than one topic says which.
const TOPICS = [...THEMES, ...OPEN_GIGS];
const topicsByTitle = new Map();
for (const t of TOPICS) for (const s of themeScenarios(t)) topicsByTitle.set(shortTitle(s), (topicsByTitle.get(shortTitle(s)) || new Set()).add(t));
export const exportTitle = (s, t) => (topicsByTitle.get(shortTitle(s))?.size > 1 ? `${shortTitle(s)} (${t.title})` : shortTitle(s));

// What the dialog shows and the text prints.
export function exportSummary({ isSolved, statsFor }) {
  const all = TOPICS.flatMap((t) => themeScenarios(t).map((s) => ({ s, t, solved: isSolved(s.id), ...statsFor(s.id) }))).filter((r) => r.solved || r.sec > 0 || r.actions > 0);
  const topics = TOPICS.map((t) => ({ t, rows: all.filter((r) => r.t === t && (r.solved || attempted(r))) })).filter((g) => g.rows.length);
  const opened = all.filter((r) => !r.solved && !attempted(r));
  const freeRows = FREE_PLAY_STAT_IDS.map((id) => ({ id, name: id === "free-play" ? EARLIER : SKINS[id.slice(10)].name, ...statsFor(id) })).filter((r) => r.sec > 0 || r.actions > 0)
    .sort((a, b) => (a.id === "free-play") - (b.id === "free-play") || b.sec - a.sec || b.actions - a.actions);
  const free = freeRows.reduce(add, ZERO);
  // Time on each mixer, scenarios and Free play together, most first.
  const byMixer = new Map();
  const onMixer = (name, r) => byMixer.set(name, add(byMixer.get(name) || ZERO, r));
  for (const r of all) onMixer(consoleName(r.s), r);
  for (const r of freeRows) if (r.id !== "free-play") onMixer(r.name, r);
  const mixers = [...byMixer].map(([name, st]) => ({ name, ...st })).sort((a, b) => b.sec - a.sec || b.actions - a.actions);
  return {
    topics,
    solved: all.filter((r) => r.solved).length,
    worked: all.filter((r) => !r.solved && attempted(r)).length,
    opened,
    free,
    freeRows,
    mixers,
    total: add(all.reduce(add, ZERO), free),
  };
}

export function buildExport({ name, reflection, url, summary, bugs = [], now = new Date() }) {
  const generated = now.toISOString().replace(/\.\d+Z$/, "Z");
  const lines = [HEADER, `Name: ${clean(name)}`, `Generated: ${generated}`, `Mixer Lab: ${url}`];
  lines.push("", `Total active time: ${stat(summary.total)}`, `Mixers used: ${summary.mixers.length}`);
  for (const m of summary.mixers) lines.push(`  ${m.name} · ${stat(m)}`);
  lines.push("", `Scenarios solved: ${summary.solved}${summary.worked ? ` (and ${summary.worked} worked on, not solved yet)` : ""}`);
  for (const g of summary.topics) {
    lines.push(`  ${g.t.title}`);
    for (const r of g.rows) lines.push(`    [${r.solved ? "x" : " "}] ${exportTitle(r.s, r.t)} · ${consoleName(r.s)} · ${stat(r)}`);
  }
  if (summary.opened.length) lines.push(`  Also opened: ${summary.opened.map((r) => `${exportTitle(r.s, r.t)} · ${consoleName(r.s)}`).join("; ")}`);
  lines.push(`Free play: ${stat(summary.free)}`);
  for (const r of summary.freeRows) lines.push(`  ${r.name} · ${stat(r)}`);
  lines.push("");
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
  const bugs = Number(get("Bug reports: ") || 0);
  // "12m 05s, 210 actions" or "…, 1 action" (exports from before this line existed have "Total: " at the end).
  const t = /^(\d+)m (\d+)s, (\d+) actions?\b/.exec(get("Total active time: ") || get("Total: ") || "");
  const total = t ? { sec: Number(t[1]) * 60 + Number(t[2]), actions: Number(t[3]) } : undefined;
  return { ok: true, name: get("Name: "), ...(total && { total }), solved: Number(/^(\d+)/.exec(get("Scenarios solved: ") || "0")[1]), bugs, ...(preview && { preview }) };
}
