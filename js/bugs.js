// Bug and feedback reports from students. Saved in this browser until they go
// into the Canvas export (js/export.js), with what the student was doing.
// Pure apart from the storage passed in; tested in tests/export.test.mjs.

import { storageKey } from "./deploy-context.js";

export const BUGS_KEY = "mixer-lab-bugs-v1";
export const MAX_TEXT = 1000;
export const MAX_SNAPSHOT = 12000; // characters of compressed state; bigger ones are left out
export const ISSUES_URL = "https://github.com/adamborecki/mixer-lab/issues/new";

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export class BugLog {
  constructor(storage = defaultStorage(), key = storageKey(BUGS_KEY)) {
    this.storage = storage;
    this.key = key;
    this.items = [];
    try {
      const data = JSON.parse(this.storage?.getItem(key) || "[]");
      if (Array.isArray(data)) this.items = data.filter((b) => b && typeof b.text === "string");
    } catch (e) {
      /* unreadable: start empty */
    }
  }

  list() {
    return [...this.items];
  }

  // `report`: { text, at, scenario, title, mixer, view, listen, snapshot }
  add(report) {
    const r = { ...report, text: String(report.text || "").trim().slice(0, MAX_TEXT) };
    if (r.snapshot && r.snapshot.length > MAX_SNAPSHOT) r.snapshot = "";
    this.items.push(r);
    this.save();
    return r;
  }

  remove(i) {
    this.items.splice(i, 1);
    this.save();
  }

  save() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.items));
    } catch (e) {
      /* storage full or unavailable: reports last until reload */
    }
  }
}

// The context line every report carries (export, copied text, GitHub issue).
export function contextLine(r) {
  return [r.at?.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "Z"), r.title ? `${r.title} (${r.scenario})` : r.scenario, r.mixer, r.view && `${r.view} view`, r.listen && `listening: ${r.listen}`].filter(Boolean).join(" · ");
}

// A report as plain text, for "Copy report".
export function reportText(r) {
  return [`Mixer Lab bug report`, contextLine(r), `What happened: ${oneLine(r.text)}`, r.browser ? `Browser: ${r.browser}` : "", r.url ? `Page: ${r.url}` : "", r.snapshot ? `Snapshot: ${r.snapshot}` : ""].filter(Boolean).join("\n");
}

// A prefilled GitHub issue (no snapshot: too long for a link). Nothing personal is in it.
export function issueUrl(r) {
  const title = `Bug: ${oneLine(r.text).slice(0, 70) || "something's wrong"}`;
  const body = [`**What happened:** ${oneLine(r.text)}`, "", `**Where:** ${contextLine(r)}`, r.browser ? `**Browser:** ${r.browser}` : "", r.url ? `**Page:** ${r.url}` : "", "", "_Sent from Mixer Lab's bug button._"].filter((l) => l !== "").join("\n");
  return `${ISSUES_URL}?${new URLSearchParams({ title, body, labels: "from-students" })}`;
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}
