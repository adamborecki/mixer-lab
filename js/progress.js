// Which numbered scenarios the student has solved. Pure logic plus a tiny
// localStorage wrapper: progress survives an accidental refresh, but only in
// this browser. Only scenario ids are stored; never names or free text.

import { storageKey } from "./deploy-context.js";

export const PROGRESS_KEY = "mixer-lab-progress-v1";

// Scenarios that count toward the assignment: numbered ones, in order. Free
// play (number 0) is a sandbox and is excluded. New scenarios appear here
// automatically because this reads SCENARIOS rather than naming any of them.
export function numberedScenarios(scenarios) {
  return scenarios.filter((s) => s.number > 0).sort((a, b) => a.number - b.number);
}

export class Progress {
  // `validIds`: ids that may be marked solved. `statIds`: ids that get time and
  // action counts (also Free play). Other ids in storage (another version's, or
  // legacy/'s) are kept as they are but never shown or changed here.
  //
  // Several tabs share one key (legacy/ too), so a save never writes this tab's
  // copy over theirs: it re-reads what's stored and adds only what this tab did
  // since its last save (`pending`). (legacy/'s own Progress still writes its whole copy.)
  constructor(validIds, storage = defaultStorage(), statIds = validIds, key = storageKey(PROGRESS_KEY)) {
    this.key = key;
    this.valid = new Set(validIds);
    this.statValid = new Set(statIds);
    this.storage = storage;
    this.load();
  }

  // What's stored, normalized. Unreadable or unavailable storage reads as empty.
  read() {
    try {
      const data = JSON.parse(this.storage?.getItem(this.key) || "null");
      const stats = {};
      for (const [id, v] of Object.entries(data?.stats || {})) stats[id] = { sec: Math.max(0, Math.floor(Number(v?.sec)) || 0), actions: Math.max(0, Math.floor(Number(v?.actions)) || 0) };
      return { ...data, solved: Array.isArray(data?.solved) ? data.solved.filter((id) => typeof id === "string") : [], stats };
    } catch (e) {
      return { solved: [], stats: {} };
    }
  }

  load() {
    this.base = this.read();
    this.solved = new Set(this.base.solved.filter((id) => this.valid.has(id)));
    this.pending = { solved: new Set(), stats: {} };
  }

  // Stored data plus this tab's pending work, written back. On failure (private
  // mode etc.) the work stays pending, so it still shows until the page closes.
  save() {
    const data = this.read();
    data.solved = [...new Set([...data.solved, ...this.pending.solved])];
    for (const [id, d] of Object.entries(this.pending.stats)) {
      const s = (data.stats[id] ||= { sec: 0, actions: 0 });
      s.sec += d.sec;
      s.actions += d.actions;
    }
    try {
      if (!this.storage) return;
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch (e) {
      return;
    }
    this.base = data;
    for (const id of data.solved) if (this.valid.has(id)) this.solved.add(id);
    this.pending = { solved: new Set(), stats: {} };
  }

  get dirty() {
    return this.pending.solved.size > 0 || Object.keys(this.pending.stats).length > 0;
  }

  // Active seconds and interaction counts per scenario. Saved by flush() (called
  // periodically and when the page is hidden) rather than on every click.
  record(id, { sec = 0, actions = 0 }) {
    if (!this.statValid.has(id)) return;
    const s = (this.pending.stats[id] ||= { sec: 0, actions: 0 });
    s.sec += sec;
    s.actions += actions;
  }

  statsFor(id) {
    if (!this.statValid.has(id)) return { sec: 0, actions: 0 };
    const b = this.base.stats[id] || { sec: 0, actions: 0 };
    const p = this.pending.stats[id] || { sec: 0, actions: 0 };
    return { sec: b.sec + p.sec, actions: b.actions + p.actions };
  }

  flush() {
    if (this.dirty) this.save();
  }

  has(id) {
    return this.solved.has(id);
  }

  // Returns true if this is a newly solved scenario.
  add(id) {
    if (!this.valid.has(id) || this.solved.has(id)) return false;
    this.solved.add(id);
    this.pending.solved.add(id);
    this.save();
    return true;
  }

  // Clears this key for every tab (another open tab keeps only what it does next).
  clear() {
    try {
      this.storage?.removeItem(this.key);
    } catch (e) {
      /* nothing to do */
    }
    this.base = { solved: [], stats: {} };
    this.solved = new Set();
    this.pending = { solved: new Set(), stats: {} };
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}
