// The Canvas assignments, by week of the live-sound unit. Each asks for a
// number of solved scenarios in each of its topics (js/themes.js); any mixer
// counts. Assignment 1 (the ten scenarios on the generic mixer) is frozen at
// legacy/ for late submissions (the `legacy` branch, docs/BRANCH_PREVIEWS.md).
// Pure data and functions, tested in tests/assignments.test.mjs.
//
// To change what's required: edit `topics` ([topic id, how many]).

import { THEMES_BY_ID, themeScenarios } from "./themes.js";
import { liveUrl, previewSlug } from "./deploy-context.js";

export const LEGACY_URL = "legacy/";
// The link to Assignment 1's frozen copy: always the live site's legacy/, even from a branch preview.
export const legacyHref = (href = globalThis.location?.href || "") => (previewSlug(new URL(href, "https://x/").pathname) ? liveUrl(href) : "") + LEGACY_URL;
// The one the start screen and the top bar's count point at.
export const CURRENT_ASSIGNMENT = "a2";

export const ASSIGNMENTS = [
  { id: "a1", number: 1, title: "The ten scenarios", legacy: true, note: "Due October 4. Late? Finish it in the original version: its own link, with your saved progress." },
  {
    id: "a2",
    number: 2,
    title: "The system and the mixes",
    weeks: "Weeks 1–2",
    about: "Inputs, outputs, signal levels, amplification and speakers; the main mix, aux sends and monitor mixes.",
    topics: [["system", 3], ["patch", 3], ["phantom", 2], ["main", 3], ["monitors", 4]],
  },
  {
    id: "a3",
    number: 3,
    title: "Patching, gain staging and line check",
    weeks: "Week 3",
    about: "Getting every input healthy and checking it on its own before the audience hears it; snakes and stage boxes.",
    topics: [["gain", 4], ["solo", 3], ["stagebox", 2], ["filters", 2]],
  },
  {
    id: "a4",
    number: 4,
    title: "Troubleshooting, recording and handoff",
    weeks: "Week 4",
    about: "Recording feeds and camera levels, what comes out of which output, and resetting or handing over a desk with scenes.",
    topics: [["recording", 3], ["outputs", 3], ["digital", 3]],
  },
  {
    id: "a5",
    number: 5,
    title: "Shaping the sound",
    optional: true,
    about: "Optional: EQ, compression, effects and groups.",
    topics: [["eq", 3], ["dynamics", 2], ["effects", 3], ["groups", 2]],
  },
];

export const ASSIGNMENTS_BY_ID = Object.fromEntries(ASSIGNMENTS.map((a) => [a.id, a]));
export const label = (a) => `Assignment ${a.number}${a.optional ? " (optional)" : ""}`;

// How far along an assignment is: per topic, solved (capped at what's needed).
export function assignmentProgress(a, isSolved) {
  const topics = (a.topics || []).map(([id, need]) => {
    const t = THEMES_BY_ID[id];
    const solved = themeScenarios(t).filter((s) => isSolved(s.id)).length;
    return { id, title: t.title, question: t.question, need, solved, done: Math.min(solved, need) };
  });
  const need = topics.reduce((n, t) => n + t.need, 0);
  const done = topics.reduce((n, t) => n + t.done, 0);
  return { topics, need, done, complete: need > 0 && done >= need };
}

// The assignment a topic belongs to (null if none).
export function assignmentOfTopic(themeId) {
  return ASSIGNMENTS.find((a) => (a.topics || []).some(([id]) => id === themeId)) || null;
}

// The topic to work on next: the first one still short of its count.
export function nextTopic(a, isSolved) {
  return assignmentProgress(a, isSolved).topics.find((t) => t.done < t.need) || null;
}
