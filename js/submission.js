// Builds the plain-text Canvas submission and its check code. Pure: no DOM.
//
// The check code is a keyed-looking checksum over the printed fields. It makes
// accidental edits and casual tampering obvious (`verifySubmission` recomputes
// it), but the "key" is public in this source, so it is an integrity check, not
// security. Progress lives in the student's browser and can't be proven.

import { numberedScenarios } from "./progress.js";
import { shortTitle } from "./scenarios.js";

export const HEADER = "MIXER LAB — MUS 248 SUBMISSION";
export const REFLECTION_PROMPT = "In 1–2 sentences, describe one signal-flow or mixing decision you made and why it solved the problem.";
export const MAX_NAME = 80;
export const MAX_REFLECTION = 600;
const SALT = "mixer-lab/mus248/v1";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// Rows for the dialog and the report: every numbered scenario and whether it is solved.
export function summarize(scenarios, isSolved) {
  const rows = numberedScenarios(scenarios).map((s) => ({ id: s.id, number: s.number, title: shortTitle(s), done: !!isSolved(s.id) }));
  return { rows, done: rows.filter((r) => r.done).length, total: rows.length };
}

export function validate({ name, reflection }) {
  const errors = {};
  if (!clean(name)) errors.name = "Enter your name.";
  if (!clean(reflection)) errors.reflection = "Write a sentence or two about a decision you made.";
  return errors;
}

const rowLine = (r) => `[${r.done ? "x" : " "}] ${r.number}. ${r.title}`;

// 53-bit string hash (cyrb53), shown as four groups of hex.
function hash53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().padStart(14, "0");
  return hex.replace(/^(.{4})(.{4})(.{4})(.*)$/, "$1-$2-$3-$4");
}

// What the code covers: the exact printed values, in a fixed order.
export function checkCode({ name, generated, rows, reflection, url }) {
  const body = [SALT, clean(name), generated, ...rows.map(rowLine), clean(reflection), url].join("\n");
  return hash53(body);
}

export function buildSubmission({ name, reflection, summary, url, now = new Date() }) {
  const generated = now.toISOString().replace(/\.\d+Z$/, "Z");
  const fields = { name: clean(name), reflection: clean(reflection), generated, rows: summary.rows, url };
  return [
    HEADER,
    `Name: ${fields.name}`,
    `Generated: ${generated}`,
    `Completed: ${summary.done} / ${summary.total}`,
    "",
    "Scenarios:",
    ...summary.rows.map(rowLine),
    "",
    `Reflection: ${fields.reflection}`,
    "",
    `Mixer Lab: ${url}`,
    `Check code: ${checkCode(fields)}`,
  ].join("\n");
}

// Re-reads a submission and recomputes its check code. For instructors and tests.
export function verifySubmission(text) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const get = (prefix) => lines.find((l) => l.startsWith(prefix))?.slice(prefix.length);
  const rows = lines
    .map((l) => /^\[( |x)\] (\d+)\. (.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ done: m[1] === "x", number: Number(m[2]), title: m[3] }));
  const name = get("Name: ");
  const generated = get("Generated: ");
  const reflection = get("Reflection: ");
  const url = get("Mixer Lab: ");
  const code = get("Check code: ");
  if ([name, generated, reflection, url, code].some((v) => v === undefined) || lines[0] !== HEADER) return { ok: false, reason: "not a Mixer Lab submission" };
  const done = rows.filter((r) => r.done).length;
  if (get("Completed: ") !== `${done} / ${rows.length}`) return { ok: false, reason: "completed count does not match the scenario list" };
  if (checkCode({ name, generated, rows, reflection, url }) !== code.trim()) return { ok: false, reason: "check code does not match; the text was edited" };
  return { ok: true, name, done, total: rows.length };
}
