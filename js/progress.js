// Which numbered scenarios the student has solved. Pure logic plus a tiny
// localStorage wrapper: progress survives an accidental refresh, but only in
// this browser. Only scenario ids are stored; never names or free text.

export const PROGRESS_KEY = "mixer-lab-progress-v1";

// Scenarios that count toward the assignment: numbered ones, in order. Free
// play (number 0) is a sandbox and is excluded. New scenarios appear here
// automatically because this reads SCENARIOS rather than naming any of them.
export function numberedScenarios(scenarios) {
  return scenarios.filter((s) => s.number > 0).sort((a, b) => a.number - b.number);
}

export class Progress {
  // `validIds`: ids that may be remembered (stale ids from old versions are dropped).
  constructor(validIds, storage = defaultStorage()) {
    this.valid = new Set(validIds);
    this.storage = storage;
    this.solved = new Set();
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(this.storage?.getItem(PROGRESS_KEY) || "null");
      if (data && Array.isArray(data.solved)) for (const id of data.solved) if (this.valid.has(id)) this.solved.add(id);
    } catch (e) {
      /* unreadable or unavailable storage: start fresh */
    }
  }

  save() {
    try {
      this.storage?.setItem(PROGRESS_KEY, JSON.stringify({ solved: [...this.solved] }));
    } catch (e) {
      /* private mode etc.: progress just lasts until reload */
    }
  }

  has(id) {
    return this.solved.has(id);
  }

  // Returns true if this is a newly solved scenario.
  add(id) {
    if (!this.valid.has(id) || this.solved.has(id)) return false;
    this.solved.add(id);
    this.save();
    return true;
  }

  clear() {
    this.solved.clear();
    try {
      this.storage?.removeItem(PROGRESS_KEY);
    } catch (e) {
      /* nothing to do */
    }
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}
