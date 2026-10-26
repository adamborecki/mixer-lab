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
      return normalizeProgress(JSON.parse(this.storage?.getItem(this.key) || "null"));
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

  // Everything stored plus this tab's unsaved work: what a progress file holds.
  snapshot() {
    this.flush();
    if (!this.dirty) return this.read();
    // Storage failed: what this tab last read, plus its unsaved work.
    const stats = {};
    for (const id of new Set([...Object.keys(this.base.stats), ...Object.keys(this.pending.stats)])) {
      const b = this.base.stats[id] || { sec: 0, actions: 0 };
      const p = this.pending.stats[id] || { sec: 0, actions: 0 };
      stats[id] = { sec: b.sec + p.sec, actions: b.actions + p.actions };
    }
    return { ...this.base, solved: [...new Set([...this.base.solved, ...this.pending.solved])], stats };
  }

  // Merges a progress file's data into what's stored (mergeProgress: nothing is
  // lost on either side). Returns how many more scenarios are solved here, or
  // null if it couldn't be saved (then nothing changed).
  merge(incoming) {
    this.flush();
    if (this.dirty || !this.storage) return null;
    const before = this.solved.size;
    try {
      this.storage.setItem(this.key, JSON.stringify(mergeProgress(this.read(), incoming)));
    } catch (e) {
      return null;
    }
    this.load();
    return this.solved.size - before;
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

// Stored or loaded progress, cleaned up: solved ids are strings, times and
// actions whole and never negative. Anything else in it is kept as it is.
export function normalizeProgress(data) {
  const stats = {};
  for (const [id, v] of Object.entries(data?.stats || {})) stats[id] = { sec: Math.max(0, Math.floor(Number(v?.sec)) || 0), actions: Math.max(0, Math.floor(Number(v?.actions)) || 0) };
  return { ...data, solved: Array.isArray(data?.solved) ? data.solved.filter((id) => typeof id === "string") : [], stats };
}

// Two copies of a student's progress (two browsers, or this one and a file)
// as one: every scenario solved in either, and for each scenario the larger
// time and the larger action count. Never removes anything, and loading the
// same file twice changes nothing. Pure.
export function mergeProgress(a, b) {
  const x = normalizeProgress(a);
  const y = normalizeProgress(b);
  const stats = { ...x.stats };
  for (const [id, v] of Object.entries(y.stats)) {
    const s = stats[id] || { sec: 0, actions: 0 };
    stats[id] = { sec: Math.max(s.sec, v.sec), actions: Math.max(s.actions, v.actions) };
  }
  return { ...x, solved: [...new Set([...x.solved, ...y.solved])], stats };
}

// ---------- progress files: a backup to carry to another browser or device ----------

export const BACKUP_KIND = "mixer-lab-progress";
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 1_000_000;

// The file's text. `preview` is the branch preview it came from (null on the live site).
export function backupFile(progress, { now = new Date(), preview = null } = {}) {
  const { solved, stats } = normalizeProgress(progress);
  return JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, saved: now.toISOString(), preview, progress: { solved, stats } }, null, 1);
}

export const backupFileName = ({ now = new Date(), preview = null } = {}) => `mixer-lab-progress${preview ? `-${preview}` : ""}-${now.toISOString().slice(0, 10)}.json`;

// Reads a progress file. { ok: true, progress, saved, preview } or { ok: false, reason }
// with a reason to show the student.
export function parseBackup(text) {
  const bad = (reason) => ({ ok: false, reason });
  if (typeof text !== "string" || !text.trim()) return bad("That file is empty.");
  if (text.length > MAX_BACKUP_BYTES) return bad("That file is too big to be a Mixer Lab progress file.");
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return bad("That isn't a Mixer Lab progress file. Choose the .json file you saved with “Save progress file”.");
  }
  if (data?.kind !== BACKUP_KIND) return bad("That isn't a Mixer Lab progress file. Choose the .json file you saved with “Save progress file”.");
  if (!(data.version >= 1)) return bad("That progress file is damaged (no version).");
  if (data.version > BACKUP_VERSION) return bad("That progress file is from a newer Mixer Lab. Reload this page and try again.");
  const p = data.progress;
  const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
  if (!isObj(p) || !Array.isArray(p.solved) || !isObj(p.stats)) return bad("That progress file is damaged: its scenario list is missing.");
  if (p.solved.some((id) => typeof id !== "string") || Object.values(p.stats).some((v) => !isObj(v) || ![v.sec, v.actions].every((n) => Number.isFinite(n) && n >= 0)))
    return bad("That progress file is damaged: some of its entries can't be read.");
  const { solved, stats } = normalizeProgress(p);
  return { ok: true, progress: { solved, stats }, saved: typeof data.saved === "string" ? data.saved : null, preview: typeof data.preview === "string" ? data.preview : null };
}
